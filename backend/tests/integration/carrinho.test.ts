// ============================================================
//   CART-01 (#115) — carrinho persistido por conta
//
//   O carrinho é da conta do token, não do navegador: outra sessão da
//   mesma conta vê os mesmos itens, e outra conta nunca vê nem altera
//   os dele. O checkout sai das linhas gravadas, e uma linha só deixa o
//   carrinho quando o pagamento do pedido dela é confirmado.
//
//   Banco real; o pagamento é o simulador (sem token do gateway).
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken, obterToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { especificacaoDoStudio } from "../helpers/especificacao.js";
import { esperarProblema } from "../helpers/problem.js";

const UUID_INEXISTENTE = "6f1c2a4e-1b2d-4c3e-9f4a-5b6c7d8e9f00";

function item(alteracoes: Record<string, unknown> = {}, quantity = 1) {
  return {
    productName: "Wayfarer · Acetato",
    factoryName: "Demo Factory",
    customSpecs: especificacaoDoStudio(alteracoes),
    quantity,
  };
}

const carrinho = (u: UsuarioDeTeste, token = u.token) => request(app).get("/api/cart").set(...comToken(token));
const adicionar = (u: UsuarioDeTeste, corpo: object) => request(app).post("/api/cart/items").set(...comToken(u.token)).send(corpo);
const alterar = (u: UsuarioDeTeste, publicId: string, quantity: number | string) =>
  request(app).patch(`/api/cart/items/${publicId}`).set(...comToken(u.token)).send({ quantity });
const remover = (u: UsuarioDeTeste, publicId: string) => request(app).delete(`/api/cart/items/${publicId}`).set(...comToken(u.token));
const finalizar = (u: UsuarioDeTeste, items: Array<{ publicId: string; quantity: number }>) =>
  request(app).post("/api/cart/checkout").set(...comToken(u.token)).send({ items });
const visto = (res: request.Response) =>
  (res.body.items as Array<{ publicId: string; quantity: number }>).map(({ publicId, quantity }) => ({ publicId, quantity }));
const confirmarSimulado = (u: UsuarioDeTeste, billingId: string) =>
  request(app).post("/api/payments/confirm-simulated-payment").set(...comToken(u.token)).send({ billingId });

