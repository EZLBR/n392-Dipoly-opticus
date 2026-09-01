// ============================================================
//   Banco de teste — guarda de segurança e limpeza entre testes
// ============================================================

import pool from "../../src/config/db.js";

/**
 * Recusa rodar a suíte fora de um banco dedicado a testes.
 *
 * AGENTS.md §10: "não use o banco de desenvolvimento nos testes".
 * Sem esta guarda, um `.env` errado faz o TRUNCATE apagar o banco
 * de trabalho de alguém do time.
 */
export function assertBancoDeTeste(): void {
  const url = process.env.DATABASE_URL?.trim();
  const nome = url ? nomeDoBancoNaUrl(url) : process.env.DB_NAME?.trim();

  if (!nome) {
    throw new Error(
      "Nenhum banco configurado para os testes. Defina DATABASE_URL ou DB_NAME em backend/.env.test"
    );
  }

  if (!nome.endsWith("_test")) {
    throw new Error(
      `Recusando rodar os testes: o banco "${nome}" não termina em "_test".\n` +
        "Aponte DATABASE_URL (ou DB_NAME) para um banco dedicado, por exemplo opticus_test.\n" +
        "Ver backend/.env.test.example."
    );
  }
}

function nomeDoBancoNaUrl(url: string): string | undefined {
  try {
    // postgresql://user:pass@host:5432/opticus_test?sslmode=require
    return new URL(url).pathname.replace(/^\//, "") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Devolve o banco ao estado vazio.
 *
 * A lista de tabelas é descoberta em tempo de execução para que a suíte
 * continue correta quando o schema mudar — inclusive na migração para
 * Prisma (DB-01/DB-02), que renomeia tabelas.
 *
 * `RESTART IDENTITY` zera as sequências, então os ids não vazam de um
 * teste para o outro. `CASCADE` cuida das chaves estrangeiras.
 */
export async function limparBanco(): Promise<void> {
  const { rows } = await pool.query<{ tabela: string }>(
    `SELECT quote_ident(tablename) AS tabela
       FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT IN ('migrations', '_prisma_migrations')`
  );

  if (rows.length === 0) return;

  const tabelas = rows.map((r) => r.tabela).join(", ");
  await pool.query(`TRUNCATE ${tabelas} RESTART IDENTITY CASCADE`);
}

export { pool };
