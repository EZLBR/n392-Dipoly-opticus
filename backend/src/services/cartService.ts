// ============================================================
//   CART SERVICE — carrinho persistido por conta (CART-01, #115)
//   Não conhece Request nem Response.
//
//   Dono: o publicId do token, resolvido dentro de cada consulta. Item
//   de outra conta e item inexistente dão o mesmo 404 (BOLA-02).
//
//   Linha: uma configuração. Adicionar a mesma configuração soma na mesma
//   linha; outra configuração do mesmo modelo é outra linha. A identidade
//   é a chave (SHA-256 do item validado), calculada aqui, nunca vinda do
//   cliente.
//
//   Preço: calculado no servidor a cada leitura (SEC-05). O cliente não
//   envia preço, e o que ele vê é o que o checkout cobra.
//
//   Checkout: o cliente manda o carrinho que está vendo. Só se ele for
//   exatamente o atual, os pedidos são criados a partir das linhas do
//   banco, e cada linha guarda o pedido que gerou. A linha sai do
//   carrinho quando o pagamento desse pedido é confirmado
//   (PaymentService.aprovarPagamentos): falha, recusa ou cancelamento do
//   pagamento não esvaziam o carrinho.
// ============================================================

import { createHash } from "node:crypto";
import { Prisma, PedidoStatus } from "@prisma/client";
import prisma from "../config/prisma.js";
import { centavosParaDecimal, precoDoItem, QUANTIDADE_MAXIMA_POR_ITEM } from "../domain/pricing.js";
import {
  LINHAS_MAXIMAS_NO_CARRINHO,
  type AddCartItemDTO,
  type CartItemResponseDTO,
  type CartResponseDTO,
  type CheckoutCartSnapshotDTO,
} from "../dtos/cart/cart.dto.js";
import { cartItemSchema, type CheckoutResultDTO } from "../dtos/order/order.dto.js";
import { BadRequestProblem, ConflictProblem, NotFoundProblem, UnauthorizedProblem } from "../errors/problem.js";
import { CheckoutService } from "./checkoutService.js";
import type { Cliente } from "./orderService.js";

const ITEM_NAO_ENCONTRADO = "Item não encontrado no seu carrinho.";
export const CARRINHO_MUDOU =
  "Seu carrinho mudou em outra aba ou dispositivo. Revise os itens antes de pagar.";
const ITEM_NAO_COMPRAVEL = "Um item do carrinho não pode mais ser comprado. Remova-o e tente de novo.";

