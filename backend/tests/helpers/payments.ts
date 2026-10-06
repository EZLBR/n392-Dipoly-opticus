// ============================================================
//   Fixtures de cobrança
//
//   Uma cobrança pendente é o par que o fluxo de pagamento
//   manipula: o pedido com `abacateBillingId` e a linha em
//   `pagamentos` com a mesma referência externa.
// ============================================================

import { randomUUID } from "node:crypto";
import prisma from "../../src/config/prisma.js";
import type { PedidoDeTeste } from "./orders.js";

export interface CobrancaDeTeste {
  billingId: string;
  pedidoPublicId: string;
}

export async function criarCobranca(pedido: PedidoDeTeste): Promise<CobrancaDeTeste> {
  const billingId = `bill-teste-${randomUUID()}`;

  await prisma.pedido.update({
    where: { publicId: pedido.publicId },
    data: { abacateBillingId: billingId, status: "Pending_Payment" },
  });

  await prisma.pagamento.create({
    data: {
      pedidoId: pedido.id,
      valor: "450.00",
      referenciaExterna: billingId,
    },
  });

  return { billingId, pedidoPublicId: pedido.publicId };
}

/** Estado atual do pedido e do pagamento de uma cobrança, sem escopo. */
export async function lerCobranca(cobranca: CobrancaDeTeste) {
  const pedido = await prisma.pedido.findUnique({
    where: { publicId: cobranca.pedidoPublicId },
    select: { status: true, abacateBillingId: true },
  });
  const pagamento = await prisma.pagamento.findFirst({
    where: { referenciaExterna: cobranca.billingId },
    select: { status: true },
  });
  return { pedido: pedido?.status ?? null, pagamento: pagamento?.status ?? null };
}
