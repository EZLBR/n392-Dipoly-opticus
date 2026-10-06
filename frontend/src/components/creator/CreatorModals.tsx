import React, { useEffect, useRef, useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "../../contexts/LanguageContext";

export function SaveDesignModal({ isOpen, onClose, onOpenDesigns }) {
  const { config, designId, designName, setDesignName, markSaved, showToast } =
    useCreatorStudio();
  const { saveDesign } = useAuth();
  const { language } = useTranslation();
  const pt = language === "pt";
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (isOpen) {
      setError("");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [isOpen]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!designName.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveDesign({
        id: designId,
        name: designName.trim(),
        ...config,
        config,
        model: config.frontModel + "_front_" + config.templeModel + "_temples",
        is_sunglasses: config.isSunglasses,
        anti_reflective: config.lensTreatments.includes("anti_reflective"),
        temple_style: "classic",
        top_bar: config.frontModel === "aviator",
        bridge_style: "soft",
        frame_profile: config.frameProfile,
        temple_open: config.templeOpen,
        published: false,
      });
      markSaved(String(saved.id));
      showToast(
        saved.syncStatus === "local"
          ? pt
            ? "Salvo neste dispositivo. A sincronização não está disponível."
            : "Saved on this device. Sync is unavailable."
          : pt
            ? "Design salvo. Materiais detalhados ficam neste dispositivo."
            : "Design saved. Detailed materials remain on this device.",
      );
      onClose();
      onOpenDesigns?.();
    } catch {
      setError(
        pt
          ? "Não foi possível salvar. Verifique o armazenamento do navegador e tente novamente."
          : "Unable to save. Check browser storage and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="studio-dialog"
      aria-labelledby="save-design-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <form onSubmit={save}>
        <h2 id="save-design-title">
          {pt ? "Guarde sua criação." : "Keep your creation."}
        </h2>
        <p className="studio-note">
          {pt
            ? "O acabamento e os materiais completos são guardados neste navegador. Não limpe os dados do site antes de fazer uma cópia."
            : "The complete finish and materials are stored in this browser. Keep a copy before clearing site data."}
        </p>
        <label>
          {pt ? "Nome do design" : "Design name"}
          <input
            autoFocus
            required
            maxLength={100}
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            placeholder={
              pt ? "Ex.: Meu Wayfarer âmbar" : "e.g. My amber Wayfarer"
            }
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="studio-actions">
          <button
            type="button"
            className="studio-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {pt ? "Cancelar" : "Cancel"}
          </button>
          <button
            type="submit"
            className="studio-primary"
            disabled={busy || !designName.trim()}
          >
            {busy
              ? pt
                ? "Salvando…"
                : "Saving…"
              : pt
                ? "Salvar design"
                : "Save design"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
