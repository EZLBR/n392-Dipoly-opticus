import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import { z, ZodError } from "zod";
import {
  validateBody,
  validateQuery,
  validateParams,
  validateRequest,
} from "../../../src/middlewares/validate.js";
import {
  paraProblema,
  problemErrorHandler,
} from "../../../src/middlewares/problemErrorHandler.js";
import {
  BadRequestProblem,
  PROBLEM_TYPE_NAMESPACE,
} from "../../../src/errors/problem.js";
import { registerSchema } from "../../../src/dtos/auth/register.dto.js";

describe("ZodError -> RFC 9457 400 Bad Request com invalidParams", () => {
  it("paraProblema traduz ZodError para BadRequestProblem com invalidParams formatado", () => {
    const testSchema = z.object({
      email: z.string().email("Email inválido."),
      age: z.number().min(18, "Idade mínima é 18 anos."),
      address: z.object({
        street: z.string().min(1, "Rua é obrigatória."),
      }),
    });

    let zodErr: ZodError | null = null;
    try {
      testSchema.parse({
        email: "not-an-email",
        age: 15,
        address: { street: "" },
      });
    } catch (e) {
      zodErr = e as ZodError;
    }

    expect(zodErr).toBeInstanceOf(ZodError);

    const problem = paraProblema(zodErr);
    expect(problem).toBeInstanceOf(BadRequestProblem);
    expect(problem?.status).toBe(400);
    expect(problem?.type).toBe(`${PROBLEM_TYPE_NAMESPACE}/bad-request`);
    expect(problem?.title).toBe("Requisição inválida");

    const json = problem?.toJSON();
    expect(json?.status).toBe(400);
    expect(json?.invalidParams).toBeDefined();
    expect(json?.invalidParams).toHaveLength(3);

    // Verifica o formato exato { name, reason } de cada item
    expect(json?.invalidParams).toEqual([
      { name: "email", reason: "Email inválido." },
      { name: "age", reason: "Idade mínima é 18 anos." },
      { name: "address.street", reason: "Rua é obrigatória." },
    ]);
  });

  it("formata caminhos de array indexados no campo name (ex: items.0.qty)", () => {
    const cartSchema = z.object({
      items: z.array(
        z.object({
          qty: z.number().positive("Quantidade deve ser positiva."),
        }),
      ),
    });

    let zodErr: ZodError | null = null;
    try {
      cartSchema.parse({ items: [{ qty: -1 }] });
    } catch (e) {
      zodErr = e as ZodError;
    }

    const problem = paraProblema(zodErr) as BadRequestProblem;
    expect(problem?.invalidParams).toEqual([
      { name: "items.0.qty", reason: "Quantidade deve ser positiva." },
    ]);
  });
});

