// ============================================================
//   CONC-01 — Baixa de estoque atômica
//
//   As requisições concorrentes saem juntas, sem await entre elas,
//   e o PostgreSQL de teste as processa em conexões diferentes do
//   pool. Com o código antigo (SELECT, cálculo em JavaScript e
//   UPDATE com valor absoluto), as baixas se perdem.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { criarProdutoComEstoque, lerEstoque } from "../helpers/estoque.js";
import { esperarProblema } from "../helpers/problem.js";
import { LIMITE_QUANTIDADE_ESTOQUE } from "../../src/dtos/stock/stock.dto.js";

type Operacao = "set" | "add" | "subtract";

function atualizar(
  staff: UsuarioDeTeste,
  produtoId: number,
  corpo: { quantidade: number; operacao?: Operacao; estoque_minimo?: number },
) {
  return request(app)
    .put(`/api/stock/product/${produtoId}`)
    .set(...comToken(staff.token))
    .send(corpo);
}

const contar = (statuses: number[], status: number) => statuses.filter((s) => s === status).length;

describe("PUT /api/stock/product/:produtoId — escrita atômica (CONC-01)", () => {
  describe("concorrência", () => {
    // O cenário do backlog é um par de baixas de 5 sobre 10. Um par isolado
    // raramente cai na janela da corrida: com o código antigo, ele passava.
    // Dez pares simultâneos, cada um no seu produto, reproduzem o defeito.
    it("baixas simultâneas de 5 + 5 sobre estoques de 10 terminam em 0, não em 5", async () => {
      const staff = await criarUsuario("staff");
      const produtos = await Promise.all(
        Array.from({ length: 10 }, () => criarProdutoComEstoque({ quantidade: 10 })),
      );

      const respostas = await Promise.all(
        produtos.flatMap(({ produtoId }) => [
          atualizar(staff, produtoId, { quantidade: 5, operacao: "subtract" }),
          atualizar(staff, produtoId, { quantidade: 5, operacao: "subtract" }),
        ]),
      );

      expect(respostas.every((r) => r.status === 200)).toBe(true);
      const finais = await Promise.all(produtos.map(({ produtoId }) => lerEstoque(produtoId)));
      expect(finais.map((e) => e.quantidade)).toEqual(Array(10).fill(0));
    });

    it("20 baixas simultâneas de 1 sobre 10: exatamente 10 passam, 10 recebem 409 e o estoque não fica negativo", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10 });

      const respostas = await Promise.all(
        Array.from({ length: 20 }, () => atualizar(staff, produtoId, { quantidade: 1, operacao: "subtract" })),
      );
      const statuses = respostas.map((r) => r.status);

      expect(contar(statuses, 200)).toBe(10);
      expect(contar(statuses, 409)).toBe(10);
      for (const recusada of respostas.filter((r) => r.status === 409)) {
        esperarProblema(recusada, 409, "conflict");
      }
      expect((await lerEstoque(produtoId)).quantidade).toBe(0);
    });

    // TEST-05: entradas e baixas chegando juntas, como no dia a dia. Com 20
    // de partida, nem a pior ordem (todas as baixas primeiro) zera abaixo de
    // 0, então o resultado é determinístico: 20 + 10 × 3 − 10 × 2 = 30.
    it("10 entradas de 3 e 10 baixas de 2 simultâneas sobre 20 terminam em 30", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 20 });

      const operacoes = Array.from({ length: 20 }, (_, i) =>
        i % 2 === 0
          ? atualizar(staff, produtoId, { quantidade: 3, operacao: "add" })
          : atualizar(staff, produtoId, { quantidade: 2, operacao: "subtract" }),
      );
      const respostas = await Promise.all(operacoes);

      expect(respostas.map((r) => r.status)).toEqual(Array(20).fill(200));
      expect((await lerEstoque(produtoId)).quantidade).toBe(30);
    });

    it("20 entradas simultâneas de 1 sobre 10 terminam em 30: nenhuma se perde", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10 });

      const respostas = await Promise.all(
        Array.from({ length: 20 }, () => atualizar(staff, produtoId, { quantidade: 1, operacao: "add" })),
      );

      expect(respostas.every((r) => r.status === 200)).toBe(true);
      expect((await lerEstoque(produtoId)).quantidade).toBe(30);
    });
  });

  describe("as operações continuam funcionando", () => {
    it("set define o valor absoluto", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await atualizar(staff, produtoId, { quantidade: 42, operacao: "set" });

      expect(res.status).toBe(200);
      expect(res.body.estoque).toMatchObject({ produto_id: produtoId, quantidade: 42 });
      expect(typeof res.body.estoque.produto_nome).toBe("string");
      expect((await lerEstoque(produtoId)).quantidade).toBe(42);
    });

    it("sem operacao, o padrão continua sendo set", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await atualizar(staff, produtoId, { quantidade: 3 });

      expect(res.status).toBe(200);
      expect((await lerEstoque(produtoId)).quantidade).toBe(3);
    });

    it("add soma à quantidade atual", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await atualizar(staff, produtoId, { quantidade: 7, operacao: "add" });

      expect(res.status).toBe(200);
      expect(res.body.estoque.quantidade).toBe(17);
      expect((await lerEstoque(produtoId)).quantidade).toBe(17);
    });

    it("subtract do total disponível zera o estoque e sinaliza o alerta", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10, estoqueMinimo: 5 });

      const res = await atualizar(staff, produtoId, { quantidade: 10, operacao: "subtract" });

      expect(res.status).toBe(200);
      expect(res.body.estoque.quantidade).toBe(0);
      expect(res.body.alerta).toBe(true);
    });

    it("estoque_minimo é atualizado quando enviado e preservado quando omitido", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10, estoqueMinimo: 5 });

      await atualizar(staff, produtoId, { quantidade: 1, operacao: "add", estoque_minimo: 8 });
      expect(await lerEstoque(produtoId)).toEqual({ quantidade: 11, estoqueMinimo: 8 });

      await atualizar(staff, produtoId, { quantidade: 1, operacao: "subtract" });
      expect(await lerEstoque(produtoId)).toEqual({ quantidade: 10, estoqueMinimo: 8 });
    });
  });

  describe("guardas", () => {
    it("baixa acima do disponível responde 409, não 400, e não altera o estoque", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 3, estoqueMinimo: 5 });

      const res = await atualizar(staff, produtoId, { quantidade: 4, operacao: "subtract", estoque_minimo: 1 });

      esperarProblema(res, 409, "conflict");
      expect(res.body.detail).toContain("Disponível: 3");
      // A guarda barra a linha inteira: nem o estoque_minimo enviado é gravado.
      expect(await lerEstoque(produtoId)).toEqual({ quantidade: 3, estoqueMinimo: 5 });
    });

    it("entrada que estouraria o INTEGER responde 409 e não altera o estoque", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await atualizar(staff, produtoId, {
        quantidade: LIMITE_QUANTIDADE_ESTOQUE - 5,
        operacao: "add",
      });

      esperarProblema(res, 409, "conflict");
      expect((await lerEstoque(produtoId)).quantidade).toBe(10);
    });

    it("entrada que chega exatamente ao limite é aceita", async () => {
      const staff = await criarUsuario("staff");
      const { produtoId } = await criarProdutoComEstoque({ quantidade: 10 });

      const res = await atualizar(staff, produtoId, {
        quantidade: LIMITE_QUANTIDADE_ESTOQUE - 10,
        operacao: "add",
      });

      expect(res.status).toBe(200);
      expect((await lerEstoque(produtoId)).quantidade).toBe(LIMITE_QUANTIDADE_ESTOQUE);
    });

    it.each(["set", "add", "subtract"] as const)("%s em produto sem estoque responde 404", async (operacao) => {
      const staff = await criarUsuario("staff");

      const res = await atualizar(staff, 999_999, { quantidade: 1, operacao });

      esperarProblema(res, 404, "not-found");
    });
  });
});
