// ============================================================
//   DB-03 — Estoque: contrato da API
//
//   Falam com a API, não com a implementação. Passavam iguais com
//   o controller em SQL puro: são a prova de que a migração para o
//   Prisma não mudou nada para quem consome. A concorrência da
//   baixa está em estoque-concorrencia.test.ts, e a entrada
//   inválida em estoque-entrada-invalida.test.ts.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { esperarProblema } from "../helpers/problem.js";

const rotaProduto = (publicId: string) => `/api/stock/product/${publicId}`;
const INEXISTENTE = "00000000-0000-4000-8000-000000000000";

async function criarItem(opcoes: {
  nome: string;
  quantidade: number;
  estoqueMinimo?: number | null;
  preco?: string;
  ativo?: boolean;
  categoria?: string;
}) {
  const categoria = opcoes.categoria
    ? await prisma.categoria.create({ data: { nome: opcoes.categoria }, select: { id: true } })
    : null;
  return prisma.produto.create({
    data: {
      nome: opcoes.nome,
      preco: opcoes.preco ?? "199.90",
      ativo: opcoes.ativo ?? true,
      categoriaId: categoria?.id ?? null,
      estoque: {
        create: {
          quantidade: opcoes.quantidade,
          estoqueMinimo: opcoes.estoqueMinimo === undefined ? 5 : opcoes.estoqueMinimo,
        },
      },
    },
    select: { id: true, publicId: true, estoque: { select: { publicId: true, version: true } } },
  });
}

const nomes = (lista: Array<{ produto_nome: string }>) => lista.map(item => item.produto_nome);

