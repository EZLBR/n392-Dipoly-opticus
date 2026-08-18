import React, { useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { Check, Sliders, Box, ShieldCheck, Sun, Eye, Droplet, Sparkles, Layers, Download } from "lucide-react";

const CURATED_COLORS = [
  { name: "Matte Charcoal", hex: "#111827" },
  { name: "Chambery Crystal", hex: "#dbeafe" },
  { name: "Tortoise Acetate", hex: "#78350f" },
  { name: "Champagne Gold", hex: "#d97706" },
  { name: "Emerald Glaze", hex: "#065f46" },
  { name: "Crimson Lacquer", hex: "#991b1b" },
  { name: "Slate Titanium", hex: "#64748b" },
  { name: "Rose Gold", hex: "#b76e79" },
];

export default function CustomizationPanel({ onSave, onOrder }) {
  const {
    frontModel, setFrontModel,
    templeModel, setTempleModel,
    frameProfile, setFrameProfile,
    frameMaterial, setFrameMaterial,
    color, setColor,
    isSunglasses, setIsSunglasses,
    lensMaterial, setLensMaterial,
    lensTreatments, toggleLensTreatment,
    nosePadMaterial, setNosePadMaterial,
    templeTipMaterial, setTempleTipMaterial,
    hingeMaterial, setHingeMaterial,
    templeOpen, setTempleOpen
  } = useCreatorStudio();

  const { language, t } = useTranslation();
  const [activeTab, setActiveTab] = useState("frame");

  const renderTabButton = (id, label, icon) => (
    <button
      onClick={() => setActiveTab(id)}
      style={{
        flex: 1, padding: "12px 8px", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", border: "none", cursor: "pointer",
        background: "transparent", transition: "all 0.2s",
        borderBottom: activeTab === id ? "2px solid #000" : "2px solid transparent",
        color: activeTab === id ? "#000" : "#999"
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div style={{
      background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", boxShadow: "-4px 0 24px rgba(0,0,0,0.08)",
      borderTopLeftRadius: "24px", borderBottomLeftRadius: "24px", height: "100%", display: "flex", flexDirection: "column",
      borderLeft: "1px solid #eaeaea", overflow: "hidden"
    }}>

      {/* Tabs Header */}
      <div style={{ display: "flex", borderBottom: "1px solid #eaeaea", background: "rgba(248, 250, 252, 0.5)", paddingTop: "8px", paddingLeft: "8px", paddingRight: "8px" }}>
        {renderTabButton("frame", language === "pt" ? "Armação" : "Frame", <Box size={16} />)}
        {renderTabButton("lenses", language === "pt" ? "Lentes" : "Lenses", <Eye size={16} />)}
        {renderTabButton("details", language === "pt" ? "Detalhes" : "Details", <Sliders size={16} />)}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "32px" }}>

        {/* --- TAB: FRAME --- */}
        {activeTab === "frame" && (
          <>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Silhueta Frontal" : "Front Silhouette"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {[
                  { id: "aviator", label: "Aviator" },
                  { id: "wayfarer", label: "Wayfarer" },
                  { id: "cateye", label: "Cat-Eye" }
                ].map((s) => (
                  <button
                    key={s.id}
                    style={{
                      padding: "12px 8px", borderRadius: "8px", fontSize: "13px", border: "1px solid", cursor: "pointer", transition: "all 0.2s",
                      borderColor: frontModel === s.id ? "#000" : "#e2e8f0", background: frontModel === s.id ? "#000" : "#fff",
                      color: frontModel === s.id ? "#fff" : "#475569", fontWeight: frontModel === s.id ? "600" : "400"
                    }}
                    onClick={() => setFrontModel(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Silhueta da Haste" : "Temple Design"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {[
                  { id: "aviator", label: "Aviator" },
                  { id: "wayfarer", label: "Wayfarer" },
                  { id: "cateye", label: "Cat-Eye" }
                ].map((s) => (
                  <button
                    key={s.id}
                    style={{
                      padding: "12px 8px", borderRadius: "8px", fontSize: "13px", border: "1px solid", cursor: "pointer", transition: "all 0.2s",
                      borderColor: templeModel === s.id ? "#000" : "#e2e8f0", background: templeModel === s.id ? "#000" : "#fff",
                      color: templeModel === s.id ? "#fff" : "#475569", fontWeight: templeModel === s.id ? "600" : "400"
                    }}
                    onClick={() => setTempleModel(s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Material da Armação" : "Frame Material"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                {[
                  { id: "acetate", label: "Acetate", group: "Polymer" },
                  { id: "tr90", label: "TR90", group: "Polymer" },
                  { id: "stainless_steel", label: "Steel", group: "Metal" },
                  { id: "titanium", label: "Titanium", group: "Metal" },
                  { id: "gold", label: "Gold", group: "Metal" },
                  { id: "wood", label: "Wood", group: "Natural" },
                  { id: "carbon_fiber", label: "Carbon", group: "Composite" }
                ].map((m) => (
                  <button
                    key={m.id}
                    style={{
                      padding: "10px 12px", borderRadius: "8px", border: "1px solid", cursor: "pointer", transition: "all 0.2s",
                      display: "flex", flexDirection: "column", textAlign: "left",
                      borderColor: frameMaterial === m.id ? "#000" : "#e2e8f0", background: frameMaterial === m.id ? "#f8fafc" : "#fff",
                    }}
                    onClick={() => setFrameMaterial(m.id)}
                  >
                    <span style={{ fontWeight: "600", fontSize: "13px", color: "#0f172a" }}>{m.label}</span>
                    <span style={{ fontSize: "10px", color: "#94a3b8" }}>{m.group}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
                {language === "pt" ? "Cores" : "Colors"}
                <span style={{ fontWeight: "normal", color: "#cbd5e1" }}>{color}</span>
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px", alignItems: "center" }}>
                <div style={{ position: "relative", width: "100%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", border: "1px solid rgba(0,0,0,0.1)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)", outline: !CURATED_COLORS.find(c => c.hex === color) ? "2px solid #000" : "none", outlineOffset: "2px", transform: !CURATED_COLORS.find(c => c.hex === color) ? "scale(1.15)" : "scale(1)", transition: "transform 0.2s" }}>
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ position: "absolute", opacity: 0, width: "200%", height: "200%", top: "-50%", left: "-50%", cursor: "pointer" }} title={language === "pt" ? "Cor Customizada" : "Custom Color"} />
                  {!CURATED_COLORS.find(c => c.hex === color) && <Check size={14} color="#fff" style={{ zIndex: 1, filter: "drop-shadow(0px 0px 2px rgba(0,0,0,0.8))" }} />}
                </div>
                {CURATED_COLORS.slice(0, 4).map((c) => (
                  <button
                    key={c.hex}
                    style={{
                      width: "100%", aspectRatio: "1", borderRadius: "50%", border: "1px solid rgba(0,0,0,0.1)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s",
                      backgroundColor: c.hex,
                      transform: color === c.hex ? "scale(1.15)" : "scale(1)",
                      outline: color === c.hex ? "2px solid #000" : "none",
                      outlineOffset: "2px"
                    }}
                    onClick={() => setColor(c.hex)}
                    title={c.name}
                  >
                    {color === c.hex && <Check size={14} color={c.hex === "#111827" ? "#fff" : "#000"} />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Perfil da Armação" : "Frame Profile"}
              </label>
              <div style={{ display: "flex", background: "#f1f5f9", padding: "4px", borderRadius: "8px" }}>
                {[
                  { id: "thin", label: "Thin" },
                  { id: "medium", label: "Medium" },
                  { id: "bold", label: "Bold" }
                ].map((p) => (
                  <button
                    key={p.id}
                    style={{
                      flex: 1, padding: "8px", fontSize: "13px", borderRadius: "6px", border: "none", cursor: "pointer", transition: "all 0.2s",
                      background: frameProfile === p.id ? "#fff" : "transparent",
                      color: frameProfile === p.id ? "#0f172a" : "#64748b",
                      fontWeight: frameProfile === p.id ? "600" : "400",
                      boxShadow: frameProfile === p.id ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                    }}
                    onClick={() => setFrameProfile(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* --- TAB: LENSES --- */}
        {activeTab === "lenses" && (
          <>
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0", position: "relative" }}>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", width: "100%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                  <div style={{ padding: "8px", borderRadius: "50%", background: isSunglasses ? "#000" : "#e2e8f0", color: isSunglasses ? "#fff" : "#64748b" }}>
                    <Sun size={18} />
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontWeight: "600", fontSize: "14px" }}>{language === "pt" ? "Lentes Solares" : "Sunglasses Mode"}</h4>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>{language === "pt" ? "Adiciona pigmentação escura" : "Adds dark tinting"}</p>
                  </div>
                </div>
                <div style={{ width: "48px", height: "24px", borderRadius: "12px", padding: "4px", background: isSunglasses ? "#000" : "#cbd5e1", transition: "background 0.3s", position: "relative" }}>
                  <div style={{ width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "transform 0.3s", transform: isSunglasses ? "translateX(24px)" : "translateX(0)" }} />
                </div>
              </label>
              <button
                onClick={() => setIsSunglasses(!isSunglasses)}
                style={{ position: 'absolute', inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer", border: "none" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Material da Lente" : "Lens Material"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
                <button
                  style={{
                    padding: "12px 8px", borderRadius: "8px", fontSize: "13px", border: "1px solid", cursor: "pointer", transition: "all 0.2s",
                    borderColor: lensMaterial === "cr39" ? "#000" : "#e2e8f0", background: lensMaterial === "cr39" ? "#000" : "#fff",
                    color: lensMaterial === "cr39" ? "#fff" : "#475569"
                  }}
                  onClick={() => setLensMaterial("cr39")}
                >
                  CR-39 (Standard)
                </button>
                <button
                  style={{
                    padding: "12px 8px", borderRadius: "8px", fontSize: "13px", border: "1px solid", cursor: "pointer", transition: "all 0.2s",
                    borderColor: lensMaterial === "polycarbonate" ? "#000" : "#e2e8f0", background: lensMaterial === "polycarbonate" ? "#000" : "#fff",
                    color: lensMaterial === "polycarbonate" ? "#fff" : "#475569"
                  }}
                  onClick={() => setLensMaterial("polycarbonate")}
                >
                  Polycarbonate
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Tratamentos (Coating)" : "Lens Treatments"}
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[
                  { id: "anti_reflective", icon: <Layers size={16}/>, label: "Anti-Reflective" },
                  { id: "uv_protection", icon: <Sun size={16}/>, label: "UV Protection" },
                  { id: "blue_light", icon: <Eye size={16}/>, label: "Blue Light Filter" },
                  { id: "mirrored", icon: <Sparkles size={16}/>, label: "Mirrored Finish" },
                  { id: "polarized", icon: <Droplet size={16}/>, label: "Polarized" },
                  { id: "photochromic", icon: <ShieldCheck size={16}/>, label: "Photochromic" }
                ].map((t) => {
                  const isActive = lensTreatments.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => toggleLensTreatment(t.id)}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "12px", borderRadius: "8px", border: "1px solid", cursor: "pointer", transition: "all 0.2s",
                        borderColor: isActive ? "#000" : "#f1f5f9", background: isActive ? "#f8fafc" : "#fff",
                      }}
                    >
                      <div style={{ padding: "6px", borderRadius: "6px", background: isActive ? "#000" : "#f1f5f9", color: isActive ? "#fff" : "#64748b" }}>
                        {t.icon}
                      </div>
                      <span style={{ fontSize: "13px", fontWeight: "500", color: isActive ? "#000" : "#475569" }}>
                        {t.label}
                      </span>
                      {isActive && <Check size={16} color="#000" style={{ marginLeft: "auto" }} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* --- TAB: DETAILS --- */}
        {activeTab === "details" && (
          <>
            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "flex", justifyContent: "space-between" }}>
                {language === "pt" ? "Abertura da Haste" : "Temple Fold"}
                <span style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: "4px", color: "#475569" }}>{(templeOpen * 100).toFixed(0)}</span>
              </label>
              <input
                type="range"
                min="-0.05" max="0.65" step="0.01"
                value={templeOpen}
                onChange={(e) => setTempleOpen(parseFloat(e.target.value))}
                style={{ width: "100%", accentColor: "#000", cursor: "pointer" }}
              />
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Material das Plaquetas" : "Nose Pad Material"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {["silicone", "titanium", "acetate"].map(m => (
                  <button
                    key={m}
                    style={{
                      padding: "8px 4px", fontSize: "12px", fontWeight: "500", border: "1px solid", borderRadius: "6px", textTransform: "capitalize", cursor: "pointer", transition: "all 0.2s",
                      borderColor: nosePadMaterial === m ? "#000" : "#e2e8f0", background: nosePadMaterial === m ? "#000" : "#fff",
                      color: nosePadMaterial === m ? "#fff" : "#475569"
                    }}
                    onClick={() => setNosePadMaterial(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Material da Ponteira" : "Temple Tip Material"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {["acetate", "silicone", "rubber"].map(m => (
                  <button
                    key={m}
                    style={{
                      padding: "8px 4px", fontSize: "12px", fontWeight: "500", border: "1px solid", borderRadius: "6px", textTransform: "capitalize", cursor: "pointer", transition: "all 0.2s",
                      borderColor: templeTipMaterial === m ? "#000" : "#e2e8f0", background: templeTipMaterial === m ? "#000" : "#fff",
                      color: templeTipMaterial === m ? "#fff" : "#475569"
                    }}
                    onClick={() => setTempleTipMaterial(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: "11px", fontWeight: "bold", color: "#888", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px", display: "block" }}>
                {language === "pt" ? "Material da Dobradiça" : "Hinge Material"}
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                {["stainless_steel", "titanium", "gold"].map(m => (
                  <button
                    key={m}
                    style={{
                      padding: "8px 4px", fontSize: "12px", fontWeight: "500", border: "1px solid", borderRadius: "6px", textTransform: "capitalize", cursor: "pointer", transition: "all 0.2s",
                      borderColor: hingeMaterial === m ? "#000" : "#e2e8f0", background: hingeMaterial === m ? "#000" : "#fff",
                      color: hingeMaterial === m ? "#fff" : "#475569"
                    }}
                    onClick={() => setHingeMaterial(m)}
                  >
                    {m.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer Actions */}
      <div style={{ padding: "16px 24px", borderTop: "1px solid #eaeaea", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", display: "flex", gap: "12px", flexShrink: 0 }}>
        <button
          style={{ flex: 1, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#f1f5f9", color: "#0f172a", border: "1px solid #e2e8f0", cursor: "pointer" }}
          onClick={onSave}
        >
          <Download size={16} />
          {language === "pt" ? "Salvar" : "Save"}
        </button>
        <button
          style={{ flex: 1.5, padding: "12px", borderRadius: "10px", fontSize: "13px", fontWeight: "600", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", background: "#2563eb", color: "#fff", border: "none", cursor: "pointer", boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)" }}
          onClick={onOrder}
        >
          <Sparkles size={16} />
          {language === "pt" ? "Produzir" : "Produce"}
        </button>
      </div>
    </div>
  );
}
