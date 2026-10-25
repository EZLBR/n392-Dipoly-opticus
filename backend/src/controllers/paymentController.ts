// ============================================================
//   PAYMENT CONTROLLER
//   Integração com AbacatePay + registro de pagamentos
//   Migrado para PostgreSQL (pg, $1)
// ============================================================

import pool from "../config/db.js";
import { env, getAbacateToken, getWebhookSecret, isSimulatedPaymentGateway } from "../config/env.js";
import { gerarBillingId } from "../utils/billingId.js";
import { assinaturaWebhookValida, textoSecretoIgual } from "../services/webhookSignature.js";
import {
  PAGAMENTO_INDISPONIVEL,
  PAGAMENTO_NAO_CONFIRMADO,
  simuladorDePagamentoAtivo,
} from "../config/pagamento.js";
import { solicitarCobranca } from "../services/gatewayDePagamento.js";
import type { Request, Response } from "express";
import {
  BadRequestProblem,
  ConflictProblem,
  ForbiddenProblem,
  NotFoundProblem,
  ServiceUnavailableProblem,
  UnauthorizedProblem,
} from "../errors/problem.js";
import logger from "../utils/logger.js";
import { emTransacao } from "../config/transacao.js";

// Security Helper
const escapeHTML = (str: unknown) => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const PORT          = env.PORT;

import type { CreateBillingDTO } from "../dtos/payment/payment.dto.js";

// ─────────────────────────────────────────────────────────
//   CRIAR COBRANÇA (AbacatePay ou simulador)
//   POST /api/payments/create-billing
// ─────────────────────────────────────────────────────────
export async function createBilling(req: Request, res: Response) {
  const { orderId } = req.body as CreateBillingDTO;

  const { rows } = await pool.query("SELECT * FROM pedidos WHERE id = $1", [orderId]);

  if (rows.length === 0) {
    throw new NotFoundProblem("Pedido não encontrado.");
  }

  const order = rows[0];

  // Security Fix: Verificar ownership
  if (order.usuario_id !== req.user!.id && req.user!.role !== "staff") {
    throw new ForbiddenProblem("Acesso negado: Este pedido pertence a outro usuário.");
  }

  const ABACATE_TOKEN = getAbacateToken();
  const amountInCents   = Math.round(Number(order.total) * 100);
  const isMockToken     = isSimulatedPaymentGateway();
  const frontendOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:5173`);
  const backendProto = req.headers['x-forwarded-proto'] || req.protocol;
  const backendOrigin = `${backendProto}://${req.get("host")}`;

  if (isMockToken) {
    // SEC-06: em produção não há simulador. Sem gateway, não existe
    // cobrança possível, e o pedido não é alterado.
    if (!simuladorDePagamentoAtivo) {
      throw new ServiceUnavailableProblem(PAGAMENTO_INDISPONIVEL);
    }

    const mockBillingId  = gerarBillingId("sim");

    await pool.query(
      "UPDATE pedidos SET abacate_billing_id = $1, pagamento_simulado = true, status = 'Pending Payment' WHERE id = $2",
      [mockBillingId, orderId]
    );

    const mockCheckoutUrl = `${backendOrigin}/api/payments/simulated-checkout?billingId=${mockBillingId}&orderId=${orderId}&returnTo=${encodeURIComponent(frontendOrigin)}`;

    return res.json({ checkoutUrl: mockCheckoutUrl, isSimulated: true });
  }

  const cobranca = await solicitarCobranca(ABACATE_TOKEN!, {
    products:      [{ externalId: String(order.id), name: order.product_name, quantity: 1, price: amountInCents }],
    returnUrl:     `${frontendOrigin}/`,
    completionUrl: `${frontendOrigin}/`,
    customer:      { name: order.customer_name, email: order.customer_email, taxId: "00000000000" }
  });

  if (cobranca.status === "criada") {
    await registrarCobrancaNoPedido(req.requestId, order, cobranca.billingId);
    return res.json({ checkoutUrl: cobranca.url, isSimulated: false });
  }

  logger.error(
    { traceId: req.requestId, requestId: req.requestId, resultado: cobranca.status, motivo: cobranca.motivo, pedidoId: order.id },
    "[AbacatePay] Falha ao criar cobrança no gateway",
  );

  // Com token real, a falha do gateway nunca cai no simulador, em nenhum
  // ambiente (padrão §22). O pedido não é alterado, e resultado incerto não
  // afirma que nada foi criado.
  throw new ServiceUnavailableProblem(
    cobranca.status === "incerta" ? PAGAMENTO_NAO_CONFIRMADO : PAGAMENTO_INDISPONIVEL
  );
}