describe("estoque — contrato da API (DB-03)", () => {
  describe("autorização das leituras", () => {
    it.each(["/api/stock", "/api/stock/alerts", rotaProduto(INEXISTENTE)])("%s: anônimo 401 e cliente 403", async (rota) => {
      const cliente = await criarUsuario("client");

      esperarProblema(await request(app).get(rota), 401, "unauthorized");
      esperarProblema(await request(app).get(rota).set(...comToken(cliente.token)), 403, "forbidden");
    });

    it.each(["factory", "staff"] as const)("%s lê o estoque", async (papel) => {
      const usuario = await criarUsuario(papel);
      const item = await criarItem({ nome: "Visível", quantidade: 8 });
      const auth = comToken(usuario.token);

      expect((await request(app).get("/api/stock").set(...auth)).status).toBe(200);
      expect((await request(app).get("/api/stock/alerts").set(...auth)).status).toBe(200);
      expect((await request(app).get(rotaProduto(item.publicId)).set(...auth)).status).toBe(200);
    });
  });

  describe("GET /api/stock", () => {
    it("lista só produtos ativos, do menor estoque para o maior, com os campos públicos", async () => {
      const staff = await criarUsuario("staff");
      const cheio = await criarItem({ nome: "Cheio", quantidade: 50, categoria: "Sol", preco: "450.00" });
      await criarItem({ nome: "Crítico", quantidade: 2 });
      await criarItem({ nome: "No limite", quantidade: 5 });
      await criarItem({ nome: "Inativo", quantidade: 0, ativo: false });

      const res = await request(app).get("/api/stock").set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["alertas", "estoque", "pagination", "produtos_criticos"]);
      expect(nomes(res.body.estoque)).toEqual(["Crítico", "No limite", "Cheio"]);
      expect(Object.keys(res.body.estoque[2]).sort()).toEqual([
        "alerta_baixo_estoque", "atualizado_em", "categoria_nome", "estoque_minimo", "produtoPublicId",
        "produto_nome", "produto_preco", "publicId", "quantidade",
      ]);
      expect(res.body.estoque[2]).toMatchObject({
        publicId: cheio.estoque?.publicId, produtoPublicId: cheio.publicId, produto_nome: "Cheio",
        produto_preco: "450.00", categoria_nome: "Sol", quantidade: 50, estoque_minimo: 5, alerta_baixo_estoque: false,
      });
      expect(res.body.estoque[0]).toMatchObject({ categoria_nome: null, alerta_baixo_estoque: true });
      expect(res.body.estoque[1].alerta_baixo_estoque).toBe(true);
      expect(res.body.alertas).toBe(2);
      expect(res.body.produtos_criticos).toEqual(["Crítico", "No limite"]);
      expect(res.body.pagination).toEqual({ page: 1, limit: 20, totalItems: 3, totalPages: 1 });
    });

    it("sem estoque mínimo definido, o alerta da linha é null e não conta como crítico", async () => {
      const staff = await criarUsuario("staff");
      await criarItem({ nome: "Sem mínimo", quantidade: 0, estoqueMinimo: null });

      const res = await request(app).get("/api/stock").set(...comToken(staff.token));

      expect(res.body.estoque[0]).toMatchObject({ estoque_minimo: null, alerta_baixo_estoque: null });
      expect(res.body.alertas).toBe(0);
      expect(res.body.produtos_criticos).toEqual([]);
    });

    it("pagina, e os críticos contados são os da página", async () => {
      const staff = await criarUsuario("staff");
      await criarItem({ nome: "A", quantidade: 1 });
      await criarItem({ nome: "B", quantidade: 2 });
      await criarItem({ nome: "C", quantidade: 30 });

      const res = await request(app).get("/api/stock").query({ page: 2, limit: 2 }).set(...comToken(staff.token));

      expect(nomes(res.body.estoque)).toEqual(["C"]);
      expect(res.body.alertas).toBe(0);
      expect(res.body.pagination).toEqual({ page: 2, limit: 2, totalItems: 3, totalPages: 2 });
    });

    it("limit acima do teto é reduzido a 100, e page inválida responde 400", async () => {
      const staff = await criarUsuario("staff");
      const auth = comToken(staff.token);

      const alto = await request(app).get("/api/stock").query({ limit: 1000 }).set(...auth);
      const invalida = await request(app).get("/api/stock").query({ page: "abc" }).set(...auth);

      expect(alto.body.pagination.limit).toBe(100);
      esperarProblema(invalida, 400, "bad-request");
    });

    it("página muito além do fim responde 200 e lista vazia", async () => {
      const staff = await criarUsuario("staff");
      await criarItem({ nome: "Único", quantidade: 9 });

      const res = await request(app).get("/api/stock").query({ page: 99_999_999_999, limit: 100 }).set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ estoque: [], alertas: 0, produtos_criticos: [] });
      expect(res.body.pagination.totalItems).toBe(1);
    });
  });

  describe("GET /api/stock/product/:produtoPublicId", () => {
    it("traz o item com preço e versão, inclusive de produto inativo", async () => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Fora de linha", quantidade: 12, ativo: false, preco: "99.50" });

      const res = await request(app).get(rotaProduto(item.publicId)).set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["alerta", "estoque"]);
      expect(Object.keys(res.body.estoque).sort()).toEqual([
        "atualizado_em", "estoque_minimo", "preco", "produtoPublicId", "produto_nome", "publicId", "quantidade", "version",
      ]);
      expect(res.body.estoque).toMatchObject({
        publicId: item.estoque?.publicId, produtoPublicId: item.publicId, produto_nome: "Fora de linha",
        quantidade: 12, estoque_minimo: 5, version: item.estoque?.version, preco: "99.50",
      });
      expect(res.body.alerta).toBe(false);
    });

    it.each([
      [5, 5, true],
      [6, 5, false],
      [0, null, true],
      [3, null, false],
    ])("quantidade %d com mínimo %s: alerta %s", async (quantidade, estoqueMinimo, alerta) => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Alerta", quantidade, estoqueMinimo });

      const res = await request(app).get(rotaProduto(item.publicId)).set(...comToken(staff.token));

      expect(res.body.alerta).toBe(alerta);
    });

    it("produto inexistente ou sem estoque responde 404", async () => {
      const staff = await criarUsuario("staff");
      const semEstoque = await prisma.produto.create({ data: { nome: "Sem estoque", preco: "1.00" }, select: { publicId: true } });

      for (const publicId of [INEXISTENTE, semEstoque.publicId]) {
        const res = await request(app).get(rotaProduto(publicId)).set(...comToken(staff.token));
        esperarProblema(res, 404, "not-found");
        expect(res.body.detail).toBe("Estoque não encontrado para esse produto.");
      }
    });
  });

  describe("PUT /api/stock/product/:produtoPublicId", () => {
    it("devolve o item atualizado, com a versão nova e a mensagem normal", async () => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Atualizado", quantidade: 10 });

      const res = await request(app).put(rotaProduto(item.publicId)).set(...comToken(staff.token))
        .send({ quantidade: 7, operacao: "add" });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["alerta", "estoque", "message"]);
      expect(Object.keys(res.body.estoque).sort()).toEqual([
        "atualizado_em", "estoque_minimo", "produtoPublicId", "produto_nome", "publicId", "quantidade", "version",
      ]);
      expect(res.body.estoque).toMatchObject({
        publicId: item.estoque?.publicId, produtoPublicId: item.publicId, produto_nome: "Atualizado",
        quantidade: 17, estoque_minimo: 5, version: (item.estoque?.version ?? 0) + 1,
      });
      expect(res.body.alerta).toBe(false);
      expect(res.body.message).toBe("Estoque atualizado: 17 unidades disponíveis.");
    });

    // Pendência da review do #136: antes, atualizado_em nunca mudava.
    it("atualizado_em passa a ser o momento da última escrita", async () => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Datado", quantidade: 10 });
      const antigo = new Date("2026-01-01T00:00:00Z");
      await prisma.estoque.update({ where: { produtoId: item.id }, data: { atualizadoEm: antigo } });

      const antes = Date.now();
      const res = await request(app).put(rotaProduto(item.publicId)).set(...comToken(staff.token))
        .send({ quantidade: 1, operacao: "subtract" });

      expect(res.status).toBe(200);
      const atualizado = new Date(res.body.estoque.atualizado_em).getTime();
      expect(atualizado).toBeGreaterThanOrEqual(antes - 1000);
      const gravado = await prisma.estoque.findUniqueOrThrow({ where: { produtoId: item.id } });
      expect(gravado.atualizadoEm!.getTime()).toBe(atualizado);
    });

    it("uma escrita recusada pela guarda não muda o atualizado_em", async () => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Recusado", quantidade: 1 });
      const antigo = new Date("2026-01-01T00:00:00Z");
      await prisma.estoque.update({ where: { produtoId: item.id }, data: { atualizadoEm: antigo } });

      const res = await request(app).put(rotaProduto(item.publicId)).set(...comToken(staff.token))
        .send({ quantidade: 5, operacao: "subtract" });

      expect(res.status).toBe(409);
      const gravado = await prisma.estoque.findUniqueOrThrow({ where: { produtoId: item.id } });
      expect(gravado.atualizadoEm).toEqual(antigo);
    });

    it("avisa quando o estoque fica no mínimo ou abaixo", async () => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Baixo", quantidade: 10 });

      const res = await request(app).put(rotaProduto(item.publicId)).set(...comToken(staff.token))
        .send({ quantidade: 6, operacao: "subtract" });

      expect(res.body.alerta).toBe(true);
      expect(res.body.message).toBe("⚠️ Atenção: estoque baixo! 4 unidades (mínimo: 5)");
    });

    it("sem mínimo definido, zerar o estoque também avisa", async () => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Sem mínimo", quantidade: 3, estoqueMinimo: null });

      const res = await request(app).put(rotaProduto(item.publicId)).set(...comToken(staff.token))
        .send({ quantidade: 0 });

      expect(res.body.alerta).toBe(true);
      expect(res.body.message).toBe("⚠️ Atenção: estoque baixo! 0 unidades (mínimo: null)");
    });

    it("produto sem registro de estoque responde 404", async () => {
      const staff = await criarUsuario("staff");
      const semEstoque = await prisma.produto.create({ data: { nome: "Sem estoque", preco: "1.00" }, select: { publicId: true } });

      const res = await request(app).put(rotaProduto(semEstoque.publicId)).set(...comToken(staff.token))
        .send({ quantidade: 1 });

      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Produto não encontrado no estoque.");
    });

    // Se a resposta fosse lida depois da escrita, duas entradas simultâneas
    // poderiam devolver o mesmo total.
    it("em entradas simultâneas, cada resposta traz o valor da própria escrita", async () => {
      const staff = await criarUsuario("staff");
      const item = await criarItem({ nome: "Concorrido", quantidade: 0 });

      const respostas = await Promise.all(Array.from({ length: 10 }, () =>
        request(app).put(rotaProduto(item.publicId)).set(...comToken(staff.token)).send({ quantidade: 1, operacao: "add" })));

      expect(respostas.every(r => r.status === 200)).toBe(true);
      const quantidades = respostas.map(r => r.body.estoque.quantidade).sort((a, b) => a - b);
      expect(quantidades).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  describe("GET /api/stock/alerts", () => {
    it("traz só ativos no mínimo ou abaixo, do maior déficit para o menor", async () => {
      const fabrica = await criarUsuario("factory");
      const grave = await criarItem({ nome: "Grave", quantidade: 1, estoqueMinimo: 20 });
      await criarItem({ nome: "No limite", quantidade: 5, estoqueMinimo: 5 });
      await criarItem({ nome: "Leve", quantidade: 3, estoqueMinimo: 5 });
      await criarItem({ nome: "Folgado", quantidade: 30, estoqueMinimo: 5 });
      await criarItem({ nome: "Inativo", quantidade: 0, estoqueMinimo: 50, ativo: false });
      await criarItem({ nome: "Sem mínimo", quantidade: 0, estoqueMinimo: null });

      const res = await request(app).get("/api/stock/alerts").set(...comToken(fabrica.token));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["alertas", "total"]);
      expect(res.body.total).toBe(3);
      expect(nomes(res.body.alertas)).toEqual(["Grave", "Leve", "No limite"]);
      expect(res.body.alertas[0]).toEqual({
        produtoPublicId: grave.publicId, produto_nome: "Grave", quantidade: 1, estoque_minimo: 20, deficit: 19,
      });
      expect(res.body.alertas[2].deficit).toBe(0);
    });
  });
});
