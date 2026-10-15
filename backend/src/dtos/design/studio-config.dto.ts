import { z } from "zod";

const shape = z.enum(["wayfarer", "aviator", "cateye", "round"]);
const color = z.string().regex(/^#[\da-f]{6}$/i, "Use uma cor hexadecimal de seis dígitos.");
export const textLayerSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(48)
    .refine(value => Array.from(value).length <= 24, "Use no máximo 24 caracteres.")
    .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Texto contém caracteres de controle."),
  zone: z.enum(["front-left", "front-right", "temple-left", "temple-right"]),
  font: z.enum(["sans", "serif", "mono"]),
  color,
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  size: z.number().min(0.25).max(1),
  rotation: z.number().min(-30).max(30),
}).strict();

export const studioConfigSchema = z.object({
  version: z.literal(1),
  frontModel: shape,
  templeModel: shape,
  frameProfile: z.enum(["thin", "medium", "bold"]),
  frameMaterial: z.enum(["acetate", "titanium", "stainless_steel", "gold", "tr90", "wood", "carbon_fiber"]),
  color,
  finish: z.enum(["solid", "tortoise", "crystal"]),
  isSunglasses: z.boolean(),
  lensMaterial: z.enum(["cr39", "polycarbonate"]),
  lensTreatments: z.array(z.enum(["anti_reflective", "uv_protection", "blue_light", "mirrored", "polarized", "photochromic"])).max(6),
  nosePadMaterial: z.enum(["silicone", "titanium", "acetate"]),
  templeTipMaterial: z.enum(["acetate", "silicone", "rubber"]),
  hingeMaterial: z.enum(["stainless_steel", "titanium", "gold"]),
  templeOpen: z.number().min(-0.05).max(1.35),
  artwork: z.object({
    version: z.literal(1),
    layers: z.array(textLayerSchema).max(6)
      .refine(layers => new Set(layers.map(layer => layer.id)).size === layers.length, "Camadas devem ter identificadores únicos."),
  }).strict(),
}).strict();
