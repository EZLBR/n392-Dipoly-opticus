// ============================================================
//   Fixtures de estoque
//
//   Cria produto e estoque direto pelo Prisma: o objetivo é montar
//   o estado inicial, não exercitar o cadastro de produto.
// ============================================================

import prisma from "../../src/config/prisma.js";

export interface EstoqueDeTeste {
  produtoId: number;
  quantidade: number;
  estoqueMinimo: number | null;
}

let contador = 0;

export async function criarProdutoComEstoque(
  opcoes: { quantidade?: number; estoqueMinimo?: number } = {},
): Promise<EstoqueDeTeste> {
  const n = ++contador;
  const { quantidade = 10, estoqueMinimo = 5 } = opcoes;

  const produto = await prisma.produto.create({
    data: {
      nome: `Produto Teste ${n}`,
      preco: "199.90",
      estoque: { create: { quantidade, estoqueMinimo } },
    },
    select: { id: true },
  });

  return { produtoId: produto.id, quantidade, estoqueMinimo };
}

/** Releitura direta do banco, para provar o que a requisição gravou — ou não gravou. */
export async function lerEstoque(produtoId: number) {
  return prisma.estoque.findUniqueOrThrow({
    where: { produtoId },
    select: { quantidade: true, estoqueMinimo: true },
  });
}
