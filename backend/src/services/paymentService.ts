// ============================================================
//   PAYMENT SERVICE — cobrança, confirmação e listagem
//   Não conhece Request nem Response.
//
//   Toda escrita repete a guarda da leitura: dono, status e origem
//   da cobrança (real ou simulada) estão na própria cláusula, então
//   não existe janela entre ver o pedido e alterá-lo.
// ============================================================

import { MetodoPagamento, PedidoStatus, Prisma, StatusPagamento } from "@prisma/client";
import prisma from "../config/prisma.js";
import { getAbacateToken, isSimulatedPaymentGateway } from "../config/env.js";
import {
  PAGAMENTO_INDISPONIVEL,
  PAGAMENTO_NAO_CONFIRMADO,
  simuladorDePagamentoAtivo,
} from "../config/pagamento.js";
import type {
  BillingResultDTO,
  PaginatedPaymentsDTO,
  SimulatedCheckoutDTO,
} from "../dtos/payment/payment.dto.js";
import {
  ConflictProblem,
  NotFoundProblem,
  ServiceUnavailableProblem,
} from "../errors/problem.js";
import { gerarBillingId } from "../utils/billingId.js";
import logger from "../utils/logger.js";
import { solicitarCobranca } from "./gatewayDePagamento.js";
import type { Ator } from "./orderService.js";

/** FEAT-03: cobrança só para pedido que ainda aguarda pagamento. */
const PEDIDO_NAO_COBRAVEL = "Só é possível gerar cobrança para um pedido que aguarda pagamento.";

/** Só as colunas de que a cobrança precisa. */
const CAMPOS_COBRAVEIS = {
  id: true,
  publicId: true,
  total: true,
  productName: true,
  abacateBillingId: true,
  status: true,
} satisfies Prisma.PedidoSelect;

type PedidoCobravel = Prisma.PedidoGetPayload<{ select: typeof CAMPOS_COBRAVEIS }>;

/** Pedido que acabou de ser pago, com o total que vira o valor do pagamento. */
interface PedidoPago {
  id: number;
  total: Prisma.Decimal;
}

/**
 * Aprova os pagamentos dos pedidos pagos nesta transação: o pendente da
 * cobrança passa a aprovado, e quem não tinha linha (o carrinho simulado,
 * por exemplo) ganha uma, com o total do pedido.
 *
 * Ler e depois criar não abre corrida: os pedidos já estão travados pelo
 * UPDATE desta transação, e toda escrita em pagamentos altera o pedido
 * antes. Outra transação sobre o mesmo pedido espera esta terminar.
 */
async function aprovarPagamentos(tx: Prisma.TransactionClient, billingId: string, pedidos: PedidoPago[]) {
  if (pedidos.length === 0) return;

  // CART-01: o item do carrinho que virou um destes pedidos sai do carrinho
  // agora, com o pagamento confirmado, e nunca por um parâmetro da URL. Um
  // item alterado depois do checkout perdeu o vínculo e fica.
  await tx.carrinhoItem.deleteMany({ where: { pedidoId: { in: pedidos.map(pedido => pedido.id) } } });
  const doPedido = { referenciaExterna: billingId, pedidoId: { in: pedidos.map(pedido => pedido.id) } };

  await tx.pagamento.updateMany({ where: doPedido, data: { status: StatusPagamento.aprovado } });

  const registrados = new Set(
    (await tx.pagamento.findMany({ where: doPedido, select: { pedidoId: true } })).map(p => p.pedidoId),
  );
  const faltando = pedidos.filter(pedido => !registrados.has(pedido.id));
  if (faltando.length === 0) return;

  await tx.pagamento.createMany({
    data: faltando.map(pedido => ({
      pedidoId: pedido.id,
      metodo: MetodoPagamento.pix,
      status: StatusPagamento.aprovado,
      // O total segue como o Decimal do banco, sem passar por float.
      valor: pedido.total,
      referenciaExterna: billingId,
    })),
  });
}

/**
 * Liga a cobrança criada no gateway ao pedido e registra o pagamento
 * pendente, numa transação só: um sem o outro deixaria o webhook sem ter
 * como confirmar o pagamento.
 *
 * O pedido só é alterado se ainda estiver com o billingId lido no início da
 * requisição. Se outra cobrança o assumiu enquanto o gateway respondia (um
 * checkout concluído, por exemplo), nada é gravado e a resposta é 409.
 *
 * Qualquer falha aqui acontece com a cobrança já existente no gateway, então
 * vai para o log de conciliação e nunca para o simulador.
 */
