// ============================================================
//   ORDER SERVICE
//   Regra de negócio de pedidos. Não conhece Request nem Response.
// ============================================================

import { PedidoStatus, Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { origensPermitidas, recusaDaTransicao, type StatusDoPedido } from "../domain/pedidoStatus.js";
import { centavosParaDecimal, precoDoItem } from "../domain/pricing.js";
import type { CreateOrderDTO, OrderResponseDTO, PaginatedOrdersDTO } from "../dtos/order/order.dto.js";
import {
  BadRequestProblem,
  ConflictProblem,
  ForbiddenProblem,
  NotFoundProblem,
  UnauthorizedProblem,
} from "../errors/problem.js";

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

/** Quem faz o pedido: identidade do token, com o nome e o e-mail gravados nele. */
export interface Cliente {
  publicId: string;
  name: string;
  email: string;
}

/** Colunas públicas de um pedido, com a fábrica, sem ids internos (ID-02). */
const CAMPOS_PEDIDO = {
  publicId: true,
  customerName: true,
  customerEmail: true,
  productName: true,
  factoryName: true,
  status: true,
  version: true,
  total: true,
  customSpecs: true,
  abacateBillingId: true,
  criadoEm: true,
  atualizadoEm: true,
  fabrica: { select: { publicId: true } },
} satisfies Prisma.PedidoSelect;

type PedidoLido = Prisma.PedidoGetPayload<{ select: typeof CAMPOS_PEDIDO }>;

/** Contrato público: as datas do pedido sempre saíram só com o dia, à meia-noite. */
const soODia = (data: Date | null) =>
  data ? new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate())) : null;

function toOrderResponse(pedido: PedidoLido): OrderResponseDTO {
  return {
    publicId: pedido.publicId,
    customerName: pedido.customerName,
    customerEmail: pedido.customerEmail,
    productName: pedido.productName,
    factoryPublicId: pedido.fabrica?.publicId ?? null,
    factoryName: pedido.factoryName,
    status: pedido.status ? ROTULO_POR_STATUS[pedido.status] : null,
    version: pedido.version,
    // O Decimal serializado sozinho perde o zero final (199.9).
    total: pedido.total.toFixed(2),
    customSpecs: pedido.customSpecs ? JSON.parse(pedido.customSpecs) : {},
    abacateBillingId: pedido.abacateBillingId,
    createdAt: soODia(pedido.criadoEm),
    updatedAt: soODia(pedido.atualizadoEm),
  };
}

/**
 * A fábrica do pedido: a informada, que precisa ser uma fábrica, ou a mais
 * antiga, quando nenhuma é enviada. Sem fábrica cadastrada, o pedido nasce
 * sem fábrica.
 */
async function fabricaDoPedido(tx: Prisma.TransactionClient, factoryPublicId?: string): Promise<number | null> {
  if (factoryPublicId) {
    const fabrica = await tx.usuario.findFirst({
      where: { publicId: factoryPublicId, role: "factory" },
      select: { id: true },
    });
    if (!fabrica) throw new BadRequestProblem("Fábrica não encontrada.");
    return fabrica.id;
  }
  const padrao = await tx.usuario.findFirst({ where: { role: "factory" }, orderBy: { id: "asc" }, select: { id: true } });
  return padrao?.id ?? null;
}

/** O dono do pedido, pelo publicId do token. Um token de conta apagada não cria pedido. */
async function donoDoPedido(tx: Prisma.TransactionClient, publicId: string): Promise<number> {
  const dono = await tx.usuario.findUnique({ where: { publicId }, select: { id: true } });
  if (!dono) throw new UnauthorizedProblem("Sessão inválida.");
  return dono.id;
}

export interface ItemDoPedido {
  productName: string;
  factoryPublicId?: string;
  factoryName: string;
  customSpecs: CreateOrderDTO["customSpecs"];
  quantity: number;
}

/**
 * Grava um pedido em "Pending Payment" com o preço calculado no servidor
 * (SEC-05). A quantidade gravada na especificação é a cobrada, nunca a que
 * vier em customSpecs. O status nunca vem do corpo.
 */
export async function inserirPedido(
  tx: Prisma.TransactionClient,
  cliente: Cliente,
  item: ItemDoPedido,
  billingId: string | null,
) {
  const preco = precoDoItem(item.customSpecs, item.quantity);
  const factoryId = await fabricaDoPedido(tx, item.factoryPublicId);
  const usuarioId = await donoDoPedido(tx, cliente.publicId);

  const pedido = await tx.pedido.create({
    data: {
      usuarioId,
      customerName: cliente.name,
      customerEmail: cliente.email,
      productName: item.productName,
      factoryId,
      factoryName: item.factoryName,
      status: PedidoStatus.Pending_Payment,
      total: centavosParaDecimal(preco.total),
      customSpecs: JSON.stringify({ ...item.customSpecs, quantity: item.quantity }),
      abacateBillingId: billingId,
    },
    select: { id: true, ...CAMPOS_PEDIDO },
  });

  return { pedido, precoUnitarioEmCentavos: preco.unitario };
}

export class OrderService {
  static async create(cliente: Cliente, dto: CreateOrderDTO): Promise<OrderResponseDTO> {
    const { pedido } = await prisma.$transaction(tx => inserirPedido(tx, cliente, dto, null));
    return toOrderResponse(pedido);
  }

  /** Cada papel vê o seu recorte: cliente os próprios, fábrica os atribuídos, staff todos. */
  static async list(
    ator: Ator,
    { page, limit, offset }: { page: number; limit: number; offset: number },
  ): Promise<PaginatedOrdersDTO> {
    const where: Prisma.PedidoWhereInput | null =
      ator.role === "client" ? { usuario: { publicId: ator.publicId } }
      : ator.role === "factory" ? { fabrica: { is: { publicId: ator.publicId } } }
      : ator.role === "staff" ? {}
      : null;

    if (!where) {
      throw new ForbiddenProblem("Acesso não autorizado.");
    }

    const [pedidos, totalItems] = await Promise.all([
      prisma.pedido.findMany({
        where,
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: offset,
        take: limit,
        select: CAMPOS_PEDIDO,
      }),
      prisma.pedido.count({ where }),
    ]);

    return {
      orders: pedidos.map(toOrderResponse),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

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
