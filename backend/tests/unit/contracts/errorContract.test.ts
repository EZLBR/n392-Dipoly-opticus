import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { requestId } from "../../../src/middlewares/requestId.js";
import { problemErrorHandler } from "../../../src/middlewares/problemErrorHandler.js";
import { validateBody } from "../../../src/middlewares/validate.js";
import {
  BadRequestProblem,
  ConflictProblem,
  ForbiddenProblem,
  NotFoundProblem,
  TooManyRequestsProblem,
  UnauthorizedProblem,
  ValidationProblem,
  ServiceUnavailableProblem,
} from "../../../src/errors/problem.js";

function createContractTestApp() {
  const app = express();
  app.use(requestId());
  app.use(express.json());

  app.get("/error/400", () => {
    throw new BadRequestProblem("Requisição malformada.");
  });

  app.get("/error/401", () => {
    throw new UnauthorizedProblem("Token ausente ou expirado.");
  });

  app.get("/error/403", () => {
    throw new ForbiddenProblem("Permissão insuficiente.");
  });

  app.get("/error/404", () => {
    throw new NotFoundProblem("Recurso não encontrado.");
  });

  app.get("/error/409", () => {
    throw new ConflictProblem("Conflito com o recurso existente.");
  });

  app.get("/error/422", () => {
    throw new ValidationProblem(
      [
        { field: "email", message: "Formato de e-mail inválido." },
        { field: "idade", message: "Idade deve ser maior que 18." },
      ],
      { detail: "Erro nos dados enviados." }
    );
  });

  app.get("/error/429", () => {
    throw new TooManyRequestsProblem("Limite de requisições atingido.");
  });

  app.get("/error/503", () => {
    throw new ServiceUnavailableProblem("Gateway indisponível.");
  });

  app.get("/error/500-unhandled", () => {
    throw new Error("Falha interna de banco de dados com stack trace crítico!");
  });

  const schema = z.object({
    nome: z.string().min(3, "Nome deve ter pelo menos 3 caracteres."),
    preco: z.number().positive("Preço deve ser positivo."),
  });

  app.post("/error/zod-validation", validateBody(schema), (_req, res) => {
    res.json({ ok: true });
  });

  app.use(problemErrorHandler);
  return app;
}

const app = createContractTestApp();

describe("TEST-04: Contrato de Erro RFC 9457 (Problem Details)", () => {
  const statusCodes = [
    { path: "/error/400", expectedStatus: 400 },
    { path: "/error/401", expectedStatus: 401 },
    { path: "/error/403", expectedStatus: 403 },
    { path: "/error/404", expectedStatus: 404 },
    { path: "/error/409", expectedStatus: 409 },
    { path: "/error/422", expectedStatus: 422 },
    { path: "/error/429", expectedStatus: 429 },
    { path: "/error/503", expectedStatus: 503 },
    { path: "/error/500-unhandled", expectedStatus: 500 },
  ];

  describe("Critério 1: Content-Type application/problem+json em todas as respostas de erro", () => {
    it.each(statusCodes)(
      "retorna Content-Type application/problem+json para $expectedStatus ($path)",
      async ({ path, expectedStatus }) => {
        const res = await request(app).get(path);
        expect(res.status).toBe(expectedStatus);
        expect(res.headers["content-type"]).toContain("application/problem+json");
      }
    );
  });

  describe("Critério 2: Presença obrigatória de type, title, status, instance e timestamp", () => {
    it.each(statusCodes)(
      "contém type, title, status, instance e timestamp para $expectedStatus ($path)",
      async ({ path, expectedStatus }) => {
        const res = await request(app).get(path);
        const body = res.body;

        expect(body).toHaveProperty("type");
        expect(typeof body.type).toBe("string");
        expect(body.type.length).toBeGreaterThan(0);

        expect(body).toHaveProperty("title");
        expect(typeof body.title).toBe("string");
        expect(body.title.length).toBeGreaterThan(0);

        expect(body).toHaveProperty("status");
        expect(body.status).toBe(expectedStatus);

        expect(body).toHaveProperty("instance");
        expect(typeof body.instance).toBe("string");
        expect(body.instance.length).toBeGreaterThan(0);

        expect(body).toHaveProperty("timestamp");
        expect(typeof body.timestamp).toBe("string");
        expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
      }
    );
  });

  describe("Critério 3: Erros de validação (400 e 422) incluem o campo invalidParams", () => {
    it("inclui invalidParams em erro 400 originado de validação Zod", async () => {
      const res = await request(app)
        .post("/error/zod-validation")
        .send({ nome: "Oi", preco: -10 });

      expect(res.status).toBe(400);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      expect(res.body).toHaveProperty("invalidParams");
      expect(Array.isArray(res.body.invalidParams)).toBe(true);
      expect(res.body.invalidParams).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "nome" }),
          expect.objectContaining({ name: "preco" }),
        ])
      );
    });

    it("inclui invalidParams em erro 422 originado de ValidationProblem", async () => {
      const res = await request(app).get("/error/422");

      expect(res.status).toBe(422);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      expect(res.body).toHaveProperty("invalidParams");
      expect(Array.isArray(res.body.invalidParams)).toBe(true);
      expect(res.body.invalidParams).toEqual([
        { name: "email", reason: "Formato de e-mail inválido." },
        { name: "idade", reason: "Idade deve ser maior que 18." },
      ]);
    });
  });

  describe("Critério 4: Respostas de erro interno (500) contêm traceId e NÃO expõem stack", () => {
    it("retorna 500 com traceId, sem stack e sem vazar detalhe interno", async () => {
      const res = await request(app).get("/error/500-unhandled");

      expect(res.status).toBe(500);
      expect(res.headers["content-type"]).toContain("application/problem+json");

      // Deve conter traceId
      expect(res.body).toHaveProperty("traceId");
      expect(typeof res.body.traceId).toBe("string");
      expect(res.body.traceId.length).toBeGreaterThan(0);

      // NÃO deve expor stack
      expect(res.body).not.toHaveProperty("stack");
      expect(JSON.stringify(res.body)).not.toContain("stack");

      // NÃO deve vazar a mensagem de erro interna/sensível
      expect(res.body.detail).not.toContain("Falha interna de banco de dados");
      expect(res.body.detail).toBe("Ocorreu um erro interno no servidor.");
    });
  });

  describe("Critério 5: O campo status no corpo é estritamente igual ao status HTTP da resposta", () => {
    it.each(statusCodes)(
      "body.status === res.status para rota $path ($expectedStatus)",
      async ({ path, expectedStatus }) => {
        const res = await request(app).get(path);
        expect(res.body.status).toStrictEqual(res.status);
        expect(res.body.status).toBe(expectedStatus);
      }
    );
  });
});
