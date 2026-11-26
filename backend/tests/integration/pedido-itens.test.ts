// ============================================================
//   FEAT-04 (#48) — itens do pedido em pedido_itens (ADR-0004)
//
//   Cada pedido grava os seus itens, com o preço unitário do servidor,
//   e a API os devolve. No checkout, um pedido por fábrica (parte 2).
//
//   Banco real; no checkout com gateway, só o AbacatePay é simulado.
// ============================================================

import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import prisma from "../../src/config/prisma.js";
import { inserirPedido } from "../../src/services/orderService.js";
import { cartItemSchema } from "../../src/dtos/order/order.dto.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { especificacaoDoStudio, PRECO_DA_ESPECIFICACAO_PADRAO } from "../helpers/especificacao.js";
import { checkoutsEnviados, espiarCheckout, produtosEnviados } from "../helpers/gateway.js";
import { caixaDeSaidaDeTeste, limparCaixaDeSaida } from "../../src/utils/emailService.js";

/** A especificação como o service a recebe: já validada pelo schema da rota. */
const validada = (especificacao: Record<string, unknown>) => cartItemSchema.shape.customSpecs.parse(especificacao);

const item = (extra: Record<string, unknown> = {}) => ({
  productName: "Armação", factoryName: "Fábrica", customSpecs: especificacaoDoStudio(), ...extra,
});

/** 180 base + 4 tratamentos × 15 + policarbonato 30 = 270,00. */
const especificacaoCara = () => especificacaoDoStudio({
  lensMaterial: "polycarbonate",
  lensTreatments: ["anti_reflective", "uv_protection", "blue_light", "polarized"],
});

const itensNoBanco = () => prisma.pedidoItem.findMany({
  orderBy: { id: "asc" },
  select: {
    productName: true, customSpecs: true, quantidade: true, precoUnitario: true,
    pedido: { select: { publicId: true, total: true, customSpecs: true } },
  },
});

