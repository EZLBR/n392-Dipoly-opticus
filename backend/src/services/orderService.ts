// ============================================================
//   ORDER SERVICE
//   Regra de negócio de pedidos. Não conhece Request nem Response.
// ============================================================

import { PedidoStatus } from "@prisma/client";
import prisma from "../config/prisma.js";
import { origensPermitidas, recusaDaTransicao, type StatusDoPedido } from "../domain/pedidoStatus.js";
import { BadRequestProblem, ConflictProblem, ForbiddenProblem, NotFoundProblem } from "../errors/problem.js";

/** Identidade já autenticada, vinda do token. Nunca do corpo da requisição. */
export interface Ator {
  /** ID-02: identificador público do usuário, vindo do token. */
  publicId: string;
  role: string;
}

/**
 * Status como o cliente os envia (com espaço) e como o Prisma os representa.
 * O enum do banco usa @map, então a tradução precisa ser explícita aqui.
 */
const STATUS_POR_ROTULO: Record<StatusDoPedido, PedidoStatus> = {
  "Pending Payment": PedidoStatus.Pending_Payment,
  Queued: PedidoStatus.Queued,
  "In production": PedidoStatus.In_production,
  Delivered: PedidoStatus.Delivered,
  Cancelled: PedidoStatus.Cancelled,
};

const ROTULO_POR_STATUS = Object.fromEntries(
  Object.entries(STATUS_POR_ROTULO).map(([rotulo, status]) => [status, rotulo]),
) as Record<PedidoStatus, StatusDoPedido>;

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
   *
   * A transição (FEAT-03) também é guarda do próprio UPDATE: só casa a
   * linha cujo status atual pode chegar ao destino, segundo a máquina de
   * estados de domain/pedidoStatus.ts. Assim duas atualizações simultâneas
   * não furam a regra.
   *
   * A trava otimista (CONC-02) é a terceira guarda: só casa a linha que
   * ainda está na versão que o cliente leu. Quem decidiu olhando um pedido
   * desatualizado recebe 409 e recarrega, em vez de sobrescrever a mudança
   * de outra pessoa. O trigger do banco avança a versão a cada escrita.
   */
  static async updateStatus(params: {
    publicId: string;
    status: StatusDoPedido;
    /** Versão do pedido que o cliente leu antes de decidir a mudança. */
    version: number;
    ator: Ator;
  }) {
    const { publicId, status, version, ator } = params;

    // 403 é falta de papel — nunca falta de posse.
    if (!PAPEIS_PERMITIDOS.includes(ator.role)) {
      throw new ForbiddenProblem("Apenas fábricas e staff podem atualizar o status.");
    }

    const statusPrisma = STATUS_POR_ROTULO[status];
    if (!statusPrisma) {
      throw new BadRequestProblem("Status inválido.");
    }

    const escopo = {
      publicId,
      // Fábrica só alcança os próprios pedidos. Staff não recebe filtro.
      ...(ator.role === "staff" ? {} : { fabrica: { is: { publicId: ator.publicId } } }),
    };

    const origens = origensPermitidas(status, ator.role).map(rotulo => STATUS_POR_ROTULO[rotulo]);
    const { count } = origens.length === 0 ? { count: 0 } : await prisma.pedido.updateMany({
      where: { ...escopo, status: { in: origens }, version },
      // A versão avança no trigger pedidos_version_trigger, não aqui.
      data: { status: statusPrisma, atualizadoEm: new Date() },
    });

    if (count === 0) {
      // Nada mudou: o pedido não é visível para o ator, a versão lida ficou
      // velha, ou a transição não vale. Só quem enxerga o pedido recebe o
      // motivo; pedido inexistente e pedido de outra fábrica continuam caindo
      // no mesmo 404.
      const atual = await prisma.pedido.findFirst({ where: escopo, select: { status: true, version: true } });
      if (!atual) {
        throw new NotFoundProblem("Pedido não encontrado.");
      }
      // Versão velha vem antes da transição: o cliente decidiu olhando um
      // status que talvez nem seja mais o atual.
      if (atual.version !== version) {
        throw new ConflictProblem("O pedido foi alterado por outra pessoa. Recarregue e tente novamente.");
      }
      const recusa = atual.status ? recusaDaTransicao(ROTULO_POR_STATUS[atual.status], status, ator.role) : null;
      if (recusa?.tipo === "papel") {
        throw new ForbiddenProblem(recusa.motivo);
      }
      // Sem motivo, o status mudou entre a tentativa e esta leitura.
      throw new ConflictProblem(recusa?.motivo ?? "O pedido mudou durante a atualização. Recarregue e tente novamente.");
    }

    // A leitura também é escopada, para não reabrir pela porta dos fundos.
    const pedido = await prisma.pedido.findFirst({
      where: escopo,
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
      throw new NotFoundProblem("Pedido não encontrado.");
    }

    return pedido;
  }
}
