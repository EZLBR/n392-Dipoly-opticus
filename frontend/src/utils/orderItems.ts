import type { OrderItem } from "../types/domain";

/**
 * FEAT-04: os itens de um pedido numa linha ("2× Wayfarer, Redondo"), para
 * tabelas e listas. Um pedido sem itens (guardado no cache antes da FEAT-04)
 * mostra o nome do próprio pedido.
 */
export function resumoDosItens(order: { productName: string; items?: OrderItem[] }): string {
  const itens = order.items ?? [];
  if (itens.length === 0) return order.productName;
  return itens
    .map(item => (item.quantity > 1 ? `${item.quantity}× ${item.productName}` : item.productName))
    .join(", ");
}
