import React from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { patternStyles, type SurfacePattern } from "../../eyewear/patterns";

export default function PatternControls() {
  const { config, patchConfig } = useCreatorStudio();
  const { t } = useTranslation();
  const pattern = config.surfacePattern;
  const update = (patch: Partial<SurfacePattern>) => patchConfig({ surfacePattern: { ...pattern, ...patch } });
  return <fieldset className="studio-field">
    <legend>{t("pattern-title")}</legend>
    <label>{t("pattern-style")}
      <select aria-label={t("pattern-style")} value={pattern.style} onChange={event => update({ style: event.target.value as SurfacePattern["style"] })}>
        {patternStyles.map(style => <option key={style} value={style}>{t("pattern-" + style)}</option>)}
      </select>
    </label>
    {pattern.style !== "none" && <>
      <label>{t("pattern-scale")} <span aria-hidden="true">{pattern.scale}×</span>
        <input type="range" min="1" max="6" step="0.25" aria-label={t("pattern-scale")} value={pattern.scale} onChange={event => update({ scale: Number(event.target.value) })} />
      </label>
      <label>{t("pattern-rotation")} <span aria-hidden="true">{pattern.rotation}°</span>
        <input type="range" min="-180" max="180" step="5" aria-label={t("pattern-rotation")} value={pattern.rotation} onChange={event => update({ rotation: Number(event.target.value) })} />
      </label>
      <label>{t("pattern-ink")}
        <input type="color" aria-label={t("pattern-ink")} value={pattern.ink} onChange={event => update({ ink: event.target.value })} />
      </label>
      <p className="studio-art-production-note">{t("pattern-preview")}</p>
    </>}
  </fieldset>;
}
