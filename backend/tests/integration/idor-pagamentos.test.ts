// ============================================================
//   TEST-02 — Regressão IDOR/BOLA: pagamentos
//
//   Dono do recurso: o cliente dono do pedido cobrado.
//
//   Este é o arquivo com mais vulnerabilidades ainda abertas. Elas
//   estão registradas com `vulnerabilidadeConhecida` (ver
//   tests/helpers/vulneravel.ts): o comportamento seguro já está
//   escrito, e o teste acusa quando a correção entrar.
//
//   Os testes de caminho feliz do dono enviam o token mesmo onde a
//   rota ainda é pública — assim continuam valendo depois que o
//   SEC-01 passar a exigir autenticação.
// ============================================================

import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido, lerPedido } from "../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../helpers/payments.js";
import { esperarProblema, semanticaDoProblema } from "../helpers/problem.js";
import { vulnerabilidadeConhecida } from "../helpers/vulneravel.js";

const PENDENTE = { pedido: "Pending_Payment", pagamento: "pendente" };
const PAGO = { pedido: "Queued", pagamento: "aprovado" };

async function cenarioDeCobranca() {
  const fabrica = await criarUsuario("factory");
  const dono = await criarUsuario("client");
  const pedido = await criarPedido({ dono, fabrica, status: "Pending_Payment" });
  const cobranca = await criarCobranca(pedido);
  return { dono, fabrica, pedido, cobranca };
}

