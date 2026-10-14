import React, { useMemo } from "react";
import EyewearViewer from "../eyewear/EyewearViewer";
import { normalizeConfig } from "../eyewear/config";
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
  const canonical = useMemo(
    () => normalizeConfig(config || { shape, material, color, isSunglasses }),
    [config, shape, material, color, isSunglasses],
  );
  return (
    <div style={{ height: 190, width: "100%" }}>
      <EyewearViewer config={canonical} compact />
    </div>
  );
}
