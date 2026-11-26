// ============================================================
//   PAYMENT CONTROLLER — AbacatePay e registro de pagamentos
//
//   DB-03: adapta o HTTP. A regra e o acesso ao banco ficam no
//   PaymentService. Aqui ficam o que é do protocolo: a assinatura
//   do webhook, o contrato do evento e a página do simulador.
// ============================================================

import type { Request, Response } from "express";
import { env, getWebhookSecret } from "../config/env.js";
import type { CreateBillingDTO } from "../dtos/payment/payment.dto.js";
import { BadRequestProblem, UnauthorizedProblem } from "../errors/problem.js";
import { PaymentService } from "../services/paymentService.js";
import { assinaturaWebhookValida, textoSecretoIgual } from "../services/webhookSignature.js";
import { publicIdDoUsuario } from "../utils/identidade.js";
import logger from "../utils/logger.js";
import { origensDaRequisicao } from "../utils/origens.js";
import { parsePagination } from "../utils/pagination.js";

// Security Helper
const escapeHTML = (str: unknown) => {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// ─────────────────────────────────────────────────────────
//   CRIAR COBRANÇA (AbacatePay ou simulador)
//   POST /api/payments/create-billing
// ─────────────────────────────────────────────────────────
export async function createBilling(req: Request, res: Response) {
  const { orderPublicId } = req.body as CreateBillingDTO;

  // A posse é resolvida na própria consulta, no service, a partir do token.
  const resultado = await PaymentService.criarCobranca({
    ator:    { publicId: publicIdDoUsuario(req), role: String(req.user!.role) },
    orderPublicId,
    origens: origensDaRequisicao(req),
    traceId: req.requestId,
  });

  return res.json(resultado);
}

// ─────────────────────────────────────────────────────────
//   LISTAR PAGAMENTOS
//   GET /api/payments  (apenas staff)
// ─────────────────────────────────────────────────────────
export async function getPayments(req: Request, res: Response) {
  const pagination = parsePagination(req.query);
  if (!pagination.isValid) {
    throw new BadRequestProblem(pagination.error);
  }

  return res.json(await PaymentService.listar(pagination));
}

// ─────────────────────────────────────────────────────────
//   CONFIRMAR PAGAMENTO (webhook do AbacatePay)
//   POST /api/payments/webhook
//
//   SEC-04: contrato oficial v2. Autenticação pelo segredo privado da
//   URL E integridade por HMAC base64 do corpo cru, com chave pública.
// ─────────────────────────────────────────────────────────
export async function handleWebhook(req: Request, res: Response) {
  const payload = req.body as { event?: string; devMode?: boolean; data?: { checkout?: { id?: unknown; status?: unknown } } } | null;
  const assinatura = req.headers["x-webhook-signature"];

  // A assinatura vem antes de qualquer efeito.
  if (
    !textoSecretoIgual(req.query.webhookSecret, getWebhookSecret()) ||
    !assinaturaWebhookValida(req.rawBody, assinatura)
  ) {
    logger.warn(
      {
        traceId: req.requestId,
        requestId: req.requestId,
        temAssinatura: Boolean(assinatura),
      },
      "[Webhook] Requisição rejeitada: assinatura ausente ou inválida",
    );
    throw new UnauthorizedProblem("Assinatura do webhook inválida.");
  }

  const checkout = payload?.data?.checkout;
  if (payload?.event === "checkout.completed" && checkout?.status === "PAID" &&
      typeof checkout.id === "string" && checkout.id.trim() &&
      (env.NODE_ENV !== "production" || payload.devMode === false)) {
    const processados = await PaymentService.confirmarPeloGateway(checkout.id);
    logger.info({ traceId: req.requestId, pedidos: processados }, "[Webhook] Pagamento processado.");
  }

  return res.status(200).json({ received: true });
}

// ─────────────────────────────────────────────────────────
//   PÁGINA DE CHECKOUT SIMULADO (visual Pix)
//   GET /api/payments/simulated-checkout
// ─────────────────────────────────────────────────────────
const simulatedCheckoutCopy = {
  pt: {
    language: "pt-BR",
    title: "Simulador AbacatePay | Opticus",
    simulator: "SIMULADOR",
    hint: "Confirme o pagamento simulado pela loja.",
    items: "Itens",
    billing: "Cobrança",
    customer: "Cliente",
    error: "Falha ao carregar checkout.",
  },
  en: {
    language: "en",
    title: "AbacatePay Simulator | Opticus",
    simulator: "SIMULATOR",
    hint: "Confirm the simulated payment in the store.",
    items: "Items",
    billing: "Billing",
    customer: "Customer",
    error: "Couldn't load checkout.",
  },
};

/**
 * Formata o texto decimal exato, sem converter para float. O Intl aceita
 * texto desde o ES2023; o lib do TypeScript em ES2022 ainda só declara number.
 */
const formatarReais = (moeda: Intl.NumberFormat, valor: string) => (moeda.format as unknown as (v: string) => string)(valor);

export async function getSimulatedCheckoutPage(req: Request, res: Response) {
  const { billingId } = req.query;
  res.set("Cache-Control", "private, no-store");

  // API-04: erros em Problem Details. SEC-03: só o dono autenticado vê a cobrança.
  if (typeof billingId !== "string" || !billingId.trim()) {
    throw new BadRequestProblem("billingId ausente.");
  }

  const checkout = await PaymentService.checkoutSimulado(publicIdDoUsuario(req), billingId);

  const copy = req.acceptsLanguages("pt", "en") === "en" ? simulatedCheckoutCopy.en : simulatedCheckoutCopy.pt;
  res.vary("Accept-Language");
  try {
    const money = new Intl.NumberFormat(copy.language, { style: "currency", currency: "BRL" });
    const formatar = (valor: string) => formatarReais(money, valor);

    const html = `<!DOCTYPE html>
<html lang="${copy.language}">
<head>
  <meta charset="UTF-8">
  <title>${copy.title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#0d1117; --card:rgba(22,27,34,.7); --border:rgba(240,246,252,.1); --green:#22c55e; --text:#f0f6fc; --gray:#8b949e; }
    body { background:var(--bg); color:var(--text); font-family:'Outfit',sans-serif; margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .box { background:var(--card); border:1px solid var(--border); backdrop-filter:blur(16px); border-radius:12px; padding:40px; max-width:460px; width:90%; text-align:center; }
    .logo { font-size:22px; font-weight:700; letter-spacing:2px; margin-bottom:20px; }
    .amount { font-size:32px; font-weight:700; color:var(--green); margin:15px 0; }
    .detail-row { display:flex; justify-content:space-between; margin-bottom:8px; font-size:14px; }
    .detail-row span { color:var(--gray); }
    .order-details { border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:15px 0; margin:20px 0; text-align:left; }
    .qr-box { background:#fff; padding:15px; border-radius:10px; display:inline-block; margin:15px 0; }
    .qr { width:180px; height:180px; background-image:repeating-linear-gradient(45deg,#000 0,#000 2px,transparent 2px,transparent 10px),repeating-linear-gradient(-45deg,#000 0,#000 2px,#fff 2px,#fff 10px); border:4px solid #fff; }
    .hint { font-size:12px; color:var(--gray); margin-bottom:20px; line-height:1.4; }
    .btn { background:var(--green); color:#fff; border:none; padding:14px; font-size:16px; font-weight:600; border-radius:6px; cursor:pointer; width:100%; text-transform:uppercase; }
    .btn:hover { opacity:.9; }
  </style>
</head>
<body>
  <div class="box">
    <div class="logo">ABACATEPAY <span style="font-weight:300;color:#22c55e">${copy.simulator}</span></div>
    <h2 style="margin:0 0 5px">Opticus Eyewear</h2>
    <div class="amount">${formatar(checkout.total)}</div>
    <div class="qr-box"><div class="qr"></div></div>
    <p class="hint">${copy.hint}</p>
    <div class="order-details">
      <h4 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;color:#22c55e">${copy.items}:</h4>
      ${checkout.itens.map(item => `
        <div class="detail-row">
          <span>${item.quantity ? `${item.quantity} × ` : ""}${escapeHTML(item.productName)}:</span>
          <strong>${formatar(item.total)}</strong>
        </div>
      `).join("")}
      <div class="detail-row"><span>${copy.billing}:</span><strong style="font-size:11px;color:#8b949e">${escapeHTML(billingId)}</strong></div>
      <div class="detail-row"><span>${copy.customer}:</span><strong>${escapeHTML(checkout.cliente.nome)} (${escapeHTML(checkout.cliente.email)})</strong></div>
    </div>
  </div>
</body>
</html>`;

    return res.set("Content-Language", copy.language).send(html);

  } catch (err) {
    logger.error({ err, traceId: req.requestId, requestId: req.requestId }, "Erro no checkout simulado");
    return res.status(500).set("Content-Language", copy.language).send(`<h3>${copy.error}</h3>`);
  }
}

// ─────────────────────────────────────────────────────────
//   CONFIRMAR PAGAMENTO SIMULADO
//   POST /api/payments/confirm-simulated-payment
//
//   SEC-01: exige autenticação (protect) e autorização de dono na
//   própria escrita. O usuário vem exclusivamente do token; nunca do
//   corpo. Pedido e pagamento são alterados na mesma transação.
// ─────────────────────────────────────────────────────────
export async function confirmSimulatedPayment(req: Request, res: Response) {
  const { billingId } = req.body as { billingId?: unknown };

  if (typeof billingId !== "string" || !billingId.trim()) {
    throw new BadRequestProblem("billingId ausente.");
  }

  // A identidade vem exclusivamente do token validado por `protect`.
  await PaymentService.confirmarSimulado(publicIdDoUsuario(req), billingId);

  return res.json({ status: "confirmed", billingId });
}
