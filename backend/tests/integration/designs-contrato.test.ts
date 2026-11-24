// ============================================================
//   DB-03 — Designs: contrato da API
//
//   Falam com a API, não com a implementação. Passavam iguais com
//   o controller em SQL puro: são a prova de que a migração para o
//   Prisma não mudou nada para quem consome. Autorização, documento
//   do Studio e imagens têm testes próprios (idor-designs,
//   studio-config e studio-assets).
// ============================================================

import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { esperarBloqueios } from "../helpers/bloqueio.js";
import { esperarProblema } from "../helpers/problem.js";

const CAMPOS_DESIGN = [
  "antiReflective", "bridgeStyle", "color", "config", "createdAt", "frameProfile", "id", "isSunglasses",
  "model", "name", "published", "templeOpen", "templeStyle", "topBar", "updatedAt",
];

const config = {
  version: 1, frontModel: "aviator", templeModel: "round", frameProfile: "bold",
  frameMaterial: "acetate", color: "#123456", finish: "solid", isSunglasses: true,
  lensMaterial: "cr39", lensTreatments: ["anti_reflective"], nosePadMaterial: "silicone",
  templeTipMaterial: "acetate", hingeMaterial: "stainless_steel", templeOpen: 0.8,
  artwork: { version: 1, layers: [] },
};

async function listar(token: string) {
  const res = await request(app).get("/api/designs").set(...comToken(token));
  expect(res.status).toBe(200);
  return res.body.designs as Array<Record<string, unknown>>;
}

