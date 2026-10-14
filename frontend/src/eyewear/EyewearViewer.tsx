import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { geometryKey, type EyewearConfig } from "./config";
import { buildEyewear, type EyewearModel } from "./geometry";
import { createMaterials } from "./materials";

export type CameraView = "perspective" | "front" | "side";
interface Props {
  config: EyewearConfig;
  compact?: boolean;
  environment?: string;
  autoRotate?: boolean;
  view?: CameraView;
  language?: string;
}

export default function EyewearViewer({
  config,
  compact = false,
  environment = "studio",
  autoRotate = false,
  view = "perspective",
  language = "pt",
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    live = useRef({ config, environment, autoRotate });
  live.current = { config, environment, autoRotate };
  const update = useRef<() => void>(() => {}),
    changeView = useRef<(v: CameraView) => void>(() => {});
  const keyboard = useRef<(key: string) => void>(() => {});
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
      "loading",
    ),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: compact,
        powerPreference: compact ? "low-power" : "high-performance",
      });
    } catch {
      setStatus("error");
      return;
    }
    setStatus("loading");
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, compact ? 1.25 : 1.75),
    );
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(34, 1, 1, 1800);
    const room = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer),
      reflection = pmrem.fromScene(room, 0.04);
    scene.environment = reflection.texture;
    room.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb4a48d, 1.5));
    const key = new THREE.DirectionalLight(0xfff7eb, 3);
    key.position.set(-80, 180, 180);
    key.castShadow = !compact;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -180,
      right: 180,
      top: 180,
      bottom: -180,
      far: 650,
    });
    key.shadow.bias = -0.0003;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xddeaff, 1.2);
    fill.position.set(100, 40, -80);
    scene.add(fill);
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000),
      groundMaterial = new THREE.ShadowMaterial({ opacity: 0.14 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -34;
    ground.receiveShadow = true;
    if (!compact) scene.add(ground);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 130;
    controls.maxDistance = 750;
    controls.maxPolarAngle = Math.PI * 0.84;
    controls.target.set(0, -3, -48);
    controls.enabled = !compact;
    const surfaces = createMaterials();
    let model: EyewearModel | undefined,
      currentKey = "",
      visible = true,
      running = true,
      frame = 0,
      currentView = view,
      needsRender = true;
    update.current = () => {
      needsRender = true;
      const c = live.current.config,
        nextKey = geometryKey(c);
      if (nextKey !== currentKey) {
        if (model) {
          scene.remove(model.group);
          model.dispose();
        }
        model = buildEyewear(c, surfaces.materials);
        scene.add(model.group);
        currentKey = nextKey;
      }
      model!.setFold(c.templeOpen);
      surfaces.update(c, live.current.environment);
      scene.background = compact
        ? null
        : new THREE.Color(
            live.current.environment === "wooddark"
              ? "#262824"
              : live.current.environment === "sunlight"
                ? "#eee4cf"
                : "#eeeae3",
          );
    };
    changeView.current = (v) => {
      needsRender = true;
      currentView = v;
      const distance = 340 / Math.min(1, Math.max(0.55, camera.aspect));
      const direction =
        v === "front"
          ? new THREE.Vector3(0, 0.015, 1)
          : v === "side"
            ? new THREE.Vector3(1, 0.1, 0.02)
            : new THREE.Vector3(0.6, 0.35, 1);
      camera.position
        .copy(controls.target)
        .addScaledVector(direction.normalize(), distance);
      controls.update();
    };
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      changeView.current(currentView);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      needsRender = true;
    });
    intersection.observe(container);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    keyboard.current = (key) => {
      needsRender = true;
      const offset = camera.position.clone().sub(controls.target),
        spherical = new THREE.Spherical().setFromVector3(offset);
      if (key === "ArrowLeft") spherical.theta -= 0.12;
      if (key === "ArrowRight") spherical.theta += 0.12;
      if (key === "ArrowUp") spherical.phi -= 0.12;
      if (key === "ArrowDown") spherical.phi += 0.12;
      if (key === "+" || key === "=") spherical.radius *= 0.9;
      if (key === "-") spherical.radius *= 1.1;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.1, Math.PI * 0.84);
      spherical.radius = THREE.MathUtils.clamp(spherical.radius, 130, 750);
      camera.position
        .copy(controls.target)
        .add(new THREE.Vector3().setFromSpherical(spherical));
      controls.update();
    };
    const animate = () => {
      if (!running) return;
      frame = requestAnimationFrame(animate);
      if (visible && !document.hidden) {
        controls.autoRotate = live.current.autoRotate && !reducedMotion.matches;
        controls.autoRotateSpeed = 0.65;
        const moved = controls.update();
        if (needsRender || moved) {
          renderer.render(scene, camera);
          needsRender = false;
        }
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      running = false;
      cancelAnimationFrame(frame);
      setStatus("error");
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    update.current();
    resize();
    animate();
    setStatus("ready");
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      update.current = () => {};
      changeView.current = () => {};
      observer.disconnect();
      intersection.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      model?.dispose();
      surfaces.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      reflection.dispose();
      key.shadow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [compact, attempt]);
  useEffect(() => {
    update.current();
  }, [config, environment]);
  useEffect(() => {
    changeView.current(view);
  }, [view]);
  return (
    <div
      className="eyewear-viewport"
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <div
        ref={host}
        role="img"
        tabIndex={compact ? -1 : 0}
        onKeyDown={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "+",
              "=",
              "-",
            ].includes(e.key)
          ) {
            e.preventDefault();
            keyboard.current(e.key);
          }
        }}
        aria-label={
          language === "pt"
            ? "Modelo 3D do óculos personalizado. Use setas para girar, mais e menos para zoom."
            : "3D model of your customized eyewear. Use arrows to orbit, plus and minus to zoom."
        }
        style={{ width: "100%", height: "100%" }}
      />
      {status !== "ready" && (
        <div
          className="eyewear-status"
          role="status"
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeContent: "center",
            textAlign: "center",
            padding: 24,
          }}
        >
          {status === "loading" ? (
            language === "pt" ? (
              "Preparando seu óculos…"
            ) : (
              "Preparing your eyewear…"
            )
          ) : (
            <>
              <p>
                {language === "pt"
                  ? "Não foi possível iniciar o 3D. Verifique se a aceleração gráfica está habilitada."
                  : "Unable to start 3D. Check that hardware acceleration is enabled."}
              </p>
              <button onClick={() => setAttempt((n) => n + 1)}>
                {language === "pt" ? "Tentar novamente" : "Try again"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
