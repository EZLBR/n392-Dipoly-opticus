// ============================================================
//   Regressão — casos de borda da regra de negócio
//
//   Limites e combinações que os testes de cada funcionalidade não
//   cobriam: quantidade no máximo, carrinho misto, confirmação
//   concorrente, cobrança substituída e pagamento de pedido
//   cancelado. Tudo contra o banco de teste real.
// ============================================================

import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../../setup/app.js";
import { pool } from "../../setup/db.js";
import { criarUsuario, comToken } from "../../helpers/auth.js";
import { especificacaoDoStudio, PRECO_DA_ESPECIFICACAO_PADRAO } from "../../helpers/especificacao.js";
import { criarPedido, lerPedido } from "../../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../../helpers/payments.js";
import { esperarProblema } from "../../helpers/problem.js";
import { assinarWebhook, eventoCheckoutPago, SEGREDO_WEBHOOK } from "../../helpers/webhook.js";

const contar = async (tabela: "pedidos" | "pagamentos") =>
  Number((await pool.query(`SELECT COUNT(*) FROM ${tabela}`)).rows[0].count);

/** Gera a cobrança simulada pela API e devolve o billingId. */
async function cobrar(token: string, orderPublicId: string) {
  const res = await request(app).post("/api/payments/create-billing").set(...comToken(token)).send({ orderPublicId });
  expect(res.status).toBe(200);
  return new URL(res.body.checkoutUrl).searchParams.get("billingId")!;
}

const confirmar = (token: string, billingId: string) =>
  request(app).post("/api/payments/confirm-simulated-payment").set(...comToken(token)).send({ billingId });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("quantidade nos limites aceitos", () => {
  it.each([
    [1, PRECO_DA_ESPECIFICACAO_PADRAO],
    [100, (Number(PRECO_DA_ESPECIFICACAO_PADRAO) * 100).toFixed(2)],
  ])("quantidade %d grava o total exato %s", async (quantity, total) => {
    const cliente = await criarUsuario("client");

    const res = await request(app).post("/api/orders").set(...comToken(cliente.token))
      .send({ productName: "Armação", factoryName: "Fábrica", customSpecs: especificacaoDoStudio(), quantity });

    expect(res.status).toBe(201);
    const { rows } = await pool.query(`SELECT total::text AS total FROM pedidos WHERE "publicId" = $1`, [res.body.publicId]);
    expect(rows[0].total).toBe(total);
  });
});

describe("o carrinho é tudo ou nada", () => {
  it("um item recusado derruba o carrinho inteiro: 400 e nenhum pedido", async () => {
    const cliente = await criarUsuario("client");
    const valido = { productName: "Válido", factoryName: "Fábrica", customSpecs: especificacaoDoStudio() };
    const comArte = {
      productName: "Com arte", factoryName: "Fábrica",
      customSpecs: especificacaoDoStudio({ artwork: { version: 1, layers: [{ id: "t", text: "Oi" }] } }),
    };

    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token))
      .send({ cartItems: [valido, comArte] });

    esperarProblema(res, 400, "bad-request");
    expect(await contar("pedidos")).toBe(0);
    expect(await contar("pagamentos")).toBe(0);
  });
});

describe("confirmação simulada concorrente", () => {
  it("cinco confirmações simultâneas da mesma cobrança: uma passa e o pagamento é aprovado uma vez", async () => {
    const dono = await criarUsuario("client");
    const pedido = await criarPedido({ dono, status: "Pending_Payment" });
    const billingId = await cobrar(dono.token, pedido.publicId);

    const respostas = await Promise.all(Array.from({ length: 5 }, () => confirmar(dono.token, billingId)));

    expect(respostas.filter(r => r.status === 200)).toHaveLength(1);
    for (const recusada of respostas.filter(r => r.status !== 200)) esperarProblema(recusada, 404, "not-found");
    const { rows: pagamentos } = await pool.query("SELECT status FROM pagamentos WHERE pedido_id = $1", [pedido.id]);
    expect(pagamentos).toEqual([{ status: "aprovado" }]);
    expect((await lerPedido(pedido.publicId))?.status).toBe("Queued");
  });
});

describe("cobrança substituída", () => {
  it("gerar uma nova cobrança invalida a anterior", async () => {
    const dono = await criarUsuario("client");
    const pedido = await criarPedido({ dono, status: "Pending_Payment" });

    const antiga = await cobrar(dono.token, pedido.publicId);
    const nova = await cobrar(dono.token, pedido.publicId);

    expect(nova).not.toBe(antiga);
    esperarProblema(await confirmar(dono.token, antiga), 404, "not-found");
    expect((await lerPedido(pedido.publicId))?.status).toBe("Pending_Payment");
    expect((await confirmar(dono.token, nova)).status).toBe(200);
    expect((await lerPedido(pedido.publicId))?.status).toBe("Queued");
  });
});

describe("pedido cancelado não é pago", () => {
  async function cancelar(publicId: string) {
    const staff = await criarUsuario("staff");
    const atual = await lerPedido(publicId);
    const res = await request(app).put(`/api/orders/${publicId}/status`).set(...comToken(staff.token))
      .send({ status: "Cancelled", version: atual?.version });
    expect(res.status).toBe(200);
  }

  it("a cobrança simulada de um pedido cancelado não confirma mais", async () => {
    const dono = await criarUsuario("client");
    const pedido = await criarPedido({ dono, status: "Pending_Payment" });
    const billingId = await cobrar(dono.token, pedido.publicId);
    await cancelar(pedido.publicId);

    esperarProblema(await confirmar(dono.token, billingId), 404, "not-found");
    expect((await lerPedido(pedido.publicId))?.status).toBe("Cancelled");
  });

  it("o webhook de pagamento de um pedido cancelado não o revive nem aprova o pagamento", async () => {
    vi.stubEnv("WEBHOOK_SECRET", SEGREDO_WEBHOOK);
    const pedido = await criarPedido({ dono: await criarUsuario("client"), status: "Pending_Payment" });
    const cobranca = await criarCobranca(pedido, false);
    await cancelar(pedido.publicId);
    const corpo = JSON.stringify(eventoCheckoutPago(cobranca.billingId));

    const res = await request(app).post("/api/payments/webhook").query({ webhookSecret: SEGREDO_WEBHOOK })
      .set("Content-Type", "application/json").set("X-Webhook-Signature", assinarWebhook(corpo)).send(corpo);

    expect(res.status).toBe(200);
    expect(await lerCobranca(cobranca)).toEqual({ pedido: "Cancelled", pagamento: "pendente" });
  });
});