/** JSON com as chaves em ordem: a mesma configuração dá sempre o mesmo texto. */
function canonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  if (valor !== null && typeof valor === "object") {
    const campos = Object.entries(valor as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${campos.map(([k, v]) => `${JSON.stringify(k)}:${canonico(v)}`).join(",")}}`;
  }
  return JSON.stringify(valor) ?? "null";
}

/** Identidade da linha: produto, fábrica e especificações. A quantidade fica de fora. */
export function chaveDoItem(item: Omit<AddCartItemDTO, "quantity">): string {
  const { quantity: _ignorada, ...especificacao } = item.customSpecs as Record<string, unknown>;
  return createHash("sha256")
    .update(canonico({
      productName: item.productName,
      factoryPublicId: item.factoryPublicId ?? null,
      factoryName: item.factoryName,
      customSpecs: especificacao,
    }))
    .digest("hex");
}

const CAMPOS_DA_LINHA = {
  id: true,
  publicId: true,
  productName: true,
  factoryPublicId: true,
  factoryName: true,
  customSpecs: true,
  quantidade: true,
  versao: true,
  pedido: { select: { status: true } },
} satisfies Prisma.CarrinhoItemSelect;

type Linha = Prisma.CarrinhoItemGetPayload<{ select: typeof CAMPOS_DA_LINHA }>;

/** O item gravado, validado de novo com as regras de hoje. null se não passa mais. */
function itemDaLinha(linha: Linha) {
  const resultado = cartItemSchema.safeParse({
    productName: linha.productName,
    ...(linha.factoryPublicId ? { factoryPublicId: linha.factoryPublicId } : {}),
    factoryName: linha.factoryName,
    customSpecs: linha.customSpecs,
    quantity: linha.quantidade,
  });
  return resultado.success ? resultado.data : null;
}

function respostaDaLinha(linha: Linha): { item: CartItemResponseDTO; totalEmCentavos: number } {
  const item = itemDaLinha(linha);
  // Uma linha que não passa mais na validação continua visível, sem preço,
  // para o cliente poder removê-la; o checkout a recusa.
  const preco = item ? precoDoItem(item.customSpecs, linha.quantidade) : { unitario: 0, total: 0 };
  return {
    item: {
      publicId: linha.publicId,
      productName: linha.productName,
      factoryPublicId: linha.factoryPublicId,
      factoryName: linha.factoryName,
      customSpecs: linha.customSpecs as Record<string, unknown>,
      quantity: linha.quantidade,
      unitPrice: centavosParaDecimal(preco.unitario),
      total: centavosParaDecimal(preco.total),
      paymentPending: linha.pedido?.status === PedidoStatus.Pending_Payment,
    },
    totalEmCentavos: preco.total,
  };
}

async function idDoDono(tx: Prisma.TransactionClient, usuarioPublicId: string): Promise<number> {
  const dono = await tx.usuario.findUnique({ where: { publicId: usuarioPublicId }, select: { id: true } });
  // Token de conta apagada: a sessão não vale mais.
  if (!dono) throw new UnauthorizedProblem("Sessão inválida.");
  return dono.id;
}

const linhasDoDono = (tx: Prisma.TransactionClient, usuarioPublicId: string) =>
  tx.carrinhoItem.findMany({
    where: { usuario: { publicId: usuarioPublicId } },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    select: CAMPOS_DA_LINHA,
  });

export class CartService {
  /** O carrinho da conta, com preços do servidor. */
  static async obter(usuarioPublicId: string): Promise<CartResponseDTO> {
    const linhas = await linhasDoDono(prisma, usuarioPublicId);
    const respostas = linhas.map(respostaDaLinha);
    const subtotal = respostas.reduce((soma, r) => soma + r.totalEmCentavos, 0);
    return { items: respostas.map(r => r.item), subtotal: centavosParaDecimal(subtotal) };
  }

  /**
   * Adiciona um item. A mesma configuração soma quantidade na linha que já
   * existe, num único INSERT ... ON CONFLICT: dois cliques simultâneos não
   * criam duas linhas nem perdem unidade.
   */
  static async adicionar(usuarioPublicId: string, item: AddCartItemDTO): Promise<{ criado: boolean; carrinho: CartResponseDTO }> {
    const chave = chaveDoItem(item);
    // A quantidade é a da linha; uma quantity dentro da especificação não vale.
    const { quantity: _ignorada, ...especificacao } = item.customSpecs as Record<string, unknown>;

    const criado = await prisma.$transaction(async (tx) => {
      const usuarioId = await idDoDono(tx, usuarioPublicId);

      // A fábrica é conferida na entrada, como no checkout: um item com fábrica
      // inexistente travaria a compra do carrinho inteiro depois.
      if (item.factoryPublicId) {
        const fabrica = await tx.usuario.findFirst({
          where: { publicId: item.factoryPublicId, role: "factory" },
          select: { id: true },
        });
        if (!fabrica) throw new BadRequestProblem("Fábrica não encontrada.");
      }

      const existente = await tx.carrinhoItem.findUnique({
        where: { usuarioId_chave: { usuarioId, chave } },
        select: { id: true },
      });
      if (!existente && await tx.carrinhoItem.count({ where: { usuarioId } }) >= LINHAS_MAXIMAS_NO_CARRINHO) {
        throw new BadRequestProblem(`O carrinho aceita até ${LINHAS_MAXIMAS_NO_CARRINHO} itens diferentes.`);
      }

      // A linha alterada perde o vínculo com o pedido do checkout anterior:
      // aquele pedido não cobre mais o que está no carrinho.
      const [linha] = await tx.$queryRaw<{ criada: boolean }[]>`
        INSERT INTO carrinho_itens
          (usuario_id, chave, product_name, factory_public_id, factory_name, custom_specs, quantidade)
        VALUES
          (${usuarioId}, ${chave}, ${item.productName}, ${item.factoryPublicId ?? null}, ${item.factoryName},
           ${JSON.stringify(especificacao)}::jsonb, ${item.quantity})
        ON CONFLICT (usuario_id, chave) DO UPDATE
          SET quantidade = carrinho_itens.quantidade + EXCLUDED.quantidade,
              versao = carrinho_itens.versao + 1,
              pedido_id = NULL,
              atualizado_em = CURRENT_TIMESTAMP
          WHERE carrinho_itens.quantidade + EXCLUDED.quantidade <= ${QUANTIDADE_MAXIMA_POR_ITEM}
        RETURNING (xmax = 0) AS criada`;

      if (!linha) {
        throw new BadRequestProblem(`A quantidade máxima por item é ${QUANTIDADE_MAXIMA_POR_ITEM}.`);
      }
      return linha.criada;
    });

    return { criado, carrinho: await CartService.obter(usuarioPublicId) };
  }

  /** Troca a quantidade de um item do próprio carrinho. */
  static async alterarQuantidade(usuarioPublicId: string, itemPublicId: string, quantidade: number): Promise<CartResponseDTO> {
    const { count } = await prisma.carrinhoItem.updateMany({
      where: { publicId: itemPublicId, usuario: { publicId: usuarioPublicId } },
      data: { quantidade, versao: { increment: 1 }, pedidoId: null, atualizadoEm: new Date() },
    });
    if (count === 0) throw new NotFoundProblem(ITEM_NAO_ENCONTRADO);
    return CartService.obter(usuarioPublicId);
  }

  /** Remove um item do próprio carrinho. */
  static async remover(usuarioPublicId: string, itemPublicId: string): Promise<CartResponseDTO> {
    const { count } = await prisma.carrinhoItem.deleteMany({
      where: { publicId: itemPublicId, usuario: { publicId: usuarioPublicId } },
    });
    if (count === 0) throw new NotFoundProblem(ITEM_NAO_ENCONTRADO);
    return CartService.obter(usuarioPublicId);
  }

  /** Esvazia o próprio carrinho. */
  static async esvaziar(usuarioPublicId: string): Promise<void> {
    await prisma.carrinhoItem.deleteMany({ where: { usuario: { publicId: usuarioPublicId } } });
  }

  /**
   * Cria a cobrança do carrinho da conta. Os pedidos saem das linhas do
   * banco, nunca do corpo; o corpo só prova que o cliente viu este
   * carrinho. Cada linha é vinculada, na mesma transação dos pedidos, ao
   * pedido que gerou, e só se ainda estiver na versão lida aqui.
   */
  static async finalizar(opcoes: {
    cliente: Cliente;
    snapshot: CheckoutCartSnapshotDTO;
    origens: { frontend: string; backend: string };
    traceId?: string;
  }): Promise<CheckoutResultDTO> {
    const { cliente, snapshot, origens, traceId } = opcoes;
    const linhas = await linhasDoDono(prisma, cliente.publicId);

    const vistas = new Map(snapshot.items.map(item => [item.publicId, item.quantity]));
    const igual = vistas.size === snapshot.items.length
      && linhas.length === vistas.size
      && linhas.every(linha => vistas.get(linha.publicId) === linha.quantidade);
    if (!igual) throw new ConflictProblem(CARRINHO_MUDOU);

    const cartItems = linhas.map(itemDaLinha);
    if (cartItems.some(item => item === null)) throw new ConflictProblem(ITEM_NAO_COMPRAVEL);

    return CheckoutService.finalizarCarrinho({
      cliente,
      cartItems: cartItems as NonNullable<(typeof cartItems)[number]>[],
      origens,
      traceId,
      aoCriarPedidos: async (tx, pedidoIds) => {
        for (const [indice, linha] of linhas.entries()) {
          const { count } = await tx.carrinhoItem.updateMany({
            where: { id: linha.id, versao: linha.versao },
            data: { pedidoId: pedidoIds[indice] },
          });
          // A linha mudou ou saiu depois da leitura: desfaz os pedidos.
          if (count !== 1) throw new ConflictProblem(CARRINHO_MUDOU);
        }
      },
    });
  }
}
