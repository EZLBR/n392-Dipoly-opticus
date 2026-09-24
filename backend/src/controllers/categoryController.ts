// ============================================================
//   CATEGORY CONTROLLER — CRUD de Categorias
//   Rotas: /api/categories
// ============================================================

import pool from "../config/db.js";
import type { Request, Response } from "express";
import { BadRequestProblem, ConflictProblem, NotFoundProblem } from "../errors/problem.js";

// ─────────────────────────────────────────────────────────
//   CRIAR CATEGORIA
//   POST /api/categories
// ─────────────────────────────────────────────────────────
export async function createCategory(req: Request, res: Response) {
  const { nome, descricao } = req.body;

  if (!nome) {
    throw new BadRequestProblem("Nome da categoria é obrigatório.");
  }

  // Verifica se já existe uma categoria com esse nome
  const { rows: existing } = await pool.query(
    "SELECT id FROM categorias WHERE nome = $1",
    [nome.trim()]
  );

  if (existing.length > 0) {
    throw new ConflictProblem("Já existe uma categoria com esse nome.");
  }

  const { rows } = await pool.query(
    "INSERT INTO categorias (nome, descricao) VALUES ($1, $2) RETURNING id",
    [nome.trim(), descricao || null]
  );

  const { rows: newRows } = await pool.query(
    "SELECT * FROM categorias WHERE id = $1",
    [rows[0].id]
  );

  return res.status(201).json({ success: true, categoria: newRows[0] });
}

// ─────────────────────────────────────────────────────────
//   LISTAR CATEGORIAS (com contagem de produtos)
//   GET /api/categories
// ─────────────────────────────────────────────────────────
export async function getCategories(req: Request, res: Response) {
  // LEFT JOIN + COUNT para mostrar quantos produtos há em cada categoria
  const { rows } = await pool.query(
    `SELECT
      c.id,
      c.nome,
      c.descricao,
      c.criado_em,
      COUNT(p.id) AS total_produtos
     FROM categorias c
     LEFT JOIN produtos p ON p.categoria_id = c.id AND p.ativo = TRUE
     GROUP BY c.id
     ORDER BY c.nome ASC`
  );

  return res.json({ success: true, categorias: rows });
}

// ─────────────────────────────────────────────────────────
//   BUSCAR CATEGORIA POR ID (com seus produtos)
//   GET /api/categories/:id
// ─────────────────────────────────────────────────────────
export async function getCategoryById(req: Request, res: Response) {
  const { id } = req.params;

  // Categoria
  const { rows: catRows } = await pool.query(
    "SELECT * FROM categorias WHERE id = $1",
    [id]
  );

  if (catRows.length === 0) {
    throw new NotFoundProblem("Categoria não encontrada.");
  }

  // Produtos desta categoria
  const { rows: prodRows } = await pool.query(
    "SELECT id, nome, preco, imagem_url, ativo FROM produtos WHERE categoria_id = $1 AND ativo = TRUE",
    [id]
  );

  return res.json({
    success: true,
    categoria: { ...catRows[0], produtos: prodRows }
  });
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR CATEGORIA
//   PUT /api/categories/:id
// ─────────────────────────────────────────────────────────
export async function updateCategory(req: Request, res: Response) {
  const { id } = req.params;
  const { nome, descricao } = req.body;

  if (!nome) {
    throw new BadRequestProblem("Nome é obrigatório.");
  }

  const result = await pool.query(
    "UPDATE categorias SET nome = $1, descricao = $2 WHERE id = $3",
    [nome.trim(), descricao || null, id]
  );

  if (result.rowCount === 0) {
    throw new NotFoundProblem("Categoria não encontrada.");
  }

  const { rows } = await pool.query("SELECT * FROM categorias WHERE id = $1", [id]);

  return res.json({ success: true, categoria: rows[0] });
}

// ─────────────────────────────────────────────────────────
//   DELETAR CATEGORIA
//   DELETE /api/categories/:id
// ─────────────────────────────────────────────────────────
export async function deleteCategory(req: Request, res: Response) {
  const { id } = req.params;

  // Verifica se existem produtos usando esta categoria
  const { rows: prods } = await pool.query(
    "SELECT COUNT(*) AS total FROM produtos WHERE categoria_id = $1 AND ativo = TRUE",
    [id]
  );

  if (prods[0].total > 0) {
    throw new ConflictProblem(
      `Não é possível deletar. ${prods[0].total} produto(s) ainda usam essa categoria.`
    );
  }

  const result = await pool.query(
    "DELETE FROM categorias WHERE id = $1",
    [id]
  );

  if (result.rowCount === 0) {
    throw new NotFoundProblem("Categoria não encontrada.");
  }

  return res.json({ success: true, message: "Categoria removida com sucesso." });
}