describe("pagamentos — autorização de objeto (TEST-02)", () => {
  describe("POST /api/payments/create-billing", () => {
    it("usuário anônimo recebe 401", async () => {
      const cliente = await criarUsuario("client");
      const pedido = await criarPedido({ dono: cliente });

      const res = await request(app).post("/api/payments/create-billing").send({ orderId: pedido.id });

      esperarProblema(res, 401, "unauthorized");
    });

    it("dono cria a cobrança do próprio pedido", async () => {
      const cliente = await criarUsuario("client");
      const pedido = await criarPedido({ dono: cliente });

      const res = await request(app)
        .post("/api/payments/create-billing")
        .set(...comToken(cliente.token))
        .send({ orderId: pedido.id });

      expect(res.status).toBe(200);
    });

    it("outro usuário não consegue alterar o pedido alheio", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");
      const pedido = await criarPedido({ dono: vitima });
      const antes = await lerPedido(pedido.publicId);

      const res = await request(app)
        .post("/api/payments/create-billing")
        .set(...comToken(atacante.token))
        .send({ orderId: pedido.id });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await lerPedido(pedido.publicId)).toEqual(antes);
    });

    it("[VULNERÁVEL · BOLA-03] pedido alheio e pedido inexistente respondem de forma distinguível", () =>
      vulnerabilidadeConhecida({
        issue: "BOLA-03",
        observar: async () => {
          const vitima = await criarUsuario("client");
          const atacante = await criarUsuario("client");
          const pedido = await criarPedido({ dono: vitima });

          const alheio = await request(app)
            .post("/api/payments/create-billing")
            .set(...comToken(atacante.token))
            .send({ orderId: pedido.id });
          const inexistente = await request(app)
            .post("/api/payments/create-billing")
            .set(...comToken(atacante.token))
            .send({ orderId: 999_999 });

          return { alheio, inexistente };
        },
        seguro: ({ alheio, inexistente }) => {
          esperarProblema(alheio, 404, "not-found");
          expect(semanticaDoProblema(alheio.body)).toEqual(semanticaDoProblema(inexistente.body));
        },
        // Hoje: lê o pedido sem escopo e decide em memória — responde 403
        // "pertence a outro usuário", confirmando que o pedido existe.
        vulneravel: ({ alheio, inexistente }) => {
          esperarProblema(alheio, 403, "forbidden");
          esperarProblema(inexistente, 404, "not-found");
        },
      }));
  });

  describe("POST /api/payments/confirm-simulated-payment", () => {
    it("dono confirma o pagamento do próprio pedido", async () => {
      const { dono, cobranca } = await cenarioDeCobranca();

      const res = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(dono.token))
        .send({ billingId: cobranca.billingId });

      expect(res.status).toBeLessThan(400);
      expect(await lerCobranca(cobranca)).toEqual(PAGO);
    });

    it("[VULNERÁVEL · SEC-01 #2] usuário anônimo confirma pagamento", () =>
      vulnerabilidadeConhecida({
        issue: "SEC-01 #2",
        observar: async () => {
          const { cobranca } = await cenarioDeCobranca();
          const res = await request(app)
            .post("/api/payments/confirm-simulated-payment")
            .send({ billingId: cobranca.billingId });
          return { res, depois: await lerCobranca(cobranca) };
        },
        seguro: ({ res, depois }) => {
          esperarProblema(res, 401, "unauthorized");
          expect(depois).toEqual(PENDENTE);
        },
        // Hoje: a rota é pública, aprova o pagamento e redireciona.
        vulneravel: ({ res, depois }) => {
          expect(res.status).toBe(302);
          expect(depois).toEqual(PAGO);
        },
      }));

    it("[VULNERÁVEL · SEC-01 #2] outro usuário confirma o pagamento de pedido alheio", () =>
      vulnerabilidadeConhecida({
        issue: "SEC-01 #2",
        observar: async () => {
          const { cobranca } = await cenarioDeCobranca();
          const atacante = await criarUsuario("client");
          const res = await request(app)
            .post("/api/payments/confirm-simulated-payment")
            .set(...comToken(atacante.token))
            .send({ billingId: cobranca.billingId });
          return { res, depois: await lerCobranca(cobranca) };
        },
        seguro: ({ res, depois }) => {
          esperarProblema(res, 404, "not-found");
          expect(depois).toEqual(PENDENTE);
        },
        vulneravel: ({ res, depois }) => {
          expect(res.status).toBe(302);
          expect(depois).toEqual(PAGO);
        },
      }));
  });

  describe("GET /api/payments/simulated-checkout", () => {
    it("[VULNERÁVEL · SEC-03 #4] usuário anônimo lê dados pessoais do cliente", () =>
      vulnerabilidadeConhecida({
        issue: "SEC-03 #4",
        observar: async () => {
          const { dono, cobranca } = await cenarioDeCobranca();
          const res = await request(app)
            .get("/api/payments/simulated-checkout")
            .query({ billingId: cobranca.billingId });
          return { res, emailDoDono: dono.email };
        },
        seguro: ({ res, emailDoDono }) => {
          esperarProblema(res, 401, "unauthorized");
          expect(res.text).not.toContain(emailDoDono);
        },
        // Hoje: página pública que exibe nome e e-mail do cliente.
        vulneravel: ({ res, emailDoDono }) => {
          expect(res.status).toBe(200);
          expect(res.text).toContain(emailDoDono);
        },
      }));
  });

  describe("POST /api/payments/webhook", () => {
    const eventoPago = (billingId: string) => ({ event: "billing.paid", data: { id: billingId } });

    it("[VULNERÁVEL · SEC-04 #6] webhook sem assinatura aprova o pagamento", () =>
      vulnerabilidadeConhecida({
        issue: "SEC-04 #6",
        observar: async () => {
          const { cobranca } = await cenarioDeCobranca();
          const res = await request(app)
            .post("/api/payments/webhook")
            .send(eventoPago(cobranca.billingId));
          return { res, depois: await lerCobranca(cobranca) };
        },
        seguro: ({ res, depois }) => {
          esperarProblema(res, 401, "unauthorized");
          expect(depois).toEqual(PENDENTE);
        },
        // Hoje: a assinatura só é verificada se ABACATE_TOKEN estiver
        // configurado. Na configuração padrão, qualquer payload é aceito.
        vulneravel: ({ res, depois }) => {
          expect(res.status).toBe(200);
          expect(depois).toEqual(PAGO);
        },
      }));

    it("[VULNERÁVEL · SEC-04 #6] webhook com assinatura inválida aprova o pagamento", () =>
      vulnerabilidadeConhecida({
        issue: "SEC-04 #6",
        observar: async () => {
          const { cobranca } = await cenarioDeCobranca();
          const corpo = eventoPago(cobranca.billingId);
          const assinaturaForjada = createHmac("sha256", "segredo-do-atacante")
            .update(JSON.stringify(corpo))
            .digest("hex");
          const res = await request(app)
            .post("/api/payments/webhook")
            .set("x-abacatepay-signature", assinaturaForjada)
            .send(corpo);
          return { res, depois: await lerCobranca(cobranca) };
        },
        seguro: ({ res, depois }) => {
          esperarProblema(res, 401, "unauthorized");
          expect(depois).toEqual(PENDENTE);
        },
        vulneravel: ({ res, depois }) => {
          expect(res.status).toBe(200);
          expect(depois).toEqual(PAGO);
        },
      }));
  });
});
