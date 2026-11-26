// ============================================================
//   ORDER SERVICE
//   Regra de negócio de pedidos. Não conhece Request nem Response.
// ============================================================

import { PedidoStatus, Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { origensPermitidas, recusaDaTransicao, type StatusDoPedido } from "../domain/pedidoStatus.js";
import { centavosParaDecimal, precoDoItem } from "../domain/pricing.js";
import type {
  CreateOrderDTO,
  OrderItemResponseDTO,
  OrderResponseDTO,
  PaginatedOrdersDTO,
} from "../dtos/order/order.dto.js";
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

/** O status como a API o devolve, com espaço ("Pending Payment"). */
export const rotuloDoStatus = (status: PedidoStatus | null): StatusDoPedido | null =>
  status ? ROTULO_POR_STATUS[status] : null;

/** Papéis autorizados a mover o status de um pedido. */
const PAPEIS_PERMITIDOS = ["factory", "staff"];

/** Quem faz o pedido: identidade do token, com o nome e o e-mail gravados nele. */
export interface Cliente {
  publicId: string;
  name: string;
  email: string;
}

/** Colunas públicas de um item do pedido (FEAT-04), sem ids internos (ID-02). */
const CAMPOS_DO_ITEM = {
  publicId: true,
  productName: true,
  customSpecs: true,
  quantidade: true,
  precoUnitario: true,
} satisfies Prisma.PedidoItemSelect;

/** Os itens de um pedido, na ordem em que foram gravados (a do carrinho). */
export const ITENS_DO_PEDIDO = {
  select: CAMPOS_DO_ITEM,
  orderBy: { id: "asc" },
} satisfies Prisma.Pedido$itensArgs;

type ItemLido = Prisma.PedidoItemGetPayload<{ select: typeof CAMPOS_DO_ITEM }>;

/** A especificação gravada é sempre um objeto; outro valor JSON vira objeto vazio. */
function objetoOuVazio(valor: Prisma.JsonValue): Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor : {};
}

export function toOrderItemResponse(item: ItemLido): OrderItemResponseDTO {
  return {
    publicId: item.publicId,
    productName: item.productName,
    customSpecs: objetoOuVazio(item.customSpecs),
    quantity: item.quantidade,
    // Decimal vezes inteiro continua exato; toFixed mantém o zero final.
    unitPrice: item.precoUnitario.toFixed(2),
    total: item.precoUnitario.mul(item.quantidade).toFixed(2),
  };
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
  itens: ITENS_DO_PEDIDO,
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
    status: rotuloDoStatus(pedido.status),
    version: pedido.version,
    // O Decimal serializado sozinho perde o zero final (199.9).
    total: pedido.total.toFixed(2),
    customSpecs: pedido.customSpecs ? JSON.parse(pedido.customSpecs) : {},
    abacateBillingId: pedido.abacateBillingId,
    createdAt: soODia(pedido.criadoEm),
    updatedAt: soODia(pedido.atualizadoEm),
    items: pedido.itens.map(toOrderItemResponse),
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

/** Um item como o cliente o escolheu. O preço nunca vem junto (SEC-05). */
export interface ItemEscolhido {
  productName: string;
  customSpecs: CreateOrderDTO["customSpecs"];
  quantity: number;
}

/** Um pedido é de uma fábrica só (ADR-0004): a fábrica vale para todos os itens. */
export interface PedidoNovo {
  factoryPublicId?: string;
  factoryName: string;
  itens: ItemEscolhido[];
}

const TAMANHO_DO_NOME = 255;

/**
 * FEAT-04, transição: o pedido ainda guarda um nome e uma especificação
 * próprios, que os painéis atuais leem. Com um item, são os dele, como
 * antes. Com vários, o nome resume e a especificação fica nula: os itens
 * são a fonte. Os dois campos saem na parte 3 (ADR-0004), com ADR própria (§13).
 */
function camposLegadosDoPedido(itens: ItemEscolhido[]) {
  const [primeiro] = itens;
  if (itens.length === 1) {
    return {
      productName: primeiro.productName,
      customSpecs: JSON.stringify({ ...primeiro.customSpecs, quantity: primeiro.quantity }),
    };
  }
  const sufixo = ` (+${itens.length - 1})`;
  return {
    productName: `${primeiro.productName.slice(0, TAMANHO_DO_NOME - sufixo.length)}${sufixo}`,
    customSpecs: null,
  };
}

/** A especificação do item, sem a quantidade: ela é a coluna quantidade. */
function especificacaoDoItem(customSpecs: ItemEscolhido["customSpecs"]): Prisma.InputJsonObject {
  const { quantity: _quantidade, ...especificacao } = customSpecs as Record<string, unknown>;
  return especificacao as Prisma.InputJsonObject;
}

/** O Decimal(10,2) vezes 100 é inteiro exato: centavos sem passar por float. */
const emCentavos = (valor: Prisma.Decimal) => valor.mul(100).toNumber();

/**
 * Grava um pedido em "Pending Payment" com os itens, numa única escrita.
 * O preço de cada item é calculado no servidor (SEC-05) e gravado no item;
 * o total do pedido é a soma deles. A quantidade é a cobrada, nunca a que
 * vier em customSpecs. O status nunca vem do corpo.
 */
export async function inserirPedido(
  tx: Prisma.TransactionClient,
  cliente: Cliente,
  novo: PedidoNovo,
  billingId: string | null,
) {
  if (novo.itens.length === 0) throw new RangeError("Um pedido precisa de pelo menos um item.");

  const precos = novo.itens.map(item => precoDoItem(item.customSpecs, item.quantity));
  const totalEmCentavos = precos.reduce((soma, preco) => soma + preco.total, 0);
  const factoryId = await fabricaDoPedido(tx, novo.factoryPublicId);
  const usuarioId = await donoDoPedido(tx, cliente.publicId);

  const pedido = await tx.pedido.create({
    data: {
      usuarioId,
      customerName: cliente.name,
      customerEmail: cliente.email,
      ...camposLegadosDoPedido(novo.itens),
      factoryId,
      factoryName: novo.factoryName,
      status: PedidoStatus.Pending_Payment,
      total: centavosParaDecimal(totalEmCentavos),
      abacateBillingId: billingId,
      itens: {
        create: novo.itens.map((item, indice) => ({
          productName: item.productName,
          customSpecs: especificacaoDoItem(item.customSpecs),
          quantidade: item.quantity,
          precoUnitario: centavosParaDecimal(precos[indice].unitario),
        })),
      },
    },
    select: { id: true, ...CAMPOS_PEDIDO },
  });

  // O gateway cobra o que ficou gravado em cada item, e não um valor
  // recalculado à parte.
  const itens = pedido.itens.map(item => ({
    publicId: item.publicId,
    productName: item.productName,
    quantity: item.quantidade,
    precoUnitarioEmCentavos: emCentavos(item.precoUnitario),
  }));

  return { pedido, itens };
}

export class OrderService {
  static async create(cliente: Cliente, dto: CreateOrderDTO): Promise<OrderResponseDTO> {
    const { factoryPublicId, factoryName, ...item } = dto;
    const { pedido } = await prisma.$transaction(tx =>
      inserirPedido(tx, cliente, { factoryPublicId, factoryName, itens: [item] }, null));
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
