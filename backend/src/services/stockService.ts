// ============================================================
//   STOCK SERVICE
//   Regra de negócio de estoque. Não conhece Request nem Response.
//
//   DB-03: o acesso ao banco é pelo Prisma Client, direto do service.
// ============================================================

import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { ConflictProblem, NotFoundProblem } from "../errors/problem.js";
import {
  LIMITE_QUANTIDADE_ESTOQUE,
  type PaginatedStockDTO,
  type StockAlertsDTO,
  type StockByProductDTO,
  type StockUpdatedDTO,
  type UpdateStockDTO,
} from "../dtos/stock/stock.dto.js";

const PRODUTO_NAO_ENCONTRADO = "Produto não encontrado no estoque.";

/** Colunas públicas do item de estoque, sem ids internos. */
const CAMPOS_ITEM = {
  publicId: true,
  quantidade: true,
  estoqueMinimo: true,
  atualizadoEm: true,
  version: true,
} satisfies Prisma.EstoqueSelect;

/** Sem mínimo definido, só o estoque zerado gera alerta. */
const emAlerta = (quantidade: number, estoqueMinimo: number | null) => quantidade <= (estoqueMinimo ?? 0);

/**
 * A operação acontece dentro do próprio UPDATE, sobre o valor atual da
 * linha. Ler a quantidade, calcular em JavaScript e gravar o valor absoluto
 * perdia baixas concorrentes: duas baixas de 5 sobre um estoque de 10
 * terminavam em 5, não em 0. A guarda impede estoque negativo e estouro do
 * INTEGER; quando ela barra a escrita, nenhuma linha é afetada.
 */
const OPERACOES_DE_ESTOQUE = {
  set: (quantidade: number) => ({ guarda: {}, novaQuantidade: quantidade }),
  add: (quantidade: number) => ({
    guarda: { quantidade: { lte: LIMITE_QUANTIDADE_ESTOQUE - quantidade } },
    novaQuantidade: { increment: quantidade },
  }),
  subtract: (quantidade: number) => ({
    guarda: { quantidade: { gte: quantidade } },
    novaQuantidade: { decrement: quantidade },
  }),
};

export class StockService {
  /** Lista o estoque dos produtos ativos, do menor para o maior. */
  static async list({ page, limit, offset }: { page: number; limit: number; offset: number }): Promise<PaginatedStockDTO> {
    const where: Prisma.EstoqueWhereInput = { produto: { ativo: true } };

    const [itens, totalItems] = await Promise.all([
      prisma.estoque.findMany({
        where,
        orderBy: [{ quantidade: "asc" }, { id: "asc" }],
        skip: offset,
        take: limit,
        select: {
          publicId: true,
          quantidade: true,
          estoqueMinimo: true,
          atualizadoEm: true,
          produto: {
            select: { publicId: true, nome: true, preco: true, categoria: { select: { nome: true } } },
          },
        },
      }),
      prisma.estoque.count({ where }),
    ]);

    const estoque = itens.map(item => ({
      publicId: item.publicId,
      produtoPublicId: item.produto.publicId,
      produto_nome: item.produto.nome,
      // O Decimal serializado sozinho perde o zero final (199.9).
      produto_preco: item.produto.preco.toFixed(2),
      categoria_nome: item.produto.categoria?.nome ?? null,
      quantidade: item.quantidade,
      estoque_minimo: item.estoqueMinimo,
      atualizado_em: item.atualizadoEm,
      alerta_baixo_estoque: item.estoqueMinimo === null ? null : item.quantidade <= item.estoqueMinimo,
    }));

    // Os críticos são os desta página.
    const criticos = estoque.filter(item => item.alerta_baixo_estoque);

    return {
      estoque,
      alertas: criticos.length,
      produtos_criticos: criticos.map(item => item.produto_nome),
      pagination: { page, limit, totalItems, totalPages: Math.ceil(totalItems / limit) },
    };
  }

