// ============================================================
//   OPTICUS BACKEND — Montagem da aplicação Express
//
//   Este módulo apenas monta a app: middlewares, rotas e
//   handlers de erro. Não abre porta, não conecta no banco e
//   não executa DDL — isso é responsabilidade do server.ts.
//
//   A separação existe para que os testes possam importar a
//   app sem subir um listener nem criar tabelas, e atende ao
//   AGENTS.md §6: "Não execute DDL nem crie tabelas durante o
//   boot da aplicação".
// ============================================================

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import logger from "./utils/logger.js";

// ── Importação de Rotas ──────────────────────────────────
import authRoutes from "./routes/authRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import designRoutes from "./routes/designRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import stockRoutes from "./routes/stockRoutes.js";

export interface AppOptions {
  /**
   * Aplica rate limiting. Desligado por padrão em NODE_ENV=test,
   * porque o teto de 100 requisições por janela derrubaria a suíte.
   *
   * Um teste que exercite o próprio rate limiting deve construir a
   * app com `createApp({ rateLimit: true })`.
   */
  rateLimit?: boolean;

  /** Loga cada requisição. Desligado por padrão em teste, para não poluir a saída. */
  requestLogging?: boolean;
}

export function createApp(options: AppOptions = {}) {
  const isTest = process.env.NODE_ENV === "test";
  const {
    rateLimit: enableRateLimit = !isTest,
    requestLogging = !isTest,
  } = options;

  const app = express();

  // ── CORS ───────────────────────────────────────────────
  //   Aceita localhost (dev) + a URL de produção do frontend
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    process.env.FRONTEND_URL,
  ].filter((origin): origin is string => Boolean(origin));

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origem não permitida pela política CORS."));
      },
      credentials: true,
    })
  );

  // ── Cabeçalhos de segurança ────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    })
  );

  // ── Rate limiting ──────────────────────────────────────
  if (enableRateLimit) {
    app.use(
      "/api/auth/login",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        message: "Too many login attempts, please try again later",
      })
    );

    app.use(
      "/api",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: "Too many requests from this IP, please try again after 15 minutes",
      })
    );
  }

  // ── Limite de payload ──────────────────────────────────
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  // ── Log de requisições ─────────────────────────────────
  if (requestLogging) {
    app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.url}`);
      next();
    });
  }

  // ── Registro de Rotas ──────────────────────────────────
  app.use("/api/auth", authRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/designs", designRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/stock", stockRoutes);

  // ── Health Check ───────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ success: true, status: "Server is healthy and responsive." });
  });

  // ── 404 global ─────────────────────────────────────────
  app.use((req, res) => {
    logger.info(`[404] Route Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      success: false,
      error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    });
  });

  // ── Handler global de erros ────────────────────────────
  //   TODO(API-02): substituir pelo middleware RFC 9457 e parar
  //   de devolver `details` ao cliente (API-05).
  app.use(
    (
      err: Error,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error({ err, req: { method: req.method, url: req.url } }, "Unhandled Error");
      res.status(500).json({
        success: false,
        error: "Ocorreu um erro interno no servidor.",
        details: err.message,
      });
    }
  );

  return app;
}

export default createApp;
