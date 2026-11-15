import type { Request, Response } from "express";
import { BadRequestProblem, NotFoundProblem } from "../errors/problem.js";
import { publicIdDoUsuario } from "../utils/identidade.js";
import { findCustomerOrder, listCustomerOrders } from "../services/customerOrders.js";

function positiveInteger(value: unknown, fallback: number, max: number) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max) {
    throw new BadRequestProblem("Parâmetros de paginação inválidos.");
  }
  return Number(value);
}

/** ID-02: o cliente é identificado pelo publicId do token. */
const customerId = publicIdDoUsuario;

export async function getCustomerOrders(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const page = positiveInteger(req.query.page, 1, 100_000);
  const limit = positiveInteger(req.query.limit, 20, 100);
  return res.json(await listCustomerOrders(customerId(req), page, limit));
}

export async function getCustomerOrder(req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const publicId = req.params.publicId;
  if (typeof publicId !== "string" || !/^[a-z0-9_-]{1,128}$/i.test(publicId)) {
    throw new NotFoundProblem("Pedido não encontrado.");
  }
  const order = await findCustomerOrder(customerId(req), publicId);
  if (!order) throw new NotFoundProblem("Pedido não encontrado.");
  return res.json({ order });
}
