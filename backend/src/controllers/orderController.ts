// ============================================================
//   ORDER CONTROLLER — Pedidos de óculos customizados
//   Migrado para PostgreSQL (pg, $1,$2)
// ============================================================

import pool from "../config/db.js";
import { emTransacao } from "../config/transacao.js";
import { getAbacateToken, isSimulatedPaymentGateway } from "../config/env.js";
import { gerarBillingId } from "../utils/billingId.js";
import { sendOrderStatusEmail } from "../utils/emailService.js";
import type { Request, Response } from "express";
import { BadRequestProblem, ConflictProblem, ForbiddenProblem, ServiceUnavailableProblem, UnauthorizedProblem } from "../errors/problem.js";
import { publicIdDoUsuario, usuarioPorPublicId } from "../utils/identidade.js";
import type { PoolClient } from "pg";
import { parsePagination } from "../utils/pagination.js";
import {
  PAGAMENTO_INDISPONIVEL,
  PAGAMENTO_NAO_CONFIRMADO,
  gatewayDePagamentoConfigurado,
  simuladorDePagamentoAtivo,
} from "../config/pagamento.js";
import { solicitarCobranca } from "../services/gatewayDePagamento.js";
import { concluirTentativaDeCheckout } from "../services/checkoutAttempt.js";
import { OrderService } from "../services/orderService.js";
import { centavosParaDecimal, precoDoItem } from "../domain/pricing.js";
import logger from "../utils/logger.js";
import type {
  CreateOrderDTO,
  UpdateOrderStatusDTO,
  CheckoutCartDTO,
} from "../dtos/order/order.dto.js";

// ─────────────────────────────────────────────────────────
//   ID-02: identificadores públicos
//
//   O cliente vem do publicId do token e a fábrica, do factoryPublicId do
//   corpo. Os dois são resolvidos dentro do próprio INSERT; as respostas
//   expõem publicId e factoryPublicId, nunca ids inteiros.
// ─────────────────────────────────────────────────────────

/** Colunas públicas de um pedido (alias p), com a fábrica (alias f). */
const CAMPOS_PEDIDO = `
  p."publicId",
  p.customer_name   AS "customerName",
  p.customer_email  AS "customerEmail",
  p.product_name    AS "productName",
  f."publicId"      AS "factoryPublicId",
  p.factory_name    AS "factoryName",
  p.status,
  p.total,
  p.custom_specs    AS "customSpecs",
  p.abacate_billing_id AS "abacateBillingId",
  DATE(p.criado_em)    AS "createdAt",
  DATE(p.atualizado_em) AS "updatedAt"`;

const JUNCAO_FABRICA = "LEFT JOIN usuarios f ON f.id = p.factory_id";

interface NovoPedido {
  usuarioPublicId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  factoryPublicId?: string;
  factoryName: string;
  total: string;
  customSpecs: string;
  billingId: string | null;
}

/**
 * Insere um pedido resolvendo cliente e fábrica pelos publicIds na própria
 * consulta. Sem factoryPublicId, usa a fábrica padrão (a mais antiga); com
 * um que não seja de fábrica, nada é inserido e a resposta é 400.
 */
async function inserirPedido(conexao: Pick<PoolClient, "query">, pedido: NovoPedido) {
  const { rows } = await conexao.query<{ id: number; publicId: string }>(
    `INSERT INTO pedidos
       (usuario_id, customer_name, customer_email, product_name,
        factory_id, factory_name, total, custom_specs, status, abacate_billing_id)
     SELECT u.id, $2, $3, $4,
            (SELECT f.id FROM usuarios f
              WHERE f.role = 'factory' AND ($5::text IS NULL OR f."publicId" = $5::text)
              ORDER BY f.id LIMIT 1),
            $6, $7, $8, 'Pending Payment', $9
       FROM usuarios u
      WHERE u."publicId" = $1
        AND ($5::text IS NULL OR EXISTS (
              SELECT 1 FROM usuarios f WHERE f.role = 'factory' AND f."publicId" = $5::text))
     RETURNING id, "publicId"`,
    [
      pedido.usuarioPublicId, pedido.customerName, pedido.customerEmail, pedido.productName,
      pedido.factoryPublicId ?? null, pedido.factoryName, pedido.total, pedido.customSpecs,
      pedido.billingId,
    ]
  );

  if (rows.length === 0) {
    if (pedido.factoryPublicId) throw new BadRequestProblem("Fábrica não encontrada.");
    throw new UnauthorizedProblem("Sessão inválida.");
  }
  return rows[0];
}

