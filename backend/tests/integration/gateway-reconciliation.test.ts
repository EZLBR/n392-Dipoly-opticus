import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import type { Pool } from "pg";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { especificacaoDoStudio } from "../helpers/especificacao.js";
import { app as appDeTeste } from "../setup/app.js";
import { criarPedido } from "../helpers/orders.js";

const pools: Pool[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(pools.splice(0).map(p => p.end()));
});

async function producao() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ABACATE_TOKEN", "token-sintetico-teste-producao");
  vi.stubEnv("WEBHOOK_SECRET", "segredo-sintetico-teste-producao");
  vi.resetModules();
  const { createApp } = await import("../../src/app.js");
  const { default: novoPool } = await import("../../src/config/db.js");
  pools.push(novoPool);
  return createApp({ rateLimit: false, requestLogging: false });
}

async function cenario() {
  const dono = await criarUsuario();
  const fabrica = await criarUsuario("factory");
  const app = await producao();
  const cartItems = [1, 2].map(n => ({ productName: `Armação ${n}`, factoryId: fabrica.id,
    factoryName: "Fábrica", quantity: 1, customSpecs: especificacaoDoStudio() }));
  return { app, dono, cartItems };
}

function resposta(status: number, success: boolean) {
  return new Response(JSON.stringify(success
    ? { success: true, data: { id: "bill_nova", url: "https://gateway.invalid/pagar" } }
    : { success: false, error: "falha" }), { status, headers: { "Content-Type": "application/json" } });
}

it("preserva todos os pedidos quando o gateway responde 500 com success false", async () => {
  const { app, dono, cartItems } = await cenario();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(500, false));
  const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(dono.token)).send({ cartItems });
  expect(res.status).toBe(503);
  expect(res.body.detail).toContain("mantido como pendente");
  const { rows } = await pool.query("SELECT status, pagamento_simulado FROM pedidos ORDER BY id");
  expect(rows).toEqual([1, 2].map(() => ({ status: "Pending Payment", pagamento_simulado: false })));
});

it.each(["recusa", "sucesso"])("não apaga nem sobrescreve associação concorrente após %s", async tipo => {
  const { app, dono, cartItems } = await cenario();
  let antes: unknown;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    await pool.query("UPDATE pedidos SET abacate_billing_id = 'bill_concorrente' WHERE id = (SELECT MIN(id) FROM pedidos)");
    antes = (await pool.query("SELECT id, status, abacate_billing_id, pagamento_simulado FROM pedidos ORDER BY id")).rows;
    return resposta(tipo === "recusa" ? 422 : 200, tipo === "sucesso");
  });
  const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(dono.token)).send({ cartItems });
  expect(res.status).toBe(tipo === "sucesso" ? 409 : 503);
  expect(res.body).not.toHaveProperty("checkoutUrl");
  expect((await pool.query("SELECT id, status, abacate_billing_id, pagamento_simulado FROM pedidos ORDER BY id")).rows).toEqual(antes);
});

it("desfaz somente os pedidos da tentativa quando a recusa é definitiva e não houve concorrência", async () => {
  const { app, dono, cartItems } = await cenario();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(422, false));
  const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(dono.token)).send({ cartItems });
  expect(res.status).toBe(503);
  expect(res.body.detail).toContain("Nenhuma cobrança foi criada");
  expect((await pool.query("SELECT id FROM pedidos")).rows).toEqual([]);
});

it("associa uma resposta válida a todos os itens sem habilitar confirmação simulada", async () => {
  const { app, dono, cartItems } = await cenario();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(200, true));
  const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(dono.token)).send({ cartItems });
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ isSimulated: false, billingId: "bill_nova", checkoutUrl: "https://gateway.invalid/pagar" });
  expect((await pool.query("SELECT abacate_billing_id, pagamento_simulado FROM pedidos ORDER BY id")).rows)
    .toEqual([1, 2].map(() => ({ abacate_billing_id: "bill_nova", pagamento_simulado: false })));
});

it.each(["carrinho", "pedido"])("resultado incerto também não ativa simulador fora de produção: %s", async fluxo => {
  const dono = await criarUsuario();
  const fabrica = await criarUsuario("factory");
  const pedido = await criarPedido({ dono, status: "Pending_Payment" });
  vi.stubEnv("ABACATE_TOKEN", "token-de-teste");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(resposta(500, false));
  const res = fluxo === "pedido"
    ? await request(appDeTeste).post("/api/payments/create-billing").set(...comToken(dono.token)).send({ orderId: pedido.id })
    : await request(appDeTeste).post("/api/orders/checkout-cart").set(...comToken(dono.token)).send({ cartItems: [{
        productName: "Armação", factoryId: fabrica.id, factoryName: "Fábrica", quantity: 1, customSpecs: especificacaoDoStudio(),
      }] });
  expect(res.status).toBe(503);
  expect(res.body).not.toHaveProperty("checkoutUrl");
  const { rows } = await pool.query("SELECT status, pagamento_simulado FROM pedidos");
  expect(rows.every(p => p.status === "Pending Payment" && p.pagamento_simulado === false)).toBe(true);
  expect(rows).toHaveLength(fluxo === "pedido" ? 1 : 2);
});
