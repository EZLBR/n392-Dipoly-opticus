import React, { createContext, useContext, useState, useEffect } from "react";

const CreatorStudioContext = createContext<any>(undefined);

export function useCreatorStudio() {
  return useContext(CreatorStudioContext);
}

export function CreatorStudioProvider({ children }) {
  // --- UI & Step Navigation ---
  const [activeStep, setActiveStep] = useState(1);
  const [tryOnMode, setTryOnMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [draftStatus, setDraftStatus] = useState("No local draft");
  const [environment, setEnvironment] = useState("studio");

  // --- Basic Silhouette & Geometry ---
  const [frontModel, setFrontModel] = useState("aviator"); // aviator, wayfarer, cateye
  const [templeModel, setTempleModel] = useState("aviator"); // aviator, wayfarer, cateye
  const [frameProfile, setFrameProfile] = useState("medium"); // thin, medium, bold
  const [templeOpen, setTempleOpen] = useState(0.22); // leg fold: -0.05 to 0.65

  // --- Advanced Frame Customization ---
  // Frame materials: stainless_steel, titanium, gold, acetate, tr90, wood, carbon_fiber
  const [frameMaterial, setFrameMaterial] = useState("acetate");
  const [color, setColor] = useState("#111827"); // Base hex color for the material

  // --- Lenses Customization ---
  const [isSunglasses, setIsSunglasses] = useState(false);
  // Materials: cr39, polycarbonate
  const [lensMaterial, setLensMaterial] = useState("cr39");
  // Treatments: anti_reflective, uv_protection, blue_light, mirrored, polarized, photochromic
  const [lensTreatments, setLensTreatments] = useState(["anti_reflective", "uv_protection"]);
  const [prescriptionFileName, setPrescriptionFileName] = useState("");

  // --- Components Mix & Match ---
  const [nosePadMaterial, setNosePadMaterial] = useState("silicone"); // silicone, titanium, acetate
  const [templeTipMaterial, setTempleTipMaterial] = useState("acetate"); // silicone, acetate, rubber
  const [hingeMaterial, setHingeMaterial] = useState("stainless_steel"); // stainless_steel, titanium, gold

  // Helper function to show quick toast messages
  const showToast = (msg) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), 3000);
  };

  // Toggle a lens treatment on/off
  const toggleLensTreatment = (treatment) => {
    setLensTreatments((prev) =>
      prev.includes(treatment)
        ? prev.filter(t => t !== treatment)
        : [...prev, treatment]
    );
  };

  // --- Draft Restoration & Autosave ---
  useEffect(() => {
    const draftRaw = localStorage.getItem("opticus_creator_draft");
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        if (draft && draft.config) {
          const c = draft.config;
          if (c.frontModel) setFrontModel(c.frontModel);
          else if (c.model) { setFrontModel(c.model); setTempleModel(c.model); } // Legacy
          if (c.templeModel) setTempleModel(c.templeModel);
          if (c.frameProfile) setFrameProfile(c.frameProfile);
          if (c.frameMaterial) setFrameMaterial(c.frameMaterial);
          if (c.color) setColor(c.color);
          if (c.isSunglasses !== undefined) setIsSunglasses(c.isSunglasses);
          if (c.lensMaterial) setLensMaterial(c.lensMaterial);
          if (c.lensTreatments) setLensTreatments(c.lensTreatments);
          if (c.nosePadMaterial) setNosePadMaterial(c.nosePadMaterial);
          if (c.templeTipMaterial) setTempleTipMaterial(c.templeTipMaterial);
          if (c.hingeMaterial) setHingeMaterial(c.hingeMaterial);
          setDraftStatus("Draft restored");
        }
      } catch (e) {
        console.error("Failed to load draft", e);
      }
    }
  }, []);

  useEffect(() => {
    const configState = {
      frontModel, templeModel, frameProfile, frameMaterial, color,
      isSunglasses, lensMaterial, lensTreatments,
      nosePadMaterial, templeTipMaterial, hingeMaterial
    };

    const draftPayload = {
      updatedAt: new Date().toISOString(),
      config: configState
    };
    localStorage.setItem("opticus_creator_draft", JSON.stringify(draftPayload));
    setDraftStatus("Autosaved locally");
  }, [
    frontModel, templeModel, frameProfile, frameMaterial, color,
    isSunglasses, lensMaterial, lensTreatments,
    nosePadMaterial, templeTipMaterial, hingeMaterial
  ]);

  const value = {
    // UI State
    activeStep, setActiveStep,
    tryOnMode, setTryOnMode,
    statusMessage, setStatusMessage, showToast,
    draftStatus,
    environment, setEnvironment,

    // Geometry State
    frontModel, setFrontModel,
    templeModel, setTempleModel,
    frameProfile, setFrameProfile,
    templeOpen, setTempleOpen,

    // Frame Customization
    frameMaterial, setFrameMaterial,
    color, setColor,

    // Lenses
    isSunglasses, setIsSunglasses,
    lensMaterial, setLensMaterial,
    lensTreatments, setLensTreatments, toggleLensTreatment,
    prescriptionFileName, setPrescriptionFileName,

    // Components
    nosePadMaterial, setNosePadMaterial,
    templeTipMaterial, setTempleTipMaterial,
    hingeMaterial, setHingeMaterial
  };

  return (
    <CreatorStudioContext.Provider value={value}>
      {children}
    </CreatorStudioContext.Provider>
  );
}