describe("FEAT-04 — o pedido grava os seus itens", () => {
  it("o checkout do carrinho grava os itens com o preço do servidor", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const outraFabrica = await criarUsuario("factory");

    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
      cartItems: [
        // Preço e total enviados pelo cliente são descartados pelo schema.
        item({ productName: "Wayfarer", factoryPublicId: fabrica.publicId, quantity: 2, total: 1, unitPrice: 1 }),
        item({ productName: "Redondo", factoryPublicId: outraFabrica.publicId, customSpecs: { ...especificacaoCara(), quantity: 99 }, quantity: 3 }),
      ],
    });

    expect(res.status).toBe(200);
    const itens = await itensNoBanco();
    expect(itens.map(({ pedido: _pedido, ...resto }) => ({ ...resto, precoUnitario: resto.precoUnitario.toFixed(2) })))
      .toEqual([
        { productName: "Wayfarer", customSpecs: especificacaoDoStudio(), quantidade: 2, precoUnitario: PRECO_DA_ESPECIFICACAO_PADRAO },
        // A quantity dentro da especificação não vale nem é gravada no item.
        { productName: "Redondo", customSpecs: especificacaoCara(), quantidade: 3, precoUnitario: "270.00" },
      ]);
    // Uma fábrica por item, então um pedido por item; o total é a soma dos itens.
    expect(new Set(itens.map(i => i.pedido.publicId)).size).toBe(2);
    expect(itens.map(i => i.pedido.total.toFixed(2))).toEqual(["420.00", "810.00"]);
    // Transição: o pedido de um item continua com a especificação e a quantidade, como antes.
    expect(JSON.parse(itens[1].pedido.customSpecs!)).toEqual({ ...especificacaoCara(), quantity: 3 });
  });

  it("o checkout do carrinho salvo na conta grava os itens das linhas", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const adicionado = await request(app).post("/api/cart/items").set(...comToken(cliente.token))
      .send(item({ productName: "Aviador", factoryPublicId: fabrica.publicId, quantity: 2 }));
    expect(adicionado.status).toBe(201);

    const res = await request(app).post("/api/cart/checkout").set(...comToken(cliente.token)).send({
      items: adicionado.body.items.map((i: { publicId: string; quantity: number }) => ({ publicId: i.publicId, quantity: i.quantity })),
    });

    expect(res.status).toBe(200);
    const [gravado] = await itensNoBanco();
    expect(gravado).toMatchObject({ productName: "Aviador", quantidade: 2, customSpecs: especificacaoDoStudio() });
    expect(gravado.precoUnitario.toFixed(2)).toBe(PRECO_DA_ESPECIFICACAO_PADRAO);
  });

  it("vários itens num pedido: o total é a soma, e o pedido guarda só um resumo", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");

    const { pedido, itens } = await prisma.$transaction(tx => inserirPedido(tx,
      { publicId: cliente.publicId, name: cliente.nome, email: cliente.email },
      {
        factoryPublicId: fabrica.publicId, factoryName: "Fábrica",
        itens: [
          { productName: "Wayfarer", customSpecs: validada(especificacaoDoStudio()), quantity: 2 },
          { productName: "Redondo", customSpecs: validada(especificacaoCara()), quantity: 1 },
        ],
      }, null));

    const lido = await prisma.pedido.findUniqueOrThrow({
      where: { publicId: pedido.publicId },
      select: { total: true, productName: true, customSpecs: true },
    });
    expect(lido.total.toFixed(2)).toBe("690.00");
    expect(lido.productName).toBe("Wayfarer (+1)");
    expect(lido.customSpecs).toBeNull();
    // O que vai para o gateway sai do que ficou gravado, na ordem escolhida.
    expect(itens).toEqual([
      { publicId: expect.any(String), productName: "Wayfarer", quantity: 2, precoUnitarioEmCentavos: 21_000 },
      { publicId: expect.any(String), productName: "Redondo", quantity: 1, precoUnitarioEmCentavos: 27_000 },
    ]);
    // A API devolve os dois itens, na mesma ordem, e a soma deles é o total.
    const res = await request(app).get("/api/orders").set(...comToken(cliente.token));
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].total).toBe("690.00");
    expect(res.body.orders[0].customSpecs).toEqual({});
    expect(res.body.orders[0].items.map((i: { productName: string; total: string }) => [i.productName, i.total]))
      .toEqual([["Wayfarer", "420.00"], ["Redondo", "270.00"]]);
  });

  it("o resumo de vários itens cabe na coluna mesmo com um nome no limite", async () => {
    const cliente = await criarUsuario("client");
    const nome = "N".repeat(255);

    const { pedido } = await prisma.$transaction(tx => inserirPedido(tx,
      { publicId: cliente.publicId, name: cliente.nome, email: cliente.email },
      {
        factoryName: "Fábrica",
        itens: [1, 2, 3].map(() => ({ productName: nome, customSpecs: validada(especificacaoDoStudio()), quantity: 1 })),
      }, null));

    expect(pedido.productName).toHaveLength(255);
    expect(pedido.productName.endsWith(" (+2)")).toBe(true);
  });

  it("pedido sem item não é gravado", async () => {
    const cliente = await criarUsuario("client");

    await expect(prisma.$transaction(tx => inserirPedido(tx,
      { publicId: cliente.publicId, name: cliente.nome, email: cliente.email },
      { factoryName: "Fábrica", itens: [] }, null))).rejects.toThrow(RangeError);
    expect(await prisma.pedido.count()).toBe(0);
  });

  it("uma fábrica inválida no meio do carrinho não deixa pedido nem item", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");

    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
      cartItems: [item({ factoryPublicId: fabrica.publicId }), item({ factoryPublicId: "fabrica-inexistente" })],
    });

    expect(res.status).toBe(400);
    expect(await prisma.pedido.count()).toBe(0);
    expect(await prisma.pedidoItem.count()).toBe(0);
  });
});

