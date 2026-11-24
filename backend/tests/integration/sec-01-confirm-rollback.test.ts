// ============================================================
//   SEC-01 — atomicidade da confirmação de pagamento simulado
//
//   As duas mutações (pedido → "Queued" e pagamento → "aprovado")
//   precisam viver na mesma transação: se a segunda falhar, a
//   primeira é revertida. O erro sobe para o middleware global sem
//   vazar detalhe interno e com traceId.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { comFalhaNoBanco } from "../helpers/falhaNoBanco.js";
import { criarPedido } from "../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../helpers/payments.js";
import { PROBLEM_TYPE_NAMESPACE } from "../../src/errors/problem.js";

const PENDENTE = { pedido: "Pending_Payment", pagamento: "pendente" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

async function cenarioDeCobranca() {
  const fabrica = await criarUsuario("factory");
  const dono = await criarUsuario("client");
  const pedido = await criarPedido({ dono, fabrica, status: "Pending_Payment" });
  const cobranca = await criarCobranca(pedido);
  return { dono, cobranca };
}

describe("SEC-01 — atomicidade da confirmação simulada", () => {
  it("falha na segunda atualização reverte a primeira (ROLLBACK)", async () => {
    const { dono, cobranca } = await cenarioDeCobranca();

    // DB-03: o próprio banco recusa a segunda escrita (pagamentos). O pedido
    // já foi atualizado dentro da transação e precisa voltar.
    const res = await comFalhaNoBanco(
      { tabela: "pagamentos", evento: "UPDATE", sqlstate: "XX000", mensagem: "FALHA-FORCADA-SEGUNDA-ATUALIZACAO" },
      () => request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(dono.token))
        .send({ billingId: cobranca.billingId }),
    );

    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body["type"]).toBe(`${PROBLEM_TYPE_NAMESPACE}/internal-error`);
    expect(res.body["detail"]).toBe("Ocorreu um erro interno no servidor.");
    expect(String(res.body["traceId"])).toMatch(UUID);
    expect(res.body["instance"]).toBe(res.body["traceId"]);

    // O corpo não pode conter mensagem interna, SQL nem nome de tabela.
    const corpo = JSON.stringify(res.body).toLowerCase();
    expect(corpo).not.toContain("falha-forcada-segunda-atualizacao");
    expect(corpo).not.toContain("pagamentos");
    expect(corpo).not.toContain("update ");

    // Nenhuma das duas mutações persistiu: rollback preservou o estado.
    expect(await lerCobranca(cobranca)).toEqual(PENDENTE);
  });

  // As duas escritas passam e o banco recusa no COMMIT. Se o pagamento fosse
  // aprovado fora da transação do pedido, ele ficaria aprovado sozinho. O
  // status HTTP não é verificado aqui: o Prisma 5.22 não propaga a falha do
  // COMMIT de uma transação interativa (ver webhook-provider.test.ts).
  it("falha no COMMIT desfaz o pedido e o pagamento juntos", async () => {
    const { dono, cobranca } = await cenarioDeCobranca();

    await comFalhaNoBanco(
      { tabela: "pedidos", evento: "UPDATE", sqlstate: "XX000", mensagem: "FALHA-FORCADA-NO-COMMIT", noCommit: true },
      () => request(app)
        .post("/api/payments/confirm-simulated-payment")
        .set(...comToken(dono.token))
        .send({ billingId: cobranca.billingId }),
    );

    expect(await lerCobranca(cobranca)).toEqual(PENDENTE);
  });
});
