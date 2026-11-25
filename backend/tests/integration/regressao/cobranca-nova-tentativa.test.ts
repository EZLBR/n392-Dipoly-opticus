// ============================================================
//   Regressão — nova tentativa de pagamento cobrava uma unidade só
//   (revisão do #146)
//
//   O carrinho cadastrava o produto do pedido no AbacatePay com o preço
//   unitário (× quantidade no checkout). O "pagar pedido" cadastrava o
//   mesmo externalId com o total (× 1). O AbacatePay guarda o primeiro
//   cadastro, então a nova tentativa de um pedido de 2 unidades saía
//   com o preço de uma: R$ 210,00 num pedido de R$ 420,00.
//
//   Banco real; só o AbacatePay é simulado, com estado (helpers/gateway).
// ============================================================

import { afterEach, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../../src/config/prisma.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../../helpers/auth.js";
import { espiarCheckout, valoresCobrados } from "../../helpers/gateway.js";
import { esperarProblema } from "../../helpers/problem.js";

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

let cobrancas = 0;
/** Checkout aprovado; sem `amount`, o simulado cobra preço × quantidade dos produtos cadastrados. */
const aprovacao = (extra: Record<string, unknown> = {}) => {
  const id = `bill_${++cobrancas}`;
  return json(200, { success: true, error: null, data: { id, url: `https://gateway.invalid/pagar/${id}`, ...extra } });
};

type Pool = { end: () => Promise<void> };
const pools: Pool[] = [];

async function appEmProducao(): Promise<Express> {
  vi.stubEnv("ABACATE_TOKEN", "token-de-teste");
  vi.stubEnv("WEBHOOK_SECRET", "segredo-privado-sintetico-producao");
  vi.stubEnv("FRONTEND_URL", "https://loja.test");
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  const { createApp } = await import("../../../src/app.js");
  const { default: pool } = await import("../../../src/config/db.js");
  pools.push(pool as unknown as Pool);
  vi.stubEnv("NODE_ENV", "test");
  return createApp({ requestLogging: false }) as Express;
}

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

const carrinhoComDuasUnidades = (fabrica: UsuarioDeTeste) => ({
  cartItems: [{
    productName: "Wayfarer",
    factoryPublicId: fabrica.publicId,
    factoryName: "Fabrica",
    total: 210,
    quantity: 2,
    customSpecs: {
      isSunglasses: false,
      frameProfile: "medium",
      frameMaterial: "acetate",
      lensMaterial: "cr39",
      lensTreatments: ["anti_reflective", "uv_protection"],
    },
  }],
});

async function pedidoDoCarrinho(app: Express, cliente: UsuarioDeTeste, fabrica: UsuarioDeTeste) {
  const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token))
    .send(carrinhoComDuasUnidades(fabrica));
  expect(res.status).toBe(200);
  const pedido = await prisma.pedido.findFirstOrThrow({
    where: { usuarioId: cliente.id },
    select: { id: true, publicId: true, total: true, abacateBillingId: true },
  });
  return { ...pedido, totalEmCentavos: pedido.total.mul(100).toNumber() };
}

it("nova tentativa de pagamento de um pedido com 2 unidades cobra o total, não uma unidade", async () => {
  const fabrica = await criarUsuario("factory");
  const cliente = await criarUsuario("client");
  const gateway = espiarCheckout(async () => aprovacao());
  const app = await appEmProducao();

  const pedido = await pedidoDoCarrinho(app, cliente, fabrica);

  const novaTentativa = await request(app).post("/api/payments/create-billing").set(...comToken(cliente.token))
    .send({ orderPublicId: pedido.publicId });
  expect(novaTentativa.status).toBe(200);

  expect(valoresCobrados(gateway)).toEqual([pedido.totalEmCentavos, pedido.totalEmCentavos]);
});

it("checkout com valor diferente do total do servidor: 503 sem link, e o pedido não troca de cobrança", async () => {
  const fabrica = await criarUsuario("factory");
  const cliente = await criarUsuario("client");
  let chamadas = 0;
  // A primeira cobrança é normal; a segunda volta com 1 real (produto editado no painel, por exemplo).
  espiarCheckout(async () => (++chamadas === 1 ? aprovacao() : aprovacao({ amount: 100 })));
  const app = await appEmProducao();

  const pedido = await pedidoDoCarrinho(app, cliente, fabrica);

  const res = await request(app).post("/api/payments/create-billing").set(...comToken(cliente.token))
    .send({ orderPublicId: pedido.publicId });

  esperarProblema(res, 503, "service-unavailable");
  expect(res.body.detail).toMatch(/Não foi possível confirmar a cobrança/);
  expect(JSON.stringify(res.body)).not.toContain("gateway.invalid");
  const depois = await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, select: { abacateBillingId: true } });
  expect(depois.abacateBillingId).toBe(pedido.abacateBillingId);
});
