// ============================================================
//   CHECKOUT SERVICE — do carrinho à cobrança
//   Não conhece Request nem Response.
//
//   1. Os pedidos do carrinho nascem juntos numa transação, um por
//      fábrica com os itens dela (FEAT-04), com o
//      preço do servidor (SEC-05) e um billingId provisório.
//   2. A chamada ao gateway acontece fora de qualquer transação.
//   3. O resultado do gateway decide o destino dos pedidos
//      (concluirTentativaDeCheckout), sempre só os desta tentativa:
//
//      criada    vínculo tudo ou nada; falha de gravação vai para
//                conciliação, nunca para o desfazimento
//      recusada  os pedidos da tentativa são desfeitos
//      incerta   a cobrança pode existir: os pedidos ficam pendentes
//
//   Com token real, nenhuma falha cai no simulador (SEC-06, §22).
// ============================================================

import type { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { getAbacateToken, isSimulatedPaymentGateway } from "../config/env.js";
import {
  PAGAMENTO_INDISPONIVEL,
  PAGAMENTO_NAO_CONFIRMADO,
  gatewayDePagamentoConfigurado,
  simuladorDePagamentoAtivo,
} from "../config/pagamento.js";
import { agruparPorFabrica } from "../domain/pedidosPorFabrica.js";
import type { CheckoutCartDTO, CheckoutResultDTO } from "../dtos/order/order.dto.js";
import { ConflictProblem, ServiceUnavailableProblem } from "../errors/problem.js";
import { gerarBillingId } from "../utils/billingId.js";
import logger from "../utils/logger.js";
import { concluirTentativaDeCheckout } from "./checkoutAttempt.js";
import { solicitarCobranca } from "./gatewayDePagamento.js";
import { fabricaDoPedido, inserirPedido, type Cliente } from "./orderService.js";

export class CheckoutService {
  static async finalizarCarrinho(opcoes: {
    cliente: Cliente;
    cartItems: CheckoutCartDTO["cartItems"];
    /** Onde o navegador abriu a loja e onde a API responde, para os links. */
    origens: { frontend: string; backend: string };
    traceId?: string;
    /**
     * CART-01: roda na transação que cria os pedidos, com o id do pedido de
     * cada item, na ordem de cartItems (itens da mesma fábrica repetem o
     * id). Um erro aqui desfaz os pedidos antes do gateway.
     */
    aoCriarPedidos?: (tx: Prisma.TransactionClient, pedidoDeCadaItem: number[]) => Promise<void>;
  }): Promise<CheckoutResultDTO> {
    const { cliente, cartItems, origens, traceId, aoCriarPedidos } = opcoes;

    // SEC-06: em produção não há simulador. Sem gateway configurado não há
    // onde pagar, então a requisição falha antes de criar qualquer pedido.
    if (!simuladorDePagamentoAtivo && !gatewayDePagamentoConfigurado()) {
      throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
    }

    const consolidatedBillingId = gerarBillingId("sim");

    const createdOrders = await prisma.$transaction(async (tx) => {
      // FEAT-04 (ADR-0004): um pedido por fábrica, com os itens dela. A
      // fábrica de cada item é resolvida antes de agrupar: um item sem fábrica
      // vai para a padrão e se junta aos que a indicaram pelo publicId.
      const resolvidas = new Map<string | undefined, Awaited<ReturnType<typeof fabricaDoPedido>>>();
      const fabricas = [];
      for (const item of cartItems) {
        if (!resolvidas.has(item.factoryPublicId)) {
          resolvidas.set(item.factoryPublicId, await fabricaDoPedido(tx, item.factoryPublicId));
        }
        fabricas.push(resolvidas.get(item.factoryPublicId) ?? null);
      }

      const criados = [];
      const pedidoDeCadaItem: number[] = [];
      for (const indices of agruparPorFabrica(fabricas.map(fabrica => fabrica?.id ?? null))) {
        const [primeiro] = indices.map(indice => cartItems[indice]);
        const { pedido, itens } = await inserirPedido(tx, cliente, {
          factoryPublicId: fabricas[indices[0]]?.publicId,
          factoryName: primeiro.factoryName,
          itens: indices.map(indice => {
            const { productName, customSpecs, quantity } = cartItems[indice];
            return { productName, customSpecs, quantity };
          }),
        }, consolidatedBillingId);
        for (const indice of indices) pedidoDeCadaItem[indice] = pedido.id;
        // O id interno só circula no servidor (guarda da tentativa); o gateway
        // recebe os publicIds dos itens.
        criados.push({ id: pedido.id, itens });
      }
      await aoCriarPedidos?.(tx, pedidoDeCadaItem);
      return criados;
    });

    // Só os pedidos criados nesta tentativa. O billingId provisório não serve
    // de chave: é aleatório e não é único no banco.
    const pedidoIds = createdOrders.map((pedido) => pedido.id);
    const tentativa = { pedidoIds, usuarioPublicId: cliente.publicId, billingIdProvisorio: consolidatedBillingId };

    if (!isSimulatedPaymentGateway()) {
      // Cada item gravado vira um produto do checkout, com o preço unitário
      // do servidor em centavos.
      const cobranca = await solicitarCobranca(getAbacateToken()!, {
        products: createdOrders.flatMap((pedido) => pedido.itens).map((item) => ({
          externalId: item.publicId,
          name:       item.productName,
          quantity:   item.quantity,
          price:      item.precoUnitarioEmCentavos,
        })),
        returnUrl:     `${origens.frontend}/`,
        completionUrl: `${origens.frontend}/`,
      });

      if (cobranca.status === "criada") {
        // A cobrança já existe no gateway. Uma falha daqui em diante é de
        // gravação: os pedidos ficam como estão e o caso vai para
        // conciliação, nunca para o desfazimento abaixo.
        try {
          const associada = await concluirTentativaDeCheckout({
            ...tentativa,
            resultado: { tipo: "associar", billingId: cobranca.billingId, simulado: false },
          });
          if (!associada) throw new ConflictProblem("Os pedidos mudaram enquanto a cobrança era criada. Atualize seus pedidos antes de pagar.");
        } catch (err) {
          logger.error(
            { err, traceId, requestId: traceId, billingId: cobranca.billingId, pedidoIds },
            "[AbacatePay] Cobrança criada no gateway, mas não registrada nos pedidos: conciliar",
          );
          throw err;
        }

        return { checkoutUrl: cobranca.url, isSimulated: false, billingId: cobranca.billingId };
      }

      logger.error(
        { traceId, requestId: traceId, resultado: cobranca.status, motivo: cobranca.motivo, pedidoIds },
        "[AbacatePay] Falha ao criar cobrança no gateway",
      );

      // Falha do gateway real nunca ativa simulador, em nenhum ambiente.
      if (cobranca.status === "incerta") {
        throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
      }
      const desfeita = await concluirTentativaDeCheckout({ ...tentativa, resultado: { tipo: "desfazer" } });
      if (!desfeita) {
        logger.error({ traceId, pedidoIds }, "[AbacatePay] Associação alterada durante a tentativa: conciliar");
        throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
      }
      throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
    }

    const simulada = await concluirTentativaDeCheckout({
      ...tentativa,
      resultado: { tipo: "associar", billingId: consolidatedBillingId, simulado: true },
    });
    if (!simulada) throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);

    return {
      checkoutUrl: `${origens.backend}/api/payments/simulated-checkout?billingId=${consolidatedBillingId}&returnTo=${encodeURIComponent(origens.frontend)}`,
      isSimulated: true,
      billingId: consolidatedBillingId,
    };
  }
}
