// ============================================================
//   PAYMENT ROUTES
//   Base: /api/payments
// ============================================================

import express from "express";
import {
  createBilling,
  getSimulatedCheckoutPage,
  confirmSimulatedPayment,
  handleWebhook,
  getPayments
} from "../controllers/paymentController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

// Webhook do AbacatePay (sem autenticação — chamado externamente)
router.post("/webhook", handleWebhook);

// Simulador Pix (sem autenticação — página HTML pública)
router.get( "/simulated-checkout",        getSimulatedCheckoutPage);
router.post("/confirm-simulated-payment", confirmSimulatedPayment);

// Criar cobrança (usuário autenticado)
router.post("/create-billing", protect, createBilling);

// Listar todos os pagamentos (apenas staff)
router.get("/", protect, authorize("staff"), getPayments);

export default router;
