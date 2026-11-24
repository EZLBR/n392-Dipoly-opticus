// ============================================================
//   Espera por locks do PostgreSQL
//
//   Testes de concorrência precisam saber que uma requisição já
//   está parada num lock antes de liberar o outro lado. Perguntar
//   ao banco evita depender de um tempo fixo.
// ============================================================

import { pool } from "../setup/db.js";

export async function esperarBloqueios(quantidade = 1): Promise<void> {
  for (let tentativa = 0; tentativa < 150; tentativa++) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (rows[0].total >= quantidade) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Esperava ${quantidade} consulta(s) parada(s) em lock.`);
}
