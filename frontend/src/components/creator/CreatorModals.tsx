import React, { useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useAuth } from "../../contexts/AuthContext";
import { useCart } from "../../contexts/CartContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { X, Sparkles, Check, ShoppingBag } from "lucide-react";

export function SaveDesignModal({ isOpen, onClose, onOpenDesigns }) {
  const {
    frontModel, templeModel, frameProfile, frameMaterial, color,
    isSunglasses, lensMaterial, lensTreatments,
    nosePadMaterial, templeTipMaterial, hingeMaterial,
    templeOpen, prescriptionFileName, showToast
  } = useCreatorStudio();

  const { saveDesign } = useAuth();
  const { language } = useTranslation();
  const [designName, setDesignName] = useState("");

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    const cleanName = designName.trim();
    if (!cleanName) {
      showToast(language === "pt" ? "Por favor forneça um nome" : "Please provide a design name.");
      return;
    }

    try {
      const activeIndex = localStorage.getItem("opticus_active_design");
      const isNew = activeIndex === null;

      const savedRaw = localStorage.getItem("opticus_designs") || "[]";
      const designs = JSON.parse(savedRaw);
      const activeDesignId = !isNew && designs[parseInt(activeIndex, 10)] ? designs[parseInt(activeIndex, 10)].id : null;
      let finalId = activeDesignId || `design-${Date.now()}`;

      const newDesign = {
        id: finalId,
        name: cleanName,
        model: `${frontModel}_front_${templeModel}_temples`, // Legacy compatibility
        frontModel,
        templeModel,
        color,
        isSunglasses,
        antiReflective: lensTreatments.includes("anti_reflective"), // Legacy support
        prescriptionFileName,
        templeStyle: "classic", // Legacy support
        topBar: false, // Legacy support
        bridgeStyle: "soft", // Legacy support
        frameProfile,
        templeOpen,

        // New features
        frameMaterial,
        lensMaterial,
        lensTreatments,
        nosePadMaterial,
        templeTipMaterial,
        hingeMaterial,

        published: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      try {
        const backendRes = await saveDesign({
          id: finalId.startsWith("design-") ? null : finalId,
          name: newDesign.name,
          model: newDesign.model,
          color: newDesign.color,
          is_sunglasses: newDesign.isSunglasses,
          anti_reflective: newDesign.antiReflective,
          temple_style: newDesign.templeStyle,
          top_bar: newDesign.topBar,
          bridge_style: newDesign.bridgeStyle,
          frame_profile: newDesign.frameProfile,
          temple_open: newDesign.templeOpen,
          published: newDesign.published
        });

        if (backendRes && backendRes.id) {
          finalId = backendRes.id;
          newDesign.id = finalId;
        }
      } catch (err) {
         console.warn("Backend save failed, saved locally", err);
      }

      if (isNew) {
        designs.push(newDesign);
        localStorage.setItem("opticus_active_design", String(designs.length - 1));
      } else {
        designs[parseInt(activeIndex, 10)] = newDesign;
      }

      localStorage.setItem("opticus_designs", JSON.stringify(designs));
      localStorage.removeItem("opticus_creator_draft");

      showToast(language === "pt" ? "Design salvo com sucesso!" : "Design saved successfully!");
      onClose();
      if (onOpenDesigns) onOpenDesigns();
    } catch (err) {
      console.error(err);
      showToast("Failed to save design.");
    }
  };

  return (
    <div className="modal open" style={{ display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div className="modal-card" style={{ maxWidth: "420px" }}>
        <div className="modal-head" style={{ borderBottom: "1px solid var(--glass-card-border)", paddingBottom: "12px" }}>
          <h3>{language === "pt" ? "SALVAR PROJETO" : "SAVE TO MY DESIGNS"}</h3>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <form onSubmit={handleSave} style={{ marginTop: "20px" }}>
          <div style={{ marginBottom: "20px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: "var(--color-hint)", marginBottom: "8px", textTransform: "uppercase" }}>
              {language === "pt" ? "Nome do Design" : "Design Name"}
            </label>
            <input
              type="text"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
              placeholder="e.g. Amber Hexagon, Summer Edition"
              required
              className="premium-input"
              style={{ width: "100%", padding: "10px 14px", fontSize: "14px" }}
            />
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={onClose}>
              {language === "pt" ? "CANCELAR" : "CANCEL"}
            </button>
            <button type="submit" className="btn primary" style={{ flex: 1 }}>
              {language === "pt" ? "CONFIRMAR" : "CONFIRM SAVE"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
