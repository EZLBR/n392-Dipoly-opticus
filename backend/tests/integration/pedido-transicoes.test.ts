// ============================================================
//   FEAT-03 — Máquina de estados do pedido, pela API
//
//   PUT /orders/:publicId/status só aceita as transições da tabela
//   de domain/pedidoStatus.ts, e o create-billing só cobra pedido
//   que aguarda pagamento. Toda recusa confere que o banco não
//   mudou.
// ============================================================

import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido, lerPedido } from "../helpers/orders.js";
import { esperarProblema, semanticaDoProblema } from "../helpers/problem.js";

const rota = (publicId: string) => `/api/orders/${publicId}/status`;

async function cenario(status: "Pending_Payment" | "Queued" | "In_production" | "Delivered" | "Cancelled") {
  const cliente = await criarUsuario("client");
  const fabrica = await criarUsuario("factory");
  const staff = await criarUsuario("staff");
  const pedido = await criarPedido({ dono: cliente, fabrica, status });
  return { cliente, fabrica, staff, pedido };
}

function mover(token: string, publicId: string, status: string) {
  return request(app).put(rota(publicId)).set(...comToken(token)).send({ status });
}

describe("PUT /api/orders/:publicId/status — transições (FEAT-03)", () => {
  it("a fábrica leva o pedido pago de Queued a In production e depois a Delivered", async () => {
    const { fabrica, pedido } = await cenario("Queued");

    expect((await mover(fabrica.token, pedido.publicId, "In production")).status).toBe(200);
    expect((await mover(fabrica.token, pedido.publicId, "Delivered")).status).toBe(200);

    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Delivered", version: pedido.version + 2 });
  });

  it("a fábrica não entrega um pedido que aguarda pagamento: 409 e nada muda", async () => {
    const { fabrica, pedido } = await cenario("Pending_Payment");

    const res = await mover(fabrica.token, pedido.publicId, "Delivered");

    esperarProblema(res, 409, "conflict");
    expect(res.body.detail).toContain("não permitida");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Pending_Payment", version: pedido.version });
  });

  it.each(["factory", "staff"] as const)("%s não confirma pagamento pela rota de status", async (papel) => {
    const { fabrica, staff, pedido } = await cenario("Pending_Payment");
    const ator = papel === "factory" ? fabrica : staff;

    const res = await mover(ator.token, pedido.publicId, "Queued");

    esperarProblema(res, 409, "conflict");
    expect(res.body.detail).toContain("Apenas a confirmação do pagamento");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Pending_Payment", version: pedido.version });
  });

  it.each([
    ["Delivered", "In production"],
    ["Cancelled", "Queued"],
    ["In_production", "Queued"],
    ["Queued", "Pending Payment"],
  ] as const)("staff não move de %s para %s", async (atual, destino) => {
    const { staff, pedido } = await cenario(atual);

    const res = await mover(staff.token, pedido.publicId, destino);

    esperarProblema(res, 409, "conflict");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: atual, version: pedido.version });
  });

  it("repetir o status atual responde 409 sem avançar a versão", async () => {
    const { fabrica, pedido } = await cenario("In_production");

    const res = await mover(fabrica.token, pedido.publicId, "In production");

    esperarProblema(res, 409, "conflict");
    expect(res.body.detail).toContain("já está");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ version: pedido.version });
  });

  it("a fábrica dona do pedido não cancela: 403, porque falta o papel", async () => {
    const { fabrica, pedido } = await cenario("Queued");

    const res = await mover(fabrica.token, pedido.publicId, "Cancelled");

    esperarProblema(res, 403, "forbidden");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Queued", version: pedido.version });
  });

  it.each(["Pending_Payment", "Queued", "In_production"] as const)(
    "staff cancela pedido em %s (exceção do papel privilegiado)",
    async (atual) => {
      const { staff, pedido } = await cenario(atual);

      const res = await mover(staff.token, pedido.publicId, "Cancelled");

      expect(res.status).toBe(200);
      expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Cancelled", version: pedido.version + 1 });
    },
  );

  it("transição inválida em pedido de outra fábrica é o mesmo 404 do pedido inexistente", async () => {
    const { pedido } = await cenario("Pending_Payment");
    const outraFabrica = await criarUsuario("factory");

    const alheio = await mover(outraFabrica.token, pedido.publicId, "Delivered");
    const inexistente = await mover(outraFabrica.token, "00000000-0000-4000-8000-000000000000", "Delivered");

    esperarProblema(alheio, 404, "not-found");
    esperarProblema(inexistente, 404, "not-found");
    expect(semanticaDoProblema(alheio.body)).toEqual(semanticaDoProblema(inexistente.body));
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "Pending_Payment", version: pedido.version });
  });

  // A guarda da transição está no próprio UPDATE. Lida e conferida em
  // JavaScript antes da escrita, as dez passariam e a versão andaria dez.
  it("dez mudanças simultâneas de Queued para In production: só uma passa", async () => {
    const { fabrica, pedido } = await cenario("Queued");

    const respostas = await Promise.all(
      Array.from({ length: 10 }, () => mover(fabrica.token, pedido.publicId, "In production")),
    );

    expect(respostas.filter((r) => r.status === 200)).toHaveLength(1);
    for (const recusada of respostas.filter((r) => r.status !== 200)) esperarProblema(recusada, 409, "conflict");
    expect(await lerPedido(pedido.publicId)).toMatchObject({ status: "In_production", version: pedido.version + 1 });
  });
});

describe("POST /api/payments/create-billing — só pedido que aguarda pagamento (FEAT-03)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const lerCobranca = async (publicId: string) =>
    (await pool.query(`SELECT status, abacate_billing_id FROM pedidos WHERE "publicId" = $1`, [publicId])).rows[0];

  it.each(["Queued", "In_production", "Delivered", "Cancelled"] as const)(
    "pedido em %s não volta para Pending Payment nem ganha cobrança simulada",
    async (status) => {
      const { cliente, pedido } = await cenario(status);
      const antes = await lerCobranca(pedido.publicId);

      const res = await request(app).post("/api/payments/create-billing")
        .set(...comToken(cliente.token)).send({ orderPublicId: pedido.publicId });

      esperarProblema(res, 409, "conflict");
      expect(await lerCobranca(pedido.publicId)).toEqual(antes);
    },
  );

  it("com gateway real, o pedido pago é recusado antes de qualquer chamada ao gateway", async () => {
    vi.stubEnv("ABACATE_TOKEN", "token-de-teste");
    const gateway = vi.spyOn(globalThis, "fetch");
    const { cliente, pedido } = await cenario("Queued");

    const res = await request(app).post("/api/payments/create-billing")
      .set(...comToken(cliente.token)).send({ orderPublicId: pedido.publicId });

    esperarProblema(res, 409, "conflict");
    expect(gateway).not.toHaveBeenCalled();
    expect(await lerCobranca(pedido.publicId)).toEqual({ status: "Queued", abacate_billing_id: null });
  });

  it("pedido que aguarda pagamento continua gerando a cobrança simulada", async () => {
    const { cliente, pedido } = await cenario("Pending_Payment");

    const res = await request(app).post("/api/payments/create-billing")
      .set(...comToken(cliente.token)).send({ orderPublicId: pedido.publicId });

    expect(res.status).toBe(200);
    expect(res.body.isSimulated).toBe(true);
    expect((await lerCobranca(pedido.publicId)).status).toBe("Pending Payment");
  });
});
