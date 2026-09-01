// ============================================================
//   Preparação do banco de teste — roda uma vez, antes de tudo
//
//   Aplica as migrations do Prisma contra o banco de teste,
//   garantindo que o schema esteja atualizado antes dos testes
//   de integração.
// ============================================================

import { execSync } from "child_process";
import { assertBancoDeTeste } from "./db.js";
import pool from "../../src/config/db.js";

export async function setup(): Promise<void> {
  assertBancoDeTeste();

  try {
    await pool.query("SELECT 1");
  } catch (err) {
    const e = err as { message?: string; code?: string };
    const motivo = [e.message, e.code].filter(Boolean).join(" ") || String(err);
    throw new Error(
      `Não foi possível conectar ao banco de teste: ${motivo}\n\n` +
        "Verifique se o PostgreSQL está rodando e se backend/.env.test aponta\n" +
        "para um banco existente. Para criar:\n\n" +
        "  createdb opticus_test\n"
    );
  }

  execSync("npx prisma migrate deploy", {
    env: { ...process.env },
    stdio: "inherit",
  });
}

export async function teardown(): Promise<void> {
  await pool.end();
}
