import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useCreatorStudio } from "../../contexts/CreatorStudioContext";

export default function ThreePreview() {
  const {
    frontModel, templeModel, frameProfile, templeOpen,
    frameMaterial, color,
    isSunglasses, lensMaterial, lensTreatments,
    nosePadMaterial, templeTipMaterial, hingeMaterial,
    environment, autoRotate = true
  } = useCreatorStudio();

  const containerRef = useRef(null);

  // Three.js instances
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);

  // Group Refs for updates
  const glassesGroupRef = useRef(null);
  const leftTemplePivotRef = useRef(null);
  const rightTemplePivotRef = useRef(null);

  // Environment Refs
  const floorRef = useRef(null);
  const stagePlateRef = useRef(null);
  const stageBaseRef = useRef(null);
  const haloRingRef = useRef(null);
  const animFrameIdRef = useRef(null);

  // Camera Interaction
  const cameraAngleRef = useRef({
    targetRadius: 5.5, currentRadius: 5.5,
    targetYaw: 0.45, currentYaw: 0.45,
    targetPitch: 0.08, currentPitch: 0.08,
    isDragging: false, lastX: 0, lastY: 0
  });

  const dimensionsMap = {
    aviator: { frameWidth: 2.35, lensSize: 1.35, legLength: 2.8, thickness: 0.10, bridgeWidth: 0.45 },
    wayfarer: { frameWidth: 2.25, lensSize: 1.20, legLength: 2.9, thickness: 0.16, bridgeWidth: 0.5 },
    cateye: { frameWidth: 2.15, lensSize: 1.15, legLength: 2.75, thickness: 0.14, bridgeWidth: 0.48 }
  };
  const frontDims = dimensionsMap[frontModel] || dimensionsMap["aviator"];
  const templeDims = dimensionsMap[templeModel] || dimensionsMap["aviator"];
  const safeFrontModel = dimensionsMap[frontModel] ? frontModel : "aviator";
  const safeTempleModel = dimensionsMap[templeModel] ? templeModel : "aviator";

  // --- Initialize Scene ---
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Environment Map for realistic reflections on metals & lenses
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 256;
    envCanvas.height = 256;
    const envCtx = envCanvas.getContext('2d');
    const envGrad = envCtx.createLinearGradient(0, 0, 0, 256);
    envGrad.addColorStop(0, '#ffffff');
    envGrad.addColorStop(0.2, '#f0f4ff');
    envGrad.addColorStop(0.5, '#c8d8f0');
    envGrad.addColorStop(0.8, '#8aa4cc');
    envGrad.addColorStop(1, '#3a5070');
    envCtx.fillStyle = envGrad;
    envCtx.fillRect(0, 0, 256, 256);
    envCtx.fillStyle = 'rgba(255,255,255,0.45)';
    envCtx.beginPath(); envCtx.arc(64, 38, 28, 0, Math.PI * 2); envCtx.fill();
    envCtx.beginPath(); envCtx.arc(200, 76, 18, 0, Math.PI * 2); envCtx.fill();
    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    const envMap = pmremGenerator.fromEquirectangular(envTex).texture;
    scene.environment = envMap;
    envTex.dispose();
    pmremGenerator.dispose();

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.22);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xf8fbff, 0x7a8697, 1.55);
    scene.add(hemi);
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.6);
    keyLight.position.set(12, 16, 18);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xdbeafe, 1.45);
    fillLight.position.set(-12, 7, 10);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.8);
    rimLight.position.set(-14, 10, -16);
    scene.add(rimLight);

    // Environment Meshes
    const floor = new THREE.Mesh(new THREE.CircleGeometry(8.8, 64), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.52;
    floor.receiveShadow = true;
    scene.add(floor);
    floorRef.current = floor;

    const stageBase = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.85, 0.22, 48), new THREE.MeshPhysicalMaterial({ color: 0xf8fbff, roughness: 0.72 }));
    stageBase.position.y = -1.42;
    stageBase.receiveShadow = true;
    scene.add(stageBase);
    stageBaseRef.current = stageBase;

    const stagePlate = new THREE.Mesh(new THREE.CylinderGeometry(2.12, 2.26, 0.08, 48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.28 }));
    stagePlate.position.y = -1.28;
    stagePlate.receiveShadow = true;
    scene.add(stagePlate);
    stagePlateRef.current = stagePlate;

    const haloRing = new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.035, 12, 60), new THREE.MeshBasicMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.42 }));
    haloRing.rotation.x = Math.PI / 2;
    haloRing.position.y = -1.235;
    scene.add(haloRing);
    haloRingRef.current = haloRing;

    const glassesGroup = new THREE.Group();
    scene.add(glassesGroup);
    glassesGroupRef.current = glassesGroup;

    // Interaction
    let isDragging = false;
    let lastX = 0, lastY = 0;
    const onPointerDown = (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); };
    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      cameraAngleRef.current.targetYaw += dx * 0.012;
      cameraAngleRef.current.targetPitch = Math.max(-0.78, Math.min(0.78, cameraAngleRef.current.targetPitch - dy * 0.008));
    };
    const onPointerUp = () => { isDragging = false; };
    const onWheel = (e) => {
      e.preventDefault();
      cameraAngleRef.current.targetRadius = Math.max(4.6, Math.min(13.2, cameraAngleRef.current.targetRadius + e.deltaY * 0.008));
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });

    // Build Initial
    buildGlassesMesh();

    const animate = () => {
      const t = performance.now() * 0.001;
      const angles = cameraAngleRef.current;

      if (autoRotate && !angles.isDragging) angles.targetYaw += 0.0032;

      angles.currentRadius += (angles.targetRadius - angles.currentRadius) * 0.12;
      angles.currentYaw += (angles.targetYaw - angles.currentYaw) * 0.12;
      angles.currentPitch += (angles.targetPitch - angles.currentPitch) * 0.12;

      const camX = angles.currentRadius * Math.sin(angles.currentYaw) * Math.cos(angles.currentPitch);
      const camY = 0.12 + angles.currentRadius * Math.sin(angles.currentPitch);
      const camZ = angles.currentRadius * Math.cos(angles.currentYaw) * Math.cos(angles.currentPitch);

      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, 0.12, 0);

      if (glassesGroupRef.current) glassesGroupRef.current.position.y = 0.02 + Math.sin(t * 1.4) * 0.035;
      if (haloRingRef.current) haloRingRef.current.material.opacity = 0.28 + (Math.sin(t * 1.8) + 1) * 0.06;

      if (leftTemplePivotRef.current && rightTemplePivotRef.current) {
        const nextOpen = leftTemplePivotRef.current.rotation.y + (-templeOpen - leftTemplePivotRef.current.rotation.y) * 0.14;
        leftTemplePivotRef.current.rotation.y = nextOpen;
        rightTemplePivotRef.current.rotation.y = -nextOpen;
      }

      renderer.render(scene, camera);
      animFrameIdRef.current = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []); // Mount only once

  // --- Environment Changes ---
  useEffect(() => {
    if (!stagePlateRef.current || !sceneRef.current) return;
    if (environment === "wood") {
      floorRef.current.material = new THREE.MeshPhysicalMaterial({ color: 0x2a1c15, roughness: 0.9 });
      stagePlateRef.current.material = new THREE.MeshPhysicalMaterial({ color: 0x4a3219, roughness: 0.8 });
      stageBaseRef.current.material = new THREE.MeshPhysicalMaterial({ color: 0x3d2713, roughness: 0.9 });
      sceneRef.current.background = new THREE.Color(0x1a120b);
    } else {
      floorRef.current.material = new THREE.ShadowMaterial({ opacity: 0.18 });
      stagePlateRef.current.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.28 });
      stageBaseRef.current.material = new THREE.MeshPhysicalMaterial({ color: 0xf8fbff, roughness: 0.72 });
      sceneRef.current.background = new THREE.Color(0xf6f8fc);
    }
  }, [environment]);

  // --- Rebuild Mesh on config changes ---
  useEffect(() => {
    buildGlassesMesh();
  }, [
    frontModel, templeModel, frameProfile, frameMaterial, color,
    isSunglasses, lensMaterial, lensTreatments,
    nosePadMaterial, templeTipMaterial, hingeMaterial
  ]);

  // --- Modular Mesh Builder ---
  const buildGlassesMesh = () => {
    const rootGroup = glassesGroupRef.current;
    if (!rootGroup) return;

    // Clear old
    while (rootGroup.children.length > 0) {
      const obj = rootGroup.children[0];
      rootGroup.remove(obj);
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }

    // Material factories
    const getFrameMat = () => {
      let r = 0.18, m = 0.15, cc = 1.0, ccr = 0.04, col = color;
      if (frameMaterial === "titanium") { r = 0.6; m = 0.8; cc = 0; }
      if (frameMaterial === "stainless_steel") { r = 0.2; m = 0.9; cc = 0.2; }
      if (frameMaterial === "gold") { r = 0.1; m = 1.0; col = "#d4af37"; }
      if (frameMaterial === "tr90") { r = 0.7; m = 0.0; cc = 0; }
      if (frameMaterial === "wood") { r = 0.9; m = 0.0; cc = 0; col = "#5c4033"; } // Simplified wood
      if (frameMaterial === "carbon_fiber") { r = 0.3; m = 0.4; cc = 0.8; col = "#1c1c1c"; }

      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(col),
        metalness: m, roughness: r, clearcoat: cc, clearcoatRoughness: ccr
      });
    };

    const getLensMat = () => {
      let r = 0.05, m = 0.0, env = 3.0, op = 1.0, tr = 0.98, attD = 2.5, attC = "#ffffff";
      let col = isSunglasses ? "#0a0a0a" : "#e6f2ff";

      if (lensTreatments.includes("anti_reflective")) { r = 0.0; env = 1.0; }
      if (lensTreatments.includes("mirrored")) { m = 0.9; r = 0.0; env = 5.0; op = 1.0; tr = 0.0; }
      if (lensTreatments.includes("photochromic") && environment !== "studio") {
        tr = 0.4; col = "#333333";
      }

      if (isSunglasses) { tr = 0.2; attD = 0.5; attC = "#000000"; }

      return new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(col),
        metalness: m, roughness: r, transmission: tr,
        thickness: 0.7, ior: lensMaterial === "polycarbonate" ? 1.58 : 1.49,
        transparent: true, opacity: op,
        attenuationDistance: attD, attenuationColor: new THREE.Color(attC),
        envMapIntensity: env
      });
    };

    const getPadMat = () => {
      if (nosePadMaterial === "titanium") return new THREE.MeshPhysicalMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.4 });
      if (nosePadMaterial === "acetate") return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.1, roughness: 0.1, clearcoat: 1.0 });
      return new THREE.MeshPhysicalMaterial({ color: 0xf8fafc, roughness: 0.045, transmission: 0.85, transparent: true, opacity: 0.86 }); // Silicone
    };

    const getHingeMat = () => {
      if (hingeMaterial === "gold") return new THREE.MeshPhysicalMaterial({ color: 0xd4af37, metalness: 1.0, roughness: 0.2 });
      if (hingeMaterial === "titanium") return new THREE.MeshPhysicalMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.5 });
      return new THREE.MeshPhysicalMaterial({ color: 0xc7d0dc, metalness: 0.9, roughness: 0.2 }); // Stainless
    };

    const getTipMat = () => {
      if (templeTipMaterial === "silicone") return new THREE.MeshPhysicalMaterial({ color: 0xeeeeee, roughness: 0.6, metalness: 0.0 });
      if (templeTipMaterial === "rubber") return new THREE.MeshPhysicalMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.0 });
      return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color), metalness: 0.1, roughness: 0.1, clearcoat: 1.0 }); // Acetate
    };

    const frameMat = getFrameMat();
    const lensMat = getLensMat();
    const padMat = getPadMat();
    const hingeMat = getHingeMat();
    const tipMat = getTipMat();

    const getLensShape = (type, sizeX, sizeY, isLeft = false) => {
      const shape = new THREE.Shape();
      if (type === "aviator") {
        shape.moveTo(0, sizeY * 0.8);
        shape.bezierCurveTo(sizeX * 0.4, sizeY * 0.85, sizeX * 0.95, sizeY * 0.4, sizeX * 0.95, -sizeY * 0.1);
        shape.bezierCurveTo(sizeX * 0.95, -sizeY * 0.7, sizeX * 0.4, -sizeY, 0, -sizeY);
        shape.bezierCurveTo(-sizeX * 0.4, -sizeY, -sizeX * 0.8, -sizeY * 0.6, -sizeX * 0.8, 0);
        shape.bezierCurveTo(-sizeX * 0.8, sizeY * 0.5, -sizeX * 0.4, sizeY * 0.75, 0, sizeY * 0.8);
      }
      else if (type === "wayfarer") {
        shape.moveTo(-sizeX * 0.8, sizeY * 0.7);
        shape.lineTo(sizeX * 0.7, sizeY * 0.85);
        shape.bezierCurveTo(sizeX * 0.95, sizeY * 0.9, sizeX, sizeY * 0.6, sizeX * 0.95, sizeY * 0.3);
        shape.lineTo(sizeX * 0.7, -sizeY * 0.7);
        shape.bezierCurveTo(sizeX * 0.65, -sizeY * 0.95, sizeX * 0.3, -sizeY, 0, -sizeY);
        shape.bezierCurveTo(-sizeX * 0.4, -sizeY, -sizeX * 0.65, -sizeY * 0.85, -sizeX * 0.7, -sizeY * 0.6);
        shape.lineTo(-sizeX * 0.9, sizeY * 0.3);
        shape.bezierCurveTo(-sizeX * 0.95, sizeY * 0.5, -sizeX * 0.9, sizeY * 0.65, -sizeX * 0.8, sizeY * 0.7);
      }
      else { // cateye
        shape.moveTo(-sizeX * 0.7, sizeY * 0.5);
        shape.bezierCurveTo(-sizeX * 0.3, sizeY * 0.6, sizeX * 0.2, sizeY * 0.7, sizeX * 1.05, sizeY * 1.05);
        shape.bezierCurveTo(sizeX, sizeY * 0.8, sizeX * 0.9, sizeY * 0.3, sizeX * 0.8, 0);
        shape.bezierCurveTo(sizeX * 0.6, -sizeY * 0.8, sizeX * 0.3, -sizeY, -sizeX * 0.2, -sizeY);
        shape.bezierCurveTo(-sizeX * 0.6, -sizeY, -sizeX * 0.8, -sizeY * 0.6, -sizeX * 0.8, 0);
        shape.bezierCurveTo(-sizeX * 0.8, sizeY * 0.3, -sizeX * 0.75, sizeY * 0.4, -sizeX * 0.7, sizeY * 0.5);
      }

      if (isLeft) {
        const points = shape.getPoints(48);
        const mirroredShape = new THREE.Shape();
        const mirroredPoints = points.map(p => new THREE.Vector2(-p.x, p.y)).reverse();
        mirroredShape.moveTo(mirroredPoints[0].x, mirroredPoints[0].y);
        for (let i = 1; i < mirroredPoints.length; i++) mirroredShape.lineTo(mirroredPoints[i].x, mirroredPoints[i].y);
        return mirroredShape;
      }
      return shape;
    };

    const widthScale = Math.max(0.72, Math.min(1.45, frontDims.frameWidth / 2.2));
    let lensX = frontDims.lensSize * widthScale;
    let lensY = frontDims.lensSize * 0.90;

    let thicknessMul = 1.0;
    if (frameProfile === "thin") thicknessMul = 0.78;
    if (frameProfile === "bold") thicknessMul = 1.35;

    const outerX = lensX + frontDims.thickness * thicknessMul;
    const outerY = lensY + frontDims.thickness * 0.9 * thicknessMul;
    const adjustedFrameDepth = Math.max(0.1, Math.min(0.34, frontDims.thickness * 1.9 * thicknessMul));

    const lensOffsetX = lensX + frontDims.bridgeWidth * 0.5 + frontDims.thickness * 0.55;

    // Front Group
    const frontGroup = new THREE.Group();
    rootGroup.add(frontGroup);

    // --- Lens Curvature Helper ---
    const applyLensCurvature = (geometry, radius = 10) => {
      const positions = geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);
        const dist2 = x * x + y * y;
        const dz = radius - Math.sqrt(Math.max(0.001, radius * radius - dist2));
        positions.setZ(i, z + dz);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
    };

    const wrapAngle = 0.10; // Facial wrap curvature (radians)

    // --- Right Rim ---
    const outerShapeRight = getLensShape(safeFrontModel, outerX, outerY, false);
    const innerShapeRight = getLensShape(safeFrontModel, lensX, lensY, false);
    outerShapeRight.holes.push(innerShapeRight);
    const rimGeoRight = new THREE.ExtrudeGeometry(outerShapeRight, {
      depth: adjustedFrameDepth, bevelEnabled: true,
      bevelThickness: adjustedFrameDepth * 0.18, bevelSize: adjustedFrameDepth * 0.18,
      bevelSegments: 5, curveSegments: 48
    }).center();

    // --- Right Lens (curved) ---
    const lensShapeRight = getLensShape(safeFrontModel, lensX, lensY, false);
    const lensGeoRight = new THREE.ExtrudeGeometry(lensShapeRight, {
      depth: 0.06, bevelEnabled: true,
      bevelThickness: 0.008, bevelSize: 0.008,
      bevelSegments: 3, curveSegments: 48
    }).center();
    applyLensCurvature(lensGeoRight, 10);

    // --- Left Rim ---
    const outerShapeLeft = getLensShape(safeFrontModel, outerX, outerY, true);
    const innerShapeLeft = getLensShape(safeFrontModel, lensX, lensY, true);
    outerShapeLeft.holes.push(innerShapeLeft);
    const rimGeoLeft = new THREE.ExtrudeGeometry(outerShapeLeft, {
      depth: adjustedFrameDepth, bevelEnabled: true,
      bevelThickness: adjustedFrameDepth * 0.18, bevelSize: adjustedFrameDepth * 0.18,
      bevelSegments: 5, curveSegments: 48
    }).center();

    // --- Left Lens (curved) ---
    const lensShapeLeft = getLensShape(safeFrontModel, lensX, lensY, true);
    const lensGeoLeft = new THREE.ExtrudeGeometry(lensShapeLeft, {
      depth: 0.06, bevelEnabled: true,
      bevelThickness: 0.008, bevelSize: 0.008,
      bevelSegments: 3, curveSegments: 48
    }).center();
    applyLensCurvature(lensGeoLeft, 10);

    // --- Assemble Front + Facial Wrap ---
    const rightRim = new THREE.Mesh(rimGeoRight, frameMat); rightRim.position.set(lensOffsetX, 0, 0); rightRim.castShadow = true; frontGroup.add(rightRim);
    const leftRim = new THREE.Mesh(rimGeoLeft, frameMat); leftRim.position.set(-lensOffsetX, 0, 0); leftRim.castShadow = true; frontGroup.add(leftRim);
    const rightLens = new THREE.Mesh(lensGeoRight, lensMat); rightLens.position.set(lensOffsetX, 0, adjustedFrameDepth * 0.12); frontGroup.add(rightLens);
    const leftLens = new THREE.Mesh(lensGeoLeft, lensMat); leftLens.position.set(-lensOffsetX, 0, adjustedFrameDepth * 0.12); frontGroup.add(leftLens);

    // Apply facial wrap — rotates each side outward like real glasses
    rightRim.rotation.y = -wrapAngle;
    rightLens.rotation.y = -wrapAngle;
    leftRim.rotation.y = wrapAngle;
    leftLens.rotation.y = wrapAngle;

    // Bridge (anatomical 7-point curve)
    const bw = frontDims.bridgeWidth;
    const bridgeCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-bw * 0.55, 0.14, -0.02),
      new THREE.Vector3(-bw * 0.38, 0.06, 0.05),
      new THREE.Vector3(-bw * 0.15, -0.06, 0.08),
      new THREE.Vector3(0, -0.09, 0.09),
      new THREE.Vector3(bw * 0.15, -0.06, 0.08),
      new THREE.Vector3(bw * 0.38, 0.06, 0.05),
      new THREE.Vector3(bw * 0.55, 0.14, -0.02)
    ]);
    const bridgeGeo = new THREE.TubeGeometry(bridgeCurve, 40, Math.max(0.04, frontDims.thickness * 0.3), 16, false);
    const bridgeMesh = new THREE.Mesh(bridgeGeo, frameMat);
    bridgeMesh.position.set(0, -0.03, adjustedFrameDepth * 0.02);
    bridgeMesh.castShadow = true;
    frontGroup.add(bridgeMesh);

    // Nose Pads (teardrop-shaped with wire arms)
    const padShape = new THREE.Shape();
    padShape.moveTo(0, 0.11);
    padShape.bezierCurveTo(0.055, 0.11, 0.08, 0.055, 0.08, 0);
    padShape.bezierCurveTo(0.08, -0.07, 0.045, -0.12, 0, -0.14);
    padShape.bezierCurveTo(-0.045, -0.12, -0.08, -0.07, -0.08, 0);
    padShape.bezierCurveTo(-0.08, 0.055, -0.055, 0.11, 0, 0.11);
    const padGeo = new THREE.ExtrudeGeometry(padShape, {
      depth: 0.035, bevelEnabled: true, bevelThickness: 0.012,
      bevelSize: 0.012, bevelSegments: 4, curveSegments: 20
    }).center();

    // Pad wire arms
    const padArmR = 0.018;
    const rPadArmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(lensOffsetX - lensX * 0.65, -lensY * 0.05, adjustedFrameDepth * 0.1),
      new THREE.Vector3(lensOffsetX - lensX * 0.72, -lensY * 0.12, -0.05),
      new THREE.Vector3(lensOffsetX - lensX * 0.78, -lensY * 0.18, -0.18)
    ]);
    frontGroup.add(new THREE.Mesh(new THREE.TubeGeometry(rPadArmCurve, 12, padArmR, 8, false), hingeMat));

    const rightPad = new THREE.Mesh(padGeo, padMat);
    rightPad.position.set(lensOffsetX - lensX * 0.78, -lensY * 0.22, -0.22);
    rightPad.rotation.set(-0.35, 0.15, -0.25);
    frontGroup.add(rightPad);

    const lPadArmCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-(lensOffsetX - lensX * 0.65), -lensY * 0.05, adjustedFrameDepth * 0.1),
      new THREE.Vector3(-(lensOffsetX - lensX * 0.72), -lensY * 0.12, -0.05),
      new THREE.Vector3(-(lensOffsetX - lensX * 0.78), -lensY * 0.18, -0.18)
    ]);
    frontGroup.add(new THREE.Mesh(new THREE.TubeGeometry(lPadArmCurve, 12, padArmR, 8, false), hingeMat));

    const leftPad = new THREE.Mesh(padGeo, padMat);
    leftPad.position.set(-(lensOffsetX - lensX * 0.78), -lensY * 0.22, -0.22);
    leftPad.rotation.set(-0.35, -0.15, 0.25);
    frontGroup.add(leftPad);

    // Temples & Hinges
    // Hinge position uses front dimensions to align with the front rims
    const hingeX = lensOffsetX + outerX - frontDims.thickness * 0.35;
    const templeLen = templeDims.legLength;

    const leftPivot = new THREE.Group();
    leftPivot.position.set(-hingeX, lensY * 0.4, 0);
    rootGroup.add(leftPivot);
    leftTemplePivotRef.current = leftPivot;

    const rightPivot = new THREE.Group();
    rightPivot.position.set(hingeX, lensY * 0.4, 0);
    rootGroup.add(rightPivot);
    rightTemplePivotRef.current = rightPivot;

    // Hinge meshes
    const hingeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.2, 16);
    const rightHinge = new THREE.Mesh(hingeGeo, hingeMat); rightPivot.add(rightHinge);
    const leftHinge = new THREE.Mesh(hingeGeo, hingeMat); leftPivot.add(leftHinge);

    // Temple arms (flat rectangular cross-section along curved path)
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.04, 0.02, -templeLen * 0.15),
      new THREE.Vector3(0.05, 0, -templeLen * 0.3),
      new THREE.Vector3(0.03, -0.03, -templeLen * 0.5),
      new THREE.Vector3(0.02, -0.05, -templeLen * 0.65),
      new THREE.Vector3(-0.02, -0.25, -templeLen * 0.85),
      new THREE.Vector3(-0.05, -0.4, -templeLen)
    ]);

    // Flat rounded-rectangle cross section
    const tw = templeDims.thickness * 0.55 * thicknessMul;
    const tth = templeDims.thickness * 0.2 * thicknessMul;
    const tcr = Math.min(tw, tth) * 0.4;
    const templeProfile = new THREE.Shape();
    templeProfile.moveTo(-tw + tcr, -tth);
    templeProfile.lineTo(tw - tcr, -tth);
    templeProfile.quadraticCurveTo(tw, -tth, tw, -tth + tcr);
    templeProfile.lineTo(tw, tth - tcr);
    templeProfile.quadraticCurveTo(tw, tth, tw - tcr, tth);
    templeProfile.lineTo(-tw + tcr, tth);
    templeProfile.quadraticCurveTo(-tw, tth, -tw, tth - tcr);
    templeProfile.lineTo(-tw, -tth + tcr);
    templeProfile.quadraticCurveTo(-tw, -tth, -tw + tcr, -tth);

    const armGeo = new THREE.ExtrudeGeometry(templeProfile, {
      extrudePath: armCurve, steps: 60, bevelEnabled: false
    });
    const rightArm = new THREE.Mesh(armGeo, frameMat); rightArm.castShadow = true; rightPivot.add(rightArm);

    const armCurveLeft = new THREE.CatmullRomCurve3(armCurve.points.map(p => new THREE.Vector3(-p.x, p.y, p.z)));
    const armGeoLeft = new THREE.ExtrudeGeometry(templeProfile, {
      extrudePath: armCurveLeft, steps: 60, bevelEnabled: false
    });
    const leftArm = new THREE.Mesh(armGeoLeft, frameMat); leftArm.castShadow = true; leftPivot.add(leftArm);

    // Temple Tips (slightly thicker, soft material)
    const tipW = tw * 1.1;
    const tipTh = tth * 1.3;
    const tipR = Math.min(tipW, tipTh) * 0.5;
    const tipProfile = new THREE.Shape();
    tipProfile.moveTo(-tipW + tipR, -tipTh);
    tipProfile.lineTo(tipW - tipR, -tipTh);
    tipProfile.quadraticCurveTo(tipW, -tipTh, tipW, -tipTh + tipR);
    tipProfile.lineTo(tipW, tipTh - tipR);
    tipProfile.quadraticCurveTo(tipW, tipTh, tipW - tipR, tipTh);
    tipProfile.lineTo(-tipW + tipR, tipTh);
    tipProfile.quadraticCurveTo(-tipW, tipTh, -tipW, tipTh - tipR);
    tipProfile.lineTo(-tipW, -tipTh + tipR);
    tipProfile.quadraticCurveTo(-tipW, -tipTh, -tipW + tipR, -tipTh);

    const tipCurveRight = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.02, -0.05, -templeLen * 0.65),
      new THREE.Vector3(-0.02, -0.25, -templeLen * 0.85),
      new THREE.Vector3(-0.05, -0.4, -templeLen)
    ]);
    const tipGeoRight = new THREE.ExtrudeGeometry(tipProfile, {
      extrudePath: tipCurveRight, steps: 24, bevelEnabled: false
    });
    const rightTip = new THREE.Mesh(tipGeoRight, tipMat); rightPivot.add(rightTip);

    const tipCurveLeft = new THREE.CatmullRomCurve3(tipCurveRight.points.map(p => new THREE.Vector3(-p.x, p.y, p.z)));
    const tipGeoLeft = new THREE.ExtrudeGeometry(tipProfile, {
      extrudePath: tipCurveLeft, steps: 24, bevelEnabled: false
    });
    const leftTip = new THREE.Mesh(tipGeoLeft, tipMat); leftPivot.add(leftTip);

    // Final reposition
    rootGroup.position.set(0, 0.45, 1.2);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(17, 24, 39, 0.05)", overflow: "hidden" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", cursor: "grab", outline: "none" }} />

      {/* Overlay Status */}
      <div style={{ position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)", fontSize: "12px", color: "#9ca3af", backgroundColor: "rgba(255, 255, 255, 0.8)", backdropFilter: "blur(4px)", padding: "8px 16px", borderRadius: "9999px", boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)", pointerEvents: "none" }}>
        Drag to rotate • Scroll to zoom
      </div>
    </div>
  );
}
