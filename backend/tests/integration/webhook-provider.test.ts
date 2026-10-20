import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../helpers/payments.js";
import { assinarWebhook, eventoCheckoutPago, SEGREDO_WEBHOOK } from "../helpers/webhook.js";

afterEach(() => vi.unstubAllEnvs());

async function cenario() {
  vi.stubEnv("WEBHOOK_SECRET", SEGREDO_WEBHOOK);
  const dono = await criarUsuario();
  const pedido = await criarPedido({ dono, status: "Pending_Payment" });
  const cobranca = await criarCobranca(pedido, false);
  return { pedido, cobranca, evento: eventoCheckoutPago(cobranca.billingId) };
}

function enviar(corpo: string, secret: string | undefined = SEGREDO_WEBHOOK, assinatura = assinarWebhook(corpo)) {
  const req = request(app).post("/api/payments/webhook").set("Content-Type", "application/json")
    .set("X-Webhook-Signature", assinatura);
  if (secret !== undefined) req.query({ webhookSecret: secret });
  return req.send(corpo);
}

it("aceita o contrato oficial e os bytes originais com espaços/Unicode", async () => {
  const { cobranca, evento } = await cenario();
  const corpo = JSON.stringify(evento, null, 2) + "\n";
  expect((await enviar(corpo)).status).toBe(200);
  expect(await lerCobranca(cobranca)).toEqual({ pedido: "Queued", pagamento: "aprovado" });
});

it.each(["ausente", "errado", "configuração ausente", "adulterado"])("rejeita segredo/corpo %s e mantém pendente", async caso => {
  const { cobranca, evento } = await cenario();
  const corpo = JSON.stringify(evento);
  if (caso === "configuração ausente") vi.stubEnv("WEBHOOK_SECRET", "");
  const req = request(app).post("/api/payments/webhook").set("Content-Type", "application/json")
    .set("X-Webhook-Signature", assinarWebhook(corpo));
  if (caso !== "ausente") req.query({ webhookSecret: caso === "errado" ? "outro-segredo" : SEGREDO_WEBHOOK });
  const res = await req.send(caso === "adulterado" ? corpo + " " : corpo);
  expect(res.status).toBe(401);
  expect(await lerCobranca(cobranca)).toEqual({ pedido: "Pending_Payment", pagamento: "pendente" });
});

it("não retrocede pedido entregue ao repetir evento", async () => {
  const { pedido, cobranca, evento } = await cenario();
  expect((await enviar(JSON.stringify(evento))).status).toBe(200);
  await pool.query("UPDATE pedidos SET status = 'Delivered' WHERE id = $1", [pedido.id]);
  expect((await enviar(JSON.stringify(evento))).status).toBe(200);
  expect(await lerCobranca(cobranca)).toEqual({ pedido: "Delivered", pagamento: "aprovado" });
});

it("não aprova checkout de status diferente de PAID", async () => {
  const { cobranca, evento } = await cenario();
  evento.data.checkout.status = "PENDING";
  expect((await enviar(JSON.stringify(evento))).status).toBe(200);
  expect(await lerCobranca(cobranca)).toEqual({ pedido: "Pending_Payment", pagamento: "pendente" });
});
