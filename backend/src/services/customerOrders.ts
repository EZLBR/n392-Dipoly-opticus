// ============================================================
//   "MEUS PEDIDOS" (FEAT-02) — o histórico do próprio cliente
//   Não conhece Request nem Response.
//
//   Dono: o publicId do token, dentro de cada consulta. Pedido de
//   outra conta e pedido inexistente dão o mesmo 404 (BOLA-02).
//   Os itens (FEAT-04) só chegam pela relação do pedido escopado.
// ============================================================

import type { OrderHistoryKind, Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import type { StatusDoPedido } from "../domain/pedidoStatus.js";
import type { OrderItemResponseDTO } from "../dtos/order/order.dto.js";
import { ITENS_DO_PEDIDO, rotuloDoStatus, toOrderItemResponse } from "./orderService.js";

interface CustomerOrder {
  publicId: string;
  productName: string;
  total: string;
  status: StatusDoPedido | null;
  createdAt: Date | null;
  items: OrderItemResponseDTO[];
}

interface StatusEvent {
  kind: OrderHistoryKind;
  fromStatus: StatusDoPedido | null;
  toStatus: StatusDoPedido | null;
  occurredAt: Date;
}

const CAMPOS_DO_PEDIDO = {
  publicId: true,
  productName: true,
  total: true,
  status: true,
  criadoEm: true,
  itens: ITENS_DO_PEDIDO,
} satisfies Prisma.PedidoSelect;

type PedidoLido = Prisma.PedidoGetPayload<{ select: typeof CAMPOS_DO_PEDIDO }>;

const doCliente = (usuarioPublicId: string) =>
  ({ usuario: { publicId: usuarioPublicId } }) satisfies Prisma.PedidoWhereInput;

function toCustomerOrder(pedido: PedidoLido): CustomerOrder {
  return {
    publicId: pedido.publicId,
    productName: pedido.productName,
    // O Decimal serializado sozinho perde o zero final (159.9).
    total: pedido.total.toFixed(2),
    status: rotuloDoStatus(pedido.status),
    createdAt: pedido.criadoEm,
    items: pedido.itens.map(toOrderItemResponse),
  };
}

export async function listCustomerOrders(usuarioPublicId: string, page: number, limit: number) {
  const where = doCliente(usuarioPublicId);
  const [pedidos, totalItems] = await Promise.all([
    prisma.pedido.findMany({
      where,
      orderBy: [{ criadoEm: { sort: "desc", nulls: "last" } }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: CAMPOS_DO_PEDIDO,
    }),
    prisma.pedido.count({ where }),
  ]);
  return {
    orders: pedidos.map(toCustomerOrder),
    pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
  };
}

function readSpecifications(serialized: string | null): Record<string, unknown> {
  if (!serialized) return {};
  try {
    const value: unknown = JSON.parse(serialized);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    // Especificação antiga ilegível: a página mostra o pedido sem ela.
    return {};
  }
}

export async function findCustomerOrder(usuarioPublicId: string, publicId: string) {
  const pedido = await prisma.pedido.findFirst({
    where: { publicId, ...doCliente(usuarioPublicId) },
    select: {
      ...CAMPOS_DO_PEDIDO,
      customSpecs: true,
      statusHistory: {
        orderBy: { id: "asc" },
        select: { kind: true, fromStatus: true, toStatus: true, occurredAt: true },
      },
    },
  });
  if (!pedido) return undefined;

  const history: StatusEvent[] = pedido.statusHistory.map(evento => ({
    kind: evento.kind,
    fromStatus: rotuloDoStatus(evento.fromStatus),
    toStatus: rotuloDoStatus(evento.toStatus),
    occurredAt: evento.occurredAt,
  }));
  return { ...toCustomerOrder(pedido), customSpecs: readSpecifications(pedido.customSpecs), history };
}
