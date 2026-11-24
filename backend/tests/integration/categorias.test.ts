// ============================================================
//   DB-03 — Categorias: contrato da API e garantias de escrita
//
//   Falam com a API, não com a implementação. O bloco "contrato"
//   passava igual com o controller em SQL puro: é a prova de que
//   a migração para o Prisma não mudou nada para quem consome.
//   O bloco "garantias" cobre o que a versão anterior não fazia.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { esperarBloqueios } from "../helpers/bloqueio.js";
import { esperarProblema } from "../helpers/problem.js";

const rota = (publicId: string) => `/api/categories/${publicId}`;
const INEXISTENTE = "00000000-0000-4000-8000-000000000000";

const criarCategoria = (nome: string, descricao: string | null = null) =>
  prisma.categoria.create({ data: { nome, descricao }, select: { id: true, publicId: true, nome: true } });

const criarProduto = (categoriaId: number, opcoes: { nome?: string; preco?: string; ativo?: boolean } = {}) =>
  prisma.produto.create({
    data: {
      nome: opcoes.nome ?? "Armação",
      preco: opcoes.preco ?? "199.90",
      ativo: opcoes.ativo ?? true,
      categoriaId,
    },
    select: { id: true, publicId: true },
  });

const lerCategoria = (publicId: string) =>
  prisma.categoria.findUnique({ where: { publicId }, select: { nome: true, descricao: true } });

