import React, { useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { artworkZones, artworkFonts, MAX_ARTWORK_LAYERS, MAX_TEXT_CHARACTERS,
  type ArtworkLayer, type ArtworkZone, type DrawingLayer, type TextLayer } from "../../eyewear/artwork";
import DrawingControls from "./DrawingControls";

export default function ArtworkPanel() {
  const { config, patchConfig, setCameraView, setAutoRotate, setTryOnMode, drawingRedo, setLayerRedo } = useCreatorStudio();
  const { t } = useTranslation();
  const layers = config.artwork.layers;
  const [selectedId, setSelectedId] = useState<string | undefined>(layers[0]?.id);
  const selectedLayer = layers.find(layer => layer.id === selectedId) || layers[0];
  const selected = selectedLayer && "text" in selectedLayer ? selectedLayer : undefined;
  const drawing = selectedLayer && "kind" in selectedLayer ? selectedLayer : undefined;
  const setLayers = (nextLayers: ArtworkLayer[], version = config.artwork.version) =>
    patchConfig({ artwork: { version, layers: nextLayers } });
  const update = (patch: Partial<TextLayer>) => setLayers(layers.map(layer =>
    "text" in layer && layer.id === selected?.id ? { ...layer, ...patch } : layer,
  ));
  const focusZone = (zone: ArtworkZone) => {
    setTryOnMode(false); setAutoRotate(false);
    setCameraView(zone.startsWith("front") ? "front" : zone.endsWith("left") ? "left-side" : "side");
  };
  function add() {
    if (layers.length >= MAX_ARTWORK_LAYERS) return;
    const layer: TextLayer = { id: crypto.randomUUID(), text: t("artwork-your-name"), zone: "temple-right",
      font: "sans", color: "#f7f0db", x: 0, y: 0, size: 0.8, rotation: 0 };
    setLayers([...layers, layer]);
    setSelectedId(layer.id); focusZone(layer.zone);
  }
  function addDrawing() {
    if (layers.length >= MAX_ARTWORK_LAYERS) return;
    const layer: DrawingLayer = { id: crypto.randomUUID(), kind: "drawing", zone: "temple-right", strokes: [] };
    setLayers([...layers, layer], 2);
    setSelectedId(layer.id);
    focusZone(layer.zone);
  }
  const removeSelected = () => {
    if (drawing) setLayerRedo(drawing.id, []);
    setLayers(layers.filter(layer => layer.id !== selectedLayer?.id));
  };
  const region = (layer: ArtworkLayer) => <label>{t("artwork-region")}
    <select aria-label={t("artwork-region")} value={layer.zone} onChange={event => {
      const zone = event.target.value as ArtworkZone;
      setLayers(layers.map(item => item.id === layer.id ? { ...item, zone } : item));
      focusZone(zone);
    }}>
      {artworkZones.map(zone => <option key={zone} value={zone}>{t(`artwork-zone-${zone}`)}</option>)}
    </select>
  </label>;
  const range = (field: "x" | "y" | "size" | "rotation", name: string, min: number, max: number, step: number) =>
    selected && <div className="studio-art-control">
      <span>{name}<output>{field === "rotation" ? `${selected[field]}°` : `${Math.round(selected[field] * 100)}%`}</output></span>
      <input aria-label={name} type="range" min={min} max={max} step={step} value={selected[field]}
        onChange={event => update({ [field]: Number(event.target.value) })} />
    </div>;
  return <div className="studio-art-panel">
    <p className="studio-note">{t("artwork-personalize-the-front-and-temples-lenses")}</p>
    <div className="studio-art-layer-header">
      <strong>{t("artwork-layers")} <small>{layers.length}/{MAX_ARTWORK_LAYERS}</small></strong>
      <div className="studio-drawing-actions">
        <button className="studio-secondary" type="button" disabled={layers.length >= MAX_ARTWORK_LAYERS} onClick={add}>
          {t("artwork-add-text")}
        </button>
        <button className="studio-secondary" type="button" disabled={layers.length >= MAX_ARTWORK_LAYERS} onClick={addDrawing}>
          {t("drawing-add")}
        </button>
      </div>
    </div>
    {layers.length > 0 && <div className="studio-art-layers" aria-label={t("artwork-layers")}>
      {layers.map((layer, index) => <button key={layer.id} type="button" aria-pressed={selectedLayer?.id === layer.id}
        onClick={() => { setSelectedId(layer.id); focusZone(layer.zone); }}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        {"kind" in layer ? t("drawing-layer") : layer.text || (t("artwork-empty-text"))}
      </button>)}
    </div>}
    {!selectedLayer && <p className="studio-art-empty">{t("artwork-empty")}</p>}
    {selected && <fieldset className="studio-field studio-art-fields">
      <legend>{t("artwork-edit-text")}</legend>
      <label>{t("artwork-text")}
        <input type="text" aria-label={t("artwork-text")} value={selected.text} maxLength={48} onChange={event => update({ text: event.target.value })} />
        <small>{Array.from(selected.text).length}/{MAX_TEXT_CHARACTERS}</small>
      </label>
      {!selected.text.trim() && <p role="alert" className="studio-note">{t("artwork-enter-text-before-saving")}</p>}
      {region(selected)}
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
      <button className="studio-secondary studio-art-remove" type="button" onClick={removeSelected}>
        {t("artwork-remove-text")}
      </button>
    </fieldset>}
    {drawing && <fieldset className="studio-field studio-art-fields">
      <legend>{t("drawing-edit")}</legend>
      {region(drawing)}
      <DrawingControls key={drawing.id} layer={drawing} onRemove={removeSelected}
        redo={drawingRedo.get(drawing.id) ?? []}
        setRedo={strokes => setLayerRedo(drawing.id, strokes)}
        onChange={strokes => setLayers(layers.map(layer =>
          layer.id === drawing.id ? { ...drawing, strokes } : layer,
        ))} />
    </fieldset>}
    <p className="studio-art-production-note">{t("artwork-application-under-review-you-can-save")}</p>
  </div>;
}
