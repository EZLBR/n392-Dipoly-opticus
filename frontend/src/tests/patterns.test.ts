import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../eyewear/config";

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
