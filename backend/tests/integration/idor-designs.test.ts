// ============================================================
//   TEST-02 — Regressão IDOR/BOLA: designs salvos
//
//   Dono do recurso: o usuário que salvou o design.
//   Rotas: GET /api/designs, POST /api/designs, DELETE /api/designs/:id
//
//   Cada tentativa negada verifica que o design da vítima continua
//   intacto no banco. Sem isso o teste passaria mesmo com TOCTOU.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarDesign, lerDesign } from "../helpers/designs.js";
import { esperarProblema, semanticaDoProblema } from "../helpers/problem.js";
import { vulnerabilidadeConhecida } from "../helpers/vulneravel.js";

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

  describe("POST /api/designs — identificador no corpo", () => {
    it("enviar o id de um design alheio não altera o design da vítima", async () => {
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");
      const design = await criarDesign(vitima);
      const antes = await lerDesign(design.id);

      await request(app)
        .post("/api/designs")
        .set(...comToken(atacante.token))
        .send(corpoDeDesign(design.id));

      expect(await lerDesign(design.id)).toEqual(antes);
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
      expect(criado?.customerEmail).toBe(atacante.email);

      const daVitima = await request(app).get("/api/designs").set(...comToken(vitima.token));
      expect(daVitima.body.designs).toHaveLength(0);
    });

    it("[VULNERÁVEL · BOLA-04] id alheio e id inexistente respondem de forma distinguível", () =>
      vulnerabilidadeConhecida({
        issue: "BOLA-04",
        observar: async () => {
          const vitima = await criarUsuario("client");
          const atacante = await criarUsuario("client");
          const design = await criarDesign(vitima);

          const alheio = await request(app)
            .post("/api/designs")
            .set(...comToken(atacante.token))
            .send(corpoDeDesign(design.id));
          const inexistente = await request(app)
            .post("/api/designs")
            .set(...comToken(atacante.token))
            .send(corpoDeDesign(`design-livre-${Date.now()}`));

          return { alheio, inexistente };
        },
        // Alvo: a resposta não pode revelar se o id pertence a alguém.
        seguro: ({ alheio, inexistente }) => {
          expect(alheio.status).toBe(inexistente.status);
        },
        // Hoje: o SELECT escopado não acha, o fluxo cai no INSERT e a chave
        // primária colide. Id alheio vira 409; id livre cria o design.
        vulneravel: ({ alheio, inexistente }) => {
          esperarProblema(alheio, 409, "conflict");
          expect(inexistente.status).toBe(201);
        },
      }));
  });
});
