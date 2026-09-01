// ============================================================
//   OPTICUS BACKEND — Ciclo de vida do servidor
//   Express.js + PostgreSQL
//
//   A montagem da aplicação vive em src/app.ts. Aqui ficam
//   apenas inicialização, listener e encerramento.
//
//   O schema do banco é gerenciado por Prisma Migrate,
//   executado como passo próprio do deploy (não no boot).
// ============================================================

import dotenv from "dotenv";
import logger from "./utils/logger.js";
import { createApp } from "./app.js";
import pool from "./config/db.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

async function startServer() {
  const app = createApp();

  const server = app.listen(PORT, () => {
    logger.info(`🚀 OPTICUS Backend rodando na porta ${PORT}`);
  });

  // ── Encerramento gracioso ────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info(`${signal} recebido — encerrando graciosamente...`);
    server.close(async () => {
      try {
        await pool.end();
        logger.info("Pool do PostgreSQL encerrado.");
      } catch (err) {
        logger.error({ err }, "Falha ao encerrar o pool do PostgreSQL");
      } finally {
        process.exit(0);
      }
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled Rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught Exception");
  process.exit(1);
});

startServer();
