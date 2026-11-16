import React, { useState } from "react";
import { fullImageCrop, type ImageCrop, type ImageLayer } from "../../eyewear/artwork";
import { useStudioImages } from "../../eyewear/private-images";
import { useTranslation } from "../../contexts/LanguageContext";

export default function ImageCropControls({ layer, token, onChange }: {
  layer: ImageLayer;
  token?: string;
  onChange: (crop: ImageCrop) => void;
}) {
  const { t } = useTranslation();
  const [attempt, retry] = useState(0);
  const { images, failed } = useStudioImages([layer.assetId], token, attempt);
  const image = images.get(layer.assetId);
  if (!image) {
    return failed.has(layer.assetId) ? <p role="status">
      {t("studio-image-unavailable")}{" "}
      <button type="button" className="studio-secondary" onClick={() => retry(n => n + 1)}>{t("try-on-try-again")}</button>
    </p> : <p role="status">{t("app-loading")}</p>;
  }

  const width = image.naturalWidth, height = image.naturalHeight;
  const crop = layer.crop;
  const x = Math.min(width - 1, Math.round(crop.x * width));
  const y = Math.min(height - 1, Math.round(crop.y * height));
  const w = Math.max(1, Math.round((crop.x + crop.width) * width) - x);
  const h = Math.max(1, Math.round((crop.y + crop.height) * height) - y);
  const update = (nextX: number, nextY: number, nextW: number, nextH: number) => onChange({
    x: nextX / width, y: nextY / height, width: Math.min(nextW / width, 1 - nextX / width),
    height: Math.min(nextH / height, 1 - nextY / height),
  });
  const range = (label: string, value: number, min: number, max: number, change: (pixels: number) => void) =>
    <label>{t(label)} <output>{value}px</output>
      <input aria-label={t(label)} type="range" min={min} max={max} value={value} disabled={max <= min}
        onChange={event => change(Number(event.currentTarget.value))} />
    </label>;

  return <fieldset className="studio-field studio-image-crop">
    <legend>{t("studio-image-crop-controls")}</legend>
    <div className="studio-image-crop-preview">
      <img src={image.src} alt={t("studio-image-crop-preview")} />
      <span aria-hidden="true" style={{ left: crop.x * 100 + "%", top: crop.y * 100 + "%",
        width: crop.width * 100 + "%", height: crop.height * 100 + "%" }} />
    </div>
    {range("studio-image-crop-x", x, 0, width - w, pixels => update(pixels, y, w, h))}
    {range("studio-image-crop-y", y, 0, height - h, pixels => update(x, pixels, w, h))}
    {range("studio-image-crop-width", w, 1, width - x, pixels => update(x, y, pixels, h))}
    {range("studio-image-crop-height", h, 1, height - y, pixels => update(x, y, w, pixels))}
    <button type="button" className="studio-secondary" onClick={() => onChange(fullImageCrop)}>{t("studio-image-reset-crop")}</button>
  </fieldset>;
}
