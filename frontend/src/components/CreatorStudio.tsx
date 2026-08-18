import React, { useState } from "react";
import { useTranslation } from "../contexts/LanguageContext";
import { CreatorStudioProvider, useCreatorStudio } from "../contexts/CreatorStudioContext";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { calculateBasePrice } from "../utils/pricing";

import ThreePreview from "./creator/ThreePreview";
import TryOnViewport from "./creator/TryOnViewport";
import CustomizationPanel from "./creator/CustomizationPanel";
import { SaveDesignModal } from "./creator/CreatorModals";

import { ArrowLeft, Sparkles, Box, Camera, Download } from "lucide-react";

function CreatorStudioInner({ setView, onOpenDesigns }) {
  const {
    frontModel, templeModel, frameProfile, frameMaterial, color,
    isSunglasses, lensMaterial, lensTreatments,
    nosePadMaterial, templeTipMaterial, hingeMaterial,
    prescriptionFileName,
    activeStep, setActiveStep,
    tryOnMode, setTryOnMode,
    statusMessage, showToast,
    environment, setEnvironment
  } = useCreatorStudio();

  const { language, t } = useTranslation();
  const { session } = useAuth();
  const { checkoutCart, addToCart } = useCart();

  const [showSaveModal, setShowSaveModal] = useState(false);

  const handleProduceClick = async () => {
    const basePrice = calculateBasePrice({
      isSunglasses,
      frameProfile,
      lensTreatments,
      frameMaterial,
      lensMaterial
    });

    const orderData = {
      id: `custom-${Date.now()}`,
      productName: `Customized ${frameMaterial.toUpperCase()} ${frontModel.toUpperCase()}`,
      total: basePrice,
      quantity: 1,
      customSpecs: {
        frontModel, templeModel,
        color, profile: frameProfile,
        frameMaterial, lensMaterial, lensTreatments,
        nosePadMaterial, templeTipMaterial, hingeMaterial,
        isSunglasses,
        prescriptionUploaded: !!prescriptionFileName
      }
    };

    if (!session) {
      addToCart(orderData);
      localStorage.setItem("opticus_redirect_after_login", "cart");
      showToast(language === "pt" ? "Faça login para continuar o pagamento." : "Please log in to continue payment.");
      setView("login");
      return;
    }

    try {
      showToast(language === "pt" ? "Redirecionando para pagamento..." : "Redirecting to payment...");
      const result = await checkoutCart([orderData]);
      if (result && result.success) {
        if (result.isOffline) {
          showToast(language === "pt" ? "Pedido enfileirado (Modo Offline)" : "Order queued (Offline mode)");
          setView("marketplace");
        } else if (result.checkoutUrl) {
          window.location.href = result.checkoutUrl;
        }
      } else {
        showToast("Error processing order.");
      }
    } catch (e) {
      console.error(e);
      showToast("Error starting payment.");
    }
  };

  return (
    <div className="page-create" style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", backgroundColor: "#f8fbff" }}>

      {/* Toast Notifier */}
      {statusMessage && (
        <div style={{
          position: "fixed", bottom: "30px", right: "30px", background: "rgba(255, 255, 255, 0.08)",
          backdropFilter: "blur(12px)", border: "1px solid rgba(255, 255, 255, 0.15)",
          padding: "16px 24px", borderRadius: "8px", color: "#111", zIndex: 1000,
          display: "flex", alignItems: "center", gap: "10px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)"
        }}>
          <Sparkles size={18} style={{ color: "var(--primary-accent)" }} />
          <span style={{ fontSize: "14px", fontWeight: "600" }}>{statusMessage}</span>
        </div>
      )}

      {/* Main Workspace */}
      <main style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative", paddingTop: "85px" }}>

        {/* Left Side: 3D / AR Viewport */}
        <div style={{ flex: 1, position: "relative", display: "flex", flexDirection: "column" }}>

          {/* Top Toolbar overlay */}
          <div style={{
            position: "absolute", top: "24px", left: "50%", transform: "translateX(-50%)", zIndex: 20,
            display: "flex", gap: "8px", background: "rgba(255,255,255,0.8)", backdropFilter: "blur(8px)",
            padding: "6px", borderRadius: "16px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)", border: "1px solid #eaeaea"
          }}>
            <button
              style={{
                padding: "8px 24px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px",
                display: "flex", alignItems: "center", gap: "8px", border: "none", cursor: "pointer", transition: "all 0.2s",
                background: !tryOnMode ? "#fff" : "transparent",
                color: !tryOnMode ? "#000" : "#666",
                boxShadow: !tryOnMode ? "0 2px 8px rgba(0,0,0,0.1)" : "none"
              }}
              onClick={() => setTryOnMode(false)}
            >
              <Box size={14} />
              {language === "pt" ? "Renderização 3D" : "3D Render"}
            </button>
            <button
              style={{
                padding: "8px 24px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "1px",
                display: "flex", alignItems: "center", gap: "8px", border: "none", cursor: "pointer", transition: "all 0.2s",
                background: tryOnMode ? "#fff" : "transparent",
                color: tryOnMode ? "#000" : "#666",
                boxShadow: tryOnMode ? "0 2px 8px rgba(0,0,0,0.1)" : "none"
              }}
              onClick={() => setTryOnMode(true)}
            >
              <Camera size={14} />
              {language === "pt" ? "Live Try-On" : "Live Try-On"}
            </button>
          </div>

          {/* Environment Switcher */}
          {!tryOnMode && (
            <div style={{
              position: "absolute", bottom: "24px", left: "24px", zIndex: 20, display: "flex", flexDirection: "column", gap: "8px",
              background: "rgba(255,255,255,0.8)", backdropFilter: "blur(8px)", padding: "10px", borderRadius: "16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.05)", border: "1px solid #eaeaea"
            }}>
              <span style={{ fontSize: "10px", fontWeight: "bold", color: "#aaa", textTransform: "uppercase", letterSpacing: "1px", padding: "0 8px" }}>
                {language === "pt" ? "Cenário" : "Environment"}
              </span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px", border: environment === "studio" ? "2px solid #000" : "1px solid #ccc",
                    background: "#f8fbff", cursor: "pointer"
                  }}
                  onClick={() => setEnvironment("studio")}
                  title="Studio Lighting"
                />
                <button
                  style={{
                    width: "32px", height: "32px", borderRadius: "8px", border: environment === "wood" ? "2px solid #000" : "1px solid #ccc",
                    background: "#3d2713", cursor: "pointer"
                  }}
                  onClick={() => setEnvironment("wood")}
                  title="Dark Wood"
                />
              </div>
            </div>
          )}

          {/* Viewport Layer */}
          <div style={{ flex: 1, position: "relative", width: "100%", height: "100%" }}>
            <div style={{ position: "absolute", inset: 0, opacity: tryOnMode ? 0 : 1, pointerEvents: tryOnMode ? "none" : "auto", transition: "opacity 0.5s" }}>
              <ThreePreview />
            </div>

            <div style={{ position: "absolute", inset: 0, opacity: !tryOnMode ? 0 : 1, pointerEvents: !tryOnMode ? "none" : "auto", transition: "opacity 0.5s" }}>
              {tryOnMode && <TryOnViewport />}
            </div>
          </div>
        </div>

        {/* Right Side: Customization Panel */}
        <aside style={{ width: "400px", height: "100%", flexShrink: 0, position: "relative", zIndex: 30 }}>
          <CustomizationPanel onSave={() => setShowSaveModal(true)} onOrder={handleProduceClick} />
        </aside>

      </main>

      {/* Modals */}
      <SaveDesignModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onOpenDesigns={onOpenDesigns}
      />
    </div>
  );
}

// Wrapper to provide the Customization State Context
export default function CreatorStudio(props) {
  return (
    <CreatorStudioProvider>
      <CreatorStudioInner {...props} />
    </CreatorStudioProvider>
  );
}
