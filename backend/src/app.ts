import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { NotFoundProblem, TooManyRequestsProblem } from "./errors/problem.js";
import { problemErrorHandler } from "./middlewares/problemErrorHandler.js";
import { rejectNulBytes } from "./middlewares/rejectNulBytes.js";
import { requestId } from "./middlewares/requestId.js";
import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import designRoutes from "./routes/designRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import stockRoutes from "./routes/stockRoutes.js";
import { createStudioAssetRoutes } from "./routes/studioAssetRoutes.js";
import logger from "./utils/logger.js";

export interface AppOptions {
  rateLimit?: boolean;
  requestLogging?: boolean;
}

export function createApp(options: AppOptions = {}) {
  const isTest = env.NODE_ENV === "test";
  const {
    rateLimit: enableRateLimit = !isTest,
    requestLogging = !isTest,
  } = options;

  const app = express();
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    env.FRONTEND_URL,
  ];

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
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );

  app.use(requestId());

  if (enableRateLimit) {
    for (const [path, limit] of [["forgot-password", 5], ["reset-password", 10]] as const) {
      app.use(`/api/auth/${path}`, rateLimit({
        windowMs: 15 * 60 * 1000,
        limit,
        handler: (_req, _res, next) => {
          next(new TooManyRequestsProblem("Muitas tentativas. Tente novamente mais tarde."));
        },
      }));
    }
    app.use(
      ["/api/auth/login", "/api/auth/google"],
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        handler: (_req, _res, next) => {
          next(
            new TooManyRequestsProblem(
              "Muitas tentativas de login. Tente novamente mais tarde.",
            ),
          );
        },
      }),
    );

    app.use(
      "/api",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        handler: (_req, _res, next) => {
          next(
            new TooManyRequestsProblem(
              "Muitas requisições a partir deste IP. Tente novamente em 15 minutos.",
            ),
          );
        },
      }),
    );
  }

  app.use(
    express.json({
      limit: "1mb",
      // Guarda os bytes crus do corpo: a assinatura HMAC do webhook
      // (SEC-04) é calculada sobre o corpo exato recebido, não sobre a
      // reserialização de `req.body`.
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  // O PostgreSQL não aceita U+0000: sem esta guarda, `%00` virava 500.
  app.use(rejectNulBytes());

  if (requestLogging) {
    app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  app.use("/api/auth", authRoutes);
  app.use("/api/orders", orderRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/designs", designRoutes);
  app.use("/api/products", productRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/stock", stockRoutes);
  app.use("/api/studio/assets", createStudioAssetRoutes(enableRateLimit));

  app.get("/health", (_req, res) => {
    res.json({ success: true, status: "Server is healthy and responsive." });
  });

  // Rota não encontrada → problema de negócio no mesmo padrão Problem Details.
  app.use((req, _res, next) => {
    logger.info(`[404] Route Not Found: ${req.method} ${req.path}`);
    next(new NotFoundProblem(`Rota não encontrada: ${req.method} ${req.path}`));
  });

  app.use(problemErrorHandler);
  return app;
}

export default createApp;
