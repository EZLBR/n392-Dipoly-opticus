export const artworkZones = ["front-left", "front-right", "temple-left", "temple-right"] as const;
export const artworkFonts = ["sans", "serif", "mono"] as const;
export type ArtworkZone = typeof artworkZones[number];
export type ArtworkFont = typeof artworkFonts[number];
export interface TextLayer {
  id: string;
  text: string;
  zone: ArtworkZone;
  font: ArtworkFont;
  color: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
}
export interface Artwork { version: 1; layers: TextLayer[] }
export const MAX_TEXT_LAYERS = 6;
export const MAX_TEXT_CHARACTERS = 24;
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizeArtwork(input: unknown): Artwork {
  const result: Artwork = { version: 1, layers: [] };
  if (!input || typeof input !== "object") return result;
  const source = input as Record<string, unknown>;
  if (source.version !== 1 || !Array.isArray(source.layers)) return result;
  const ids = new Set<string>();
  for (const [index, raw] of source.layers.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const layer = raw as Record<string, unknown>;
    if (!artworkZones.includes(layer.zone as ArtworkZone) || typeof layer.text !== "string") continue;
    const id = typeof layer.id === "string" && layer.id.length > 0 && layer.id.length <= 64 ? layer.id : `text-${index}`;
    if (ids.has(id)) continue;
    ids.add(id);
    result.layers.push({
      id, text: Array.from(layer.text.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, MAX_TEXT_CHARACTERS).join(""),
      zone: layer.zone as ArtworkZone,
      font: artworkFonts.includes(layer.font as ArtworkFont) ? layer.font as ArtworkFont : "sans",
      color: typeof layer.color === "string" && /^#[\da-f]{6}$/i.test(layer.color) ? layer.color : "#f7f0db",
      x: clamp(layer.x, -1, 1, 0), y: clamp(layer.y, -1, 1, 0),
      size: clamp(layer.size, 0.25, 1, 0.7), rotation: clamp(layer.rotation, -30, 30, 0),
    });
    if (result.layers.length === MAX_TEXT_LAYERS) break;
  }
  return result;
}

export const hasArtwork = (config: { artwork?: Artwork }) => Boolean(config.artwork?.layers.length);
