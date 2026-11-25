import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../eyewear/config";
import { proportions } from "../eyewear/geometry";
import { poseFromFace, smoothPose, type FacePoint } from "../eyewear/tryon-scene";

const W = 640;
const H = 480;
const config = normalizeConfig({});

/** Rosto com só os dois cantos externos dos olhos preenchidos (índices 33 e 263). */
function face(left: FacePoint, right: FacePoint): FacePoint[] {
  const points: FacePoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  points[33] = left;
  points[263] = right;
  return points;
}

describe("poseFromFace (Experimentar com o modelo 3D)", () => {
  it("centra entre os olhos no vídeo espelhado e mede a armação pela distância entre eles", () => {
    const pose = poseFromFace(face({ x: 0.6, y: 0.5, z: 0 }, { x: 0.4, y: 0.5, z: 0 }), undefined, W, H, config);
    const d = proportions(config);
    expect(pose.x).toBeCloseTo(W / 2);
    // 0,2 da largura entre os olhos = 128 px
    expect(pose.scale).toBeCloseTo((128 * 1.35) / (2 * d.lensWidth + d.bridge));
    expect(pose.y).toBeGreaterThan(H / 2);
  });

  it("não encolhe o óculos quando o rosto vira (usa o z dos olhos)", () => {
    const frente = poseFromFace(face({ x: 0.6, y: 0.5, z: 0 }, { x: 0.4, y: 0.5, z: 0 }), undefined, W, H, config);
    // Virado: a distância na tela cai, mas a profundidade compensa (128 px no total)
    const dx = 0.2 * Math.cos(Math.PI / 6);
    const dz = 0.2 * Math.sin(Math.PI / 6);
    const virado = poseFromFace(face({ x: 0.5 + dx / 2, y: 0.5, z: dz }, { x: 0.5 - dx / 2, y: 0.5, z: 0 }), undefined, W, H, config);
    expect(virado.scale).toBeCloseTo(frente.scale, 5);
  });

  it("espelha a rotação do MediaPipe junto com o vídeo: girar para um lado vira o outro na tela", () => {
    const yaw = new THREE.Matrix4().makeRotationY(0.4);
    const pose = poseFromFace(face({ x: 0.6, y: 0.5, z: 0 }, { x: 0.4, y: 0.5, z: 0 }), yaw.elements, W, H, config);
    const esperado = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.4);
    expect(pose.rotation.angleTo(esperado)).toBeLessThan(1e-6);
  });

  it("mantém a inclinação para cima e para baixo (eixo x) sem inverter", () => {
    const pitch = new THREE.Matrix4().makeRotationX(0.3);
    const pose = poseFromFace(face({ x: 0.6, y: 0.5, z: 0 }, { x: 0.4, y: 0.5, z: 0 }), pitch.elements, W, H, config);
    const esperado = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
    expect(pose.rotation.angleTo(esperado)).toBeLessThan(1e-6);
  });

  it("sem a matriz, usa a inclinação da linha dos olhos", () => {
    // Olho direito da tela mais baixo: a cabeça inclina no sentido horário
    const pose = poseFromFace(face({ x: 0.6, y: 0.45, z: 0 }, { x: 0.4, y: 0.55, z: 0 }), undefined, W, H, config);
    const z = new THREE.Euler().setFromQuaternion(pose.rotation).z;
    expect(z).toBeLessThan(0);
  });
});

describe("smoothPose", () => {
  it("aproxima aos poucos e aceita a primeira pose como está", () => {
    const a = { x: 0, y: 0, scale: 1, rotation: new THREE.Quaternion() };
    const b = { x: 10, y: 20, scale: 2, rotation: new THREE.Quaternion() };
    expect(smoothPose(undefined, b)).toBe(b);
    const meio = smoothPose(a, b, 0.5);
    expect([meio.x, meio.y, meio.scale]).toEqual([5, 10, 1.5]);
  });
});
