// ============================================================
//   PAYMENT CONTROLLER
//   Integração com AbacatePay + registro de pagamentos
//   Migrado para PostgreSQL (pg, $1)
// ============================================================

import pool from "../config/db.js";
import crypto from "crypto";

// Security Helper
const escapeHTML = (str) => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const ABACATE_TOKEN = process.env.ABACATE_TOKEN;
const PORT          = process.env.PORT || 5000;

// ─────────────────────────────────────────────────────────
//   CRIAR COBRANÇA (AbacatePay ou simulador)
//   POST /api/payments/create-billing
// ─────────────────────────────────────────────────────────
export async function createBilling(req, res) {
  const { orderId } = req.body;

  if (!orderId) {
    return res.status(400).json({ success: false, error: "Informe o orderId." });
  }

  try {
    const { rows } = await pool.query("SELECT * FROM pedidos WHERE id = $1", [orderId]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Pedido não encontrado." });
    }

    const order = rows[0];

    // Security Fix: Verificar ownership
    if (order.usuario_id !== req.user.id && req.user.role !== "staff") {
      return res.status(403).json({ success: false, error: "Acesso negado: Este pedido pertence a outro usuário." });
    }
    const amountInCents   = Math.round(Number(order.total) * 100);
    const isMockToken     = !ABACATE_TOKEN || ABACATE_TOKEN.includes("your_abacatepay_token_here");
    const frontendOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:5173`);
    const backendProto = req.headers['x-forwarded-proto'] || req.protocol;
    const backendOrigin = `${backendProto}://${req.get("host")}`;

    if (isMockToken) {
      const mockBillingId  = `bill-sim-${Math.floor(100000 + Math.random() * 900000)}`;

      await pool.query(
        "UPDATE pedidos SET abacate_billing_id = $1, status = 'Pending Payment' WHERE id = $2",
        [mockBillingId, orderId]
      );

      const mockCheckoutUrl = `${backendOrigin}/api/payments/simulated-checkout?billingId=${mockBillingId}&orderId=${orderId}&returnTo=${encodeURIComponent(frontendOrigin)}`;

      return res.json({ success: true, checkoutUrl: mockCheckoutUrl, isSimulated: true });
    }

    const abacateResponse = await fetch("https://api.abacatepay.com/v2/billing", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${ABACATE_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        frequency:     "ONE_TIME",
        methods:       ["PIX"],
        products:      [{ externalId: String(order.id), name: order.product_name, quantity: 1, price: amountInCents }],
        returnUrl:     `${frontendOrigin}/`,
        completionUrl: `${frontendOrigin}/`,
        customer:      { name: order.customer_name, email: order.customer_email, taxId: "00000000000" }
      })
    });

    const abacateData = await abacateResponse.json();

    if (!abacateResponse.ok || !abacateData.success) {
      throw new Error(abacateData.error || `HTTP ${abacateResponse.status}`);
    }

    const realBillingId   = abacateData.data.id;
    const realCheckoutUrl = abacateData.data.url;

    await pool.query(
      "UPDATE pedidos SET abacate_billing_id = $1, status = 'Pending Payment' WHERE id = $2",
      [realBillingId, orderId]
    );

    await _registrarPagamento(orderId, "pix", "pendente", Number(order.total), realBillingId);

    return res.json({ success: true, checkoutUrl: realCheckoutUrl, isSimulated: false });

  } catch (err) {
    console.error("Erro no AbacatePay:", err.message);

    const fallbackId  = `bill-fallback-${Math.floor(100000 + Math.random() * 900000)}`;

    await pool.query(
      "UPDATE pedidos SET abacate_billing_id = $1, status = 'Pending Payment' WHERE id = $2",
      [fallbackId, orderId]
    );

    const frontendOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:5173`);
    const backendProto = req.headers['x-forwarded-proto'] || req.protocol;
    const backendOrigin = `${backendProto}://${req.get("host")}`;
    const fallbackUrl = `${backendOrigin}/api/payments/simulated-checkout?billingId=${fallbackId}&orderId=${orderId}&returnTo=${encodeURIComponent(frontendOrigin)}`;

    return res.json({ success: true, checkoutUrl: fallbackUrl, isSimulated: true, notice: "Fallback para simulador." });
  }
}

// ─────────────────────────────────────────────────────────
//   HELPER INTERNO: Registra pagamento na tabela pagamentos
// ─────────────────────────────────────────────────────────
async function _registrarPagamento(pedidoId, metodo, status, valor, referenciaExterna) {
  try {
    await pool.query(
      "INSERT INTO pagamentos (pedido_id, metodo, status, valor, referencia_externa) VALUES ($1, $2, $3, $4, $5)",
      [pedidoId, metodo, status, valor, referenciaExterna]
    );
  } catch (err) {
    console.error("Erro ao registrar pagamento:", err.message);
  }
}

// ─────────────────────────────────────────────────────────
//   LISTAR PAGAMENTOS
//   GET /api/payments  (apenas staff)
// ─────────────────────────────────────────────────────────
export async function getPayments(req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
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
      success: true,
      pagamentos: rows,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (err) {
    console.error("Erro ao listar pagamentos:", err);
    return res.status(500).json({ success: false, error: "Falha ao carregar pagamentos." });
  }
}

