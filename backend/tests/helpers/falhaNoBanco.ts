// ============================================================
//   Falha real do PostgreSQL, sem simular a persistência
//
//   Um trigger temporário faz o próprio banco recusar a operação,
//   com o SQLSTATE escolhido. O código da aplicação recebe o erro
//   verdadeiro do driver, como receberia em produção. O trigger é
//   removido no fim, mesmo se o teste falhar.
// ============================================================

import { pool } from "../setup/db.js";

interface Falha {
  tabela: string;
  evento: "INSERT" | "UPDATE";
  sqlstate: string;
  mensagem: string;
  /** Nome de constraint anexado ao erro, como o PostgreSQL faz numa violação. */
  constraint?: string;
  /**
   * A recusa só acontece no COMMIT, depois de todas as instruções da
   * transação (trigger de constraint adiado). Separa o código que grava tudo
   * numa transação do que grava parte por fora: só o primeiro desfaz tudo.
   */
  noCommit?: boolean;
}

export async function comFalhaNoBanco<T>(falha: Falha, acao: () => Promise<T>): Promise<T> {
  const nome = `teste_falha_${falha.tabela}`;
  const literal = (texto: string) => `'${texto.replaceAll("'", "''")}'`;
  const extras = falha.constraint ? `, CONSTRAINT = ${literal(falha.constraint)}` : "";

  await pool.query(`CREATE FUNCTION ${nome}() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION ${literal(falha.mensagem)} USING ERRCODE = ${literal(falha.sqlstate)}${extras}; END; $$`);
  await pool.query(falha.noCommit
    ? `CREATE CONSTRAINT TRIGGER ${nome} AFTER ${falha.evento} ON ${falha.tabela}
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${nome}()`
    : `CREATE TRIGGER ${nome} BEFORE ${falha.evento} ON ${falha.tabela}
        FOR EACH ROW EXECUTE FUNCTION ${nome}()`);

  try {
    return await acao();
  } finally {
    await pool.query(`DROP TRIGGER IF EXISTS ${nome} ON ${falha.tabela}`);
    await pool.query(`DROP FUNCTION IF EXISTS ${nome}()`);
  }
}
