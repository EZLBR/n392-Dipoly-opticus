import { describe, expect, it } from "vitest";
import {
  ConflictProblem,
  ForbiddenProblem,
  HttpProblem,
  NotFoundProblem,
  ValidationProblem,
} from "../../../src/errors/problem.js";

const violacoes = [
  { field: "nome", message: "Nome da categoria é obrigatório." },
  { field: "preco", message: "Preço deve ser um número positivo." },
];

const casos: Array<{
  nome: string;
  criar: () => HttpProblem;
  criarCom: (detail: string, instance?: string) => HttpProblem;
  type: string;
  title: string;
  status: number;
  extra: Record<string, unknown>;
}> = [
  {
    nome: "NotFoundProblem",
    criar: () => new NotFoundProblem(),
    criarCom: (detail, instance) => new NotFoundProblem(detail, { instance }),
    type: "https://opticus.example/problems/not-found",
    title: "Recurso não encontrado",
    status: 404,
    extra: {},
  },
  {
    nome: "ConflictProblem",
    criar: () => new ConflictProblem(),
    criarCom: (detail, instance) => new ConflictProblem(detail, { instance }),
    type: "https://opticus.example/problems/conflict",
    title: "Conflito com o estado atual do recurso",
    status: 409,
    extra: {},
  },
  {
    nome: "ForbiddenProblem",
    criar: () => new ForbiddenProblem(),
    criarCom: (detail, instance) => new ForbiddenProblem(detail, { instance }),
    type: "https://opticus.example/problems/forbidden",
    title: "Acesso não autorizado ao recurso",
    status: 403,
    extra: {},
  },
  {
    nome: "ValidationProblem",
    criar: () => new ValidationProblem([]),
    criarCom: (detail, instance) => new ValidationProblem([], { detail, instance }),
    type: "https://opticus.example/problems/validation",
    title: "Erro de validação",
    status: 422,
    extra: { errors: [] },
  },
];

describe("HttpProblem — hierarquia base", () => {
  it.each(casos)(
    "$nome expõe type, title e status fixos",
    ({ criar, type, title, status }) => {
      const problema = criar();

      expect(problema.type).toBe(type);
      expect(problema.title).toBe(title);
      expect(problema.status).toBe(status);
    },
  );

  it.each(casos)("$nome é instanceof HttpProblem e Error", ({ criar }) => {
    const problema = criar();

    expect(problema).toBeInstanceOf(HttpProblem);
    expect(problema).toBeInstanceOf(Error);
    expect(problema.name).toBe(problema.constructor.name);
    expect(problema.stack).toBeTruthy();
  });

  it.each(casos)(
    "$nome sem detail serializa apenas type, title e status",
    ({ criar, type, title, status, extra }) => {
      const json = criar().toJSON();

      expect(json).toEqual({ type, title, status, ...extra });
      expect("detail" in json).toBe(false);
      expect("instance" in json).toBe(false);
    },
  );

  it.each(casos)(
    "$nome com detail e instance os inclui na serialização",
    ({ criarCom, type, title, status, extra }) => {
      const json = criarCom("Produto 42 não existe.", "/orders/01J").toJSON();

      expect(json).toEqual({
        type,
        title,
        status,
        ...extra,
        detail: "Produto 42 não existe.",
        instance: "/orders/01J",
      });
    },
  );

  it.each(casos)(
    "$nome serializa de forma idêntica via JSON.stringify",
    ({ criarCom }) => {
      const problema = criarCom("detalhe do contexto.", "/products/7");

      expect(JSON.parse(JSON.stringify(problema))).toEqual(problema.toJSON());
    },
  );

  it.each(casos)(
    "$nome reflete o detail informado no message do Error",
    ({ criarCom }) => {
      const detail = "Mensagem específica do contexto de uso.";
      const problema = criarCom(detail, "/orders/01J");

      expect(problema.message).toBe(detail);
      expect(problema.detail).toBe(detail);
      expect(problema.instance).toBe("/orders/01J");
    },
  );
});

describe("ValidationProblem — violações de campo", () => {
  it("serializa a lista de erros junto do corpo do problema", () => {
    const problema = new ValidationProblem(violacoes);
    const json = problema.toJSON();

    expect(json.status).toBe(422);
    expect(json.errors).toEqual(violacoes);
  });

  it("inclui errors também no JSON.stringify", () => {
    const problema = new ValidationProblem(violacoes);

    const serializado = JSON.parse(JSON.stringify(problema));

    expect(serializado.errors).toEqual(violacoes);
    expect(serializado.type).toBe(
      "https://opticus.example/problems/validation",
    );
  });

  it("aceita detail e instance customizados além das violações", () => {
    const problema = new ValidationProblem(violacoes, {
      detail: "Payload com campos inválidos.",
      instance: "/products",
    });

    expect(problema.toJSON()).toEqual({
      type: "https://opticus.example/problems/validation",
      title: "Erro de validação",
      status: 422,
      detail: "Payload com campos inválidos.",
      instance: "/products",
      errors: violacoes,
    });
    expect(problema.message).toBe("Payload com campos inválidos.");
  });

  it("mantém detail ausente quando nenhum é informado", () => {
    const problema = new ValidationProblem(violacoes);
    const json = problema.toJSON();

    expect("detail" in json).toBe(false);
    expect(problema.message).toBe("Erro inesperado.");
  });

  it("é instanceof HttpProblem e Error", () => {
    const problema = new ValidationProblem(violacoes);

    expect(problema).toBeInstanceOf(HttpProblem);
    expect(problema).toBeInstanceOf(Error);
    expect(problema).toBeInstanceOf(ValidationProblem);
  });
});