describe("designs — contrato da API (DB-03)", () => {
  it("criar só com o obrigatório devolve o id e grava os valores padrão", async () => {
    const dono = await criarUsuario();

    const res = await request(app).post("/api/designs").set(...comToken(dono.token))
      .send({ name: "Simples", model: "wayfarer", color: "#000000" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ message: "Design salvo com sucesso.", id: expect.any(String) });
    const [design] = await listar(dono.token);
    expect(Object.keys(design).sort()).toEqual(CAMPOS_DESIGN);
    expect(design).toMatchObject({
      id: res.body.id, name: "Simples", model: "wayfarer", color: "#000000",
      isSunglasses: false, antiReflective: false, templeStyle: "standard", topBar: false,
      bridgeStyle: "keyhole", frameProfile: "medium", templeOpen: 0, published: false, config: null,
    });
    expect(Number.isNaN(Date.parse(String(design.createdAt)))).toBe(false);
  });

  it("criar com os campos legados grava cada um, e a abertura é arredondada no banco", async () => {
    const dono = await criarUsuario();

    await request(app).post("/api/designs").set(...comToken(dono.token)).send({
      name: "Completo", model: "round", color: "#ffffff", is_sunglasses: true, anti_reflective: true,
      temple_style: "slim", top_bar: true, bridge_style: "classic", frame_profile: "thin",
      temple_open: 0.555, published: true,
    });

    expect((await listar(dono.token))[0]).toMatchObject({
      isSunglasses: true, antiReflective: true, templeStyle: "slim", topBar: true,
      bridgeStyle: "classic", frameProfile: "thin", templeOpen: 0.56, published: true,
    });
  });

  it("lista do mais novo para o mais antigo", async () => {
    const dono = await criarUsuario();
    for (const [name, dia] of [["Antigo", "01"], ["Novo", "03"], ["Meio", "02"]]) {
      await prisma.savedDesign.create({
        data: { id: `design-${name}`, usuarioId: dono.id, name, model: "round", color: "#000000", createdAt: new Date(`2026-01-${dia}T00:00:00Z`) },
      });
    }

    expect((await listar(dono.token)).map(design => design.name)).toEqual(["Novo", "Meio", "Antigo"]);
  });

  it("atualizar sem documento grava os campos enviados, avança o updatedAt e mantém o createdAt", async () => {
    const dono = await criarUsuario();
    const criado = await request(app).post("/api/designs").set(...comToken(dono.token))
      .send({ name: "Antes", model: "round", color: "#000000", published: true });
    const [antes] = await listar(dono.token);
    await new Promise(resolve => setTimeout(resolve, 20));

    const res = await request(app).put(`/api/designs/${criado.body.id}`).set(...comToken(dono.token))
      .send({ name: "Depois", model: "aviator", color: "#ffffff", temple_open: 1.2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Design atualizado com sucesso.", id: criado.body.id });
    const [depois] = await listar(dono.token);
    expect(depois).toMatchObject({
      name: "Depois", model: "aviator", color: "#ffffff", templeOpen: 1.2, published: false,
      templeStyle: "standard", bridgeStyle: "keyhole", frameProfile: "medium", config: null,
    });
    expect(depois.createdAt).toBe(antes.createdAt);
    expect(Date.parse(String(depois.updatedAt))).toBeGreaterThan(Date.parse(String(antes.updatedAt)));
  });

  it("atualizar com documento deriva as colunas do documento, não do corpo", async () => {
    const dono = await criarUsuario();
    const criado = await request(app).post("/api/designs").set(...comToken(dono.token))
      .send({ name: "Studio", model: "round", color: "#000000" });

    await request(app).put(`/api/designs/${criado.body.id}`).set(...comToken(dono.token)).send({
      name: "Studio", model: "ignorado", color: "#999999", is_sunglasses: false, anti_reflective: false,
      frame_profile: "thin", temple_open: 0.1, config,
    });

    expect((await listar(dono.token))[0]).toMatchObject({
      model: "aviator_front_round_temples", color: "#123456", isSunglasses: true, antiReflective: true,
      frameProfile: "bold", templeOpen: 0.8, config: expect.objectContaining({ frontModel: "aviator" }),
    });
  });

  it("criar com documento devolve o documento na listagem", async () => {
    const dono = await criarUsuario();

    await request(app).post("/api/designs").set(...comToken(dono.token))
      .send({ name: "Com documento", model: "aviator_front_round_temples", color: "#123456", config });

    expect((await listar(dono.token))[0].config).toEqual(config);
  });

  it("remover devolve a mensagem e o design some", async () => {
    const dono = await criarUsuario();
    const criado = await request(app).post("/api/designs").set(...comToken(dono.token))
      .send({ name: "Temporário", model: "round", color: "#000000" });

    const res = await request(app).delete(`/api/designs/${criado.body.id}`).set(...comToken(dono.token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Design removido com sucesso." });
    expect(await listar(dono.token)).toEqual([]);
  });

  // A exclusão de imagem trava a linha antes de decidir. Sem o FOR UPDATE do
  // salvamento, o design lia a imagem ainda "ready" e a referenciava depois
  // de ela ter sido marcada para apagar.
  it("imagem marcada para exclusão durante o salvamento: 404 e nenhuma referência", async () => {
    const dono = await criarUsuario();
    const assetId = randomUUID();
    await prisma.studioAsset.create({ data: { id: assetId, usuarioId: dono.id, width: 8, height: 8, bytes: 10, state: "ready" } });
    const imagem = { id: "art-1", kind: "image", assetId, zone: "front-left", crop: { x: 0, y: 0, width: 1, height: 1 }, x: 0, y: 0, size: 0.8, rotation: 0 };

    const conexao = await pool.connect();
    let salvamento: Promise<request.Response>;
    try {
      await conexao.query("BEGIN");
      await conexao.query("SELECT id FROM studio_assets WHERE id = $1 FOR UPDATE", [assetId]);
      salvamento = request(app).post("/api/designs").set(...comToken(dono.token)).send({
        name: "Com imagem", model: "aviator_front_round_temples", color: "#123456",
        config: { ...config, artwork: { version: 3, layers: [imagem] } },
      }).then(r => r);
      await esperarBloqueios();
      await conexao.query("UPDATE studio_assets SET state = 'deleting' WHERE id = $1", [assetId]);
      await conexao.query("COMMIT");
    } catch (erro) {
      await conexao.query("ROLLBACK");
      throw erro;
    } finally {
      conexao.release();
    }

    expect((await salvamento).status).toBe(404);
    expect(await prisma.studioDesignAsset.count({ where: { assetId } })).toBe(0);
    expect(await prisma.savedDesign.count()).toBe(0);
  });

  it("token de um usuário que não existe mais não cria design: 401", async () => {
    const dono = await criarUsuario();
    await prisma.usuario.delete({ where: { id: dono.id } });

    const res = await request(app).post("/api/designs").set(...comToken(dono.token))
      .send({ name: "Órfão", model: "round", color: "#000000" });

    esperarProblema(res, 401, "unauthorized");
    expect(await prisma.savedDesign.count()).toBe(0);
  });
});
