// ============================================================
//   TEST-02 — Regressão IDOR/BOLA: designs salvos
//
//   Dono do recurso: o usuário que salvou o design.
//   Rotas: GET /api/designs, POST /api/designs, PUT /api/designs/:id,
//          DELETE /api/designs/:id
//
//   Cada tentativa negada verifica que o design da vítima continua
//   intacto no banco. Sem isso o teste passaria mesmo com TOCTOU.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { criarDesign, lerDesign } from "../helpers/designs.js";
import { esperarProblema, semanticaDoProblema } from "../helpers/problem.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * Troca o e-mail do usuário direto no banco (a API ainda não expõe essa
 * operação, mas o dado é mutável) e devolve um token novo, com o e-mail novo.
 */
async function trocarEmail(usuario: UsuarioDeTeste): Promise<UsuarioDeTeste> {
  const email = `trocado-${usuario.id}-${Date.now()}@exemplo.invalid`;
  await prisma.usuario.update({ where: { id: usuario.id }, data: { email } });
  const login = await request(app).post("/api/auth/login").send({ email, password: usuario.senha });
  expect(login.status).toBe(200);
  return { ...usuario, email, token: login.body.token };
}

/** Cadastra uma conta nova com o e-mail informado, pela API. */
async function cadastrarCom(email: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ name: "Herdeiro do e-mail", email, password: "SenhaTeste123" });
  expect(res.status).toBe(201);
  return { id: res.body.user.id as number, token: res.body.token as string };
}

const corpoDeDesign = (id?: string) => ({
  id,
  name: "Tentativa do atacante",
  model: "wayfarer",
  color: "#ff0000",
});