describe("categorias — contrato da API (DB-03)", () => {
  describe("POST /api/categories", () => {
    it("staff cria, com o nome aparado e só os campos públicos", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).post("/api/categories").set(...comToken(staff.token))
        .send({ nome: "  Óculos de Sol  ", descricao: "Proteção UV" });

      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(["criado_em", "descricao", "nome", "publicId"]);
      expect(res.body).toMatchObject({ nome: "Óculos de Sol", descricao: "Proteção UV" });
      expect(Number.isNaN(Date.parse(res.body.criado_em))).toBe(false);
      expect(await lerCategoria(res.body.publicId)).toEqual({ nome: "Óculos de Sol", descricao: "Proteção UV" });
    });

    it.each([[""], [undefined], [null]])("descrição %j é gravada como null", async (descricao) => {
      const staff = await criarUsuario("staff");

      const res = await request(app).post("/api/categories").set(...comToken(staff.token))
        .send({ nome: "Sem descrição", descricao });

      expect(res.status).toBe(201);
      expect(res.body.descricao).toBeNull();
    });

    it("nome repetido responde 409 e não cria outra", async () => {
      const staff = await criarUsuario("staff");
      await criarCategoria("Grau");

      const res = await request(app).post("/api/categories").set(...comToken(staff.token)).send({ nome: "Grau" });

      esperarProblema(res, 409, "conflict");
      expect(res.body.detail).toBe("Já existe uma categoria com esse nome.");
      expect(await prisma.categoria.count({ where: { nome: "Grau" } })).toBe(1);
    });

    it("corpo inválido responde 400 apontando o campo", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).post("/api/categories").set(...comToken(staff.token)).send({ nome: "   " });

      esperarProblema(res, 400, "bad-request");
      expect(res.body.invalidParams).toEqual([expect.objectContaining({ name: "nome" })]);
      expect(await prisma.categoria.count()).toBe(0);
    });
  });

  describe("autorização das escritas", () => {
    it("anônimo recebe 401 e a categoria não muda", async () => {
      const categoria = await criarCategoria("Protegida");

      expect((await request(app).post("/api/categories").send({ nome: "Nova" })).status).toBe(401);
      expect((await request(app).put(rota(categoria.publicId)).send({ nome: "Alterada" })).status).toBe(401);
      expect((await request(app).delete(rota(categoria.publicId))).status).toBe(401);

      expect(await lerCategoria(categoria.publicId)).toEqual({ nome: "Protegida", descricao: null });
      expect(await prisma.categoria.count()).toBe(1);
    });

    it.each(["client", "factory"] as const)("%s recebe 403 e a categoria não muda", async (papel) => {
      const usuario = await criarUsuario(papel);
      const categoria = await criarCategoria("Protegida");
      const auth = comToken(usuario.token);

      esperarProblema(await request(app).post("/api/categories").set(...auth).send({ nome: "Nova" }), 403, "forbidden");
      esperarProblema(await request(app).put(rota(categoria.publicId)).set(...auth).send({ nome: "Alterada" }), 403, "forbidden");
      esperarProblema(await request(app).delete(rota(categoria.publicId)).set(...auth), 403, "forbidden");

      expect(await lerCategoria(categoria.publicId)).toEqual({ nome: "Protegida", descricao: null });
      expect(await prisma.categoria.count()).toBe(1);
    });
  });

  describe("GET /api/categories", () => {
    it("é pública, ordena por nome e conta só produtos ativos, como texto", async () => {
      const zeta = await criarCategoria("Zeta");
      const alfa = await criarCategoria("Alfa", "Primeira");
      await criarProduto(alfa.id);
      await criarProduto(alfa.id);
      await criarProduto(alfa.id, { ativo: false });

      const res = await request(app).get("/api/categories");

      expect(res.status).toBe(200);
      expect(res.body.map((c: { nome: string }) => c.nome)).toEqual(["Alfa", "Zeta"]);
      expect(Object.keys(res.body[0]).sort()).toEqual(["criado_em", "descricao", "nome", "publicId", "total_produtos"]);
      expect(res.body[0]).toMatchObject({ publicId: alfa.publicId, descricao: "Primeira", total_produtos: "2" });
      expect(res.body[1]).toMatchObject({ publicId: zeta.publicId, descricao: null, total_produtos: "0" });
    });
  });

  describe("GET /api/categories/:publicId", () => {
    it("traz os produtos ativos, com o preço em texto exato de duas casas", async () => {
      const categoria = await criarCategoria("Sol", "UV");
      const ativo = await criarProduto(categoria.id, { nome: "Aurora", preco: "199.90" });
      const redondo = await criarProduto(categoria.id, { nome: "Nova", preco: "450.00" });
      await criarProduto(categoria.id, { nome: "Inativo", ativo: false });

      const res = await request(app).get(rota(categoria.publicId));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["criado_em", "descricao", "nome", "produtos", "publicId"]);
      expect(res.body).toMatchObject({ publicId: categoria.publicId, nome: "Sol", descricao: "UV" });
      const produtos = [...res.body.produtos].sort((a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome));
      expect(produtos).toEqual([
        { publicId: ativo.publicId, nome: "Aurora", preco: "199.90", imagem_url: null, ativo: true },
        { publicId: redondo.publicId, nome: "Nova", preco: "450.00", imagem_url: null, ativo: true },
      ]);
    });

    it("categoria inexistente responde 404", async () => {
      const res = await request(app).get(rota(INEXISTENTE));

      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Categoria não encontrada.");
    });
  });

  describe("PUT /api/categories/:publicId", () => {
    it("staff altera nome e descrição", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Antiga", "Texto");

      const res = await request(app).put(rota(categoria.publicId)).set(...comToken(staff.token))
        .send({ nome: "  Nova  ", descricao: "Outro texto" });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["criado_em", "descricao", "nome", "publicId"]);
      expect(res.body).toMatchObject({ publicId: categoria.publicId, nome: "Nova", descricao: "Outro texto" });
      expect(await lerCategoria(categoria.publicId)).toEqual({ nome: "Nova", descricao: "Outro texto" });
    });

    it("sem descrição no corpo, a descrição é limpa", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Antiga", "Texto");

      const res = await request(app).put(rota(categoria.publicId)).set(...comToken(staff.token)).send({ nome: "Antiga" });

      expect(res.status).toBe(200);
      expect(res.body.descricao).toBeNull();
    });

    it("categoria inexistente responde 404", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).put(rota(INEXISTENTE)).set(...comToken(staff.token)).send({ nome: "Qualquer" });

      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Categoria não encontrada.");
      expect(await prisma.categoria.count()).toBe(0);
    });
  });

  describe("DELETE /api/categories/:publicId", () => {
    it("staff remove a categoria sem produtos", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Vazia");

      const res = await request(app).delete(rota(categoria.publicId)).set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Categoria removida com sucesso." });
      expect(await lerCategoria(categoria.publicId)).toBeNull();
    });

    it("com produtos ativos responde 409 com a contagem e não remove", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Em uso");
      const produto = await criarProduto(categoria.id);
      await criarProduto(categoria.id);
      await criarProduto(categoria.id, { ativo: false });

      const res = await request(app).delete(rota(categoria.publicId)).set(...comToken(staff.token));

      esperarProblema(res, 409, "conflict");
      expect(res.body.detail).toBe("Não é possível deletar. 2 produto(s) ainda usam essa categoria.");
      expect(await lerCategoria(categoria.publicId)).not.toBeNull();
      expect((await prisma.produto.findUnique({ where: { id: produto.id } }))?.categoriaId).toBe(categoria.id);
    });

    it("só com produtos inativos remove, e eles ficam sem categoria", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Só inativos");
      const inativo = await criarProduto(categoria.id, { ativo: false });

      const res = await request(app).delete(rota(categoria.publicId)).set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect((await prisma.produto.findUnique({ where: { id: inativo.id } }))?.categoriaId).toBeNull();
    });

    it("categoria inexistente responde 404", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).delete(rota(INEXISTENTE)).set(...comToken(staff.token));

      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Categoria não encontrada.");
    });
  });
});