// ─────────────────────────────────────────────────────────
//   CONFIRMAR PAGAMENTO (webhook do AbacatePay)
//   POST /api/payments/webhook
// ─────────────────────────────────────────────────────────
export async function handleWebhook(req, res) {
  const payload = req.body;
  console.log("[Webhook] Payload recebido:", JSON.stringify(payload));

  const payloadString = JSON.stringify(req.body);
  const signature = req.headers["x-abacatepay-signature"];

  if (ABACATE_TOKEN && !ABACATE_TOKEN.includes("your_abacatepay")) {
    if (!signature) {
      return res.status(401).json({ success: false, error: "Assinatura ausente" });
    }
    const expected = crypto.createHmac("sha256", ABACATE_TOKEN).update(payloadString).digest("hex");
    if (signature !== expected) {
      console.warn("[Webhook] Assinatura inválida");
      return res.status(401).json({ success: false, error: "Assinatura inválida" });
    }
  }

  try {
    if (payload.event === "billing.paid" && payload.data?.id) {
      const billingId = payload.data.id;

      const { rows } = await pool.query(
        "SELECT id FROM pedidos WHERE abacate_billing_id = $1",
        [billingId]
      );

      if (rows.length > 0) {
        await pool.query(
          "UPDATE pedidos SET status = 'Queued' WHERE abacate_billing_id = $1",
          [billingId]
        );

        await pool.query(
          "UPDATE pagamentos SET status = 'aprovado' WHERE referencia_externa = $1",
          [billingId]
        );

        console.log(`[Webhook] Pagamento confirmado. ${rows.length} pedidos enviados para produção.`);
      }
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Erro no webhook:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────
//   PÁGINA DE CHECKOUT SIMULADO (visual Pix)
//   GET /api/payments/simulated-checkout
// ─────────────────────────────────────────────────────────
export async function getSimulatedCheckoutPage(req, res) {
  const { billingId, orderId, returnTo } = req.query;

  if (!billingId) {
    return res.status(400).send("<h3>billingId ausente.</h3>");
  }

  try {
    const { rows: orders } = await pool.query(
      "SELECT * FROM pedidos WHERE abacate_billing_id = $1",
      [billingId]
    );

    if (orders.length === 0) {
      return res.status(404).send("<h3>Nenhum pedido encontrado para essa cobrança.</h3>");
    }

    const totalAmount    = orders.reduce((sum, o) => sum + Number(o.total), 0);
    const customerName   = orders[0].customer_name;
    const customerEmail  = orders[0].customer_email;
    const backendProto = req.headers['x-forwarded-proto'] || req.protocol;
    const backendOrigin = `${backendProto}://${req.get("host")}`;

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
    <p class="hint">Aponte o celular para o QR Code ou simule o pagamento clicando abaixo.</p>
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
    <form action="${backendOrigin}/api/payments/confirm-simulated-payment" method="POST">
      <input type="hidden" name="billingId" value="${escapeHTML(billingId)}" />
      <input type="hidden" name="returnTo" value="${escapeHTML(returnTo || 'http://localhost:5173')}" />
      <button type="submit" class="btn">Simular Pagamento Pix</button>
    </form>
  </div>
</body>
</html>`;

    return res.send(html);

  } catch (err) {
    console.error("Erro no checkout simulado:", err);
    return res.status(500).send("<h3>Falha ao carregar checkout.</h3>");
  }
}

// ─────────────────────────────────────────────────────────
//   CONFIRMAR PAGAMENTO SIMULADO
//   POST /api/payments/confirm-simulated-payment
// ─────────────────────────────────────────────────────────
export async function confirmSimulatedPayment(req, res) {
  const { billingId, returnTo } = req.body;

  if (!billingId) {
    return res.status(400).send("<h3>billingId ausente.</h3>");
  }

  try {
    await pool.query(
      "UPDATE pedidos SET status = 'Queued' WHERE abacate_billing_id = $1",
      [billingId]
    );

    await pool.query(
      "UPDATE pagamentos SET status = 'aprovado' WHERE referencia_externa = $1",
      [billingId]
    );

    let redirectUrl = "http://localhost:5173/?payment=success";
    if (returnTo) {
      try {
        const url = new URL(returnTo);
        const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
        const allowedHosts = ["localhost", new URL(FRONTEND_URL).hostname];

        if (allowedHosts.includes(url.hostname) || url.hostname.endsWith('.vercel.app')) {
          redirectUrl = `${returnTo.replace(/\/$/, '')}/?payment=success`;
        } else {
          console.warn("[Security] Bloqueado open redirect para:", url.hostname);
        }
      } catch (e) {
        console.warn("Invalid returnTo URL");
      }
    }

    return res.redirect(redirectUrl);

  } catch (err) {
    console.error("Erro ao confirmar pagamento simulado:", err);
    return res.status(500).send("<h3>Falha na simulação de pagamento.</h3>");
  }
}