describe("carrinho da conta — CRUD e preço do servidor", () => {
  it("começa vazio", async () => {
    const cliente = await criarUsuario();
    const res = await carrinho(cliente);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], subtotal: "0.00" });
  });

  it("adiciona com o preço calculado no servidor, ignorando preço e quantidade enviados na especificação", async () => {
    const cliente = await criarUsuario();
    const res = await adicionar(cliente, { ...item({ quantity: 50 }, 2), total: 1, unitPrice: "0.01" });

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe("420.00");
    expect(res.body.items).toEqual([expect.objectContaining({
      publicId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      productName: "Wayfarer · Acetato",
      factoryPublicId: null,
      factoryName: "Demo Factory",
      quantity: 2,
      unitPrice: "210.00",
      total: "420.00",
      available: true,
      paymentPending: false,
    })]);
    expect(res.body.items[0].customSpecs).not.toHaveProperty("quantity");
  });

  it("a mesma configuração soma na mesma linha (200); outra configuração do mesmo modelo é outra linha (201)", async () => {
    const cliente = await criarUsuario();
    await adicionar(cliente, item());

    const igual = await adicionar(cliente, item({}, 2));
    expect(igual.status).toBe(200);
    expect(igual.body.items).toHaveLength(1);
    expect(igual.body.items[0].quantity).toBe(3);

    const outraCor = await adicionar(cliente, item({ color: "#000000" }));
    expect(outraCor.status).toBe(201);
    expect(outraCor.body.items).toHaveLength(2);

    // A ordem dos campos não cria outra linha.
    const reordenado = await adicionar(cliente, {
      quantity: 1,
      customSpecs: Object.fromEntries(Object.entries(especificacaoDoStudio()).reverse()),
      factoryName: "Demo Factory",
      productName: "Wayfarer · Acetato",
    });
    expect(reordenado.status).toBe(200);
    expect(reordenado.body.items.map((i: { quantity: number }) => i.quantity)).toEqual([4, 1]);

    // Os mesmos tratamentos em outra ordem, ou repetidos, também são a mesma configuração.
    const tratamentos = await adicionar(cliente, item({ lensTreatments: ["uv_protection", "anti_reflective", "uv_protection"] }));
    expect(tratamentos.status).toBe(200);
    expect(tratamentos.body.items.map((i: { quantity: number }) => i.quantity)).toEqual([5, 1]);
  });

  it("cliques simultâneos na mesma configuração somam numa linha só, sem perder unidade", async () => {
    const cliente = await criarUsuario();
    const respostas = await Promise.all(Array.from({ length: 5 }, () => adicionar(cliente, item())));
    expect(respostas.map(r => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    const { body } = await carrinho(cliente);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].quantity).toBe(5);
  });

  it("altera a quantidade e remove itens, devolvendo o carrinho atualizado", async () => {
    const cliente = await criarUsuario();
    const { body } = await adicionar(cliente, item());
    const [linha] = body.items;

    const alterado = await alterar(cliente, linha.publicId, 5);
    expect(alterado.status).toBe(200);
    expect(alterado.body.items[0]).toMatchObject({ quantity: 5, total: "1050.00" });
    expect(alterado.body.subtotal).toBe("1050.00");

    const removido = await remover(cliente, linha.publicId);
    expect(removido.status).toBe(200);
    expect(removido.body).toEqual({ items: [], subtotal: "0.00" });
  });

  it("esvazia o carrinho", async () => {
    const cliente = await criarUsuario();
    await adicionar(cliente, item());
    await adicionar(cliente, item({ color: "#000000" }));

    const res = await request(app).delete("/api/cart").set(...comToken(cliente.token));
    expect(res.status).toBe(204);
    expect((await carrinho(cliente)).body.items).toEqual([]);
  });

  it.each<[string, number | string]>([
    ["zero", 0], ["negativa", -1], ["acima do teto", 101], ["fracionária", 1.5], ["texto", "2"],
  ])("recusa quantidade %s com 400", async (_caso, quantidade) => {
    const cliente = await criarUsuario();
    const { body } = await adicionar(cliente, item());
    esperarProblema(await alterar(cliente, body.items[0].publicId, quantidade), 400, "bad-request");
  });

  it("somar além de 100 unidades numa linha dá 400 e não muda a linha", async () => {
    const cliente = await criarUsuario();
    await adicionar(cliente, item({}, 60));
    esperarProblema(await adicionar(cliente, item({}, 41)), 400, "bad-request");
    expect((await carrinho(cliente)).body.items[0].quantity).toBe(60);
  });

  it("aceita até 20 linhas diferentes", async () => {
    const cliente = await criarUsuario();
    for (let n = 0; n < 20; n++) {
      expect((await adicionar(cliente, item({ color: `#0000${String(n).padStart(2, "0")}` }))).status).toBe(201);
    }
    esperarProblema(await adicionar(cliente, item({ color: "#ffffff" })), 400, "bad-request");
    // Somar numa linha existente continua valendo.
    expect((await adicionar(cliente, item({ color: "#000000" }))).status).toBe(200);
  });

  it.each<[string, Record<string, unknown>]>([
    ["arte aguardando validação", { artwork: { version: 1, layers: [{ id: "a", kind: "text", text: "Oi" }] } }],
    ["estampa aguardando validação", { surfacePattern: { version: 1, style: "checker", scale: 2, rotation: 0, ink: "#ffffff" } }],
    ["material fora do catálogo", { frameMaterial: "ouro-maciço" }],
  ])("recusa item com %s (400), como o checkout", async (_caso, alteracao) => {
    const cliente = await criarUsuario();
    esperarProblema(await adicionar(cliente, item(alteracao)), 400, "bad-request");
    expect((await carrinho(cliente)).body.items).toEqual([]);
  });

  it("recusa fábrica inexistente (400) e aceita uma fábrica real", async () => {
    const cliente = await criarUsuario();
    const fabrica = await criarUsuario("factory");
    esperarProblema(await adicionar(cliente, { ...item(), factoryPublicId: UUID_INEXISTENTE }), 400, "bad-request");
    expect((await adicionar(cliente, { ...item(), factoryPublicId: fabrica.publicId })).status).toBe(201);
  });
});

