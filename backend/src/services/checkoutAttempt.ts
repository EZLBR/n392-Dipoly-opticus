import { PedidoStatus, type Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";

type ResultadoLocal =
  | { tipo: "associar"; billingId: string; simulado: boolean }
  | { tipo: "desfazer" };

/** Desfaz a transação quando alguma linha já não pertence mais à tentativa. */
class TentativaAlterada extends Error {}

/** Todas as linhas ainda devem pertencer à tentativa, ou nenhuma é alterada. */
export async function concluirTentativaDeCheckout(opcoes: {
  /** Ids internos dos pedidos criados nesta tentativa; nunca saem do servidor. */
  pedidoIds: number[];
  /** ID-02: o dono vem do publicId do token, resolvido na própria guarda. */
  usuarioPublicId: string;
  billingIdProvisorio: string;
  resultado: ResultadoLocal;
}): Promise<boolean> {
  const { pedidoIds, usuarioPublicId, billingIdProvisorio, resultado } = opcoes;
  if (!pedidoIds.length) return false;

  const guarda = {
    id: { in: pedidoIds },
    usuario: { publicId: usuarioPublicId },
    abacateBillingId: billingIdProvisorio,
    status: PedidoStatus.Pending_Payment,
    pagamentoSimulado: false,
  } satisfies Prisma.PedidoWhereInput;

  try {
    await prisma.$transaction(async (tx) => {
      const { count } = resultado.tipo === "desfazer"
        ? await tx.pedido.deleteMany({ where: guarda })
        : await tx.pedido.updateMany({
            where: guarda,
            data: { abacateBillingId: resultado.billingId, pagamentoSimulado: resultado.simulado },
          });
      if (count !== pedidoIds.length) throw new TentativaAlterada();
    });
    return true;
  } catch (err) {
    if (err instanceof TentativaAlterada) return false;
    throw err;
  }
}