describe("Middlewares de validação com problemErrorHandler (Express pipeline)", () => {
  function createTestApp() {
    const app = express();
    app.use(express.json());
    return app;
  }

  it("validateBody devolve 400 com Content-Type application/problem+json e array invalidParams", async () => {
    const app = createTestApp();

    app.post("/test-register", validateBody(registerSchema), (_req, res) => {
      res.json({ success: true });
    });

    app.use(problemErrorHandler);

    const res = await request(app).post("/test-register").send({
      name: "",
      email: "email-invalido",
      password: "123",
    });

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");

    expect(res.body).toMatchObject({
      status: 400,
      type: `${PROBLEM_TYPE_NAMESPACE}/bad-request`,
      title: "Requisição inválida",
      detail: "Dados da requisição inválidos.",
    });

    // Critério de aceite: Teste verifica o formato de invalidParams
    expect(Array.isArray(res.body.invalidParams)).toBe(true);
    expect(res.body.invalidParams.length).toBeGreaterThan(0);

    for (const param of res.body.invalidParams) {
      expect(typeof param.name).toBe("string");
      expect(param.name.length).toBeGreaterThan(0);
      expect(typeof param.reason).toBe("string");
      expect(param.reason.length).toBeGreaterThan(0);
    }

    const paramNames = res.body.invalidParams.map((p: { name: string }) => p.name);
    expect(paramNames).toContain("name");
    expect(paramNames).toContain("email");
    expect(paramNames).toContain("password");
  });

  it("validateBody permite avanço quando os dados atendem ao schema e aplica sanitização", async () => {
    const app = createTestApp();

    app.post("/test-register", validateBody(registerSchema), (req, res) => {
      res.json({ success: true, received: req.body });
    });

    app.use(problemErrorHandler);

    const res = await request(app).post("/test-register").send({
      name: "  Maria Silva  ",
      email: "  MARIA@example.com  ",
      password: "SenhaForte123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Sanitização e normalização aplicadas pelo schema Zod
    expect(res.body.received.name).toBe("Maria Silva");
    expect(res.body.received.email).toBe("maria@example.com");
  });

  it("validateQuery valida parâmetros da querystring e devolve 400 com invalidParams em caso de erro", async () => {
    const app = createTestApp();

    const querySchema = z.object({
      page: z.coerce.number().positive("Page deve ser positiva."),
      limit: z.coerce.number().max(50, "Limit máximo é 50."),
    });

    app.get("/test-query", validateQuery(querySchema), (req, res) => {
      res.json({ success: true, query: req.query });
    });

    app.use(problemErrorHandler);

    const res = await request(app).get("/test-query?page=-5&limit=100");

    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body.invalidParams).toEqual([
      { name: "page", reason: "Page deve ser positiva." },
      { name: "limit", reason: "Limit máximo é 50." },
    ]);
  });

  it("validateParams valida parâmetros de rota", async () => {
    const app = createTestApp();

    const paramsSchema = z.object({
      id: z.coerce
        .number({ message: "ID deve ser um número." })
        .int("ID deve ser um número inteiro.")
        .positive("ID deve ser um número inteiro positivo."),
    });

    app.get("/test-params/:id", validateParams(paramsSchema), (req, res) => {
      res.json({ success: true, params: req.params });
    });

    app.use(problemErrorHandler);

    const res = await request(app).get("/test-params/-5");

    expect(res.status).toBe(400);
    expect(res.body.invalidParams).toEqual([
      { name: "id", reason: "ID deve ser um número inteiro positivo." },
    ]);
  });

  it("validateRequest valida body, query e params simultaneamente", async () => {
    const app = createTestApp();

    app.post(
      "/test-composite/:id",
      validateRequest({
        params: z.object({ id: z.coerce.number() }),
        body: z.object({ title: z.string().min(1, "Título obrigatório.") }),
      }),
      (_req, res) => {
        res.json({ success: true });
      },
    );

    app.use(problemErrorHandler);

    const res = await request(app).post("/test-composite/not-a-number").send({
      title: "",
    });

    expect(res.status).toBe(400);
    expect(res.body.invalidParams.length).toBe(2);
    const names = res.body.invalidParams.map((p: { name: string }) => p.name);
    expect(names).toContain("id");
    expect(names).toContain("title");
  });
});

describe("Schemas de entrada por rota e validação de invalidParams", () => {
  function createTestApp() {
    const app = express();
    app.use(express.json());
    return app;
  }

  it("loginSchema: rejeita email inválido e senha vazia", async () => {
    const { loginSchema } = await import("../../../src/dtos/auth/login.dto.js");
    const app = createTestApp();
    app.post("/login", validateBody(loginSchema), (_req, res) => res.json({ ok: true }));
    app.use(problemErrorHandler);

    const res = await request(app).post("/login").send({
      email: "invalido",
      password: "",
    });

    expect(res.status).toBe(400);
    expect(res.body.invalidParams).toEqual([
      { name: "email", reason: "Formato de email inválido." },
      { name: "password", reason: "Senha é obrigatória." },
    ]);
  });

  it("createCategorySchema: rejeita nome vazio", async () => {
    const { createCategorySchema } = await import("../../../src/dtos/category/category.dto.js");
    const app = createTestApp();
    app.post("/categories", validateBody(createCategorySchema), (_req, res) => res.json({ ok: true }));
    app.use(problemErrorHandler);

    const res = await request(app).post("/categories").send({
      nome: "   ",
      descricao: "Teste",
    });

    expect(res.status).toBe(400);
    expect(res.body.invalidParams).toEqual([
      { name: "nome", reason: "Nome da categoria é obrigatório." },
    ]);
  });

  it("createProductSchema: rejeita preço não positivo e campos obrigatórios ausentes", async () => {
    const { createProductSchema } = await import("../../../src/dtos/product/product.dto.js");
    const app = createTestApp();
    app.post("/products", validateBody(createProductSchema), (_req, res) => res.json({ ok: true }));
    app.use(problemErrorHandler);

    const res = await request(app).post("/products").send({
      nome: "",
      preco: -10,
    });

    expect(res.status).toBe(400);
    const names = res.body.invalidParams.map((p: { name: string }) => p.name);
    expect(names).toContain("nome");
    expect(names).toContain("preco");
  });

  it("checkoutCartSchema: rejeita array vazio", async () => {
    const { checkoutCartSchema } = await import("../../../src/dtos/order/order.dto.js");
    const app = createTestApp();
    app.post("/checkout-cart", validateBody(checkoutCartSchema), (_req, res) => res.json({ ok: true }));
    app.use(problemErrorHandler);

    const res = await request(app).post("/checkout-cart").send({
      cartItems: [],
    });

    expect(res.status).toBe(400);
    expect(res.body.invalidParams).toEqual([
      { name: "cartItems", reason: "Forneça um array cartItems não vazio." },
    ]);
  });

  it("updateStockSchema: rejeita operacao inválida", async () => {
    const { updateStockSchema } = await import("../../../src/dtos/stock/stock.dto.js");
    const app = createTestApp();
    app.put("/stock", validateBody(updateStockSchema), (_req, res) => res.json({ ok: true }));
    app.use(problemErrorHandler);

    const res = await request(app).put("/stock").send({
      quantidade: 10,
      operacao: "multiplica",
    });

    expect(res.status).toBe(400);
    expect(res.body.invalidParams).toEqual([
      { name: "operacao", reason: "Operação inválida. Use: set, add ou subtract." },
    ]);
  });

  it("createBillingSchema: rejeita orderId ausente", async () => {
    const { createBillingSchema } = await import("../../../src/dtos/payment/payment.dto.js");
    const app = createTestApp();
    app.post("/billing", validateBody(createBillingSchema), (_req, res) => res.json({ ok: true }));
    app.use(problemErrorHandler);

    const res = await request(app).post("/billing").send({});

    expect(res.status).toBe(400);
    expect(res.body.invalidParams).toEqual([
      { name: "orderId", reason: "Informe o orderId." },
    ]);
  });

  it("createBillingSchema: aceita string não numérica para permitir validação de regressão no banco", async () => {
    const { createBillingSchema } = await import("../../../src/dtos/payment/payment.dto.js");
    const app = createTestApp();
    app.post("/billing", validateBody(createBillingSchema), (req, res) => {
      res.json({ ok: true, orderId: req.body.orderId });
    });
    app.use(problemErrorHandler);

    const res = await request(app).post("/billing").send({ orderId: "nao-numerico" });

    expect(res.status).toBe(200);
    expect(res.body.orderId).toBe("nao-numerico");
  });

  it("validateQuery: não lança TypeError no Express 5 (req.query com getter nativo)", async () => {
    const { getUsersQuerySchema } = await import("../../../src/dtos/auth/paginated-users.dto.js");
    const app = createTestApp();
    app.get("/users", validateQuery(getUsersQuerySchema), (req, res) => {
      res.json({ ok: true, query: req.query });
    });
    app.use(problemErrorHandler);

    const res = await request(app).get("/users");
    expect(res.status).toBe(200);
    expect(res.body.query).toMatchObject({ page: 1, limit: 20 });
  });
});
