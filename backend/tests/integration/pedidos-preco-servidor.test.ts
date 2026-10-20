// ============================================================
//   SEC-05 — O total do pedido é calculado no servidor
//
//   O cliente mandava `total` no corpo e o valor ia direto para o
//   banco: um óculos de R$ 450 saía por R$ 0,01. Cada teste envia um
//   total mentiroso e confere o valor GRAVADO, que é o que a cobrança
//   usa, e não apenas a resposta.
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import request from "supertest";
import prisma from "../../src/config/prisma.js";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { esperarProblema } from "../helpers/problem.js";
import { especificacaoDoStudio, PRECO_DA_ESPECIFICACAO_PADRAO } from "../helpers/especificacao.js";

async function pedidosGravados() {
  const pedidos = await prisma.pedido.findMany({
    orderBy: { id: "asc" },
    select: { total: true, customSpecs: true, abacateBillingId: true },
  });
  return pedidos.map((p) => ({
    total: p.total.toFixed(2),
    customSpecs: JSON.parse(p.customSpecs ?? "{}") as Record<string, unknown>,
    abacateBillingId: p.abacateBillingId,
  }));
}

function itemDoCarrinho(fabricaId: number, alteracoes: Record<string, unknown> = {}) {
  return {
    productName: "Wayfarer · Acetato",
    factoryId: fabricaId,
    factoryName: "Fabrica",
    customSpecs: especificacaoDoStudio(),
    quantity: 1,
    ...alteracoes,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/orders — total calculado no servidor (SEC-05)", () => {
  it("total 0.01 no corpo não altera o valor gravado", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/orders")
      .set(...comToken(cliente.token))
      .send({ ...itemDoCarrinho(fabrica.id), total: 0.01 });

    expect(res.status).toBe(201);
    expect(res.body.order.total).toBe(PRECO_DA_ESPECIFICACAO_PADRAO);
    expect((await pedidosGravados()).map((p) => p.total)).toEqual([PRECO_DA_ESPECIFICACAO_PADRAO]);
  });

  it("sem total no corpo, o pedido é criado com o preço da regra", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/orders")
      .set(...comToken(cliente.token))
      .send(itemDoCarrinho(fabrica.id, {
        customSpecs: especificacaoDoStudio({ isSunglasses: true, frameMaterial: "titanium", lensTreatments: [] }),
      }));

    expect(res.status).toBe(201);
    // 180 + 40 (sol) + 80 (titânio)
    expect((await pedidosGravados()).map((p) => p.total)).toEqual(["300.00"]);
  });

  // A ficha que a fábrica recebe (custom_specs) não pode divergir do que foi cobrado.
  describe("a quantidade gravada é a quantidade cobrada", () => {
    it("customSpecs.quantity 100 sem quantity: cobra e grava 1 unidade", async () => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");

      const res = await request(app)
        .post("/api/orders")
        .set(...comToken(cliente.token))
        .send(itemDoCarrinho(fabrica.id, { quantity: undefined, customSpecs: especificacaoDoStudio({ quantity: 100 }) }));

      expect(res.status).toBe(201);
      const [pedido] = await pedidosGravados();
      expect(pedido.total).toBe(PRECO_DA_ESPECIFICACAO_PADRAO);
      expect(pedido.customSpecs.quantity).toBe(1);
    });

    it("quantity 3 cobra e grava 3 unidades, mesmo com outra quantidade em customSpecs", async () => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");

      const res = await request(app)
        .post("/api/orders")
        .set(...comToken(cliente.token))
        .send(itemDoCarrinho(fabrica.id, { quantity: 3, customSpecs: especificacaoDoStudio({ quantity: 100 }) }));

      expect(res.status).toBe(201);
      const [pedido] = await pedidosGravados();
      expect(pedido.total).toBe("630.00");
      expect(pedido.customSpecs.quantity).toBe(3);
    });

    it.each([0, 101, 2.5])("quantity %s responde 400 e não cria pedido", async (quantity) => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");

      const res = await request(app)
        .post("/api/orders")
        .set(...comToken(cliente.token))
        .send(itemDoCarrinho(fabrica.id, { quantity }));

      esperarProblema(res, 400, "bad-request");
      expect(res.body.invalidParams).toEqual([expect.objectContaining({ name: "quantity" })]);
      expect(await prisma.pedido.count()).toBe(0);
    });
  });
});

