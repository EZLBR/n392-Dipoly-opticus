import type { SaveDesignDTO } from "../dtos/design/design.dto.js";
import { studioConfigSchema } from "../dtos/design/studio-config.dto.js";
import { BadRequestProblem } from "../errors/problem.js";

/** Keep legacy updates visible to modern clients without discarding their customizations. */
export function resolveStudioConfig(payload: SaveDesignDTO, previous: unknown) {
  if (payload.config) {
    if (!previous) return payload.config;
    const existing = studioConfigSchema.safeParse(previous);
    if (!existing.success) return payload.config;
    const config = payload.config;
    const surfacePattern = config.surfacePattern ?? existing.data.surfacePattern;
    const priorArt = existing.data.artwork;
    let artwork = config.artwork;
    if (artwork.version === 1 && priorArt.version === 2) {
      // Version 1 clients cannot see version 2 artwork. Merge visible edits without
      // treating absent layers as deletions, and keep the existing stacking order.
      const edits = new Map(artwork.layers.map(layer => [layer.id, layer]));
      const updated = priorArt.layers.map(layer => {
        if ("kind" in layer) return layer;
        const edit = edits.get(layer.id);
        edits.delete(layer.id);
        return edit ?? layer;
      });
      artwork = { version: 2, layers: [...updated, ...edits.values()] };
    }
    const merged = studioConfigSchema.safeParse({ ...config, artwork, ...(surfacePattern ? { surfacePattern } : {}) });
    if (!merged.success) throw new BadRequestProblem("Atualize o Studio para editar esta versão do design.");
    return merged.data;
  }
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
