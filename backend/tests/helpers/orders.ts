// ============================================================
//   Fixtures de pedido
//
//   Cria direto pelo Prisma, e não pela API: o objetivo é montar
//   o estado para testar a autorização, não exercitar o fluxo de
//   criação, que tem testes próprios (pedidos-preco-servidor.test.ts).
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
  /** Total do pedido, que é também o preço do único item. */
  total?: string;
}): Promise<PedidoDeTeste> {
  const n = ++contador;
  const { dono, fabrica = null, status = "Queued", total = "450.00" } = opcoes;

  const pedido = await prisma.pedido.create({
    data: {
      usuarioId: dono.id,
      customerName: dono.nome,
      customerEmail: dono.email,
      productName: `Armacao Teste ${n}`,
      factoryId: fabrica?.id ?? null,
      factoryName: fabrica ? `Fabrica ${fabrica.id}` : null,
      status,
      total,
      // FEAT-04: todo pedido tem item, e a soma dos itens é o total.
      itens: { create: [{ productName: `Armacao Teste ${n}`, customSpecs: {}, quantidade: 1, precoUnitario: total }] },
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
