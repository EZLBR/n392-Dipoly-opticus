export const patternStyles = ["none", "stripes", "dots", "checker"] as const;
export interface SurfacePattern {
  version: 1;
  style: typeof patternStyles[number];
  scale: number;
  rotation: number;
  ink: string;
}
export const defaultSurfacePattern: SurfacePattern = { version: 1, style: "none", scale: 2, rotation: 0, ink: "#f7f0db" };
export function normalizeSurfacePattern(input: unknown): SurfacePattern {
  if (!input || typeof input !== "object") return { ...defaultSurfacePattern };
  const value = input as Record<string, unknown>;
  if (value.version !== 1) return { ...defaultSurfacePattern };
  const bounded = (key: string, min: number, max: number, fallback: number) =>
    typeof value[key] === "number" && Number.isFinite(value[key]) ? Math.max(min, Math.min(max, value[key])) : fallback;
  return {
    version: 1,
    style: patternStyles.includes(value.style as SurfacePattern["style"]) ? value.style as SurfacePattern["style"] : "none",
    scale: bounded("scale", 1, 6, 2), rotation: bounded("rotation", -180, 180, 0),
    ink: typeof value.ink === "string" && /^#[\da-f]{6}$/i.test(value.ink) ? value.ink : "#f7f0db",
  };
}
