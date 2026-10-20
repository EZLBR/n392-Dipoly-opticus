// ============================================================
//   ORDER CONTROLLER — Pedidos de óculos customizados
//   Migrado para PostgreSQL (pg, $1,$2)
// ============================================================

import pool from "../config/db.js";
import { getAbacateToken, isSimulatedPaymentGateway } from "../config/env.js";
import { gerarBillingId } from "../utils/billingId.js";
import { sendOrderStatusEmail } from "../utils/emailService.js";
import type { Request, Response } from "express";
import { ForbiddenProblem, ServiceUnavailableProblem } from "../errors/problem.js";
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
//   CRIAR PEDIDO
//   POST /api/orders
// ─────────────────────────────────────────────────────────
export async function createOrder(req: Request, res: Response) {
  // 🔐 Security Fix: 'status' is completely ignored from req.body to prevent payment bypass.
  const { productName, factoryId, factoryName, customSpecs, quantity } = req.body as CreateOrderDTO;

  // O preço vem das especificações, calculado no servidor (SEC-05). A
  // quantidade gravada é a cobrada, nunca a que vier em customSpecs.
  const { total } = precoDoItem(customSpecs, quantity);
  const especificacaoGravada = { ...customSpecs, quantity };

  const customerName  = req.user!.name;
  const customerEmail = req.user!.email;
  const usuarioId     = req.user!.id;

  let finalFactoryId = Number(factoryId);
  if (isNaN(finalFactoryId)) {
    const { rows: fRows } = await pool.query("SELECT id FROM usuarios WHERE role = 'factory' LIMIT 1");
    finalFactoryId = fRows.length > 0 ? fRows[0].id : null;
  }

  const { rows: result } = await pool.query(
    `INSERT INTO pedidos
     (usuario_id, customer_name, customer_email, product_name,
      factory_id, factory_name, total, custom_specs, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      usuarioId,
      customerName,
      customerEmail,
      productName,
      finalFactoryId,
      factoryName,
      centavosParaDecimal(total),
      JSON.stringify(especificacaoGravada),
      "Pending Payment" // 🔒 Trava de Segurança
    ]
  );

  const pedidoId = result[0].id;

  const { rows } = await pool.query(
    `SELECT
      id,
      customer_name   AS "customerName",
      customer_email  AS "customerEmail",
      product_name    AS "productName",
      factory_id      AS "factoryId",
      factory_name    AS "factoryName",
      status,
      total,
      custom_specs    AS "customSpecs",
      abacate_billing_id AS "abacateBillingId",
      DATE(criado_em) AS "createdAt"
     FROM pedidos WHERE id = $1`,
    [pedidoId]
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
  const { role, email, id } = req.user!;

  const selectFields = `
    id,
    "publicId",
    customer_name   AS "customerName",
    customer_email  AS "customerEmail",
    product_name    AS "productName",
    factory_id      AS "factoryId",
    factory_name    AS "factoryName",
    status,
    total,
    custom_specs    AS "customSpecs",
    abacate_billing_id AS "abacateBillingId",
    DATE(criado_em)    AS "createdAt",
    DATE(atualizado_em) AS "updatedAt"
  `;

  const page = parseInt(String(req.query.page || "")) || 1;
  const limit = parseInt(String(req.query.limit || "")) || 20;
  const offset = (page - 1) * limit;

  let rows;
  let totalCount = 0;

  if (role === "client") {
    const countRes = await pool.query(`SELECT COUNT(*) FROM pedidos WHERE customer_email = $1`, [email]);
    totalCount = parseInt(countRes.rows[0].count);
    const result = await pool.query(
      `SELECT ${selectFields} FROM pedidos WHERE customer_email = $1 ORDER BY criado_em DESC LIMIT $2 OFFSET $3`,
      [email, limit, offset]
    );
    rows = result.rows;
  } else if (role === "factory") {
    const countRes = await pool.query(`SELECT COUNT(*) FROM pedidos WHERE factory_id = $1`, [id]);
    totalCount = parseInt(countRes.rows[0].count);
    const result = await pool.query(
      `SELECT ${selectFields} FROM pedidos WHERE factory_id = $1 ORDER BY criado_em DESC LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    rows = result.rows;
  } else if (role === "staff") {
    const countRes = await pool.query(`SELECT COUNT(*) FROM pedidos`);
    totalCount = parseInt(countRes.rows[0].count);
    const result = await pool.query(
      `SELECT ${selectFields} FROM pedidos ORDER BY criado_em DESC LIMIT $1 OFFSET $2`,
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
    ator: { id: Number(req.user!.id), role: String(req.user!.role) },
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

  const customerName  = req.user!.name;
  const customerEmail = req.user!.email;
  const usuarioId     = Number(req.user!.id);
  const consolidatedBillingId = gerarBillingId("sim");

  const client = await pool.connect();
  let createdOrders = [];
  try {
    await client.query("BEGIN");
    let finalFactoryIdCache = null;

    for (const item of cartItems) {
      const { productName, factoryId, factoryName, customSpecs, quantity } = item;

      const specsWithQty    = { ...customSpecs, quantity };
      // O preço vem das especificações, calculado no servidor (SEC-05).
      const preco           = precoDoItem(customSpecs, quantity);

      let finalFactoryId = Number(factoryId);
      if (isNaN(finalFactoryId)) {
        if (!finalFactoryIdCache) {
          const { rows: fRows } = await client.query("SELECT id FROM usuarios WHERE role = 'factory' LIMIT 1");
          finalFactoryIdCache = fRows.length > 0 ? fRows[0].id : null;
        }
        finalFactoryId = finalFactoryIdCache;
      }

      const { rows: result } = await client.query(
        `INSERT INTO pedidos
         (usuario_id, customer_name, customer_email, product_name,
          factory_id, factory_name, total, custom_specs, status, abacate_billing_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending Payment', $9) RETURNING id`,
        [
          usuarioId,
          customerName,
          customerEmail,
          productName,
          finalFactoryId,
          factoryName,
          centavosParaDecimal(preco.total),
          JSON.stringify(specsWithQty),
          consolidatedBillingId
        ]
      );

      createdOrders.push({
        id: result[0].id,
        productName,
        quantity,
        precoUnitarioEmCentavos: preco.unitario,
        factoryId,
        factoryName
      });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    throw err;
  }
  client.release();

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
          externalId: String(pedido.id),
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
            pedidoIds, usuarioId, billingIdProvisorio: consolidatedBillingId,
            resultado: { tipo: "associar", billingId: cobranca.billingId, simulado: false },
          });
          if (!associada) throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
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

      // SEC-06: em produção não há simulador para onde mandar o cliente.
      if (cobranca.status === "incerta" || !simuladorDePagamentoAtivo) {
        if (cobranca.status === "incerta") {
          // Sem resposta conclusiva, a cobrança pode existir: os pedidos
          // ficam pendentes para conciliação, e a resposta não afirma que
          // nada foi criado.
          throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
        }

        // O gateway confirmou que não criou a cobrança. Os pedidos desta
        // tentativa são desfeitos, para não ficarem pendentes sem cobrança
        // nem se acumularem a cada nova tentativa.
        const desfeita = await concluirTentativaDeCheckout({
          pedidoIds, usuarioId, billingIdProvisorio: consolidatedBillingId,
          resultado: { tipo: "desfazer" },
        });
        if (!desfeita) {
          logger.error({ traceId: req.requestId, pedidoIds }, "[AbacatePay] Associação alterada durante a tentativa: conciliar");
          throw new ServiceUnavailableProblem(PAGAMENTO_NAO_CONFIRMADO);
        }
        throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
      }
    }

    const simulada = await concluirTentativaDeCheckout({
      pedidoIds, usuarioId, billingIdProvisorio: consolidatedBillingId,
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
