// ============================================================
//   traceId — erros 500: não-vazamento + correlação com o log
//
//   O trabalho anterior já matou os vazamentos originais citados
//   na evidência (server.ts:103, orderController.ts:305 e
//   paymentController.ts:231 — todos desatualizados). Este arquivo
//   garante, agora como regressão:
//   - erro real de banco (pg) -> 500, NUNCA 400;
//   - o corpo do 500 não contém mensagem do PostgreSQL, stack trace
//     nem caminho de arquivo do servidor;
//   - o corpo expõe somente `traceId` (UUID opaco) como identificador,
//     idêntico ao `instance` e ao header `X-Request-Id`;
//   - a MESMA ocorrência é encontrada no log do servidor pelo
//     `traceId`, com a mensagem original e a stack trace.
// ============================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { requestId } from "../../src/middlewares/requestId.js";
import { problemErrorHandler } from "../../src/middlewares/problemErrorHandler.js";
import { PROBLEM_TYPE_NAMESPACE } from "../../src/errors/problem.js";

vi.mock("../../src/utils/logger.js", () => ({
  default: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    fatal: vi.fn(),
    debug: vi.fn(),
  },
}));

import logger from "../../src/utils/logger.js";

const errorSpy = vi.mocked(logger.error);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface RespostaDeTeste {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

const DETAIL_500 = "Ocorreu um erro interno no servidor.";

/** Garante que o corpo (nome de campo/valor) não contém nenhuma substring proibida. */
function semVazamento(res: RespostaDeTeste, verbotenes: string[]): void {
  const corpo = JSON.stringify(res.body);
  for (const s of verbotenes) {
    expect(corpo.toLowerCase()).not.toContain(s.toLowerCase());
  }
}

/** Contrato mínimo de um 500 gerado por erro real de banco. */
function expect500Generico(res: RespostaDeTeste): string {
  expect(res.status).toBe(500);
  expect(res.headers["content-type"]).toContain("application/problem+json");

  const body = res.body;
  expect(body["type"]).toBe(`${PROBLEM_TYPE_NAMESPACE}/internal-error`);
  expect(body["status"]).toBe(500);
  expect(body["title"]).toBe("Erro interno no servidor");

  // `detail` e o alias `error` são genéricos e fixos — nunca a mensagem real.
  expect(body["detail"]).toBe(DETAIL_500);
  expect(body["error"]).toBe(DETAIL_500);

  // identificador de correlação: opaco, único e coerente em todos os canais.
  const traceId = String(body["traceId"]);
  expect(traceId).toMatch(UUID);
  expect(body["instance"]).toBe(traceId);
  expect(String(res.headers["x-request-id"]).toLowerCase()).toBe(traceId.toLowerCase());

  return traceId;
}

/** Procura, nas chamadas de `logger.error`, a que registrou aquele traceId. */
function registroComTraceId(traceId: string) {
  return errorSpy.mock.calls.find((args) => {
    const bindings = args[0] as { traceId?: unknown };
    return bindings && bindings.traceId === traceId;
  });
}

// ─────────────────────────────────────────────────────────
//   Harness: mini-app com rotas que disparam falhas reais de banco.
// ─────────────────────────────────────────────────────────
function appDeTeste() {
  const appMini = express();
  appMini.use(requestId());
  appMini.use(express.json());

  // Falha real de banco: tabela inexistente (SQLSTATE 42P01).
  appMini.get("/sql-invalido", async () => {
    await pool.query("SELECT * FROM tabela_inexistente_para_teste");
  });

  // Falha real de banco: coluna inexistente em tabela existente.
  appMini.get("/coluna-invalida", async () => {
    await pool.query('SELECT "coluna_inexistente_xyz" FROM pedidos');
  });

  // Erro genérico não mapeado, com mensagem que jamais pode vazar.
  appMini.get("/erro-generico", () => {
    throw new Error("MSG-INTERNA-TOP-SECRET-do-servidor");
  });

  appMini.use(problemErrorHandler);
  return appMini;
}

const appMini = appDeTeste();

describe("500 com erro real de banco — não vazamento e traceId", () => {
  beforeEach(() => {
    errorSpy.mockClear();
  });

  it("SQL inválido (tabela inexistente) vira 500 sem texto do PostgreSQL", async () => {
    const res = await request(appMini).get("/sql-invalido");

    const traceId = expect500Generico(res);
    semVazamento(res, [
      "tabela_inexistente_para_teste",
      "relation",
      "does not exist",
      "42p01",
      "syntax",
      "at ",
      "/home",
      "src/",
      ".ts",
    ]);
    expect(typeof traceId).toBe("string");
  });

  it("coluna inexistente vira 500 sem nome de tabela nem coluna", async () => {
    const res = await request(appMini).get("/coluna-invalida");

    expect500Generico(res);
    semVazamento(res, ["coluna_inexistente_xyz", "column", "pedidos", "22p02"]);
  });

  it("erro genérico vira 500 sem mensagem interna, stack nem caminho", async () => {
    const res = await request(appMini).get("/erro-generico");

    expect500Generico(res);
    semVazamento(res, [
      "msg-interna-top-secret-do-servidor",
      "at ",
      "/home",
      "src/controllers",
      "node_modules",
      ".ts",
    ]);
  });

  it("mensagem original e stack ficam no log, ligadas ao mesmo traceId", async () => {
    const res = await request(appMini).get("/sql-invalido");
    const traceId = expect500Generico(res);

    const chamada = registroComTraceId(traceId);
    expect(chamada, `logger.error deveria ter registrado o traceId ${traceId}`)
      .toBeDefined();

    const bindings = chamada![0] as { err?: Error; requestId?: string };
    expect(bindings.err).toBeInstanceOf(Error);
    expect(String(bindings.err!.message)).toContain("tabela_inexistente_para_teste");
    expect(typeof bindings.err!.stack).toBe("string");
    expect(bindings.err!.stack!.length).toBeGreaterThan(0);
  });

  it("corpo não contém o que só o log deve ter (contraste direto)", async () => {
    const res = await request(appMini).get("/sql-invalido");
    expect500Generico(res);

    const corpo = JSON.stringify(res.body);
    const chamadas = errorSpy.mock.calls;
    expect(corpo).not.toContain("tabela_inexistente_para_teste");

    const algumaMencionaTabela = chamadas.some((args) => {
      const bindings = args[0] as { err?: { message?: string } };
      return bindings?.err?.message?.includes("tabela_inexistente_para_teste");
    });
    expect(algumaMencionaTabela).toBe(true);
  });
});

describe("regressão — falha de banco não vira 400 (pontos da evidência)", () => {
  beforeEach(() => {
    errorSpy.mockClear();
  });

  it("paymentController: SELECT com tipo inválido vira 500, nunca 400", async () => {
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/payments/create-billing")
      .set(...comToken(cliente.token))
      .send({ orderId: "nao-numerico" });

    const traceId = expect500Generico(res);
    // SQLSTATE 22P02 (invalid input syntax) é errível cru do pg, não detalhe.
    semVazamento(res, ["nao-numerico", "invalid input syntax", "22p02", "pedidos"]);
    expect(typeof traceId).toBe("string");
  });

  it("orderController: violação de foreign key vira 409 (mapeada), nunca 400", async () => {
    const cliente = await criarUsuario("client");

    const res = await request(app)
      .post("/api/orders/checkout-cart")
      .set(...comToken(cliente.token))
      .send({
        cartItems: [
          {
            productName: "Óculos sem fábrica",
            factoryId: "999999",
            factoryName: "Fábrica Fantasma",
            total: 100,
            customSpecs: {},
          },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body["type"]).toBe(`${PROBLEM_TYPE_NAMESPACE}/conflict`);
    expect(res.body["detail"]).toBe("Registro referenciado não existe.");
    expect(res.body["status"]).toBe(409);
    // A causa SQL não vaza nem aqui (mapeado), nem no traceId.
    semVazamento(res, ["23503", "pedidos_factory_id_fkey", "999999", "fkey"]);
    expect(res.body["traceId"]).toMatch(UUID);
  });

  it("server.ts não responde ao cliente: qualquer rota desconhecida passa pelo middleware com traceId", async () => {
    const res = await request(app).get("/rota-que-nao-existe");

    expect(res.status).toBe(404);
    expect(res.body["type"]).toBe(`${PROBLEM_TYPE_NAMESPACE}/not-found`);
    expect(res.body["traceId"]).toMatch(UUID);
    expect(res.body["instance"]).toBe(res.body["traceId"]);
  });
});