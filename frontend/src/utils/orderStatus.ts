// Prévia da máquina de estados do pedido (FEAT-03), só para não oferecer
// opções que o servidor recusaria. A autoridade é
// backend/src/domain/pedidoStatus.ts, e um teste do backend compara as duas.
export const ORDER_STATUSES = ["Pending Payment", "Queued", "In production", "Delivered", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Record<OrderStatus, Partial<Record<OrderStatus, readonly string[]>>> = {
  "Pending Payment": { Cancelled: ["staff"] },
  Queued: { "In production": ["factory", "staff"], Delivered: ["factory", "staff"], Cancelled: ["staff"] },
  "In production": { Delivered: ["factory", "staff"], Cancelled: ["staff"] },
  Delivered: {},
  Cancelled: {},
};

/** Status para os quais `role` pode mover um pedido que está em `current`. */
export function nextStatuses(current: string, role: string): OrderStatus[] {
  const allowed = TRANSITIONS[current as OrderStatus] ?? {};
  return ORDER_STATUSES.filter(status => allowed[status]?.includes(role));
}
