import { normalizeConfig, type EyewearConfig } from "./config";
export interface StudioDraft {
  config: EyewearConfig;
  source: string;
  designId?: string;
  name?: string;
}
export function readJSON(
  storage: Pick<Storage, "getItem">,
  key: string,
  fallback: any = null,
) {
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}
export function restoreStudio(storage: Pick<Storage, "getItem">): StudioDraft {
  try {
    return readStudio(storage);
  } catch {
    return { config: normalizeConfig(), source: "new" };
  }
}
function readStudio(storage: Pick<Storage, "getItem">): StudioDraft {
  const active = storage.getItem("opticus_active_design"),
    product = storage.getItem("opticus_active_product");
  const designs = readJSON(storage, "opticus_designs", []);
  const activeId = storage.getItem("opticus_active_design_id");
  const design = Array.isArray(designs)
    ? activeId
      ? designs.find((item) => String(item.id) === activeId)
      : active !== null
        ? designs[Number(active)]
        : undefined
    : undefined;
  const source = design
    ? "design:" + design.id
    : product
      ? "product:" + product
      : "new";
  const draft = readJSON(storage, "opticus_creator_draft");
  if (
    draft?.config &&
    (draft.source === source || (!draft.source && source === "new"))
  ) {
    return {
      config: normalizeConfig(draft.config),
      source,
      designId: design?.id,
      name: design?.name,
    };
  }
  if (design)
    return {
      config: normalizeConfig(design),
      source,
      designId: design.id,
      name: design.name,
    };
  if (product)
    return {
      config: normalizeConfig({
        shape: product.includes("round") ? "round" : "square",
        material:
          product === "base-square-metal"
            ? "titanium"
            : product.includes("metal")
              ? "metal"
              : "acetate",
      }),
      source,
    };
  return { config: normalizeConfig(), source };
}
export function mergeSavedDesigns(remote: any[], local: any[]) {
  // Appearance fields absent from the current API remain device-local; server fields still win.
  return remote
    .map((design) => {
      const cached = local.find(
        (item) => String(item.id) === String(design.id),
      );
      const canonical = normalizeConfig(design);
      const config = cached
        ? normalizeConfig({
            ...normalizeConfig(cached),
            frontModel: canonical.frontModel,
            templeModel: canonical.templeModel,
            color: canonical.color,
            frameProfile: canonical.frameProfile,
            templeOpen: canonical.templeOpen,
            isSunglasses: canonical.isSunglasses,
            lensTreatments:
              (design.antiReflective ?? design.anti_reflective) === false
                ? normalizeConfig(cached).lensTreatments.filter(
                    (t: string) => t !== "anti_reflective",
                  )
                : [
                    ...new Set([
                      ...normalizeConfig(cached).lensTreatments,
                      ...((design.antiReflective ?? design.anti_reflective) ===
                      true
                        ? ["anti_reflective"]
                        : []),
                    ]),
                  ],
          })
        : canonical;
      return { ...cached, ...design, config };
    })
    .concat(
      local.filter(
        (item) =>
          item.syncStatus === "local" &&
          !remote.some((design) => String(design.id) === String(item.id)),
      ),
    );
}