async function registrarCobrancaNoPedido(traceId: string | undefined, pedido: PedidoCobravel, billingId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.pedido.updateMany({
        // Com billingId nulo, o Prisma compara com IS NULL: o mesmo
        // IS NOT DISTINCT FROM que a guarda precisa.
        where: { id: pedido.id, status: PedidoStatus.Pending_Payment, abacateBillingId: pedido.abacateBillingId },
        data: { abacateBillingId: billingId, pagamentoSimulado: false },
      });

      if (count !== 1) {
        logger.error(
          { traceId, requestId: traceId, billingId, pedidoId: pedido.id },
          "[AbacatePay] Pedido mudou durante a cobrança; nada foi registrado: conciliar",
        );
        throw new ConflictProblem(
          "O pedido mudou enquanto a cobrança era criada. Atualize seus pedidos antes de pagar."
        );
      }

      await tx.pagamento.create({
        data: {
          pedidoId: pedido.id,
          metodo: MetodoPagamento.pix,
          status: StatusPagamento.pendente,
          valor: pedido.total,
          referenciaExterna: billingId,
        },
      });
    });
  } catch (err) {
    // O Prisma desfaz a transação. Aqui só se registra o que a conciliação
    // precisa, inclusive quando nem a conexão foi obtida.
    if (!(err instanceof ConflictProblem)) {
      logger.error(
        { err, traceId, requestId: traceId, billingId, pedidoId: pedido.id },
        "[AbacatePay] Cobrança criada no gateway, mas não registrada no pedido: conciliar",
      );
    }
    throw err;
  }
}

/** O Decimal(10,2) vezes 100 é inteiro exato: centavos sem passar por float. */
const emCentavos = (total: Prisma.Decimal) => total.mul(100).toNumber();

export class PaymentService {
  /**
   * Cria a cobrança de um pedido: no simulador, fora de produção, ou no
   * gateway real.
   *
   * BOLA-03: a posse é parte da própria consulta. Staff é a exceção
   * explícita na cláusula. Pedido inexistente e pedido alheio caem no mesmo
   * 404 (BOLA-02); 403 fica reservado à falta de papel.
   */
  static async criarCobranca(opcoes: {
    ator: Ator;
    orderPublicId: string;
    /** Onde o navegador abriu a loja e onde a API responde, para os links. */
    origens: { frontend: string; backend: string };
    traceId?: string;
  }): Promise<BillingResultDTO> {
    const { ator, orderPublicId, origens, traceId } = opcoes;
    const escopo: Prisma.PedidoWhereInput = ator.role === "staff" ? {} : { usuario: { publicId: ator.publicId } };

    const pedido = await prisma.pedido.findFirst({
      where: { publicId: orderPublicId, ...escopo },
      select: CAMPOS_COBRAVEIS,
    });

    if (!pedido) {
      throw new NotFoundProblem("Pedido não encontrado.");
    }

    // FEAT-03: pedido pago, em produção, entregue ou cancelado não ganha
    // outra cobrança. A recusa vem antes do gateway, para não criar cobrança
    // nenhuma. Quem chega aqui já enxerga o pedido: o 409 não revela nada.
    if (pedido.status !== PedidoStatus.Pending_Payment) {
      throw new ConflictProblem(PEDIDO_NAO_COBRAVEL);
    }

    if (isSimulatedPaymentGateway()) {
      // SEC-06: em produção não há simulador. Sem gateway, não existe
      // cobrança possível, e o pedido não é alterado.
      if (!simuladorDePagamentoAtivo) {
        throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
      }

      const billingId = gerarBillingId("sim");

      // A escrita repete o escopo e o status da leitura: a autorização e a
      // máquina de estados valem para a mutação, e não só para a leitura.
      const { count } = await prisma.pedido.updateMany({
        where: { id: pedido.id, status: PedidoStatus.Pending_Payment, ...escopo },
        data: { abacateBillingId: billingId, pagamentoSimulado: true },
      });

      // O pedido já foi visto acima: zero linhas significa que o status mudou
      // nesse meio-tempo (o pagamento foi confirmado, por exemplo).
      if (count !== 1) {
        throw new ConflictProblem(PEDIDO_NAO_COBRAVEL);
      }

      return {
        checkoutUrl: `${origens.backend}/api/payments/simulated-checkout?billingId=${billingId}&orderPublicId=${encodeURIComponent(pedido.publicId)}&returnTo=${encodeURIComponent(origens.frontend)}`,
        isSimulated: true,
      };
    }

    const cobranca = await solicitarCobranca(getAbacateToken()!, {
      products:      [{ externalId: pedido.publicId, name: pedido.productName, quantity: 1, price: emCentavos(pedido.total) }],
      returnUrl:     `${origens.frontend}/`,
      completionUrl: `${origens.frontend}/`,
    });

    if (cobranca.status === "criada") {
      await registrarCobrancaNoPedido(traceId, pedido, cobranca.billingId);
      return { checkoutUrl: cobranca.url, isSimulated: false };
    }

    logger.error(
      { traceId, requestId: traceId, resultado: cobranca.status, motivo: cobranca.motivo, pedidoId: pedido.id },
      "[AbacatePay] Falha ao criar cobrança no gateway",
    );

    // Com token real, a falha do gateway nunca cai no simulador, em nenhum
    // ambiente (padrão §22). O pedido não é alterado, e resultado incerto não
    // afirma que nada foi criado.
    throw new ServiceUnavailableProblem(
      cobranca.status === "incerta" ? PAGAMENTO_NAO_CONFIRMADO : PAGAMENTO_INDISPONIVEL
    );
  }

