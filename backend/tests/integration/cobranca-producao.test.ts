// ============================================================
//   SEC-06 — Cobrança em produção sem simulador
//
//   Em produção, sem simulador, cada resultado do gateway tem uma
//   reação própria (revisões do #93):
//
//   sem token    503 antes de criar ou alterar qualquer pedido
//   recusada     o gateway confirmou que não criou a cobrança: 503 e
//                os pedidos da tentativa são desfeitos
//   incerta      timeout ou rede: a cobrança pode existir, então 503
//                "não confirmada" e os pedidos ficam pendentes
//   criada       checkout real; se a gravação falhar depois disso,
//                500 e os pedidos são preservados para conciliação
//
//   O desfazimento e a gravação miram os IDs dos pedidos da
//   tentativa, nunca o billingId provisório, que pode colidir.
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

type Gateway = "ausente" | "recusando" | "fora do ar" | "expirando" | "aprovando";

const NENHUMA_COBRANCA = /Nenhuma cobrança foi criada/;
const NAO_CONFIRMADA = /Não foi possível confirmar a cobrança/;

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const aprovacao = () => json(200, { success: true, data: { id: "bill_real", url: "https://gateway.invalid/pagar" } });
const recusa = () => json(422, { success: false, error: "cobrança recusada" });

/** Simula o AbacatePay. Sem token, o gateway nem deve ser chamado. */
function simularGateway(gateway: Gateway) {
  const chamada = vi.spyOn(globalThis, "fetch");
  if (gateway === "recusando") chamada.mockResolvedValue(recusa());
  if (gateway === "fora do ar") chamada.mockRejectedValue(new TypeError("fetch failed"));
  if (gateway === "expirando") {
    chamada.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
  }
  if (gateway === "aprovando") chamada.mockResolvedValue(aprovacao());
  return chamada;
}

async function appEmProducao(gateway: Gateway) {
  vi.stubEnv("ABACATE_TOKEN", gateway === "ausente" ? "" : "token-de-teste");
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  const { createApp } = await import("../../src/app.js");
  // O pool desta instância do app, para simular falha de gravação nele.
  const { default: pool } = await import("../../src/config/db.js");
  // Só os módulos carregados acima ficam em produção; o resto do processo
  // continua em modo de teste.
  vi.stubEnv("NODE_ENV", "test");
  return { app: createApp({ requestLogging: false }) as Express, pool };
}

