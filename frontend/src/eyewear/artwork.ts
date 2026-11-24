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
export type DrawingPoint = [number, number];
export interface DrawingStroke {
  color: string;
  width: number;
  points: DrawingPoint[];
}
export interface DrawingLayer {
  id: string;
  kind: "drawing";
  zone: ArtworkZone;
  strokes: DrawingStroke[];
}
export interface ImageCrop { x: number; y: number; width: number; height: number }
export interface ImageLayer {
  id: string;
  kind: "image";
  assetId: string;
  zone: ArtworkZone;
  x: number;
  y: number;
  size: number;
  rotation: number;
  crop: ImageCrop;
}
export type ArtworkLayer = TextLayer | DrawingLayer | ImageLayer;
export interface Artwork { version: 1 | 2 | 3; layers: ArtworkLayer[] }
export const fullImageCrop: ImageCrop = { x: 0, y: 0, width: 1, height: 1 };
export function isImageLayer(layer: ArtworkLayer): layer is ImageLayer {
  return "kind" in layer && layer.kind === "image";
}
export function imageAssetIds(artwork: Artwork) {
  return [...new Set(artwork.layers.filter(isImageLayer).map(layer => layer.assetId))].sort();
}
const assetIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_ARTWORK_LAYERS = 6;
export const MAX_TEXT_CHARACTERS = 24;
export const MAX_DRAWING_STROKES = 32;
export const MAX_STROKE_POINTS = 128;
export const DRAWING_COORDINATE_MAX = 1000;
export const MIN_STROKE_WIDTH = 2;
export const MAX_STROKE_WIDTH = 20;
const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const isColor = (value: unknown): value is string => typeof value === "string" && /^#[\da-f]{6}$/i.test(value);
const isPoint = (value: unknown): value is DrawingPoint =>
  Array.isArray(value) && value.length === 2
  && value.every(coordinate => Number.isInteger(coordinate) && coordinate >= 0 && coordinate <= DRAWING_COORDINATE_MAX);

function normalizeStrokes(input: unknown): DrawingStroke[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_DRAWING_STROKES).flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const { color, width, points } = value as Record<string, unknown>;
    if (!isColor(color) || typeof width !== "number" || !Number.isInteger(width) || width < MIN_STROKE_WIDTH || width > MAX_STROKE_WIDTH
      || !Array.isArray(points) || !points.length || points.length > MAX_STROKE_POINTS || !points.every(isPoint)) return [];
    return [{ color, width, points: points.map(([x, y]): DrawingPoint => [x, y]) }];
  });
}

function normalizeCrop(value: unknown): ImageCrop | null {
  if (!value || typeof value !== "object") return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number"
    || ![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0
    || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
}

export function normalizeArtwork(input: unknown): Artwork {
  const result: Artwork = { version: 1, layers: [] };
  if (!input || typeof input !== "object") return result;
  const source = input as Record<string, unknown>;
  if ((source.version !== 1 && source.version !== 2 && source.version !== 3) || !Array.isArray(source.layers)) return result;
  result.version = source.version;
  const ids = new Set<string>();
  for (const [index, raw] of source.layers.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const layer = raw as Record<string, unknown>;
    const zone = layer.zone as ArtworkZone;
    const drawing = source.version >= 2 && layer.kind === "drawing";
    const image = source.version === 3 && layer.kind === "image";
    if (!artworkZones.includes(zone) || (!drawing && !image && (layer.kind !== undefined || typeof layer.text !== "string"))) continue;
    const id = typeof layer.id === "string" && layer.id.length > 0 && layer.id.length <= 64
      ? layer.id : `${drawing ? "drawing" : image ? "image" : "text"}-${index}`;
    if (ids.has(id)) continue;
    ids.add(id);
    if (image) {
      const crop = normalizeCrop(layer.crop);
      if (typeof layer.assetId !== "string" || !assetIdPattern.test(layer.assetId) || !crop) continue;
      result.layers.push({ id, kind: "image", assetId: layer.assetId.toLowerCase(), zone, crop,
        x: clamp(layer.x, -1, 1, 0), y: clamp(layer.y, -1, 1, 0),
        size: clamp(layer.size, 0.25, 1, 0.8), rotation: clamp(layer.rotation, -30, 30, 0),
      });
    } else if (drawing) {
      result.layers.push({ id, kind: "drawing", zone, strokes: normalizeStrokes(layer.strokes) });
    } else if (typeof layer.text === "string") {
      result.layers.push({
        id, text: Array.from(layer.text.replace(/[\u0000-\u001f\u007f]/g, " ")).slice(0, MAX_TEXT_CHARACTERS).join(""),
        zone,
        font: artworkFonts.includes(layer.font as ArtworkFont) ? layer.font as ArtworkFont : "sans",
        color: isColor(layer.color) ? layer.color : "#f7f0db",
        x: clamp(layer.x, -1, 1, 0), y: clamp(layer.y, -1, 1, 0),
        size: clamp(layer.size, 0.25, 1, 0.7), rotation: clamp(layer.rotation, -30, 30, 0),
      });
    }
    if (result.layers.length === MAX_ARTWORK_LAYERS) break;
  }
  return result;
}

export const hasArtwork = (config: { artwork?: Artwork }) => Boolean(config.artwork?.layers.length);
export const hasUnapprovedCustomization = (config: { artwork?: Artwork; surfacePattern?: { style?: string } }) =>
  hasArtwork(config) || Boolean(config.surfacePattern?.style && config.surfacePattern.style !== "none");
