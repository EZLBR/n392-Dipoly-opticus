// ============================================================
//   SEC-06 — Cobrança sem simulador para falha do gateway real
//
//   Cada resultado do gateway tem a sua reação (revisões do #93 e
//   padrão §22):
//
//   sem token    em produção, 503 antes de criar ou alterar pedido;
//                fora dela, o simulador cobre o desenvolvimento
//   recusada     (4xx) 503 e os pedidos da tentativa são desfeitos
//   incerta      (timeout, rede, qualquer 5xx) a cobrança pode existir:
//                503 "não confirmada" e os pedidos ficam pendentes
//   criada       checkout real. O vínculo é tudo ou nada e só vale
//                para pedidos que ainda têm o billingId da tentativa;
//                falha de gravação vira 500 e conciliação
//
//   Com token real, nenhuma falha cai no simulador, em nenhum ambiente.
//
//   O app é recarregado com o token do gateway (e, quando é o caso,
//   NODE_ENV=production) definido antes do import. O token é lido
//   dinamicamente em cada requisição, depois da validação no boot.
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import type { Express } from "express";
import prisma from "../../src/config/prisma.js";
import { app as appDeTeste } from "../setup/app.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { esperarProblema } from "../helpers/problem.js";

type Gateway = "ausente" | "recusando" | "falhando" | "fora do ar" | "expirando" | "aprovando";

const NENHUMA_COBRANCA = /Nenhuma cobrança foi criada/;
const NAO_CONFIRMADA = /Não foi possível confirmar a cobrança/;
const INCERTOS: Gateway[] = ["falhando", "fora do ar", "expirando"];

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const aprovacao = (id = "bill_real") =>
  json(200, { success: true, data: { id, url: `https://gateway.invalid/pagar/${id}` } });
const recusa = () => json(422, { success: false, error: "cobrança recusada" });

/** Simula o AbacatePay. Sem token, o gateway nem deve ser chamado. */
function simularGateway(gateway: Gateway) {
  const chamada = vi.spyOn(globalThis, "fetch");
  if (gateway === "recusando") chamada.mockResolvedValue(recusa());
  // 5xx com success:false declarado continua incerto: o servidor do gateway falhou.
  if (gateway === "falhando") chamada.mockResolvedValue(json(500, { success: false, error: "falha interna" }));
  if (gateway === "fora do ar") chamada.mockRejectedValue(new TypeError("fetch failed"));
  if (gateway === "expirando") {
    chamada.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
  }
  if (gateway === "aprovando") chamada.mockResolvedValue(aprovacao());
  return chamada;
}

type Pool = { query: (...args: any[]) => any; connect: (...args: any[]) => any; end: () => Promise<void> };
const poolsDeProducao: Pool[] = [];

async function carregarApp(opcoes: { producao: boolean; gateway: Gateway }) {
  // O boot é válido; ausência do token é revogação em tempo de requisição.
  vi.stubEnv("ABACATE_TOKEN", "token-de-teste");
  vi.stubEnv("WEBHOOK_SECRET", "segredo-privado-sintetico-producao");
  if (opcoes.producao) vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  const { createApp } = await import("../../src/app.js");
  // O pool desta instância do app, para simular falha de gravação nele.
  const { default: pool } = await import("../../src/config/db.js");
  const { default: logger } = await import("../../src/utils/logger.js");
  poolsDeProducao.push(pool as unknown as Pool);
  if (opcoes.gateway === "ausente") vi.stubEnv("ABACATE_TOKEN", "");
  // Só os módulos carregados acima ficam em produção; o resto do processo
  // continua em modo de teste.
  if (opcoes.producao) vi.stubEnv("NODE_ENV", "test");
  return { app: createApp({ requestLogging: false }) as Express, pool: pool as unknown as Pool, logger };
}
const appEmProducao = (gateway: Gateway) => carregarApp({ producao: true, gateway });

/**
 * Faz falhar, nas transações do app (pool.connect() com promise), a
 * instrução que começa com `inicioDoSql`. O pool.query interno do pg usa
 * pool.connect(callback) e segue intacto.
 */
function falharNoBanco(pool: Pool, inicioDoSql: string) {
  const conectar = pool.connect.bind(pool);
  vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) => {
    if (typeof args[0] === "function") return conectar(...args);
    return conectar().then((conexao: { query: (...a: unknown[]) => unknown }) => {
      const consultar = conexao.query.bind(conexao);
      conexao.query = (...a: unknown[]) =>
        String(a[0]).trimStart().startsWith(inicioDoSql)
          ? Promise.reject(new Error("falha de gravação simulada"))
          : consultar(...a);
      return conexao;
    });
  }) as any);
}

// Válida antes e depois do SEC-05: `total` é ignorado quando o servidor
// calcula o preço, e as opções de preço satisfazem a validação dele.
function carrinho(fabrica: UsuarioDeTeste, itens = 1) {
  const item = {
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
  };
  return { cartItems: Array.from({ length: itens }, () => ({ ...item })) };
}