  /** Todos os pagamentos, do mais novo para o mais antigo. Só staff chega aqui. */
  static async listar({ page, limit, offset }: { page: number; limit: number; offset: number }): Promise<PaginatedPaymentsDTO> {
    const [pagamentos, totalItems] = await Promise.all([
      prisma.pagamento.findMany({
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
        select: {
          publicId: true,
          metodo: true,
          status: true,
          valor: true,
          referenciaExterna: true,
          criadoEm: true,
          pedido: { select: { publicId: true, customerName: true, customerEmail: true } },
        },
      }),
      prisma.pagamento.count(),
    ]);

    return {
      pagamentos: pagamentos.map(pagamento => ({
        publicId: pagamento.publicId,
        pedidoPublicId: pagamento.pedido.publicId,
        metodo: pagamento.metodo,
        status: pagamento.status,
        // O Decimal serializado sozinho perde o zero final (1999.9).
        valor: pagamento.valor.toFixed(2),
        referenciaExterna: pagamento.referenciaExterna,
        criadoEm: pagamento.criadoEm,
        clienteNome: pagamento.pedido.customerName,
        clienteEmail: pagamento.pedido.customerEmail,
      })),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  /**
   * O gateway confirmou o pagamento de uma cobrança real: os pedidos dela
   * vão para a fila e os pagamentos são aprovados, numa transação só.
   * Devolve quantos pedidos esta entrega processou.
   *
   * A transição é a guarda: só sai de "Pending Payment" quem ainda está
   * nele, então a reentrega do evento não repete efeito, nem depois da
   * entrega. Pedido simulado nunca é confirmado pelo gateway real.
   */
  static async confirmarPeloGateway(billingId: string): Promise<number> {
    return prisma.$transaction(async (tx) => {
      // O Prisma 5 não devolve as linhas de um updateMany. Um só UPDATE com
      // RETURNING decide e informa quais pedidos esta transação pagou.
      const pagos = await tx.$queryRaw<PedidoPago[]>`
        UPDATE pedidos SET status = 'Queued'
         WHERE abacate_billing_id = ${billingId}
           AND pagamento_simulado = false
           AND status = 'Pending Payment'
        RETURNING id, total`;
      await aprovarPagamentos(tx, billingId, pagos);
      return pagos.length;
    });
  }

  /**
   * Os pedidos de uma cobrança simulada, para a página do simulador. Só o
   * dono autenticado os vê (SEC-03); de outra pessoa ou inexistente é 404.
   */
  static async checkoutSimulado(usuarioPublicId: string, billingId: string): Promise<SimulatedCheckoutDTO> {
    const pedidos = await prisma.pedido.findMany({
      where: { abacateBillingId: billingId, usuario: { publicId: usuarioPublicId }, pagamentoSimulado: true },
      orderBy: { id: "asc" },
      select: { productName: true, total: true, customerName: true, customerEmail: true },
    });

    if (pedidos.length === 0) {
      throw new NotFoundProblem("Nenhum pedido encontrado para essa cobrança.");
    }

    const total = pedidos.reduce((soma, pedido) => soma.add(pedido.total), new Prisma.Decimal(0));

    return {
      itens: pedidos.map(pedido => ({ productName: pedido.productName, total: pedido.total.toFixed(2) })),
      total: total.toFixed(2),
      cliente: { nome: pedidos[0].customerName, email: pedidos[0].customerEmail },
    };
  }

  /**
   * SEC-01: confirma o pagamento simulado do dono. O usuário vem do token,
   * nunca do corpo, e pedido e pagamento mudam na mesma transação.
   */
  static async confirmarSimulado(usuarioPublicId: string, billingId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Autorização na própria cláusula: só o dono, e só enquanto o pedido
      // ainda está em "Pending Payment". Nenhuma linha agrupa inexistente,
      // de outro dono e já processado: todos respondem o mesmo 404, sem
      // oráculo de existência nem de estado.
      const pagos = await tx.$queryRaw<PedidoPago[]>`
        UPDATE pedidos SET status = 'Queued'
         WHERE abacate_billing_id = ${billingId}
           AND usuario_id = (SELECT u.id FROM usuarios u WHERE u."publicId" = ${usuarioPublicId})
           AND pagamento_simulado = true
           AND status = 'Pending Payment'
        RETURNING id, total`;

      if (pagos.length === 0) {
        throw new NotFoundProblem("Nenhum pedido elegível encontrado para essa cobrança.");
      }

      // Apenas os pedidos efetivamente autorizados e alterados nesta transação.
      await aprovarPagamentos(tx, billingId, pagos);
    });
  }
}
