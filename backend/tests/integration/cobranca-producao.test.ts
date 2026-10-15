// ============================================================
//   SEC-06 — Cobrança em produção sem simulador
//
//   Revisão do #93: em produção, quando o gateway falta ou falha, os
//   dois caminhos de cobrança devolviam 200 com um link para o
//   simulador, que nessa configuração responde 404. Agora falham com
//   503 Problem Details, sem link, sem deixar pedido pendente nem
//   alterar o pedido existente. Fora de produção, o simulador continua.
//
//   O app de produção é carregado com NODE_ENV=production, e o token
//   do gateway fica definido durante o teste inteiro, porque o
//   checkout-cart o lê a cada requisição.
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../src/config/prisma.js";
import { app as appDeTeste } from "../setup/app.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { esperarProblema } from "../helpers/problem.js";

type Gateway = "ausente" | "recusando" | "fora do ar" | "aprovando";

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** Simula o AbacatePay. Sem token, o gateway nem deve ser chamado. */
function simularGateway(gateway: Gateway) {
  const chamada = vi.spyOn(globalThis, "fetch");
  if (gateway === "recusando") chamada.mockResolvedValue(json(500, { success: false, error: "cobrança recusada" }));
  if (gateway === "fora do ar") chamada.mockRejectedValue(new TypeError("fetch failed"));
  if (gateway === "aprovando") {
    chamada.mockResolvedValue(json(200, { success: true, data: { id: "bill_real", url: "https://gateway.invalid/pagar" } }));
  }
  return chamada;
}

async function appEmProducao(gateway: Gateway): Promise<Express> {
  vi.stubEnv("ABACATE_TOKEN", gateway === "ausente" ? "" : "token-de-teste");
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  const { createApp } = await import("../../src/app.js");
  // Só os módulos carregados acima ficam em produção; o resto do processo
  // continua em modo de teste.
  vi.stubEnv("NODE_ENV", "test");
  return createApp({ requestLogging: false });
}

// Válida antes e depois do SEC-05: `total` é ignorado quando o servidor
// calcula o preço, e as opções de preço satisfazem a validação dele.
function carrinho(fabrica: UsuarioDeTeste) {
  return {
    cartItems: [
      {
        productName: "Wayfarer",
        factoryId: fabrica.id,
        factoryName: "Fabrica",
        total: 210,
        quantity: 1,
        customSpecs: {
          isSunglasses: false,
          frameProfile: "medium",
          frameMaterial: "acetate",
          lensMaterial: "cr39",
          lensTreatments: ["anti_reflective", "uv_protection"],
        },
      },
    ],
  };
}

const lerPedidoPorId = (id: number) =>
  prisma.pedido.findUniqueOrThrow({ where: { id }, select: { status: true, abacateBillingId: true } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("em produção, sem cobrança real possível, os dois caminhos falham com 503 (SEC-06)", () => {
  it.each<Gateway>(["ausente", "recusando", "fora do ar"])(
    "POST /api/orders/checkout-cart com gateway %s: 503, sem link e sem pedido gravado",
    async (gateway) => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");
      const chamada = simularGateway(gateway);
      const app = await appEmProducao(gateway);

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica));

      esperarProblema(res, 503, "service-unavailable");
      expect(res.body.checkoutUrl).toBeUndefined();
      expect(await prisma.pedido.count()).toBe(0);
      // Sem token, a falha acontece antes de criar pedido e de chamar o gateway.
      if (gateway === "ausente") expect(chamada).not.toHaveBeenCalled();
    },
  );

  it.each<Gateway>(["ausente", "recusando", "fora do ar"])(
    "POST /api/payments/create-billing com gateway %s: 503, sem link e pedido inalterado",
    async (gateway) => {
      const cliente = await criarUsuario("client");
      const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
      const antes = await lerPedidoPorId(pedido.id);
      simularGateway(gateway);
      const app = await appEmProducao(gateway);

      const res = await request(app)
        .post("/api/payments/create-billing")
        .set(...comToken(cliente.token))
        .send({ orderId: pedido.id });

      esperarProblema(res, 503, "service-unavailable");
      expect(res.body.checkoutUrl).toBeUndefined();
      expect(await lerPedidoPorId(pedido.id)).toEqual(antes);
    },
  );
});

describe("em produção, com o gateway aprovando, a cobrança real continua funcionando", () => {
  it("POST /api/orders/checkout-cart devolve o checkout do gateway", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");
    simularGateway("aprovando");
    const app = await appEmProducao("aprovando");

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send(carrinho(fabrica));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSimulated: false, checkoutUrl: "https://gateway.invalid/pagar" });
    const pedidos = await prisma.pedido.findMany({ select: { abacateBillingId: true } });
    expect(pedidos).toEqual([{ abacateBillingId: "bill_real" }]);
  });

  it("POST /api/payments/create-billing devolve o checkout do gateway", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    simularGateway("aprovando");
    const app = await appEmProducao("aprovando");

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSimulated: false, checkoutUrl: "https://gateway.invalid/pagar" });
    expect((await lerPedidoPorId(pedido.id)).abacateBillingId).toBe("bill_real");
  });
});

describe("fora de produção, o simulador continua cobrindo a falta do gateway", () => {
  it("POST /api/orders/checkout-cart sem token devolve o checkout simulado", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");
    vi.stubEnv("ABACATE_TOKEN", "");

    const res = await request(appDeTeste)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send(carrinho(fabrica));

    expect(res.status).toBe(200);
    expect(res.body.isSimulated).toBe(true);
    expect(res.body.checkoutUrl).toContain("/api/payments/simulated-checkout");
    expect(await prisma.pedido.count()).toBe(1);
  });

  it("POST /api/payments/create-billing com o gateway fora do ar devolve o checkout simulado", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    simularGateway("fora do ar");

    const res = await request(appDeTeste)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    expect(res.status).toBe(200);
    expect(res.body.isSimulated).toBe(true);
    expect(res.body.checkoutUrl).toContain("/api/payments/simulated-checkout");
  });
});
