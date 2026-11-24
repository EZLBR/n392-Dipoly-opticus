// ============================================================
//   Regressão — tentativas de acesso indevido
//
//   O projeto não tem multi-tenant (CLAUDE.md do projeto, §4): o
//   isolamento é entre donos e entre papéis. Aqui ficam as
//   fronteiras que os testes de IDOR existentes não exercitavam:
//   escolher o próprio papel no cadastro e a fábrica do pedido
//   agindo como o cliente que comprou. Tudo contra o banco real.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../setup/app.js";
import prisma from "../../../src/config/prisma.js";
import { criarUsuario, comToken } from "../../helpers/auth.js";
import { criarPedido } from "../../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../../helpers/payments.js";
import { esperarProblema, semanticaDoProblema } from "../../helpers/problem.js";

describe("o cadastro não escolhe o próprio papel", () => {
  it("papel e fábrica enviados no corpo são ignorados: a conta nasce cliente", async () => {
    const email = `escalada-${Date.now()}@exemplo.invalid`;

    const res = await request(app).post("/api/auth/register").send({
      name: "Tentativa", email, password: "SenhaSegura123", role: "staff", factoryName: "Fábrica Falsa",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("client");
    expect(await prisma.usuario.findUnique({ where: { email }, select: { role: true, factoryName: true } }))
      .toEqual({ role: "client", factoryName: null });
    expect((jwt.decode(res.body.token) as jwt.JwtPayload).role).toBe("client");
    esperarProblema(await request(app).get("/api/auth/users").set(...comToken(res.body.token)), 403, "forbidden");
  });
});

describe("a fábrica do pedido não age como o cliente que comprou", () => {
  async function cenario() {
    const cliente = await criarUsuario("client");
    const fabrica = await criarUsuario("factory");
    const pedido = await criarPedido({ dono: cliente, fabrica, status: "Pending_Payment" });
    const cobranca = await criarCobranca(pedido);
    return { cliente, fabrica, cobranca };
  }

  it("não lê a página de pagamento do cliente: o mesmo 404 da cobrança inexistente, sem dados pessoais", async () => {
    const { cliente, fabrica, cobranca } = await cenario();
    const ler = (billingId: string) => request(app).get("/api/payments/simulated-checkout")
      .set(...comToken(fabrica.token)).query({ billingId });

    const alheia = await ler(cobranca.billingId);
    const inexistente = await ler("bill-sim-00000000-0000-4000-8000-000000000000");

    esperarProblema(alheia, 404, "not-found");
    expect(semanticaDoProblema(alheia.body)).toEqual(semanticaDoProblema(inexistente.body));
    expect(JSON.stringify(alheia.body)).not.toContain(cliente.email);
  });

  it.each(["factory", "staff"] as const)("%s não confirma o pagamento do cliente: 404 e nada muda", async (papel) => {
    const { fabrica, cobranca } = await cenario();
    const ator = papel === "factory" ? fabrica : await criarUsuario("staff");

    const res = await request(app).post("/api/payments/confirm-simulated-payment")
      .set(...comToken(ator.token)).send({ billingId: cobranca.billingId });

    esperarProblema(res, 404, "not-found");
    expect(await lerCobranca(cobranca)).toEqual({ pedido: "Pending_Payment", pagamento: "pendente" });
  });
});
