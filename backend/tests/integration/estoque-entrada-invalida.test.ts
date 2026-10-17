// ============================================================
//   BUG #81 — Quantidade nula ou vazia na atualização de estoque
//
//   O `z.coerce.number()` convertia `null` e `""` em 0, e um PUT
//   com entrada inválida zerava o estoque com 200. Cada caso abaixo
//   confere o 400 no contrato RFC 9457 e, principalmente, que o
//   estoque continua igual no banco.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarProdutoComEstoque, lerEstoque } from "../helpers/estoque.js";
import { esperarProblema } from "../helpers/problem.js";

const rota = (produtoId: number) => `/api/stock/product/${produtoId}`;

describe("PUT /api/stock/product/:produtoId — entrada inválida (BUG #81)", () => {
  describe("quantidade que não é um inteiro explícito responde 400 e não altera o estoque", () => {
    it.each([
      ["null", null],
      ["string vazia", ""],
      ["string só com espaços", "   "],
      ["texto não numérico", "abc"],
      ["booleano false", false],
      ["booleano true", true],
      ["array vazio", []],
      ["objeto", {}],
      ["decimal", 1.5],
      ["decimal em texto", "1.5"],
      ["notação científica em texto", "1e3"],
      ["negativo", -1],
      ["acima do limite do INTEGER", 2_147_483_648],
    ])("%s", async (_caso, quantidade) => {
      const staff = await criarUsuario("staff");
      const estoque = await criarProdutoComEstoque({ quantidade: 10, estoqueMinimo: 5 });

      const res = await request(app)
        .put(rota(estoque.produtoId))
        .set(...comToken(staff.token))
        .send({ quantidade, operacao: "set" });

      esperarProblema(res, 400, "bad-request");
      expect(res.body.invalidParams).toEqual([
        expect.objectContaining({ name: "quantidade" }),
      ]);
      expect(await lerEstoque(estoque.produtoId)).toEqual({ quantidade: 10, estoqueMinimo: 5 });
    });

    it("campo ausente", async () => {
      const staff = await criarUsuario("staff");
      const estoque = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await request(app)
        .put(rota(estoque.produtoId))
        .set(...comToken(staff.token))
        .send({ operacao: "set" });

      esperarProblema(res, 400, "bad-request");
      expect((await lerEstoque(estoque.produtoId)).quantidade).toBe(10);
    });
  });

  it("estoque_minimo nulo também é rejeitado, em vez de virar 0", async () => {
    const staff = await criarUsuario("staff");
    const estoque = await criarProdutoComEstoque({ quantidade: 10, estoqueMinimo: 5 });

    const res = await request(app)
      .put(rota(estoque.produtoId))
      .set(...comToken(staff.token))
      .send({ quantidade: 10, estoque_minimo: null });

    esperarProblema(res, 400, "bad-request");
    expect(res.body.invalidParams).toEqual([
      expect.objectContaining({ name: "estoque_minimo" }),
    ]);
    expect(await lerEstoque(estoque.produtoId)).toEqual({ quantidade: 10, estoqueMinimo: 5 });
  });

  describe("entradas válidas continuam funcionando", () => {
    it("0 explícito zera o estoque de propósito", async () => {
      const staff = await criarUsuario("staff");
      const estoque = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await request(app)
        .put(rota(estoque.produtoId))
        .set(...comToken(staff.token))
        .send({ quantidade: 0, operacao: "set" });

      expect(res.status).toBe(200);
      expect((await lerEstoque(estoque.produtoId)).quantidade).toBe(0);
    });

    it("número em texto, como envia um formulário, é aceito", async () => {
      const staff = await criarUsuario("staff");
      const estoque = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await request(app)
        .put(rota(estoque.produtoId))
        .set(...comToken(staff.token))
        .send({ quantidade: "7", operacao: "set" });

      expect(res.status).toBe(200);
      expect((await lerEstoque(estoque.produtoId)).quantidade).toBe(7);
    });

    it("estoque_minimo 0 explícito é aceito", async () => {
      const staff = await criarUsuario("staff");
      const estoque = await criarProdutoComEstoque({ quantidade: 10, estoqueMinimo: 5 });

      const res = await request(app)
        .put(rota(estoque.produtoId))
        .set(...comToken(staff.token))
        .send({ quantidade: 10, estoque_minimo: 0 });

      expect(res.status).toBe(200);
      expect(await lerEstoque(estoque.produtoId)).toEqual({ quantidade: 10, estoqueMinimo: 0 });
    });
  });

  describe("autorização da rota", () => {
    it("anônimo recebe 401", async () => {
      const estoque = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await request(app).put(rota(estoque.produtoId)).send({ quantidade: 0 });

      esperarProblema(res, 401, "unauthorized");
      expect((await lerEstoque(estoque.produtoId)).quantidade).toBe(10);
    });

    it("fábrica, que só consulta estoque, recebe 403", async () => {
      const fabrica = await criarUsuario("factory");
      const estoque = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await request(app)
        .put(rota(estoque.produtoId))
        .set(...comToken(fabrica.token))
        .send({ quantidade: 0 });

      esperarProblema(res, 403, "forbidden");
      expect((await lerEstoque(estoque.produtoId)).quantidade).toBe(10);
    });
  });
});
