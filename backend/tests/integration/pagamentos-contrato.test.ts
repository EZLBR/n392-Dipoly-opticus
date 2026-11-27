// ============================================================
//   DB-03 — Pagamentos: contrato da API
//
//   Falam com a API, não com a implementação. Passavam iguais com
//   o controller em SQL puro: são a prova de que a migração para o
//   Prisma não mudou nada para quem consome. Autorização, gateway
//   real e assinatura do webhook têm testes próprios
//   (idor-pagamentos, cobranca-producao, webhook-provider).
// ============================================================

import { randomUUID } from "node:crypto";
import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { Prisma } from "@prisma/client";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { esperarBloqueios } from "../helpers/bloqueio.js";
import { criarPedido, type PedidoDeTeste } from "../helpers/orders.js";
import { esperarProblema } from "../helpers/problem.js";
import { assinarWebhook, eventoCheckoutPago, SEGREDO_WEBHOOK } from "../helpers/webhook.js";

afterEach(() => vi.unstubAllEnvs());

/** Pedidos do mesmo dono numa cobrança só, como o checkout do carrinho deixa. */
async function cobrancaComPedidos(opcoes: {
  dono: UsuarioDeTeste;
  totais: string[];
  simulada: boolean;
  billingId?: string;
}) {
  const billingId = opcoes.billingId ?? `bill-contrato-${randomUUID()}`;
  const pedidos: PedidoDeTeste[] = [];
  for (const total of opcoes.totais) {
    const pedido = await criarPedido({ dono: opcoes.dono, status: "Pending_Payment", total });
    await prisma.pedido.update({
      where: { id: pedido.id },
      data: { abacateBillingId: billingId, pagamentoSimulado: opcoes.simulada },
    });
    pedidos.push(pedido);
  }
  return { billingId, pedidos };
}

const pagamentosDe = (pedido: PedidoDeTeste) =>
  prisma.pagamento.findMany({
    where: { pedidoId: pedido.id },
    orderBy: { id: "asc" },
    select: { id: true, metodo: true, status: true, valor: true, referenciaExterna: true },
  });

const comValorEmTexto = <T extends { valor: Prisma.Decimal }>(linhas: T[]) =>
  linhas.map(linha => ({ ...linha, valor: linha.valor.toFixed(2) }));

const statusDe = async (pedido: PedidoDeTeste) =>
  (await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id }, select: { status: true } })).status;