// ─────────────────────────────────────────────────────────
//   CRIAR PEDIDO
//   POST /api/orders
// ─────────────────────────────────────────────────────────
export async function createOrder(req: Request, res: Response) {
  // 🔐 Security Fix: 'status' is completely ignored from req.body to prevent payment bypass.
  const { productName, factoryPublicId, factoryName, customSpecs, quantity } = req.body as CreateOrderDTO;

  // O preço vem das especificações, calculado no servidor (SEC-05). A
  // quantidade gravada é a cobrada, nunca a que vier em customSpecs.
  const { total } = precoDoItem(customSpecs, quantity);
  const especificacaoGravada = { ...customSpecs, quantity };

  // O status inicial é sempre "Pending Payment" (🔒 trava de segurança).
  const criado = await inserirPedido(pool, {
    usuarioPublicId: publicIdDoUsuario(req),
    customerName:    req.user!.name ?? "",
    customerEmail:   req.user!.email ?? "",
    productName,
    factoryPublicId,
    factoryName,
    total:           centavosParaDecimal(total),
    customSpecs:     JSON.stringify(especificacaoGravada),
    billingId:       null,
  });

  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PEDIDO} FROM pedidos p ${JUNCAO_FABRICA} WHERE p."publicId" = $1`,
    [criado.publicId]
  );

  const pedido = rows[0];
  pedido.customSpecs = JSON.parse(pedido.customSpecs || "{}");

  return res.status(201).json({ ...pedido, order: pedido });
}

// ─────────────────────────────────────────────────────────
//   LISTAR PEDIDOS (baseado no role do usuário)
//   GET /api/orders
// ─────────────────────────────────────────────────────────
export async function getOrders(req: Request, res: Response) {
  const { role } = req.user!;
  const publicId = publicIdDoUsuario(req);

  const pagination = parsePagination(req.query);
  if (!pagination.isValid) {
    throw new BadRequestProblem(pagination.error);
  }
  const { page, limit, offset } = pagination;

  let rows;
  let totalCount = 0;

  if (role === "client") {
    const countRes = await pool.query(`SELECT COUNT(*) FROM pedidos WHERE usuario_id = ${usuarioPorPublicId("$1")}`, [publicId]);
    totalCount = parseInt(countRes.rows[0].count);
    const result = await pool.query(
      `SELECT ${CAMPOS_PEDIDO} FROM pedidos p ${JUNCAO_FABRICA}
        WHERE p.usuario_id = ${usuarioPorPublicId("$1")} ORDER BY p.criado_em DESC LIMIT $2 OFFSET $3`,
      [publicId, limit, offset]
    );
    rows = result.rows;
  } else if (role === "factory") {
    const countRes = await pool.query(`SELECT COUNT(*) FROM pedidos WHERE factory_id = ${usuarioPorPublicId("$1")}`, [publicId]);
    totalCount = parseInt(countRes.rows[0].count);
    const result = await pool.query(
      `SELECT ${CAMPOS_PEDIDO} FROM pedidos p ${JUNCAO_FABRICA}
        WHERE p.factory_id = ${usuarioPorPublicId("$1")} ORDER BY p.criado_em DESC LIMIT $2 OFFSET $3`,
      [publicId, limit, offset]
    );
    rows = result.rows;
  } else if (role === "staff") {
    const countRes = await pool.query(`SELECT COUNT(*) FROM pedidos`);
    totalCount = parseInt(countRes.rows[0].count);
    const result = await pool.query(
      `SELECT ${CAMPOS_PEDIDO} FROM pedidos p ${JUNCAO_FABRICA} ORDER BY p.criado_em DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    rows = result.rows;
  } else {
    throw new ForbiddenProblem("Acesso não autorizado.");
  }

  const parsedRows = rows.map(r => ({
    ...r,
    customSpecs: r.customSpecs ? JSON.parse(r.customSpecs) : {}
  }));

  return res.json({
    orders: parsedRows,
    pagination: {
      page,
      limit,
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    }
  });
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR STATUS DO PEDIDO
//   PUT /api/orders/:publicId/status
// ─────────────────────────────────────────────────────────
export async function updateOrderStatus(req: Request, res: Response) {
  // Express 5 tipa params como string | string[]; a rota declara um só.
  const publicId   = String(req.params.publicId ?? "");
  const { status } = req.body as UpdateOrderStatusDTO;

  // A identidade vem exclusivamente do token validado pelo middleware.
  // A autorização de objeto acontece dentro da mutação, no service.
  const pedido = await OrderService.updateStatus({
    publicId,
    status,
    ator: { publicId: publicIdDoUsuario(req), role: String(req.user!.role) },
  });

  sendOrderStatusEmail(
    {
      id:             pedido.publicId,
      customer_name:  pedido.customerName,
      customer_email: pedido.customerEmail,
      product_name:   pedido.productName,
      factory_name:   pedido.factoryName ?? undefined,
    },
    status
  );

  return res.json({
    message: `Status do pedido atualizado para "${status}" com sucesso.`,
    order: pedido,
    ...pedido,
  });
}

