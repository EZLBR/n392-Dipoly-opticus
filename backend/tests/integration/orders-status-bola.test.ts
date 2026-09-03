// ============================================================
//   BOLA-01 — autorização de objeto em PUT /api/orders/:publicId/status
//
//   Matriz obrigatória do AGENTS.md §10: proprietário, outro usuário
//   autenticado, anônimo, papel incorreto, papel privilegiado
//   permitido, e a comprovação de que a tentativa negada não alterou
//   o banco.
//
//   Estes testes falam com a API, não com a implementação. Continuam
//   valendo quando o restante do controller migrar para o Prisma.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido, lerPedido } from "../helpers/orders.js";

const rota = (publicId: string) => `/api/orders/${publicId}/status`;

describe("PUT /api/orders/:publicId/status — autorização de objeto", () => {
  it("fábrica dona atualiza o próprio pedido", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica });

    const res = await request(app)
      .put(rota(pedido.publicId))
      .set(...comToken(fabrica.token))
      .send({ status: "In production" });

    expect(res.status).toBe(200);

    const depois = await lerPedido(pedido.publicId);
    expect(depois?.status).toBe("In_production");
    expect(depois?.version).toBe(pedido.version + 1);
  });

  it("outra fábrica recebe 404 e o pedido permanece inalterado", async () => {
    const cliente = await criarUsuario("client");
    const fabricaA = await criarUsuario("factory");
    const fabricaB = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica: fabricaA });

    const antes = await lerPedido(pedido.publicId);

    const res = await request(app)
      .put(rota(pedido.publicId))
      .set(...comToken(fabricaB.token))
      .send({ status: "Delivered" });

    expect(res.status).toBe(404);

    // Sem esta verificação, o teste passaria mesmo com a janela TOCTOU.
    const depois = await lerPedido(pedido.publicId);
    expect(depois).toEqual(antes);
  });

  it("pedido inexistente e pedido alheio produzem respostas idênticas", async () => {
    const cliente = await criarUsuario("client");
    const fabricaA = await criarUsuario("factory");
    const fabricaB = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica: fabricaA });

    const alheio = await request(app)
      .put(rota(pedido.publicId))
      .set(...comToken(fabricaB.token))
      .send({ status: "Delivered" });

    const inexistente = await request(app)
      .put(rota("00000000-0000-4000-8000-000000000000"))
      .set(...comToken(fabricaB.token))
      .send({ status: "Delivered" });

    // Qualquer diferença aqui é oráculo de enumeração.
    expect(alheio.status).toBe(inexistente.status);
    expect(alheio.body).toEqual(inexistente.body);
  });

  it("usuário anônimo recebe 401", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica });

    const res = await request(app).put(rota(pedido.publicId)).send({ status: "Delivered" });

    expect(res.status).toBe(401);

    const depois = await lerPedido(pedido.publicId);
    expect(depois?.status).toBe("Queued");
  });

  it("papel sem permissão recebe 403, não 404", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica });

    const res = await request(app)
      .put(rota(pedido.publicId))
      .set(...comToken(cliente.token))
      .send({ status: "Delivered" });

    // 403 é falta de papel. 404 é falta de posse. Não se confundem.
    expect(res.status).toBe(403);

    const depois = await lerPedido(pedido.publicId);
    expect(depois?.status).toBe("Queued");
  });

  it("staff atualiza pedido de qualquer fábrica", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const staff = await criarUsuario("staff");
    const pedido = await criarPedido({ dono: cliente, fabrica });

    const res = await request(app)
      .put(rota(pedido.publicId))
      .set(...comToken(staff.token))
      .send({ status: "Delivered" });

    // A exceção de papel privilegiado precisa de um teste que prova
    // que ela FUNCIONA, não só de testes que provam que os outros são
    // bloqueados. É a linha que mais se esquece.
    expect(res.status).toBe(200);

    const depois = await lerPedido(pedido.publicId);
    expect(depois?.status).toBe("Delivered");
  });

  it("status inválido recebe 400 sem alterar o pedido", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica });

    const res = await request(app)
      .put(rota(pedido.publicId))
      .set(...comToken(fabrica.token))
      .send({ status: "Teleportado" });

    expect(res.status).toBe(400);

    const depois = await lerPedido(pedido.publicId);
    expect(depois?.status).toBe("Queued");
  });

  it("não aceita identificador numérico interno na rota", async () => {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica });

    // O id sequencial é interno ao banco. Usá-lo na rota não pode funcionar.
    const res = await request(app)
      .put(rota(String(pedido.id)))
      .set(...comToken(fabrica.token))
      .send({ status: "Delivered" });

    expect(res.status).toBe(404);

    const depois = await lerPedido(pedido.publicId);
    expect(depois?.status).toBe("Queued");
  });
});
