// ============================================================
//   OPTICUS BACKEND — Servidor Principal
//   Express.js + PostgreSQL
// ============================================================

import express  from "express";
import cors     from "cors";
import dotenv   from "dotenv";
import logger   from "./utils/logger.js";
import { initializeDatabase } from "./config/db.js";
import helmet   from "helmet";
import rateLimit from "express-rate-limit";

// ── Importação de Rotas ──────────────────────────────────
import authRoutes     from "./routes/authRoutes.js";
import orderRoutes    from "./routes/orderRoutes.js";
import paymentRoutes  from "./routes/paymentRoutes.js";
import designRoutes   from "./routes/designRoutes.js";
import productRoutes  from "./routes/productRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import stockRoutes    from "./routes/stockRoutes.js";

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Middlewares Globais ──────────────────────────────────
//   CORS: aceita localhost (dev) + Vercel (produção)
//   FRONTEND_URL = URL exata do Vercel (definida no Railway após o deploy)
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  process.env.FRONTEND_URL,           // ex: https://di-poly-opticus.vercel.app
].filter((origin): origin is string => Boolean(origin));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origem não permitida pela política CORS."));
  },
  credentials: true
}));

// Segurança e Sanitização
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));
// Limite de Requisições (Rate Limiting)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limite de 100 requisições por IP
  message: "Too many requests from this IP, please try again after 15 minutes",
});
app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Apenas 15 tentativas de login por IP
  message: "Too many login attempts, please try again later",
}));
app.use("/api", limiter);

// Prevenção contra Payloads gigantes
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Logger de requisições
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// ── Registro de Rotas ────────────────────────────────────
//   Cada rota tem um prefixo /api/<recurso>

app.use("/api/auth",       authRoutes);       // /api/auth/register, /api/auth/login ...
app.use("/api/orders",     orderRoutes);      // /api/orders, /api/orders/:id/status ...
app.use("/api/payments",   paymentRoutes);    // /api/payments/create-billing, /webhook ...
app.use("/api/designs",    designRoutes);     // /api/designs (Creator Studio)
app.use("/api/products",   productRoutes);    // /api/products (catálogo)
app.use("/api/categories", categoryRoutes);   // /api/categories
app.use("/api/stock",      stockRoutes);      // /api/stock (controle de estoque)

// ── Health Check ─────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ success: true, status: "Server is healthy and responsive." });
});

// Global 404 Handler - Para interceptar rotas não encontradas
app.use((req, res, next) => {
  logger.info(`[404] Route Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ success: false, error: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

// ── Handler Global de Erros ───────────────────────────────
app.use((err, req, res, next) => {
  logger.error({ err, req: { method: req.method, url: req.url } }, "Unhandled Error");
  res.status(500).json({ success: false, error: "Ocorreu um erro interno no servidor.", details: err.message });
});

// ── Inicialização ─────────────────────────────────────────
async function startServer() {
  // Inicializa o banco (cria tabelas se necessário) antes de aceitar requisições
  await initializeDatabase();

  app.listen(PORT, () => {
    logger.info(`🚀 OPTICUS Backend rodando na porta ${PORT}`);
  });
}

// Trata rejections e exceptions para o servidor não cair silenciosamente
process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ reason, promise }, "Unhandled Rejection");
});

process.on("uncaughtException", (error) => {
  logger.fatal({ error }, "Uncaught Exception");
  process.exit(1);
});

startServer();
