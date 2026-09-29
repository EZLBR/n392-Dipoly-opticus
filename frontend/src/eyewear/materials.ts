import * as THREE from "three";
import { isMetal, type EyewearConfig } from "./config";
import type { MaterialSet } from "./geometry";

function surfaceTexture(kind: "tortoise" | "wood" | "carbon") {
  const size = 256,
    pixels = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx),
      sy = fy * fy * (3 - 2 * fy);
    return THREE.MathUtils.lerp(
      THREE.MathUtils.lerp(hash(ix, iy), hash(ix + 1, iy), sx),
      THREE.MathUtils.lerp(hash(ix, iy + 1), hash(ix + 1, iy + 1), sx),
      sy,
    );
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2,
        v = (y / size) * Math.PI * 2;
      const cloud =
        noise(u * 1.7, v * 1.7) * 0.7 +
        noise(u * 4, v * 4) * 0.22 +
        noise(u * 13, v * 13) * 0.08;
      let rgb: number[];
      if (kind === "tortoise") {
        const t = THREE.MathUtils.smoothstep(cloud, 0.36, 0.7);
        rgb = [27 + t * 95, 17 + t * 51, 11 + t * 19];
      } else if (kind === "wood") {
        const t = 0.5 + 0.5 * Math.sin(v * 32 + Math.sin(u * 2) * 2);
        rgb = [65 + 55 * t, 34 + 32 * t, 17 + 18 * t];
      } else {
        const t =
          (((Math.floor(x / 16) + Math.floor(y / 16)) % 2 ? x : y) % 16) / 16;
        rgb = [22 + t * 35, 24 + t * 35, 26 + t * 35];
      }
      const i = (y * size + x) * 4;
      pixels.set([...rgb, 255], i);
    }
  const map = new THREE.DataTexture(pixels, size, size);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

/** Canonical palette; the camera overlay uses the average color of patterned materials. */
export function frameAppearance(c: EyewearConfig) {
  const texture: "wood" | "carbon" | "tortoise" | null =
    c.frameMaterial === "wood"
      ? "wood"
      : c.frameMaterial === "carbon_fiber"
        ? "carbon"
        : c.frameMaterial === "acetate" && c.finish === "tortoise"
          ? "tortoise"
          : null;
  const palette = { wood: "#805132", carbon: "#292d30", tortoise: "#714524" };
  return {
    texture,
    color: texture
      ? palette[texture]
      : c.frameMaterial === "gold"
        ? "#d3af6a"
        : c.color,
  };
}

export function lensAppearance(c: EyewearConfig, environment = "studio") {
  const mirrored = c.lensTreatments.includes("mirrored");
  const dark =
    c.isSunglasses ||
    (c.lensTreatments.includes("photochromic") && environment === "sunlight");
  return {
    mirrored,
    dark,
    color: mirrored
      ? "#b8c9d9"
      : dark
        ? "#354437"
        : c.lensTreatments.includes("blue_light")
          ? "#fff9e6"
          : "#ffffff",
  };
}

export function createMaterials() {
  const maps = {
    tortoise: surfaceTexture("tortoise"),
    wood: surfaceTexture("wood"),
    carbon: surfaceTexture("carbon"),
  };
  const materials: MaterialSet = Object.fromEntries(
    ["frame", "lens", "hinge", "pad", "tip"].map((key) => [
      key,
      new THREE.MeshPhysicalMaterial(),
    ]),
  ) as MaterialSet;
  function update(c: EyewearConfig, environment = "studio") {
    const { frame, lens, hinge, pad, tip } = materials;
    const metal = isMetal(c),
      crystal = c.frameMaterial === "acetate" && c.finish === "crystal";
    const frameLook = frameAppearance(c);
    frame.map = frameLook.texture ? maps[frameLook.texture] : null;
    frame.color.set(frame.map ? "#ffffff" : frameLook.color);
    frame.metalness = metal ? 1 : 0;
    frame.roughness =
      c.frameMaterial === "titanium"
        ? 0.37
        : c.frameMaterial === "tr90"
          ? 0.66
          : c.frameMaterial === "wood"
            ? 0.72
            : metal
              ? 0.2
              : 0.23;
    frame.clearcoat = ["acetate", "carbon_fiber"].includes(c.frameMaterial)
      ? 1
      : 0;
    frame.clearcoatRoughness = 0.13;
    frame.transmission = crystal ? 0.72 : 0;
    frame.thickness = 4;
    frame.ior = 1.48;
    frame.attenuationDistance = 12;
    const look = lensAppearance(c, environment);
    lens.color.set(look.color);
    lens.roughness = c.lensTreatments.includes("anti_reflective")
      ? 0.035
      : 0.07;
    lens.metalness = look.mirrored ? 1 : 0;
    lens.transmission = look.mirrored ? 0 : look.dark ? 0.7 : 1;
    lens.transparent = !look.mirrored;
    lens.opacity = look.mirrored || look.dark ? 1 : 0.4;
    lens.depthWrite = look.mirrored || look.dark;
    lens.thickness = 1.6;
    lens.ior = c.lensMaterial === "polycarbonate" ? 1.586 : 1.498;
    lens.attenuationColor.set(look.dark ? "#738574" : "#f8fcff");
    lens.attenuationDistance = look.dark ? 2.5 : 180;
    lens.envMapIntensity = c.lensTreatments.includes("anti_reflective")
      ? 0.55
      : 0.9;
    hinge.color.set(c.hingeMaterial === "gold" ? "#cdae70" : "#b3b8bd");
    hinge.metalness = 1;
    hinge.roughness = c.hingeMaterial === "titanium" ? 0.4 : 0.23;
    pad.color.set(
      c.nosePadMaterial === "titanium"
        ? "#b3b8bd"
        : c.nosePadMaterial === "acetate"
          ? c.color
          : "#f5efdf",
    );
    pad.metalness = c.nosePadMaterial === "titanium" ? 1 : 0;
    pad.transmission = c.nosePadMaterial === "silicone" ? 0.55 : 0;
    pad.thickness = 2;
    pad.roughness = 0.3;
    tip.copy(c.templeTipMaterial === "acetate" ? frame : pad);
    if (c.templeTipMaterial === "acetate" && c.frameMaterial !== "acetate") {
      tip.map = null;
      tip.color.set(c.color);
      tip.metalness = 0;
      tip.roughness = 0.25;
      tip.clearcoat = 1;
      tip.transmission = 0;
    }
    if (c.templeTipMaterial !== "acetate") {
      tip.map = null;
      tip.color.set(c.templeTipMaterial === "rubber" ? "#242424" : c.color);
      tip.metalness = 0;
      tip.transmission = 0;
      tip.roughness = 0.8;
    }
    Object.values(materials).forEach((m) => {
      m.needsUpdate = true;
    });
  }
  return {
    materials,
    update,
    dispose: () => {
      Object.values(materials).forEach((m) => m.dispose());
      Object.values(maps).forEach((m) => m.dispose());
    },
  };
}
