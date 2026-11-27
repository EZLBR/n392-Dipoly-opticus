// ============================================================
//   FEAT-04 (#48) — migração dos pedidos antigos para pedido_itens
//   (ADR-0004, padrão §7)
//
//   Roda o SQL das próprias migrations contra pedidos gravados como
//   antes da FEAT-04 (sem item), e confere a conversão, a idempotência
//   e a lista de conciliação. Banco real; nada é simulado.
// ============================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import prisma from "../../src/config/prisma.js";
import { pedidosAConciliar } from "../../src/scripts/conciliar-pedido-itens.js";
import { inserirPedido } from "../../src/services/orderService.js";
import { cartItemSchema } from "../../src/dtos/order/order.dto.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { especificacaoDoStudio } from "../helpers/especificacao.js";

/** A especificação como o service a recebe: já validada pelo schema da rota. */
const validada = (especificacao: Record<string, unknown>) => cartItemSchema.shape.customSpecs.parse(especificacao);

const migration = (nome: string) =>
  readFileSync(fileURLToPath(new URL(`../../prisma/migrations/${nome}/migration.sql`, import.meta.url)), "utf8");

const CONVERSAO = migration("20261126121000_itens_dos_pedidos_antigos");

/**
 * Roda um script com BEGIN/COMMIT numa conexão própria. Se falhar, a
 * transação abortada é desfeita antes de a conexão voltar ao pool.
 */
async function rodarScript(sql: string) {
  const conexao = await pool.connect();
  try {
    await conexao.query(sql);
  } catch (erro) {
    await conexao.query("ROLLBACK");
    throw erro;
  } finally {
    conexao.release();
  }
}

/** Um pedido como era gravado antes da FEAT-04: sem item. */
async function pedidoAntigo(dono: UsuarioDeTeste, total: string, customSpecs: string | null, nome = "Antigo") {
  const { rows: [pedido] } = await pool.query<{ id: number; publicId: string }>(
    `INSERT INTO pedidos (usuario_id, customer_name, customer_email, product_name, total, custom_specs)
     VALUES ($1, 'Cliente', 'cliente@exemplo.invalid', $2, $3, $4) RETURNING id, "publicId"`,
    [dono.id, nome, total, customSpecs],
  );
  return pedido;
}

const itemDe = (pedidoId: number) => prisma.pedidoItem.findMany({
  where: { pedidoId },
  select: { productName: true, customSpecs: true, quantidade: true, precoUnitario: true },
}).then(itens => itens.map(i => ({ ...i, precoUnitario: i.precoUnitario.toFixed(2) })));

describe("FEAT-04 — conversão dos pedidos antigos", () => {
  it("quantidade que divide o total em centavos exatos vira a quantidade do item", async () => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "420.00", '{"model":"round","quantity":2}', "Redondo");

    await rodarScript(CONVERSAO);

    expect(await itemDe(pedido.id)).toEqual([
      { productName: "Redondo", customSpecs: { model: "round" }, quantidade: 2, precoUnitario: "210.00" },
    ]);
    expect(await pedidosAConciliar(prisma)).toEqual([]);
  });

  it.each([
    ["total que não divide", "100.00", '{"quantity":3}'],
    ["quantidade fracionária", "100.00", '{"quantity":2.5}'],
    ["quantidade em texto", "100.00", '{"quantity":"2"}'],
    ["quantidade zero", "100.00", '{"quantity":0}'],
    ["quantidade negativa", "100.00", '{"quantity":-2}'],
    ["quantidade nula", "100.00", '{"quantity":null}'],
    ["quantidade fora do inteiro", "100.00", '{"quantity":1e12}'],
  ])("%s: 1 unidade pelo total, e o pedido vai para a conciliação", async (_caso, total, especificacao) => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, total, especificacao);

    await rodarScript(CONVERSAO);

    expect(await itemDe(pedido.id)).toEqual([
      { productName: "Antigo", customSpecs: {}, quantidade: 1, precoUnitario: total },
    ]);
    expect(await pedidosAConciliar(prisma)).toEqual([
      { pedidoPublicId: pedido.publicId, motivos: ["quantidade_nao_aproveitada"] },
    ]);
  });

  it.each([
    ["sem quantity", '{"model":"round"}', { model: "round" }],
    ["especificação nula", null, {}],
    ["quantity 1", '{"model":"round","quantity":1}', { model: "round" }],
  ])("%s: 1 unidade, sem conciliação", async (_caso, especificacao, esperada) => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "50.00", especificacao);

    await rodarScript(CONVERSAO);

    expect(await itemDe(pedido.id)).toEqual([
      { productName: "Antigo", customSpecs: esperada, quantidade: 1, precoUnitario: "50.00" },
    ]);
    expect(await pedidosAConciliar(prisma)).toEqual([]);
  });

  it.each([
    ["JSON inválido", "{model: round"],
    ["lista", "[1,2]"],
    ["texto", '"redondo"'],
  ])("especificação ilegível (%s): item com especificação vazia, e conciliação", async (_caso, especificacao) => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "50.00", especificacao);

    await rodarScript(CONVERSAO);

    expect(await itemDe(pedido.id)).toEqual([
      { productName: "Antigo", customSpecs: {}, quantidade: 1, precoUnitario: "50.00" },
    ]);
    expect(await pedidosAConciliar(prisma)).toEqual([
      { pedidoPublicId: pedido.publicId, motivos: ["especificacao_ilegivel"] },
    ]);
  });

  it("total zero com quantidade: preço unitário zero, sem conciliação", async () => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "0.00", '{"quantity":2}');

    await rodarScript(CONVERSAO);

    expect(await itemDe(pedido.id)).toEqual([
      { productName: "Antigo", customSpecs: {}, quantidade: 2, precoUnitario: "0.00" },
    ]);
  });

  it("a conversão mantém a especificação do Studio inteira, só sem a quantity", async () => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "630.00", JSON.stringify({ ...especificacaoDoStudio(), quantity: 3 }));

    await rodarScript(CONVERSAO);

    expect(await itemDe(pedido.id)).toEqual([
      { productName: "Antigo", customSpecs: especificacaoDoStudio(), quantidade: 3, precoUnitario: "210.00" },
    ]);
  });

  it("é idempotente e não toca em pedido que já tem item", async () => {
    const dono = await criarUsuario("client");
    const novo = await request(app).post("/api/orders").set(...comToken(dono.token))
      .send({ productName: "Novo", factoryName: "Fábrica", customSpecs: especificacaoDoStudio(), quantity: 2 });
    expect(novo.status).toBe(201);
    const antigo = await pedidoAntigo(dono, "420.00", '{"quantity":2}');
    const antes = await prisma.pedidoItem.findMany({ orderBy: { id: "asc" } });

    await rodarScript(CONVERSAO);
    await rodarScript(CONVERSAO);

    const depois = await prisma.pedidoItem.findMany({ orderBy: { id: "asc" } });
    expect(depois).toHaveLength(2);
    expect(depois[0]).toEqual(antes[0]);
    expect(await itemDe(antigo.id)).toHaveLength(1);
    expect(await pedidosAConciliar(prisma)).toEqual([]);
  });

  it("depois da conversão, os pedidos antigos aparecem com o item na API", async () => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "420.00", '{"model":"round","quantity":2}', "Redondo");

    await rodarScript(CONVERSAO);

    const res = await request(app).get(`/api/orders/mine/${pedido.publicId}`).set(...comToken(dono.token));
    expect(res.status).toBe(200);
    expect(res.body.order.items).toEqual([{
      publicId: expect.any(String), productName: "Redondo", customSpecs: { model: "round" },
      quantity: 2, unitPrice: "210.00", total: "420.00",
    }]);
  });

  it("total negativo para a conversão inteira, sem gravar nenhum item", async () => {
    const dono = await criarUsuario("client");
    await pedidoAntigo(dono, "50.00", '{"quantity":1}');
    const negativo = await pedidoAntigo(dono, "-10.00", null);

    await expect(rodarScript(CONVERSAO)).rejects.toThrow(new RegExp(`total negativo.*${negativo.id}`));
    expect(await prisma.pedidoItem.count()).toBe(0);
  });
});

