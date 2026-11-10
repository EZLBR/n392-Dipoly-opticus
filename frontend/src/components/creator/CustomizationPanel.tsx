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
import ArtworkPanel from "./ArtworkPanel";
import { hasUnapprovedCustomization } from "../../eyewear/artwork";
import PatternControls from "./PatternControls";

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
  const { language, t } = useTranslation();
  const pt = language === "pt";
  const steps = ["frame", "lenses", "components", "artwork", "review"].map(step => t(`studio-step-${step}`));
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
        aria-label={t("studio-options-customization-steps")}
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
            {t("studio-options-made-for-you")} / 0{activeStep}
          </span>
          <h2>
            {
              [
                t("studio-options-your-point-of-view"),
                t("studio-options-a-fresh-perspective"),
                t("studio-options-details-that-matter"),
                t("studio-options-your-mark-your-eyewear"),
                t("studio-options-uniquely-yours"),
              ][activeStep - 1]
            }
          </h2>
          <p>
            {
              [
                t("studio-options-start-with-a-silhouette-bring-it"),
                t("studio-options-explore-clarity-reflections-and-protection"),
                t("studio-options-personalize-every-point-of-contact"),
                t("studio-options-write-on-the-frame-and-see"),
                t("studio-options-check-your-creation-before-continuing"),
              ][activeStep - 1]
            }
          </p>
        </div>
        {activeStep === 1 && (
          <>
            {choices(
              t("studio-options-01-silhouette"),
              "frontModel",
              silhouettes,
            )}
            {choices(
              t("studio-options-02-material"),
              "frameMaterial",
              materials,
            )}
            {c.frameMaterial === "acetate" &&
              choices(
                t("studio-options-acetate-finish"),
                "finish",
                ["solid", "tortoise", "crystal"],
              )}
            <fieldset className="studio-field">
              <legend>
                {t("studio-options-03-color")}{" "}
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
                    aria-label={(t("studio-options-color")) + hex}
                    aria-pressed={c.color === hex}
                    style={{ background: hex }}
                    onClick={() => patchConfig({ color: hex, finish: "solid" })}
                  />
                ))}
                <label className="studio-custom-color">
                  <span>{t("studio-options-custom")}</span>
                  <input
                    type="color"
                    aria-label={t("studio-options-custom-color")}
                    value={c.color}
                    onChange={(e) =>
                      patchConfig({ color: e.target.value, finish: "solid" })
                    }
                  />
                </label>
              </div>
              {["gold", "wood", "carbon_fiber"].includes(c.frameMaterial) && (
                <p className="studio-note">
                  {t("studio-options-this-material-keeps-its-natural-appearance")}
                </p>
              )}
            </fieldset>
            {choices(
              t("studio-options-04-rim-profile"),
              "frameProfile",
              ["thin", "medium", "bold"],
            )}
            <PatternControls />
          </>
        )}
        {activeStep === 2 && (
          <>
            <fieldset className="studio-field">
              <legend>{t("studio-options-lens-type")}</legend>
              <div className="studio-options">
                {[false, true].map((sun) => (
                  <button
                    key={String(sun)}
                    aria-pressed={c.isSunglasses === sun}
                    onClick={() => patchConfig({ isSunglasses: sun })}
                  >
                    {sun
                      ? t("studio-options-sun")
                      : t("studio-options-clear")}
                  </button>
                ))}
              </div>
            </fieldset>
            {choices(
              t("studio-options-lens-material"),
              "lensMaterial",
              ["cr39", "polycarbonate"],
            )}
            <fieldset className="studio-field">
              <legend>{t("studio-options-treatments")}</legend>
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
              {t("studio-options-photochromic-choose-the-sun-environment-to")}
            </p>
          </>
        )}
        {activeStep === 3 && (
          <>
            {choices(
              t("studio-options-temple-design"),
              "templeModel",
              silhouettes,
            )}
            <fieldset className="studio-field">
              <legend>
                {t("studio-options-fold-temples")}{" "}
                <small>{Math.round((c.templeOpen / 1.35) * 100)}%</small>
              </legend>
              <input
                aria-label={t("studio-options-fold-temples")}
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
                {t("studio-options-use-the-side-view-to-inspect")}
              </p>
            </fieldset>
            {choices(t("studio-options-nose-pads"), "nosePadMaterial", [
              "silicone",
              "titanium",
              "acetate",
            ])}
            {choices(t("studio-options-temple-tips"), "templeTipMaterial", [
              "acetate",
              "silicone",
              "rubber",
            ])}
            {choices(t("studio-options-hinges"), "hingeMaterial", [
              "stainless_steel",
              "titanium",
              "gold",
            ])}
          </>
        )}
        {activeStep === 4 && <ArtworkPanel />}
        {activeStep === 5 && (
          <>
            <dl className="studio-summary">
              {[
                [t("studio-options-silhouette"), label(c.frontModel, language)],
                [
                  t("studio-options-frame"),
                  label(c.frameMaterial, language) +
                    " · " +
                    label(c.frameProfile, language),
                ],
                [
                  t("studio-options-finish"),
                  label(c.finish, language) + " · " + c.color.toUpperCase(),
                ],
                [
                  t("studio-options-lenses"),
                  label(c.lensMaterial, language) +
                    " · " +
                    (c.isSunglasses
                      ? t("studio-options-sun")
                      : t("studio-options-clear")),
                ],
                [
                  t("studio-options-treatments"),
                  c.lensTreatments.map((t) => label(t, language)).join(", ") ||
                    "—",
                ],
                [t("studio-options-temples"), label(c.templeModel, language)],
                [
                  t("studio-options-pads-tips"),
                  label(c.nosePadMaterial, language) +
                    " / " +
                    label(c.templeTipMaterial, language),
                ],
                [
                  t("studio-options-reference-dimensions"),
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
              {t("studio-options-concept-model-dimensions-and-availability-must")}
            </p>
            {hasUnapprovedCustomization(c) && <p className="studio-art-production-note">
              {t("decoration-preview")}
            </p>}
          </>
        )}
      </div>
      <footer className="studio-panel-footer">
        <div className="studio-price">
          <span>
            {t("studio-options-configuration-estimate")}
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
            {t("studio-options-save")}
          </button>
          {activeStep < 5 ? (
            <button
              className="studio-primary"
              onClick={() => setActiveStep(activeStep + 1)}
            >
              {t("studio-options-continue")}
              <ArrowRight size={16} />
            </button>
          ) : (
            <button className="studio-primary" onClick={onCart} disabled={hasUnapprovedCustomization(c)}>
              <ShoppingBag size={16} />
              {t("studio-options-add-to-bag")}
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
