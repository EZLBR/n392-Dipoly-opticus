// ============================================================
//   OPTICUS — Conexão com PostgreSQL
//   Driver   : pg
//   Estratégia: Pool de conexões (reutiliza, não reabre)
//
//   O schema é gerenciado por Prisma Migrate.
//   Este arquivo configura apenas o pool de conexão legado (pg).
// ============================================================

import pg from "pg";
import type { PoolConfig } from "pg";
const { Pool } = pg;
import { env } from "./env.js";

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
};

if (process.env.DB_SSL === "true" ||
   (poolConfig.host && poolConfig.host.includes("supabase.com")) ||
   env.DATABASE_URL.includes("supabase.com")) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

export default pool;