const lerPedidoPorId = (id: number) =>
  prisma.pedido.findUniqueOrThrow({ where: { id }, select: { status: true, abacateBillingId: true } });
const pedidosDoCliente = (cliente: UsuarioDeTeste) =>
  prisma.pedido.findMany({
    where: { usuarioId: cliente.id },
    orderBy: { id: "asc" },
    select: { id: true, status: true, abacateBillingId: true },
  });
const pagamentosDoPedido = (pedidoId: number) =>
  prisma.pagamento.findMany({ where: { pedidoId }, select: { referenciaExterna: true, status: true, valor: true } });

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(poolsDeProducao.splice(0).map(pool => pool.end()));
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

  it.each<Gateway>(INCERTOS)(
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
      .send(carrinho(fabrica, 2));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSimulated: false, checkoutUrl: "https://gateway.invalid/pagar/bill_real" });
    expect((await pedidosDoCliente(cliente)).map((p) => p.abacateBillingId)).toEqual(["bill_real", "bill_real"]);
  });

  it("gateway aprova e a gravação falha: 500, sem '503 nenhuma cobrança' e o pedido é preservado", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");
    simularGateway("aprovando");
    const { app, pool } = await appEmProducao("aprovando");
    falharNoBanco(pool, "UPDATE pedidos SET abacate_billing_id");

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

  // Revisão do #93: entre o COMMIT dos pedidos e a resposta do gateway, um
  // create-billing pode ligar um deles a uma cobrança real. A primeira
  // tentativa não pode apagar nem sobrescrever esse vínculo. Os dois
  // endpoints reais são usados: o create-billing roda dentro da chamada do
  // checkout ao gateway.
  describe("um create-billing assume um dos pedidos enquanto o gateway responde", () => {
    function intercalarCreateBilling(app: Express, cliente: UsuarioDeTeste, respostaDoCheckout: () => Response) {
      let chamadas = 0;
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        chamadas += 1;
        if (chamadas === 2) return aprovacao("bill_concorrente"); // a chamada do create-billing
        const [primeiro] = await pedidosDoCliente(cliente);
        const concorrente = await request(app)
          .post("/api/payments/create-billing")
          .set(...comToken(cliente.token))
          .send({ orderId: primeiro.id });
        expect(concorrente.status).toBe(200);
        return respostaDoCheckout();
      });
    }

    it("recusa com associação concorrente preserva o carrinho inteiro para conciliação", async () => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");
      const { app } = await appEmProducao("recusando");
      intercalarCreateBilling(app, cliente, recusa);

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica, 2));

      esperarProblema(res, 503, "service-unavailable");
      const pedidos = await pedidosDoCliente(cliente);
      expect(pedidos).toHaveLength(2);
      expect(pedidos[0].abacateBillingId).toBe("bill_concorrente");
      expect(pedidos[1].abacateBillingId).toMatch(/^bill-sim-/);
      expect(res.body.detail).toMatch(NAO_CONFIRMADA);
    });

    it("aprovação da primeira tentativa não sobrescreve o vínculo: 409 e nenhum pedido vinculado", async () => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");
      const { app } = await appEmProducao("aprovando");
      intercalarCreateBilling(app, cliente, () => aprovacao("bill_real"));

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica, 2));

      esperarProblema(res, 409, "conflict");
      expect(res.body.checkoutUrl).toBeUndefined();
      const [assumido, outro] = await pedidosDoCliente(cliente);
      expect(assumido.abacateBillingId).toBe("bill_concorrente");
      // Tudo ou nada: o outro pedido continua com o billingId provisório.
      expect(outro.abacateBillingId).not.toBe("bill_real");
      expect(outro.abacateBillingId).toMatch(/^bill-sim-/);
    });
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
  it("falha ao obter conexão depois de criar cobrança registra os dados de conciliação", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    const antes = await lerPedidoPorId(pedido.id);
    simularGateway("aprovando");
    const { app, pool, logger } = await appEmProducao("aprovando");
    const erro = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const conectar = pool.connect.bind(pool);
    vi.spyOn(pool, "connect").mockImplementation(((...args: unknown[]) =>
      typeof args[0] === "function"
        ? conectar(...args)
        : Promise.reject(new Error("pool indisponível após criação remota"))) as any);
    const res = await request(app).post("/api/payments/create-billing")
      .set(...comToken(cliente.token)).send({ orderId: pedido.id });
    expect(res.status).toBe(500);
    expect(res.body.checkoutUrl).toBeUndefined();
    expect(await lerPedidoPorId(pedido.id)).toEqual(antes);
    expect(await pagamentosDoPedido(pedido.id)).toEqual([]);
    expect(erro).toHaveBeenCalledWith(
      expect.objectContaining({ billingId: "bill_real", pedidoId: pedido.id }),
      expect.stringContaining("conciliar"),
    );
  });
  it.each<[Gateway, RegExp]>([
    ["ausente", NENHUMA_COBRANCA],
    ["recusando", NENHUMA_COBRANCA],
    ["falhando", NAO_CONFIRMADA],
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
    expect(await pagamentosDoPedido(pedido.id)).toEqual([]);
  });

  it("gateway aprovando: vincula a cobrança e registra o pagamento pendente", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    simularGateway("aprovando");
    const { app } = await appEmProducao("aprovando");

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSimulated: false, checkoutUrl: "https://gateway.invalid/pagar/bill_real" });
    expect((await lerPedidoPorId(pedido.id)).abacateBillingId).toBe("bill_real");
    const pagamentos = await pagamentosDoPedido(pedido.id);
    expect(pagamentos.map((p) => ({ ...p, valor: p.valor.toFixed(2) }))).toEqual([
      { referenciaExterna: "bill_real", status: "pendente", valor: "450.00" },
    ]);
  });

  it.each([
    ["o vínculo no pedido", "UPDATE pedidos SET abacate_billing_id"],
    ["o registro do pagamento", "INSERT INTO pagamentos"],
  ])("gateway aprova e falha %s: 500 e nada é gravado (transação)", async (_caso, instrucao) => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    const antes = await lerPedidoPorId(pedido.id);
    simularGateway("aprovando");
    const { app, pool } = await appEmProducao("aprovando");
    falharNoBanco(pool, instrucao);

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    expect(res.status).toBe(500);
    expect(res.body.type).not.toMatch(/service-unavailable/);
    expect(res.body.checkoutUrl).toBeUndefined();
    expect(await lerPedidoPorId(pedido.id)).toEqual(antes);
    expect(await pagamentosDoPedido(pedido.id)).toEqual([]);
  });

  it("outra cobrança assume o pedido enquanto o gateway responde: 409 e o vínculo dela é mantido", async () => {
    const cliente = await criarUsuario("client");
    const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
    const { app } = await appEmProducao("aprovando");
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      await prisma.pedido.update({ where: { id: pedido.id }, data: { abacateBillingId: "bill_outro" } });
      return aprovacao("bill_real");
    });

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: pedido.id });

    esperarProblema(res, 409, "conflict");
    expect(res.body.checkoutUrl).toBeUndefined();
    expect((await lerPedidoPorId(pedido.id)).abacateBillingId).toBe("bill_outro");
    expect(await pagamentosDoPedido(pedido.id)).toEqual([]);
  });
});