describe("FEAT-04 — lista de conciliação", () => {
  it("pedido sem item, gravado depois da migration pela versão anterior, é listado", async () => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "50.00", null);

    expect(await pedidosAConciliar(prisma)).toEqual([{ pedidoPublicId: pedido.publicId, motivos: ["sem_itens"] }]);
  });

  it("soma dos itens diferente do total é listada", async () => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "420.00", '{"quantity":2}');
    await rodarScript(CONVERSAO);
    await pool.query("UPDATE pedido_itens SET preco_unitario = 200 WHERE pedido_id = $1", [pedido.id]);

    expect(await pedidosAConciliar(prisma)).toEqual([
      { pedidoPublicId: pedido.publicId, motivos: ["soma_diferente_do_total"] },
    ]);
  });

  it("pedido novo, de um ou de vários itens, não é listado", async () => {
    const dono = await criarUsuario("client");
    const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(dono.token)).send({
      cartItems: [
        { productName: "A", factoryName: "F", customSpecs: especificacaoDoStudio(), quantity: 3 },
        { productName: "B", factoryName: "F", customSpecs: especificacaoDoStudio({ quantity: 7 }), quantity: 1 },
      ],
    });
    expect(res.status).toBe(200);
    await prisma.$transaction(tx => inserirPedido(tx,
      { publicId: dono.publicId, name: dono.nome, email: dono.email },
      {
        factoryName: "F",
        itens: [
          { productName: "C", customSpecs: validada(especificacaoDoStudio()), quantity: 2 },
          { productName: "D", customSpecs: validada(especificacaoDoStudio()), quantity: 1 },
        ],
      }, null));

    // O checkout junta os dois itens sem fábrica num pedido (FEAT-04, parte 2).
    expect(await prisma.pedido.count()).toBe(2);
    expect(await pedidosAConciliar(prisma)).toEqual([]);
  });
});

describe("FEAT-04 — a remodelagem só roda com pedido_itens vazia", () => {
  const GUARDA = /DO \$\$[\s\S]*?END;\s*\$\$;/.exec(migration("20261126120000_pedido_itens_remodelada"))![0];

  it("com uma linha na tabela, a guarda para a migration", async () => {
    const dono = await criarUsuario("client");
    const pedido = await pedidoAntigo(dono, "50.00", null);
    await rodarScript(CONVERSAO);
    expect(await prisma.pedidoItem.count({ where: { pedidoId: pedido.id } })).toBe(1);

    await expect(pool.query(GUARDA)).rejects.toThrow(/pedido_itens deveria estar vazia/);
  });

  it("com a tabela vazia, a guarda deixa seguir", async () => {
    await expect(pool.query(GUARDA)).resolves.toBeDefined();
  });
});