// ─────────────────────────────────────────────────────────
//   HELPER INTERNO: Registra pagamento na tabela pagamentos
// ─────────────────────────────────────────────────────────
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
async function registrarCobrancaNoPedido(
  traceId: string | undefined,
  pedido: { id: number; total: string; abacate_billing_id: string | null },
  billingId: string,
) {
  try {
    await emTransacao(async (conexao) => {
      const { rowCount } = await conexao.query(
        `UPDATE pedidos SET abacate_billing_id = $1, pagamento_simulado = false, status = 'Pending Payment'
          WHERE id = $2 AND abacate_billing_id IS NOT DISTINCT FROM $3::varchar`,
        [billingId, pedido.id, pedido.abacate_billing_id]
      );

      if (rowCount !== 1) {
        logger.error(
          { traceId, requestId: traceId, billingId, pedidoId: pedido.id },
          "[AbacatePay] Pedido mudou durante a cobrança; nada foi registrado: conciliar",
        );
        throw new ConflictProblem(
          "O pedido mudou enquanto a cobrança era criada. Atualize seus pedidos antes de pagar."
        );
      }

      // O total segue como o DECIMAL que o banco devolveu, sem passar por float.
      await conexao.query(
        "INSERT INTO pagamentos (pedido_id, metodo, status, valor, referencia_externa) VALUES ($1, 'pix', 'pendente', $2, $3)",
        [pedido.id, pedido.total, billingId]
      );
    }, { traceId });
  } catch (err) {
    // O ROLLBACK, e o descarte da conexão se ele falhar, ficam com emTransacao.
    // Aqui só se registra o que a conciliação precisa, inclusive quando nem a
    // conexão foi obtida.
    if (!(err instanceof ConflictProblem)) {
      logger.error(
        { err, traceId, requestId: traceId, billingId, pedidoId: pedido.id },
        "[AbacatePay] Cobrança criada no gateway, mas não registrada no pedido: conciliar",
      );
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────
//   LISTAR PAGAMENTOS
//   GET /api/payments  (apenas staff)
// ─────────────────────────────────────────────────────────
export async function getPayments(req: Request, res: Response) {
  const page = parseInt(String(req.query.page || "")) || 1;
  const limit = parseInt(String(req.query.limit || "")) || 20;
  const offset = (page - 1) * limit;

  const countRes = await pool.query(`SELECT COUNT(*) FROM pagamentos`);
  const totalCount = parseInt(countRes.rows[0].count);

  const { rows } = await pool.query(
    `SELECT
      pg.id,
      pg.pedido_id,
      pg.metodo,
      pg.status,
      pg.valor,
      pg.referencia_externa AS "referenciaExterna",
      pg.criado_em          AS "criadoEm",
      pd.customer_name      AS "clienteNome",
      pd.customer_email     AS "clienteEmail"
     FROM pagamentos pg
     INNER JOIN pedidos pd ON pd.id = pg.pedido_id
     ORDER BY pg.criado_em DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return res.json({
    pagamentos: rows,
    pagination: {
      page,
      limit,
      totalItems: totalCount,
      totalPages: Math.ceil(totalCount / limit)
    }
  });
}

// ─────────────────────────────────────────────────────────
//   CONFIRMAR PAGAMENTO (webhook do AbacatePay)
//   POST /api/payments/webhook
//
//   SEC-04: contrato oficial v2. Autenticação pelo segredo privado da
//   URL E integridade por HMAC base64 do corpo cru, com chave pública.
// ─────────────────────────────────────────────────────────
export async function handleWebhook(req: Request, res: Response) {
  const payload = req.body as { event?: string; devMode?: boolean; data?: { checkout?: { id?: unknown; status?: unknown } } } | null;
  const assinatura = req.headers["x-webhook-signature"];

  if (
    !textoSecretoIgual(req.query.webhookSecret, getWebhookSecret()) ||
    !assinaturaWebhookValida(req.rawBody, assinatura)
  ) {
    logger.warn(
      {
        traceId: req.requestId,
        requestId: req.requestId,
        temAssinatura: Boolean(assinatura),
      },
      "[Webhook] Requisição rejeitada: assinatura ausente ou inválida",
    );
    throw new UnauthorizedProblem("Assinatura do webhook inválida.");
  }

  const checkout = payload?.data?.checkout;
  if (payload?.event === "checkout.completed" && checkout?.status === "PAID" &&
      typeof checkout.id === "string" && checkout.id.trim() &&
      (env.NODE_ENV !== "production" || payload.devMode === false)) {
    const billingId = checkout.id;
    const processados = await emTransacao(async (client) => {
      // Guardar a transição torna reentregas inofensivas, inclusive após entrega.
      const { rows } = await client.query<{ id: number }>(
        `UPDATE pedidos SET status = 'Queued'
          WHERE abacate_billing_id = $1 AND pagamento_simulado = false
            AND status = 'Pending Payment' RETURNING id`, [billingId]);
      const ids = rows.map(pedido => pedido.id);
      await client.query(
        `UPDATE pagamentos SET status = 'aprovado'
          WHERE referencia_externa = $1 AND pedido_id = ANY($2::int[])`, [billingId, ids]);
      await client.query(
        `INSERT INTO pagamentos (pedido_id, metodo, status, valor, referencia_externa)
         SELECT pe.id, 'pix', 'aprovado', pe.total, $1::varchar FROM pedidos pe
          WHERE pe.id = ANY($2::int[])
            AND NOT EXISTS (SELECT 1 FROM pagamentos pg
                             WHERE pg.pedido_id = pe.id AND pg.referencia_externa = $1)`, [billingId, ids]);
      return ids.length;
    }, { traceId: req.requestId });
    logger.info({ traceId: req.requestId, pedidos: processados }, "[Webhook] Pagamento processado.");
  }

  return res.status(200).json({ received: true });
}

// ─────────────────────────────────────────────────────────
//   PÁGINA DE CHECKOUT SIMULADO (visual Pix)
//   GET /api/payments/simulated-checkout
// ─────────────────────────────────────────────────────────
export async function getSimulatedCheckoutPage(req: Request, res: Response) {
  const { billingId } = req.query;
  res.set("Cache-Control", "private, no-store");

  // API-04: erros em Problem Details. SEC-03: só o dono autenticado vê a cobrança.
  if (typeof billingId !== "string" || !billingId.trim()) {
    throw new BadRequestProblem("billingId ausente.");
  }

  const { rows: orders } = await pool.query(
    "SELECT * FROM pedidos WHERE abacate_billing_id = $1 AND usuario_id = $2 AND pagamento_simulado = true",
    [billingId, req.user!.id]
  );

  if (orders.length === 0) {
    throw new NotFoundProblem("Nenhum pedido encontrado para essa cobrança.");
  }

  try {

    const totalAmount    = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const customerName   = orders[0].customer_name;
    const customerEmail  = orders[0].customer_email;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>AbacatePay Simulator | Opticus</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#0d1117; --card:rgba(22,27,34,.7); --border:rgba(240,246,252,.1); --green:#22c55e; --text:#f0f6fc; --gray:#8b949e; }
    body { background:var(--bg); color:var(--text); font-family:'Outfit',sans-serif; margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .box { background:var(--card); border:1px solid var(--border); backdrop-filter:blur(16px); border-radius:12px; padding:40px; max-width:460px; width:90%; text-align:center; }
    .logo { font-size:22px; font-weight:700; letter-spacing:2px; margin-bottom:20px; }
    .amount { font-size:32px; font-weight:700; color:var(--green); margin:15px 0; }
    .detail-row { display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px; }
    .detail-row span { color:var(--gray); }
    .order-details { border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:15px 0; margin:20px 0; text-align:left; }
    .qr-box { background:#fff; padding:15px; border-radius:10px; display:inline-block; margin:15px 0; }
    .qr { width:180px; height:180px; background-image:repeating-linear-gradient(45deg,#000 0,#000 2px,transparent 2px,transparent 10px),repeating-linear-gradient(-45deg,#000 0,#000 2px,#fff 2px,#fff 10px); border:4px solid #fff; }
    .hint { font-size:12px; color:var(--gray); margin-bottom:20px; line-height:1.4; }
    .btn { background:var(--green); color:#fff; border:none; padding:14px; font-size:16px; font-weight:600; border-radius:6px; cursor:pointer; width:100%; text-transform:uppercase; }
    .btn:hover { opacity:.9; }
  </style>
</head>
<body>
  <div class="box">
    <div class="logo">ABACATEPAY <span style="font-weight:300;color:#22c55e">SIMULATOR</span></div>
    <h2 style="margin:0 0 5px">Opticus Eyewear</h2>
    <div class="amount">R$ ${Number(totalAmount).toFixed(2)}</div>
    <div class="qr-box"><div class="qr"></div></div>
    <p class="hint">Aponte o celular para o QR Code ou confirme o pagamento simulado pela loja.</p>
    <div class="order-details">
      <h4 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;color:#22c55e">Itens:</h4>
      ${orders.map(o => `
        <div class="detail-row">
          <span>${escapeHTML(o.product_name)}:</span>
          <strong>R$ ${Number(o.total).toFixed(2)}</strong>
        </div>
      `).join("")}
      <div class="detail-row"><span>Cobrança:</span><strong style="font-size:11px;color:#8b949e">${escapeHTML(billingId)}</strong></div>
      <div class="detail-row"><span>Cliente:</span><strong>${escapeHTML(customerName)} (${escapeHTML(customerEmail)})</strong></div>
    </div>
  </div>
</body>
</html>`;

    return res.send(html);

  } catch (err) {
    logger.error({ err, traceId: req.requestId, requestId: req.requestId }, "Erro no checkout simulado");
    return res.status(500).send("<h3>Falha ao carregar checkout.</h3>");
  }
}

// ─────────────────────────────────────────────────────────
//   CONFIRMAR PAGAMENTO SIMULADO
//   POST /api/payments/confirm-simulated-payment
//
//   SEC-01: exige autenticação (protect) e autorização de dono na
//   própria escrita. O usuário vem exclusivamente do token; nunca do
//   corpo. Pedido e pagamento são alterados na mesma transação.
// ─────────────────────────────────────────────────────────
export async function confirmSimulatedPayment(req: Request, res: Response) {
  const { billingId } = req.body as { billingId?: unknown };

  if (typeof billingId !== "string" || !billingId.trim()) {
    throw new BadRequestProblem("billingId ausente.");
  }

  // A identidade vem exclusivamente do token validado por `protect`.
  const usuarioId = req.user!.id;

  await emTransacao(async (client) => {
    // Autorização na cláusula WHERE: só o dono, e só enquanto o pedido
    // ainda está em "Pending Payment". rowCount 0 agrupa inexistente,
    // de outro dono e já processado — todos respondem o mesmo 404, sem
    // oráculo de existência/estado.
    const { rowCount, rows } = await client.query<{ id: number }>(
      `UPDATE pedidos
          SET status = 'Queued'
        WHERE abacate_billing_id = $1
          AND usuario_id = $2
          AND pagamento_simulado = true
          AND status = 'Pending Payment'
      RETURNING id`,
      [billingId, usuarioId]
    );

    if (rowCount === 0) {
      throw new NotFoundProblem("Nenhum pedido elegível encontrado para essa cobrança.");
    }

    const pedidosConfirmados = rows.map(pedido => pedido.id);
    // Apenas os pedidos efetivamente autorizados e alterados nesta transação.
    await client.query(
      `UPDATE pagamentos pg
          SET status = 'aprovado'
         FROM pedidos pe
        WHERE pg.pedido_id = pe.id
          AND pg.referencia_externa = $1
          AND pe.id = ANY($2::int[])`,
      [billingId, pedidosConfirmados]
    );

    // O carrinho simulado não possui necessariamente uma linha prévia.
    await client.query(
      `INSERT INTO pagamentos (pedido_id, metodo, status, valor, referencia_externa)
       SELECT pe.id, 'pix', 'aprovado', pe.total, $1::varchar FROM pedidos pe
        WHERE pe.id = ANY($2::int[])
          AND NOT EXISTS (SELECT 1 FROM pagamentos pg
                           WHERE pg.pedido_id = pe.id AND pg.referencia_externa = $1)`,
      [billingId, pedidosConfirmados]
    );
  }, { traceId: req.requestId });

  return res.json({ status: "confirmed", billingId });
}
