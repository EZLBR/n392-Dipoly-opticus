// ============================================================
//   CATEGORY CONTROLLER — CRUD de Categorias
//   Rotas: /api/categories
//
//   ID-02: as rotas recebem o publicId (UUID) e as respostas não
//   serializam o id inteiro. O publicId é resolvido na própria cláusula
//   WHERE de cada consulta.
// ============================================================

import pool from "../config/db.js";
import type { Request, Response } from "express";
import { ConflictProblem, NotFoundProblem } from "../errors/problem.js";
import type { CreateCategoryDTO, UpdateCategoryDTO } from "../dtos/category/category.dto.js";

/** Colunas públicas de uma categoria, sem o id interno. */
const CAMPOS_CATEGORIA = `c."publicId", c.nome, c.descricao, c.criado_em`;

// ─────────────────────────────────────────────────────────
//   CRIAR CATEGORIA
//   POST /api/categories
// ─────────────────────────────────────────────────────────
export async function createCategory(req: Request, res: Response) {
  const { nome, descricao } = req.body as CreateCategoryDTO;

  // Verifica se já existe uma categoria com esse nome
  const { rows: existing } = await pool.query(
    "SELECT 1 FROM categorias WHERE nome = $1",
    [nome.trim()]
  );

  if (existing.length > 0) {
    throw new ConflictProblem("Já existe uma categoria com esse nome.");
  }

  const { rows } = await pool.query(
    `INSERT INTO categorias AS c (nome, descricao) VALUES ($1, $2) RETURNING ${CAMPOS_CATEGORIA}`,
    [nome.trim(), descricao || null]
  );

  return res.status(201).json(rows[0]);
}

// ─────────────────────────────────────────────────────────
//   LISTAR CATEGORIAS (com contagem de produtos)
//   GET /api/categories
// ─────────────────────────────────────────────────────────
export async function getCategories(req: Request, res: Response) {
  // LEFT JOIN + COUNT para mostrar quantos produtos há em cada categoria
  const { rows } = await pool.query(
    `SELECT
      ${CAMPOS_CATEGORIA},
      COUNT(p.id) AS total_produtos
     FROM categorias c
     LEFT JOIN produtos p ON p.categoria_id = c.id AND p.ativo = TRUE
     GROUP BY c.id
     ORDER BY c.nome ASC`
  );

  return res.json(rows);
}

// ─────────────────────────────────────────────────────────
//   BUSCAR CATEGORIA POR PUBLIC ID (com seus produtos)
//   GET /api/categories/:publicId
// ─────────────────────────────────────────────────────────
export async function getCategoryById(req: Request, res: Response) {
  const publicId = String(req.params.publicId);

  const { rows: catRows } = await pool.query(
    `SELECT ${CAMPOS_CATEGORIA} FROM categorias c WHERE c."publicId" = $1`,
    [publicId]
  );

  if (catRows.length === 0) {
    throw new NotFoundProblem("Categoria não encontrada.");
  }

  // Produtos desta categoria, resolvida pelo publicId na própria junção.
  const { rows: prodRows } = await pool.query(
    `SELECT p."publicId", p.nome, p.preco, p.imagem_url, p.ativo
       FROM produtos p
       INNER JOIN categorias c ON c.id = p.categoria_id
      WHERE c."publicId" = $1 AND p.ativo = TRUE`,
    [publicId]
  );

  return res.json({
    ...catRows[0],
    produtos: prodRows
  });
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR CATEGORIA
//   PUT /api/categories/:publicId
// ─────────────────────────────────────────────────────────
export async function updateCategory(req: Request, res: Response) {
  const publicId = String(req.params.publicId);
  const { nome, descricao } = req.body as UpdateCategoryDTO;

  const { rows } = await pool.query(
    `UPDATE categorias AS c SET nome = $1, descricao = $2
      WHERE c."publicId" = $3
     RETURNING ${CAMPOS_CATEGORIA}`,
    [nome.trim(), descricao || null, publicId]
  );

  if (rows.length === 0) {
    throw new NotFoundProblem("Categoria não encontrada.");
  }

  return res.json(rows[0]);
}

// ─────────────────────────────────────────────────────────
//   DELETAR CATEGORIA
//   DELETE /api/categories/:publicId
// ─────────────────────────────────────────────────────────
export async function deleteCategory(req: Request, res: Response) {
  const publicId = String(req.params.publicId);

  // Verifica se existem produtos usando esta categoria
  const { rows: prods } = await pool.query(
    `SELECT COUNT(*) AS total
       FROM produtos p
       INNER JOIN categorias c ON c.id = p.categoria_id
      WHERE c."publicId" = $1 AND p.ativo = TRUE`,
    [publicId]
  );

  if (prods[0].total > 0) {
    throw new ConflictProblem(
      `Não é possível deletar. ${prods[0].total} produto(s) ainda usam essa categoria.`
    );
  }

  const result = await pool.query(
    `DELETE FROM categorias WHERE "publicId" = $1`,
    [publicId]
  );

  if (result.rowCount === 0) {
    throw new NotFoundProblem("Categoria não encontrada.");
  }

  return res.json({ message: "Categoria removida com sucesso." });
}