describe("FEAT-04 — a API devolve os itens só pelo pedido visível", () => {
  async function comprar(cliente: UsuarioDeTeste, fabrica: UsuarioDeTeste | null, productName: string) {
    const res = await request(app).post("/api/orders").set(...comToken(cliente.token))
      .send(item({ productName, ...(fabrica ? { factoryPublicId: fabrica.publicId } : {}) }));
    expect(res.status).toBe(201);
    return res.body as { publicId: string; items: { publicId: string }[] };
  }

  const nomesDosItens = (pedidos: { items: { productName: string }[] }[]) =>
    pedidos.flatMap(pedido => pedido.items.map(i => i.productName)).sort();

  it("GET /api/orders: cada papel vê os itens do seu recorte", async () => {
    const cliente = await criarUsuario("client");
    const outro = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const outraFabrica = await criarUsuario("factory");
    const staff = await criarUsuario("staff");
    await comprar(cliente, fabrica, "Do cliente");
    await comprar(outro, outraFabrica, "De outro");

    const ver = async (usuario: UsuarioDeTeste) =>
      (await request(app).get("/api/orders").set(...comToken(usuario.token))).body.orders;

    expect(nomesDosItens(await ver(cliente))).toEqual(["Do cliente"]);
    expect(nomesDosItens(await ver(fabrica))).toEqual(["Do cliente"]);
    // Staff é a exceção explícita: vê todos.
    expect(nomesDosItens(await ver(staff))).toEqual(["De outro", "Do cliente"]);
    const [pedido] = await ver(cliente);
    expect(pedido.items).toEqual([{
      publicId: expect.any(String), productName: "Do cliente", customSpecs: especificacaoDoStudio(),
      quantity: 1, unitPrice: PRECO_DA_ESPECIFICACAO_PADRAO, total: PRECO_DA_ESPECIFICACAO_PADRAO,
    }]);
    expect(Object.keys(pedido.items[0])).not.toContain("id");
  });

  it("Meus pedidos: lista e detalhe trazem os itens; o pedido de outra conta continua 404", async () => {
    const cliente = await criarUsuario("client");
    const outro = await criarUsuario("client");
    const meu = await comprar(cliente, null, "Meu");
    const alheio = await comprar(outro, null, "Alheio");

    const lista = await request(app).get("/api/orders/mine").set(...comToken(cliente.token));
    expect(lista.status).toBe(200);
    expect(nomesDosItens(lista.body.orders)).toEqual(["Meu"]);
    expect(lista.body.pagination.totalItems).toBe(1);

    const detalhe = await request(app).get(`/api/orders/mine/${meu.publicId}`).set(...comToken(cliente.token));
    expect(detalhe.status).toBe(200);
    expect(detalhe.body.order.items).toEqual([expect.objectContaining({
      publicId: meu.items[0].publicId, productName: "Meu", quantity: 1, unitPrice: PRECO_DA_ESPECIFICACAO_PADRAO,
    })]);

    const negado = await request(app).get(`/api/orders/mine/${alheio.publicId}`).set(...comToken(cliente.token));
    expect(negado.status).toBe(404);
    expect(JSON.stringify(negado.body)).not.toContain("Alheio");
  });
});

describe("FEAT-04 — o gateway cobra os itens gravados", () => {
  type Pool = { end: () => Promise<void> };
  const pools: Pool[] = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await Promise.all(pools.splice(0).map(p => p.end()));
  });

  async function appEmProducao(): Promise<Express> {
    vi.stubEnv("ABACATE_TOKEN", "token-de-teste");
    vi.stubEnv("WEBHOOK_SECRET", "segredo-privado-sintetico-producao");
    vi.stubEnv("FRONTEND_URL", "https://loja.test");
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { createApp } = await import("../../src/app.js");
    const { default: poolDoApp } = await import("../../src/config/db.js");
    pools.push(poolDoApp as unknown as Pool);
    vi.stubEnv("NODE_ENV", "test");
    return createApp({ requestLogging: false }) as Express;
  }

  it("cada item vira um produto, com o publicId do item e o preço unitário gravado", async () => {
    const appProducao = await appEmProducao();
    const gateway = espiarCheckout(async () => new Response(
      JSON.stringify({ success: true, error: null, data: { id: "bill_itens", url: "https://gateway.invalid/pagar/bill_itens" } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");

    const res = await request(appProducao).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
      cartItems: [
        item({ productName: "Wayfarer", factoryPublicId: fabrica.publicId, quantity: 2 }),
        item({ productName: "Redondo", factoryPublicId: fabrica.publicId, customSpecs: especificacaoCara() }),
      ],
    });

    expect(res.status).toBe(200);
    const itens = await prisma.pedidoItem.findMany({ orderBy: { id: "asc" }, select: { publicId: true } });
    expect(produtosEnviados(gateway)).toEqual([
      { externalId: `${itens[0].publicId}-21000`, name: "Wayfarer", price: 21_000, currency: "BRL" },
      { externalId: `${itens[1].publicId}-27000`, name: "Redondo", price: 27_000, currency: "BRL" },
    ]);
    const [checkout] = checkoutsEnviados(gateway);
    expect(checkout.items).toEqual([
      { id: `${itens[0].publicId}-21000`, quantity: 2 },
      { id: `${itens[1].publicId}-27000`, quantity: 1 },
    ]);
    // Os dois itens são da mesma fábrica: um pedido, ligado à cobrança.
    const { rows } = await pool.query<{ abacate_billing_id: string; total: string }>("SELECT abacate_billing_id, total::text FROM pedidos");
    expect(rows).toEqual([{ abacate_billing_id: "bill_itens", total: "690.00" }]);
  });
});

