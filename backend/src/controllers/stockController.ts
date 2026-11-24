// ============================================================
//   STOCK CONTROLLER — Gerenciamento de Estoque
//   Rotas: /api/stock
//
//   DB-03: adapta o HTTP. A regra e o acesso ao banco ficam no
//   StockService.
// ============================================================

import type { Request, Response } from "express";
import { BadRequestProblem } from "../errors/problem.js";
import { parsePagination } from "../utils/pagination.js";
import type { UpdateStockDTO } from "../dtos/stock/stock.dto.js";
import { StockService } from "../services/stockService.js";

// ─────────────────────────────────────────────────────────
//   LISTAR TODO O ESTOQUE
//   GET /api/stock
// ─────────────────────────────────────────────────────────
export async function getAllStock(req: Request, res: Response) {
  const pagination = parsePagination(req.query);
  if (!pagination.isValid) {
    throw new BadRequestProblem(pagination.error);
  }

  return res.json(await StockService.list(pagination));
}

// ─────────────────────────────────────────────────────────
//   BUSCAR ESTOQUE DE UM PRODUTO
//   GET /api/stock/product/:produtoPublicId
// ─────────────────────────────────────────────────────────
export async function getStockByProduct(req: Request, res: Response) {
  return res.json(await StockService.getByProduct(String(req.params.produtoPublicId)));
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR ESTOQUE
//   PUT /api/stock/product/:produtoPublicId
//   Body: { quantidade, estoque_minimo, operacao }
//   operacao: 'set' (define valor) | 'add' (adiciona) | 'subtract' (subtrai)
// ─────────────────────────────────────────────────────────
export async function updateStock(req: Request, res: Response) {
  const resultado = await StockService.update(
    String(req.params.produtoPublicId),
    req.body as UpdateStockDTO,
  );
  return res.json(resultado);
}

// ─────────────────────────────────────────────────────────
//   ALERTAS DE ESTOQUE BAIXO
//   GET /api/stock/alerts
// ─────────────────────────────────────────────────────────
export async function getStockAlerts(req: Request, res: Response) {
  return res.json(await StockService.alerts());
}
