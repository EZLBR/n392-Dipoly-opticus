export const silhouettes = ["wayfarer", "aviator", "cateye", "round"] as const;
export const materials = [
  "acetate",
  "titanium",
  "stainless_steel",
  "gold",
  "tr90",
  "wood",
  "carbon_fiber",
] as const;
export const treatments = [
  "anti_reflective",
  "uv_protection",
  "blue_light",
  "mirrored",
  "polarized",
  "photochromic",
] as const;
export type Silhouette = (typeof silhouettes)[number];
export type FrameMaterial = (typeof materials)[number];
export interface EyewearConfig {
  frontModel: Silhouette;
  templeModel: Silhouette;
  frameProfile: "thin" | "medium" | "bold";
  frameMaterial: FrameMaterial;
  color: string;
  finish: "solid" | "tortoise" | "crystal";
  isSunglasses: boolean;
  lensMaterial: "cr39" | "polycarbonate";
  lensTreatments: string[];
  nosePadMaterial: "silicone" | "titanium" | "acetate";
  templeTipMaterial: "acetate" | "silicone" | "rubber";
  hingeMaterial: "stainless_steel" | "titanium" | "gold";
  templeOpen: number;
}
export const defaultConfig: EyewearConfig = {
  frontModel: "wayfarer",
  templeModel: "wayfarer",
  frameProfile: "medium",
  frameMaterial: "acetate",
  color: "#382016",
  finish: "tortoise",
  isSunglasses: false,
  lensMaterial: "cr39",
  lensTreatments: ["anti_reflective", "uv_protection"],
  nosePadMaterial: "silicone",
  templeTipMaterial: "acetate",
  hingeMaterial: "stainless_steel",
  templeOpen: 0,
};
const choose = <T extends string>(
  value: unknown,
  choices: readonly T[],
  fallback: T,
): T => (choices.includes(value as T) ? (value as T) : fallback);
const shapeAlias = (value: unknown) =>
  value === "square" ? "wayfarer" : value === "cat-eye" ? "cateye" : value;

/** Accepts current designs, old snake_case API records, cart specs and legacy model strings. */
export function normalizeConfig(input: unknown = {}): EyewearConfig {
  const source =
    input && typeof input === "object" ? (input as Record<string, any>) : {};
  const c = { ...source, ...(source.config || source.customSpecs || {}) };
  const legacy = typeof c.model === "string" ? c.model.split("_front_") : [];
  const frontModel = choose(
    shapeAlias(c.frontModel || legacy[0] || c.shape),
    silhouettes,
    defaultConfig.frontModel,
  );
  const material = c.frameMaterial || c.material;
  const treatmentList =
    c.lensTreatments ??
    ((c.antiReflective ?? c.anti_reflective) === false
      ? []
      : defaultConfig.lensTreatments);
  const angle = Number(
    c.templeOpen ?? c.temple_open ?? defaultConfig.templeOpen,
  );
  const hasOldDesign = Object.keys(c).length > 0;
  return {
    frontModel,
    templeModel: choose(
      shapeAlias(c.templeModel || legacy[1]?.replace("_temples", "")),
      silhouettes,
      frontModel,
    ),
    frameProfile: choose(
      c.frameProfile || c.frame_profile || c.profile,
      ["thin", "medium", "bold"],
      "medium",
    ),
    frameMaterial: choose(
      material === "metal" ? "stainless_steel" : material,
      materials,
      defaultConfig.frameMaterial,
    ),
    color:
      typeof c.color === "string" && /^#[\da-f]{6}$/i.test(c.color)
        ? c.color
        : defaultConfig.color,
    finish: choose(
      c.finish,
      ["solid", "tortoise", "crystal"],
      hasOldDesign ? "solid" : defaultConfig.finish,
    ),
    isSunglasses: Boolean(c.isSunglasses ?? c.is_sunglasses ?? false),
    lensMaterial: choose(c.lensMaterial, ["cr39", "polycarbonate"], "cr39"),
    lensTreatments: Array.isArray(treatmentList)
      ? [
          ...new Set(
            treatmentList
              .map((t) => String(t).replaceAll("-", "_"))
              .filter((t) => (treatments as readonly string[]).includes(t)),
          ),
        ]
      : [...defaultConfig.lensTreatments],
    nosePadMaterial: choose(
      c.nosePadMaterial,
      ["silicone", "titanium", "acetate"],
      "silicone",
    ),
    templeTipMaterial: choose(
      c.templeTipMaterial,
      ["acetate", "silicone", "rubber"],
      "acetate",
    ),
    hingeMaterial: choose(
      c.hingeMaterial,
      ["stainless_steel", "titanium", "gold"],
      "stainless_steel",
    ),
    templeOpen: Number.isFinite(angle)
      ? Math.max(-0.05, Math.min(1.35, angle))
      : 0,
  };
}
export const isMetal = (c: EyewearConfig) =>
  ["titanium", "stainless_steel", "gold"].includes(c.frameMaterial);
export const dimensions = {
  wayfarer: { lensWidth: 51, lensHeight: 38, bridge: 19, temple: 140 },
  aviator: { lensWidth: 55, lensHeight: 46, bridge: 17, temple: 140 },
  cateye: { lensWidth: 51, lensHeight: 37, bridge: 18, temple: 140 },
  round: { lensWidth: 47, lensHeight: 44, bridge: 21, temple: 140 },
};
export const geometryKey = (c: EyewearConfig) =>
  [c.frontModel, c.templeModel, c.frameProfile, isMetal(c)].join(":");

export const labels: Record<string, [string, string]> = {
  wayfarer: ["Wayfarer", "Wayfarer"],
  aviator: ["Aviador", "Aviator"],
  cateye: ["Gatinho", "Cat-eye"],
  round: ["Redondo", "Round"],
  acetate: ["Acetato", "Acetate"],
  titanium: ["Titânio escovado", "Brushed titanium"],
  stainless_steel: ["Aço polido", "Polished steel"],
  gold: ["Ouro", "Gold"],
  tr90: ["TR90 fosco", "Matte TR90"],
  wood: ["Madeira", "Wood"],
  carbon_fiber: ["Fibra de carbono", "Carbon fiber"],
  thin: ["Fino", "Thin"],
  medium: ["Médio", "Medium"],
  bold: ["Espesso", "Bold"],
  solid: ["Sólido", "Solid"],
  tortoise: ["Tartaruga", "Tortoise"],
  crystal: ["Translúcido", "Crystal"],
  silicone: ["Silicone", "Silicone"],
  rubber: ["Borracha", "Rubber"],
  cr39: ["Resina CR-39", "CR-39 resin"],
  polycarbonate: ["Policarbonato", "Polycarbonate"],
  anti_reflective: ["Antirreflexo", "Anti-reflective"],
  uv_protection: ["Proteção UV", "UV protection"],
  blue_light: ["Filtro de luz azul", "Blue light filter"],
  mirrored: ["Espelhado", "Mirrored"],
  polarized: ["Polarizado", "Polarized"],
  photochromic: ["Fotocromático", "Photochromic"],
};
export const label = (key: string, language: string) =>
  labels[key]?.[language === "pt" ? 0 : 1] || key;
