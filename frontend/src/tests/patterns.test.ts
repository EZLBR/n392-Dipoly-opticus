import { describe, expect, it, vi } from "vitest";
import { normalizeConfig } from "../eyewear/config";
import * as THREE from "three";
import { createMaterials } from "../eyewear/materials";

describe("versioned frame surface patterns (#86)", () => {
  it("leaves legacy frames without a new surface pattern", () => {
    expect(normalizeConfig({ model: "round", color: "#112233" }).surfacePattern).toEqual({ version: 1, style: "none", scale: 2, rotation: 0, ink: "#f7f0db" });
  });
  it("keeps selected pattern and parameters after serialization and reopening", () => {
    const config = normalizeConfig({ surfacePattern: { version: 1, style: "checker", scale: 3, rotation: 45, ink: "#aabbcc" } });
    expect(normalizeConfig(JSON.parse(JSON.stringify({ config }))).surfacePattern).toEqual({ version: 1, style: "checker", scale: 3, rotation: 45, ink: "#aabbcc" });
  });
  it("bounds invalid numbers and rejects unknown versions without changing old materials", () => {
    expect(normalizeConfig({ surfacePattern: { version: 1, style: "dots", scale: 30, rotation: -200, ink: "javascript:red" } }).surfacePattern)
      .toEqual({ version: 1, style: "dots", scale: 6, rotation: -180, ink: "#f7f0db" });
    expect(normalizeConfig({ surfacePattern: { version: 99, style: "checker" } }).surfacePattern?.style).toBe("none");
    expect(normalizeConfig({ surfacePattern: { version: 1, style: "stripes", scale: NaN, rotation: Infinity } }).surfacePattern)
      .toMatchObject({ scale: 2, rotation: 0 });
  });
});

describe("frame pattern materials", () => {
  it.each(["stripes", "dots", "checker"])("renders %s on the frame without changing lenses", style => {
    const materials = createMaterials();
    const config = normalizeConfig({ finish: "solid", color: "#112233" });
    materials.update(config);
    const lensColor = materials.materials.lens.color.getHexString();
    materials.update(normalizeConfig({ ...config, surfacePattern: { version: 1, style, scale: 3, rotation: 45, ink: "#aabbcc" } }));
    const map = materials.materials.frame.map as THREE.DataTexture;
    expect(map).not.toBeNull();
    expect(map.repeat.toArray()).toEqual([3, 3]);
    expect(map.rotation).toBeCloseTo(Math.PI / 4);
    const data = map.image.data as Uint8Array;
    const colors = new Set(Array.from({ length: data.length / 4 }, (_, i) => Array.from(data.slice(i * 4, i * 4 + 3)).join(",")));
    expect(colors).toEqual(new Set(["17,34,51", "170,187,204"]));
    expect(materials.materials.lens.map).toBeNull();
    expect(materials.materials.lens.color.getHexString()).toBe(lensColor);
    materials.dispose();
  });
  it("disposes custom maps and restores the original material when a pattern is removed", () => {
    const materials = createMaterials();
    const original = normalizeConfig({ frameMaterial: "wood" });
    materials.update(original);
    const wood = materials.materials.frame.map;
    materials.update(normalizeConfig({ ...original, surfacePattern: { version: 1, style: "checker", scale: 2, rotation: 0, ink: "#aabbcc" } }));
    const custom = materials.materials.frame.map!;
    expect(custom).not.toBe(wood);
    const dispose = vi.spyOn(custom, "dispose");
    materials.update(original);
    expect(materials.materials.frame.map).toBe(wood);
    expect(dispose).toHaveBeenCalledTimes(1);
    materials.dispose();
  });
});
