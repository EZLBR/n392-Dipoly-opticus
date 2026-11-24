import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../contexts/LanguageContext";
import {
  deleteStudioImage, isCurrentImageSession, listStudioImages, maxStudioImageBytes,
  studioImageError, studioImageTypes, uploadStudioImage, useStudioImages, type StudioImageAsset,
} from "../../eyewear/private-images";

interface Props {
  token: string;
  replacing: boolean;
  canUse: boolean;
  activeAssets: readonly string[];
  onApply: (assetId: string) => void;
  onClose: () => void;
}

async function checkRasterHeader(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP";
  return png || jpeg || webp;
}

export default function ImageAssetPicker({ token, replacing, canUse, activeAssets, onApply, onClose }: Props) {
  const { t, language } = useTranslation();
  const [assets, setAssets] = useState<StudioImageAsset[]>([]);
  const [libraryState, setLibraryState] = useState<"loading" | "ready" | "error">("loading");
  const [libraryAttempt, setLibraryAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingFile, setPendingFile] = useState<File>();
  const [candidate, setCandidate] = useState<{ file: File; url: string; checked: boolean }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"upload" | "delete">();
  const activeRequest = useRef<AbortController | null>(null);
  const capacity = useRef(canUse);
  capacity.current = canUse;
  const selected = assets.find(asset => asset.id === selectedId);
  const [previewAttempt, retryPreview] = useState(0);
  const { images, failed } = useStudioImages(selected ? [selected.id] : [], token, previewAttempt);
  const preview = selected ? images.get(selected.id) : undefined;
  const visibleCandidate = candidate?.file === pendingFile ? candidate : undefined;
  const previewFailed = selected && failed.has(selected.id);

  useEffect(() => {
    const controller = new AbortController();
    setLibraryState("loading");
    listStudioImages(token, controller.signal).then(
      list => {
        if (!controller.signal.aborted && isCurrentImageSession(token)) {
          setAssets(list);
          setLibraryState("ready");
        }
      },
      () => {
        if (!controller.signal.aborted && isCurrentImageSession(token)) setLibraryState("error");
      },
    );
    return () => controller.abort();
  }, [token, libraryAttempt]);

  useEffect(() => () => activeRequest.current?.abort(), [token]);

  useEffect(() => {
    if (!pendingFile) return;
    let disposed = false;
    let url: string | undefined;
    checkRasterHeader(pendingFile).then(valid => {
      if (disposed) return;
      if (!valid) {
        setError("studio-image-format");
        return;
      }
      url = URL.createObjectURL(pendingFile);
      setCandidate({ file: pendingFile, url, checked: false });
    }).catch(() => { if (!disposed) setError("studio-image-invalid"); });
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pendingFile]);

  function chooseFile(file?: File) {
    setPendingFile(undefined);
    setCandidate(undefined);
    setError("");
    if (!file) return;
    if (file.size > maxStudioImageBytes) { setError("studio-image-size"); return; }
    if (file.type && !studioImageTypes.split(",").includes(file.type)) {
      setError("studio-image-format");
      return;
    }
    setPendingFile(file);
  }

  function checkPreview(image: HTMLImageElement) {
    if (!visibleCandidate) return;
    if (image.naturalWidth < 1 || image.naturalHeight < 1 || image.naturalWidth > 4096 || image.naturalHeight > 4096) {
      setError("studio-image-invalid");
      return;
    }
    setCandidate({ ...visibleCandidate, checked: true });
  }

  async function send() {
    if (activeRequest.current || !visibleCandidate?.checked || !capacity.current || !isCurrentImageSession(token)) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy("upload");
    setError("");
    try {
      const asset = await uploadStudioImage(visibleCandidate.file, token, controller.signal);
      if (controller.signal.aborted || !isCurrentImageSession(token)) return;
      if (capacity.current) onApply(asset.id);
      else {
        setError("studio-image-no-layer");
        setAssets(current => [asset, ...current]);
        setPendingFile(undefined);
      }
    } catch (failure) {
      if (!controller.signal.aborted && isCurrentImageSession(token)) setError(studioImageError(failure, language));
    } finally {
      if (!controller.signal.aborted && isCurrentImageSession(token)) setBusy(undefined);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  async function discard(id: string) {
    if (activeRequest.current || id !== selected?.id || selected.inUse || activeAssets.includes(id) || !isCurrentImageSession(token)) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy("delete");
    setError("");
    try {
      await deleteStudioImage(id, token, controller.signal);
      if (controller.signal.aborted || !isCurrentImageSession(token)) return;
      setAssets(current => current.filter(asset => asset.id !== id));
      setSelectedId("");
      setConfirmDelete(false);
    } catch (failure) {
      if (!controller.signal.aborted && isCurrentImageSession(token)) setError(studioImageError(failure, language));
    } finally {
      if (!controller.signal.aborted && isCurrentImageSession(token)) setBusy(undefined);
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }

  function cancel() {
    activeRequest.current?.abort();
    onClose();
  }

  const protectedAsset = selected && (selected.inUse || activeAssets.includes(selected.id));
  return <fieldset className="studio-field studio-art-fields studio-image-picker">
    <legend>{t(replacing ? "studio-image-replace" : "studio-image-library")}</legend>
    <p className="studio-note">{t("studio-image-upload-limits")}</p>
    <label>{t("studio-image-file")}
      <input type="file" accept={studioImageTypes} disabled={!!busy || !canUse}
        onChange={event => chooseFile(event.currentTarget.files?.[0])} />
    </label>
    {visibleCandidate && <img className="studio-image-sample" src={visibleCandidate.url}
      alt={t("studio-image-candidate")} onLoad={event => checkPreview(event.currentTarget)}
      onError={() => setError("studio-image-invalid")} />}
    {error && <p role="alert" className="studio-note">{t(error)}</p>}
    <div className="studio-drawing-actions">
      <button type="button" className="studio-secondary" disabled={!visibleCandidate?.checked || !!busy || !canUse} onClick={send}>
        {t(busy === "upload" ? "studio-image-uploading" : "studio-image-upload")}
      </button>
      <button type="button" className="studio-secondary" onClick={cancel}>{t("studio-save-cancel")}</button>
    </div>
    {libraryState === "loading" && <p role="status">{t("app-loading")}</p>}
    {libraryState === "error" && <p role="status">{t("studio-image-unavailable")}{" "}
      <button type="button" className="studio-secondary" onClick={() => setLibraryAttempt(n => n + 1)}>{t("try-on-try-again")}</button>
    </p>}
    {libraryState === "ready" && assets.length === 0 && <p className="studio-note">{t("studio-image-library-empty")}</p>}
    {assets.length > 0 && <label>{t("studio-image-choose")}
      <select value={selectedId} disabled={!!busy} onChange={event => {
        setSelectedId(event.target.value); setConfirmDelete(false);
      }}>
        <option value="">{t("studio-image-choose")}</option>
        {assets.map((asset, index) =>
          <option key={asset.id} value={asset.id}>
            {t("studio-image-layer")} {assets.length - index} · {asset.width} × {asset.height}
          </option>,
        )}
      </select>
    </label>}
    {preview && <img className="studio-image-sample" src={preview.src} alt={t("studio-image-candidate")} />}
    {previewFailed && <p role="status">{t("studio-image-unavailable")}{" "}
      <button type="button" className="studio-secondary" onClick={() => retryPreview(n => n + 1)}>{t("try-on-try-again")}</button>
    </p>}
    {selected && <div className="studio-drawing-actions">
      <button type="button" className="studio-secondary" disabled={!!busy || !canUse || !preview}
        onClick={() => { if (isCurrentImageSession(token)) onApply(selected.id); }}>{t("studio-image-use")}</button>
      {!protectedAsset && <button type="button" className="studio-secondary" disabled={!!busy}
        onClick={() => confirmDelete ? void discard(selected.id) : setConfirmDelete(true)}>
        {t(confirmDelete ? "studio-image-confirm-delete" : "studio-image-delete-file")}
      </button>}
      {protectedAsset && <p className="studio-note">{t("studio-image-in-use")}</p>}
    </div>}
  </fieldset>;
}
