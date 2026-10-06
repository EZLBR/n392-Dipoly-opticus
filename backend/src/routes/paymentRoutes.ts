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
import { routerGuard } from "../middlewares/routerGuard.js";
import { validateBody } from "../middlewares/validate.js";
import { createBillingSchema } from "../dtos/payment/payment.dto.js";

const router = express.Router();

// Webhook do AbacatePay (sem autenticação — chamado externamente)
router.post("/webhook", handleWebhook);

// Simulador Pix (sem autenticação — página HTML pública)
router.get( "/simulated-checkout",        getSimulatedCheckoutPage);
router.post("/confirm-simulated-payment", confirmSimulatedPayment);

// Criar cobrança (usuário autenticado)
router.post("/create-billing", routerGuard(), validateBody(createBillingSchema), createBilling);

// Listar todos os pagamentos (apenas staff)
router.get("/", routerGuard("staff"), getPayments);

export default router;
