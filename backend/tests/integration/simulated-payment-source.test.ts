import { expect, it } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../helpers/payments.js";
import { especificacaoDoStudio } from "../helpers/especificacao.js";

it("não confirma cobrança real do próprio comprador mesmo com origem forjada no corpo", async () => {
  const dono = await criarUsuario();
  const pedido = await criarPedido({ dono, status: "Pending_Payment" });
  const cobranca = await criarCobranca(pedido, false);
  const res = await request(app).post("/api/payments/confirm-simulated-payment")
    .set(...comToken(dono.token)).send({ billingId: cobranca.billingId, isSimulated: true });
  expect(res.status).toBe(404);
  expect(await lerCobranca(cobranca)).toEqual({ pedido: "Pending_Payment", pagamento: "pendente" });
});

it("não mostra uma cobrança real como checkout simulado", async () => {
  const dono = await criarUsuario();
  const pedido = await criarPedido({ dono, status: "Pending_Payment" });
  const cobranca = await criarCobranca(pedido, false);
  const res = await request(app).get("/api/payments/simulated-checkout")
    .set(...comToken(dono.token)).query({ billingId: cobranca.billingId });
  expect(res.status).toBe(404);
});

it.each(["pedido", "carrinho"])("confirma cobrança emitida pelo fluxo simulado de %s", async fluxo => {
  const dono = await criarUsuario();
  const fabrica = await criarUsuario("factory");
  const pedido = await criarPedido({ dono, status: "Pending_Payment" });
  const criada = fluxo === "pedido"
    ? await request(app).post("/api/payments/create-billing").set(...comToken(dono.token)).send({ orderId: pedido.id })
    : await request(app).post("/api/orders/checkout-cart").set(...comToken(dono.token)).send({ cartItems: [1, 2].map(n => ({
        productName: `Armação ${n}`, factoryId: fabrica.id, factoryName: "Fábrica", quantity: 1,
        customSpecs: especificacaoDoStudio(),
      })) });
  expect(criada.status).toBe(200);
  const billingId = criada.body.billingId ?? new URL(criada.body.checkoutUrl).searchParams.get("billingId");
  const confirmada = await request(app).post("/api/payments/confirm-simulated-payment")
    .set(...comToken(dono.token)).send({ billingId });
  expect(confirmada.status).toBe(200);
  const { rows } = await pool.query("SELECT status FROM pedidos WHERE abacate_billing_id = $1", [billingId]);
  expect(rows).toHaveLength(fluxo === "pedido" ? 1 : 2);
  expect(rows.every(p => p.status === "Queued")).toBe(true);
  const pagamentos = await pool.query("SELECT status FROM pagamentos WHERE referencia_externa = $1", [billingId]);
  expect(pagamentos.rows).toEqual(rows.map(() => ({ status: "aprovado" })));
});
