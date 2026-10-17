// ============================================================
//   TEST-02 — Regressão IDOR/BOLA: pagamentos
//
//   Dono do recurso: o cliente dono do pedido cobrado.
//
//   Este arquivo concentra as regressões IDOR/BOLA de pagamentos.
//   A falha ainda aberta (BOLA-03 em create-billing) está registrada
//   com `vulnerabilidadeConhecida` (ver tests/helpers/vulneravel.ts):
//   o comportamento seguro já está escrito, e o teste acusa quando a
//   correção entrar.
//
//   SEC-01 #2 (confirmação anônima/de terceiros do pagamento simulado)
//   e SEC-04 #6 (webhook sem assinatura) já foram corrigidas: os casos
//   abaixo agora são testes normais, e não mais `vulnerabilidadeConhecida`.
//
//   Os testes de caminho feliz do dono enviam o token mesmo onde a
//   rota ainda é pública — assim continuam valendo depois que o
//   SEC-01 passar a exigir autenticação.
// ============================================================

import { createHmac } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
    it("usuário anônimo recebe 401 e o pedido continua pendente", async () => {
      const { cobranca } = await cenarioDeCobranca();

      const res = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .send({ billingId: cobranca.billingId });

      esperarProblema(res, 401, "unauthorized");
      expect(await lerCobranca(cobranca)).toEqual(PENDENTE);
    });

    it("dono confirma o pagamento do próprio pedido", async () => {
      const { dono, cobranca } = await cenarioDeCobranca();

      const res = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(dono.token))
        .send({ billingId: cobranca.billingId });

      expect(res.status).toBe(200);
      expect(await lerCobranca(cobranca)).toEqual(PAGO);
    });

    it("não-dono recebe 404 e nada muda no banco", async () => {
      const { cobranca } = await cenarioDeCobranca();
      const atacante = await criarUsuario("client");

      const res = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(atacante.token))
        .send({ billingId: cobranca.billingId });

      esperarProblema(res, 404, "not-found");
      expect(await lerCobranca(cobranca)).toEqual(PENDENTE);
    });

    it("billingId inexistente responde 404 com o mesmo corpo do não-dono", async () => {
      const { cobranca } = await cenarioDeCobranca();
      const atacante = await criarUsuario("client");

      const alheio = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(atacante.token))
        .send({ billingId: cobranca.billingId });
      const inexistente = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(atacante.token))
        .send({ billingId: "bill-inexistente-000" });

      esperarProblema(alheio, 404, "not-found");
      esperarProblema(inexistente, 404, "not-found");
      expect(semanticaDoProblema(alheio.body)).toEqual(semanticaDoProblema(inexistente.body));
    });

    it("confirmação repetida pelo dono responde 404 e não duplica efeito", async () => {
      const { dono, cobranca } = await cenarioDeCobranca();

      const primeira = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(dono.token))
        .send({ billingId: cobranca.billingId });
      expect(primeira.status).toBe(200);
      expect(await lerCobranca(cobranca)).toEqual(PAGO);

      const segunda = await request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(dono.token))
        .send({ billingId: cobranca.billingId });

      // Já saiu de "Pending Payment": mesma resposta 404 do não-dono, sem novo efeito.
      esperarProblema(segunda, 404, "not-found");
      expect(await lerCobranca(cobranca)).toEqual(PAGO);
    });
  });

  describe("GET /api/payments/simulated-checkout", () => {
    it("SEC-03 #4 — usuário anônimo não lê dados pessoais do cliente", async () => {
      const { dono, cobranca } = await cenarioDeCobranca();
      const res = await request(app)
        .get("/api/payments/simulated-checkout")
        .query({ billingId: cobranca.billingId });
      esperarProblema(res, 401, "unauthorized");
      expect(res.text).not.toContain(dono.email);
    });
  });

  describe("POST /api/payments/webhook", () => {
    const TOKEN_WEBHOOK = "token-de-teste-webhook";
    const eventoPago = (billingId: string) => ({ event: "billing.paid", data: { id: billingId } });

    const assinar = (corpo: string, token = TOKEN_WEBHOOK) =>
      createHmac("sha256", token).update(corpo).digest("hex");

    /** Envia o corpo exato (string) — o HMAC é sobre os bytes crus. */
    function enviarWebhook(corpo: string, assinatura?: string) {
      const req = request(app)
        .post("/api/payments/webhook")
        .set("Content-Type", "application/json");
      if (assinatura !== undefined) {
        req.set("x-abacatepay-signature", assinatura);
      }
      return req.send(corpo);
    }

    beforeEach(() => {
      vi.stubEnv("ABACATE_TOKEN", TOKEN_WEBHOOK);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("SEC-04 #6 — sem assinatura responde 401 e não aprova o pagamento", async () => {
      const { cobranca } = await cenarioDeCobranca();
      const corpo = JSON.stringify(eventoPago(cobranca.billingId));

      const res = await enviarWebhook(corpo);

      esperarProblema(res, 401, "unauthorized");
      expect(await lerCobranca(cobranca)).toEqual(PENDENTE);
    });

    it("SEC-04 #6 — assinatura inválida responde 401 e não aprova o pagamento", async () => {
      const { cobranca } = await cenarioDeCobranca();
      const corpo = JSON.stringify(eventoPago(cobranca.billingId));
      const assinaturaForjada = createHmac("sha256", "segredo-do-atacante")
        .update(corpo)
        .digest("hex");

      const res = await enviarWebhook(corpo, assinaturaForjada);

      esperarProblema(res, 401, "unauthorized");
      expect(await lerCobranca(cobranca)).toEqual(PENDENTE);
    });

    it("SEC-04 #6 — assinatura de outro corpo é rejeitada", async () => {
      const { cobranca } = await cenarioDeCobranca();
      const corpo = JSON.stringify(eventoPago(cobranca.billingId));
      const assinaturaDeOutroCorpo = assinar(JSON.stringify(eventoPago("bill-outro")));

      const res = await enviarWebhook(corpo, assinaturaDeOutroCorpo);

      esperarProblema(res, 401, "unauthorized");
      expect(await lerCobranca(cobranca)).toEqual(PENDENTE);
    });

    it("SEC-04 #6 — assinatura ausente e inválida respondem de forma indistinguível", async () => {
      const { cobranca } = await cenarioDeCobranca();
      const corpo = JSON.stringify(eventoPago(cobranca.billingId));

      const semAssinatura = await enviarWebhook(corpo);
      const assinaturaInvalida = await enviarWebhook(corpo, assinar(corpo, "outro-segredo"));

      esperarProblema(semAssinatura, 401, "unauthorized");
      esperarProblema(assinaturaInvalida, 401, "unauthorized");
      expect(semanticaDoProblema(semAssinatura.body)).toEqual(
        semanticaDoProblema(assinaturaInvalida.body),
      );
    });

    it("SEC-04 #6 — assinatura válida aprova o pagamento", async () => {
      const { cobranca } = await cenarioDeCobranca();
      const corpo = JSON.stringify(eventoPago(cobranca.billingId));

      const res = await enviarWebhook(corpo, assinar(corpo));

      expect(res.status).toBe(200);
      expect(await lerCobranca(cobranca)).toEqual(PAGO);
    });
  });
});
