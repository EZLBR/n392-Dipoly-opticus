import * as THREE from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { isMetal, type EyewearConfig } from "./config";
import { lensShape, proportions, type EyewearModel } from "./geometry";
import type { TextLayer } from "./artwork";

function upperEdge(shape: THREE.Shape, x: number) {
  const points = shape.getPoints(120);
  const intersections: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.x !== b.x && x >= Math.min(a.x, b.x) && x <= Math.max(a.x, b.x)) {
      intersections.push(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
    }
  }
  return intersections.length ? Math.max(...intersections) : 0;
}

/** Projection uses a single local frame mesh; lenses and other components are never targets. */
export function projectTextLayer(model: EyewearModel, config: EyewearConfig, layer: TextLayer, aspect: number) {
  const side = layer.zone.endsWith("left") ? -1 : 1;
  const front = layer.zone.startsWith("front");
  const d = proportions(config);
  let surface: THREE.Mesh | undefined;
  let origin: THREE.Vector3, direction: THREE.Vector3, availableWidth: number, availableHeight: number;
  let tangentHint: THREE.Vector3 | undefined;
  if (front) {
    surface = model.group.children.filter(o => o instanceof THREE.Mesh && o.name === "rim")[side < 0 ? 0 : 1] as THREE.Mesh;
    const localX = layer.x * d.lensWidth * 0.12;
    const inner = upperEdge(lensShape(config.frontModel, d.lensWidth, d.lensHeight), localX);
    const outer = upperEdge(lensShape(config.frontModel, d.lensWidth + d.rim * 2, d.lensHeight + d.rim * 2), localX);
    availableHeight = Math.max(0.25, (outer - inner) * 0.5);
    availableWidth = 7;
    origin = new THREE.Vector3(side * (d.center + localX), (inner + outer) / 2 + layer.y * (outer - inner) * 0.12, 30);
    direction = new THREE.Vector3(0, 0, -1);
    const contour = lensShape(config.frontModel, d.lensWidth + d.rim, d.lensHeight + d.rim);
    const slope = (upperEdge(contour, localX + 0.1) - upperEdge(contour, localX - 0.1)) / 0.2;
    tangentHint = new THREE.Vector3(1, side * slope, -0.0023 * origin.x).normalize();
  } else {
    surface = model.temples[side < 0 ? 0 : 1].getObjectByName("temple") as THREE.Mesh;
    const height = (isMetal(config) ? 2.6 : config.templeModel === "wayfarer" ? 8 : 6) *
      { thin: 0.8, medium: 1, bold: 1.18 }[config.frameProfile];
    availableWidth = 28;
    availableHeight = height * 0.45;
    origin = new THREE.Vector3(side * 20, layer.y * height * 0.12, -48 - layer.x * 18);
    direction = new THREE.Vector3(-side, 0, 0);
  }
  if (!surface) return null;
  // Work in the surface parent's local coordinate system, including for folded temples.
  const localSurface = new THREE.Mesh(surface.geometry, surface.material);
  localSurface.updateMatrixWorld(true);
  const hit = new THREE.Raycaster(origin, direction).intersectObject(localSurface, false)[0];
  if (!hit?.face) return null;
  const normal = hit.face.normal.clone().normalize();
  const up = tangentHint ? new THREE.Vector3().crossVectors(normal, tangentHint).normalize()
    : new THREE.Vector3(0, 1, 0).projectOnPlane(normal).normalize();
  const right = new THREE.Vector3().crossVectors(up, normal).normalize();
  const rotation = THREE.MathUtils.degToRad(layer.rotation);
  const cos = Math.abs(Math.cos(rotation)), sin = Math.abs(Math.sin(rotation));
  let height = Math.min(availableHeight / (cos + aspect * sin), availableWidth / (aspect * cos + sin)) * layer.size;
  const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), rotation));
  // A contour's slope changes across a text rectangle. Fit all corners and edge midpoints,
  // rather than accepting a nonempty projection that silently cuts off letters.
  const fitsSurface = (h: number) => {
    for (const x of [-0.5, 0, 0.5]) for (const y of [-0.5, 0, 0.5]) {
      const point = new THREE.Vector3(x * h * aspect, y * h, 0).applyQuaternion(orientation).add(hit.point);
      const sample = new THREE.Raycaster(point.clone().addScaledVector(normal, 2), normal.clone().negate())
        .intersectObject(localSurface, false)[0];
      if (!sample?.face || sample.face.normal.dot(normal) < 0.5 || Math.abs(sample.distance - 2) > 0.35) return false;
    }
    return true;
  };
  let fitted = fitsSurface(height);
  for (let attempt = 0; !fitted && attempt < 20; attempt++) {
    height *= 0.85;
    fitted = fitsSurface(height);
  }
  if (!fitted) return null;
  const geometry = new DecalGeometry(localSurface, hit.point, new THREE.Euler().setFromQuaternion(orientation),
    new THREE.Vector3(height * aspect, height, 0.8));
  geometry.translate(normal.x * 0.025, normal.y * 0.025, normal.z * 0.025);
  return { geometry, surface, parent: surface.parent! };
}

export function createTextTexture(layer: TextLayer): { texture: THREE.Texture; aspect: number } {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create text texture");
  const family = { sans: "Arial, sans-serif", serif: "Georgia, serif", mono: "monospace" }[layer.font];
  context.font = `bold 96px ${family}`;
  canvas.width = Math.min(2048, Math.max(64, Math.ceil(context.measureText(layer.text).width) + 32));
  canvas.height = 144;
  context.font = `bold 96px ${family}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = layer.color;
  context.fillText(layer.text, canvas.width / 2, canvas.height / 2, canvas.width - 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: canvas.width / canvas.height };
}

export function createArtworkRenderer(textureFactory = createTextTexture) {
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = [];
  const clear = () => {
    for (const mesh of meshes) {
      mesh.removeFromParent(); mesh.geometry.dispose();
      mesh.material.map?.dispose(); mesh.material.dispose();
    }
    meshes.length = 0;
  };
  return {
    update(model: EyewearModel, config: EyewearConfig) {
      clear();
      for (const layer of config.artwork.layers) {
        if (!layer.text.trim()) continue;
        const { texture, aspect } = textureFactory(layer);
        const projection = projectTextLayer(model, config, layer, aspect);
        if (!projection || !projection.geometry.getAttribute("position").count) {
          projection?.geometry.dispose(); texture.dispose(); continue;
        }
        const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true,
          depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false });
        const mesh = new THREE.Mesh(projection.geometry, material);
        mesh.name = "art:" + layer.id;
        mesh.renderOrder = 2;
        projection.parent.add(mesh); meshes.push(mesh);
      }
    },
    dispose: clear,
  };
}
