// ============================================================
//   CART CONTROLLER — carrinho da conta (CART-01, #115)
//
//   Adapta o HTTP. Dono, preço e checkout ficam no CartService.
// ============================================================

import type { Request, Response } from "express";
import type { AddCartItemDTO, CheckoutCartSnapshotDTO, UpdateCartItemDTO } from "../dtos/cart/cart.dto.js";
import { CartService } from "../services/cartService.js";
import { publicIdDoUsuario } from "../utils/identidade.js";
import { origensDaRequisicao } from "../utils/origens.js";

// GET /api/cart
export async function getCart(req: Request, res: Response) {
  return res.json(await CartService.obter(publicIdDoUsuario(req)));
}

// POST /api/cart/items — 201 com uma linha nova, 200 quando somou numa existente.
export async function addCartItem(req: Request, res: Response) {
  const { criado, carrinho } = await CartService.adicionar(publicIdDoUsuario(req), req.body as AddCartItemDTO);
  return res.status(criado ? 201 : 200).json(carrinho);
}

// PATCH /api/cart/items/:publicId
export async function updateCartItem(req: Request, res: Response) {
  const { quantity } = req.body as UpdateCartItemDTO;
  return res.json(await CartService.alterarQuantidade(publicIdDoUsuario(req), String(req.params.publicId), quantity));
}

// DELETE /api/cart/items/:publicId
export async function removeCartItem(req: Request, res: Response) {
  return res.json(await CartService.remover(publicIdDoUsuario(req), String(req.params.publicId)));
}

// DELETE /api/cart
export async function clearCart(req: Request, res: Response) {
  await CartService.esvaziar(publicIdDoUsuario(req));
  return res.status(204).end();
}

// POST /api/cart/checkout
export async function checkoutAccountCart(req: Request, res: Response) {
  const resultado = await CartService.finalizar({
    cliente: {
      publicId: publicIdDoUsuario(req),
      name: req.user!.name ?? "",
      email: req.user!.email ?? "",
    },
    snapshot: req.body as CheckoutCartSnapshotDTO,
    origens: origensDaRequisicao(req),
    traceId: req.requestId,
  });
  return res.json(resultado);
}
