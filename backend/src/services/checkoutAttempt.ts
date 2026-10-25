import { emTransacao } from "../config/transacao.js";

type ResultadoLocal =
  | { tipo: "associar"; billingId: string; simulado: boolean }
  | { tipo: "desfazer" };

/** Desfaz a transação quando alguma linha já não pertence mais à tentativa. */
class TentativaAlterada extends Error {}

/** Todas as linhas ainda devem pertencer à tentativa, ou nenhuma é alterada. */
export async function concluirTentativaDeCheckout(opcoes: {
  pedidoIds: number[];
  usuarioId: number;
  billingIdProvisorio: string;
  resultado: ResultadoLocal;
}): Promise<boolean> {
  const { pedidoIds, usuarioId, billingIdProvisorio, resultado } = opcoes;
  if (!pedidoIds.length) return false;
  try {
    await emTransacao(async (client) => {
      const guarda = `WHERE id = ANY($1::int[]) AND usuario_id = $2
                        AND abacate_billing_id = $3 AND status = 'Pending Payment'
                        AND pagamento_simulado = false`;
      const parametros = [pedidoIds, usuarioId, billingIdProvisorio];
      const { rowCount } = resultado.tipo === "desfazer"
        ? await client.query(`DELETE FROM pedidos ${guarda}`, parametros)
        : await client.query(
            `UPDATE pedidos SET abacate_billing_id = $4, pagamento_simulado = $5 ${guarda}`,
            [...parametros, resultado.billingId, resultado.simulado]);
      if (rowCount !== pedidoIds.length) throw new TentativaAlterada();
    });
    return true;
  } catch (err) {
    if (err instanceof TentativaAlterada) return false;
    throw err;
  }
}
