import cors from "cors";
import express from "express";
import type { ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { env } from "./config/env.js";
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

  if (enableRateLimit) {
    app.use(
      "/api/auth/login",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        message: "Too many login attempts, please try again later",
      }),
    );

    app.use(
      "/api",
      rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: "Too many requests from this IP, please try again after 15 minutes",
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

  app.use((req, res) => {
    logger.info(`[404] Route Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
      success: false,
      error: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    });
  });

  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    logger.error(
      { err, req: { method: req.method, url: req.url } },
      "Unhandled Error",
    );
    res.status(500).json({
      success: false,
      error: "Ocorreu um erro interno no servidor.",
      details: err.message,
    });
  };

  app.use(errorHandler);
  return app;
}

export default createApp;
