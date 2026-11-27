// ============================================================
//   Regressão — CART-01 (#115), revisão do #147
//
//   Corrida e guardas do checkout do carrinho contra o banco real. As
//   corridas usam um lock de verdade: uma conexão trava a linha do
//   carrinho, as requisições param nele (esperarBloqueios) e só então
//   a trava é solta. Cada teste falha sem a guarda que ele protege.
// ============================================================

import { expect, it } from "vitest";
import request from "supertest";
import { app } from "../../setup/app.js";
import { pool } from "../../setup/db.js";
import prisma from "../../../src/config/prisma.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../../helpers/auth.js";
import { esperarBloqueios } from "../../helpers/bloqueio.js";
import { especificacaoDoStudio } from "../../helpers/especificacao.js";
import { esperarProblema } from "../../helpers/problem.js";

type Visto = { items: Array<{ publicId: string; quantity: number }> };

async function adicionar(cliente: UsuarioDeTeste, quantity = 1, alteracoes: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/cart/items").set(...comToken(cliente.token)).send({
    productName: "Wayfarer", factoryName: "Demo Factory", quantity, customSpecs: especificacaoDoStudio(alteracoes),
  });
  expect([200, 201]).toContain(res.status);
  const visto: Visto = {
    items: res.body.items.map((i: { publicId: string; quantity: number }) => ({ publicId: i.publicId, quantity: i.quantity })),
  };
  return visto;
}

const finalizar = (cliente: UsuarioDeTeste, visto: Visto) =>
  request(app).post("/api/cart/checkout").set(...comToken(cliente.token)).send(visto);
const confirmar = (cliente: UsuarioDeTeste, billingId: string) =>
  request(app).post("/api/payments/confirm-simulated-payment").set(...comToken(cliente.token)).send({ billingId });
const carrinho = async (cliente: UsuarioDeTeste) =>
  (await request(app).get("/api/cart").set(...comToken(cliente.token))).body as { items: Array<{ quantity: number }> };

/**
 * Trava a linha do carrinho numa conexão própria, roda `durante` com ela
 * travada (podendo alterá-la), dispara as requisições, espera todas pararem
 * no lock e só então faz o commit.
 */
async function comLinhaTravada(
  linhaId: number,
  requisicoes: Array<() => PromiseLike<request.Response>>,
  durante?: (conexao: import("pg").PoolClient) => Promise<void>,
): Promise<request.Response[]> {
  const conexao = await pool.connect();
  try {
    await conexao.query("BEGIN");
    await conexao.query("SELECT id FROM carrinho_itens WHERE id = $1 FOR UPDATE", [linhaId]);
    await durante?.(conexao);
    const pendentes = requisicoes.map(r => Promise.resolve(r()));
    await esperarBloqueios(requisicoes.length);
    await conexao.query("COMMIT");
    return await Promise.all(pendentes);
  } catch (erro) {
    await conexao.query("ROLLBACK");
    throw erro;
  } finally {
    conexao.release();
  }
}

const linhaDe = (cliente: UsuarioDeTeste) =>
  prisma.carrinhoItem.findFirstOrThrow({ where: { usuarioId: cliente.id }, select: { id: true } });

it("dois checkouts simultâneos do mesmo carrinho criam uma cobrança só (o outro é 409)", async () => {
  const cliente = await criarUsuario("client");
  const visto = await adicionar(cliente);
  const { id } = await linhaDe(cliente);

  const respostas = await comLinhaTravada(id, [() => finalizar(cliente, visto), () => finalizar(cliente, visto)]);

  expect(respostas.map(r => r.status).sort()).toEqual([200, 409]);
  esperarProblema(respostas.find(r => r.status === 409)!, 409, "conflict");
  expect(await prisma.pedido.count({ where: { usuarioId: cliente.id } })).toBe(1);
});

it("linha alterada entre a leitura e o vínculo: 409 e nenhum pedido com a quantidade antiga", async () => {
  const cliente = await criarUsuario("client");
  const visto = await adicionar(cliente);
  const { id } = await linhaDe(cliente);

  // Outra aba muda a quantidade enquanto o checkout, que já leu o carrinho, espera o lock.
  const [res] = await comLinhaTravada(id, [() => finalizar(cliente, visto)], async conexao => {
    await conexao.query("UPDATE carrinho_itens SET quantidade = 2, versao = versao + 1 WHERE id = $1", [id]);
  });

  esperarProblema(res, 409, "conflict");
  expect(await prisma.pedido.count({ where: { usuarioId: cliente.id } })).toBe(0);
  expect(await prisma.carrinhoItem.findUniqueOrThrow({ where: { id }, select: { quantidade: true, pedidoId: true } }))
    .toEqual({ quantidade: 2, pedidoId: null });
});

it("o pagamento confirmado tira só as linhas daquele pagamento: a linha vinculada de outra conta continua", async () => {
  const a = await criarUsuario("client");
  const b = await criarUsuario("client");
  const deA = await finalizar(a, await adicionar(a));
  const deB = await finalizar(b, await adicionar(b));
  expect([deA.status, deB.status]).toEqual([200, 200]);

  expect((await confirmar(a, deA.body.billingId)).status).toBe(200);

  expect((await carrinho(a)).items).toEqual([]);
  // A linha de B continua vinculada ao checkout dela, ainda pendente.
  expect(await prisma.carrinhoItem.count({ where: { usuarioId: b.id, pedidoId: { not: null } } })).toBe(1);
  expect((await carrinho(b)).items).toHaveLength(1);
});

it("somar a mesma configuração depois do checkout desvincula a linha: a unidade nova fica após o pagamento", async () => {
  const cliente = await criarUsuario("client");
  const { body } = await finalizar(cliente, await adicionar(cliente));

  // Mais uma unidade da mesma configuração: a linha passa a ter 2, e o pedido cobrou 1.
  await adicionar(cliente);
  expect((await confirmar(cliente, body.billingId)).status).toBe(200);

  expect((await carrinho(cliente)).items).toEqual([expect.objectContaining({ quantity: 2, paymentPending: false })]);
});
