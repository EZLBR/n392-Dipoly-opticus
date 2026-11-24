import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import sharp from "sharp";
import { app } from "../setup/app.js";
import { comToken, criarUsuario, obterToken, type UsuarioDeTeste } from "../helpers/auth.js";
import { pool } from "../setup/db.js";
import { cleanupStudioAssets } from "../../src/services/studioAssets.js";

const endpoint = "/api/studio/assets";
let volume: string;
let png: Buffer;
const oldVolume = process.env.STUDIO_ASSET_DIR;
const crop = { x: 0.25, y: 0, width: 0.75, height: 1 };
const imageLayer = (assetId: string) => ({
  id: "art-1", kind: "image", assetId, zone: "front-left", crop, x: 0.2, y: -0.1, size: 0.8, rotation: 15,
});
function design(assetId: string) {
  return {
    name: "Armação com imagem", model: "round_front_round_temples", color: "#112233",
    config: {
      version: 1, frontModel: "round", templeModel: "round", frameProfile: "medium",
      frameMaterial: "acetate", color: "#112233", finish: "solid", isSunglasses: false,
      lensMaterial: "cr39", lensTreatments: [], nosePadMaterial: "silicone",
      templeTipMaterial: "acetate", hingeMaterial: "stainless_steel", templeOpen: 1,
      artwork: { version: 3, layers: [imageLayer(assetId)] },
    },
  };
}
const upload = (user: UsuarioDeTeste, input = png, name = "arte.png") =>
  request(app).post(endpoint).set(...comToken(user.token)).attach("file", input, name);

