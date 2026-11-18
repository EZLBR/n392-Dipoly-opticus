import { normalizeConfig, type EyewearConfig } from "./config";
import type { SavedDesign } from "../types/domain";
import { isPublicId } from "../utils/publicId";

export const ANONYMOUS_STUDIO_OWNER = "anonymous";
export const STUDIO_OWNER_KEY = "opticus_studio_owner";
const privateStudioKeys = [
  "opticus_designs", "opticus_creator_draft", "opticus_active_design",
  "opticus_active_design_id", "opticus_active_product", "opticus_active_product_config",
];

/** Only a known anonymous workspace may be claimed when its creator logs in. */
export function switchStudioOwner(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  nextOwner: string,
) {
  const previousOwner = storage.getItem(STUDIO_OWNER_KEY);
  if (previousOwner === nextOwner) return;
  if (previousOwner !== ANONYMOUS_STUDIO_OWNER || nextOwner === ANONYMOUS_STUDIO_OWNER) {
    privateStudioKeys.forEach(key => storage.removeItem(key));
  }
  storage.setItem(STUDIO_OWNER_KEY, nextOwner);
}
export function migrateStudioIdentifiers(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">) {
  const designs = readJSON<SavedDesign[]>(storage, "opticus_designs", []);
  const valid = designs.filter(design => design && isPublicId(design.id)
    && (design.remoteId == null || isPublicId(design.remoteId)));
  if (valid.length !== designs.length) storage.setItem("opticus_designs", JSON.stringify(valid));

  const active = storage.getItem("opticus_active_design_id");
  const legacyIndex = storage.getItem("opticus_active_design");
  const selectedId = active ?? (legacyIndex !== null && /^\d+$/.test(legacyIndex)
    ? designs[Number(legacyIndex)]?.id : undefined);
  if (selectedId && valid.some(design => design.id === selectedId)) {
    if (active !== selectedId) storage.setItem("opticus_active_design_id", selectedId);
  } else if (active !== null) {
    storage.removeItem("opticus_active_design_id");
  }
  if (legacyIndex !== null) storage.removeItem("opticus_active_design");

  const product = storage.getItem("opticus_active_product");
  if (product !== null && !isPublicId(product)) {
    storage.removeItem("opticus_active_product");
    storage.removeItem("opticus_active_product_config");
  }
  const draft = readJSON<{ source?: string } | null>(storage, "opticus_creator_draft", null);
  if (typeof draft?.source === "string" && /^(design|product):\d+$/.test(draft.source)) {
    storage.removeItem("opticus_creator_draft");
  }
}

export interface StudioDraft {
  config: EyewearConfig;
  source: string;
  designId?: string;
  name?: string;
}
export function readJSON<T>(
  storage: Pick<Storage, "getItem">,
  key: string,
  fallback: T,
): T {
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
  const designs = readJSON<SavedDesign[]>(storage, "opticus_designs", []);
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
  const draft = readJSON<{ config?: unknown; source?: string } | null>(storage, "opticus_creator_draft", null);
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
  const selectedProduct = readJSON<{ id: string; config?: unknown } | null>(storage, "opticus_active_product_config", null);
  if (product && selectedProduct?.id === product && selectedProduct.config)
    return { config: normalizeConfig(selectedProduct.config), source };
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
export function mergeSavedDesigns(remote: SavedDesign[], local: SavedDesign[]): SavedDesign[] {
  // Appearance fields absent from the current API remain device-local; server fields still win.
  return remote
    .map<SavedDesign>((design) => {
      const cached = local.find(
        (item) => String(item.id) === String(design.id),
      );
      const canonical = normalizeConfig(design);
      if (cached?.syncStatus === "local") return { ...design, ...cached, config: normalizeConfig(cached) };
      if (design.config) return { ...design, config: canonical };
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