describe("designs — autorização de objeto (TEST-02)", () => {
  describe("usuário anônimo recebe 401", () => {
    it("GET /api/designs", async () => {
      esperarProblema(await request(app).get("/api/designs"), 401, "unauthorized");
    });

    it("POST /api/designs", async () => {
      esperarProblema(
        await request(app).post("/api/designs").send(corpoDeDesign()),
        401,
        "unauthorized"
      );
    });

    it("DELETE /api/designs/:id — e o design continua existindo", async () => {
      const dono = await criarUsuario("client");
      const design = await criarDesign(dono);

      esperarProblema(await request(app).delete(`/api/designs/${design.id}`), 401, "unauthorized");
      expect(await lerDesign(design.id)).not.toBeNull();
    });
  });

  describe("DELETE /api/designs/:id", () => {
    it("dono apaga o próprio design", async () => {
      const dono = await criarUsuario("client");
      const design = await criarDesign(dono);

      const res = await request(app)
        .delete(`/api/designs/${design.id}`)
        .set(...comToken(dono.token));

      expect(res.status).toBe(200);
      expect(await lerDesign(design.id)).toBeNull();
    });

    it("outro usuário recebe 404 e o design permanece intacto", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");
      const design = await criarDesign(vitima);
      const antes = await lerDesign(design.id);

      const res = await request(app)
        .delete(`/api/designs/${design.id}`)
        .set(...comToken(atacante.token));

      esperarProblema(res, 404, "not-found");
      expect(await lerDesign(design.id)).toEqual(antes);
    });

    it("design alheio e design inexistente produzem o mesmo problema", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");
      const design = await criarDesign(vitima);

      const alheio = await request(app)
        .delete(`/api/designs/${design.id}`)
        .set(...comToken(atacante.token));
      const inexistente = await request(app)
        .delete("/api/designs/design-que-nao-existe")
        .set(...comToken(atacante.token));

      expect(alheio.status).toBe(inexistente.status);
      expect(semanticaDoProblema(alheio.body)).toEqual(semanticaDoProblema(inexistente.body));
    });
  });

  describe("GET /api/designs", () => {
    it("listagem traz apenas os designs do próprio usuário", async () => {
      const a = await criarUsuario("client");
      const b = await criarUsuario("client");
      const deA1 = await criarDesign(a);
      const deA2 = await criarDesign(a);
      const deB = await criarDesign(b);

      const res = await request(app).get("/api/designs").set(...comToken(b.token));

      expect(res.status).toBe(200);
      const ids = res.body.designs.map((d: { id: string }) => d.id);
      expect(ids).toEqual([deB.id]);
      expect(ids).not.toContain(deA1.id);
      expect(ids).not.toContain(deA2.id);
    });
  });

  describe("POST /api/designs — só cria, com identificador do servidor (BOLA-04)", () => {
    it("o id gerado é UUID v4, e o design criado pertence a quem fez a requisição", async () => {
      const dono = await criarUsuario("client");

      const res = await request(app)
        .post("/api/designs")
        .set(...comToken(dono.token))
        .send(corpoDeDesign());

      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(UUID_V4);
      expect(await lerDesign(res.body.id)).toMatchObject({ usuarioId: dono.id });
    });

    it("id no corpo é recusado com 400, sem criar nem alterar design", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");
      const design = await criarDesign(vitima);
      const antes = await lerDesign(design.id);

      const alheio = await request(app)
        .post("/api/designs")
        .set(...comToken(atacante.token))
        .send(corpoDeDesign(design.id));
      const livre = await request(app)
        .post("/api/designs")
        .set(...comToken(atacante.token))
        .send(corpoDeDesign(`design-livre-${Date.now()}`));

      esperarProblema(alheio, 400, "bad-request");
      esperarProblema(livre, 400, "bad-request");
      expect(semanticaDoProblema(alheio.body)).toEqual(semanticaDoProblema(livre.body));
      expect(await lerDesign(design.id)).toEqual(antes);
      expect(await prisma.savedDesign.count()).toBe(1);
    });

    it("dono e e-mail enviados no corpo são ignorados — vale o token", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");

      const res = await request(app)
        .post("/api/designs")
        .set(...comToken(atacante.token))
        .send({
          ...corpoDeDesign(),
          usuario_id: vitima.id,
          usuarioId: vitima.id,
          customer_email: vitima.email,
          customerEmail: vitima.email,
        });

      expect(res.status).toBe(201);
      const criado = await lerDesign(res.body.id);
      expect(criado?.usuarioId).toBe(atacante.id);

      const daVitima = await request(app).get("/api/designs").set(...comToken(vitima.token));
      expect(daVitima.body.designs).toHaveLength(0);
    });

  });

  describe("PUT /api/designs/:id — só atualiza, no escopo do dono (BOLA-04)", () => {
    it("usuário anônimo recebe 401 e o design continua intacto", async () => {
      const dono = await criarUsuario("client");
      const design = await criarDesign(dono);
      const antes = await lerDesign(design.id);

      esperarProblema(
        await request(app).put(`/api/designs/${design.id}`).send(corpoDeDesign()),
        401,
        "unauthorized"
      );
      expect(await lerDesign(design.id)).toEqual(antes);
    });

    it("dono atualiza o próprio design", async () => {
      const dono = await criarUsuario("client");
      const design = await criarDesign(dono);

      const res = await request(app)
        .put(`/api/designs/${design.id}`)
        .set(...comToken(dono.token))
        .send({ ...corpoDeDesign(), name: "Novo nome" });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(design.id);
      expect(await lerDesign(design.id)).toMatchObject({ name: "Novo nome", color: "#ff0000", usuarioId: dono.id });
    });

    it("outro usuário recebe 404 e o design da vítima permanece intacto", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");
      const design = await criarDesign(vitima);
      const antes = await lerDesign(design.id);

      const res = await request(app)
        .put(`/api/designs/${design.id}`)
        .set(...comToken(atacante.token))
        .send(corpoDeDesign());

      esperarProblema(res, 404, "not-found");
      expect(await lerDesign(design.id)).toEqual(antes);
    });

    // Promovido de vulnerabilidadeConhecida: antes, id alheio caía no INSERT,
    // colidia com a chave primária (409) e o id livre criava o design (201).
    it("id alheio e id inexistente respondem de forma indistinguível", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");
      const design = await criarDesign(vitima);

      const alheio = await request(app)
        .put(`/api/designs/${design.id}`)
        .set(...comToken(atacante.token))
        .send(corpoDeDesign());
      const inexistente = await request(app)
        .put(`/api/designs/design-livre-${Date.now()}`)
        .set(...comToken(atacante.token))
        .send(corpoDeDesign());

      esperarProblema(alheio, 404, "not-found");
      esperarProblema(inexistente, 404, "not-found");
      expect(alheio.headers["content-type"]).toBe(inexistente.headers["content-type"]);
      expect(semanticaDoProblema(alheio.body)).toEqual(semanticaDoProblema(inexistente.body));
    });

    it("id livre não vira criação: 404 e nada é gravado", async () => {
      const dono = await criarUsuario("client");

      const res = await request(app)
        .put("/api/designs/design-que-nao-existe")
        .set(...comToken(dono.token))
        .send(corpoDeDesign());

      esperarProblema(res, 404, "not-found");
      expect(await prisma.savedDesign.count()).toBe(0);
    });
  });

  // BOLA-05: o escopo é o usuario_id do token, imutável. Com o e-mail como
  // escopo, a conta que recebesse um e-mail liberado recebia os designs dele.
  describe("[BOLA-05] o dono é o usuario_id, não o e-mail", () => {
    it("quem se cadastra com o e-mail antigo do dono não lista, não altera e não apaga os designs dele", async () => {
      const dono = await criarUsuario("client");
      const design = await criarDesign(dono);
      const antes = await lerDesign(design.id);
      await trocarEmail(dono);
      const herdeiro = await cadastrarCom(dono.email);

      const lista = await request(app).get("/api/designs").set(...comToken(herdeiro.token));
      const edicao = await request(app)
        .put(`/api/designs/${design.id}`)
        .set(...comToken(herdeiro.token))
        .send(corpoDeDesign());
      const exclusao = await request(app)
        .delete(`/api/designs/${design.id}`)
        .set(...comToken(herdeiro.token));

      expect(lista.status).toBe(200);
      expect(lista.body.designs).toEqual([]);
      esperarProblema(edicao, 404, "not-found");
      esperarProblema(exclusao, 404, "not-found");
      expect(await lerDesign(design.id)).toEqual(antes);
    });

    it("o dono continua com os próprios designs depois de trocar de e-mail", async () => {
      const original = await criarUsuario("client");
      const design = await criarDesign(original);
      const dono = await trocarEmail(original);

      const lista = await request(app).get("/api/designs").set(...comToken(dono.token));
      expect(lista.body.designs.map((d: { id: string }) => d.id)).toEqual([design.id]);

      const edicao = await request(app)
        .put(`/api/designs/${design.id}`)
        .set(...comToken(dono.token))
        .send({ ...corpoDeDesign(), name: "Depois da troca" });
      expect(edicao.status).toBe(200);
      expect(await lerDesign(design.id)).toMatchObject({ name: "Depois da troca", usuarioId: dono.id });

      const exclusao = await request(app).delete(`/api/designs/${design.id}`).set(...comToken(dono.token));
      expect(exclusao.status).toBe(200);
      expect(await lerDesign(design.id)).toBeNull();
    });

    it("design criado depois da troca de e-mail continua do mesmo usuario_id", async () => {
      const dono = await trocarEmail(await criarUsuario("client"));

      const res = await request(app).post("/api/designs").set(...comToken(dono.token)).send(corpoDeDesign());

      expect(res.status).toBe(201);
      expect(await lerDesign(res.body.id)).toMatchObject({ usuarioId: dono.id });
    });
  });
});
