// ============================================================
//   ID-02 — Nenhum payload expõe o id sequencial
//
//   Percorre a API inteira com um fluxo real (cadastro, catálogo,
//   estoque, pedido, cobrança, pagamento e design), guarda todas as
//   respostas JSON e o payload dos tokens emitidos, e verifica que
//   nenhum campo de identificador carrega um inteiro. As rotas passam a
//   receber publicId: o id interno, mesmo correto, responde 404.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { especificacaoDoStudio } from "../helpers/especificacao.js";
import { esperarProblema } from "../helpers/problem.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Campo com cara de identificador: id, *_id ou *Id. */
const CAMPO_DE_ID = /(^id$|_id$|Id$)/;

/**
 * Caminhos de todo campo de identificador cujo valor é um inteiro (número
 * ou texto só com dígitos), em qualquer profundidade do payload.
 */
function idsInteiros(valor: unknown, caminho = "$", achados: string[] = []): string[] {
  if (Array.isArray(valor)) {
    valor.forEach((item, i) => idsInteiros(item, `${caminho}[${i}]`, achados));
  } else if (valor && typeof valor === "object") {
    for (const [chave, filho] of Object.entries(valor)) {
      const inteiro = typeof filho === "number" || (typeof filho === "string" && /^\d+$/.test(filho));
      if (CAMPO_DE_ID.test(chave) && inteiro) achados.push(`${caminho}.${chave} = ${String(filho)}`);
      idsInteiros(filho, `${caminho}.${chave}`, achados);
    }
  }
  return achados;
}

/** Guarda cada resposta (e o payload de cada token) para a verificação final. */
function coletor() {
  const respostas: { rota: string; corpo: unknown }[] = [];
  return {
    respostas,
    async registrar(rota: string, req: request.Test, status = 200) {
      const res = await req;
      expect(res.status, `${rota}: ${JSON.stringify(res.body)}`).toBe(status);
      respostas.push({ rota, corpo: res.body });
      const token = res.body?.token;
      if (typeof token === "string") respostas.push({ rota: `${rota} (payload do token)`, corpo: jwt.decode(token) });
      return res;
    },
  };
}