describe("pagamentos — contrato da API (DB-03)", () => {
  describe("POST /api/payments/create-billing (simulador)", () => {
    it("devolve só o link do checkout simulado e grava a cobrança no pedido", async () => {
      const dono = await criarUsuario("client");
      const pedido = await criarPedido({ dono, status: "Pending_Payment" });

      const res = await request(app).post("/api/payments/create-billing")
        .set(...comToken(dono.token)).set("Origin", "http://localhost:5174")
        .send({ orderPublicId: pedido.publicId });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["checkoutUrl", "isSimulated"]);
      expect(res.body.isSimulated).toBe(true);
      const link = new URL(res.body.checkoutUrl);
      expect(link.pathname).toBe("/api/payments/simulated-checkout");
      expect([...link.searchParams.keys()]).toEqual(["billingId", "orderPublicId", "returnTo"]);
      expect(link.searchParams.get("orderPublicId")).toBe(pedido.publicId);
      expect(link.searchParams.get("returnTo")).toBe("http://localhost:5174");

      const gravado = await prisma.pedido.findUniqueOrThrow({
        where: { id: pedido.id },
        select: { status: true, abacateBillingId: true, pagamentoSimulado: true },
      });
      expect(gravado).toEqual({
        status: "Pending_Payment",
        abacateBillingId: link.searchParams.get("billingId"),
        pagamentoSimulado: true,
      });
      // A cobrança simulada não registra pagamento: ele nasce na confirmação.
      expect(await pagamentosDe(pedido)).toEqual([]);
    });

    it.each(["Queued", "In_production", "Delivered", "Cancelled"] as const)(
      "pedido em %s responde 409 e não ganha cobrança",
      async (status) => {
        const dono = await criarUsuario("client");
        const pedido = await criarPedido({ dono, status });

        const res = await request(app).post("/api/payments/create-billing")
          .set(...comToken(dono.token)).send({ orderPublicId: pedido.publicId });

        esperarProblema(res, 409, "conflict");
        expect(res.body.detail).toBe("Só é possível gerar cobrança para um pedido que aguarda pagamento.");
        expect(await prisma.pedido.findUniqueOrThrow({
          where: { id: pedido.id }, select: { status: true, abacateBillingId: true },
        })).toEqual({ status, abacateBillingId: null });
      },
    );

    // A leitura não espera locks; a escrita espera e reavalia a cláusula na
    // versão nova da linha. Só a guarda da própria escrita segura a mudança
    // que chegou entre as duas.
    it.each([
      ["é pago", `UPDATE pedidos SET status = 'Queued' WHERE id = $1`],
      ["muda de dono", `UPDATE pedidos SET usuario_id = $2 WHERE id = $1`],
    ])("o pedido %s entre a leitura e a escrita: 409 e a cobrança não é gravada", async (_caso, mudanca) => {
      const dono = await criarUsuario("client");
      const outro = await criarUsuario("client");
      const pedido = await criarPedido({ dono, status: "Pending_Payment" });

      const conexao = await pool.connect();
      let cobranca: Promise<request.Response>;
      try {
        await conexao.query("BEGIN");
        await conexao.query(mudanca, mudanca.includes("$2") ? [pedido.id, outro.id] : [pedido.id]);
        cobranca = request(app).post("/api/payments/create-billing")
          .set(...comToken(dono.token)).send({ orderPublicId: pedido.publicId }).then(r => r);
        await esperarBloqueios();
        await conexao.query("COMMIT");
      } catch (erro) {
        await conexao.query("ROLLBACK");
        throw erro;
      } finally {
        conexao.release();
      }

      esperarProblema(await cobranca, 409, "conflict");
      expect(await prisma.pedido.findUniqueOrThrow({
        where: { id: pedido.id }, select: { abacateBillingId: true, pagamentoSimulado: true },
      })).toEqual({ abacateBillingId: null, pagamentoSimulado: false });
    });
  });

  describe("GET /api/payments (staff)", () => {
    async function pagamento(pedido: PedidoDeTeste, valor: string, criadoEm: string, referenciaExterna: string | null) {
      return prisma.pagamento.create({
        data: { pedidoId: pedido.id, valor, referenciaExterna, criadoEm: new Date(criadoEm) },
        select: { publicId: true, criadoEm: true },
      });
    }

    it("lista os pagamentos do mais novo para o mais antigo, com o pedido e o cliente", async () => {
      const staff = await criarUsuario("staff");
      const dono = await criarUsuario("client");
      const pedido = await criarPedido({ dono, status: "Pending_Payment" });
      const antigo = await pagamento(pedido, "450.00", "2026-01-05T10:00:00.000Z", "bill-antigo");
      const novo = await pagamento(pedido, "1999.90", "2026-03-01T15:30:45.123Z", null);

      const res = await request(app).get("/api/payments").set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["pagamentos", "pagination"]);
      expect(res.body.pagination).toEqual({ page: 1, limit: 20, totalItems: 2, totalPages: 1 });
      const comum = {
        pedidoPublicId: pedido.publicId,
        metodo: "pix",
        status: "pendente",
        clienteNome: dono.nome,
        clienteEmail: dono.email,
      };
      expect(res.body.pagamentos).toEqual([
        { ...comum, publicId: novo.publicId, valor: "1999.90", referenciaExterna: null, criadoEm: "2026-03-01T15:30:45.123Z" },
        { ...comum, publicId: antigo.publicId, valor: "450.00", referenciaExterna: "bill-antigo", criadoEm: "2026-01-05T10:00:00.000Z" },
      ]);
    });

    it("pagina com page e limit", async () => {
      const staff = await criarUsuario("staff");
      const dono = await criarUsuario("client");
      const pedido = await criarPedido({ dono, status: "Pending_Payment" });
      await pagamento(pedido, "10.00", "2026-01-01T00:00:00.000Z", "a");
      const meio = await pagamento(pedido, "20.00", "2026-01-02T00:00:00.000Z", "b");
      await pagamento(pedido, "30.00", "2026-01-03T00:00:00.000Z", "c");

      const res = await request(app).get("/api/payments?page=2&limit=1").set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(res.body.pagination).toEqual({ page: 2, limit: 1, totalItems: 3, totalPages: 3 });
      expect(res.body.pagamentos.map((p: { publicId: string }) => p.publicId)).toEqual([meio.publicId]);
    });

    it("sem pagamentos, devolve a lista vazia", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).get("/api/payments").set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ pagamentos: [], pagination: { page: 1, limit: 20, totalItems: 0, totalPages: 0 } });
    });

    it("paginação inválida responde 400", async () => {
      const staff = await criarUsuario("staff");

      esperarProblema(await request(app).get("/api/payments?page=0").set(...comToken(staff.token)), 400, "bad-request");
    });

    it.each(["client", "factory"] as const)("%s recebe 403", async (papel) => {
      const usuario = await criarUsuario(papel);

      esperarProblema(await request(app).get("/api/payments").set(...comToken(usuario.token)), 403, "forbidden");
    });
  });

  describe("GET /api/payments/simulated-checkout", () => {
    const pagina = (dono: UsuarioDeTeste, billingId: string, idioma = "pt-BR") =>
      request(app).get("/api/payments/simulated-checkout").query({ billingId })
        .set(...comToken(dono.token)).set("Accept-Language", idioma);

    it("mostra os itens da cobrança, o total somado e os dados do cliente, escapados", async () => {
      const dono = await criarUsuario("client");
      const { billingId, pedidos } = await cobrancaComPedidos({ dono, totais: ["450.00", "1999.90"], simulada: true });
      // FEAT-04: a página mostra os itens; o nome vem do item.
      await prisma.pedidoItem.updateMany({ where: { pedidoId: pedidos[1].id }, data: { productName: "<img src=x onerror=alert(1)>" } });
      const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

      const res = await pagina(dono, billingId);

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^text\/html/);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.headers["vary"]).toMatch(/Accept-Language/);
      expect(res.headers["content-language"]).toBe("pt-BR");
      expect(res.text).toContain(reais.format(2449.9));
      expect(res.text).toContain(reais.format(450));
      expect(res.text).toContain(reais.format(1999.9));
      expect(res.text).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(res.text).not.toContain("<img src=x");
      expect(res.text).toContain(billingId);
      expect(res.text).toContain(`${dono.nome} (${dono.email})`);
    });

    it("em inglês, muda o idioma da página e o formato do valor", async () => {
      const dono = await criarUsuario("client");
      const { billingId } = await cobrancaComPedidos({ dono, totais: ["1999.90"], simulada: true });

      const res = await pagina(dono, billingId, "en");

      expect(res.status).toBe(200);
      expect(res.headers["content-language"]).toBe("en");
      expect(res.text).toContain('<html lang="en">');
      expect(res.text).toContain(new Intl.NumberFormat("en", { style: "currency", currency: "BRL" }).format(1999.9));
    });

    it("sem billingId responde 400, também sem cache", async () => {
      const dono = await criarUsuario("client");

      const res = await request(app).get("/api/payments/simulated-checkout").set(...comToken(dono.token));

      esperarProblema(res, 400, "bad-request");
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });

    it("cobrança inexistente responde 404, também sem cache", async () => {
      const dono = await criarUsuario("client");

      const res = await pagina(dono, "bill-inexistente");

      esperarProblema(res, 404, "not-found");
      expect(res.headers["cache-control"]).toBe("private, no-store");
    });
  });

  describe("POST /api/payments/confirm-simulated-payment", () => {
    it("confirma todos os pedidos do dono na cobrança: aprova o pagamento existente e cria o que falta", async () => {
      const dono = await criarUsuario("client");
      const outro = await criarUsuario("client");
      const { billingId, pedidos: [comPagamento, semPagamento] } =
        await cobrancaComPedidos({ dono, totais: ["450.00", "1999.90"], simulada: true });
      const { pedidos: [alheio] } = await cobrancaComPedidos({ dono: outro, totais: ["450.00"], simulada: true, billingId });
      const existente = await prisma.pagamento.create({
        data: { pedidoId: comPagamento.id, valor: "450.00", referenciaExterna: billingId }, select: { id: true },
      });
      // Pagamento de outra cobrança do mesmo pedido: não é desta confirmação.
      const velho = await prisma.pagamento.create({
        data: { pedidoId: comPagamento.id, valor: "450.00", referenciaExterna: "bill-velho" }, select: { id: true },
      });

      const res = await request(app).post("/api/payments/confirm-simulated-payment")
        .set(...comToken(dono.token)).send({ billingId });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: "confirmed", billingId });
      expect(await statusDe(comPagamento)).toBe("Queued");
      expect(await statusDe(semPagamento)).toBe("Queued");
      expect(comValorEmTexto(await pagamentosDe(comPagamento))).toEqual([
        { id: existente.id, metodo: "pix", status: "aprovado", valor: "450.00", referenciaExterna: billingId },
        { id: velho.id, metodo: "pix", status: "pendente", valor: "450.00", referenciaExterna: "bill-velho" },
      ]);
      expect(comValorEmTexto(await pagamentosDe(semPagamento))).toEqual([
        { id: expect.any(Number), metodo: "pix", status: "aprovado", valor: "1999.90", referenciaExterna: billingId },
      ]);
      // O pedido de outra pessoa na mesma cobrança não é tocado.
      expect(await statusDe(alheio)).toBe("Pending_Payment");
      expect(await pagamentosDe(alheio)).toEqual([]);
    });

    it.each([{}, { billingId: "" }, { billingId: "   " }, { billingId: 42 }])(
      "billingId inválido (%j) responde 400",
      async (corpo) => {
        const dono = await criarUsuario("client");

        const res = await request(app).post("/api/payments/confirm-simulated-payment")
          .set(...comToken(dono.token)).send(corpo);

        esperarProblema(res, 400, "bad-request");
      },
    );
  });

  describe("POST /api/payments/webhook", () => {
    function enviar(evento: unknown) {
      vi.stubEnv("WEBHOOK_SECRET", SEGREDO_WEBHOOK);
      const corpo = JSON.stringify(evento);
      return request(app).post("/api/payments/webhook").query({ webhookSecret: SEGREDO_WEBHOOK })
        .set("Content-Type", "application/json").set("X-Webhook-Signature", assinarWebhook(corpo)).send(corpo);
    }

    it("pagamento confirmado: fila todos os pedidos reais da cobrança, aprova o pagamento e cria o que falta", async () => {
      const dono = await criarUsuario("client");
      const { billingId, pedidos: [comPagamento, semPagamento] } =
        await cobrancaComPedidos({ dono, totais: ["450.00", "1999.90"], simulada: false });
      // Pedido simulado com o mesmo billingId: o gateway real não o confirma.
      const { pedidos: [simulado] } = await cobrancaComPedidos({ dono, totais: ["450.00"], simulada: true, billingId });
      const existente = await prisma.pagamento.create({
        data: { pedidoId: comPagamento.id, valor: "450.00", referenciaExterna: billingId }, select: { id: true },
      });

      const res = await enviar(eventoCheckoutPago(billingId));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(await statusDe(comPagamento)).toBe("Queued");
      expect(await statusDe(semPagamento)).toBe("Queued");
      expect(comValorEmTexto(await pagamentosDe(comPagamento))).toEqual([
        { id: existente.id, metodo: "pix", status: "aprovado", valor: "450.00", referenciaExterna: billingId },
      ]);
      expect(comValorEmTexto(await pagamentosDe(semPagamento))).toEqual([
        { id: expect.any(Number), metodo: "pix", status: "aprovado", valor: "1999.90", referenciaExterna: billingId },
      ]);
      expect(await statusDe(simulado)).toBe("Pending_Payment");
      expect(await pagamentosDe(simulado)).toEqual([]);
    });

    it("reentrega do mesmo evento não duplica pagamento", async () => {
      const dono = await criarUsuario("client");
      const { billingId, pedidos: [pedido] } = await cobrancaComPedidos({ dono, totais: ["450.00"], simulada: false });

      expect((await enviar(eventoCheckoutPago(billingId))).status).toBe(200);
      expect((await enviar(eventoCheckoutPago(billingId))).status).toBe(200);

      expect(await statusDe(pedido)).toBe("Queued");
      expect((await pagamentosDe(pedido)).map(p => p.status)).toEqual(["aprovado"]);
    });

    it.each([
      ["outro evento", (e: ReturnType<typeof eventoCheckoutPago>) => { e.event = "checkout.refunded"; }],
      ["id vazio", (e: ReturnType<typeof eventoCheckoutPago>) => { e.data.checkout.id = " "; }],
      ["id que não é texto", (e: ReturnType<typeof eventoCheckoutPago>) => { (e.data.checkout as { id: unknown }).id = 42; }],
    ])("%s: responde 200 e não muda nada", async (_caso, alterar) => {
      const dono = await criarUsuario("client");
      const { billingId, pedidos: [pedido] } = await cobrancaComPedidos({ dono, totais: ["450.00"], simulada: false });
      const evento = eventoCheckoutPago(billingId);
      alterar(evento);

      const res = await enviar(evento);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(await statusDe(pedido)).toBe("Pending_Payment");
      expect(await pagamentosDe(pedido)).toEqual([]);
    });
  });
});
