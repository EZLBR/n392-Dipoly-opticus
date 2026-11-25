// ============================================================
//   DB-03 — Produtos: contrato da API e garantias de escrita
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

const rota = (publicId: string) => `/api/products/${publicId}`;
const INEXISTENTE = "00000000-0000-4000-8000-000000000000";

const CAMPOS_LISTA = [
  "ativo", "categoriaPublicId", "categoria_nome", "criado_em", "descricao",
  "estoque_quantidade", "imagem_url", "nome", "preco", "publicId",
];
const CAMPOS_DETALHE = [...CAMPOS_LISTA, "estoque_minimo"].sort();

const criarCategoria = (nome: string) =>
  prisma.categoria.create({ data: { nome }, select: { id: true, publicId: true, nome: true } });

const criarProduto = (opcoes: {
  nome?: string;
  descricao?: string | null;
  preco?: string;
  ativo?: boolean;
  categoriaId?: number | null;
  criadoEm?: Date;
  comEstoque?: boolean;
} = {}) =>
  prisma.produto.create({
    data: {
      nome: opcoes.nome ?? "Armação",
      descricao: opcoes.descricao ?? null,
      preco: opcoes.preco ?? "199.90",
      ativo: opcoes.ativo ?? true,
      categoriaId: opcoes.categoriaId ?? null,
      ...(opcoes.criadoEm ? { criadoEm: opcoes.criadoEm } : {}),
      ...(opcoes.comEstoque === false ? {} : { estoque: { create: { quantidade: 7, estoqueMinimo: 3 } } }),
    },
    select: { id: true, publicId: true },
  });

const lerProduto = (publicId: string) =>
  prisma.produto.findUnique({
    where: { publicId },
    select: {
      nome: true, descricao: true, preco: true, ativo: true, categoriaId: true, imagemUrl: true,
      estoque: { select: { quantidade: true, estoqueMinimo: true } },
    },
  });

const nomes = (res: request.Response) => res.body.produtos.map((p: { nome: string }) => p.nome);

