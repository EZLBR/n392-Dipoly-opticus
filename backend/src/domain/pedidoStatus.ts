// ============================================================
//   MÁQUINA DE ESTADOS DO PEDIDO (FEAT-03)
//
//   Define quais mudanças de status a rota PUT /orders/:publicId/status
//   aceita, e de quem. O servidor é a autoridade: o frontend mantém
//   a mesma tabela em frontend/src/utils/orderStatus.ts só para não
//   oferecer opções que seriam recusadas, e um teste compara as duas.
//
//   Pending Payment → Queued não está na tabela de propósito: só a
//   confirmação do pagamento (webhook ou simulador) faz essa
//   transição, com a guarda `AND status = 'Pending Payment'` no
//   próprio UPDATE. Nenhum status manual volta para Pending Payment.
//
//   Sem I/O: tudo aqui é testável sem banco nem Express.
// ============================================================

export const STATUS_DO_PEDIDO = ["Pending Payment", "Queued", "In production", "Delivered", "Cancelled"] as const;
export type StatusDoPedido = (typeof STATUS_DO_PEDIDO)[number];

/** Papéis que alteram status pela rota. O cliente nunca altera. */
export type PapelOperador = "factory" | "staff";

/**
 * Para cada status atual, os destinos permitidos e quem pode levá-lo até lá.
 *
 * A produção só anda para frente (pular de Queued para Delivered é aceito).
 * Cancelar é exclusivo do staff, e um pedido pago cancelado exige estorno
 * fora do sistema. Delivered e Cancelled são finais.
 */
const TRANSICOES: Record<StatusDoPedido, Partial<Record<StatusDoPedido, readonly PapelOperador[]>>> = {
  "Pending Payment": { Cancelled: ["staff"] },
  Queued: { "In production": ["factory", "staff"], Delivered: ["factory", "staff"], Cancelled: ["staff"] },
  "In production": { Delivered: ["factory", "staff"], Cancelled: ["staff"] },
  Delivered: {},
  Cancelled: {},
};

export function ehStatusDoPedido(valor: unknown): valor is StatusDoPedido {
  return typeof valor === "string" && (STATUS_DO_PEDIDO as readonly string[]).includes(valor);
}

export function transicaoPermitida(atual: StatusDoPedido, destino: StatusDoPedido, papel: string): boolean {
  return TRANSICOES[atual][destino]?.includes(papel as PapelOperador) ?? false;
}

/** Status de origem a partir dos quais `papel` pode levar o pedido a `destino`. */
export function origensPermitidas(destino: StatusDoPedido, papel: string): StatusDoPedido[] {
  return STATUS_DO_PEDIDO.filter(atual => transicaoPermitida(atual, destino, papel));
}

export type RecusaDaTransicao =
  | { tipo: "papel"; motivo: string }
  | { tipo: "transicao"; motivo: string };

/**
 * Por que `papel` não pode mover o pedido de `atual` para `destino`.
 * Devolve null quando a transição é permitida.
 *
 * "papel" é falta de permissão para uma transição que existe (403);
 * "transicao" é uma mudança que ninguém pode fazer por esta rota (409).
 */
export function recusaDaTransicao(
  atual: StatusDoPedido,
  destino: StatusDoPedido,
  papel: string,
): RecusaDaTransicao | null {
  if (transicaoPermitida(atual, destino, papel)) return null;
  if (atual === destino) {
    return { tipo: "transicao", motivo: `O pedido já está em "${atual}".` };
  }
  if (atual === "Pending Payment" && destino === "Queued") {
    return { tipo: "transicao", motivo: "Apenas a confirmação do pagamento move o pedido de \"Pending Payment\" para \"Queued\"." };
  }
  if (atual === "Delivered" || atual === "Cancelled") {
    return { tipo: "transicao", motivo: `Um pedido em "${atual}" não muda mais de status.` };
  }
  if (TRANSICOES[atual][destino]) {
    return { tipo: "papel", motivo: `Apenas staff pode mover o pedido de "${atual}" para "${destino}".` };
  }
  return { tipo: "transicao", motivo: `Transição de "${atual}" para "${destino}" não permitida.` };
}
