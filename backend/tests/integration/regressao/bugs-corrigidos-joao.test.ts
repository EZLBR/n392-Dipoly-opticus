// ============================================================
//   Regressão — bugs localizados e corrigidos pelo João Pedro
//
//   Cada bloco reproduz a exploração ou a falha original contra o
//   banco de teste real, sem simular a camada de persistência. Onde
//   o teste original injetava a falha com mock do pool (SEC-01 e
//   #70), aqui a falha vem do próprio PostgreSQL. Os cenários que
//   já tinham cobertura sem mock (BOLA-03, BOLA-04, BOLA-05, ID-02)
//   continuam nos arquivos originais e não são repetidos.
// ============================================================

import { afterEach, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../../setup/app.js";
import { pool } from "../../setup/db.js";
import { criarUsuario, comToken } from "../../helpers/auth.js";
import { especificacaoDoStudio } from "../../helpers/especificacao.js";
import { comFalhaNoBanco } from "../../helpers/falhaNoBanco.js";
import { criarPedido } from "../../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../../helpers/payments.js";
import { esperarProblema } from "../../helpers/problem.js";
import { assinarWebhook, eventoCheckoutPago, SEGREDO_WEBHOOK } from "../../helpers/webhook.js";

const UUID_V4 = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** O corpo é o 500 genérico do contrato, com traceId, e não cita nada do que foi passado. */
function esperar500Opaco(res: request.Response, segredos: string[]) {
  esperarProblema(res, 500, "internal-error");
  expect(res.body.detail).toBe("Ocorreu um erro interno no servidor.");
  expect(res.body.traceId).toMatch(new RegExp(`^${UUID_V4}$`));
  expect(res.body.instance).toBe(res.body.traceId);
  const corpo = JSON.stringify(res.body).toLowerCase();
  for (const segredo of segredos) expect(corpo).not.toContain(segredo.toLowerCase());
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SEC-01 (#96) — a confirmação simulada é uma transação só", () => {
  it("falha real do banco na segunda escrita desfaz a primeira, e a confirmação volta a funcionar depois", async () => {
    const dono = await criarUsuario("client");
    const pedido = await criarPedido({ dono, fabrica: await criarUsuario("factory"), status: "Pending_Payment" });
    const cobranca = await criarCobranca(pedido);
    const confirmar = () => request(app).post("/api/payments/confirm-simulated-payment")
      .set(...comToken(dono.token)).send({ billingId: cobranca.billingId });

    // O pedido já passou para Queued dentro da transação quando o pagamento falha.
    const falhou = await comFalhaNoBanco(
      { tabela: "pagamentos", evento: "UPDATE", sqlstate: "XX000", mensagem: "SEGREDO-DA-CONFIRMACAO pagamentos" },
      confirmar,
    );

    esperar500Opaco(falhou, ["SEGREDO-DA-CONFIRMACAO", "pagamentos", "XX000"]);
    expect(await lerCobranca(cobranca)).toEqual({ pedido: "Pending_Payment", pagamento: "pendente" });

    // Nada ficou preso: sem a falha, a mesma cobrança é confirmada normalmente.
    expect((await confirmar()).status).toBe(200);
    expect(await lerCobranca(cobranca)).toEqual({ pedido: "Queued", pagamento: "aprovado" });
  });
});

describe("#70 — erro interno vira resposta opaca, sem detalhe do banco", () => {
  const novoPedido = (token: string) => request(app).post("/api/orders").set(...comToken(token)).send({
    productName: "Armação", factoryName: "Fábrica", customSpecs: especificacaoDoStudio(),
  });

  it("erro real do banco com texto sensível vira 500 com traceId, e nada é gravado", async () => {
    const staff = await criarUsuario("staff");

    const res = await comFalhaNoBanco(
      { tabela: "categorias", evento: "INSERT", sqlstate: "XX000", mensagem: "SEGREDO-INTERNO coluna nome da tabela categorias" },
      () => request(app).post("/api/categories").set(...comToken(staff.token)).send({ nome: "Qualquer" }),
    );

    esperar500Opaco(res, ["SEGREDO-INTERNO", "categorias", "coluna", "XX000"]);
    expect(Number((await pool.query("SELECT COUNT(*) FROM categorias")).rows[0].count)).toBe(0);
  });

  it("violação real de chave estrangeira vira 409, sem nome de constraint nem de tabela", async () => {
    const cliente = await criarUsuario("client");

    const res = await comFalhaNoBanco(
      {
        tabela: "pedidos", evento: "INSERT", sqlstate: "23503",
        mensagem: 'insert or update on table "pedidos" violates foreign key constraint "pedidos_factory_id_fkey"',
        constraint: "pedidos_factory_id_fkey",
      },
      () => novoPedido(cliente.token),
    );

    esperarProblema(res, 409, "conflict");
    expect(res.body.detail).toBe("Registro referenciado não existe.");
    expect(JSON.stringify(res.body)).not.toMatch(/pedidos_factory_id_fkey|foreign key|23503/i);
    expect(Number((await pool.query("SELECT COUNT(*) FROM pedidos")).rows[0].count)).toBe(0);
  });

  it("tipo inválido recusado pelo banco (22P02) vira 500, nunca 400", async () => {
    const cliente = await criarUsuario("client");

    const res = await comFalhaNoBanco(
      { tabela: "pedidos", evento: "INSERT", sqlstate: "22P02", mensagem: 'invalid input syntax for type integer: "nao-numerico"' },
      () => novoPedido(cliente.token),
    );

    esperar500Opaco(res, ["invalid input syntax", "nao-numerico", "22P02"]);
  });
});

describe("SEC-02 (#95) — billingId imprevisível", () => {
  it("vinte cobranças pedidas ao mesmo tempo recebem identificadores distintos e aleatórios", async () => {
    const dono = await criarUsuario("client");
    const pedidos = await Promise.all(Array.from({ length: 20 }, () => criarPedido({ dono, status: "Pending_Payment" })));

    const respostas = await Promise.all(pedidos.map(pedido =>
      request(app).post("/api/payments/create-billing").set(...comToken(dono.token)).send({ orderPublicId: pedido.publicId })));

    expect(respostas.every(r => r.status === 200)).toBe(true);
    const ids = respostas.map(r => new URL(r.body.checkoutUrl).searchParams.get("billingId"));
    expect(new Set(ids).size).toBe(20);
    for (const id of ids) expect(id).toMatch(new RegExp(`^bill-sim-${UUID_V4}$`));
    const { rows } = await pool.query(`SELECT abacate_billing_id FROM pedidos WHERE "publicId" = ANY($1::text[])`,
      [pedidos.map(p => p.publicId)]);
    expect(rows.map(r => r.abacate_billing_id).sort()).toEqual([...ids].sort());
  });
});

describe("SEC-04 (#97) — reentrega do webhook não repete efeito", () => {
  // Sem linha de pagamento prévia, como no checkout do carrinho: é o webhook
  // que cria o pagamento, e uma reentrega não pode criar outro.
  it("o mesmo evento pago entregue cinco vezes ao mesmo tempo aprova uma vez só", async () => {
    vi.stubEnv("WEBHOOK_SECRET", SEGREDO_WEBHOOK);
    const pedido = await criarPedido({ dono: await criarUsuario("client"), status: "Pending_Payment" });
    const cobranca = { billingId: `bill-real-${pedido.publicId}`, pedidoPublicId: pedido.publicId };
    await pool.query(`UPDATE pedidos SET abacate_billing_id = $1, pagamento_simulado = false WHERE id = $2`,
      [cobranca.billingId, pedido.id]);
    const corpo = JSON.stringify(eventoCheckoutPago(cobranca.billingId));

    const respostas = await Promise.all(Array.from({ length: 5 }, () => request(app).post("/api/payments/webhook")
      .query({ webhookSecret: SEGREDO_WEBHOOK }).set("Content-Type", "application/json")
      .set("X-Webhook-Signature", assinarWebhook(corpo)).send(corpo)));

    expect(respostas.map(r => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(await lerCobranca(cobranca)).toEqual({ pedido: "Queued", pagamento: "aprovado" });
    const { rows: pagamentos } = await pool.query(
      "SELECT status FROM pagamentos WHERE pedido_id = $1 AND referencia_externa = $2", [pedido.id, cobranca.billingId]);
    expect(pagamentos).toEqual([{ status: "aprovado" }]);
    const { rows: transicoes } = await pool.query(
      "SELECT from_status, to_status FROM order_status_history WHERE order_id = $1 AND kind = 'transition'", [pedido.id]);
    expect(transicoes).toEqual([{ from_status: "Pending Payment", to_status: "Queued" }]);
  });
});
