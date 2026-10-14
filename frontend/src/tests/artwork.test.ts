import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../eyewear/config";
import { mergeSavedDesigns } from "../eyewear/storage";

const layer = { id: "text-1", text: "Opticus", zone: "temple-right", font: "sans", color: "#112233", x: 0.2, y: 0, size: 0.7, rotation: 10 };

describe("versioned Studio artwork", () => {
  it("preserves text layers on a serialized design round trip", () => {
    const config = normalizeConfig({ artwork: { version: 1, layers: [layer] } });
    expect(config.artwork).toEqual({ version: 1, layers: [layer] });
    expect(normalizeConfig(JSON.parse(JSON.stringify({ config }))).artwork).toEqual(config.artwork);
  });

  it("opens older designs without creating any artwork", () => {
    expect(normalizeConfig({ model: "round", color: "#123456" }).artwork).toEqual({ version: 1, layers: [] });
  });

  it("rejects lens zones and contains malformed placement values", () => {
    const config = normalizeConfig({ artwork: { version: 1, layers: [
      { ...layer, zone: "lens-left" },
      { ...layer, x: Infinity, y: -10, size: 20, rotation: 100, color: "url(bad)" },
    ] } });
    expect(config.artwork.layers).toHaveLength(1);
    expect(config.artwork.layers[0]).toMatchObject({ x: 0, y: -1, size: 1, rotation: 30, color: "#f7f0db" });
  });

  it("uses a full remote document instead of another device's outdated appearance", () => {
    const result = mergeSavedDesigns([
      { id: "saved", config: { frameMaterial: "gold", artwork: { version: 1, layers: [layer] } } },
    ], [{ id: "saved", config: { frameMaterial: "wood" } }]);
    expect(result[0].config.frameMaterial).toBe("gold");
    expect(result[0].config.artwork.layers).toEqual([layer]);
  });

  it("preserves a known unsynced edit of an existing remote design", () => {
    const result = mergeSavedDesigns([
      { id: "saved", config: normalizeConfig() },
    ], [{ id: "saved", syncStatus: "local", config: normalizeConfig({ artwork: { version: 1, layers: [layer] } }) }]);
    expect(result[0].config.artwork.layers).toEqual([layer]);
    expect(result[0].syncStatus).toBe("local");
  });
});
