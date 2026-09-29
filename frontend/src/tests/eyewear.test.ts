import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import {
  normalizeConfig,
  defaultConfig,
  geometryKey,
  silhouettes,
} from "../eyewear/config";
import { buildEyewear, lensShape, proportions } from "../eyewear/geometry";
import { createMaterials, lensAppearance } from "../eyewear/materials";
import { restoreStudio, mergeSavedDesigns } from "../eyewear/storage";

describe("canonical eyewear configuration", () => {
  it("migrates legacy models, snake_case fields, treatment aliases and cart specs", () => {
    const config = normalizeConfig({
      model: "cateye_front_aviator_temples",
      material: "metal",
      frame_profile: "thin",
      temple_open: 0.3,
      is_sunglasses: true,
      lensTreatments: ["anti-reflective", "anti_reflective", "invalid"],
    });
    expect(config).toMatchObject({
      frontModel: "cateye",
      templeModel: "aviator",
      frameMaterial: "stainless_steel",
      frameProfile: "thin",
      templeOpen: 0.3,
      isSunglasses: true,
      lensTreatments: ["anti_reflective"],
    });
    expect(
      normalizeConfig({ customSpecs: { model: "square", color: "#123abc" } }),
    ).toMatchObject({ frontModel: "wayfarer", color: "#123abc" });
  });
  it("normalizes malformed values and preserves every current field on a round trip", () => {
    expect(
      normalizeConfig({
        frontModel: "bad",
        color: "javascript:red",
        templeOpen: Infinity,
        lensTreatments: null,
      }),
    ).toMatchObject({ color: defaultConfig.color, templeOpen: 0 });
    const config = normalizeConfig({
      ...defaultConfig,
      finish: "crystal",
      templeOpen: 1.1,
      frameMaterial: "titanium",
      lensMaterial: "polycarbonate",
      nosePadMaterial: "acetate",
      templeTipMaterial: "rubber",
      hingeMaterial: "gold",
    });
    expect(normalizeConfig(JSON.parse(JSON.stringify({ config })))).toEqual(
      config,
    );
  });
  it("only changes the geometry key for structural options", () => {
    const config = normalizeConfig();
    expect(
      geometryKey({
        ...config,
        color: "#112233",
        isSunglasses: true,
        templeOpen: 1,
        finish: "crystal",
      }),
    ).toBe(geometryKey(config));
    expect(geometryKey({ ...config, frameProfile: "bold" })).not.toBe(
      geometryKey(config),
    );
    expect(geometryKey({ ...config, frameMaterial: "titanium" })).not.toBe(
      geometryKey(config),
    );
  });
});

describe("procedural construction", () => {
  for (const frontModel of silhouettes)
    it(
      frontModel +
        " has symmetric rims, finite meshes, real-scale bounds and complete components",
      () => {
        const config = normalizeConfig({ ...defaultConfig, frontModel }),
          surfaces = createMaterials(),
          model = buildEyewear(config, surfaces.materials);
        const rims: THREE.Mesh[] = [],
          lenses: THREE.Mesh[] = [];
        model.group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const position = object.geometry.getAttribute("position");
          expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
          expect(object.geometry.getAttribute("normal").count).toBe(
            position.count,
          );
          if (object.name === "rim") rims.push(object);
          if (object.name === "lens") lenses.push(object);
        });
        expect(rims).toHaveLength(2);
        expect(lenses).toHaveLength(2);
        expect(model.temples).toHaveLength(2);
        const left = rims[0].geometry.getAttribute("position"),
          right = rims[1].geometry.getAttribute("position");
        rims.forEach((r) => r.geometry.computeBoundingBox());
        expect(rims[0].geometry.boundingBox!.min.x).toBeCloseTo(
          -rims[1].geometry.boundingBox!.max.x,
          4,
        );
        expect(left.count).toBe(right.count);
        const bounds = new THREE.Box3().setFromObject(model.group),
          size = bounds.getSize(new THREE.Vector3());
        expect(size.x).toBeGreaterThan(110);
        expect(size.x).toBeLessThan(160);
        expect(size.z).toBeGreaterThan(130);
        expect(size.z).toBeLessThan(175);
        expect(model.group.getObjectByName("bridge")).toBeDefined();
        for (const temple of model.temples) {
          expect(temple.getObjectByName("hinge")).toBeDefined();
          expect(temple.getObjectByName("tip")).toBeDefined();
          const mesh = temple.getObjectByName("temple") as THREE.Mesh;
          expect(mesh.geometry.getAttribute("normal").getX(0)).toBeGreaterThan(
            0,
          );
        }
        model.dispose();
        surfaces.dispose();
      },
    );
  it("folds without rebuilding meshes and releases each geometry once", () => {
    const surfaces = createMaterials(),
      model = buildEyewear(normalizeConfig(), surfaces.materials);
    const geometries = new Set<THREE.BufferGeometry>();
    model.group.traverse((o) => {
      if (o instanceof THREE.Mesh) geometries.add(o.geometry);
    });
    const dispose = [...geometries].map((g) => vi.spyOn(g, "dispose"));
    model.setFold(1.1);
    expect(model.temples[0].rotation.y).toBe(-1.1);
    expect(model.temples[1].rotation.y).toBe(1.1);
    expect(model.temples[0].rotation.x).not.toBe(model.temples[1].rotation.x);
    model.dispose();
    dispose.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    surfaces.dispose();
  });
  it("shares contours and measurements with the overlay", () => {
    for (const frontModel of silhouettes) {
      const d = proportions(normalizeConfig({ frontModel }));
      const contour = lensShape(
        frontModel,
        d.lensWidth,
        d.lensHeight,
      ).getPoints(40);
      expect(contour.length).toBeGreaterThan(40);
      expect(contour[0].distanceTo(contour.at(-1)!)).toBeLessThan(0.001);
      expect(d.center * 2 - d.lensWidth).toBe(d.bridge);
    }
  });
});