describe("categorias — garantias de escrita (DB-03)", () => {
  it("dez criações simultâneas do mesmo nome: uma passa e as outras recebem o mesmo 409", async () => {
    const staff = await criarUsuario("staff");

    const respostas = await Promise.all(Array.from({ length: 10 }, () =>
      request(app).post("/api/categories").set(...comToken(staff.token)).send({ nome: "Concorrida" })));

    expect(respostas.filter(r => r.status === 201)).toHaveLength(1);
    for (const recusada of respostas.filter(r => r.status !== 201)) {
      esperarProblema(recusada, 409, "conflict");
      expect(recusada.body.detail).toBe("Já existe uma categoria com esse nome.");
    }
    expect(await prisma.categoria.count({ where: { nome: "Concorrida" } })).toBe(1);
  });

  it("renomear para um nome em uso responde 409 sem citar a coluna do banco", async () => {
    const staff = await criarUsuario("staff");
    await criarCategoria("Ocupada");
    const categoria = await criarCategoria("Livre");

    const res = await request(app).put(rota(categoria.publicId)).set(...comToken(staff.token)).send({ nome: "Ocupada" });

    esperarProblema(res, 409, "conflict");
    expect(res.body.detail).toBe("Já existe uma categoria com esse nome.");
    expect(await lerCategoria(categoria.publicId)).toEqual({ nome: "Livre", descricao: null });
  });

  // A chave estrangeira é ON DELETE SET NULL. Sem travar a categoria, um produto
  // ativo que entra entre a contagem e o DELETE perde a categoria em silêncio.
  it("produto ativo gravado durante a remoção: 409, e ele continua na categoria", async () => {
    const staff = await criarUsuario("staff");
    const categoria = await criarCategoria("Disputada");

    const conexao = await pool.connect();
    let remocao: Promise<request.Response>;
    let produtoId: number;
    try {
      await conexao.query("BEGIN");
      const { rows } = await conexao.query(
        "INSERT INTO produtos (nome, preco, categoria_id) VALUES ('Chegou agora', 100, $1) RETURNING id",
        [categoria.id],
      );
      produtoId = rows[0].id;
      remocao = request(app).delete(rota(categoria.publicId)).set(...comToken(staff.token)).then(r => r);
      await esperarBloqueios();
      await conexao.query("COMMIT");
    } catch (erro) {
      await conexao.query("ROLLBACK");
      throw erro;
    } finally {
      conexao.release();
    }

    const res = await remocao;

    esperarProblema(res, 409, "conflict");
    expect(await lerCategoria(categoria.publicId)).not.toBeNull();
    expect((await prisma.produto.findUnique({ where: { id: produtoId } }))?.categoriaId).toBe(categoria.id);
  });
});
