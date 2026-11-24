// ============================================================
//   CONC-02 — Trava otimista na atualização de pedidos
//
//   O cliente envia a versão que leu. Se outra pessoa alterou o
//   pedido depois disso, a escrita não acontece: 409, e o cliente
//   recarrega. Toda escrita em pedidos avança a versão, inclusive
//   as que não passam pela rota de status (cobrança e pagamento).
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido, lerPedido } from "../helpers/orders.js";
import { esperarProblema, semanticaDoProblema } from "../helpers/problem.js";

const rota = (publicId: string) => `/api/orders/${publicId}/status`;

async function cenario(status: "Pending_Payment" | "Queued" = "Queued") {
  const cliente = await criarUsuario("client");
  const fabrica = await criarUsuario("factory");
  const staff = await criarUsuario("staff");
  const pedido = await criarPedido({ dono: cliente, fabrica, status });
  return { cliente, fabrica, staff, pedido };
}

function mover(token: string, publicId: string, corpo: Record<string, unknown>) {
  return request(app).put(rota(publicId)).set(...comToken(token)).send(corpo);
}

describe("PUT /api/orders/:publicId/status — trava otimista (CONC-02)", () => {
  it("devolve a versão nova, e quem ainda tem a versão antiga recebe 409 sem mudar nada", async () => {
    const { fabrica, staff, pedido } = await cenario();

    const primeiro = await mover(fabrica.token, pedido.publicId, { status: "In production", version: pedido.version });
    expect(primeiro.status).toBe(200);
    expect(primeiro.body.order.version).toBe(pedido.version + 1);

    // O staff decidiu cancelar olhando o pedido ainda em Queued.
    const atrasado = await mover(staff.token, pedido.publicId, { status: "Cancelled", version: pedido.version });
    esperarProblema(atrasado, 409, "conflict");
    expect(atrasado.body.detail).toContain("alterado por outra pessoa");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "In_production", version: pedido.version + 1 });

    // Depois de recarregar, a mesma decisão passa com a versão atual.
    const recarregado = await mover(staff.token, pedido.publicId, { status: "Cancelled", version: pedido.version + 1 });
    expect(recarregado.status).toBe(200);
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Cancelled", version: pedido.version + 2 });
  });

  it("dois operadores com a mesma versão, ao mesmo tempo: só um grava", async () => {
    const { fabrica, staff, pedido } = await cenario();

    const [daFabrica, doStaff] = await Promise.all([
      mover(fabrica.token, pedido.publicId, { status: "In production", version: pedido.version }),
      mover(staff.token, pedido.publicId, { status: "Cancelled", version: pedido.version }),
    ]);

    const statuses = [daFabrica.status, doStaff.status].sort();
    expect(statuses).toEqual([200, 409]);
    const vencedor = daFabrica.status === 200 ? "In_production" : "Cancelled";
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: vencedor, version: pedido.version + 1 });
  });

  it("versão adiantada também é recusada", async () => {
    const { fabrica, pedido } = await cenario();

    const res = await mover(fabrica.token, pedido.publicId, { status: "In production", version: pedido.version + 5 });

    esperarProblema(res, 409, "conflict");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Queued", version: pedido.version });
  });

  it("versão errada em pedido de outra fábrica é o mesmo 404 do pedido inexistente", async () => {
    const { pedido } = await cenario();
    const outraFabrica = await criarUsuario("factory");

    const alheio = await mover(outraFabrica.token, pedido.publicId, { status: "In production", version: pedido.version + 1 });
    const inexistente = await mover(outraFabrica.token, "00000000-0000-4000-8000-000000000000", { status: "In production", version: 1 });

    esperarProblema(alheio, 404, "not-found");
    expect(semanticaDoProblema(alheio.body)).toEqual(semanticaDoProblema(inexistente.body));
  });

  it.each([
    [{ status: "In production" }, "sem versão"],
    [{ status: "In production", version: "0" }, "versão em texto"],
    [{ status: "In production", version: 1.5 }, "versão fracionária"],
    [{ status: "In production", version: -1 }, "versão negativa"],
    [{ status: "In production", version: 2_147_483_648 }, "versão acima do INTEGER"],
  ] as Array<[Record<string, unknown>, string]>)("%j (%s) responde 400 apontando o campo", async (corpo) => {
    const { fabrica, pedido } = await cenario();

    const res = await mover(fabrica.token, pedido.publicId, corpo);

    esperarProblema(res, 400, "bad-request");
    expect(res.body.invalidParams).toEqual([expect.objectContaining({ name: "version" })]);
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Queued", version: pedido.version });
  });

  it("a listagem entrega a versão que o painel precisa enviar", async () => {
    const { fabrica, pedido } = await cenario();

    const res = await request(app).get("/api/orders").set(...comToken(fabrica.token));

    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([expect.objectContaining({ publicId: pedido.publicId, version: pedido.version })]);
  });
});

describe("toda escrita em pedidos avança a versão (CONC-02)", () => {
  it("gerar a cobrança e confirmar o pagamento também mudam a versão", async () => {
    const { cliente, fabrica, pedido } = await cenario("Pending_Payment");

    const cobranca = await request(app).post("/api/payments/create-billing")
      .set(...comToken(cliente.token)).send({ orderPublicId: pedido.publicId });
    expect(cobranca.status).toBe(200);
    expect((await lerPedido(pedido.publicId))?.version).toBe(pedido.version + 1);

    const billingId = new URL(cobranca.body.checkoutUrl).searchParams.get("billingId");
    const confirmacao = await request(app).post("/api/payments/confirm-simulated-payment")
      .set(...comToken(cliente.token)).send({ billingId });
    expect(confirmacao.status).toBe(200);
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Queued", version: pedido.version + 2 });

    // A fábrica que leu o pedido antes do pagamento não decide sobre ele.
    const atrasada = await mover(fabrica.token, pedido.publicId, { status: "In production", version: pedido.version });
    esperarProblema(atrasada, 409, "conflict");
  });
});
