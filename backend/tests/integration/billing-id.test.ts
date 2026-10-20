// ============================================================
//   billingId — formato novo (CSPRNG) e compatibilidade com o antigo
//
//   O identificador gerado pela plataforma passa a ser
//   `bill-<origem>-<uuid v4>`. Cobranças já gravadas no formato
//   antigo (`bill-sim-123456`) precisam continuar sendo localizadas
//   e confirmadas — nenhuma validação nova pode rejeitá-las.
// ============================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import prisma from "../../src/config/prisma.js";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { especificacaoDoStudio } from "../helpers/especificacao.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BILLING_NOVO = /^bill-(sim|fallback)-([0-9a-f-]{36})$/i;

function billingIdDaUrl(checkoutUrl: string): string {
  const url = new URL(checkoutUrl);
  return String(url.searchParams.get("billingId"));
}

/** Cobrança no formato antigo, como as já gravadas em produção. */
async function criarCobrancaFormatoAntigo(billingId: string) {
  const dono = await criarUsuario("client");
  const pedido = await criarPedido({ dono, status: "Pending_Payment" });
  await prisma.pedido.update({
    where: { publicId: pedido.publicId },
    data: { abacateBillingId: billingId },
  });
  await prisma.pagamento.create({
    data: { pedidoId: pedido.id, valor: "450.00", referenciaExterna: billingId },
  });
  return { dono, pedido };
}

async function estadoDaCobranca(pedidoId: number, billingId: string) {
  const pedido = await prisma.pedido.findUniqueOrThrow({
    where: { id: pedidoId },
    select: { status: true },
  });
  const pagamento = await prisma.pagamento.findFirstOrThrow({
    where: { referenciaExterna: billingId },
    select: { status: true },
  });
  return { pedido: pedido.status, pagamento: pagamento.status };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("geração do billingId", () => {
  it("createBilling (simulador) devolve e persiste o formato novo", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    expect(res.status).toBe(200);
    expect(res.body.isSimulated).toBe(true);

    const billingId = billingIdDaUrl(res.body.checkoutUrl);
    expect(billingId).toMatch(BILLING_NOVO);
    expect(billingId.replace(/^bill-(sim|fallback)-/, "")).toMatch(UUID_V4);

    const gravado = await prisma.pedido.findUniqueOrThrow({
      where: { id: pedido.id },
      select: { abacateBillingId: true },
    });
    expect(gravado.abacateBillingId).toBe(billingId);
  });

  it("checkoutCart devolve e persiste o formato novo em todos os itens", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send({
        cartItems: [
          { productName: "A", factoryId: fabrica.id, factoryName: "F", customSpecs: especificacaoDoStudio(), quantity: 1 },
          { productName: "B", factoryId: fabrica.id, factoryName: "F", customSpecs: especificacaoDoStudio(), quantity: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.billingId).toMatch(BILLING_NOVO);
    expect(res.body.billingId.replace(/^bill-(sim|fallback)-/, "")).toMatch(UUID_V4);

    const pedidos = await prisma.pedido.findMany({
      select: { abacateBillingId: true },
    });
    expect(pedidos).toHaveLength(2);
    expect(pedidos.every((p) => p.abacateBillingId === res.body.billingId)).toBe(true);
  });
});

describe("compatibilidade com cobranças no formato antigo", () => {
  const ANTIGO = "bill-sim-123456";

  it("simulated-checkout localiza uma cobrança do formato antigo", async () => {
    const { dono } = await criarCobrancaFormatoAntigo(ANTIGO);

    const res = await request(app)
      .get("/api/payments/simulated-checkout")
      .set(...comToken(dono.token))
      .query({ billingId: ANTIGO });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain(ANTIGO);
  });

  it("confirm-simulated-payment confirma uma cobrança do formato antigo", async () => {
    const { dono, pedido } = await criarCobrancaFormatoAntigo(ANTIGO);

    const res = await request(app)
      .post("/api/payments/confirm-simulated-payment")
      .set(...comToken(dono.token))
      .send({ billingId: ANTIGO });

    expect(res.status).toBe(302);
    expect(await estadoDaCobranca(pedido.id, ANTIGO)).toEqual({
      pedido: "Queued",
      pagamento: "aprovado",
    });
  });

  it("webhook localiza uma cobrança do formato antigo", async () => {
    const { pedido } = await criarCobrancaFormatoAntigo(ANTIGO);

    const res = await request(app)
      .post("/api/payments/webhook")
      .send({ event: "billing.paid", data: { id: ANTIGO } });

    expect(res.status).toBe(200);
    expect(await estadoDaCobranca(pedido.id, ANTIGO)).toEqual({
      pedido: "Queued",
      pagamento: "aprovado",
    });
  });
});