describe("ID-02: nenhum payload expõe o id sequencial", () => {
  it("o fluxo completo da API só devolve publicIds", async () => {
    const { respostas, registrar } = coletor();

    // ── Autenticação ───────────────────────────────────────
    const email = `cliente-id02-${Date.now()}@exemplo.invalid`;
    const cadastro = await registrar("POST /auth/register",
      request(app).post("/api/auth/register").send({ name: "Cliente", email, password: "SenhaTeste123" }), 201);
    const login = await registrar("POST /auth/login",
      request(app).post("/api/auth/login").send({ email, password: "SenhaTeste123" }));
    const cliente = { token: login.body.token as string, publicId: cadastro.body.user.publicId as string };
    expect(cliente.publicId).toMatch(UUID);

    const staff = await criarUsuario("staff");
    const fabrica = await criarUsuario("factory");
    const como = (usuario: { token: string }) => comToken(usuario.token);

    await registrar("GET /auth/me", request(app).get("/api/auth/me").set(...como(cliente)));
    await registrar("GET /auth/users", request(app).get("/api/auth/users").set(...como(staff)));
    await registrar("PUT /auth/users/:publicId", request(app)
      .put(`/api/auth/users/${fabrica.publicId}`).set(...como(staff)).send({ name: "Fábrica ID-02", factoryName: "Fábrica" }));

    // ── Catálogo ───────────────────────────────────────────
    const categoria = await registrar("POST /categories", request(app)
      .post("/api/categories").set(...como(staff)).send({ nome: "Categoria ID-02" }), 201);
    await registrar("GET /categories", request(app).get("/api/categories"));
    await registrar("PUT /categories/:publicId", request(app)
      .put(`/api/categories/${categoria.body.publicId}`).set(...como(staff)).send({ nome: "Categoria ID-02 editada" }));

    const produto = await registrar("POST /products", request(app)
      .post("/api/products").set(...como(staff))
      .send({ nome: "Armação ID-02", preco: 199.9, categoriaPublicId: categoria.body.publicId }), 201);
    expect(produto.body.categoriaPublicId).toBe(categoria.body.publicId);
    await registrar("GET /products", request(app).get("/api/products").query({ categoriaPublicId: categoria.body.publicId }));
    await registrar("GET /products/:publicId", request(app).get(`/api/products/${produto.body.publicId}`));
    await registrar("PUT /products/:publicId", request(app)
      .put(`/api/products/${produto.body.publicId}`).set(...como(staff))
      .send({ nome: "Armação ID-02", preco: 210, categoriaPublicId: categoria.body.publicId }));
    await registrar("GET /categories/:publicId", request(app).get(`/api/categories/${categoria.body.publicId}`));

    // ── Estoque ────────────────────────────────────────────
    await registrar("PUT /stock/product/:publicId", request(app)
      .put(`/api/stock/product/${produto.body.publicId}`).set(...como(staff)).send({ quantidade: 2 }));
    await registrar("GET /stock", request(app).get("/api/stock").set(...como(staff)));
    await registrar("GET /stock/alerts", request(app).get("/api/stock/alerts").set(...como(fabrica)));
    await registrar("GET /stock/product/:publicId", request(app)
      .get(`/api/stock/product/${produto.body.publicId}`).set(...como(staff)));

    // ── Pedidos ────────────────────────────────────────────
    const pedido = await registrar("POST /orders", request(app).post("/api/orders").set(...como(cliente)).send({
      productName: "Armação ID-02", factoryPublicId: fabrica.publicId, factoryName: "Fábrica", customSpecs: especificacaoDoStudio(),
    }), 201);
    expect(pedido.body.factoryPublicId).toBe(fabrica.publicId);
    await registrar("POST /orders/checkout-cart", request(app).post("/api/orders/checkout-cart").set(...como(cliente)).send({
      cartItems: [{ productName: "Armação ID-02", factoryName: "Fábrica", customSpecs: especificacaoDoStudio() }],
    }));
    for (const usuario of [cliente, fabrica, staff]) {
      await registrar("GET /orders", request(app).get("/api/orders").set(...como(usuario)));
    }
    await registrar("GET /orders/mine", request(app).get("/api/orders/mine").set(...como(cliente)));
    await registrar("GET /orders/mine/:publicId", request(app)
      .get(`/api/orders/mine/${pedido.body.publicId}`).set(...como(cliente)));

    // ── Cobrança e pagamento ───────────────────────────────
    const cobranca = await registrar("POST /payments/create-billing", request(app)
      .post("/api/payments/create-billing").set(...como(cliente)).send({ orderPublicId: pedido.body.publicId }));
    const billingId = new URL(cobranca.body.checkoutUrl).searchParams.get("billingId");
    await registrar("POST /payments/confirm-simulated-payment", request(app)
      .post("/api/payments/confirm-simulated-payment").set(...como(cliente)).send({ billingId }));
    // FEAT-03: a fábrica só move o pedido depois que o pagamento o leva a Queued.
    await registrar("PUT /orders/:publicId/status", request(app)
      .put(`/api/orders/${pedido.body.publicId}/status`).set(...como(fabrica)).send({ status: "In production" }));
    const pagamentos = await registrar("GET /payments", request(app).get("/api/payments").set(...como(staff)));
    expect(pagamentos.body.pagamentos[0]).toMatchObject({ pedidoPublicId: pedido.body.publicId });

    // ── Designs ────────────────────────────────────────────
    await registrar("POST /designs", request(app).post("/api/designs").set(...como(cliente))
      .send({ name: "Design ID-02", model: "wayfarer_front_wayfarer_temples", color: "#112233" }), 201);
    await registrar("GET /designs", request(app).get("/api/designs").set(...como(cliente)));

    // ── Verificação ────────────────────────────────────────
    const vazamentos = respostas.flatMap(({ rota, corpo }) => idsInteiros(corpo).map(campo => `${rota}: ${campo}`));
    expect(vazamentos).toEqual([]);
    // Sanidade: a coleta realmente percorreu payloads com identificadores.
    expect(respostas.length).toBeGreaterThan(30);
    expect(JSON.stringify(respostas)).toContain(pedido.body.publicId);
  });

  it("o token identifica o usuário só pelo publicId", async () => {
    const usuario = await criarUsuario("client");
    const payload = jwt.decode(usuario.token) as jwt.JwtPayload;
    expect(payload).not.toHaveProperty("id");
    expect(payload.publicId).toBe(usuario.publicId);
  });
});