describe("produtos — contrato da API (DB-03)", () => {
  describe("POST /api/products", () => {
    it("staff cria com estoque zerado, nome aparado e só os campos públicos", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Sol");

      const res = await request(app).post("/api/products").set(...comToken(staff.token)).send({
        nome: "  Aurora  ", descricao: "Leve", preco: 199.9,
        categoriaPublicId: categoria.publicId, imagem_url: "https://exemplo.invalid/a.png",
      });

      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual(CAMPOS_DETALHE);
      expect(res.body).toMatchObject({
        nome: "Aurora", descricao: "Leve", preco: "199.90",
        categoriaPublicId: categoria.publicId, categoria_nome: "Sol",
        imagem_url: "https://exemplo.invalid/a.png", ativo: true,
        estoque_quantidade: 0, estoque_minimo: 5,
      });
      expect(Number.isNaN(Date.parse(res.body.criado_em))).toBe(false);
    });

    it("sem categoria e com opcionais vazios grava null", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).post("/api/products").set(...comToken(staff.token))
        .send({ nome: "Simples", preco: "450.00", descricao: "", imagem_url: "" });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        preco: "450.00", descricao: null, imagem_url: null, categoriaPublicId: null, categoria_nome: null,
      });
    });

    it.each([[19.995, "20.00"], [1.005, "1.01"]])("preço %d é arredondado no banco para %s", async (preco, esperado) => {
      const staff = await criarUsuario("staff");

      const res = await request(app).post("/api/products").set(...comToken(staff.token))
        .send({ nome: "Arredondado", preco });

      expect(res.status).toBe(201);
      expect(res.body.preco).toBe(esperado);
    });

    it("categoria inexistente responde 400 e não cria nada", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).post("/api/products").set(...comToken(staff.token))
        .send({ nome: "Sem casa", preco: 10, categoriaPublicId: INEXISTENTE });

      esperarProblema(res, 400, "bad-request");
      expect(res.body.detail).toBe("Categoria não encontrada.");
      expect(await prisma.produto.count()).toBe(0);
      expect(await prisma.estoque.count()).toBe(0);
    });

    it("corpo inválido responde 400 apontando o campo", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).post("/api/products").set(...comToken(staff.token))
        .send({ nome: "Inválido", preco: -1 });

      esperarProblema(res, 400, "bad-request");
      expect(res.body.invalidParams).toEqual([expect.objectContaining({ name: "preco" })]);
      expect(await prisma.produto.count()).toBe(0);
    });
  });

  describe("autorização das escritas", () => {
    const corpo = { nome: "Alterado", preco: 1 };

    it("anônimo recebe 401 e o produto não muda", async () => {
      const produto = await criarProduto({ nome: "Protegido" });

      expect((await request(app).post("/api/products").send(corpo)).status).toBe(401);
      expect((await request(app).put(rota(produto.publicId)).send(corpo)).status).toBe(401);
      expect((await request(app).delete(rota(produto.publicId))).status).toBe(401);

      expect(await lerProduto(produto.publicId)).toMatchObject({ nome: "Protegido", ativo: true });
      expect(await prisma.produto.count()).toBe(1);
    });

    it.each(["client", "factory"] as const)("%s recebe 403 e o produto não muda", async (papel) => {
      const usuario = await criarUsuario(papel);
      const produto = await criarProduto({ nome: "Protegido" });
      const auth = comToken(usuario.token);

      esperarProblema(await request(app).post("/api/products").set(...auth).send(corpo), 403, "forbidden");
      esperarProblema(await request(app).put(rota(produto.publicId)).set(...auth).send(corpo), 403, "forbidden");
      esperarProblema(await request(app).delete(rota(produto.publicId)).set(...auth), 403, "forbidden");

      expect(await lerProduto(produto.publicId)).toMatchObject({ nome: "Protegido", ativo: true });
      expect(await prisma.produto.count()).toBe(1);
    });
  });

  describe("GET /api/products", () => {
    it("é pública, traz só ativos, do mais novo para o mais antigo, com total em texto", async () => {
      const categoria = await criarCategoria("Grau");
      const novo = await criarProduto({
        nome: "Novo", preco: "450.00", categoriaId: categoria.id, criadoEm: new Date("2026-03-01T10:00:00Z"),
      });
      await criarProduto({ nome: "Antigo", criadoEm: new Date("2026-01-01T10:00:00Z"), comEstoque: false });
      await criarProduto({ nome: "Inativo", ativo: false, criadoEm: new Date("2026-02-01T10:00:00Z") });

      const res = await request(app).get("/api/products");

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["page", "produtos", "total", "totalPages"]);
      expect(res.body).toMatchObject({ total: "2", page: 1, totalPages: 1 });
      expect(nomes(res)).toEqual(["Novo", "Antigo"]);
      expect(Object.keys(res.body.produtos[0]).sort()).toEqual([...CAMPOS_LISTA].sort());
      expect(res.body.produtos[0]).toMatchObject({
        publicId: novo.publicId, preco: "450.00", categoriaPublicId: categoria.publicId,
        categoria_nome: "Grau", estoque_quantidade: 7, ativo: true,
      });
      expect(res.body.produtos[1]).toMatchObject({ categoriaPublicId: null, estoque_quantidade: null });
    });

    it("pagina com limit e page", async () => {
      await criarProduto({ nome: "C", criadoEm: new Date("2026-03-01T10:00:00Z") });
      await criarProduto({ nome: "B", criadoEm: new Date("2026-02-01T10:00:00Z") });
      await criarProduto({ nome: "A", criadoEm: new Date("2026-01-01T10:00:00Z") });

      const res = await request(app).get("/api/products").query({ page: 2, limit: 2 });

      expect(res.body).toMatchObject({ total: "3", page: 2, totalPages: 2 });
      expect(nomes(res)).toEqual(["A"]);
    });

    it("página muito além do fim responde 200 e lista vazia", async () => {
      await criarProduto();

      const res = await request(app).get("/api/products").query({ page: 99_999_999_999, limit: 100 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ produtos: [], total: "1", page: 99_999_999_999, totalPages: 1 });
    });

    it("filtra por categoria, e categoria inexistente devolve lista vazia", async () => {
      const sol = await criarCategoria("Sol");
      const grau = await criarCategoria("Grau");
      await criarProduto({ nome: "De sol", categoriaId: sol.id });
      await criarProduto({ nome: "De grau", categoriaId: grau.id });

      const filtrado = await request(app).get("/api/products").query({ categoriaPublicId: sol.publicId });
      const vazio = await request(app).get("/api/products").query({ categoriaPublicId: INEXISTENTE });

      expect(nomes(filtrado)).toEqual(["De sol"]);
      expect(filtrado.body.total).toBe("1");
      expect(vazio.status).toBe(200);
      expect(vazio.body).toMatchObject({ produtos: [], total: "0", totalPages: 0 });
    });

    it("busca sem diferenciar maiúsculas, no nome e na descrição", async () => {
      await criarProduto({ nome: "Model AURORA", criadoEm: new Date("2026-03-01T10:00:00Z") });
      await criarProduto({ nome: "Outro", descricao: "linha aurora", criadoEm: new Date("2026-02-01T10:00:00Z") });
      await criarProduto({ nome: "Nada a ver", criadoEm: new Date("2026-01-01T10:00:00Z") });

      const res = await request(app).get("/api/products").query({ search: "aurora" });

      expect(nomes(res)).toEqual(["Model AURORA", "Outro"]);
      expect(res.body.total).toBe("2");
    });

    it("limit acima do teto responde 400", async () => {
      esperarProblema(await request(app).get("/api/products").query({ limit: 101 }), 400, "bad-request");
    });
  });

  describe("GET /api/products/:publicId", () => {
    it("traz o estoque mínimo, inclusive de produto inativo", async () => {
      const produto = await criarProduto({ nome: "Fora de linha", ativo: false });

      const res = await request(app).get(rota(produto.publicId));

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(CAMPOS_DETALHE);
      expect(res.body).toMatchObject({
        publicId: produto.publicId, ativo: false, preco: "199.90", estoque_quantidade: 7, estoque_minimo: 3,
      });
    });

    it("produto inexistente responde 404", async () => {
      const res = await request(app).get(rota(INEXISTENTE));

      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Produto não encontrado.");
    });
  });

  describe("PUT /api/products/:publicId", () => {
    it("staff altera os campos, sem tocar no estoque", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Nova");
      const produto = await criarProduto({ nome: "Antigo", descricao: "Texto" });

      const res = await request(app).put(rota(produto.publicId)).set(...comToken(staff.token)).send({
        nome: "  Novo  ", descricao: "Outro", preco: "210.50", categoriaPublicId: categoria.publicId,
        imagem_url: "https://exemplo.invalid/b.png", ativo: false,
      });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(CAMPOS_DETALHE);
      expect(res.body).toMatchObject({
        nome: "Novo", descricao: "Outro", preco: "210.50", categoriaPublicId: categoria.publicId,
        categoria_nome: "Nova", imagem_url: "https://exemplo.invalid/b.png", ativo: false,
        estoque_quantidade: 7, estoque_minimo: 3,
      });
    });

    it("sem categoria e sem opcionais, limpa os campos", async () => {
      const staff = await criarUsuario("staff");
      const categoria = await criarCategoria("Sai");
      const produto = await criarProduto({ descricao: "Texto", categoriaId: categoria.id });

      const res = await request(app).put(rota(produto.publicId)).set(...comToken(staff.token))
        .send({ nome: "Limpo", preco: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ descricao: null, imagem_url: null, categoriaPublicId: null, categoria_nome: null });
    });

    // Antes, `ativo ?? true` reativava em silêncio um produto desativado a cada edição.
    it.each([false, true])("sem o campo ativo, o produto mantém o estado atual (ativo: %s)", async (ativo) => {
      const staff = await criarUsuario("staff");
      const produto = await criarProduto({ ativo });

      const res = await request(app).put(rota(produto.publicId)).set(...comToken(staff.token))
        .send({ nome: "Editado", preco: 10 });

      expect(res.status).toBe(200);
      expect(res.body.ativo).toBe(ativo);
      expect(await lerProduto(produto.publicId)).toMatchObject({ nome: "Editado", ativo });
    });

    it("com ativo explícito, o produto é reativado", async () => {
      const staff = await criarUsuario("staff");
      const produto = await criarProduto({ ativo: false });

      const res = await request(app).put(rota(produto.publicId)).set(...comToken(staff.token))
        .send({ nome: "Reativado", preco: 10, ativo: true });

      expect(res.status).toBe(200);
      expect(res.body.ativo).toBe(true);
    });

    it("categoria inexistente em produto existente responde 400 e nada muda", async () => {
      const staff = await criarUsuario("staff");
      const produto = await criarProduto({ nome: "Intacto" });

      const res = await request(app).put(rota(produto.publicId)).set(...comToken(staff.token))
        .send({ nome: "Alterado", preco: 1, categoriaPublicId: INEXISTENTE });

      esperarProblema(res, 400, "bad-request");
      expect(res.body.detail).toBe("Categoria não encontrada.");
      expect(await lerProduto(produto.publicId)).toMatchObject({ nome: "Intacto" });
    });

    it.each([[undefined], [INEXISTENTE]])("produto inexistente responde 404, com categoria %s", async (categoriaPublicId) => {
      const staff = await criarUsuario("staff");

      const res = await request(app).put(rota(INEXISTENTE)).set(...comToken(staff.token))
        .send({ nome: "Fantasma", preco: 1, categoriaPublicId });

      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Produto não encontrado.");
    });
  });

  describe("DELETE /api/products/:publicId", () => {
    it("desativa sem apagar: some da listagem e continua no detalhe", async () => {
      const staff = await criarUsuario("staff");
      const produto = await criarProduto({ nome: "Descontinuado" });

      const res = await request(app).delete(rota(produto.publicId)).set(...comToken(staff.token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: "Produto desativado com sucesso. O histórico de pedidos foi preservado." });
      expect(await lerProduto(produto.publicId)).toMatchObject({ ativo: false, estoque: { quantidade: 7 } });
      expect(nomes(await request(app).get("/api/products"))).toEqual([]);
      expect((await request(app).get(rota(produto.publicId))).status).toBe(200);
    });

    it("produto inexistente responde 404", async () => {
      const staff = await criarUsuario("staff");

      const res = await request(app).delete(rota(INEXISTENTE)).set(...comToken(staff.token));

      esperarProblema(res, 404, "not-found");
      expect(res.body.detail).toBe("Produto não encontrado.");
    });
  });
});

