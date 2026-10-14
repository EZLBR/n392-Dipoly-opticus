import React, { useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";
import { useTranslation } from "../../contexts/LanguageContext";
import { lensShape, proportions } from "../../eyewear/geometry";
import { frameAppearance, lensAppearance } from "../../eyewear/materials";
import { isMetal, type EyewearConfig } from "../../eyewear/config";

/** Same millimetre contours/proportions as the 3D builder. AR remains a frontal approximation. */
export function drawEyewearOverlay(
  ctx: CanvasRenderingContext2D,
  c: EyewearConfig,
  environment: string,
  x: number,
  y: number,
  scale: number,
  angle: number,
) {
  const d = proportions(c),
    look = lensAppearance(c, environment);
  const { color } = frameAppearance(c);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, -scale);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = d.rim * 1.4;
  const contour = lensShape(c.frontModel, d.lensWidth, d.lensHeight).getPoints(
    32,
  );
  for (const side of [-1, 1]) {
    ctx.beginPath();
    contour.forEach((p, i) => {
      const px = side * (p.x + d.center);
      if (!i) ctx.moveTo(px, p.y);
      else ctx.lineTo(px, p.y);
    });
    ctx.closePath();
    ctx.fillStyle = look.mirrored
      ? "#afc5d4"
      : look.dark
        ? "rgba(37,54,42,.85)"
        : c.lensTreatments.includes("blue_light")
          ? "rgba(255,249,221,.2)"
          : "rgba(227,240,249,.14)";
    ctx.fill();
    ctx.globalAlpha =
      c.finish === "crystal" && c.frameMaterial === "acetate" ? 0.65 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(side * (d.center + d.lensWidth * 0.46), d.lensHeight * 0.25);
    ctx.lineTo(
      side * (d.center + d.lensWidth * 0.5 + d.rim + 3),
      d.lensHeight * 0.25,
    );
    ctx.stroke();
  }
  const bx = d.center - d.lensWidth * 0.46,
    by = d.lensHeight * 0.27;
  ctx.lineWidth = isMetal(c) ? 2.1 : d.rim * 1.44;
  ctx.beginPath();
  ctx.moveTo(-bx, by);
  ctx.quadraticCurveTo(0, by + 8, bx, by);
  ctx.stroke();
  if (c.frontModel === "aviator") {
    ctx.lineWidth = isMetal(c) ? 1.7 : 2.6;
    ctx.beginPath();
    ctx.moveTo(-d.center * 0.8, d.lensHeight * 0.45);
    ctx.quadraticCurveTo(
      0,
      d.lensHeight * 0.61,
      d.center * 0.8,
      d.lensHeight * 0.45,
    );
    ctx.stroke();
  }
  ctx.restore();
}
export default function TryOnViewport() {
  const { config, environment, setTryOnMode } = useCreatorStudio();
  const { language } = useTranslation();
  const pt = language === "pt";
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    live = useRef({ config, environment });
  live.current = { config, environment };
  const [state, setState] = useState<
      "loading" | "tracking" | "searching" | "error"
    >("loading"),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false,
      stream: MediaStream | undefined,
      tracker: FaceLandmarker | undefined,
      frame = 0,
      previousTime = -1;
    let smooth:
      | { x: number; y: number; scale: number; angle: number }
      | undefined;
    const stop = () => {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
      tracker?.close();
      tracker = undefined;
      if (video.current) video.current.srcObject = null;
    };
    async function start() {
      setState("loading");
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error("Camera unavailable");
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (cancelled) {
          stop();
          return;
        }
        const { FaceLandmarker, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );
        const files = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
        );
        if (cancelled) {
          stop();
          return;
        }
        tracker = await FaceLandmarker.createFromOptions(files, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        if (cancelled || !video.current) {
          stop();
          return;
        }
        video.current.srcObject = stream;
        await video.current.play();
        if (cancelled) {
          stop();
          return;
        }
        const render = () => {
          if (cancelled) return;
          try {
            const v = video.current,
              target = canvas.current;
            if (
              v &&
              target &&
              v.readyState >= 2 &&
              v.currentTime !== previousTime
            ) {
              previousTime = v.currentTime;
              if (
                target.width !== v.videoWidth ||
                target.height !== v.videoHeight
              ) {
                target.width = v.videoWidth;
                target.height = v.videoHeight;
              }
              const ctx = target.getContext("2d");
              if (!ctx) throw new Error("Canvas unavailable");
              ctx.save();
              ctx.translate(target.width, 0);
              ctx.scale(-1, 1);
              ctx.drawImage(v, 0, 0);
              ctx.restore();
              const face = tracker!.detectForVideo(v, performance.now())
                .faceLandmarks[0];
              if (face) {
                const eyes = [33, 263]
                  .map((i) => ({
                    x: (1 - face[i].x) * target.width,
                    y: face[i].y * target.height,
                  }))
                  .sort((a, b) => a.x - b.x);
                const [left, right] = eyes,
                  d = proportions(live.current.config);
                const next = {
                  x: (left.x + right.x) / 2,
                  y: (left.y + right.y) / 2 + 5,
                  scale:
                    (Math.hypot(right.x - left.x, right.y - left.y) * 1.35) /
                    (2 * d.lensWidth + d.bridge),
                  angle: Math.atan2(right.y - left.y, right.x - left.x),
                };
                if (!smooth) smooth = next;
                else
                  for (const key of ["x", "y", "scale", "angle"] as const)
                    smooth[key] += (next[key] - smooth[key]) * 0.25;
                drawEyewearOverlay(
                  ctx,
                  live.current.config,
                  live.current.environment,
                  smooth.x,
                  smooth.y,
                  smooth.scale,
                  smooth.angle,
                );
                setState("tracking");
              } else {
                smooth = undefined;
                setState("searching");
              }
            }
            frame = requestAnimationFrame(render);
          } catch {
            stop();
            if (!cancelled) setState("error");
          }
        };
        render();
      } catch {
        stop();
        if (!cancelled) setState("error");
      }
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [attempt]);
  return (
    <div className="studio-tryon">
      <video ref={video} playsInline muted />
      <canvas
        ref={canvas}
        aria-label={
          pt ? "Prévia do óculos na câmera" : "Camera eyewear preview"
        }
      />
      {(state === "loading" || state === "error") && (
        <div className="studio-camera-message" role="status">
          <p>
            {state === "loading"
              ? pt
                ? "Aguardando câmera e preparando o rastreamento…"
                : "Waiting for camera and preparing tracking…"
              : pt
                ? "Câmera indisponível. Verifique a permissão, a conexão e se outro app está usando a câmera."
                : "Camera unavailable. Check permission, connection and whether another app is using it."}
          </p>
          {state === "error" && (
            <button
              className="studio-primary"
              onClick={() => setAttempt((n) => n + 1)}
            >
              {pt ? "Tentar novamente" : "Try again"}
            </button>
          )}
          <button
            className="studio-secondary"
            onClick={() => setTryOnMode(false)}
          >
            {pt ? "Voltar ao 3D" : "Back to 3D"}
          </button>
        </div>
      )}
      {(state === "tracking" || state === "searching") && (
        <div className="studio-tracking-label" role="status">
          {state === "searching"
            ? pt
              ? "Posicione seu rosto de frente para a câmera"
              : "Face the camera"
            : pt
              ? "Prévia frontal aproximada • não mede o ajuste no rosto"
              : "Approximate frontal preview • does not measure fit"}
        </div>
      )}
    </div>
  );
}
