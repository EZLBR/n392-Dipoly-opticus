// ============================================================
//   PAYMENT ROUTES
//   Base: /api/payments
// ============================================================

import express from "express";
import { simuladorDePagamentoAtivo } from "../config/pagamento.js";
import {
  createBilling,
  getSimulatedCheckoutPage,
  confirmSimulatedPayment,
  handleWebhook,
  getPayments
} from "../controllers/paymentController.js";
import { routerGuard } from "../middlewares/routerGuard.js";
import { protect } from "../middlewares/auth.js";
import { validateBody } from "../middlewares/validate.js";
import { createBillingSchema } from "../dtos/payment/payment.dto.js";

const router = express.Router();

// Webhook do AbacatePay (sem autenticação — chamado externamente)
router.post("/webhook", handleWebhook);

// A página contém dados pessoais: somente o dono autenticado pode consultá-la.
if (simuladorDePagamentoAtivo) {
  router.get( "/simulated-checkout", routerGuard(), getSimulatedCheckoutPage);
  // A confirmação aprova o pagamento: exige o dono autenticado (SEC-01).
  router.post("/confirm-simulated-payment", protect, confirmSimulatedPayment);
}

// Criar cobrança (usuário autenticado)
router.post("/create-billing", routerGuard(), validateBody(createBillingSchema), createBilling);

// Listar todos os pagamentos (apenas staff)
router.get("/", routerGuard("staff"), getPayments);

export default router;
