import React, { useState } from "react";
import { useTranslation } from "../contexts/LanguageContext";
import {
  CreatorStudioProvider,
  useCreatorStudio,
} from "../contexts/CreatorStudioContext";
import { useCart } from "../contexts/CartContext";
import { calculateBasePrice } from "../utils/pricing";
import { dimensions, label } from "../eyewear/config";
import ThreePreview from "./creator/ThreePreview";
import TryOnViewport from "./creator/TryOnViewport";
import CustomizationPanel from "./creator/CustomizationPanel";
import { SaveDesignModal } from "./creator/CreatorModals";
import { ArrowLeft, Box, Camera, RotateCw, Check } from "lucide-react";
import "./creator/studio.css";

function CreatorStudioInner({ setView, onOpenDesigns }) {
  const {
    config,
    tryOnMode,
    setTryOnMode,
    statusMessage,
    showToast,
    environment,
    setEnvironment,
    view,
    setCameraView,
    autoRotate,
    setAutoRotate,
    draftStatus,
  } = useCreatorStudio();
  const { language } = useTranslation();
  const pt = language === "pt";
  const { addToCart } = useCart();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const d = dimensions[config.frontModel];
  function add() {
    addToCart({
      id: "custom-" + Date.now(),
      productName:
        label(config.frontModel, language) +
        " · " +
        label(config.frameMaterial, language),
      factoryId: "factory-demo",
      factoryName: "Demo Factory",
      total: calculateBasePrice(config),
      quantity: 1,
      customSpecs: {
        ...config,
        model: config.frontModel,
        profile: config.frameProfile,
      },
    });
    showToast(
      pt
        ? "Sua criação foi adicionada à sacola."
        : "Your creation was added to the bag.",
    );
    setView("cart");
  }
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <button
          className="studio-back"
          onClick={() => setView("marketplace")}
          aria-label={pt ? "Voltar à coleção" : "Back to collection"}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="studio-eyebrow">OPTICUS / ATELIER</span>
          <h1>
            Creator Studio<span>01</span>
          </h1>
        </div>
        <span className="studio-draft">
          <Check size={13} />
          {draftStatus === "saved"
            ? pt
              ? "Salvo neste dispositivo"
              : "Saved on this device"
            : pt
              ? "Não foi possível salvar o rascunho"
              : "Unable to save draft"}
        </span>
      </header>
      <main className="studio-workspace">
        <section
          className={
            "studio-stage " +
            (environment === "wooddark" ? "studio-stage-dark" : "")
          }
          aria-label={pt ? "Prévia do óculos" : "Eyewear preview"}
        >
          <div className="studio-mode">
            <button
              aria-pressed={!tryOnMode}
              onClick={() => setTryOnMode(false)}
            >
              <Box size={15} />
              {pt ? "Modelo 3D" : "3D model"}
            </button>
            <button aria-pressed={tryOnMode} onClick={() => setTryOnMode(true)}>
              <Camera size={15} />
              {pt ? "Experimentar" : "Try on"}
            </button>
          </div>
          <div className="studio-model">
            {tryOnMode ? <TryOnViewport /> : <ThreePreview />}
          </div>
          {!tryOnMode && (
            <>
              <div className="studio-model-caption">
                <span className="studio-eyebrow">
                  OPTICUS /{" "}
                  {label(config.frameMaterial, language).toUpperCase()}
                </span>
                <h2>{label(config.frontModel, language)}</h2>
                <span>
                  {d.lensWidth} □ {d.bridge} — {d.temple} mm
                </span>
              </div>
              <div
                className="studio-view-controls"
                aria-label={pt ? "Ângulo da câmera" : "Camera angle"}
              >
                {(["perspective", "front", "side"] as const).map((v, i) => (
                  <button
                    key={v}
                    aria-pressed={view === v}
                    onClick={() => {
                      setCameraView(v);
                      setAutoRotate(false);
                    }}
                  >
                    {
                      (pt
                        ? ["¾", "Frente", "Lateral"]
                        : ["¾", "Front", "Side"])[i]
                    }
                  </button>
                ))}
                <button
                  aria-label={pt ? "Rotação automática" : "Auto rotate"}
                  aria-pressed={autoRotate}
                  onClick={() => setAutoRotate(!autoRotate)}
                >
                  <RotateCw size={16} />
                </button>
              </div>
              <div className="studio-stage-bottom">
                <label>
                  {pt ? "Luz" : "Light"}
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                  >
                    <option value="studio">{pt ? "Estúdio" : "Studio"}</option>
                    <option value="wooddark">{pt ? "Escuro" : "Dark"}</option>
                    <option value="sunlight">{pt ? "Sol" : "Sun"}</option>
                  </select>
                </label>
                <p>
                  {pt
                    ? "Arraste para girar · Role para aproximar"
                    : "Drag to orbit · Scroll to zoom"}
                </p>
              </div>
            </>
          )}
        </section>
        <aside className="studio-sidebar">
          <CustomizationPanel
            onSave={() => setShowSaveModal(true)}
            onCart={add}
          />
        </aside>
      </main>
      {statusMessage && (
        <div className="studio-toast" role="status">
          {statusMessage}
        </div>
      )}
      <SaveDesignModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onOpenDesigns={onOpenDesigns || (() => setView("designs"))}
      />
    </div>
  );
}
export default function CreatorStudio(props) {
  return (
    <CreatorStudioProvider>
      <CreatorStudioInner {...props} />
    </CreatorStudioProvider>
  );
}
