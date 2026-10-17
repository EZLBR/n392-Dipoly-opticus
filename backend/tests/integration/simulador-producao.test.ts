// ============================================================
//   SEC-06 — Simulador de pagamento fora de produção
//
//   O registro das rotas é decidido quando o módulo é carregado, a
//   partir do NODE_ENV. Para testar a produção sem alterar o processo
//   inteiro, o teste troca o NODE_ENV, limpa o cache de módulos e
//   importa uma instância nova da aplicação. Os helpers e o banco
//   continuam os da suíte, carregados antes da troca.
// ============================================================

import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { app as appDeTeste } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../helpers/payments.js";
import { esperarProblema } from "../helpers/problem.js";

async function criarAppEmProducao(): Promise<Express> {
  vi.stubEnv("NODE_ENV", "production");
  vi.resetModules();
  try {
    const { createApp } = await import("../../src/app.js");
    return createApp({ requestLogging: false });
  } finally {
    vi.unstubAllEnvs();
  }
}

async function cobrancaPendente() {
  const cliente = await criarUsuario("client");
  const pedido = await criarPedido({ dono: cliente, status: "Pending_Payment" });
  return { cliente, cobranca: await criarCobranca(pedido) };
}

describe("simulador de pagamento (SEC-06)", () => {
  describe("em produção, as rotas não existem", () => {
    it("GET /api/payments/simulated-checkout responde o mesmo 404 de uma rota inexistente", async () => {
      const app = await criarAppEmProducao();
      const { cobranca } = await cobrancaPendente();

      const res = await request(app)
        .get("/api/payments/simulated-checkout")
        .query({ billingId: cobranca.billingId });
      const inexistente = await request(app).get("/api/payments/rota-que-nao-existe");

      esperarProblema(res, 404, "not-found");
      // O detail cita o caminho pedido; o resto do problema é idêntico.
      const tipo = (body: Record<string, unknown>) => [body.type, body.title, body.status];
      expect(tipo(res.body)).toEqual(tipo(inexistente.body));
      expect(res.body.detail).toMatch(/^Rota não encontrada/);
    });

    it("POST /api/payments/confirm-simulated-payment responde 404 e não confirma a cobrança", async () => {
      const app = await criarAppEmProducao();
      const { cobranca } = await cobrancaPendente();

      const res = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .type("form")
        .send({ billingId: cobranca.billingId });

      esperarProblema(res, 404, "not-found");
      expect(await lerCobranca(cobranca)).toEqual({ pedido: "Pending_Payment", pagamento: "pendente" });
    });

    it("as demais rotas de pagamento continuam registradas", async () => {
      const app = await criarAppEmProducao();

      esperarProblema(await request(app).post("/api/payments/create-billing").send({ orderId: 1 }), 401, "unauthorized");
      esperarProblema(await request(app).get("/api/payments"), 401, "unauthorized");
    });
  });

  // Prova que o 404 acima vem do modo produção: a mesma requisição,
  // na aplicação de teste, chega ao simulador e confirma a cobrança.
  describe("fora de produção, o simulador continua disponível", () => {
    it("GET /api/payments/simulated-checkout exibe a página ao dono da cobrança", async () => {
      const { cliente, cobranca } = await cobrancaPendente();

      const res = await request(appDeTeste)
        .get("/api/payments/simulated-checkout")
        .set(...comToken(cliente.token))
        .query({ billingId: cobranca.billingId });

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
    });

    it("POST /api/payments/confirm-simulated-payment confirma a cobrança", async () => {
      const { cobranca } = await cobrancaPendente();

      const res = await request(appDeTeste)
        .post("/api/payments/confirm-simulated-payment")
        .type("form")
        .send({ billingId: cobranca.billingId });

      expect(res.status).toBe(302);
      expect(await lerCobranca(cobranca)).toEqual({ pedido: "Queued", pagamento: "aprovado" });
    });
  });
});
