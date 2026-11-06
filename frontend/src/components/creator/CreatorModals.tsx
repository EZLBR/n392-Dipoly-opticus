import React, { useEffect, useRef, useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useAuth } from "../../contexts/AuthContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { ProblemError } from "../../api/client";

export function SaveDesignModal({ isOpen, onClose, onOpenDesigns }) {
  const { config, designId, designName, setDesignName, markSaved, showToast } =
    useCreatorStudio();
  const { saveDesign, session } = useAuth();
  const { language } = useTranslation();
  const pt = language === "pt";
  const hasEmptyText = config.artwork.layers.some(layer => !layer.text.trim());
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
    if (!designName.trim() || busy || hasEmptyText) return;
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
            ? "Design salvo na sua conta, com materiais e textos."
            : "Design saved to your account, including materials and text.",
      );
      onClose();
      onOpenDesigns?.();
    } catch (error) {
      setError(
        error instanceof ProblemError ? error.detail || error.title || error.message
          : pt
          ? "Não foi possível confirmar o salvamento. Tente novamente."
          : "Unable to confirm the save. Please try again.",
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
          {session
            ? pt ? "Salve na sua conta para continuar esta criação em outro dispositivo. Se estiver sem conexão, o Studio informa quando a cópia ficou apenas aqui."
              : "Save to your account to continue on another device. When offline, Studio tells you if the copy is only stored here."
            : pt ? "Entre na sua conta para acessar esta criação em outros dispositivos. Sem login, o design fica apenas neste navegador."
              : "Sign in to access this creation on other devices. Without login, it is only saved in this browser."}
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
        {hasEmptyText && <p role="alert">{pt ? "Preencha ou remova as camadas de texto vazias antes de salvar." : "Fill in or remove empty text layers before saving."}</p>}
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
            disabled={busy || !designName.trim() || hasEmptyText}
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