// ─────────────────────────────────────────────────────────
//   CHECKOUT DO CARRINHO
//   POST /api/orders/checkout-cart
// ─────────────────────────────────────────────────────────
export async function checkoutCart(req: Request, res: Response) {
  const { cartItems } = req.body as CheckoutCartDTO;

  // SEC-06: em produção não há simulador. Sem gateway configurado não há
  // onde pagar, então a requisição falha antes de criar qualquer pedido.
  if (!simuladorDePagamentoAtivo && !gatewayDePagamentoConfigurado()) {
    throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
  }

  const customerName    = req.user!.name ?? "";
  const customerEmail   = req.user!.email ?? "";
  const usuarioPublicId = publicIdDoUsuario(req);
  const consolidatedBillingId = gerarBillingId("sim");

  const createdOrders = await emTransacao(async (client) => {
    const criados = [];

    for (const item of cartItems) {
      const { productName, factoryPublicId, factoryName, customSpecs, quantity } = item;

      const specsWithQty    = { ...customSpecs, quantity };
      // O preço vem das especificações, calculado no servidor (SEC-05).
      const preco           = precoDoItem(customSpecs, quantity);

      const criado = await inserirPedido(client, {
        usuarioPublicId,
        customerName,
        customerEmail,
        productName,
        factoryPublicId,
        factoryName,
        total:       centavosParaDecimal(preco.total),
        customSpecs: JSON.stringify(specsWithQty),
        billingId:   consolidatedBillingId,
      });

      // O id interno só circula no servidor (guarda da tentativa); o gateway
      // recebe o publicId.
      criados.push({
        id: criado.id,
        publicId: criado.publicId,
        productName,
        quantity,
        precoUnitarioEmCentavos: preco.unitario,
      });
    }
    return criados;
  }, { traceId: req.requestId });

    const frontendOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:5173`);
    const backendProto = req.headers['x-forwarded-proto'] || req.protocol;
    const backendOrigin = `${backendProto}://${req.get("host")}`;

    const ABACATE_TOKEN = getAbacateToken();
    const isMockToken   = isSimulatedPaymentGateway();

    // Só os pedidos criados nesta tentativa. O billingId provisório não serve
    // de chave: é aleatório e não é único no banco.
    const pedidoIds = createdOrders.map((pedido) => pedido.id);

    if (!isMockToken) {
      // O gateway cobra o preço unitário calculado no servidor, em centavos.
      const cobranca = await solicitarCobranca(ABACATE_TOKEN!, {
        products: createdOrders.map((pedido) => ({
          externalId: pedido.publicId,
          name:       pedido.productName,
          quantity:   pedido.quantity,
          price:      pedido.precoUnitarioEmCentavos
        })),
        returnUrl:     `${frontendOrigin}/`,
        completionUrl: `${frontendOrigin}/`,
        customer:      { name: customerName, email: customerEmail, taxId: "00000000000" }
      });

      if (cobranca.status === "criada") {
        // A cobrança já existe no gateway. Uma falha daqui em diante é de
        // gravação: os pedidos ficam como estão e o caso vai para
        // conciliação, nunca para o desfazimento abaixo.
        try {
          const associada = await concluirTentativaDeCheckout({
            pedidoIds, usuarioPublicId, billingIdProvisorio: consolidatedBillingId,
            resultado: { tipo: "associar", billingId: cobranca.billingId, simulado: false },
          });
          if (!associada) throw new ConflictProblem("Os pedidos mudaram enquanto a cobrança era criada. Atualize seus pedidos antes de pagar.");
        } catch (err) {
          logger.error(
            { err, traceId: req.requestId, requestId: req.requestId, billingId: cobranca.billingId, pedidoIds },
            "[AbacatePay] Cobrança criada no gateway, mas não registrada nos pedidos: conciliar",
          );
          throw err;
        }

        return res.json({
          checkoutUrl: cobranca.url,
          isSimulated: false,
          billingId:   cobranca.billingId
        });
      }

      logger.error(
        { traceId: req.requestId, requestId: req.requestId, resultado: cobranca.status, motivo: cobranca.motivo, pedidoIds },
        "[AbacatePay] Falha ao criar cobrança no gateway",
      );

      // Falha do gateway real nunca ativa simulador, em nenhum ambiente.
      if (cobranca.status === "incerta") {
        throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
      }
      const desfeita = await concluirTentativaDeCheckout({
        pedidoIds, usuarioPublicId, billingIdProvisorio: consolidatedBillingId,
        resultado: { tipo: "desfazer" },
      });
      if (!desfeita) {
        logger.error({ traceId: req.requestId, pedidoIds }, "[AbacatePay] Associação alterada durante a tentativa: conciliar");
        throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
      }
      throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
    }

    const simulada = await concluirTentativaDeCheckout({
      pedidoIds, usuarioPublicId, billingIdProvisorio: consolidatedBillingId,
      resultado: { tipo: "associar", billingId: consolidatedBillingId, simulado: true },
    });
    if (!simulada) throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
    const simulatedCheckoutUrl = `${backendOrigin}/api/payments/simulated-checkout?billingId=${consolidatedBillingId}&returnTo=${encodeURIComponent(frontendOrigin)}`;

    return res.json({
      checkoutUrl: simulatedCheckoutUrl,
      isSimulated: true,
      billingId:   consolidatedBillingId
    });

}
