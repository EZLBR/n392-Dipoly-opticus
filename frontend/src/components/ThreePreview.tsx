import React, { useEffect, useRef } from "react";
import * as THREE from "three";

type ThreePreviewProps = {
  shape?: string;
  material?: string;
  color?: string;
  isSunglasses?: boolean;
};

export default function ThreePreview({
  shape = "round",
  material = "acetate",
  color,
  isSunglasses = false,
}: ThreePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = 240;
    const height = 150;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 4.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height);

    containerRef.current.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xd6deea, 1.8);
    scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 4, 5);
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.8);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const group = new THREE.Group();

    const getPreviewColor = (mat) => {
      return mat === "metal" ? 0x8b949e : 0x111827;
    };

    const frameMaterial = new THREE.MeshStandardMaterial({
      color: color || getPreviewColor(material),
      roughness: material === "metal" ? 0.35 : 0.55,
      metalness: material === "metal" ? 0.85 : 0.15
    });

    const lensMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9fb3c8,
      transmission: isSunglasses ? 0.2 : 0.65,
      transparent: true,
      opacity: 0.45,
      roughness: 0.08,
      metalness: 0,
      thickness: 0.04
    });

    const createLensShape = (sh, rx, ry) => {
      const s = new THREE.Shape();
      if (sh === "round") {
        s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
        return s;
      }
      if (sh === "hexagon") {
        const points = [
          new THREE.Vector2(-rx * 0.55, -ry),
          new THREE.Vector2(rx * 0.55, -ry),
          new THREE.Vector2(rx, -ry * 0.15),
          new THREE.Vector2(rx * 0.72, ry),
          new THREE.Vector2(-rx * 0.72, ry),
          new THREE.Vector2(-rx, -ry * 0.15)
        ];
        s.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          s.lineTo(points[i].x, points[i].y);
        }
        s.closePath();
        return s;
      }

      const r = Math.min(rx, ry) * 0.22;
      s.moveTo(-rx + r, -ry);
      s.lineTo(rx - r, -ry);
      s.quadraticCurveTo(rx, -ry, rx, -ry + r);
      s.lineTo(rx, ry - r);
      s.quadraticCurveTo(rx, ry, rx - r, ry);
      s.lineTo(-rx + r, ry);
      s.quadraticCurveTo(-rx, ry, -rx, ry - r);
      s.lineTo(-rx, -ry + r);
      s.quadraticCurveTo(-rx, -ry, -rx + r, -ry);
      return s;
    };

    const createRim = (sh, rx, ry, thickness, depth, mat) => {
      const outer = createLensShape(sh, rx, ry);
      const inner = createLensShape(sh, rx - thickness, ry - thickness);
      outer.holes.push(inner);

      const geo = new THREE.ExtrudeGeometry(outer, {
        depth,
        bevelEnabled: true,
        bevelThickness: depth * 0.12,
        bevelSize: depth * 0.08,
        bevelSegments: 2,
        curveSegments: sh === "round" ? 36 : 20
      });

      geo.center();
      return new THREE.Mesh(geo, mat);
    };

    const rx = shape === "round" ? 0.42 : 0.48;
    const ry = shape === "round" ? 0.42 : 0.34;
    const rimThickness = shape === "round" ? 0.08 : 0.07;
    const depth = 0.08;
    const gap = 0.62;

    const leftRim = createRim(shape, rx, ry, rimThickness, depth, frameMaterial);
    const rightRim = createRim(shape, rx, ry, rimThickness, depth, frameMaterial);
    leftRim.position.x = -gap;
    rightRim.position.x = gap;

    const lensGeo = new THREE.ExtrudeGeometry(createLensShape(shape, rx - 0.06, ry - 0.06), {
      depth: 0.03,
      bevelEnabled: false,
      curveSegments: shape === "round" ? 28 : 16
    });
    lensGeo.center();

    const leftLens = new THREE.Mesh(lensGeo, lensMaterial);
    const rightLens = new THREE.Mesh(lensGeo, lensMaterial);
    leftLens.position.set(-gap, 0, 0.018);
    rightLens.position.set(gap, 0, 0.018);

    const bridge = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.03, 0.22, 4, 8),
      frameMaterial
    );
    bridge.rotation.z = Math.PI / 2;
    bridge.position.y = shape === "round" ? 0.02 : 0.01;

    const leftTemple = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.05, 0.05),
      frameMaterial
    );
    leftTemple.position.set(-(gap + rx + 0.34), 0.02, -0.18);
    leftTemple.rotation.y = -0.55;

    const rightTemple = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.05, 0.05),
      frameMaterial
    );
    rightTemple.position.set(gap + rx + 0.34, 0.02, -0.18);
    rightTemple.rotation.y = 0.55;

    group.add(leftRim, rightRim, leftLens, rightLens, bridge, leftTemple, rightTemple);
    group.rotation.x = -0.18;
    group.rotation.y = 0.55;

    scene.add(group);

    let animationFrameId;
    let isHovered = false;

    const animate = () => {
      group.rotation.y += isHovered ? 0.02 : 0.006;
      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    const handleMouseEnter = () => { isHovered = true; };
    const handleMouseLeave = () => { isHovered = false; };

    const container = containerRef.current;
    container.addEventListener("mouseenter", handleMouseEnter);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      cancelAnimationFrame(animationFrameId);
      container.removeEventListener("mouseenter", handleMouseEnter);
      container.removeEventListener("mouseleave", handleMouseLeave);
      renderer.dispose();
      group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [shape, material, color, isSunglasses]);

  return <div ref={containerRef} className="card-preview three-preview" style={{ height: "150px" }} />;
}