describe("produtos — garantias de escrita (DB-03)", () => {
  it.each([
    [100_000_000, "acima do que a coluna guarda"],
    [0.001, "que viraria R$ 0,00"],
  ])("preço %d (%s) responde 400 ao criar e ao alterar", async (preco) => {
    const staff = await criarUsuario("staff");
    const produto = await criarProduto({ nome: "Intacto" });
    const auth = comToken(staff.token);

    const criar = await request(app).post("/api/products").set(...auth).send({ nome: "Novo", preco });
    const alterar = await request(app).put(rota(produto.publicId)).set(...auth).send({ nome: "Alterado", preco });

    for (const res of [criar, alterar]) {
      esperarProblema(res, 400, "bad-request");
      expect(res.body.invalidParams).toEqual([expect.objectContaining({ name: "preco" })]);
    }
    expect(await prisma.produto.count()).toBe(1);
    expect(await lerProduto(produto.publicId)).toMatchObject({ nome: "Intacto" });
  });

  it("aceita o maior preço que a coluna guarda", async () => {
    const staff = await criarUsuario("staff");

    const res = await request(app).post("/api/products").set(...comToken(staff.token))
      .send({ nome: "No limite", preco: 99_999_999.99 });

    expect(res.status).toBe(201);
    expect(res.body.preco).toBe("99999999.99");
  });

  // Produto e estoque nascem juntos. Antes, a falha do segundo INSERT deixava
  // no catálogo um produto sem registro de estoque.
  it("se o estoque não puder ser criado, o produto também não é", async () => {
    const staff = await criarUsuario("staff");
    await pool.query(`CREATE FUNCTION teste_falhar_estoque() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'falha simulada'; END; $$`);
    await pool.query(`CREATE TRIGGER teste_falhar_estoque BEFORE INSERT ON estoque
      FOR EACH ROW EXECUTE FUNCTION teste_falhar_estoque()`);

    try {
      const res = await request(app).post("/api/products").set(...comToken(staff.token))
        .send({ nome: "Sem estoque", preco: 10 });

      expect(res.status).toBe(500);
      expect(await prisma.produto.count()).toBe(0);
    } finally {
      await pool.query("DROP TRIGGER teste_falhar_estoque ON estoque");
      await pool.query("DROP FUNCTION teste_falhar_estoque()");
    }
  });

  // A remoção da categoria conta os produtos ativos. Reativar um produto não
  // muda a chave estrangeira, então só a trava explícita segura a categoria.
  it("reativar um produto durante a remoção da categoria: 409, e ele continua nela", async () => {
    const staff = await criarUsuario("staff");
    const categoria = await criarCategoria("Disputada");
    const produto = await criarProduto({ nome: "Inativo", ativo: false, categoriaId: categoria.id });

    // Segura a linha do produto para a reativação parar no meio da transação.
    const conexao = await pool.connect();
    let reativacao: Promise<request.Response>;
    let remocao: Promise<request.Response>;
    try {
      await conexao.query("BEGIN");
      await conexao.query("SELECT id FROM produtos WHERE id = $1 FOR UPDATE", [produto.id]);
      reativacao = request(app).put(rota(produto.publicId)).set(...comToken(staff.token))
        .send({ nome: "Reativado", preco: 10, categoriaPublicId: categoria.publicId, ativo: true }).then(r => r);
      await esperarBloqueios(1);
      remocao = request(app).delete(`/api/categories/${categoria.publicId}`).set(...comToken(staff.token)).then(r => r);
      await esperarBloqueios(2);
      await conexao.query("COMMIT");
    } catch (erro) {
      await conexao.query("ROLLBACK");
      throw erro;
    } finally {
      conexao.release();
    }

    const [reativado, removida] = await Promise.all([reativacao, remocao]);

    expect(reativado.status).toBe(200);
    esperarProblema(removida, 409, "conflict");
    expect(await lerProduto(produto.publicId)).toMatchObject({ ativo: true, categoriaId: categoria.id });
    expect(await prisma.categoria.count({ where: { publicId: categoria.publicId } })).toBe(1);
  });
});

