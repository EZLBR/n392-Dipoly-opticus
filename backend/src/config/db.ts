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
import dotenv from "dotenv";
dotenv.config();

const poolConfig: PoolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_NAME || "opticus_db",
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    };

if (process.env.DB_SSL === "true" ||
   (poolConfig.host && poolConfig.host.includes("supabase.com")) ||
   (process.env.DATABASE_URL && process.env.DATABASE_URL.includes("supabase.com"))) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

export default pool;
