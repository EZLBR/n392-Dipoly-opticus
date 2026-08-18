// ============================================================
//   STOCK CONTROLLER — Gerenciamento de Estoque
//   Rotas: /api/stock
// ============================================================

import pool from "../config/db.js";

// ─────────────────────────────────────────────────────────
//   LISTAR TODO O ESTOQUE
//   GET /api/stock
// ─────────────────────────────────────────────────────────
export async function getAllStock(req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;

  try {
    const countRes = await pool.query(`SELECT COUNT(*) FROM estoque e INNER JOIN produtos p ON p.id = e.produto_id WHERE p.ativo = TRUE`);
    const totalCount = parseInt(countRes.rows[0].count);

    const { rows } = await pool.query(
      `SELECT
        e.id,
        e.produto_id,
        p.nome          AS produto_nome,
        p.preco         AS produto_preco,
        c.nome          AS categoria_nome,
        e.quantidade,
        e.estoque_minimo,
        e.atualizado_em,
        -- Flag de alerta: estoque abaixo do mínimo
        (e.quantidade <= e.estoque_minimo) AS alerta_baixo_estoque
       FROM estoque e
       INNER JOIN produtos p ON p.id = e.produto_id
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.ativo = TRUE
       ORDER BY e.quantidade ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Separa os produtos com estoque crítico (desta página)
    const alertas = rows.filter(r => r.alerta_baixo_estoque);

    return res.json({
      success:  true,
      estoque:  rows,
      alertas:  alertas.length,
      produtos_criticos: alertas.map(r => r.produto_nome),
      pagination: {
        page,
        limit,
        totalItems: totalCount,
        totalPages: Math.ceil(totalCount / limit)
      }
    });

  } catch (err) {
    console.error("Erro ao listar estoque:", err);
    return res.status(500).json({ success: false, error: "Falha ao carregar estoque." });
  }
}

// ─────────────────────────────────────────────────────────
//   BUSCAR ESTOQUE DE UM PRODUTO
//   GET /api/stock/product/:produtoId
// ─────────────────────────────────────────────────────────
export async function getStockByProduct(req, res) {
  const { produtoId } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT e.*, p.nome AS produto_nome, p.preco
       FROM estoque e
       INNER JOIN produtos p ON p.id = e.produto_id
       WHERE e.produto_id = $1`,
      [produtoId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Estoque não encontrado para esse produto." });
    }

    const item = rows[0];

    return res.json({
      success: true,
      estoque: item,
      alerta:  item.quantidade <= item.estoque_minimo
    });

  } catch (err) {
    console.error("Erro ao buscar estoque:", err);
    return res.status(500).json({ success: false, error: "Falha ao buscar estoque." });
  }
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR ESTOQUE
//   PUT /api/stock/:produtoId
//   Body: { quantidade, estoque_minimo, operacao }
//   operacao: 'set' (define valor) | 'add' (adiciona) | 'subtract' (subtrai)
// ─────────────────────────────────────────────────────────
export async function updateStock(req, res) {
  const { produtoId } = req.params;
  const { quantidade, estoque_minimo, operacao = "set" } = req.body;

  if (quantidade === undefined || quantidade === null) {
    return res.status(400).json({ success: false, error: "Quantidade é obrigatória." });
  }

  if (!["set", "add", "subtract"].includes(operacao)) {
    return res.status(400).json({
      success: false,
      error: "Operação inválida. Use: set, add ou subtract."
    });
  }

  try {
    // Busca estoque atual
    const { rows: current } = await pool.query(
      "SELECT quantidade FROM estoque WHERE produto_id = $1",
      [produtoId]
    );

    if (current.length === 0) {
      return res.status(404).json({ success: false, error: "Produto não encontrado no estoque." });
    }

    let novaQtd;
    const qtdAtual = current[0].quantidade;

    switch (operacao) {
      case "set":
        novaQtd = Number(quantidade);
        break;
      case "add":
        novaQtd = qtdAtual + Number(quantidade);
        break;
      case "subtract":
        novaQtd = qtdAtual - Number(quantidade);
        // Impede estoque negativo
        if (novaQtd < 0) {
          return res.status(400).json({
            success: false,
            error: `Estoque insuficiente. Disponível: ${qtdAtual} unidades.`
          });
        }
        break;
    }

    // Atualiza o estoque
    let setClause = "quantidade = $1";
    const updateParams = [novaQtd];

    if (estoque_minimo !== undefined) {
      setClause += ", estoque_minimo = $2";
      updateParams.push(Number(estoque_minimo));
    }

    await pool.query(
      `UPDATE estoque SET ${setClause} WHERE produto_id = $${updateParams.length + 1}`,
      [...updateParams, produtoId]
    );

    // Retorna o estoque atualizado
    const { rows: updated } = await pool.query(
      `SELECT e.*, p.nome AS produto_nome
       FROM estoque e
       INNER JOIN produtos p ON p.id = e.produto_id
       WHERE e.produto_id = $1`,
      [produtoId]
    );

    const item = updated[0];
    const alerta = item.quantidade <= item.estoque_minimo;

    return res.json({
      success: true,
      estoque: item,
      alerta,
      message: alerta
        ? `⚠️ Atenção: estoque baixo! ${item.quantidade} unidades (mínimo: ${item.estoque_minimo})`
        : `Estoque atualizado: ${item.quantidade} unidades disponíveis.`
    });

  } catch (err) {
    console.error("Erro ao atualizar estoque:", err);
    return res.status(500).json({ success: false, error: "Falha ao atualizar estoque." });
  }
}

// ─────────────────────────────────────────────────────────
//   ALERTAS DE ESTOQUE BAIXO
//   GET /api/stock/alerts
// ─────────────────────────────────────────────────────────
export async function getStockAlerts(req, res) {
  try {
    const { rows } = await pool.query(
      `SELECT
        e.produto_id,
        p.nome         AS produto_nome,
        e.quantidade,
        e.estoque_minimo,
        (e.estoque_minimo - e.quantidade) AS deficit
       FROM estoque e
       INNER JOIN produtos p ON p.id = e.produto_id
       WHERE e.quantidade <= e.estoque_minimo AND p.ativo = TRUE
       ORDER BY deficit DESC`
    );

    return res.json({
      success: true,
      alertas: rows,
      total:   rows.length
    });

  } catch (err) {
    console.error("Erro ao buscar alertas:", err);
    return res.status(500).json({ success: false, error: "Falha ao verificar alertas de estoque." });
  }
}
