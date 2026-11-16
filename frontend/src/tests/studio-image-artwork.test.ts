import { describe, expect, it } from "vitest";
import { hasUnapprovedCustomization, normalizeArtwork } from "../eyewear/artwork";

const assetId = "421c683d-aada-4bc8-928d-5ff288460e0e";
const image = {
  kind: "image", id: "sample", assetId, zone: "temple-left",
  x: 0.25, y: 0, size: 0.8, rotation: 15, crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.7 },
};

describe("image artwork documents", () => {
  it("keeps image placement and crop without persisting a URL", () => {
    const artwork = normalizeArtwork({ version: 3, layers: [{ ...image, url: "blob:transient" }] });
    expect(artwork).toEqual({ version: 3, layers: [image] });
    expect(hasUnapprovedCustomization({ artwork })).toBe(true);
  });

  it("rejects unsupported regions and references and keeps an intentionally empty v3", () => {
    expect(normalizeArtwork({ version: 3, layers: [
      { ...image, zone: "lens-left" }, { ...image, assetId: "https://example.invalid/image" },
      { ...image, crop: { ...image.crop, width: 1 } },
    ] })).toEqual({ version: 3, layers: [] });
  });
});
