// ============================================================
//   Preparação do banco de teste — roda uma vez, antes de tudo
//
//   ESTE É O ÚNICO PONTO QUE MUDA QUANDO O PRISMA CHEGAR.
//
//   Hoje: cria o schema pelo initializeDatabase() do legado.
//   No DB-02: trocar por `prisma migrate deploy` contra o banco
//   de teste. Nenhum outro arquivo da suíte precisa mudar.
// ============================================================

import { assertBancoDeTeste } from "./db.js";
import pool, { initializeDatabase } from "../../src/config/db.js";

export async function setup(): Promise<void> {
  assertBancoDeTeste();

  // Checagem de conectividade antes de qualquer DDL: o
  // initializeDatabase() do legado chama process.exit(1) em caso de
  // falha, o que produz uma saída confusa. Falhar aqui dá uma
  // mensagem que diz o que fazer.
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    // Erros de conexão do pg costumam trazer `code` (ECONNREFUSED, 3D000…)
    // e mensagem vazia — sem isso o motivo sai em branco.
    const e = err as { message?: string; code?: string };
    const motivo = [e.message, e.code].filter(Boolean).join(" ") || String(err);
    throw new Error(
      `Não foi possível conectar ao banco de teste: ${motivo}\n\n` +
        "Verifique se o PostgreSQL está rodando e se backend/.env.test aponta\n" +
        "para um banco existente. Para criar:\n\n" +
        "  createdb opticus_test\n"
    );
  }

  // TODO(DB-02): substituir por `prisma migrate deploy`.
  await initializeDatabase();
}

export async function teardown(): Promise<void> {
  await pool.end();
}
