// ════════════════════════════════════════════════════════════
//   LEGADO — NÃO é mais a fonte de verdade do schema.
//   Desde 2026-09-01 (PR de Bloco 2: Prisma Migrations cutover).
//   Ver `prisma/schema.prisma` e `prisma/migrations/`.
//
//   Mantido apenas para referência histórica / rollback.
//   Não use. O mecanismo de migração agora é `prisma migrate deploy`.
// ════════════════════════════════════════════════════════════
import pool from '../config/db.js';
import logger from '../utils/logger.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  logger.info("Starting database migrations...");

  // Create migrations table if not exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationsDir = path.join(__dirname, '../../migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir);
    logger.info("Created migrations directory.");
  }

  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM migrations WHERE name = $1", [file]);
    if (rows.length === 0) {
      logger.info(`Executing migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      try {
        await pool.query('BEGIN');
        await pool.query(sql);
        await pool.query("INSERT INTO migrations (name) VALUES ($1)", [file]);
        await pool.query('COMMIT');
        logger.info(`Migration ${file} executed successfully.`);
      } catch (err) {
        await pool.query('ROLLBACK');
        logger.error({ err }, `Migration ${file} failed`);
        process.exit(1);
      }
    }
  }

  logger.info("All migrations executed.");
  process.exit(0);
}

runMigrations();