describe("POST /api/orders/checkout-cart — total calculado no servidor (SEC-05)", () => {
  it("ignora o total de cada item e grava preço unitário × quantidade", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send({
        cartItems: [
          itemDoCarrinho(fabrica.id, { total: 0.01, quantity: 2 }),
          itemDoCarrinho(fabrica.id, {
            total: 0.01,
            customSpecs: especificacaoDoStudio({ frameProfile: "bold", lensMaterial: "polycarbonate" }),
          }),
        ],
      });

    expect(res.status).toBe(200);
    const pedidos = await pedidosGravados();
    // 2 × 210,00 e 180 + 20 (bold) + 30 (policarbonato) + 2 × 15 = 260,00
    expect(pedidos.map((p) => p.total)).toEqual(["420.00", "260.00"]);
    expect(pedidos.map((p) => p.customSpecs.quantity)).toEqual([2, 1]);
  });

  it("o que é gravado na especificação é o que foi precificado", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send({
        cartItems: [
          itemDoCarrinho(fabrica.id, {
            customSpecs: especificacaoDoStudio({ lensTreatments: ["polarized", "polarized", "polarized"] }),
          }),
        ],
      });

    expect(res.status).toBe(200);
    const [pedido] = await pedidosGravados();
    // Tratamento repetido é cobrado e gravado uma vez só; o resto do Studio é preservado.
    expect(pedido.total).toBe("195.00");
    expect(pedido.customSpecs.lensTreatments).toEqual(["polarized"]);
    expect(pedido.customSpecs.color).toBe("#382016");
  });

  it("o gateway de pagamento cobra o preço do servidor, não o do corpo", async () => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");
    vi.stubEnv("ABACATE_TOKEN", "token-de-teste");
    const gateway = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { id: "bill_gateway", url: "https://gateway.invalid/pagar" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send({ cartItems: [itemDoCarrinho(fabrica.id, { total: 0.01, quantity: 3 })] });

    expect(res.status).toBe(200);
    expect(res.body.isSimulated).toBe(false);
    expect(gateway).toHaveBeenCalledTimes(1);
    const cobranca = JSON.parse(String(gateway.mock.calls[0][1]?.body));
    expect(cobranca.products).toEqual([
      expect.objectContaining({ quantity: 3, price: 21_000 }),
    ]);
    expect((await pedidosGravados()).map((p) => p.total)).toEqual(["630.00"]);
    const persistido = await pool.query("SELECT pagamento_simulado FROM pedidos WHERE abacate_billing_id = $1", ["bill_gateway"]);
    expect(persistido.rows).toEqual([{ pagamento_simulado: false }]);
    const simulada = await request(app).post("/api/payments/confirm-simulated-payment")
      .set(...comToken(cliente.token)).send({ billingId: "bill_gateway" });
    expect(simulada.status).toBe(404);
    expect((await pool.query("SELECT status FROM pedidos WHERE abacate_billing_id = $1", ["bill_gateway"])).rows)
      .toEqual([{ status: "Pending Payment" }]);
  });

  describe("especificação fora do catálogo responde 400 e não cria pedido", () => {
    it.each<[string, Record<string, unknown>, string]>([
      ["material inexistente", { frameMaterial: "unobtainium" }, "frameMaterial"],
      ["material com outra grafia", { frameMaterial: "Titanium" }, "frameMaterial"],
      ["perfil inexistente", { frameProfile: "extra-bold" }, "frameProfile"],
      ["lente inexistente", { lensMaterial: "diamond" }, "lensMaterial"],
      ["tratamento inexistente", { lensTreatments: ["scratch_resistant"] }, "lensTreatments.0"],
      ["lente de sol como texto", { isSunglasses: "false" }, "isSunglasses"],
      ["campo de preço ausente", { frameMaterial: undefined }, "frameMaterial"],
    ])("%s", async (_caso, alteracoes, campo) => {
      const fabrica = await criarUsuario("factory");
      const cliente = await criarUsuario("client");

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(cliente.token))
        .send({ cartItems: [itemDoCarrinho(fabrica.id, { customSpecs: especificacaoDoStudio(alteracoes) })] });

      esperarProblema(res, 400, "bad-request");
      expect(res.body.invalidParams).toEqual([
        expect.objectContaining({ name: `cartItems.0.customSpecs.${campo}` }),
      ]);
      expect(await prisma.pedido.count()).toBe(0);
    });
  });

  it.each([0, 101, 2.5])("quantidade %s responde 400 e não cria pedido", async (quantity) => {
    const fabrica = await criarUsuario("factory");
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send({ cartItems: [itemDoCarrinho(fabrica.id, { quantity })] });

    esperarProblema(res, 400, "bad-request");
    expect(res.body.invalidParams).toEqual([expect.objectContaining({ name: "cartItems.0.quantity" })]);
    expect(await prisma.pedido.count()).toBe(0);
  });
});
