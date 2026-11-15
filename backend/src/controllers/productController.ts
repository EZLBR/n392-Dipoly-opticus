// ============================================================
//   PRODUCT CONTROLLER — CRUD completo de Produtos
//   Rotas: /api/products
//
//   ID-02: as rotas recebem o publicId (UUID) do produto, a categoria é
//   informada por categoriaPublicId e nenhuma resposta serializa ids
//   inteiros. Os publicIds são resolvidos na própria consulta.
// ============================================================

import pool from "../config/db.js";
import type { Request, Response } from "express";
import { BadRequestProblem, NotFoundProblem } from "../errors/problem.js";
import type { CreateProductDTO, UpdateProductDTO } from "../dtos/product/product.dto.js";

/** Colunas públicas de um produto (alias p), com categoria (c) e estoque (e). */
const CAMPOS_PRODUTO = `
  p."publicId",
  p.nome,
  p.descricao,
  p.preco,
  c."publicId"     AS "categoriaPublicId",
  c.nome           AS categoria_nome,
  p.imagem_url,
  p.ativo,
  p.criado_em,
  e.quantidade     AS estoque_quantidade`;

const JUNCOES_PRODUTO = `
  LEFT JOIN categorias c ON c.id = p.categoria_id
  LEFT JOIN estoque    e ON e.produto_id = p.id`;

/** Categoria informada pelo publicId; NULL quando nenhuma foi enviada. */
const CATEGORIA_INFORMADA = (parametro: string) =>
  `categoria AS (SELECT id FROM categorias WHERE "publicId" = ${parametro}::text)`;
const CATEGORIA_VALIDA = (parametro: string) =>
  `(${parametro}::text IS NULL OR EXISTS (SELECT 1 FROM categoria))`;

async function buscarProduto(publicId: string) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PRODUTO}, e.estoque_minimo AS estoque_minimo
       FROM produtos p ${JUNCOES_PRODUTO}
      WHERE p."publicId" = $1`,
    [publicId]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────
//   CRIAR PRODUTO
//   POST /api/products
//   Somente: staff
// ─────────────────────────────────────────────────────────
export async function createProduct(req: Request, res: Response) {
  const { nome, descricao, preco, categoriaPublicId, imagem_url } = req.body as CreateProductDTO;

  // 1. Insere o produto. Uma categoria inexistente não insere nada.
  const { rows } = await pool.query<{ id: number; publicId: string }>(
    `WITH ${CATEGORIA_INFORMADA("$4")}
     INSERT INTO produtos (nome, descricao, preco, categoria_id, imagem_url, ativo)
     SELECT $1, $2, $3, (SELECT id FROM categoria), $5, TRUE
      WHERE ${CATEGORIA_VALIDA("$4")}
     RETURNING id, "publicId"`,
    [
      nome.trim(),
      descricao || null,
      Number(preco),
      categoriaPublicId || null,
      imagem_url || null
    ]
  );

  if (rows.length === 0) {
    throw new BadRequestProblem("Categoria não encontrada.");
  }

  // 2. Cria o registro de estoque automaticamente (começa em 0). O id
  //    interno fica só aqui, entre as duas escritas.
  await pool.query(
    "INSERT INTO estoque (produto_id, quantidade, estoque_minimo) VALUES ($1, 0, 5)",
    [rows[0].id]
  );

  // 3. Retorna o produto recém-criado
  return res.status(201).json(await buscarProduto(rows[0].publicId));
}

// ─────────────────────────────────────────────────────────
//   LISTAR PRODUTOS (com paginação e filtros)
//   GET /api/products?categoriaPublicId=<uuid>&page=1&limit=10&search=aurora
// ─────────────────────────────────────────────────────────
export async function getProducts(req: Request, res: Response) {
  const { categoriaPublicId, search, page = 1, limit = 20 } = req.query;
  // Garante que limit e offset são inteiros válidos
  const lim    = Math.max(1, Math.min(100, parseInt(String(limit),  10) || 20));
  const off    = Math.max(0, (parseInt(String(page), 10) - 1 || 0) * lim);

  // Monta a query dinamicamente baseado nos filtros
  let where = "WHERE p.ativo = TRUE";
  const params: unknown[] = [];

  if (categoriaPublicId) {
    where += ` AND c."publicId" = $` + (params.length + 1);
    params.push(String(categoriaPublicId));
  }

  if (search) {
    where += " AND (p.nome ILIKE $" + (params.length + 1) + " OR p.descricao ILIKE $" + (params.length + 2) + ")";
    params.push(`%${search}%`, `%${search}%`);
  }

  // LIMIT e OFFSET são interpolados diretamente, já validados como inteiros acima.
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_PRODUTO}
     FROM produtos p ${JUNCOES_PRODUTO}
     ${where}
     ORDER BY p.criado_em DESC
     LIMIT ${lim} OFFSET ${off}`,
    params
  );

  // Total de registros para paginação no frontend
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS total
       FROM produtos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
     ${where}`,
    params
  );

  return res.json({
    produtos:   rows,
    total:      countRows[0].total,
    page:       parseInt(String(page), 10) || 1,
    totalPages: Math.ceil(countRows[0].total / lim)
  });
}

// ─────────────────────────────────────────────────────────
//   BUSCAR PRODUTO POR PUBLIC ID
//   GET /api/products/:publicId
// ─────────────────────────────────────────────────────────
export async function getProductById(req: Request, res: Response) {
  const produto = await buscarProduto(String(req.params.publicId));

  if (!produto) {
    throw new NotFoundProblem("Produto não encontrado.");
  }

  return res.json(produto);
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR PRODUTO
//   PUT /api/products/:publicId
// ─────────────────────────────────────────────────────────
export async function updateProduct(req: Request, res: Response) {
  const publicId = String(req.params.publicId);
  const { nome, descricao, preco, categoriaPublicId, imagem_url, ativo } = req.body as UpdateProductDTO;

  const { rowCount } = await pool.query(
    `WITH ${CATEGORIA_INFORMADA("$4")}
     UPDATE produtos
        SET nome = $1, descricao = $2, preco = $3, categoria_id = (SELECT id FROM categoria),
            imagem_url = $5, ativo = $6
      WHERE "publicId" = $7 AND ${CATEGORIA_VALIDA("$4")}`,
    [
      nome.trim(),
      descricao || null,
      Number(preco),
      categoriaPublicId || null,
      imagem_url || null,
      ativo !== undefined ? Boolean(ativo) : true,
      publicId
    ]
  );

  if (rowCount === 0) {
    // A escrita já decidiu. Esta leitura só escolhe a resposta: produto
    // inexistente ou categoria inválida.
    if (await buscarProduto(publicId)) {
      throw new BadRequestProblem("Categoria não encontrada.");
    }
    throw new NotFoundProblem("Produto não encontrado.");
  }

  return res.json(await buscarProduto(publicId));
}

// ─────────────────────────────────────────────────────────
//   DELETAR PRODUTO (soft delete — marca como inativo)
//   DELETE /api/products/:publicId
//   Usa soft delete para preservar histórico em pedidos
// ─────────────────────────────────────────────────────────
export async function deleteProduct(req: Request, res: Response) {
  const { rowCount } = await pool.query(
    `UPDATE produtos SET ativo = FALSE WHERE "publicId" = $1`,
    [String(req.params.publicId)]
  );

  if (rowCount === 0) {
    throw new NotFoundProblem("Produto não encontrado.");
  }

  return res.json({
    message: "Produto desativado com sucesso. O histórico de pedidos foi preservado."
  });
}
