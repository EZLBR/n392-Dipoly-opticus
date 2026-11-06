import React, { useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { artworkZones, artworkFonts, MAX_TEXT_LAYERS, MAX_TEXT_CHARACTERS, type TextLayer } from "../../eyewear/artwork";

export default function ArtworkPanel() {
  const { config, patchConfig, setCameraView, setAutoRotate, setTryOnMode } = useCreatorStudio();
  const { t } = useTranslation();
  const layers = config.artwork.layers;
  const [selectedId, setSelectedId] = useState<string | undefined>(layers[0]?.id);
  const selected = layers.find(layer => layer.id === selectedId) || layers[0];
  const update = (patch: Partial<TextLayer>) => patchConfig({ artwork: {
    version: 1, layers: layers.map(layer => layer.id === selected?.id ? { ...layer, ...patch } : layer),
  } });
  const focusZone = (zone: TextLayer["zone"]) => {
    setTryOnMode(false); setAutoRotate(false);
    setCameraView(zone.startsWith("front") ? "front" : zone.endsWith("left") ? "left-side" : "side");
  };
  function add() {
    if (layers.length >= MAX_TEXT_LAYERS) return;
    const layer: TextLayer = { id: crypto.randomUUID(), text: t("artwork-your-name"), zone: "temple-right",
      font: "sans", color: "#f7f0db", x: 0, y: 0, size: 0.8, rotation: 0 };
    patchConfig({ artwork: { version: 1, layers: [...layers, layer] } });
    setSelectedId(layer.id); focusZone(layer.zone);
  }
  const range = (field: "x" | "y" | "size" | "rotation", name: string, min: number, max: number, step: number) =>
    selected && <div className="studio-art-control">
      <span>{name}<output>{field === "rotation" ? `${selected[field]}°` : `${Math.round(selected[field] * 100)}%`}</output></span>
      <input aria-label={name} type="range" min={min} max={max} step={step} value={selected[field]}
        onChange={event => update({ [field]: Number(event.target.value) })} />
    </div>;
  return <div className="studio-art-panel">
    <p className="studio-note">{t("artwork-personalize-the-front-and-temples-lenses")}</p>
    <div className="studio-art-layer-header">
      <strong>{t("artwork-text-layers")} <small>{layers.length}/{MAX_TEXT_LAYERS}</small></strong>
      <button className="studio-secondary" type="button" disabled={layers.length >= MAX_TEXT_LAYERS} onClick={add}>
        {t("artwork-add-text")}
      </button>
    </div>
    {layers.length > 0 && <div className="studio-art-layers" aria-label={t("artwork-text-layers-2")}>
      {layers.map((layer, index) => <button key={layer.id} type="button" aria-pressed={selected?.id === layer.id}
        onClick={() => { setSelectedId(layer.id); focusZone(layer.zone); }}>
        <span>{String(index + 1).padStart(2, "0")}</span>{layer.text || (t("artwork-empty-text"))}
      </button>)}
    </div>}
    {!selected && <p className="studio-art-empty">{t("artwork-a-signature-a-word-an-idea")}</p>}
    {selected && <fieldset className="studio-field studio-art-fields">
      <legend>{t("artwork-edit-text")}</legend>
      <label>{t("artwork-text")}
        <input type="text" aria-label={t("artwork-text")} value={selected.text} maxLength={48} onChange={event => update({ text: event.target.value })} />
        <small>{Array.from(selected.text).length}/{MAX_TEXT_CHARACTERS}</small>
      </label>
      {!selected.text.trim() && <p role="alert" className="studio-note">{t("artwork-enter-text-before-saving")}</p>}
      <label>{t("artwork-frame-region")}
        <select aria-label={t("artwork-frame-region")} value={selected.zone} onChange={event => {
          const zone = event.target.value as TextLayer["zone"]; update({ zone }); focusZone(zone);
        }}>
          {artworkZones.map(zone => <option key={zone} value={zone}>
            {t(`artwork-zone-${zone}`)}
          </option>)}
        </select>
      </label>
      <label>{t("artwork-font")}
        <select aria-label={t("artwork-font")} value={selected.font} onChange={event => update({ font: event.target.value as TextLayer["font"] })}>
          {artworkFonts.map(font => <option key={font} value={font}>
            {t(`artwork-font-${font}`)}
          </option>)}
        </select>
      </label>
      <label className="studio-art-color">{t("artwork-text-color")}
        <input aria-label={t("artwork-text-color")} type="color" value={selected.color} onChange={event => update({ color: event.target.value })} />
      </label>
      {range("x", t("artwork-horizontal-position"), -1, 1, 0.02)}
      {range("y", t("artwork-vertical-position"), -1, 1, 0.02)}
      {range("size", t("artwork-text-size"), 0.25, 1, 0.01)}
      {range("rotation", t("artwork-rotation"), -30, 30, 1)}
      <button className="studio-secondary studio-art-remove" type="button" onClick={() =>
        patchConfig({ artwork: { version: 1, layers: layers.filter(layer => layer.id !== selected.id) } })}>
        {t("artwork-remove-text")}
      </button>
    </fieldset>}
    <p className="studio-art-production-note">{t("artwork-application-under-review-you-can-save")}</p>
  </div>;
}
