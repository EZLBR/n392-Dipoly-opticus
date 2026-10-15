import React, { useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { artworkZones, artworkFonts, MAX_TEXT_LAYERS, MAX_TEXT_CHARACTERS, type TextLayer } from "../../eyewear/artwork";

export default function ArtworkPanel() {
  const { config, patchConfig, setCameraView, setAutoRotate, setTryOnMode } = useCreatorStudio();
  const { language } = useTranslation();
  const pt = language === "pt";
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
    const layer: TextLayer = { id: crypto.randomUUID(), text: pt ? "Seu nome" : "Your name", zone: "temple-right",
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
    <p className="studio-note">{pt
      ? "Personalize a frente e as hastes. Lentes e peças de apoio estão bloqueadas para arte."
      : "Personalize the front and temples. Lenses and support components are unavailable for artwork."}</p>
    <div className="studio-art-layer-header">
      <strong>{pt ? "Textos" : "Text layers"} <small>{layers.length}/{MAX_TEXT_LAYERS}</small></strong>
      <button className="studio-secondary" type="button" disabled={layers.length >= MAX_TEXT_LAYERS} onClick={add}>
        {pt ? "Adicionar texto" : "Add text"}
      </button>
    </div>
    {layers.length > 0 && <div className="studio-art-layers" aria-label={pt ? "Camadas de texto" : "Text layers"}>
      {layers.map((layer, index) => <button key={layer.id} type="button" aria-pressed={selected?.id === layer.id}
        onClick={() => { setSelectedId(layer.id); focusZone(layer.zone); }}>
        <span>{String(index + 1).padStart(2, "0")}</span>{layer.text || (pt ? "Texto vazio" : "Empty text")}
      </button>)}
    </div>}
    {!selected && <p className="studio-art-empty">{pt ? "Uma assinatura, uma palavra, uma ideia. Adicione seu primeiro texto." : "A signature, a word, an idea. Add your first text layer."}</p>}
    {selected && <fieldset className="studio-field studio-art-fields">
      <legend>{pt ? "Editar texto" : "Edit text"}</legend>
      <label>{pt ? "Texto" : "Text"}
        <input type="text" aria-label={pt ? "Texto" : "Text"} value={selected.text} maxLength={48} onChange={event => update({ text: event.target.value })} />
        <small>{Array.from(selected.text).length}/{MAX_TEXT_CHARACTERS}</small>
      </label>
      {!selected.text.trim() && <p role="alert" className="studio-note">{pt ? "Preencha o texto antes de salvar." : "Enter text before saving."}</p>}
      <label>{pt ? "Região da armação" : "Frame region"}
        <select aria-label={pt ? "Região da armação" : "Frame region"} value={selected.zone} onChange={event => {
          const zone = event.target.value as TextLayer["zone"]; update({ zone }); focusZone(zone);
        }}>
          {artworkZones.map((zone, index) => <option key={zone} value={zone}>
            {(pt ? ["Frente esquerda", "Frente direita", "Haste esquerda", "Haste direita"] : ["Left front", "Right front", "Left temple", "Right temple"])[index]}
          </option>)}
        </select>
      </label>
      <label>{pt ? "Fonte" : "Font"}
        <select aria-label={pt ? "Fonte" : "Font"} value={selected.font} onChange={event => update({ font: event.target.value as TextLayer["font"] })}>
          {artworkFonts.map((font, index) => <option key={font} value={font}>
            {(pt ? ["Sem serifa", "Serifa", "Monoespaçada"] : ["Sans serif", "Serif", "Monospace"])[index]}
          </option>)}
        </select>
      </label>
      <label className="studio-art-color">{pt ? "Cor do texto" : "Text color"}
        <input aria-label={pt ? "Cor do texto" : "Text color"} type="color" value={selected.color} onChange={event => update({ color: event.target.value })} />
      </label>
      {range("x", pt ? "Posição horizontal" : "Horizontal position", -1, 1, 0.02)}
      {range("y", pt ? "Posição vertical" : "Vertical position", -1, 1, 0.02)}
      {range("size", pt ? "Tamanho do texto" : "Text size", 0.25, 1, 0.01)}
      {range("rotation", pt ? "Rotação" : "Rotation", -30, 30, 1)}
      <button className="studio-secondary studio-art-remove" type="button" onClick={() =>
        patchConfig({ artwork: { version: 1, layers: layers.filter(layer => layer.id !== selected.id) } })}>
        {pt ? "Remover texto" : "Remove text"}
      </button>
    </fieldset>}
    <p className="studio-art-production-note">{pt
      ? "Aplicação em estudo. Você pode salvar esta criação; a compra com arte será liberada após a validação da fábrica."
      : "Application under review. You can save this creation; purchasing artwork designs will be enabled after factory approval."}</p>
  </div>;
}