// Pendências da review do #135, corrigidas depois da migração.
describe("produtos — entradas que antes passavam em silêncio", () => {
  it.each<[unknown, string]>([
    [true, "booleano, que virava R$ 1,00"],
    ["", "texto vazio, que virava 0"],
    [null, "null"],
    ["12,50", "vírgula decimal"],
    ["abc", "texto não numérico"],
  ])("preço %j (%s) responde 400 e nada é gravado", async (preco) => {
    const staff = await criarUsuario("staff");

    const res = await request(app).post("/api/products").set(...comToken(staff.token))
      .send({ nome: "Inválido", preco });

    esperarProblema(res, 400, "bad-request");
    expect(res.body.invalidParams).toEqual([expect.objectContaining({ name: "preco" })]);
    expect(await prisma.produto.count()).toBe(0);
  });

  it("preço em texto numérico continua aceito", async () => {
    const staff = await criarUsuario("staff");

    const res = await request(app).post("/api/products").set(...comToken(staff.token))
      .send({ nome: "Texto", preco: " 199.90 " });

    expect(res.status).toBe(201);
    expect(res.body.preco).toBe("199.90");
  });

  it("% e _ na busca são literais, não curingas", async () => {
    await criarProduto({ nome: "Desconto 50%" });
    await criarProduto({ nome: "Modelo_A" });
    await criarProduto({ nome: "ModeloXA" });

    const busca = (termo: string) => request(app).get("/api/products").query({ search: termo });

    expect(nomes(await busca("%"))).toEqual(["Desconto 50%"]);
    expect(nomes(await busca("50%"))).toEqual(["Desconto 50%"]);
    expect(nomes(await busca("o_A"))).toEqual(["Modelo_A"]);
    expect(nomes(await busca("\\"))).toEqual([]);
  });

  // A review do #135 suspeitou que um `skip` enorme virasse 500. Não vira:
  // o Prisma aceita até o maior inteiro seguro. O teste fixa isso.
  it("página no maior inteiro seguro responde 200 e lista vazia", async () => {
    await criarProduto();
    const res = await request(app).get("/api/products").query({ page: String(Number.MAX_SAFE_INTEGER) });
    expect(res.status).toBe(200);
    expect(res.body.produtos).toEqual([]);
  });
});