describe("Imagens privadas no Studio", () => {
  beforeEach(async () => {
    volume = await mkdtemp(join(tmpdir(), "opticus-image-tests-"));
    process.env.STUDIO_ASSET_DIR = volume;
    png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "#4477ff80" } }).png().toBuffer();
  });

  afterEach(async () => {
    if (oldVolume === undefined) delete process.env.STUDIO_ASSET_DIR;
    else process.env.STUDIO_ASSET_DIR = oldVolume;
    if (volume) await rm(volume, { recursive: true, force: true });
  });

  it("só aceita envio e leitura pelo dono e recupera a imagem após novo login", async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();
    expect((await request(app).post(endpoint).attach("file", png, "arte.png")).status).toBe(401);
    const created = await upload(a);
    expect(created.status).toBe(201);
    const { asset } = created.body;
    expect(asset).toMatchObject({ mediaType: "image/webp", width: 8, height: 8 });
    expect(Object.keys(asset).sort()).toEqual(["bytes", "height", "id", "mediaType", "width"]);
    expect((await request(app).get(endpoint).set(...comToken(b.token))).body.assets).toEqual([]);
    const denied = await request(app).get(`${endpoint}/${asset.id}/content`).set(...comToken(b.token));
    const missing = await request(app).get(`${endpoint}/${randomUUID()}/content`).set(...comToken(b.token));
    expect(denied.status).toBe(404);
    expect(denied.body.detail).toBe(missing.body.detail);

    const saved = await request(app).post("/api/designs").set(...comToken(a.token)).send(design(asset.id));
    expect(saved.status).toBe(201);
    const token = await obterToken(a.email, a.senha);
    const designs = await request(app).get("/api/designs").set(...comToken(token));
    expect(designs.body.designs[0].config.artwork.layers).toEqual([imageLayer(asset.id)]);
    const content = await request(app).get(`${endpoint}/${asset.id}/content`).set(...comToken(token));
    expect(content.status).toBe(200);
    expect(content.headers["cache-control"]).toBe("private, no-store");
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
    expect(await sharp(content.body).metadata()).toMatchObject({ format: "webp", hasAlpha: true });
  });

  it("valida formato real, dados corrompidos, tamanho e dimensões", async () => {
    const a = await criarUsuario();
    expect((await upload(a, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status).toBe(415);
    expect((await upload(a, png.subarray(0, 33))).status).toBe(400);
    expect((await upload(a, Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(413);
    const wide = await sharp({ create: { width: 4097, height: 1, channels: 3, background: "#ffffff" } }).png().toBuffer();
    expect((await upload(a, wide)).status).toBe(400);
    for (const input of [await sharp(png).jpeg().toBuffer(), await sharp(png).webp().toBuffer()]) {
      expect((await upload(a, input)).status).toBe(201);
    }
  });

  it("preserva o documento ao rejeitar referências alheias, recortes inválidos ou clientes antigos", async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();
    const owned = (await upload(a)).body.asset.id;
    const foreign = (await upload(b)).body.asset.id;
    const saved = await request(app).post("/api/designs").set(...comToken(a.token)).send(design(owned));
    const url = `/api/designs/${saved.body.id}`;
    const edit = (payload: unknown) => request(app).put(url).set(...comToken(a.token)).send(payload as object);
    expect((await edit(design(foreign))).status).toBe(404);
    const tiny = design(owned);
    tiny.config.artwork.layers[0].crop = { x: 0, y: 0, width: 0.01, height: 1 };
    expect((await edit(tiny)).status).toBe(400);
    const old = design(owned);
    old.config.artwork = { version: 2, layers: [] };
    expect((await edit(old)).status).toBe(409);
    const { config: _config, ...legacy } = design(owned);
    expect((await edit({ ...legacy, name: "Novo nome" })).status).toBe(200);
    const list = await request(app).get("/api/designs").set(...comToken(a.token));
    expect(list.body.designs[0]).toMatchObject({ name: "Novo nome", config: { artwork: { version: 3, layers: [imageLayer(owned)] } } });
  });

  it("mantém imagens de outros designs e deixa descartar as que perderam referências", async () => {
    const a = await criarUsuario();
    const b = await criarUsuario();
    const first = (await upload(a)).body.asset.id;
    const replacement = (await upload(a)).body.asset.id;
    const save = () => request(app).post("/api/designs").set(...comToken(a.token)).send(design(first));
    const firstDesign = (await save()).body.id;
    const secondDesign = (await save()).body.id;
    const remove = (id: string, who = a) => request(app).delete(`${endpoint}/${id}`).set(...comToken(who.token));
    expect((await remove(first, b)).status).toBe(404);
    expect((await remove(first)).status).toBe(409);
    expect((await request(app).put(`/api/designs/${firstDesign}`).set(...comToken(a.token)).send(design(replacement))).status).toBe(200);
    expect((await remove(first)).status).toBe(409);
    expect((await request(app).delete(`/api/designs/${secondDesign}`).set(...comToken(a.token))).status).toBe(200);
    expect((await remove(first)).status).toBe(204);
    expect((await request(app).get(`${endpoint}/${first}/content`).set(...comToken(a.token))).status).toBe(404);
    expect((await remove(replacement)).status).toBe(409);
  });

  it("reserva a cota uma vez quando uploads concorrem e não publica arquivo após falha no volume", async () => {
    const a = await criarUsuario();
    await pool.query(`
      INSERT INTO studio_assets (id, usuario_id, width, height, bytes, state)
      SELECT gen_random_uuid(), $1, 1, 1, 1, 'ready' FROM generate_series(1, 19)`, [a.id]);
    const results = await Promise.all([upload(a), upload(a)]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    const b = await criarUsuario();
    const unavailable = join(volume, "not-a-directory");
    await writeFile(unavailable, "");
    process.env.STUDIO_ASSET_DIR = unavailable;
    expect((await upload(b)).status).toBe(503);
    expect((await request(app).get(endpoint).set(...comToken(b.token))).body.assets).toEqual([]);
  });

  it("retoma a exclusão de um arquivo quando o volume volta a aceitar operações", async () => {
    const a = await criarUsuario();
    const { asset } = (await upload(a)).body;
    const inaccessible = join(volume, "blocked");
    await mkdir(join(inaccessible, asset.id + ".webp"), { recursive: true });
    process.env.STUDIO_ASSET_DIR = inaccessible;
    const deletion = await request(app).delete(`${endpoint}/${asset.id}`).set(...comToken(a.token));
    expect(deletion.status).toBe(503);
    const tombstones = await pool.query("SELECT id FROM studio_assets WHERE id = $1 AND state = 'deleting'", [asset.id]);
    expect(tombstones.rowCount).toBe(1);
    process.env.STUDIO_ASSET_DIR = volume;
    await cleanupStudioAssets();
    expect((await pool.query("SELECT id FROM studio_assets WHERE id = $1", [asset.id])).rowCount).toBe(0);
    await expect(access(join(volume, asset.id + ".webp"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("não deixa uma exclusão concorrente quebrar a referência de um design", async () => {
    const a = await criarUsuario();
    const { asset } = (await upload(a)).body;
    const [saved, removed] = await Promise.all([
      request(app).post("/api/designs").set(...comToken(a.token)).send(design(asset.id)),
      request(app).delete(`${endpoint}/${asset.id}`).set(...comToken(a.token)),
    ]);
    const list = await request(app).get("/api/designs").set(...comToken(a.token));
    const content = await request(app).get(`${endpoint}/${asset.id}/content`).set(...comToken(a.token));
    if (saved.status === 201) {
      expect(removed.status).toBe(409);
      expect(list.body.designs[0].config.artwork.layers[0].assetId).toBe(asset.id);
      expect(content.status).toBe(200);
    } else {
      expect(saved.status).toBe(404);
      expect(removed.status).toBe(204);
      expect(list.body.designs).toEqual([]);
      expect(content.status).toBe(404);
    }
  });
});
