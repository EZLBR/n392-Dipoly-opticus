import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "../../contexts/LanguageContext";
import {
  DRAWING_COORDINATE_MAX, MAX_DRAWING_STROKES, MAX_STROKE_POINTS, MAX_STROKE_WIDTH, MIN_STROKE_WIDTH,
  type DrawingLayer, type DrawingPoint, type DrawingStroke,
} from "../../eyewear/artwork";
import { drawingAspect, paintStrokes } from "../../eyewear/drawing";

interface DrawingControlsProps {
  layer: DrawingLayer;
  redo: DrawingStroke[];
  setRedo: (strokes: DrawingStroke[]) => void;
  onChange: (strokes: DrawingStroke[]) => void;
  onRemove: () => void;
}

function pointAt(event: React.PointerEvent<HTMLCanvasElement>): DrawingPoint {
  const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
  const normalize = (position: number, length: number) =>
    Math.round(Math.max(0, Math.min(1, position / Math.max(1, length))) * DRAWING_COORDINATE_MAX);
  return [normalize(event.clientX - left, width), normalize(event.clientY - top, height)];
}

export default function DrawingControls({ layer, redo, setRedo, onChange, onRemove }: DrawingControlsProps) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const liveStroke = useRef<DrawingStroke | null>(null);
  const [preview, setPreview] = useState<DrawingStroke | null>(null);
  const [color, setColor] = useState("#f7f0db");
  const [width, setWidth] = useState(5);
  const [coordinates, setCoordinates] = useState([20, 50, 80, 50]);
  const aspect = drawingAspect(layer.zone);
  const full = layer.strokes.length >= MAX_DRAWING_STROKES;

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context) paintStrokes(context, preview ? [...layer.strokes, preview] : layer.strokes);
  }, [layer.strokes, preview, aspect]);

  const append = (stroke: DrawingStroke) => {
    if (full) return;
    onChange([...layer.strokes, stroke]);
    setRedo([]);
  };
  const cancel = () => {
    pointer.current = null;
    liveStroke.current = null;
    setPreview(null);
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (full || pointer.current !== null || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointer.current = event.pointerId;
    liveStroke.current = { color, width, points: [pointAt(event)] };
    setPreview(liveStroke.current);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = liveStroke.current;
    if (!stroke || pointer.current !== event.pointerId) return;
    const point = pointAt(event);
    const last = stroke.points.at(-1)!;
    if (point[0] === last[0] && point[1] === last[1]) return;
    const points = stroke.points.length < MAX_STROKE_POINTS
      ? stroke.points
      : stroke.points.filter((_, index) => index % 2 === 0);
    liveStroke.current = { ...stroke, points: [...points, point] };
    setPreview(liveStroke.current);
  };
  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== event.pointerId) return;
    move(event);
    if (liveStroke.current) append(liveStroke.current);
    cancel();
  };
  const undoStroke = () => {
    const stroke = layer.strokes.at(-1);
    if (!stroke) return;
    onChange(layer.strokes.slice(0, -1));
    setRedo([...redo, stroke]);
  };
  const redoStroke = () => {
    const stroke = redo.at(-1);
    if (full || !stroke) return;
    onChange([...layer.strokes, stroke]);
    setRedo(redo.slice(0, -1));
  };
  const addStraightStroke = () => {
    const [startX, startY, endX, endY] = coordinates.map(value => Math.round(value * DRAWING_COORDINATE_MAX / 100));
    append({ color, width, points: [[startX, startY], [endX, endY]] });
  };

  return (
    <>
      <p className="studio-note">{t("drawing-help")}</p>
      <canvas
        ref={canvas} className="studio-drawing-pad" width={512} height={512 / aspect}
        role="img" aria-label={t("drawing-pad")}
        onPointerDown={start} onPointerMove={move} onPointerUp={finish}
        onPointerCancel={event => { if (pointer.current === event.pointerId) cancel(); }}
        onLostPointerCapture={event => { if (pointer.current === event.pointerId) cancel(); }}
      />
      <label className="studio-art-color">{t("drawing-color")}
        <input type="color" value={color} onChange={event => setColor(event.target.value)} />
      </label>
      <label>{t("drawing-width")}
        <input aria-label={t("drawing-width")} type="range" min={MIN_STROKE_WIDTH} max={MAX_STROKE_WIDTH}
          value={width} onChange={event => setWidth(Number(event.target.value))} />
        <output>{width}%</output>
      </label>
      <div className="studio-drawing-actions">
        <button className="studio-secondary" type="button" disabled={!layer.strokes.length || !!preview} onClick={undoStroke}>
          {t("drawing-undo")}
        </button>
        <button className="studio-secondary" type="button" disabled={!redo.length || !!preview || full} onClick={redoStroke}>
          {t("drawing-redo")}
        </button>
        <span role="status" aria-label={t("drawing-stroke-count")}>{layer.strokes.length}/{MAX_DRAWING_STROKES}</span>
      </div>
      {full && <p className="studio-note" role="status">{t("drawing-limit")}</p>}
      <details className="studio-drawing-coordinates">
        <summary>{t("drawing-coordinates")}</summary>
        <div>
          {["drawing-start-x", "drawing-start-y", "drawing-end-x", "drawing-end-y"].map((key, index) => (
            <label key={key}>{t(key)}
              <input type="range" min={0} max={100} value={coordinates[index]} aria-valuetext={`${coordinates[index]}%`}
                onChange={event => setCoordinates(previous => previous.map((value, i) => i === index ? Number(event.target.value) : value))} />
            </label>
          ))}
        </div>
        <button className="studio-secondary" type="button" disabled={full || !!preview} onClick={addStraightStroke}>
          {t("drawing-add-line")}
        </button>
      </details>
      <button className="studio-secondary studio-art-remove" type="button" onClick={onRemove}>{t("drawing-remove")}</button>
    </>
  );
}
