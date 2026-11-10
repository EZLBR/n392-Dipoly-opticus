import { expect, it, vi } from "vitest";
import * as THREE from "three";
import { normalizeConfig, silhouettes } from "../eyewear/config";
import { buildEyewear } from "../eyewear/geometry";
import { createMaterials } from "../eyewear/materials";
import { artworkZones, type TextLayer } from "../eyewear/artwork";
import { createArtworkRenderer, projectArtworkLayer } from "../eyewear/artwork-renderer";
import { drawingAspect } from "../eyewear/drawing";

const layer: TextLayer = { id: "brand", text: "Opticus", zone: "temple-right", font: "sans", color: "#ffffff", x: 0, y: 0, size: 0.7, rotation: 0 };

it("projects each supported zone onto an actual frame surface for every silhouette", () => {
  for (const frontModel of silhouettes) {
    const config = normalizeConfig({ frontModel });
    const materials = createMaterials(), model = buildEyewear(config, materials.materials);
    for (const zone of artworkZones) {
      const projection = projectArtworkLayer(model, config, { ...layer, zone }, 5);
      expect(projection).not.toBeNull();
      expect(projection!.surface.name).toBe(zone.startsWith("front") ? "rim" : "temple");
      expect(projection!.geometry.getAttribute("position").count).toBeGreaterThan(0);
      expect(Array.from(projection!.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      projection!.geometry.dispose();
    }
    model.dispose(); materials.dispose();
  }
});

it("attaches temple lettering to the folding temple and disposes superseded resources", () => {
  const config = normalizeConfig({ artwork: { version: 1, layers: [layer] } });
  const materials = createMaterials(), model = buildEyewear(config, materials.materials);
  const textures: THREE.Texture[] = [];
  const renderer = createArtworkRenderer(() => {
    const texture = new THREE.Texture(); textures.push(texture);
    return { texture, aspect: 5 };
  });
  renderer.update(model, config);
  const lettering = model.temples[1].getObjectByName("art:brand") as THREE.Mesh;
  expect(lettering).toBeDefined();
  model.setFold(1);
  // The parent's rotation changes the decal's world orientation as well as its anchor.
  expect(lettering.getWorldQuaternion(new THREE.Quaternion()).y).not.toBe(0);
  const disposeGeometry = vi.spyOn(lettering.geometry, "dispose");
  const disposeTexture = vi.spyOn(textures[0], "dispose");
  renderer.update(model, normalizeConfig());
  expect(model.temples[1].getObjectByName("art:brand")).toBeUndefined();
  expect(disposeGeometry).toHaveBeenCalledTimes(1);
  expect(disposeTexture).toHaveBeenCalledTimes(1);
  renderer.dispose(); model.dispose(); materials.dispose();
});

it("keeps the complete text footprint on a thin sloping cat-eye rim", () => {
  const config = normalizeConfig({ frontModel: "cateye", frameProfile: "thin" });
  const materials = createMaterials(), model = buildEyewear(config, materials.materials);
  const projection = projectArtworkLayer(model, config, { ...layer, zone: "front-right", x: 0, y: 1, size: 1 }, 10)!;
  const uv = projection.geometry.getAttribute("uv");
  const u = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
  expect(Math.min(...u)).toBeLessThan(0.02);
  expect(Math.max(...u)).toBeGreaterThan(0.98);
  projection.geometry.dispose(); model.dispose(); materials.dispose();
});

it("attaches a restored drawing to the same allowed surface as the silhouette changes", () => {
  const strokes = [{ color: "#112233", width: 4, points: [[0, 0], [1000, 1000]] }];
  const texture = vi.fn(layer => ({ texture: new THREE.Texture(), aspect: drawingAspect(layer.zone) }));
  const renderer = createArtworkRenderer(undefined, texture);
  const surfaces = createMaterials();
  for (const silhouette of silhouettes) {
    const config = normalizeConfig({
      frontModel: silhouette, templeModel: silhouette, frameProfile: "thin",
      artwork: { version: 2, layers: artworkZones.map(zone => ({ id: zone, zone, kind: "drawing", strokes })) },
    });
    const model = buildEyewear(config, surfaces.materials);
    renderer.update(model, config);
    artworkZones.forEach(zone => {
      const mesh = model.group.getObjectByName(`art:${zone}`) as THREE.Mesh;
      const expectedParent = zone.startsWith("front") ? model.group : model.temples[zone.endsWith("left") ? 0 : 1];
      expect(mesh.parent).toBe(expectedParent);
      const uv = mesh.geometry.getAttribute("uv");
      const u = Array.from({ length: uv.count }, (_, i) => uv.getX(i));
      expect(Math.min(...u)).toBeLessThan(0.02);
      expect(Math.max(...u)).toBeGreaterThan(0.98);
    });
    renderer.dispose(); model.dispose();
  }
  expect(texture).toHaveBeenCalledTimes(silhouettes.length * artworkZones.length);
  surfaces.dispose();
});