/** Faz falhar a gravação do billingId nos pedidos, deixando o resto do banco funcionar. */
function falharGravacaoDaCobranca(pool: { query: (...args: any[]) => any }) {
  const original = pool.query.bind(pool);
  vi.spyOn(pool, "query").mockImplementation(((sql: unknown, params?: unknown) =>
    String(sql).startsWith("UPDATE pedidos SET abacate_billing_id")
      ? Promise.reject(new Error("falha de gravação simulada"))
      : original(sql, params)) as any);
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
const pedidosDoCliente = (cliente: UsuarioDeTeste) =>
  prisma.pedido.findMany({
    where: { usuarioId: cliente.id },
    orderBy: { id: "asc" },
    select: { id: true, status: true, abacateBillingId: true },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("checkout-cart em produção (SEC-06)", () => {
  it.each<Gateway>(["ausente", "recusando"])(
    "gateway %s: 503 'nenhuma cobrança', sem link e sem pedido gravado",
    async (gateway) => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");
      const chamada = simularGateway(gateway);
      const { app } = await appEmProducao(gateway);

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica));

      esperarProblema(res, 503, "service-unavailable");
      expect(res.body.detail).toMatch(NENHUMA_COBRANCA);
      expect(res.body.checkoutUrl).toBeUndefined();
      expect(await prisma.pedido.count()).toBe(0);
      // Sem token, a falha acontece antes de criar pedido e de chamar o gateway.
      if (gateway === "ausente") expect(chamada).not.toHaveBeenCalled();
    },
  );

  it.each<Gateway>(["fora do ar", "expirando"])(
    "gateway %s: resultado incerto, 503 'não confirmada' e os pedidos ficam pendentes",
    async (gateway) => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");
      simularGateway(gateway);
      const { app } = await appEmProducao(gateway);

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica));

      esperarProblema(res, 503, "service-unavailable");
      expect(res.body.detail).toMatch(NAO_CONFIRMADA);
      expect(res.body.checkoutUrl).toBeUndefined();
      const pedidos = await pedidosDoCliente(cliente);
      expect(pedidos).toHaveLength(1);
      expect(pedidos[0].status).toBe("Pending_Payment");
    },
  );

  it("gateway aprovando: devolve o checkout real e grava o billingId do gateway", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");
    simularGateway("aprovando");
    const { app } = await appEmProducao("aprovando");

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send(carrinho(fabrica));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSimulated: false, checkoutUrl: "https://gateway.invalid/pagar" });
    expect((await pedidosDoCliente(cliente)).map((p) => p.abacateBillingId)).toEqual(["bill_real"]);
  });

  it("gateway aprova e a gravação falha: 500, sem '503 nenhuma cobrança' e o pedido é preservado", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");
    simularGateway("aprovando");
    const { app, pool } = await appEmProducao("aprovando");
    falharGravacaoDaCobranca(pool);

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send(carrinho(fabrica));

    expect(res.status).toBe(500);
    expect(res.body.type).not.toMatch(/service-unavailable/);
    expect(res.body.checkoutUrl).toBeUndefined();
    const pedidos = await pedidosDoCliente(cliente);
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].status).toBe("Pending_Payment");
  });

  describe("billingId provisório que colide com outro pedido do mesmo cliente", () => {
    // A colisão é forçada dentro da chamada ao gateway: nesse momento os
    // pedidos da tentativa já existem, e o pedido antigo recebe o mesmo
    // billingId provisório deles.
    async function cenarioDeColisao(respostaDoGateway: () => Response) {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");
      const antigo = await criarPedido({ dono: cliente, status: "Pending_Payment" });
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        const novo = await prisma.pedido.findFirstOrThrow({
          where: { usuarioId: cliente.id, id: { not: antigo.id } },
          select: { abacateBillingId: true },
        });
        await prisma.pedido.update({ where: { id: antigo.id }, data: { abacateBillingId: novo.abacateBillingId } });
        return respostaDoGateway();
      });
      return { fabrica, cliente, antigo };
    }

    it("recusa do gateway desfaz só os pedidos da tentativa", async () => {
      const { fabrica, cliente, antigo } = await cenarioDeColisao(recusa);
      const { app } = await appEmProducao("recusando");

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica));

      esperarProblema(res, 503, "service-unavailable");
      expect((await pedidosDoCliente(cliente)).map((p) => p.id)).toEqual([antigo.id]);
    });

    it("aprovação grava o billingId real só nos pedidos da tentativa", async () => {
      const { fabrica, cliente, antigo } = await cenarioDeColisao(aprovacao);
      const { app } = await appEmProducao("aprovando");

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica));

      expect(res.status).toBe(200);
      const pedidos = await pedidosDoCliente(cliente);
      expect(pedidos).toHaveLength(2);
      expect(pedidos.find((p) => p.id === antigo.id)!.abacateBillingId).not.toBe("bill_real");
      expect(pedidos.find((p) => p.id !== antigo.id)!.abacateBillingId).toBe("bill_real");
    });
  });
});

describe("create-billing em produção (SEC-06)", () => {
  it.each<[Gateway, RegExp]>([
    ["ausente", NENHUMA_COBRANCA],
    ["recusando", NENHUMA_COBRANCA],
    ["fora do ar", NAO_CONFIRMADA],
    ["expirando", NAO_CONFIRMADA],
  ])("gateway %s: 503, sem link e pedido inalterado", async (gateway, detalhe) => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    const antes = await lerPedidoPorId(pedido.id);
    simularGateway(gateway);
    const { app } = await appEmProducao(gateway);

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    esperarProblema(res, 503, "service-unavailable");
    expect(res.body.detail).toMatch(detalhe);
    expect(res.body.checkoutUrl).toBeUndefined();
    expect(await lerPedidoPorId(pedido.id)).toEqual(antes);
  });

  it("gateway aprovando: devolve o checkout real e grava o billingId do gateway", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    simularGateway("aprovando");
    const { app } = await appEmProducao("aprovando");

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSimulated: false, checkoutUrl: "https://gateway.invalid/pagar" });
    expect((await lerPedidoPorId(pedido.id)).abacateBillingId).toBe("bill_real");
  });

  it("gateway aprova e a gravação falha: 500, sem cair no 503 nem no simulador", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    const antes = await lerPedidoPorId(pedido.id);
    simularGateway("aprovando");
    const { app, pool } = await appEmProducao("aprovando");
    falharGravacaoDaCobranca(pool);

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    expect(res.status).toBe(500);
    expect(res.body.type).not.toMatch(/service-unavailable/);
    expect(res.body.checkoutUrl).toBeUndefined();
    expect(await lerPedidoPorId(pedido.id)).toEqual(antes);
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
