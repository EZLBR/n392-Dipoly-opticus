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
import { simuladorDePagamentoAtivo } from "../config/pagamento.js";
import { routerGuard } from "../middlewares/routerGuard.js";
import { validateBody } from "../middlewares/validate.js";
import { createBillingSchema } from "../dtos/payment/payment.dto.js";

const router = express.Router();

// Webhook do AbacatePay (sem autenticação — chamado externamente)
router.post("/webhook", handleWebhook);

// Simulador Pix: existe só fora de produção. Em produção as rotas nem são
// registradas e caem no 404 padrão da API, igual a uma rota inexistente.
if (simuladorDePagamentoAtivo) {
  // A página contém dados pessoais: somente o dono autenticado pode consultá-la.
  router.get( "/simulated-checkout", routerGuard(), getSimulatedCheckoutPage);
  router.post("/confirm-simulated-payment", confirmSimulatedPayment);
}

// Criar cobrança (usuário autenticado)
router.post("/create-billing", routerGuard(), validateBody(createBillingSchema), createBilling);

// Listar todos os pagamentos (apenas staff)
router.get("/", routerGuard("staff"), getPayments);

export default router;
