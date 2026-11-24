// ============================================================
//   CATEGORY CONTROLLER — CRUD de Categorias
//   Rotas: /api/categories
//
//   DB-03: adapta o HTTP. A regra e o acesso ao banco ficam no
//   CategoryService.
// ============================================================

import type { Request, Response } from "express";
import type { CreateCategoryDTO, UpdateCategoryDTO } from "../dtos/category/category.dto.js";
import { CategoryService } from "../services/categoryService.js";

// ─────────────────────────────────────────────────────────
//   CRIAR CATEGORIA
//   POST /api/categories
// ─────────────────────────────────────────────────────────
export async function createCategory(req: Request, res: Response) {
  const categoria = await CategoryService.create(req.body as CreateCategoryDTO);
  return res.status(201).json(categoria);
}

// ─────────────────────────────────────────────────────────
//   LISTAR CATEGORIAS (com contagem de produtos)
//   GET /api/categories
// ─────────────────────────────────────────────────────────
export async function getCategories(req: Request, res: Response) {
  return res.json(await CategoryService.list());
}

// ─────────────────────────────────────────────────────────
//   BUSCAR CATEGORIA POR PUBLIC ID (com seus produtos)
//   GET /api/categories/:publicId
// ─────────────────────────────────────────────────────────
export async function getCategoryById(req: Request, res: Response) {
  return res.json(await CategoryService.getByPublicId(String(req.params.publicId)));
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR CATEGORIA
//   PUT /api/categories/:publicId
// ─────────────────────────────────────────────────────────
export async function updateCategory(req: Request, res: Response) {
  const categoria = await CategoryService.update(
    String(req.params.publicId),
    req.body as UpdateCategoryDTO,
  );
  return res.json(categoria);
}

// ─────────────────────────────────────────────────────────
//   DELETAR CATEGORIA
//   DELETE /api/categories/:publicId
// ─────────────────────────────────────────────────────────
export async function deleteCategory(req: Request, res: Response) {
  await CategoryService.delete(String(req.params.publicId));
  return res.json({ message: "Categoria removida com sucesso." });
}
