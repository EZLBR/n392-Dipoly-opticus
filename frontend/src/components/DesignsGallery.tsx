import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { localizeProblem, useTranslation } from "../contexts/LanguageContext";
import { Sparkles, Trash2, Edit, ShoppingCart } from "lucide-react";
import * as THREE from "three";
import { calculateBasePrice } from "../utils/pricing";

import ThreePreview from "./ThreePreview";
import { normalizeConfig, label } from "../eyewear/config";
import { hasArtwork } from "../eyewear/artwork";
import { ProblemError } from "../api/client";

export default function DesignsGallery({ setView }) {
  const { session, designs, deleteDesign } = useAuth();
  const { addToCart } = useCart();
  const { t, language } = useTranslation();
  const [deleteError, setDeleteError] = useState("");
  // Guest-created local drafts remain usable; authenticated remote designs keep the login gate.
  const visibleDesigns = session ? designs : designs.filter(design => design.syncStatus === "local");

  const handleOpenDesign = (index) => {
    localStorage.setItem("opticus_active_design", String(index));
    localStorage.setItem("opticus_active_design_id", String(designs[index].id));
    localStorage.removeItem("opticus_active_product");
    setView("create");
  };

  const handleDelete = async (index) => {
    const design = designs[index];
    setDeleteError("");
    try {
      await deleteDesign(design.id);
    } catch (error) {
      setDeleteError(error instanceof ProblemError ? localizeProblem(error.problem, language)
        : t("designs-unable-to-delete-the-design-check"));
    }
  };

  const handleAddToCart = (design) => {
    const config = normalizeConfig(design);
    if (hasArtwork(config)) return;
    const price = calculateBasePrice(config);

    const cartItem = {
      id: design.id || `design-${Date.now()}`,
      productName: design.name || t("designs-custom"),
      factoryId: "factory-demo",
      factoryName: "Demo Factory",
      total: price,
      customSpecs: {
        ...config,
        model: config.frontModel,
        profile: config.frameProfile,
        templeStyle: design.templeStyle || "standard",
        bridgeStyle: design.bridgeStyle || "standard",
        antiReflective: config.lensTreatments.includes("anti_reflective"),
        prescriptionUploaded: !!design.prescriptionFileName
      }
    };

    addToCart(cartItem);
    alert(t("cart-item-added"));
  };

  if (!session && visibleDesigns.length === 0) {
    return (
      <div className="page-wrapper" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
        <div className="empty-state" style={{ textAlign: "center" }}>
          <h2>{t("designs-auth-title")}</h2>
          <p>{t("designs-auth-intro")}</p>
          <button className="btn primary" onClick={() => setView("login")} style={{ marginTop: "20px" }}>{t("designs-sign-in")}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-marketplace">
      <div className="page-wrapper">
        {deleteError && <p role="alert">{deleteError}</p>}
        <section className="hero hero-marketplace" style={{ minHeight: "30vh", paddingBottom: "40px" }}>
          <div className="hero-copy">
            <span className="eyebrow">{t("designs-collection")}</span>
            <h1>{t("designs-title")}</h1>
            <p>{t("designs-intro")}</p>
            <div className="hero-actions">
              <button className="btn primary hero-btn" onClick={() => { localStorage.removeItem("opticus_active_design"); localStorage.removeItem("opticus_active_design_id"); localStorage.removeItem("opticus_active_product"); localStorage.removeItem("opticus_creator_draft"); setView("create"); }}>
                <Sparkles size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                {t("designs-create")}
              </button>
            </div>
          </div>
        </section>

        <section className="products" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "30px", marginTop: "40px" }}>
          {(visibleDesigns.length === 0) ? (
            <div className="empty-state" style={{ gridColumn: "1/-1", textAlign: "center", padding: "100px 0", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.1)" }}>
              <h3 style={{ marginBottom: "10px" }}>{t("designs-empty")}</h3>
              <p style={{ color: "var(--color-hint)" }}>{t("designs-empty-intro")}</p>
            </div>
          ) : (
            visibleDesigns.map((design) => {
              const index = designs.indexOf(design);
              const config = normalizeConfig(design);
              const shape = label(config.frontModel, language);
              const material = label(config.frameMaterial, language);
              const dateObj = new Date(design.createdAt || design.created_at || Date.now());

              return (
                <article key={design.id || index} className="product-card" style={{ display: "flex", flexDirection: "column" }}>
                  <div className="product-badge" style={{ left: "12px", right: "auto", background: "var(--primary-accent)", color: "#fff" }}>
                    {t(design.published ? "designs-published" : "designs-private")}
                  </div>

                  <button
                    onClick={() => handleDelete(index)}
                    style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(255,0,0,0.2)", color: "#ff4444", border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
                    title={t("designs-delete")}
                  >
                    <Trash2 size={14} />
                  </button>

                  <ThreePreview config={design} />

                  <div className="product-meta" style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div className="product-topline" style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", textTransform: "uppercase", color: "var(--color-hint)", marginBottom: "8px" }}>
                      <span>{dateObj.toLocaleDateString(language === "pt" ? "pt-BR" : "en-US")}</span>
                      <span>{shape} / {material}</span>
                    </div>

                    <h3 style={{ fontSize: "18px", margin: "0 0 16px 0" }}>{design.name || `${t("designs-custom")} #${index + 1}`}</h3>
                    {design.syncStatus === "local" && <p style={{ fontSize: 12 }}>{t("designs-saved-on-this-device-not-synced")}</p>}

                    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => handleOpenDesign(index)}>
                        <Edit size={14} style={{ marginRight: "6px" }} /> {t("designs-edit")}
                      </button>
                      {hasArtwork(config) && <p style={{ fontSize: 12 }}>
                        {t("designs-artwork-purchasing-awaits-factory-approval-you")}
                      </p>}
                      <button className="btn primary" disabled={hasArtwork(config)} style={{ width: "100%", justifyContent: "center" }} onClick={() => handleAddToCart(design)}>
                        <ShoppingCart size={14} style={{ marginRight: "6px" }} /> {t("designs-add-cart")}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
