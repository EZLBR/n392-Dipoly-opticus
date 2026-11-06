import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";

const layer = { id: "layer-1", text: "Minha marca", zone: "temple-right", font: "sans", color: "#f7f0db", x: 0.2, y: 0, size: 0.75, rotation: 5 };
const config = {
  version: 1, frontModel: "wayfarer", templeModel: "round", frameProfile: "medium",
  frameMaterial: "acetate", color: "#382016", finish: "tortoise", isSunglasses: false,
  lensMaterial: "cr39", lensTreatments: ["anti_reflective"], nosePadMaterial: "silicone",
  templeTipMaterial: "acetate", hingeMaterial: "stainless_steel", templeOpen: 0.3,
  artwork: { version: 1, layers: [layer] },
};
const design = { id: "text-design", name: "Meu óculos", model: "wayfarer_front_round_temples", color: "#382016" };
const drawing = {
  id: "drawing-1", kind: "drawing", zone: "temple-left",
  strokes: [{ color: "#00aabb", width: 5, points: [[10, 40], [980, 960]] }],
};

describe("STUDIO-02 — saved configuration", () => {
  it("round trips mixed art, retains drawings on older clients and allows explicit removal", async () => {
    const owner = await criarUsuario();
    const authorization = comToken(owner.token);
    const artwork = { version: 2, layers: [layer, drawing] };
    const save = (config: unknown) => request(app).post("/api/designs").set(...authorization).send({ ...design, config });
    const read = async () => (await request(app).get("/api/designs").set(...authorization)).body.designs[0].config.artwork;
    expect((await save({ ...config, artwork })).status).toBe(201);
    expect(await read()).toEqual(artwork);
    expect((await save({ ...config, color: "#abcdef", artwork: { version: 1, layers: [] } })).status).toBe(200);
    expect(await read()).toEqual(artwork);
    const edited = { ...layer, text: "Texto editado" };
    expect((await save({ ...config, artwork: { version: 1, layers: [edited] } })).status).toBe(200);
    expect(await read()).toEqual({ version: 2, layers: [edited, drawing] });
    expect((await save({ ...config, artwork: { version: 2, layers: [edited] } })).status).toBe(200);
    expect(await read()).toEqual({ version: 2, layers: [edited] });
  });

  it.each([
    { ...drawing, zone: "lens-left" },
    { ...drawing, strokes: [{ ...drawing.strokes[0], width: 21 }] },
    { ...drawing, strokes: [{ ...drawing.strokes[0], points: [[1001, 20]] }] },
    { ...drawing, strokes: [{ ...drawing.strokes[0], points: Array.from({ length: 129 }, () => [50, 50]) }] },
  ])("rejects out-of-bounds drawing data", async invalid => {
    const owner = await criarUsuario();
    const response = await request(app).post("/api/designs").set(...comToken(owner.token)).send({
      ...design, config: { ...config, artwork: { version: 2, layers: [invalid] } },
    });
    expect(response.status).toBe(400);
  });
  it("returns the complete artwork to a fresh authenticated client and preserves edits", async () => {
    const owner = await criarUsuario();
    const saved = await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, config });
    expect(saved.status).toBe(201);
    const fresh = await request(app).get("/api/designs").set(...comToken(owner.token));
    expect(fresh.body.designs[0].config).toEqual(config);
    const edited = { ...config, artwork: { version: 1, layers: [{ ...layer, text: "Texto novo" }] } };
    expect((await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, config: edited })).status).toBe(200);
    expect((await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs[0].config).toEqual(edited);
    const other = await criarUsuario();
    expect((await request(app).get("/api/designs").set(...comToken(other.token))).body.designs).toEqual([]);
  });

  it("keeps legacy records readable when they have no configuration document", async () => {
    const owner = await criarUsuario();
    expect((await request(app).post("/api/designs").set(...comToken(owner.token)).send(design)).status).toBe(201);
    const response = await request(app).get("/api/designs").set(...comToken(owner.token));
    expect(response.body.designs[0]).toMatchObject({ name: "Meu óculos", model: "wayfarer_front_round_temples", color: "#382016" });
  });

  it("applies legacy edits to a modern document while retaining its artwork", async () => {
    const owner = await criarUsuario();
    await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, config });
    const response = await request(app).post("/api/designs").set(...comToken(owner.token))
      .send({ ...design, model: "round_front_cateye_temples", color: "#abcdef", frame_profile: "bold", anti_reflective: false });
    expect(response.status).toBe(200);
    const updated = (await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs[0].config;
    expect(updated).toMatchObject({ frontModel: "round", templeModel: "cateye", color: "#abcdef", frameProfile: "bold", lensTreatments: [] });
    expect(updated.artwork).toEqual(config.artwork);
  });

  it.each([
    { ...layer, zone: "lens-left" },
    { ...layer, text: "x".repeat(25) },
    { ...layer, x: 2 },
    { ...layer, size: 2 },
    { ...layer, rotation: 90 },
  ])("rejects an invalid layer before saving it: %j", async invalid => {
    const owner = await criarUsuario();
    const response = await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, config: { ...config, artwork: { version: 1, layers: [invalid] } } });
    expect(response.status).toBe(400);
    expect((await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs).toEqual([]);
  });

  it("rejects more than six layers", async () => {
    const owner = await criarUsuario();
    const response = await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, config: { ...config, artwork: { version: 1, layers: Array.from({ length: 7 }, (_, i) => ({ ...layer, id: `layer-${i}` })) } } });
    expect(response.status).toBe(400);
  });

  it("persists a frame pattern and preserves it through legacy edits", async () => {
    const owner = await criarUsuario();
    const surfacePattern = { version: 1, style: "checker", scale: 3, rotation: 45, ink: "#aabbcc" };
    const saved = await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, config: { ...config, surfacePattern } });
    expect(saved.status).toBe(201);
    expect((await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs[0].config.surfacePattern).toEqual(surfacePattern);
    const edited = await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, color: "#abcdef" });
    expect(edited.status).toBe(200);
    expect((await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs[0].config.surfacePattern).toEqual(surfacePattern);
    const legacyConfig = { ...config, color: "#fedcba" };
    expect((await request(app).post("/api/designs").set(...comToken(owner.token))
      .send({ ...design, color: legacyConfig.color, config: legacyConfig })).status).toBe(200);
    expect((await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs[0].config)
      .toMatchObject({ color: legacyConfig.color, surfacePattern });
    const disabled = { ...surfacePattern, style: "none" };
    expect((await request(app).post("/api/designs").set(...comToken(owner.token))
      .send({ ...design, config: { ...config, surfacePattern: disabled } })).status).toBe(200);
    expect((await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs[0].config.surfacePattern).toEqual(disabled);
  });

  it.each([
    { version: 1, style: "unknown", scale: 2, rotation: 0, ink: "#ffffff" },
    { version: 1, style: "checker", scale: 7, rotation: 0, ink: "#ffffff" },
    { version: 1, style: "checker", scale: 2, rotation: 181, ink: "#ffffff" },
    { version: 1, style: "checker", scale: 2, rotation: 0, ink: "red" },
    { version: 99, style: "checker", scale: 2, rotation: 0, ink: "#ffffff" },
  ])("rejects invalid surface pattern %j", async surfacePattern => {
    const owner = await criarUsuario();
    expect((await request(app).post("/api/designs").set(...comToken(owner.token)).send({ ...design, config: { ...config, surfacePattern } })).status).toBe(400);
    expect((await request(app).get("/api/designs").set(...comToken(owner.token))).body.designs).toEqual([]);
  });
});
