// ============================================================
//   BOLA-02 — Problem Details (RFC 9457): middleware global de erro
//
//   Cobre o contrato inteiro do middleware:
//   - HttpProblem / subclasses → status, Content-Type e corpo corretos;
//   - violação de unicidade no banco (pg 23505 e Prisma P2002) → 409;
//   - não encontrado na camada de dados (Prisma P2025, pg P0002) → 404;
//   - rota inexistente → 404 Problem Details;
//   - erro não mapeado → 500 sem vazar detalhes internos;
//   - `instance` e `timestamp` presentes e com formato estável;
//   - `type` é URI estável e consistente entre execuções.
// ============================================================

import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { requestId } from "../../src/middlewares/requestId.js";
import { problemErrorHandler } from "../../src/middlewares/problemErrorHandler.js";
import { PROBLEM_TYPE_NAMESPACE } from "../../src/errors/problem.js";
import {
  BadRequestProblem,
  ConflictProblem,
  ForbiddenProblem,
  InternalServerErrorProblem,
  NotFoundProblem,
  TooManyRequestsProblem,
  UnauthorizedProblem,
  ValidationProblem,
} from "../../src/errors/problem.js";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface RespostaDeTeste {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

/** Assinatura comum de toda resposta de erro da API. */
function expectProblem(res: RespostaDeTeste, status: number, slug: string) {
  expect(res.status).toBe(status);
  expect(res.headers["content-type"]).toContain("application/problem+json");

  const body = res.body;
  expect(body["status"]).toBe(status);
  expect(body["type"]).toBe(`${PROBLEM_TYPE_NAMESPACE}/${slug}`);
  expect(typeof body["title"]).toBe("string");
  expect(String(body["title"]).length).toBeGreaterThan(0);
  expect(typeof body["detail"]).toBe("string");
  expect(String(body["detail"]).length).toBeGreaterThan(0);

  // Alias de compatibilidade com o frontend legado.
  expect(body["error"]).toBe(body["detail"]);

  expect(typeof body["instance"]).toBe("string");
  expect(String(body["instance"])).toMatch(UUID);
  expect(typeof body["timestamp"]).toBe("string");
  expect(new Date(String(body["timestamp"])).toISOString()).toBe(body["timestamp"]);
}

// ─────────────────────────────────────────────────────────
//   Harness: mini-app que monta rotas que lançam erros reais
//   contra o mesmo middleware de produção.
// ─────────────────────────────────────────────────────────
function appDeTeste() {
  const appMin = express();
  appMin.use(requestId());
  appMin.use(express.json());

  appMin.get("/erro-interno", () => {
    throw new Error("SEGREDO-INTERNO-DO-SERVIDOR-NAO-PODE-VAZAR");
  });

  appMin.get("/legado", () => {
    // eslint-disable-next-line no-throw-literal
    throw { status: 400, message: "Campo obrigatório ausente." };
  });

  appMin.get("/prisma/unico", () => {
    throw Object.assign(new Error("Unique constraint failed"), {
      name: "PrismaClientKnownRequestError",
      code: "P2002",
      meta: { target: ["email"] },
    });
  });

  appMin.get("/prisma/nao-encontrado", () => {
    throw Object.assign(new Error("Record not found"), {
      name: "PrismaClientKnownRequestError",
      code: "P2025",
      meta: {},
    });
  });

  appMin.get("/pg/nao-encontrado", () => {
    throw Object.assign(new Error("no data found"), { code: "P0002" });
  });

  // Violação de unicidade REAL disparada pelo banco de teste.
  appMin.get("/conflito-banco", async () => {
    await pool.query("INSERT INTO categorias (nome) VALUES ('Categoria Unica')");
    await pool.query("INSERT INTO categorias (nome) VALUES ('Categoria Unica')");
  });

  appMin.get("/programado/:tipo", (_req, _res) => {
    switch (_req.params.tipo) {
      case "bad-request":
        throw new BadRequestProblem("Campo X é obrigatório.");
      case "unauthorized":
        throw new UnauthorizedProblem("Token ausente.");
      case "forbidden":
        throw new ForbiddenProblem("Sem permissão.");
      case "not-found":
        throw new NotFoundProblem("Recurso não existe.");
      case "conflict":
        throw new ConflictProblem("Conflito de estado.");
      case "rate-limit":
        throw new TooManyRequestsProblem("Muitas requisições.");
      case "internal":
        throw new InternalServerErrorProblem("Falha interna simulada.");
      case "validation":
        throw new ValidationProblem(
          [{ field: "email", message: "Email inválido." }],
          { detail: "Payload inválido." },
        );
      default:
        throw new NotFoundProblem("Rota programada desconhecida.");
    }
  });

  appMin.use(problemErrorHandler);
  return appMin;
}

const appMini = appDeTeste();

describe("middleware Problem Details — HttpProblem e subclasses", () => {
  const casos: Array<{ tipo: string; status: number; slug: string }> = [
    { tipo: "bad-request", status: 400, slug: "bad-request" },
    { tipo: "unauthorized", status: 401, slug: "unauthorized" },
    { tipo: "forbidden", status: 403, slug: "forbidden" },
    { tipo: "not-found", status: 404, slug: "not-found" },
    { tipo: "conflict", status: 409, slug: "conflict" },
    { tipo: "rate-limit", status: 429, slug: "rate-limit" },
    { tipo: "internal", status: 500, slug: "internal-error" },
  ];

  it.each(casos)(
    "$tipo devolve $status com corpo e Content-Type corretos",
    async ({ tipo, status, slug }) => {
      const res = await request(appMini).get(`/programado/${tipo}`);
      expectProblem(res, status, slug);
    },
  );

  it("ValidationProblem mantém a extensão errors no corpo", async () => {
    const res = await request(appMini).get("/programado/validation");

    expectProblem(res, 422, "validation");
    expect(res.body["errors"]).toEqual([
      { field: "email", message: "Email inválido." },
    ]);
  });
});

describe("middleware Problem Details — tradução de erros de banco", () => {
  it("violação de unicidade do driver pg (23505) vira 409 Conflict", async () => {
    const res = await request(appMini).get("/conflito-banco");

    expectProblem(res, 409, "conflict");
  });

  it("violação de unicidade do Prisma (P2002) vira 409 Conflict", async () => {
    const res = await request(appMini).get("/prisma/unico");

    expectProblem(res, 409, "conflict");
  });

  it("não encontrado do Prisma (P2025) vira 404", async () => {
    const res = await request(appMini).get("/prisma/nao-encontrado");

    expectProblem(res, 404, "not-found");
  });

  it("não encontrado do pg (P0002) vira 404", async () => {
    const res = await request(appMini).get("/pg/nao-encontrado");

    expectProblem(res, 404, "not-found");
  });
});

describe("middleware Problem Details — rede de segurança", () => {
  it("erro não mapeado vira 500 sem vazar detalhes internos", async () => {
    const res = await request(appMini).get("/erro-interno");

    expectProblem(res, 500, "internal-error");
    expect(String(res.body["detail"])).not.toContain("SEGREDO-INTERNO");
  });

  it("objeto legado { status, message } vira Problem Details", async () => {
    const res = await request(appMini).get("/legado");

    expectProblem(res, 400, "bad-request");
    expect(res.body["detail"]).toBe("Campo obrigatório ausente.");
  });

  it("JSON malformado vira 400 sem ecoar o payload", async () => {
    const res = await request(appMini)
      .post("/programado/validation")
      .set("Content-Type", "application/json")
      .send('{ "campo": ');

    expectProblem(res, 400, "bad-request");
  });
});

describe("middleware Problem Details — estabilidade e correlção", () => {
  it("type é URI estável entre execuções; instance é único", async () => {
    const primeiro = await request(appMini).get("/programado/not-found");
    const segundo = await request(appMini).get("/programado/not-found");

    expect(primeiro.body["type"]).toBe(
      `${PROBLEM_TYPE_NAMESPACE}/not-found`,
    );
    expect(segundo.body["type"]).toBe(primeiro.body["type"]);
    expect(segundo.body["instance"]).not.toBe(primeiro.body["instance"]);
  });

  it("X-Request-Id é refletido no instance da resposta", async () => {
    const res = await request(appMini).get("/programado/not-found");

    expect(String(res.body["instance"]).toLowerCase()).toBe(
      String(res.headers["x-request-id"]).toLowerCase(),
    );
  });
});

describe("API real — respostas de erro em Problem Details", () => {
  it("rota inexistente devolve 404 Problem Details (not-found)", async () => {
    const res = await request(app).get("/rota-que-nao-existe");

    expectProblem(res, 404, "not-found");
    expect(String(res.body["detail"])).toContain("Rota não encontrada");
  });

  it("404 de negócio (categoria inexistente) segue o mesmo contrato", async () => {
    const res = await request(app).get("/api/categories/999999");

    expectProblem(res, 404, "not-found");
  });

  it("anônimo sem token devolve 401 Problem Details", async () => {
    const res = await request(app).get("/api/auth/me");

    expectProblem(res, 401, "unauthorized");
  });

  it("usuário sem papel privilegiado devolve 403 Problem Details", async () => {
    const cliente = await criarUsuario("client");
    const res = await request(app)
      .get("/api/auth/users")
      .set(...comToken(cliente.token));

    expectProblem(res, 403, "forbidden");
  });

  it("payload inválido devolve 400 Problem Details", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "A", email: "email-invalido", password: "12" });

    expectProblem(res, 400, "bad-request");
  });

  it("conflito de negócio (email duplicado) devolve 409 Problem Details", async () => {
    const email = `dup-${Date.now()}@exemplo.invalid`;
    const payload = { name: "Duplicado", email, password: "SenhaForte123" };

    await request(app).post("/api/auth/register").send(payload);
    const res = await request(app).post("/api/auth/register").send(payload);

    expectProblem(res, 409, "conflict");
  });

  it("violação de unicidade real no banco (id de design) devolve 409", async () => {
    const clienteA = await criarUsuario("client");
    const clienteB = await criarUsuario("client");
    const design = { id: "design-dup-integracao", name: "A", model: "M", color: "C" };

    await request(app)
      .post("/api/designs")
      .set(...comToken(clienteA.token))
      .send(design);

    const res = await request(app)
      .post("/api/designs")
      .set(...comToken(clienteB.token))
      .send(design);

    expectProblem(res, 409, "conflict");
  });
});