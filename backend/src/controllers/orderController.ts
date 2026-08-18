// ============================================================
//   ORDER CONTROLLER — Pedidos de óculos customizados
//   Migrado para PostgreSQL (pg, $1,$2)
// ============================================================

import pool from "../config/db.js";
import { sendOrderStatusEmail } from "../utils/emailService.js";

// ─────────────────────────────────────────────────────────
//   CRIAR PEDIDO
//   POST /api/orders
// ─────────────────────────────────────────────────────────
export async function createOrder(req, res) {
  // 🔐 Security Fix: 'status' is completely ignored from req.body to prevent payment bypass.
  const { productName, factoryId, factoryName, total, customSpecs } = req.body;

  if (!productName || !factoryId || !factoryName || !total || !customSpecs) {
    return res.status(400).json({
      success: false,
      error: "Forneça todos os parâmetros obrigatórios do pedido."
    });
  }

  const customerName  = req.user.name;
  const customerEmail = req.user.email;
  const usuarioId     = req.user.id;

  try {
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
        Number(total),
        JSON.stringify(customSpecs),
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

    return res.status(201).json({ success: true, order: pedido });

  } catch (err) {
    console.error("Erro ao criar pedido:", err);
    return res.status(500).json({ success: false, error: "Falha ao registrar pedido." });
  }
}

// ─────────────────────────────────────────────────────────
//   LISTAR PEDIDOS (baseado no role do usuário)
//   GET /api/orders
// ─────────────────────────────────────────────────────────
export async function getOrders(req, res) {
  const { role, email, id } = req.user;

  const selectFields = `
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
    DATE(criado_em)    AS "createdAt",
    DATE(atualizado_em) AS "updatedAt"
  `;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
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
      return res.status(403).json({ success: false, error: "Acesso não autorizado." });
    }

    const parsedRows = rows.map(r => ({
      ...r,
      customSpecs: r.customSpecs ? JSON.parse(r.customSpecs) : {}
    }));

    return res.json({
      success: true,
      orders: parsedRows,
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (err) {
    console.error("Erro ao buscar pedidos:", err);
    return res.status(500).json({ success: false, error: "Falha ao carregar pedidos." });
  }
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR STATUS DO PEDIDO
//   PUT /api/orders/:id/status
// ─────────────────────────────────────────────────────────
export async function updateOrderStatus(req, res) {
  const { id }     = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, error: "Informe o novo status." });
  }

  const validStatuses = ["Queued", "In production", "Delivered", "Pending Payment", "Cancelled"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ success: false, error: "Status inválido." });
  }

  try {
    if (req.user.role !== "factory" && req.user.role !== "staff") {
      return res.status(403).json({
        success: false,
        error: "Apenas fábricas e staff podem atualizar o status."
      });
    }

    if (req.user.role === "factory") {
      const { rows } = await pool.query(
        "SELECT factory_id FROM pedidos WHERE id = $1",
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, error: "Pedido não encontrado." });
      }

      if (rows[0].factory_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: "Pedido pertence a outra fábrica."
        });
      }
    }

    const { rowCount } = await pool.query(
      "UPDATE pedidos SET status = $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2",
      [status, id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: "Pedido não encontrado." });
    }

    const { rows: updated } = await pool.query("SELECT * FROM pedidos WHERE id = $1", [id]);
    if (updated.length > 0) {
      sendOrderStatusEmail(updated[0], status);
    }

    return res.json({
      success: true,
      message: `Status do pedido atualizado para "${status}" com sucesso.`
    });

  } catch (err) {
    console.error("Erro ao atualizar status:", err);
    return res.status(500).json({ success: false, error: "Falha ao atualizar status." });
  }
}

// ─────────────────────────────────────────────────────────
//   CHECKOUT DO CARRINHO
//   POST /api/orders/checkout-cart
// ─────────────────────────────────────────────────────────
export async function checkoutCart(req, res) {
  const { cartItems } = req.body;

  if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Forneça um array cartItems não vazio."
    });
  }

  const customerName  = req.user.name;
  const customerEmail = req.user.email;
  const usuarioId     = req.user.id;
  const consolidatedBillingId = `bill-sim-${Math.floor(100000 + Math.random() * 900000)}`;

  const client = await pool.connect();
  let createdOrders = [];
  try {
    await client.query("BEGIN");
    let finalFactoryIdCache = null;

    for (const item of cartItems) {
      const { productName, factoryId, factoryName, total, customSpecs, quantity } = item;

      if (!productName || !factoryId || !factoryName || !total || !customSpecs) {
        throw new Error("Parâmetros faltando em um dos itens do carrinho.");
      }

      const specsWithQty    = { ...customSpecs, quantity: quantity || 1 };
      const orderTotal      = Number(total) * (quantity || 1);

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
          orderTotal,
          JSON.stringify(specsWithQty),
          consolidatedBillingId
        ]
      );

      createdOrders.push({
        id: result[0].id,
        productName,
        total: orderTotal,
        factoryId,
        factoryName
      });
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    client.release();
    return res.status(400).json({ success: false, error: err.message });
  }
  client.release();

    const frontendOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:5173`);
    const backendProto = req.headers['x-forwarded-proto'] || req.protocol;
    const backendOrigin = `${backendProto}://${req.get("host")}`;

    const ABACATE_TOKEN = process.env.ABACATE_TOKEN;
    const isMockToken   = !ABACATE_TOKEN || ABACATE_TOKEN.includes("your_abacatepay_token_here");

    if (!isMockToken) {
      try {
        const totalAmountInCents = createdOrders.reduce(
          (sum, ord) => sum + Math.round(ord.total * 100), 0
        );

        const abacateProducts = cartItems.map((item, idx) => ({
          externalId: String(createdOrders[idx].id),
          name:       item.productName,
          quantity:   item.quantity || 1,
          price:      Math.round(Number(item.total) * 100)
        }));

        const abacateResponse = await fetch("https://api.abacatepay.com/v2/billing", {
          method:  "POST",
          headers: {
            Authorization:  `Bearer ${ABACATE_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            frequency:     "ONE_TIME",
            methods:       ["PIX"],
            products:      abacateProducts,
            returnUrl:     `${frontendOrigin}/`,
            completionUrl: `${frontendOrigin}/`,
            customer:      { name: customerName, email: customerEmail, taxId: "00000000000" }
          })
        });

        const abacateData = await abacateResponse.json();

        if (abacateResponse.ok && abacateData.success) {
          const realBillingId  = abacateData.data.id;
          const realCheckoutUrl = abacateData.data.url;

          await pool.query(
            "UPDATE pedidos SET abacate_billing_id = $1 WHERE abacate_billing_id = $2",
            [realBillingId, consolidatedBillingId]
          );

          return res.json({
            success:     true,
            checkoutUrl: realCheckoutUrl,
            isSimulated: false,
            billingId:   realBillingId
          });
        }
      } catch (err) {
        console.error("[AbacatePay] Erro, usando simulador:", err.message);
      }
    }

    const simulatedCheckoutUrl = `${backendOrigin}/api/payments/simulated-checkout?billingId=${consolidatedBillingId}&returnTo=${encodeURIComponent(frontendOrigin)}`;

    return res.json({
      success:     true,
      checkoutUrl: simulatedCheckoutUrl,
      isSimulated: true,
      billingId:   consolidatedBillingId
    });

}
