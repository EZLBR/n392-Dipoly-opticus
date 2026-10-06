import * as THREE from "three";
import {
  dimensions,
  isMetal,
  type EyewearConfig,
  type Silhouette,
} from "./config";

/** Lens contour in normalized coordinates; shared by meshes and the camera overlay. */
export function lensShape(
  model: Silhouette,
  width: number,
  height: number,
): THREE.Shape {
  const s = new THREE.Shape();
  if (model === "round") {
    s.absellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2, false, 0);
    return s;
  }
  const move = (x: number, y: number) => s.moveTo(x * width, y * height);
  const curve = (
    a: number,
    b: number,
    c: number,
    d: number,
    e: number,
    f: number,
  ) =>
    s.bezierCurveTo(
      a * width,
      b * height,
      c * width,
      d * height,
      e * width,
      f * height,
    );
  if (model === "wayfarer") {
    move(-0.48, 0.3);
    curve(-0.49, 0.47, -0.24, 0.48, 0.02, 0.48);
    curve(0.25, 0.49, 0.49, 0.47, 0.5, 0.31);
    curve(0.48, 0.07, 0.43, -0.26, 0.3, -0.41);
    curve(0.15, -0.54, -0.17, -0.53, -0.32, -0.38);
    curve(-0.44, -0.22, -0.49, 0.07, -0.48, 0.3);
  } else if (model === "aviator") {
    move(-0.48, 0.27);
    curve(-0.49, 0.47, -0.25, 0.48, 0.04, 0.48);
    curve(0.29, 0.48, 0.49, 0.35, 0.5, 0.13);
    curve(0.51, -0.13, 0.4, -0.42, 0.13, -0.5);
    curve(-0.06, -0.54, -0.28, -0.28, -0.4, -0.08);
    curve(-0.47, 0.04, -0.48, 0.16, -0.48, 0.27);
  } else {
    move(-0.48, 0.2);
    curve(-0.47, 0.39, -0.23, 0.35, 0.02, 0.4);
    curve(0.24, 0.44, 0.43, 0.58, 0.52, 0.54);
    curve(0.5, 0.34, 0.46, -0.08, 0.31, -0.31);
    curve(0.17, -0.51, -0.15, -0.53, -0.33, -0.35);
    curve(-0.46, -0.2, -0.49, 0.02, -0.48, 0.2);
  }
  s.closePath();
  return s;
}

export function proportions(c: EyewearConfig) {
  const d = dimensions[c.frontModel];
  const profile = { thin: 0.78, medium: 1, bold: 1.3 }[c.frameProfile];
  return {
    ...d,
    rim: (isMetal(c) ? 1.25 : 3.25) * profile,
    depth: (isMetal(c) ? 2.1 : 5.1) * profile,
    center: (d.lensWidth + d.bridge) / 2,
  };
}
// Face wrap: all front components share this surface, so their joints remain aligned.
export const frontZ = (x: number) => -0.00115 * x * x;

