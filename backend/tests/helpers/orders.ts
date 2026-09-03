// ============================================================
//   Fixtures de pedido
//
//   Cria direto pelo Prisma, e não pela API: o objetivo é montar
//   o estado para testar a autorização, não exercitar o fluxo de
//   criação — que ainda aceita `total` do corpo (SEC-05).
// ============================================================

import prisma from "../../src/config/prisma.js";
import type { UsuarioDeTeste } from "./auth.js";

export interface PedidoDeTeste {
  id: number;
  publicId: string;
  status: string | null;
  factoryId: number | null;
  version: number;
}

let contador = 0;

export async function criarPedido(opcoes: {
  dono: UsuarioDeTeste;
  fabrica?: UsuarioDeTeste | null;
  status?: "Pending_Payment" | "Queued" | "In_production" | "Delivered" | "Cancelled";
}): Promise<PedidoDeTeste> {
  const n = ++contador;
  const { dono, fabrica = null, status = "Queued" } = opcoes;

  const pedido = await prisma.pedido.create({
    data: {
      usuarioId: dono.id,
      customerName: dono.nome,
      customerEmail: dono.email,
      productName: `Armacao Teste ${n}`,
      factoryId: fabrica?.id ?? null,
      factoryName: fabrica ? `Fabrica ${fabrica.id}` : null,
      status,
      total: "450.00",
    },
    select: { id: true, publicId: true, status: true, factoryId: true, version: true },
  });

  return pedido as PedidoDeTeste;
}

/** Releitura sem escopo, para verificar se a tentativa negada alterou algo. */
export async function lerPedido(publicId: string) {
  return prisma.pedido.findUnique({
    where: { publicId },
    select: { publicId: true, status: true, factoryId: true, version: true },
  });
}
