import pool from "../config/db.js";

type ResultadoLocal =
  | { tipo: "associar"; billingId: string; simulado: boolean }
  | { tipo: "desfazer" };

/** Todas as linhas ainda devem pertencer à tentativa, ou nenhuma é alterada. */
export async function concluirTentativaDeCheckout(opcoes: {
  pedidoIds: number[];
  usuarioId: number;
  billingIdProvisorio: string;
  resultado: ResultadoLocal;
}): Promise<boolean> {
  const { pedidoIds, usuarioId, billingIdProvisorio, resultado } = opcoes;
  if (!pedidoIds.length) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const guarda = `WHERE id = ANY($1::int[]) AND usuario_id = $2
                      AND abacate_billing_id = $3 AND status = 'Pending Payment'
                      AND pagamento_simulado = false`;
    const parametros = [pedidoIds, usuarioId, billingIdProvisorio];
    const { rowCount } = resultado.tipo === "desfazer"
      ? await client.query(`DELETE FROM pedidos ${guarda}`, parametros)
      : await client.query(
          `UPDATE pedidos SET abacate_billing_id = $4, pagamento_simulado = $5 ${guarda}`,
          [...parametros, resultado.billingId, resultado.simulado]);
    if (rowCount !== pedidoIds.length) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
