import React, { useState } from "react";
import { useTranslation } from "../contexts/LanguageContext";
import {
  CreatorStudioProvider,
  useCreatorStudio,
} from "../contexts/CreatorStudioContext";
import { useCart } from "../contexts/CartContext";
import { calculateBasePrice } from "../utils/pricing";
import { dimensions, label } from "../eyewear/config";
import { hasUnapprovedCustomization } from "../eyewear/artwork";
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
  const { language, t } = useTranslation();

  const { addToCart } = useCart();
  const [showSaveModal, setShowSaveModal] = useState(false);
  const d = dimensions[config.frontModel];
  function add() {
    if (hasUnapprovedCustomization(config)) {
      showToast(t("decoration-preview"));
      return;
    }
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
      t("studio-your-creation-was-added-to-the"),
    );
    setView("cart");
  }
  return (
    <div className="studio-shell">
      <header className="studio-header">
        <button
          className="studio-back"
          onClick={() => setView("marketplace")}
          aria-label={t("studio-back-to-collection")}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="studio-eyebrow">{t("brand-atelier")}</span>
          <h1>
            Creator Studio<span>01</span>
          </h1>
        </div>
        <span className="studio-draft">
          <Check size={13} />
          {draftStatus === "saved"
            ? t("studio-saved-on-this-device")
            : t("studio-unable-to-save-draft")}
        </span>
      </header>
      <main className="studio-workspace">
        <section
          className={
            "studio-stage " +
            (environment === "wooddark" ? "studio-stage-dark" : "")
          }
          aria-label={t("studio-eyewear-preview")}
        >
          <div className="studio-mode">
            <button
              aria-pressed={!tryOnMode}
              onClick={() => setTryOnMode(false)}
            >
              <Box size={15} />
              {t("studio-3d-model")}
            </button>
            <button aria-pressed={tryOnMode} onClick={() => setTryOnMode(true)}>
              <Camera size={15} />
              {t("studio-try-on")}
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
                aria-label={t("studio-camera-angle")}
              >
                {(["perspective", "front", "side", "left-side"] as const).map((v) => (
                  <button
                    key={v}
                    aria-pressed={view === v}
                    onClick={() => {
                      setCameraView(v);
                      setAutoRotate(false);
                    }}
                  >
                    {t(`studio-view-${v}`)}
                  </button>
                ))}
                <button
                  aria-label={t("studio-auto-rotate")}
                  aria-pressed={autoRotate}
                  onClick={() => setAutoRotate(!autoRotate)}
                >
                  <RotateCw size={16} />
                </button>
              </div>
              <div className="studio-stage-bottom">
                <label>
                  {t("studio-light")}
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value)}
                  >
                    <option value="studio">{t("studio-studio")}</option>
                    <option value="wooddark">{t("studio-dark")}</option>
                    <option value="sunlight">{t("studio-sun")}</option>
                  </select>
                </label>
                <p>
                  {t("studio-drag-to-orbit-scroll-to-zoom")}
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
