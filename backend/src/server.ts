import { createApp } from "./app.js";
import pool from "./config/db.js";
import { env } from "./config/env.js";
import logger from "./utils/logger.js";

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled Rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught Exception");
  process.exit(1);
});

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 OPTICUS Backend rodando na porta ${env.PORT}`);
});

async function shutdown(signal: string) {
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
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
