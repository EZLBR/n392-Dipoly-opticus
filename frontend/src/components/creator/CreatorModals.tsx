import React, { useEffect, useRef, useState } from "react";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useAuth } from "../../contexts/AuthContext";
import { localizeProblem, useTranslation } from "../../contexts/LanguageContext";
import { ProblemError } from "../../api/client";

export function SaveDesignModal({ isOpen, onClose, onOpenDesigns }) {
  const { config, designId, designName, setDesignName, markSaved, showToast } =
    useCreatorStudio();
  const { saveDesign, session } = useAuth();
  const { language, t } = useTranslation();
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
          ? t("studio-save-saved-on-this-device-sync-is")
          : t("studio-save-design-saved-to-your-account-including"),
      );
      onClose();
      onOpenDesigns?.();
    } catch (error) {
      setError(
        error instanceof ProblemError ? localizeProblem(error.problem, language)
          : t("studio-save-unable-to-confirm-the-save-please"),
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
          {t("studio-save-keep-your-creation")}
        </h2>
        <p className="studio-note">
          {session
            ? t("studio-save-save-to-your-account-to-continue")
            : t("studio-save-sign-in-to-access-this-creation")}
        </p>
        <label>
          {t("studio-save-design-name")}
          <input
            autoFocus
            required
            maxLength={100}
            value={designName}
            onChange={(e) => setDesignName(e.target.value)}
            placeholder={
              t("studio-save-e-g-my-amber-wayfarer")
            }
          />
        </label>
        {error && <p role="alert">{error}</p>}
        {hasEmptyText && <p role="alert">{t("studio-save-fill-in-or-remove-empty-text")}</p>}
        <div className="studio-actions">
          <button
            type="button"
            className="studio-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t("studio-save-cancel")}
          </button>
          <button
            type="submit"
            className="studio-primary"
            disabled={busy || !designName.trim() || hasEmptyText}
          >
            {busy
              ? t("studio-save-saving")
              : t("studio-save-save-design")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
