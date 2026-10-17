// ============================================================
//   SEC-01 — atomicidade da confirmação de pagamento simulado
//
//   As duas mutações (pedido → "Queued" e pagamento → "aprovado")
//   precisam viver na mesma transação: se a segunda falhar, a
//   primeira é revertida. O erro sobe para o middleware global sem
//   vazar detalhe interno e com traceId.
// ============================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";
import { criarCobranca, lerCobranca } from "../helpers/payments.js";
import { PROBLEM_TYPE_NAMESPACE } from "../../src/errors/problem.js";

const PENDENTE = { pedido: "Pending_Payment", pagamento: "pendente" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

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

    // Injeta uma falha real na segunda escrita (pagamentos), sem tocar no
    // banco: o pedido já foi atualizado dentro da transação e precisa voltar.
    const connectOriginal = pool.connect.bind(pool);
    vi.spyOn(pool, "connect").mockImplementation((async () => {
      const client = (await connectOriginal()) as unknown as {
        query: (...args: unknown[]) => unknown;
        release: () => void;
      };
      const queryOriginal = client.query.bind(client);
      client.query = (...args: unknown[]) => {
        const [text] = args;
        const sql = typeof text === "string" ? text : String((text as { text?: string } | undefined)?.text ?? "");
        if (/update\s+pagamentos/i.test(sql)) {
          return Promise.reject(new Error("FALHA-FORCADA-SEGUNDA-ATUALIZACAO"));
        }
        return queryOriginal(...args);
      };
      return client;
    }) as never);

    const res = await request(app)
      .post("/api/payments/confirm-simulated-payment")
      .set(...comToken(dono.token))
      .send({ billingId: cobranca.billingId });

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
});