  static async getByProduct(produtoPublicId: string): Promise<StockByProductDTO> {
    const item = await prisma.estoque.findFirst({
      where: { produto: { publicId: produtoPublicId } },
      select: {
        ...CAMPOS_ITEM,
        produto: { select: { publicId: true, nome: true, preco: true } },
      },
    });

    if (!item) {
      throw new NotFoundProblem("Estoque não encontrado para esse produto.");
    }

    return {
      estoque: {
        publicId: item.publicId,
        produtoPublicId: item.produto.publicId,
        produto_nome: item.produto.nome,
        quantidade: item.quantidade,
        estoque_minimo: item.estoqueMinimo,
        atualizado_em: item.atualizadoEm,
        version: item.version,
        preco: item.produto.preco.toFixed(2),
      },
      alerta: emAlerta(item.quantidade, item.estoqueMinimo),
    };
  }

  static async update(
    produtoPublicId: string,
    { quantidade, estoque_minimo, operacao }: UpdateStockDTO,
  ): Promise<StockUpdatedDTO> {
    const produto = await prisma.produto.findUnique({
      where: { publicId: produtoPublicId },
      select: { id: true, publicId: true, nome: true },
    });

    if (!produto) {
      throw new NotFoundProblem(PRODUTO_NAO_ENCONTRADO);
    }

    const { guarda, novaQuantidade } = OPERACOES_DE_ESTOQUE[operacao](quantidade);

    let item;
    try {
      // Um só UPDATE ... RETURNING: a resposta é o valor desta escrita, mesmo
      // com outras acontecendo ao mesmo tempo.
      item = await prisma.estoque.update({
        where: { produtoId: produto.id, ...guarda },
        data: {
          quantidade: novaQuantidade,
          estoqueMinimo: estoque_minimo,
          version: { increment: 1 },
          // Antes ficava para sempre com a data de criação do registro.
          atualizadoEm: new Date(),
        },
        select: CAMPOS_ITEM,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        throw await recusaDaEscrita(produto.id, operacao);
      }
      throw err;
    }

    const alerta = emAlerta(item.quantidade, item.estoqueMinimo);

    return {
      estoque: {
        publicId: item.publicId,
        produtoPublicId: produto.publicId,
        produto_nome: produto.nome,
        quantidade: item.quantidade,
        estoque_minimo: item.estoqueMinimo,
        atualizado_em: item.atualizadoEm,
        version: item.version,
      },
      alerta,
      message: alerta
        ? `⚠️ Atenção: estoque baixo! ${item.quantidade} unidades (mínimo: ${item.estoqueMinimo})`
        : `Estoque atualizado: ${item.quantidade} unidades disponíveis.`,
    };
  }

  /** Itens ativos no mínimo ou abaixo, do maior déficit para o menor. */
  static async alerts(): Promise<StockAlertsDTO> {
    const itens = await prisma.estoque.findMany({
      where: {
        quantidade: { lte: prisma.estoque.fields.estoqueMinimo },
        produto: { ativo: true },
      },
      orderBy: { id: "asc" },
      select: {
        quantidade: true,
        estoqueMinimo: true,
        produto: { select: { publicId: true, nome: true } },
      },
    });

    const alertas = itens
      .map(item => ({
        produtoPublicId: item.produto.publicId,
        produto_nome: item.produto.nome,
        quantidade: item.quantidade,
        // O filtro acima não deixa passar mínimo nulo.
        estoque_minimo: item.estoqueMinimo!,
        deficit: item.estoqueMinimo! - item.quantidade,
      }))
      .sort((a, b) => b.deficit - a.deficit);

    return { alertas, total: alertas.length };
  }
}

/**
 * O UPDATE já decidiu, de forma atômica. Esta leitura serve só para escolher
 * a resposta: item inexistente ou guarda que barrou.
 */
async function recusaDaEscrita(produtoId: number, operacao: UpdateStockDTO["operacao"]) {
  const atual = await prisma.estoque.findUnique({ where: { produtoId }, select: { quantidade: true } });

  if (!atual) {
    return new NotFoundProblem(PRODUTO_NAO_ENCONTRADO);
  }
  if (operacao === "subtract") {
    return new ConflictProblem(`Estoque insuficiente. Disponível: ${atual.quantidade} unidades.`);
  }
  return new ConflictProblem(`A entrada excederia o limite de ${LIMITE_QUANTIDADE_ESTOQUE} unidades em estoque.`);
}
