import React from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import {
  silhouettes,
  materials,
  treatments,
  label,
  dimensions,
  type EyewearConfig,
} from "../../eyewear/config";
import { calculateBasePrice } from "../../utils/pricing";
import { ArrowRight, Check, Bookmark, ShoppingBag } from "lucide-react";

export default function CustomizationPanel({
  onSave,
  onCart,
}: {
  onSave: () => void;
  onCart: () => void;
}) {
  const {
    config: c,
    patchConfig,
    activeStep,
    setActiveStep,
    toggleLensTreatment,
  } = useCreatorStudio();
  const { language } = useTranslation();
  const pt = language === "pt";
  const steps = pt
    ? ["Armação", "Lentes", "Componentes", "Revisão"]
    : ["Frame", "Lenses", "Components", "Review"];
  const choices = (
    title: string,
    key: keyof EyewearConfig,
    values: readonly string[],
  ) => (
    <fieldset className="studio-field">
      <legend>{title}</legend>
      <div className="studio-options">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={c[key] === value}
            onClick={() => patchConfig({ [key]: value })}
          >
            {label(value, language)}
            {c[key] === value && <Check size={13} />}
          </button>
        ))}
      </div>
    </fieldset>
  );
  return (
    <div className="studio-panel">
      <nav
        className="studio-steps"
        aria-label={pt ? "Etapas de personalização" : "Customization steps"}
      >
        {steps.map((step, i) => (
          <button
            key={step}
            aria-current={activeStep === i + 1 ? "step" : undefined}
            onClick={() => setActiveStep(i + 1)}
          >
            <span>{String(i + 1).padStart(2, "0")}</span>
            {step}
          </button>
        ))}
      </nav>
      <div className="studio-panel-scroll">
        <div className="studio-section-heading">
          <span className="studio-eyebrow">
            {pt ? "FEITO PARA VOCÊ" : "MADE FOR YOU"} / 0{activeStep}
          </span>
          <h2>
            {
              [
                pt ? "Sua forma de ver." : "Your point of view.",
                pt ? "Uma nova perspectiva." : "A fresh perspective.",
                pt ? "Detalhes que importam." : "Details that matter.",
                pt ? "Exatamente seu." : "Uniquely yours.",
              ][activeStep - 1]
            }
          </h2>
          <p>
            {
              [
                pt
                  ? "Comece pela silhueta. Dê personalidade com a matéria."
                  : "Start with a silhouette. Bring it to life with material.",
                pt
                  ? "Explore transparência, reflexos e proteção."
                  : "Explore clarity, reflections and protection.",
                pt
                  ? "Personalize cada ponto de contato."
                  : "Personalize every point of contact.",
                pt
                  ? "Confira sua criação antes de continuar."
                  : "Check your creation before continuing.",
              ][activeStep - 1]
            }
          </p>
        </div>
        {activeStep === 1 && (
          <>
            {choices(
              pt ? "01 — Silhueta" : "01 — Silhouette",
              "frontModel",
              silhouettes,
            )}
            {choices(
              pt ? "02 — Material" : "02 — Material",
              "frameMaterial",
              materials,
            )}
            {c.frameMaterial === "acetate" &&
              choices(
                pt ? "Acabamento do acetato" : "Acetate finish",
                "finish",
                ["solid", "tortoise", "crystal"],
              )}
            <fieldset className="studio-field">
              <legend>
                {pt ? "03 — Cor" : "03 — Color"}{" "}
                <small>{c.color.toUpperCase()}</small>
              </legend>
              <div className="studio-swatches">
                {[
                  "#202320",
                  "#382016",
                  "#c1a578",
                  "#28574b",
                  "#8b3542",
                  "#72808b",
                  "#e6dccc",
                ].map((hex) => (
                  <button
                    key={hex}
                    aria-label={(pt ? "Cor " : "Color ") + hex}
                    aria-pressed={c.color === hex}
                    style={{ background: hex }}
                    onClick={() => patchConfig({ color: hex, finish: "solid" })}
                  />
                ))}
                <label className="studio-custom-color">
                  <span>{pt ? "Outra" : "Custom"}</span>
                  <input
                    type="color"
                    aria-label={pt ? "Cor personalizada" : "Custom color"}
                    value={c.color}
                    onChange={(e) =>
                      patchConfig({ color: e.target.value, finish: "solid" })
                    }
                  />
                </label>
              </div>
              {["gold", "wood", "carbon_fiber"].includes(c.frameMaterial) && (
                <p className="studio-note">
                  {pt
                    ? "Este material mantém sua aparência natural. A cor é aplicada aos componentes de acetato."
                    : "This material keeps its natural appearance. Color applies to acetate components."}
                </p>
              )}
            </fieldset>
            {choices(
              pt ? "04 — Espessura do aro" : "04 — Rim profile",
              "frameProfile",
              ["thin", "medium", "bold"],
            )}
          </>
        )}
        {activeStep === 2 && (
          <>
            <fieldset className="studio-field">
              <legend>{pt ? "Tipo de lente" : "Lens type"}</legend>
              <div className="studio-options">
                {[false, true].map((sun) => (
                  <button
                    key={String(sun)}
                    aria-pressed={c.isSunglasses === sun}
                    onClick={() => patchConfig({ isSunglasses: sun })}
                  >
                    {sun
                      ? pt
                        ? "Solar"
                        : "Sun"
                      : pt
                        ? "Transparente"
                        : "Clear"}
                  </button>
                ))}
              </div>
            </fieldset>
            {choices(
              pt ? "Material da lente" : "Lens material",
              "lensMaterial",
              ["cr39", "polycarbonate"],
            )}
            <fieldset className="studio-field">
              <legend>{pt ? "Tratamentos" : "Treatments"}</legend>
              <div className="studio-treatments">
                {treatments.map((t) => (
                  <label key={t}>
                    <input
                      type="checkbox"
                      checked={c.lensTreatments.includes(t)}
                      onChange={() => toggleLensTreatment(t)}
                    />
                    <span>{label(t, language)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="studio-note">
              {pt
                ? "Fotocromático: selecione o cenário Sol para ver o escurecimento. UV e polarização são propriedades ópticas e não mudam a cor. A prévia não representa uma receita ou certificação óptica."
                : "Photochromic: choose the Sun environment to see darkening. UV and polarization are optical properties and do not change color. The preview does not represent a prescription or optical certification."}
            </p>
          </>
        )}
        {activeStep === 3 && (
          <>
            {choices(
              pt ? "Desenho das hastes" : "Temple design",
              "templeModel",
              silhouettes,
            )}
            <fieldset className="studio-field">
              <legend>
                {pt ? "Dobrar hastes" : "Fold temples"}{" "}
                <small>{Math.round((c.templeOpen / 1.35) * 100)}%</small>
              </legend>
              <input
                aria-label={pt ? "Dobrar hastes" : "Fold temples"}
                type="range"
                min="0"
                max="1.35"
                step=".01"
                value={Math.max(0, c.templeOpen)}
                onChange={(e) =>
                  patchConfig({ templeOpen: Number(e.target.value) })
                }
              />
              <p className="studio-note">
                {pt
                  ? "Use a vista lateral para inspecionar a articulação."
                  : "Use the side view to inspect the hinge."}
              </p>
            </fieldset>
            {choices(pt ? "Plaquetas" : "Nose pads", "nosePadMaterial", [
              "silicone",
              "titanium",
              "acetate",
            ])}
            {choices(pt ? "Ponteiras" : "Temple tips", "templeTipMaterial", [
              "acetate",
              "silicone",
              "rubber",
            ])}
            {choices(pt ? "Dobradiças" : "Hinges", "hingeMaterial", [
              "stainless_steel",
              "titanium",
              "gold",
            ])}
          </>
        )}
        {activeStep === 4 && (
          <>
            <dl className="studio-summary">
              {[
                [pt ? "Silhueta" : "Silhouette", label(c.frontModel, language)],
                [
                  pt ? "Armação" : "Frame",
                  label(c.frameMaterial, language) +
                    " · " +
                    label(c.frameProfile, language),
                ],
                [
                  pt ? "Acabamento" : "Finish",
                  label(c.finish, language) + " · " + c.color.toUpperCase(),
                ],
                [
                  pt ? "Lentes" : "Lenses",
                  label(c.lensMaterial, language) +
                    " · " +
                    (c.isSunglasses
                      ? pt
                        ? "Solar"
                        : "Sun"
                      : pt
                        ? "Transparente"
                        : "Clear"),
                ],
                [
                  pt ? "Tratamentos" : "Treatments",
                  c.lensTreatments.map((t) => label(t, language)).join(", ") ||
                    "—",
                ],
                [pt ? "Hastes" : "Temples", label(c.templeModel, language)],
                [
                  pt ? "Plaquetas / ponteiras" : "Pads / tips",
                  label(c.nosePadMaterial, language) +
                    " / " +
                    label(c.templeTipMaterial, language),
                ],
                [
                  pt ? "Medidas de referência" : "Reference dimensions",
                  dimensions[c.frontModel].lensWidth +
                    " □ " +
                    dimensions[c.frontModel].bridge +
                    " — " +
                    dimensions[c.frontModel].temple +
                    " mm",
                ],
              ].map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="studio-note">
              {pt
                ? "Modelo conceitual. Medidas e disponibilidade precisam ser confirmadas antes da fabricação."
                : "Concept model. Dimensions and availability must be confirmed before manufacturing."}
            </p>
          </>
        )}
      </div>
      <footer className="studio-panel-footer">
        <div className="studio-price">
          <span>
            {pt ? "Estimativa da configuração" : "Configuration estimate"}
          </span>
          <strong>
            {new Intl.NumberFormat(pt ? "pt-BR" : "en-US", {
              style: "currency",
              currency: "BRL",
            }).format(calculateBasePrice(c))}
          </strong>
        </div>
        <div className="studio-actions">
          <button className="studio-secondary" onClick={onSave}>
            <Bookmark size={16} />
            {pt ? "Salvar" : "Save"}
          </button>
          {activeStep < 4 ? (
            <button
              className="studio-primary"
              onClick={() => setActiveStep(activeStep + 1)}
            >
              {pt ? "Continuar" : "Continue"}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="studio-primary" onClick={onCart}>
              <ShoppingBag size={16} />
              {pt ? "Adicionar à sacola" : "Add to bag"}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
