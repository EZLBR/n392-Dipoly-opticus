import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
import { NotFoundProblem, TooManyRequestsProblem } from "./errors/problem.js";
import { problemErrorHandler } from "./middlewares/problemErrorHandler.js";
import { requestId } from "./middlewares/requestId.js";
import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import designRoutes from "./routes/designRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import stockRoutes from "./routes/stockRoutes.js";
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
    app.use(
      "/api/auth/login",
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

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));

  if (requestLogging) {
    app.use((req, _res, next) => {
      logger.info(`${req.method} ${req.url}`);
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

  app.get("/health", (_req, res) => {
    res.json({ success: true, status: "Server is healthy and responsive." });
  });

  // Rota não encontrada → problema de negócio no mesmo padrão Problem Details.
  app.use((req, _res, next) => {
    logger.info(`[404] Route Not Found: ${req.method} ${req.originalUrl}`);
    next(new NotFoundProblem(`Rota não encontrada: ${req.method} ${req.originalUrl}`));
  });

  app.use(problemErrorHandler);
  return app;
}

export default createApp;