describe("FEAT-04 — o banco recusa item inválido", () => {
  async function pedidoCru(): Promise<number> {
    const dono = await criarUsuario("client");
    const pedido = await prisma.pedido.create({
      data: { usuarioId: dono.id, customerName: "C", customerEmail: "c@exemplo.invalid", productName: "P", total: "10.00" },
      select: { id: true },
    });
    return pedido.id;
  }

  const inserirItem = (pedidoId: number, quantidade: number, preco: string, produtoId: number | null = null) =>
    pool.query(
      `INSERT INTO pedido_itens (pedido_id, produto_id, product_name, custom_specs, quantidade, preco_unitario)
       VALUES ($1, $2, 'Item', '{}', $3, $4)`,
      [pedidoId, produtoId, quantidade, preco],
    );

  it.each([[0, "10.00"], [-1, "10.00"], [1, "-0.01"]])("quantidade %i com preço %s: violação de CHECK", async (quantidade, preco) => {
    const pedidoId = await pedidoCru();

    await expect(inserirItem(pedidoId, quantidade, preco)).rejects.toMatchObject({ code: "23514" });
    expect(await prisma.pedidoItem.count()).toBe(0);
  });

  it("item sem nome ou sem especificação é recusado", async () => {
    const pedidoId = await pedidoCru();

    await expect(pool.query(
      "INSERT INTO pedido_itens (pedido_id, custom_specs, quantidade, preco_unitario) VALUES ($1, '{}', 1, 1)", [pedidoId],
    )).rejects.toMatchObject({ code: "23502" });
    await expect(pool.query(
      "INSERT INTO pedido_itens (pedido_id, product_name, quantidade, preco_unitario) VALUES ($1, 'Item', 1, 1)", [pedidoId],
    )).rejects.toMatchObject({ code: "23502" });
  });

  it("apagar o produto do catálogo mantém o item, sem o produto", async () => {
    const pedidoId = await pedidoCru();
    const produto = await prisma.produto.create({ data: { nome: "Catálogo", preco: "10.00" }, select: { id: true } });
    await inserirItem(pedidoId, 1, "10.00", produto.id);

    await prisma.produto.delete({ where: { id: produto.id } });

    const [restante] = await prisma.pedidoItem.findMany({ select: { produtoId: true, productName: true } });
    expect(restante).toEqual({ produtoId: null, productName: "Item" });
  });

  it("apagar o pedido apaga os itens", async () => {
    const pedidoId = await pedidoCru();
    await inserirItem(pedidoId, 1, "10.00");

    await prisma.pedido.delete({ where: { id: pedidoId } });

    expect(await prisma.pedidoItem.count()).toBe(0);
  });
});

