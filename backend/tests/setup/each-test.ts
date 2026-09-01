// ============================================================
//   Roda antes de cada arquivo de teste
//
//   A limpeza é por teste, não por arquivo: é isso que torna a
//   suíte independente da ordem de execução, conforme o
//   critério de aceite do TEST-01.
// ============================================================

import { beforeEach, afterAll } from "vitest";
import { limparBanco, pool } from "./db.js";

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await pool.end();
});