describe("physical materials", () => {
  it("updates existing materials for frame, coating, lenses and component choices", () => {
    const bundle = createMaterials(),
      reference = bundle.materials.frame;
    bundle.update(normalizeConfig());
    expect(reference.map).not.toBeNull();
    expect(reference.metalness).toBe(0);
    bundle.update(
      normalizeConfig({
        ...defaultConfig,
        frameMaterial: "titanium",
        lensMaterial: "polycarbonate",
        lensTreatments: ["mirrored"],
        hingeMaterial: "gold",
      }),
    );
    expect(bundle.materials.frame).toBe(reference);
    expect(reference.metalness).toBe(1);
    expect(reference.map).toBeNull();
    expect(bundle.materials.lens.transmission).toBe(0);
    expect(bundle.materials.lens.ior).toBe(1.586);
    expect(bundle.materials.tip.metalness).toBe(0);
    bundle.update(normalizeConfig({ ...defaultConfig, finish: "crystal" }));
    expect(reference.transmission).toBe(0.72);
    expect(bundle.materials.lens.transmission).toBe(1);
    bundle.dispose();
  });
  it("darkens photochromic lenses only in sunlight and does not invent a UV color", () => {
    const c = normalizeConfig({ lensTreatments: ["photochromic"] });
    expect(lensAppearance(c, "studio").dark).toBe(false);
    expect(lensAppearance(c, "sunlight").dark).toBe(true);
    expect(
      lensAppearance(normalizeConfig({ lensTreatments: ["uv_protection"] }))
        .color,
    ).toBe("#ffffff");
  });
});

describe("draft and saved design compatibility", () => {
  const storage = (values: Record<string, string>) => ({
    getItem: (key: string) => values[key] ?? null,
  });
  it("restores the complete draft before autosave, including fold and finish", () => {
    const config = { ...defaultConfig, templeOpen: 0.9, finish: "crystal" };
    expect(
      restoreStudio(
        storage({ opticus_creator_draft: JSON.stringify({ config }) }),
      ).config,
    ).toEqual(config);
    expect(
      restoreStudio(storage({ opticus_creator_draft: "{bad json" })).config,
    ).toEqual(defaultConfig);
  });
  it("does not overwrite a selected saved design with an unrelated draft", () => {
    const result = restoreStudio(
      storage({
        opticus_active_design: "0",
        opticus_designs: JSON.stringify([
          { id: "a", config: { frontModel: "cateye", frameMaterial: "gold" } },
        ]),
        opticus_creator_draft: JSON.stringify({
          source: "new",
          config: defaultConfig,
        }),
      }),
    );
    expect(result.config.frontModel).toBe("cateye");
    expect(result.config.frameMaterial).toBe("gold");
    expect(result.source).toBe("design:a");
  });
  it("follows stable IDs after server sorting and tolerates unavailable storage", () => {
    const values = {
      opticus_active_design: "0",
      opticus_active_design_id: "b",
      opticus_designs: JSON.stringify([
        { id: "a", model: "round" },
        { id: "b", model: "cateye" },
      ]),
    };
    expect(restoreStudio(storage(values)).config.frontModel).toBe("cateye");
    expect(
      restoreStudio({
        getItem: () => {
          throw new Error("Storage blocked");
        },
      }).config,
    ).toEqual(defaultConfig);
  });
  it("preserves legacy top-level materials and respects remote anti-reflective changes", () => {
    const result = mergeSavedDesigns(
      [{ id: "old", model: "aviator", antiReflective: true }],
      [{ id: "old", frameMaterial: "gold", lensTreatments: ["polarized"] }],
    );
    expect(result[0].config.frameMaterial).toBe("gold");
    expect(result[0].config.lensTreatments).toEqual([
      "polarized",
      "anti_reflective",
    ]);
  });
  it("preserves device-local materials when refreshing old API records, without losing offline designs", () => {
    const local = [
      {
        id: "a",
        config: {
          ...defaultConfig,
          frameMaterial: "titanium",
          finish: "crystal",
        },
      },
      { id: "offline", syncStatus: "local", config: defaultConfig },
    ];
    const result = mergeSavedDesigns(
      [
        {
          id: "a",
          model: "cateye_front_aviator_temples",
          color: "#334455",
          isSunglasses: true,
        },
      ],
      local,
    );
    expect(result).toHaveLength(2);
    expect(result[0].config).toMatchObject({
      frontModel: "cateye",
      templeModel: "aviator",
      frameMaterial: "titanium",
      finish: "crystal",
      color: "#334455",
      isSunglasses: true,
    });
  });
});
