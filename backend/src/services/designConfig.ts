import type { SaveDesignDTO } from "../dtos/design/design.dto.js";
import { studioConfigSchema } from "../dtos/design/studio-config.dto.js";
import { BadRequestProblem } from "../errors/problem.js";

/** Keep legacy updates visible to modern clients without discarding their artwork. */
export function resolveStudioConfig(payload: SaveDesignDTO, previous: unknown) {
  if (payload.config) return payload.config;
  if (!previous) return null;
  const existing = studioConfigSchema.safeParse(previous);
  if (!existing.success) throw new BadRequestProblem("Atualize o Studio para editar esta versão do design.");
  const parts = payload.model.match(/^(.+)_front_(.+)_temples$/);
  const alias = (value: string) => value === "square" ? "wayfarer" : value === "cat-eye" ? "cateye" : value;
  const lensTreatments = payload.anti_reflective === undefined ? existing.data.lensTreatments
    : [...existing.data.lensTreatments.filter(value => value !== "anti_reflective"), ...(payload.anti_reflective ? ["anti_reflective"] : [])];
  const merged = studioConfigSchema.safeParse({
    ...existing.data,
    frontModel: alias(parts?.[1] ?? payload.model),
    templeModel: alias(parts?.[2] ?? payload.model),
    color: payload.color,
    lensTreatments,
    ...(payload.frame_profile !== undefined ? { frameProfile: payload.frame_profile } : {}),
    ...(payload.temple_open !== undefined ? { templeOpen: payload.temple_open } : {}),
    ...(payload.is_sunglasses !== undefined ? { isSunglasses: payload.is_sunglasses } : {}),
  });
  if (!merged.success) throw new BadRequestProblem("Esta alteração não é compatível com o design. Edite-o no Studio atualizado.");
  return merged.data;
}
