import { createHmac } from "node:crypto";

// Chave PÚBLICA publicada pelo provedor; não autentica sem webhookSecret.
// Fixture independente da implementação: docs.abacatepay.com/pages/webhooks/security
export const CHAVE_PUBLICA_WEBHOOK = "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";
export const SEGREDO_WEBHOOK = "local-webhook-test-secret-only";
export const assinarWebhook = (corpo: string, chave = CHAVE_PUBLICA_WEBHOOK) =>
  createHmac("sha256", chave).update(corpo).digest("base64");

export function eventoCheckoutPago(billingId: string) {
  return {
    id: "log_checkout_test", event: "checkout.completed", apiVersion: 2, devMode: false,
    data: {
      checkout: {
        id: billingId, externalId: "pedido-test", url: `https://app.abacatepay.com/pay/${billingId}`,
        amount: 45000, paidAmount: 45000, platformFee: 80, frequency: "ONE_TIME",
        items: [{ id: "prod_test", quantity: 1 }], status: "PAID", methods: ["PIX"],
        customerId: "cust_test", receiptUrl: "https://app.abacatepay.com/receipt/test",
        installmentsCount: null, createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-20T10:01:00Z",
      },
      customer: { id: "cust_test", name: "Cliente Teste", email: "teste@exemplo.invalid", taxId: "123.***.***-**" },
      payerInformation: { method: "PIX", PIX: { name: "Cliente Teste", taxId: "123.***.***-**", isSameAsCustomer: true } },
    },
  };
}
