import React, { useMemo } from "react";
import EyewearViewer from "../eyewear/EyewearViewer";
import { normalizeConfig } from "../eyewear/config";
import { useTranslation } from "../contexts/LanguageContext";
export default function ThreePreview({
  config,
  shape = "round",
  material = "acetate",
  color = "#382016",
  isSunglasses = false,
}: {
  config?: unknown;
  shape?: string;
  material?: string;
  color?: string;
  isSunglasses?: boolean;
}) {
  const { language } = useTranslation();
  const canonical = useMemo(
    () => normalizeConfig(config || { shape, material, color, isSunglasses }),
    [config, shape, material, color, isSunglasses],
  );
  return (
    <div style={{ height: 190, width: "100%" }}>
      <EyewearViewer config={canonical} language={language} compact />
    </div>
  );
}