describe("FEAT-04 — um pedido por fábrica", () => {
  const confirmarSimulado = (cliente: UsuarioDeTeste, billingId: string) =>
    request(app).post("/api/payments/confirm-simulated-payment").set(...comToken(cliente.token)).send({ billingId });

  it("os itens da mesma fábrica viram um pedido; outra fábrica, outro pedido", async () => {
    const cliente = await criarUsuario("client");
    const padrao = await criarUsuario("factory");
    const outra = await criarUsuario("factory");

    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
      cartItems: [
        item({ productName: "Wayfarer", factoryPublicId: outra.publicId, quantity: 2 }),
        item({ productName: "Redondo", factoryPublicId: padrao.publicId, customSpecs: especificacaoCara() }),
        // Sem fábrica: vai para a padrão (a mais antiga) e entra no pedido dela.
        item({ productName: "Aviador" }),
        item({ productName: "Gatinho", factoryPublicId: outra.publicId }),
      ],
    });

    expect(res.status).toBe(200);
    const pedidos = await prisma.pedido.findMany({
      orderBy: { id: "asc" },
      select: {
        productName: true, total: true, customSpecs: true, abacateBillingId: true,
        fabrica: { select: { publicId: true } },
        itens: { orderBy: { id: "asc" }, select: { productName: true, quantidade: true } },
      },
    });
    // Na ordem em que cada fábrica aparece no carrinho; os itens, na ordem do carrinho.
    expect(pedidos.map(p => ({
      fabrica: p.fabrica?.publicId, total: p.total.toFixed(2), nome: p.productName, especificacao: p.customSpecs,
      itens: p.itens.map(i => [i.productName, i.quantidade]),
    }))).toEqual([
      { fabrica: outra.publicId, total: "630.00", nome: "Wayfarer (+1)", especificacao: null, itens: [["Wayfarer", 2], ["Gatinho", 1]] },
      { fabrica: padrao.publicId, total: "480.00", nome: "Redondo (+1)", especificacao: null, itens: [["Redondo", 1], ["Aviador", 1]] },
    ]);
    expect(pedidos.every(p => p.abacateBillingId === res.body.billingId)).toBe(true);
  });

  it("cada fábrica vê só o seu pedido, com os itens dele", async () => {
    const cliente = await criarUsuario("client");
    const fabricaA = await criarUsuario("factory");
    const fabricaB = await criarUsuario("factory");
    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
      cartItems: [
        item({ productName: "De A", factoryPublicId: fabricaA.publicId }),
        item({ productName: "De B", factoryPublicId: fabricaB.publicId }),
        item({ productName: "Também de A", factoryPublicId: fabricaA.publicId }),
      ],
    });
    expect(res.status).toBe(200);

    const ver = async (usuario: UsuarioDeTeste): Promise<string[][]> =>
      (await request(app).get("/api/orders").set(...comToken(usuario.token))).body.orders
        .map((p: { items: { productName: string }[] }) => p.items.map(i => i.productName));

    expect(await ver(fabricaA)).toEqual([["De A", "Também de A"]]);
    expect(await ver(fabricaB)).toEqual([["De B"]]);
    expect((await ver(cliente)).flat().sort()).toEqual(["De A", "De B", "Também de A"]);
  });

  it("carrinho da conta: cada linha fica ligada ao pedido da sua fábrica, e o pagamento esvazia o carrinho", async () => {
    const cliente = await criarUsuario("client");
    const fabricaA = await criarUsuario("factory");
    const fabricaB = await criarUsuario("factory");
    for (const [productName, fabrica] of [["Um", fabricaA], ["Dois", fabricaB], ["Três", fabricaA]] as const) {
      const adicionado = await request(app).post("/api/cart/items").set(...comToken(cliente.token))
        .send(item({ productName, factoryPublicId: fabrica.publicId }));
      expect(adicionado.status).toBe(201);
    }
    const carrinho = await request(app).get("/api/cart").set(...comToken(cliente.token));
    const visto = { items: carrinho.body.items.map((i: { publicId: string; quantity: number }) => ({ publicId: i.publicId, quantity: i.quantity })) };

    const res = await request(app).post("/api/cart/checkout").set(...comToken(cliente.token)).send(visto);

    expect(res.status).toBe(200);
    const linhas = await prisma.carrinhoItem.findMany({
      orderBy: { id: "asc" },
      select: { productName: true, pedido: { select: { fabrica: { select: { publicId: true } }, _count: { select: { itens: true } } } } },
    });
    expect(linhas.map(l => [l.productName, l.pedido?.fabrica?.publicId, l.pedido?._count.itens])).toEqual([
      ["Um", fabricaA.publicId, 2], ["Dois", fabricaB.publicId, 1], ["Três", fabricaA.publicId, 2],
    ]);
    expect(await prisma.pedido.count()).toBe(2);

    expect((await confirmarSimulado(cliente, res.body.billingId)).status).toBe(200);
    expect(await prisma.carrinhoItem.count()).toBe(0);
    expect((await prisma.pedido.findMany({ select: { status: true } })).map(p => p.status)).toEqual(["Queued", "Queued"]);
  });

  it("a página do simulador lista cada item, com a quantidade e o total dele, escapados", async () => {
    const cliente = await criarUsuario("client");
    await criarUsuario("factory");
    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
      cartItems: [
        item({ productName: "Wayfarer", quantity: 2 }),
        item({ productName: "<b>Redondo</b>", customSpecs: especificacaoCara() }),
      ],
    });
    expect(res.status).toBe(200);
    const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

    const pagina = await request(app).get("/api/payments/simulated-checkout").query({ billingId: res.body.billingId })
      .set(...comToken(cliente.token)).set("Accept-Language", "pt-BR");

    expect(pagina.status).toBe(200);
    expect(pagina.text).toContain("2 × Wayfarer:");
    expect(pagina.text).toContain(reais.format(420));
    expect(pagina.text).toContain("1 × &lt;b&gt;Redondo&lt;/b&gt;:");
    expect(pagina.text).not.toContain("<b>Redondo");
    expect(pagina.text).toContain(reais.format(690));
  });

  it("o e-mail de status cita todos os itens do pedido", async () => {
    limparCaixaDeSaida();
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
      cartItems: [
        item({ productName: "Wayfarer", factoryPublicId: fabrica.publicId, quantity: 2 }),
        item({ productName: "Redondo", factoryPublicId: fabrica.publicId }),
      ],
    });
    expect((await confirmarSimulado(cliente, res.body.billingId)).status).toBe(200);
    const pedido = await prisma.pedido.findFirstOrThrow({ select: { publicId: true, version: true } });

    const atualizado = await request(app).put(`/api/orders/${pedido.publicId}/status`).set(...comToken(fabrica.token))
      .send({ status: "In production", version: pedido.version });

    expect(atualizado.status).toBe(200);
    // A resposta da rota continua sem os itens.
    expect(atualizado.body).not.toHaveProperty("itens");
    expect(caixaDeSaidaDeTeste).toHaveLength(1);
    expect(caixaDeSaidaDeTeste[0].html).toContain("2× Wayfarer, Redondo");
  });

  describe("pedido sem itens, gravado antes da conversão", () => {
    /** Como a versão anterior da API gravava: sem item. Com billingId, numa cobrança simulada pendente. */
    async function pedidoSemItens(dono: UsuarioDeTeste, opcoes: { fabrica?: UsuarioDeTeste; billingId?: string }) {
      const { rows: [pedido] } = await pool.query<{ publicId: string; version: number }>(
        `INSERT INTO pedidos (usuario_id, customer_name, customer_email, product_name, factory_id, total, status,
                              abacate_billing_id, pagamento_simulado)
         VALUES ($1, 'Cliente', 'cliente@exemplo.invalid', 'Armação antiga', $2, '159.90', $3, $4, $5)
         RETURNING "publicId", version`,
        [dono.id, opcoes.fabrica?.id ?? null, opcoes.billingId ? "Pending Payment" : "Queued",
          opcoes.billingId ?? null, Boolean(opcoes.billingId)],
      );
      return pedido;
    }

    it("a página do simulador mostra o próprio pedido, sem quantidade", async () => {
      const cliente = await criarUsuario("client");
      await pedidoSemItens(cliente, { billingId: "bill-sim-antigo" });
      const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

      const pagina = await request(app).get("/api/payments/simulated-checkout").query({ billingId: "bill-sim-antigo" })
        .set(...comToken(cliente.token)).set("Accept-Language", "pt-BR");

      expect(pagina.status).toBe(200);
      expect(pagina.text).toContain("<span>Armação antiga:</span>");
      expect(pagina.text).toContain(reais.format(159.9));
    });

    it("o e-mail de status usa o nome do pedido", async () => {
      limparCaixaDeSaida();
      const cliente = await criarUsuario("client");
      const fabrica = await criarUsuario("factory");
      const pedido = await pedidoSemItens(cliente, { fabrica });

      const atualizado = await request(app).put(`/api/orders/${pedido.publicId}/status`).set(...comToken(fabrica.token))
        .send({ status: "In production", version: pedido.version });

      expect(atualizado.status).toBe(200);
      expect(caixaDeSaidaDeTeste[0].html).toContain("<strong>Armação antiga</strong>");
    });
  });
});