describe("carrinho da conta — dono e sessões", () => {
  it("outra sessão da mesma conta (outro navegador) vê os mesmos itens, quantidades e configurações", async () => {
    const cliente = await criarUsuario();
    const adicionado = await adicionar(cliente, item({ color: "#123456" }, 3));

    const outraSessao = await obterToken(cliente.email, cliente.senha);
    const res = await carrinho(cliente, outraSessao);
    expect(res.body).toEqual(adicionado.body);
  });

  it("conta B não vê, não altera e não remove itens da conta A (404 igual ao inexistente)", async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();
    const { body } = await adicionar(a, item());
    const daA = body.items[0].publicId;

    expect((await carrinho(b)).body.items).toEqual([]);
    for (const res of [await alterar(b, daA, 7), await remover(b, daA), await alterar(b, UUID_INEXISTENTE, 7)]) {
      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Item não encontrado no seu carrinho.");
    }
    // Esvaziar o carrinho de B não toca no de A, e o checkout de B não compra o item de A.
    await request(app).delete("/api/cart").set(...comToken(b.token));
    esperarProblema(await finalizar(b, [{ publicId: daA, quantity: 1 }]), 409, "conflict");
    expect((await carrinho(a)).body).toEqual(body);
  });

  it("o dono vem do token: um usuarioId ou ownerPublicId no corpo é ignorado", async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();
    const res = await adicionar(b, { ...item(), ownerPublicId: a.publicId, usuarioId: a.id });
    expect(res.status).toBe(201);
    expect((await carrinho(a)).body.items).toEqual([]);
    expect((await carrinho(b)).body.items).toHaveLength(1);
  });

  it("a conta apagada perde o carrinho", async () => {
    const cliente = await criarUsuario();
    await adicionar(cliente, item());
    await prisma.usuario.delete({ where: { id: cliente.id } });
    expect(await prisma.carrinhoItem.count()).toBe(0);
  });
});

