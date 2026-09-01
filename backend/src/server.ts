import app from "./app.js";
import { env } from "./config/env.js";
import logger from "./utils/logger.js";

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled Rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught Exception");
  process.exit(1);
});

app.listen(env.PORT, () => {
  logger.info(`🚀 OPTICUS Backend rodando na porta ${env.PORT}`);
});