function curveTube(points: THREE.Vector3[], radius: number) {
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points),
    32,
    radius,
    10,
    false,
  );
}
function lensGeometry(contour: THREE.Vector2[], width: number, height: number) {
  // Concentric rings avoid the flat triangle fan of an extruded polygon. Both optical surfaces are closed.
  const points: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  const n = contour.length,
    rings = 8;
  for (let surface = 0; surface < 2; surface++) {
    for (let r = 0; r <= rings; r++) {
      const t = Math.max(0.0001, r / rings);
      for (const p of contour) {
        const x = p.x * t,
          y = p.y * t;
        points.push(x, y, (surface === 0 ? 1.1 : -0.5) + (1 - t * t) * 2.1);
        uvs.push(x / width + 0.5, y / height + 0.5);
      }
    }
    const offset = surface * (rings + 1) * n;
    for (let r = 0; r < rings; r++)
      for (let i = 0; i < n; i++) {
        const a = offset + r * n + i,
          b = offset + r * n + ((i + 1) % n),
          c = a + n,
          d = b + n;
        if (surface === 0) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
  }
  const back = (rings + 1) * n;
  for (let i = 0; i < n; i++) {
    const a = rings * n + i,
      b = rings * n + ((i + 1) % n);
    indices.push(a, b, a + back, b, b + back, a + back);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** A tapered, rounded rectangular temple instead of a tube or uniform ribbon. */
function templeGeometry(
  curve: THREE.CatmullRomCurve3,
  thickness: number,
  height: number,
  from = 0,
  to = 1,
) {
  const p: number[] = [],
    uv: number[] = [],
    ix: number[] = [];
  const steps = 56,
    sides = 12;
  for (let j = 0; j <= steps; j++) {
    const t = from + ((to - from) * j) / steps,
      center = curve.getPoint(t),
      tangent = curve.getTangent(t);
    const across = new THREE.Vector3()
      .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
      .normalize();
    const up = new THREE.Vector3().crossVectors(across, tangent).normalize();
    const taper = 1 - 0.43 * Math.sin((Math.min(1, t * 1.25) * Math.PI) / 2);
    for (let k = 0; k < sides; k++) {
      const a = (k * 2 * Math.PI) / sides;
      const x =
        (Math.sign(Math.cos(a)) *
          Math.pow(Math.abs(Math.cos(a)), 0.55) *
          thickness) /
        2;
      const y =
        ((Math.sign(Math.sin(a)) *
          Math.pow(Math.abs(Math.sin(a)), 0.55) *
          height) /
          2) *
        taper;
      const v = center
        .clone()
        .addScaledVector(across, x)
        .addScaledVector(up, y);
      p.push(v.x, v.y, v.z);
      uv.push(t * 3, k / sides);
      if (j < steps) {
        const a0 = j * sides + k,
          b = j * sides + ((k + 1) % sides);
        ix.push(a0, b, a0 + sides, b, b + sides, a0 + sides);
      }
    }
  }
  for (let k = 1; k < sides - 1; k++) {
    ix.push(0, k + 1, k);
    const end = steps * sides;
    ix.push(end, end + k, end + k + 1);
  }
  // The path advances toward -Z; invert winding so temple surfaces face outward.
  for (let i = 0; i < ix.length; i += 3)
    [ix[i], ix[i + 2]] = [ix[i + 2], ix[i]];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}

export type MaterialSet = Record<
  "frame" | "lens" | "hinge" | "pad" | "tip",
  THREE.MeshPhysicalMaterial
>;
export interface EyewearModel {
  group: THREE.Group;
  temples: THREE.Group[];
  dispose: () => void;
  setFold: (value: number) => void;
}

export function buildEyewear(
  c: EyewearConfig,
  mats: MaterialSet,
): EyewearModel {
  const group = new THREE.Group();
  group.name = "Opticus eyewear";
  const d = proportions(c),
    geometries = new Set<THREE.BufferGeometry>(),
    temples: THREE.Group[] = [];
  function add(
    g: THREE.BufferGeometry,
    material: keyof MaterialSet,
    parent: THREE.Group = group,
    name: string = material,
  ) {
    geometries.add(g);
    const mesh = new THREE.Mesh(g, mats[material]);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function warp(g: THREE.BufferGeometry, side: number) {
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const x = side * (p.getX(i) + d.center);
      p.setXYZ(i, x, p.getY(i), p.getZ(i) + frontZ(x));
    }
    if (side < 0) {
      // Reflection reverses winding.
      if (g.index) {
        for (let i = 0; i < g.index.count; i += 3) {
          const a = g.index.getX(i);
          g.index.setX(i, g.index.getX(i + 2));
          g.index.setX(i + 2, a);
        }
      } else {
        for (const key of Object.keys(g.attributes)) {
          const attr = g.getAttribute(key) as THREE.BufferAttribute;
          for (let i = 0; i < attr.count; i += 3)
            for (let k = 0; k < attr.itemSize; k++) {
              const a = attr.array[i * attr.itemSize + k];
              attr.array[i * attr.itemSize + k] =
                attr.array[(i + 2) * attr.itemSize + k];
              attr.array[(i + 2) * attr.itemSize + k] = a;
            }
        }
      }
    }
    g.computeVertexNormals();
    return g;
  }
  for (const side of [-1, 1]) {
    const outer = lensShape(
      c.frontModel,
      d.lensWidth + d.rim * 2,
      d.lensHeight + d.rim * 2,
    );
    const inner = lensShape(c.frontModel, d.lensWidth, d.lensHeight);
    outer.holes.push(new THREE.Path(inner.getPoints(32).reverse()));
    const rim = new THREE.ExtrudeGeometry(outer, {
      depth: d.depth,
      steps: 1,
      bevelEnabled: true,
      bevelSize: Math.min(0.65, d.rim * 0.25),
      bevelThickness: 0.65,
      bevelSegments: 5,
      curveSegments: 48,
    });
    rim.translate(0, 0, -d.depth / 2);
    // Normalize texture coordinates from real dimensions, not arbitrary extrusion units.
    const rp = rim.getAttribute("position"),
      ru = rim.getAttribute("uv");
    for (let i = 0; i < ru.count; i++)
      ru.setXY(i, rp.getX(i) / 45 + 0.5, rp.getY(i) / 45 + 0.5);
    add(warp(rim, side), "frame", group, "rim");
    let contour = lensShape(
      c.frontModel,
      d.lensWidth + 0.35,
      d.lensHeight + 0.35,
    )
      .getSpacedPoints(80)
      .slice(0, -1);
    if (THREE.ShapeUtils.isClockWise(contour)) contour = contour.reverse();
    add(
      warp(lensGeometry(contour, d.lensWidth, d.lensHeight), side),
      "lens",
      group,
      "lens",
    );

    const hx = side * (d.center + d.lensWidth * 0.5 + d.rim + 2),
      hy = d.lensHeight * 0.25;
    const anchorX = side * (d.center + d.lensWidth * 0.46),
      anchorZ = frontZ(anchorX);
    add(
      curveTube(
        [
          new THREE.Vector3(anchorX, hy, anchorZ),
          new THREE.Vector3(hx, hy, frontZ(hx)),
          new THREE.Vector3(hx, hy, frontZ(hx) - 5),
        ],
        isMetal(c) ? 1.1 : 2.6,
      ),
      "frame",
    );
    const pivot = new THREE.Group();
    pivot.position.set(hx, hy, frontZ(hx) - 5);
    group.add(pivot);
    temples.push(pivot);
    add(
      new THREE.CylinderGeometry(1.35, 1.35, 5.5, 16),
      "hinge",
      pivot,
      "hinge",
    );
    const screw = add(
      new THREE.CylinderGeometry(0.9, 0.9, 0.3, 12),
      "hinge",
      pivot,
    );
    screw.position.y = 2.85;
    const length = dimensions[c.templeModel].temple;
    const bend =
      c.templeModel === "aviator" ? 22 : c.templeModel === "cateye" ? 18 : 14;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(side * 2, 0, -35),
      new THREE.Vector3(side, -1, -length * 0.61),
      new THREE.Vector3(-side * 5, -4, -length * 0.79),
      new THREE.Vector3(-side * 9, -bend, -length),
    ]);
    const height =
      (isMetal(c) ? 2.6 : c.templeModel === "wayfarer" ? 8 : 6) *
      { thin: 0.8, medium: 1, bold: 1.18 }[c.frameProfile];
    add(
      templeGeometry(path, isMetal(c) ? 1.6 : 3.4, height),
      "frame",
      pivot,
      "temple",
    );
    add(
      templeGeometry(path, isMetal(c) ? 2.8 : 3.8, height * 1.18, 0.69, 1),
      "tip",
      pivot,
      "tip",
    );
    // Small rivets sit on the front endpiece, flush with its surface.
    for (const delta of [-1.2, 1.2]) {
      const rivet = add(new THREE.SphereGeometry(0.65, 10, 8), "hinge");
      rivet.scale.z = 0.45;
      rivet.position.set(
        anchorX + side * delta,
        hy,
        anchorZ + d.depth / 2 + 0.45,
      );
    }
    const padX = side * (d.bridge / 2 + 2.7),
      padY = -2;
    const startX = side * (d.center - d.lensWidth * 0.43);
    add(
      curveTube(
        [
          new THREE.Vector3(startX, 1, frontZ(startX) - d.depth / 2),
          new THREE.Vector3(padX, -1, -8),
          new THREE.Vector3(padX, padY, -11),
        ],
        0.7,
      ),
      "hinge",
    );
    const pad = add(new THREE.SphereGeometry(1, 16, 12), "pad");
    pad.position.set(padX, padY - 2, -11);
    pad.scale.set(2.5, 5.2, 1.3);
    pad.rotation.z = -side * 0.3;
  }
  const bx = d.center - d.lensWidth * 0.46,
    by = d.lensHeight * 0.27;
  const bridgePoints = [
    new THREE.Vector3(-bx, by, frontZ(bx)),
    new THREE.Vector3(-d.bridge * 0.25, by + 3, -0.4),
    new THREE.Vector3(0, by + 4, 0),
    new THREE.Vector3(d.bridge * 0.25, by + 3, -0.4),
    new THREE.Vector3(bx, by, frontZ(bx)),
  ];
  add(
    curveTube(bridgePoints, isMetal(c) ? 1.05 : d.rim * 0.72),
    "frame",
    group,
    "bridge",
  );
  if (c.frontModel === "aviator") {
    add(
      curveTube(
        [
          new THREE.Vector3(
            -d.center * 0.8,
            d.lensHeight * 0.45,
            frontZ(d.center * 0.8),
          ),
          new THREE.Vector3(0, d.lensHeight * 0.53, -0.5),
          new THREE.Vector3(
            d.center * 0.8,
            d.lensHeight * 0.45,
            frontZ(d.center * 0.8),
          ),
        ],
        isMetal(c) ? 0.85 : 1.3,
      ),
      "frame",
    );
  }
  const setFold = (value: number) => {
    temples[0].rotation.set(0.045 * value, -value, 0);
    temples[1].rotation.set(-0.045 * value, value, 0);
  };
  setFold(c.templeOpen);
  return {
    group,
    temples,
    setFold,
    dispose: () => geometries.forEach((g) => g.dispose()),
  };
}
