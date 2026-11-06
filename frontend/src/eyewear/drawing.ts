import { DRAWING_COORDINATE_MAX, type ArtworkZone, type DrawingStroke } from "./artwork";

export const drawingAspect = (zone: ArtworkZone) => zone.startsWith("front") ? 4 : 8;

export function paintStrokes(context: CanvasRenderingContext2D, strokes: readonly DrawingStroke[]) {
  const { width, height } = context.canvas;
  context.clearRect(0, 0, width, height);
  context.lineCap = context.lineJoin = "round";
  for (const stroke of strokes) {
    const [[x, y], ...rest] = stroke.points;
    const startX = x * width / DRAWING_COORDINATE_MAX;
    const startY = y * height / DRAWING_COORDINATE_MAX;
    const lineWidth = stroke.width * height / 100;
    context.beginPath();
    if (rest.length === 0) {
      context.fillStyle = stroke.color;
      context.arc(startX, startY, lineWidth / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.strokeStyle = stroke.color;
    context.lineWidth = lineWidth;
    context.moveTo(startX, startY);
    for (const [px, py] of rest) {
      context.lineTo(px * width / DRAWING_COORDINATE_MAX, py * height / DRAWING_COORDINATE_MAX);
    }
    context.stroke();
  }
}