describe("fora de produção", () => {
  describe("com token real, a falha do gateway não cai no simulador (§22)", () => {
    it.each<[Gateway, RegExp]>([
      ["recusando", NENHUMA_COBRANCA],
      ["fora do ar", NAO_CONFIRMADA],
    ])("checkout-cart com gateway %s: 503, sem link do simulador", async (gateway, detalhe) => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");
      simularGateway(gateway);
      const { app } = await carregarApp({ producao: false, gateway });

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send(carrinho(fabrica));

      esperarProblema(res, 503, "service-unavailable");
      expect(res.body.detail).toMatch(detalhe);
      expect(res.body.checkoutUrl).toBeUndefined();
    });

    it.each<[Gateway, RegExp]>([
      ["recusando", NENHUMA_COBRANCA],
      ["fora do ar", NAO_CONFIRMADA],
    ])("create-billing com gateway %s: 503, sem link do simulador e pedido inalterado", async (gateway, detalhe) => {
      const cliente = await criarUsuario("client");
      const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
      const antes = await lerPedidoPorId(pedido.id);
      simularGateway(gateway);
      const { app } = await carregarApp({ producao: false, gateway });

      const res = await request(app)
        .post("/api/payments/create-billing")
        .set(...comToken(cliente.token))
        .send({ orderId: pedido.id });

      esperarProblema(res, 503, "service-unavailable");
      expect(res.body.detail).toMatch(detalhe);
      expect(res.body.checkoutUrl).toBeUndefined();
      expect(await lerPedidoPorId(pedido.id)).toEqual(antes);
    });
  });

  describe("sem token, o simulador cobre o desenvolvimento", () => {
    it("POST /api/orders/checkout-cart devolve o checkout simulado", async () => {
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

    it("POST /api/payments/create-billing devolve o checkout simulado", async () => {
      const cliente = await criarUsuario("client");
      const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
      const { app } = await carregarApp({ producao: false, gateway: "ausente" });

      const res = await request(app)
        .post("/api/payments/create-billing")
        .set(...comToken(cliente.token))
        .send({ orderId: pedido.id });

      expect(res.status).toBe(200);
      expect(res.body.isSimulated).toBe(true);
      expect(res.body.checkoutUrl).toContain("/api/payments/simulated-checkout");
    });
  });
});