describe("carrinho da conta — checkout", () => {
  it("cria os pedidos a partir das linhas gravadas, com o preço do servidor, e mantém os itens até o pagamento", async () => {
    const cliente = await criarUsuario();
    await adicionar(cliente, item({}, 2));
    const atual = await adicionar(cliente, item({ isSunglasses: true }));

    const res = await finalizar(cliente, visto(atual));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ isSimulated: true, billingId: expect.any(String) });

    const pedidos = await prisma.pedido.findMany({ where: { usuarioId: cliente.id }, orderBy: { id: "asc" } });
    expect(pedidos.map(p => [p.total.toFixed(2), JSON.parse(p.customSpecs!).quantity])).toEqual([["420.00", 2], ["250.00", 1]]);

    // O pagamento ainda não foi confirmado: o carrinho continua, marcado.
    const depois = await carrinho(cliente);
    expect(depois.body.items.map((i: { paymentPending: boolean }) => i.paymentPending)).toEqual([true, true]);
  });

  it("o pagamento confirmado tira do carrinho só os itens daquele checkout", async () => {
    const cliente = await criarUsuario();
    const atual = await adicionar(cliente, item());
    const { body } = await finalizar(cliente, visto(atual));

    // Item adicionado depois do checkout não faz parte do pagamento.
    await adicionar(cliente, item({ color: "#000000" }));

    expect((await confirmarSimulado(cliente, body.billingId)).status).toBe(200);
    const depois = await carrinho(cliente);
    expect(depois.body.items).toHaveLength(1);
    expect(depois.body.items[0].customSpecs.color).toBe("#000000");
  });

  it("item alterado depois do checkout perde o vínculo e fica no carrinho após o pagamento", async () => {
    const cliente = await criarUsuario();
    const atual = await adicionar(cliente, item());
    const { body } = await finalizar(cliente, visto(atual));
    await alterar(cliente, atual.body.items[0].publicId, 3);

    expect((await confirmarSimulado(cliente, body.billingId)).status).toBe(200);
    const depois = await carrinho(cliente);
    expect(depois.body.items).toEqual([expect.objectContaining({ quantity: 3, paymentPending: false })]);
  });

  it("pagamento não confirmado (cobrança abandonada) não esvazia o carrinho", async () => {
    const cliente = await criarUsuario();
    const atual = await adicionar(cliente, item());
    expect((await finalizar(cliente, visto(atual))).status).toBe(200);
    // Nenhuma confirmação; outro cliente tentando confirmar a cobrança não muda nada.
    expect((await carrinho(cliente)).body.items).toHaveLength(1);
  });

  it("a confirmação de outra conta não tira itens do carrinho do dono", async () => {
    const dono = await criarUsuario();
    const outro = await criarUsuario();
    const atual = await adicionar(dono, item());
    const { body } = await finalizar(dono, visto(atual));

    esperarProblema(await confirmarSimulado(outro, body.billingId), 404, "not-found");
    expect((await carrinho(dono)).body.items).toHaveLength(1);
  });

  it.each<[string, (atual: Array<{ publicId: string; quantity: number }>) => Array<{ publicId: string; quantity: number }>]>([
    // Mantém os dois itens e muda só a quantidade: o 409 tem de vir da quantidade.
    ["com outra quantidade", atual => [{ ...atual[0], quantity: atual[0].quantity + 1 }, atual[1]]],
    ["sem um item que está no carrinho", atual => atual.slice(0, 1)],
    ["com um item que não está no carrinho", atual => [...atual, { publicId: UUID_INEXISTENTE, quantity: 1 }]],
    ["com o mesmo item repetido", atual => [atual[0], atual[0], atual[1]]],
  ])("carrinho visto %s (outra aba mudou): 409 sem criar pedido", async (_caso, mudar) => {
    const cliente = await criarUsuario();
    await adicionar(cliente, item());
    const atual = visto(await adicionar(cliente, item({ color: "#000000" })));

    const res = await finalizar(cliente, mudar(atual));
    esperarProblema(res, 409, "conflict");
    expect(res.body.detail).toMatch(/Seu carrinho mudou/);
    expect(await prisma.pedido.count({ where: { usuarioId: cliente.id } })).toBe(0);
  });

  it("carrinho vazio no corpo é 400", async () => {
    const cliente = await criarUsuario();
    esperarProblema(await finalizar(cliente, []), 400, "bad-request");
  });

  it("linha que não passa mais nas regras (gravada antes delas) é recusada no checkout com 409", async () => {
    const cliente = await criarUsuario();
    const atual = await adicionar(cliente, item());
    await prisma.carrinhoItem.updateMany({
      where: { usuarioId: cliente.id },
      data: { customSpecs: especificacaoDoStudio({ frameMaterial: "ouro-maciço" }) },
    });

    const lido = await carrinho(cliente);
    // Indisponível e sem preço, fora do subtotal: R$ 0,00 pareceria grátis.
    expect(lido.body.items[0]).toMatchObject({ available: false, unitPrice: null, total: null });
    expect(lido.body.subtotal).toBe("0.00");
    esperarProblema(await finalizar(cliente, visto(atual)), 409, "conflict");
    expect(await prisma.pedido.count({ where: { usuarioId: cliente.id } })).toBe(0);
  });
});
