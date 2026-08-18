// ============================================================
//   PRODUCT CONTROLLER — CRUD completo de Produtos
//   Rotas: /api/products
// ============================================================

import pool from "../config/db.js";

// ─────────────────────────────────────────────────────────
//   CRIAR PRODUTO
//   POST /api/products
//   Somente: staff ou factory
// ─────────────────────────────────────────────────────────
export async function createProduct(req, res) {
  const { nome, descricao, preco, categoria_id, imagem_url } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({
      success: false,
      error: "Nome e preço são obrigatórios."
    });
  }

  if (isNaN(preco) || Number(preco) <= 0) {
    return res.status(400).json({
      success: false,
      error: "Preço deve ser um número positivo."
    });
  }

  try {
    // 1. Insere o produto
    const { rows } = await pool.query(
      `INSERT INTO produtos (nome, descricao, preco, categoria_id, imagem_url, ativo)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id`,
      [
        nome.trim(),
        descricao || null,
        Number(preco),
        categoria_id || null,
        imagem_url || null
      ]
    );

    const produtoId = rows[0].id;

    // 2. Cria o registro de estoque automaticamente (começa em 0)
    await pool.query(
      "INSERT INTO estoque (produto_id, quantidade, estoque_minimo) VALUES ($1, 0, 5)",
      [produtoId]
    );

    // 3. Retorna o produto recém-criado
    const { rows: newRows } = await pool.query(
      `SELECT p.*, c.nome AS categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       WHERE p.id = $1`,
      [produtoId]
    );

    return res.status(201).json({ success: true, produto: newRows[0] });

  } catch (err) {
    console.error("Erro ao criar produto:", err);
    return res.status(500).json({ success: false, error: "Falha ao criar produto." });
  }
}

// ─────────────────────────────────────────────────────────
//   LISTAR PRODUTOS (com paginação e filtros)
//   GET /api/products?categoria_id=1&page=1&limit=10&search=aurora
// ─────────────────────────────────────────────────────────
export async function getProducts(req, res) {
  const { categoria_id, search, page = 1, limit = 20 } = req.query;
  // Garante que limit e offset são inteiros válidos
  const lim    = Math.max(1, Math.min(100, parseInt(limit,  10) || 20));
  const off    = Math.max(0, (parseInt(page, 10) - 1 || 0) * lim);

  try {
    // Monta a query dinamicamente baseado nos filtros
    let where = "WHERE p.ativo = TRUE";
    const params = [];

    if (categoria_id) {
      where += " AND p.categoria_id = $" + (params.length + 1);
      params.push(Number(categoria_id));
    }

    if (search) {
      // LIKE com ? protege contra SQL Injection
      where += " AND (p.nome ILIKE $" + (params.length + 1) + " OR p.descricao ILIKE $" + (params.length + 2) + ")";
      params.push(`%${search}%`, `%${search}%`);
    }

    // ⚠️  LIMIT e OFFSET são interpolados diretamente (não como ?)
    //     pois mysql2 prepared statements têm bugs com LIMIT/OFFSET
    //     como parâmetros em algumas versões do MySQL 8/9.
    //     São seguros pois já foram validados como inteiros acima.
    const { rows } = await pool.query(
      `SELECT
        p.id,
        p.nome,
        p.descricao,
        p.preco,
        p.categoria_id,
        c.nome      AS categoria_nome,
        p.imagem_url,
        p.ativo,
        p.criado_em,
        e.quantidade AS estoque_quantidade
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       LEFT JOIN estoque    e ON e.produto_id = p.id
       ${where}
       ORDER BY p.criado_em DESC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );

    // Total de registros para paginação no frontend
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) AS total FROM produtos p ${where}`,
      params
    );

    return res.json({
      success: true,
      produtos:   rows,
      total:      countRows[0].total,
      page:       parseInt(page, 10) || 1,
      totalPages: Math.ceil(countRows[0].total / lim)
    });

  } catch (err) {
    console.error("Erro ao listar produtos:", err);
    return res.status(500).json({ success: false, error: "Falha ao carregar produtos." });
  }
}

// ─────────────────────────────────────────────────────────
//   BUSCAR PRODUTO POR ID
//   GET /api/products/:id
// ─────────────────────────────────────────────────────────
export async function getProductById(req, res) {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT
        p.*,
        c.nome AS categoria_nome,
        e.quantidade     AS estoque_quantidade,
        e.estoque_minimo AS estoque_minimo
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
       LEFT JOIN estoque    e ON e.produto_id = p.id
       WHERE p.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Produto não encontrado." });
    }

    return res.json({ success: true, produto: rows[0] });

  } catch (err) {
    console.error("Erro ao buscar produto:", err);
    return res.status(500).json({ success: false, error: "Falha ao buscar produto." });
  }
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR PRODUTO
//   PUT /api/products/:id
// ─────────────────────────────────────────────────────────
export async function updateProduct(req, res) {
  const { id } = req.params;
  const { nome, descricao, preco, categoria_id, imagem_url, ativo } = req.body;

  if (!nome || preco === undefined) {
    return res.status(400).json({ success: false, error: "Nome e preço são obrigatórios." });
  }

  try {
    const result = await pool.query(
      `UPDATE produtos
       SET nome = $1, descricao = $2, preco = $3, categoria_id = $4, imagem_url = $5, ativo = $6
       WHERE id = $7`,
      [
        nome.trim(),
        descricao || null,
        Number(preco),
        categoria_id || null,
        imagem_url || null,
        ativo !== undefined ? Boolean(ativo) : true,
        id
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: "Produto não encontrado." });
    }

    // Retorna o produto atualizado
    const { rows } = await pool.query(
      "SELECT * FROM produtos WHERE id = $1",
      [id]
    );

    return res.json({ success: true, produto: rows[0] });

  } catch (err) {
    console.error("Erro ao atualizar produto:", err);
    return res.status(500).json({ success: false, error: "Falha ao atualizar produto." });
  }
}

// ─────────────────────────────────────────────────────────
//   DELETAR PRODUTO (soft delete — marca como inativo)
//   DELETE /api/products/:id
//   Usa soft delete para preservar histórico em pedidos
// ─────────────────────────────────────────────────────────
export async function deleteProduct(req, res) {
  const { id } = req.params;

  try {
    // Verifica se o produto existe
    const { rows } = await pool.query(
      "SELECT id FROM produtos WHERE id = $1",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: "Produto não encontrado." });
    }

    // Soft delete: apenas desativa o produto em vez de deletar
    // Isso preserva o histórico em pedidos_itens
    await pool.query(
      "UPDATE produtos SET ativo = FALSE WHERE id = $1",
      [id]
    );

    return res.json({
      success: true,
      message: "Produto desativado com sucesso. O histórico de pedidos foi preservado."
    });

  } catch (err) {
    console.error("Erro ao deletar produto:", err);
    return res.status(500).json({ success: false, error: "Falha ao remover produto." });
  }
}
