import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { geometryKey, type EyewearConfig } from "./config";
import { buildEyewear, proportions, type EyewearModel } from "./geometry";
import { createMaterials } from "./materials";

/** Ponto do rosto como o MediaPipe devolve: x e y normalizados (0–1), z na escala da largura. */
export interface FacePoint { x: number; y: number; z: number }

/** Pose do óculos na tela: centro em pixels (origem no canto superior esquerdo), escala em px/mm e rotação. */
export interface TryOnPose {
  x: number;
  y: number;
  scale: number;
  rotation: THREE.Quaternion;
}

const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
/** Largura da armação em relação à distância entre os cantos externos dos olhos. */
const FRAME_TO_EYES = 1.35;
/** O óculos fica um pouco abaixo da linha dos olhos, no apoio do nariz (em px por mm de escala). */
const NOSE_DROP_MM = 2.5;

/**
 * Converte o rosto detectado (vídeo espelhado, como um espelho) na pose do modelo 3D.
 * - posição e escala vêm dos cantos externos dos olhos; a distância usa também o z, então
 *   virar o rosto não encolhe o óculos;
 * - a rotação vem da matriz de transformação facial do MediaPipe (câmera com y para cima e
 *   z para o observador, como no Three.js), espelhada no eixo x junto com o vídeo.
 */
export function poseFromFace(
  face: readonly FacePoint[],
  matrix: ArrayLike<number> | undefined,
  width: number,
  height: number,
  config: EyewearConfig,
): TryOnPose {
  const point = (i: number) => ({
    x: (1 - face[i].x) * width,
    y: face[i].y * height,
    z: face[i].z * width,
  });
  const [left, right] = [point(LEFT_EYE_OUTER), point(RIGHT_EYE_OUTER)].sort((a, b) => a.x - b.x);
  const d = proportions(config);
  const eyes = Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
  const scale = (eyes * FRAME_TO_EYES) / (2 * d.lensWidth + d.bridge);

  const rotation = new THREE.Quaternion();
  if (matrix && matrix.length === 16) {
    new THREE.Matrix4().fromArray(Array.from(matrix)).decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
    // Espelho no eixo x (o vídeo é desenhado espelhado): q = (x, y, z, w) vira (x, -y, -z, w)
    rotation.set(rotation.x, -rotation.y, -rotation.z, rotation.w);
  } else {
    rotation.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.atan2(right.y - left.y, right.x - left.x));
  }
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2 + NOSE_DROP_MM * scale,
    scale,
    rotation,
  };
}

/** Suaviza a pose entre quadros para o óculos não tremer. */
export function smoothPose(previous: TryOnPose | undefined, next: TryOnPose, amount = 0.3): TryOnPose {
  if (!previous) return next;
  return {
    x: previous.x + (next.x - previous.x) * amount,
    y: previous.y + (next.y - previous.y) * amount,
    scale: previous.scale + (next.scale - previous.scale) * amount,
    rotation: previous.rotation.clone().slerp(next.rotation, amount),
  };
}

/**
 * Cena WebGL do Experimentar: o MESMO modelo 3D do Studio (buildEyewear + materiais),
 * numa câmera ortográfica em pixels do vídeo. Uma cabeça invisível (só profundidade)
 * esconde as hastes que passam por trás do rosto.
 */
export function createTryOnScene() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(1);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -5000, 5000);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const reflection = pmrem.fromScene(room, 0.04);
  scene.environment = reflection.texture;
  room.dispose();
  pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a68, 1.4));
  const key = new THREE.DirectionalLight(0xfff7eb, 2.4);
  key.position.set(-0.4, 0.8, 1);
  scene.add(key);

  const head = new THREE.Group();
  scene.add(head);
  // Cabeça aproximada em mm: só escreve profundidade, nunca cor
  const occluderGeometry = new THREE.SphereGeometry(1, 32, 24);
  const occluderMaterial = new THREE.MeshBasicMaterial({ colorWrite: false });
  const occluder = new THREE.Mesh(occluderGeometry, occluderMaterial);
  occluder.scale.set(68, 95, 92);
  occluder.position.set(0, -12, -96);
  occluder.renderOrder = -1;
  head.add(occluder);

  const surfaces = createMaterials();
  let model: EyewearModel | undefined;
  let currentKey = "";

  return {
    canvas: renderer.domElement,
    update(config: EyewearConfig, environment: string) {
      const nextKey = geometryKey(config);
      if (nextKey !== currentKey) {
        if (model) {
          head.remove(model.group);
          model.dispose();
        }
        model = buildEyewear(config, surfaces.materials);
        head.add(model.group);
        currentKey = nextKey;
      }
      // No rosto as hastes ficam sempre abertas, mesmo que o Studio esteja com elas dobradas
      model!.setFold(0);
      surfaces.update(config, environment);
    },
    render(pose: TryOnPose | undefined, width: number, height: number) {
      if (renderer.domElement.width !== width || renderer.domElement.height !== height) {
        renderer.setSize(width, height, false);
        Object.assign(camera, { left: 0, right: width, top: height, bottom: 0 });
        camera.updateProjectionMatrix();
      }
      head.visible = Boolean(pose);
      if (pose) {
        head.position.set(pose.x, height - pose.y, 0);
        head.scale.setScalar(pose.scale);
        head.quaternion.copy(pose.rotation);
      }
      renderer.render(scene, camera);
      return renderer.domElement;
    },
    dispose() {
      model?.dispose();
      surfaces.dispose();
      occluderGeometry.dispose();
      occluderMaterial.dispose();
      reflection.dispose();
      renderer.dispose();
    },
  };
}
