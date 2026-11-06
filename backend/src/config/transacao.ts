// ============================================================
//   TRANSAÇÃO — BEGIN/COMMIT/ROLLBACK com a conexão sempre liberada
//
//   Toda transação com o pool pg passa por aqui (CONC-03):
//
//   - a conexão é liberada no finally, em qualquer caminho. Com o
//     release só no catch, um ROLLBACK que falhasse vazava a conexão,
//     e o pool, de 10, travava a API depois de 10 falhas;
//   - a falha no ROLLBACK vai para o log e não esconde o erro que
//     causou o desfazimento: é esse que é relançado;
//   - depois de um ROLLBACK que falhou, a conexão fica em estado
//     desconhecido (pode ter ficado com a transação aberta). Ela é
//     descartada com release(erro), em vez de voltar ao pool.
// ============================================================

import type { PoolClient } from "pg";
import pool from "./db.js";
import logger from "../utils/logger.js";

/** Abre a transação, entrega a conexão a `trabalho` e faz COMMIT se ele terminar; ROLLBACK se lançar. */
export async function emTransacao<T>(
  trabalho: (conexao: PoolClient) => Promise<T>,
  contexto: { traceId?: string } = {},
): Promise<T> {
  const conexao = await pool.connect();
  let conexaoComprometida: Error | undefined;

  try {
    await conexao.query("BEGIN");
    const resultado = await trabalho(conexao);
    await conexao.query("COMMIT");
    return resultado;
  } catch (erro) {
    try {
      await conexao.query("ROLLBACK");
    } catch (erroDoRollback) {
      conexaoComprometida = erroDoRollback instanceof Error ? erroDoRollback : new Error(String(erroDoRollback));
      logger.error(
        {
          err: erroDoRollback,
          causa: erro instanceof Error ? erro.message : String(erro),
          traceId: contexto.traceId,
          requestId: contexto.traceId,
        },
        "Falha no ROLLBACK: a conexão foi descartada do pool",
      );
    }
    throw erro;
  } finally {
    conexao.release(conexaoComprometida);
  }
}
