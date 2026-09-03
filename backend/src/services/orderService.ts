// ============================================================
//   ORDER SERVICE
//   Regra de negócio de pedidos. Não conhece Request nem Response.
// ============================================================

import { PedidoStatus } from "@prisma/client";
import prisma from "../config/prisma.js";

/** Identidade já autenticada, vinda do token. Nunca do corpo da requisição. */
export interface Ator {
  id: number;
  role: string;
}

export class ServiceError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ServiceError";
  }
}

/**
 * Status como o cliente os envia (com espaço) e como o Prisma os representa.
 * O enum do banco usa @map, então a tradução precisa ser explícita aqui.
 */
const STATUS_POR_ROTULO: Record<string, PedidoStatus> = {
  "Pending Payment": PedidoStatus.Pending_Payment,
  Queued: PedidoStatus.Queued,
  "In production": PedidoStatus.In_production,
  Delivered: PedidoStatus.Delivered,
  Cancelled: PedidoStatus.Cancelled,
};

export const STATUS_VALIDOS = Object.keys(STATUS_POR_ROTULO);

/** Papéis autorizados a mover o status de um pedido. */
const PAPEIS_PERMITIDOS = ["factory", "staff"];

export class OrderService {
  /**
   * Atualiza o status de um pedido.
   *
   * A autorização de objeto acontece dentro da própria mutação: o
   * `where` combina `publicId` com `factoryId`, então não existe janela
   * entre ler e escrever. Zero linhas afetadas significa "não existe ou
   * não é seu" — os dois casos produzem a mesma resposta, para não criar
   * oráculo de enumeração.
   *
   * `staff` é exceção explícita: enxerga qualquer pedido. A regra está na
   * cláusula, não espalhada em condicionais.
   */
  static async updateStatus(params: {
    publicId: string;
    status: string;
    ator: Ator;
  }) {
    const { publicId, status, ator } = params;

    // 403 é falta de papel — nunca falta de posse.
    if (!PAPEIS_PERMITIDOS.includes(ator.role)) {
      throw new ServiceError("Apenas fábricas e staff podem atualizar o status.", 403);
    }

    const statusPrisma = STATUS_POR_ROTULO[status];
    if (!statusPrisma) {
      throw new ServiceError("Status inválido.", 400);
    }

    const ehStaff = ator.role === "staff";

    const { count } = await prisma.pedido.updateMany({
      where: {
        publicId,
        // Fábrica só alcança os próprios pedidos. Staff não recebe filtro.
        ...(ehStaff ? {} : { factoryId: ator.id }),
      },
      data: {
        status: statusPrisma,
        atualizadoEm: new Date(),
        // Prepara a trava otimista do CONC-02: toda escrita avança a versão.
        version: { increment: 1 },
      },
    });

    // Pedido inexistente e pedido de outra fábrica caem aqui do mesmo jeito.
    if (count === 0) {
      throw new ServiceError("Pedido não encontrado.", 404);
    }

    // A leitura também é escopada, para não reabrir pela porta dos fundos.
    const pedido = await prisma.pedido.findFirst({
      where: {
        publicId,
        ...(ehStaff ? {} : { factoryId: ator.id }),
      },
      select: {
        publicId: true,
        status: true,
        customerName: true,
        customerEmail: true,
        productName: true,
        factoryName: true,
        total: true,
        version: true,
        atualizadoEm: true,
      },
    });

    if (!pedido) {
      throw new ServiceError("Pedido não encontrado.", 404);
    }

    return pedido;
  }
}
