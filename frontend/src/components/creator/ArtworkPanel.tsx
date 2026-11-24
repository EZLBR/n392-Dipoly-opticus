import React, { useRef, useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { artworkZones, artworkFonts, MAX_ARTWORK_LAYERS, MAX_TEXT_CHARACTERS,
  fullImageCrop, imageAssetIds, isImageLayer,
  type ArtworkLayer, type ArtworkZone, type DrawingLayer, type ImageLayer, type TextLayer } from "../../eyewear/artwork";
import { isCurrentImageSession } from "../../eyewear/private-images";
import DrawingControls from "./DrawingControls";
import ImageAssetPicker from "./ImageAssetPicker";
import ImageCropControls from "./ImageCropControls";

export default function ArtworkPanel() {
  const { config, patchConfig, setCameraView, setAutoRotate, setTryOnMode, drawingRedo, setLayerRedo } = useCreatorStudio();
  const { t } = useTranslation();
  const auth = useAuth();
  const token: string | undefined = auth?.session ? auth.sessionToken ?? undefined : undefined;
  const layers = config.artwork.layers;
  const latestLayers = useRef(layers);
  latestLayers.current = layers;
  const [imagePicker, setImagePicker] = useState<{ replaceId?: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | undefined>(layers[0]?.id);
  const selectedLayer = layers.find(layer => layer.id === selectedId) || layers[0];
  const selected = selectedLayer && "text" in selectedLayer ? selectedLayer : undefined;
  const drawing = selectedLayer && "kind" in selectedLayer && selectedLayer.kind === "drawing" ? selectedLayer : undefined;
  const image = selectedLayer && isImageLayer(selectedLayer) ? selectedLayer : undefined;
  const positionedLayer = selected ?? image;
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
    setLayers([...layers, layer], config.artwork.version === 3 ? 3 : 2);
    setSelectedId(layer.id);
    focusZone(layer.zone);
  }
  function applyImage(assetId: string) {
    if (!imagePicker || !token || !isCurrentImageSession(token)) return;
    const current = latestLayers.current;
    if (imagePicker.replaceId) {
      const existing = current.find(layer => layer.id === imagePicker.replaceId);
      if (!existing || !isImageLayer(existing)) return;
      setLayers(current.map(layer => layer.id === existing.id
        ? { ...existing, assetId, crop: fullImageCrop } : layer), 3);
      setSelectedId(existing.id);
    } else {
      if (current.length >= MAX_ARTWORK_LAYERS) return;
      const layer: ImageLayer = { id: crypto.randomUUID(), kind: "image", assetId, zone: "temple-right",
        x: 0, y: 0, size: 0.8, rotation: 0, crop: fullImageCrop };
      setLayers([...current, layer], 3);
      setSelectedId(layer.id);
      focusZone(layer.zone);
    }
    setImagePicker(null);
  }
  const updateImage = (patch: Partial<ImageLayer>) => setLayers(layers.map(layer =>
    isImageLayer(layer) && layer.id === image?.id ? { ...layer, ...patch } : layer,
  ), 3);
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
    positionedLayer && <div className="studio-art-control">
      <span>{name}<output>{field === "rotation"
        ? `${positionedLayer[field]}°` : `${Math.round(positionedLayer[field] * 100)}%`}</output></span>
      <input aria-label={name} type="range" min={min} max={max} step={step} value={positionedLayer[field]}
        onChange={event => (image ? updateImage : update)({ [field]: Number(event.target.value) })} />
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
        {token && <button className="studio-secondary" type="button" onClick={() => setImagePicker({})}>
          {t(layers.length < MAX_ARTWORK_LAYERS ? "studio-image-add" : "studio-image-library")}
        </button>}
      </div>
    </div>
    {layers.length > 0 && <div className="studio-art-layers" aria-label={t("artwork-layers")}>
      {layers.map((layer, index) => <button key={layer.id} type="button" aria-pressed={selectedLayer?.id === layer.id}
        onClick={() => { setSelectedId(layer.id); focusZone(layer.zone); }}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        {"text" in layer ? layer.text || t("artwork-empty-text")
          : t(layer.kind === "image" ? "studio-image-layer" : "drawing-layer")}
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
    {image && <fieldset className="studio-field studio-art-fields">
      <legend>{t("studio-image-edit")}</legend>
      {region(image)}
      {range("x", t("artwork-horizontal-position"), -1, 1, 0.02)}
      {range("y", t("artwork-vertical-position"), -1, 1, 0.02)}
      {range("size", t("studio-image-scale"), 0.25, 1, 0.01)}
      {range("rotation", t("artwork-rotation"), -30, 30, 1)}
      <ImageCropControls layer={image} token={token} onChange={crop => updateImage({ crop })} />
      <div className="studio-drawing-actions">
        {token && <button type="button" className="studio-secondary" onClick={() => setImagePicker({ replaceId: image.id })}>
          {t("studio-image-replace")}
        </button>}
        <button type="button" className="studio-secondary" onClick={removeSelected}>{t("studio-image-remove-layer")}</button>
      </div>
    </fieldset>}
    {token && imagePicker && <ImageAssetPicker key={token + (imagePicker.replaceId ?? "")} token={token}
      replacing={!!imagePicker.replaceId}
      canUse={imagePicker.replaceId ? layers.some(layer => layer.id === imagePicker.replaceId) : layers.length < MAX_ARTWORK_LAYERS}
      activeAssets={imageAssetIds(config.artwork)} onApply={applyImage} onClose={() => setImagePicker(null)} />}
    {!token && <p className="studio-note">{t("studio-image-sign-in")}</p>}
    <p className="studio-art-production-note">{t("artwork-application-under-review-you-can-save")}</p>
  </div>;
}
