// ============================================================
//   CHECKOUT SERVICE — do carrinho à cobrança
//   Não conhece Request nem Response.
//
//   1. Os pedidos do carrinho nascem juntos numa transação, com o
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
import type { CheckoutCartDTO, CheckoutResultDTO } from "../dtos/order/order.dto.js";
import { ConflictProblem, ServiceUnavailableProblem } from "../errors/problem.js";
import { gerarBillingId } from "../utils/billingId.js";
import logger from "../utils/logger.js";
import { concluirTentativaDeCheckout } from "./checkoutAttempt.js";
import { solicitarCobranca } from "./gatewayDePagamento.js";
import { inserirPedido, type Cliente } from "./orderService.js";

export class CheckoutService {
  static async finalizarCarrinho(opcoes: {
    cliente: Cliente;
    cartItems: CheckoutCartDTO["cartItems"];
    /** Onde o navegador abriu a loja e onde a API responde, para os links. */
    origens: { frontend: string; backend: string };
    traceId?: string;
    /**
     * CART-01: roda na transação que cria os pedidos, com os ids deles na
     * ordem de cartItems. Um erro aqui desfaz os pedidos antes do gateway.
     */
    aoCriarPedidos?: (tx: Prisma.TransactionClient, pedidoIds: number[]) => Promise<void>;
  }): Promise<CheckoutResultDTO> {
    const { cliente, cartItems, origens, traceId, aoCriarPedidos } = opcoes;

    // SEC-06: em produção não há simulador. Sem gateway configurado não há
    // onde pagar, então a requisição falha antes de criar qualquer pedido.
    if (!simuladorDePagamentoAtivo && !gatewayDePagamentoConfigurado()) {
      throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
    }

    const consolidatedBillingId = gerarBillingId("sim");

    const createdOrders = await prisma.$transaction(async (tx) => {
      const criados = [];
      // FEAT-04, parte 1 (ADR-0004): ainda um pedido por item do carrinho, com o
      // item gravado em pedido_itens. O agrupamento por fábrica vem com as
      // telas que mostram os itens.
      for (const { factoryPublicId, factoryName, ...item } of cartItems) {
        const { pedido, itens } = await inserirPedido(
          tx, cliente, { factoryPublicId, factoryName, itens: [item] }, consolidatedBillingId,
        );
        // O id interno só circula no servidor (guarda da tentativa); o gateway
        // recebe os publicIds dos itens.
        criados.push({ id: pedido.id, itens });
      }
      await aoCriarPedidos?.(tx, criados.map((pedido) => pedido.id));
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
