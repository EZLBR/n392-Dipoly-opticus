import React from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useTranslation } from "../contexts/LanguageContext";
import { Sparkles, Trash2, Edit, ShoppingCart } from "lucide-react";
import * as THREE from "three";
import { calculateBasePrice } from "../utils/pricing";

import ThreePreview from "./ThreePreview";

export default function DesignsGallery({ setView }) {
  const { session, designs, deleteBackendDesign, isBackendConnected } = useAuth();
  const { addToCart } = useCart();
  const { t, language } = useTranslation();

  const handleOpenDesign = (index) => {
    localStorage.setItem("opticus_active_design", String(index));
    localStorage.removeItem("opticus_active_product");
    setView("create");
  };

  const handleDelete = async (index) => {
    const design = designs[index];
    if (isBackendConnected && design.id) {
      await deleteBackendDesign(design.id);
    } else {
      // Fallback local delete
      const next = designs.filter((_, idx) => idx !== index);
      localStorage.setItem("opticus_designs", JSON.stringify(next));
      window.location.reload(); // Quick refresh for fallback state
    }

    // Clear active design if it was the one deleted
    const activeIndex = localStorage.getItem("opticus_active_design");
    if (activeIndex !== null && Number(activeIndex) === index) {
      localStorage.removeItem("opticus_active_design");
    }
  };

  const handleAddToCart = (design) => {
    const price = calculateBasePrice({
      isSunglasses: design.isSunglasses,
      frameProfile: design.frameProfile,
      lensTreatments: design.antiReflective ? ["anti-reflective"] : [],
      frameMaterial: design.frameMaterial || "acetate",
      lensMaterial: design.lensMaterial || "cr39"
    });

    const cartItem = {
      id: design.id || `design-${Date.now()}`,
      productName: design.name || "Custom Design",
      factoryId: "factory-demo",
      factoryName: "Demo Factory",
      total: price,
      customSpecs: {
        model: design.model || "round",
        color: design.color || "#000000",
        profile: design.frameProfile || "standard",
        templeStyle: design.templeStyle || "standard",
        bridgeStyle: design.bridgeStyle || "standard",
        isSunglasses: !!design.isSunglasses,
        antiReflective: !!design.antiReflective,
        prescriptionUploaded: !!design.prescriptionFileName
      }
    };

    addToCart(cartItem);
    alert(t("cart-item-added") || "Added to cart!");
  };

  if (!session) {
    return (
      <div className="page-wrapper" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "80vh" }}>
        <div className="empty-state" style={{ textAlign: "center" }}>
          <h2>Authentication Required</h2>
          <p>Please log in to view your saved designs.</p>
          <button className="btn primary" onClick={() => setView("login")} style={{ marginTop: "20px" }}>Log In</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-marketplace">
      <div className="page-wrapper">
        <section className="hero hero-marketplace" style={{ minHeight: "30vh", paddingBottom: "40px" }}>
          <div className="hero-copy">
            <span className="eyebrow">My Collection</span>
            <h1>YOUR DESIGNS</h1>
            <p>Access, edit, and order the custom eyewear you have crafted in the Opticus Studio.</p>
            <div className="hero-actions">
              <button className="btn primary hero-btn" onClick={() => setView("create")}>
                <Sparkles size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                CREATE NEW
              </button>
            </div>
          </div>
        </section>

        <section className="products" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "30px", marginTop: "40px" }}>
          {(!designs || designs.length === 0) ? (
            <div className="empty-state" style={{ gridColumn: "1/-1", textAlign: "center", padding: "100px 0", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.1)" }}>
              <h3 style={{ marginBottom: "10px" }}>No designs saved yet</h3>
              <p style={{ color: "var(--color-hint)" }}>Open the Studio to start crafting your perfect frame.</p>
            </div>
          ) : (
            (designs || []).map((design, index) => {
              const shape = design?.model || "round";
              const material = design.isSunglasses ? "metal" : "acetate";
              const dateObj = design.created_at ? new Date(design.created_at) : new Date();

              return (
                <article key={design.id || index} className="product-card" style={{ display: "flex", flexDirection: "column" }}>
                  <div className="product-badge" style={{ left: "12px", right: "auto", background: "var(--primary-accent)", color: "#fff" }}>
                    {design.published ? "Published" : "Private"}
                  </div>

                  <button
                    onClick={() => handleDelete(index)}
                    style={{ position: "absolute", top: "12px", right: "12px", background: "rgba(255,0,0,0.2)", color: "#ff4444", border: "none", borderRadius: "50%", width: "32px", height: "32px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10 }}
                    title="Delete Design"
                  >
                    <Trash2 size={14} />
                  </button>

                  <ThreePreview shape={shape} material={material} />

                  <div className="product-meta" style={{ padding: "20px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div className="product-topline" style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", textTransform: "uppercase", color: "var(--color-hint)", marginBottom: "8px" }}>
                      <span>{dateObj.toLocaleDateString()}</span>
                      <span>{shape} / {material}</span>
                    </div>

                    <h3 style={{ fontSize: "18px", margin: "0 0 16px 0" }}>{design.name || `Custom Design #${index + 1}`}</h3>

                    <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => handleOpenDesign(index)}>
                        <Edit size={14} style={{ marginRight: "6px" }} /> EDIT IN STUDIO
                      </button>
                      <button className="btn primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => handleAddToCart(design)}>
                        <ShoppingCart size={14} style={{ marginRight: "6px" }} /> ADD TO CART
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
