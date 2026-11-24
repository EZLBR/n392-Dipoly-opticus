// ============================================================
//   ORDER CONTROLLER — Pedidos de óculos customizados
//
//   DB-03: adapta o HTTP. A regra e o acesso ao banco ficam no
//   OrderService; o caminho do carrinho até a cobrança, no
//   CheckoutService.
//
//   ID-02: o cliente vem do publicId do token e a fábrica, do
//   factoryPublicId do corpo. As respostas expõem publicId e
//   factoryPublicId, nunca ids inteiros.
// ============================================================

import type { Request, Response } from "express";
import { BadRequestProblem } from "../errors/problem.js";
import { publicIdDoUsuario } from "../utils/identidade.js";
import { parsePagination } from "../utils/pagination.js";
import { sendOrderStatusEmail } from "../utils/emailService.js";
import { CheckoutService } from "../services/checkoutService.js";
import { OrderService, type Cliente } from "../services/orderService.js";
import type {
  CreateOrderDTO,
  UpdateOrderStatusDTO,
  CheckoutCartDTO,
} from "../dtos/order/order.dto.js";

/** O cliente do pedido, com nome e e-mail do token. */
const clienteDoToken = (req: Request): Cliente => ({
  publicId: publicIdDoUsuario(req),
  name:     req.user!.name ?? "",
  email:    req.user!.email ?? "",
});

// ─────────────────────────────────────────────────────────
//   CRIAR PEDIDO
//   POST /api/orders
// ─────────────────────────────────────────────────────────
export async function createOrder(req: Request, res: Response) {
  // O status é sempre "Pending Payment": nenhum campo de status do corpo é lido.
  const pedido = await OrderService.create(clienteDoToken(req), req.body as CreateOrderDTO);

  return res.status(201).json({ ...pedido, order: pedido });
}

// ─────────────────────────────────────────────────────────
//   LISTAR PEDIDOS (baseado no role do usuário)
//   GET /api/orders
// ─────────────────────────────────────────────────────────
export async function getOrders(req: Request, res: Response) {
  const pagination = parsePagination(req.query);
  if (!pagination.isValid) {
    throw new BadRequestProblem(pagination.error);
  }

  const ator = { publicId: publicIdDoUsuario(req), role: String(req.user!.role) };
  return res.json(await OrderService.list(ator, pagination));
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR STATUS DO PEDIDO
//   PUT /api/orders/:publicId/status
// ─────────────────────────────────────────────────────────
export async function updateOrderStatus(req: Request, res: Response) {
  // Express 5 tipa params como string | string[]; a rota declara um só.
  const publicId   = String(req.params.publicId ?? "");
  const { status, version } = req.body as UpdateOrderStatusDTO;

  // A identidade vem exclusivamente do token validado pelo middleware.
  // A autorização de objeto acontece dentro da mutação, no service.
  const pedido = await OrderService.updateStatus({
    publicId,
    status,
    version,
    ator: { publicId: publicIdDoUsuario(req), role: String(req.user!.role) },
  });

  sendOrderStatusEmail(
    {
      id:             pedido.publicId,
      customer_name:  pedido.customerName,
      customer_email: pedido.customerEmail,
      product_name:   pedido.productName,
      factory_name:   pedido.factoryName ?? undefined,
    },
    status
  );

  return res.json({
    message: `Status do pedido atualizado para "${status}" com sucesso.`,
    order: pedido,
    ...pedido,
  });
}

// ─────────────────────────────────────────────────────────
//   CHECKOUT DO CARRINHO
//   POST /api/orders/checkout-cart
// ─────────────────────────────────────────────────────────
export async function checkoutCart(req: Request, res: Response) {
  const { cartItems } = req.body as CheckoutCartDTO;

  const frontendOrigin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : `http://localhost:5173`);
  const backendProto   = req.headers["x-forwarded-proto"] || req.protocol;

  const resultado = await CheckoutService.finalizarCarrinho({
    cliente:  clienteDoToken(req),
    cartItems,
    origens:  { frontend: frontendOrigin, backend: `${backendProto}://${req.get("host")}` },
    traceId:  req.requestId,
  });

  return res.json(resultado);
}