describe("ID-02: as rotas recebem publicId, não o id interno", () => {
  let staff: UsuarioDeTeste;
  let cliente: UsuarioDeTeste;

  async function montar() {
    staff = await criarUsuario("staff");
    cliente = await criarUsuario("client");
    const categoria = await prisma.categoria.create({ data: { nome: `Categoria ${Date.now()}` } });
    const produto = await prisma.produto.create({
      data: { nome: "Armação", preco: "100.00", estoque: { create: { quantidade: 1 } } },
    });
    const pedido = await prisma.pedido.create({
      data: { usuarioId: cliente.id, customerName: "C", customerEmail: cliente.email, productName: "A", total: "100.00" },
    });
    return { categoria, produto, pedido };
  }

  it("o id interno correto responde 404 em todas as rotas com identificador", async () => {
    const { categoria, produto, pedido } = await montar();
    const auth = (u: UsuarioDeTeste) => comToken(u.token);

    const tentativas = [
      request(app).get(`/api/categories/${categoria.id}`),
      request(app).put(`/api/categories/${categoria.id}`).set(...auth(staff)).send({ nome: "X" }),
      request(app).delete(`/api/categories/${categoria.id}`).set(...auth(staff)),
      request(app).get(`/api/products/${produto.id}`),
      request(app).put(`/api/products/${produto.id}`).set(...auth(staff)).send({ nome: "X", preco: 1 }),
      request(app).delete(`/api/products/${produto.id}`).set(...auth(staff)),
      request(app).get(`/api/stock/product/${produto.id}`).set(...auth(staff)),
      request(app).put(`/api/stock/product/${produto.id}`).set(...auth(staff)).send({ quantidade: 5 }),
      request(app).put(`/api/auth/users/${cliente.id}`).set(...auth(staff)).send({ name: "X" }),
      request(app).delete(`/api/auth/users/${cliente.id}`).set(...auth(staff)),
      request(app).get(`/api/orders/mine/${pedido.id}`).set(...auth(cliente)),
      request(app).put(`/api/orders/${pedido.id}/status`).set(...auth(staff)).send({ status: "Queued" }),
      request(app).post("/api/payments/create-billing").set(...auth(cliente)).send({ orderPublicId: String(pedido.id) }),
    ];

    for (const tentativa of tentativas) {
      esperarProblema(await tentativa, 404, "not-found");
    }

    // Nada foi alterado pelas tentativas com o id interno.
    expect(await prisma.categoria.findUnique({ where: { id: categoria.id } })).toMatchObject({ nome: categoria.nome });
    expect(await prisma.produto.findUnique({ where: { id: produto.id } })).toMatchObject({ nome: "Armação", ativo: true });
    expect(await prisma.estoque.findUnique({ where: { produtoId: produto.id } })).toMatchObject({ quantidade: 1 });
    expect(await prisma.usuario.findUnique({ where: { id: cliente.id } })).not.toBeNull();
    expect(await prisma.pedido.findUnique({ where: { id: pedido.id } })).toMatchObject({ abacateBillingId: null });
  });

  it("a mesma rota com o publicId funciona", async () => {
    const { produto } = await montar();
    const res = await request(app).get(`/api/products/${produto.publicId}`);
    expect(res.status).toBe(200);
    expect(res.body.publicId).toBe(produto.publicId);
  });

  it("categoria e fábrica inexistentes são recusadas com 400, sem gravar nada", async () => {
    await montar();
    const antes = { produtos: await prisma.produto.count(), pedidos: await prisma.pedido.count() };

    esperarProblema(await request(app).post("/api/products").set(...comToken(staff.token))
      .send({ nome: "Sem categoria", preco: 10, categoriaPublicId: "categoria-inexistente" }), 400, "bad-request");
    esperarProblema(await request(app).post("/api/orders").set(...comToken(cliente.token))
      .send({ productName: "A", factoryPublicId: cliente.publicId, factoryName: "F", customSpecs: especificacaoDoStudio() }),
    400, "bad-request");

    expect({ produtos: await prisma.produto.count(), pedidos: await prisma.pedido.count() }).toEqual(antes);
  });
});
