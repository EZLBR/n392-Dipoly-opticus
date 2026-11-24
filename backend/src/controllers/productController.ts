// ============================================================
//   PRODUCT CONTROLLER — CRUD completo de Produtos
//   Rotas: /api/products
//
//   DB-03: adapta o HTTP. A regra e o acesso ao banco ficam no
//   ProductService.
// ============================================================

import type { Request, Response } from "express";
import type { CreateProductDTO, GetProductsQueryDTO, UpdateProductDTO } from "../dtos/product/product.dto.js";
import { ProductService } from "../services/productService.js";

// ─────────────────────────────────────────────────────────
//   CRIAR PRODUTO
//   POST /api/products
//   Somente: staff
// ─────────────────────────────────────────────────────────
export async function createProduct(req: Request, res: Response) {
  const produto = await ProductService.create(req.body as CreateProductDTO);
  return res.status(201).json(produto);
}

// ─────────────────────────────────────────────────────────
//   LISTAR PRODUTOS (com paginação e filtros)
//   GET /api/products?categoriaPublicId=<uuid>&page=1&limit=10&search=aurora
// ─────────────────────────────────────────────────────────
export async function getProducts(req: Request, res: Response) {
  return res.json(await ProductService.list(req.query as unknown as GetProductsQueryDTO));
}

// ─────────────────────────────────────────────────────────
//   BUSCAR PRODUTO POR PUBLIC ID
//   GET /api/products/:publicId
// ─────────────────────────────────────────────────────────
export async function getProductById(req: Request, res: Response) {
  return res.json(await ProductService.getByPublicId(String(req.params.publicId)));
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR PRODUTO
//   PUT /api/products/:publicId
// ─────────────────────────────────────────────────────────
export async function updateProduct(req: Request, res: Response) {
  const produto = await ProductService.update(
    String(req.params.publicId),
    req.body as UpdateProductDTO,
  );
  return res.json(produto);
}

// ─────────────────────────────────────────────────────────
//   DELETAR PRODUTO (soft delete — marca como inativo)
//   DELETE /api/products/:publicId
//   Usa soft delete para preservar histórico em pedidos
// ─────────────────────────────────────────────────────────
export async function deleteProduct(req: Request, res: Response) {
  await ProductService.deactivate(String(req.params.publicId));
  return res.json({
    message: "Produto desativado com sucesso. O histórico de pedidos foi preservado."
  });
}
