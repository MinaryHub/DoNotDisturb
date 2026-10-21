import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { WorldConfig } from '../core/configSchemas';
import { isRenderedPrefix, isVolumePrefix, type PropsOf, type VolumePrefix } from './levelSchema';
import { parseNodeName, parsePathId, type ParsedNode } from './parseNodeName';
import { LOS_GROUPS, SENSOR_GROUPS, WORLD_GROUPS } from './collisionGroups';
import { buildNavigation, type Navigation } from './navigation';
import type { PhysicsWorld } from './physics';

/** 방향을 가진 위치 (SPAWN_). yaw는 −Z가 0, 라디안 */
export interface SpawnPoint {
  id: string;
  position: THREE.Vector3;
  yaw: number;
}

/** 센서 볼륨 (TRG_/SAFE_/HIDE_/ZONE_). 회전된 박스(OBB) */
export interface VolumeDef<P extends VolumePrefix = VolumePrefix> {
  kind: P;
  id: string;
  nodeName: string;
  props: PropsOf<P>;
  center: THREE.Vector3;
  rotation: THREE.Quaternion;
  halfExtents: THREE.Vector3;
  collider: RAPIER.Collider;
}

/** 디버그 오버레이용 원본 메시 (월드 변환 포함) */
export interface SourceMesh {
  nodeName: string;
  mesh: THREE.Mesh;
}

export interface LevelWarning {
  node: string;
  level: 'error' | 'warning';
  message: string;
}

export interface Level {
  url: string;
  /** 씬에 추가할 루트. 접두어 노드의 메시는 visible=false */
  root: THREE.Object3D;
  spawns: Map<string, SpawnPoint>;
  volumes: VolumeDef[];
  /** npcId → 순서대로 정렬된 순찰 지점 */
  paths: Map<string, THREE.Vector3[]>;
  colliderMeshes: SourceMesh[];
  losMeshes: SourceMesh[];
  navSourceMeshes: SourceMesh[];
  navigation: Navigation | null;
  colliders: RAPIER.Collider[];
  warnings: LevelWarning[];
  dispose(): void;
}

export interface LevelContext {
  physics: PhysicsWorld;
  navmesh: WorldConfig['navmesh'];
}

const gltfLoader = new GLTFLoader();

export async function loadLevel(url: string, ctx: LevelContext): Promise<Level> {
  const gltf = await gltfLoader.loadAsync(url);
  return buildLevel(gltf, url, ctx);
}

/** glTF 노드인지 (프리미티브가 여러 개인 메시의 자식 Mesh는 노드가 아님) */
function isGltfNode(gltf: GLTF, obj: THREE.Object3D): boolean {
  return gltf.parser.associations.get(obj)?.nodes !== undefined;
}

/** 노드 자신의 메시: 자신이 Mesh이거나, 노드가 아닌 자식 Mesh(멀티 프리미티브) */
function ownMeshes(gltf: GLTF, node: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = [];
  if ((node as THREE.Mesh).isMesh) result.push(node as THREE.Mesh);
  for (const child of node.children) {
    if ((child as THREE.Mesh).isMesh && !isGltfNode(gltf, child)) result.push(child as THREE.Mesh);
  }
  return result;
}

/** 메시의 삼각형을 월드 좌표로 꺼낸다 */
function worldTriangles(mesh: THREE.Mesh): { vertices: Float32Array; indices: Uint32Array } {
  const geom = mesh.geometry;
  const pos = geom.getAttribute('position');
  const vertices = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    vertices.set([v.x, v.y, v.z], i * 3);
  }
  const index = geom.getIndex();
  const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  // 음수 스케일(미러)이면 감기 방향이 뒤집히므로 되돌린다
  if (mesh.matrixWorld.determinant() < 0) {
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const tmp = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = tmp;
    }
  }
  return { vertices, indices };
}

/** 노드 로컬 공간에서 자기 메시들의 바운딩 박스를 합쳐 OBB(월드)를 만든다 */
function nodeObb(node: THREE.Object3D, meshes: THREE.Mesh[]) {
  const invNode = node.matrixWorld.clone().invert();
  const localBox = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    tmp.copy(mesh.geometry.boundingBox!).applyMatrix4(new THREE.Matrix4().multiplyMatrices(invNode, mesh.matrixWorld));
    localBox.union(tmp);
  }
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  node.matrixWorld.decompose(position, rotation, scale);
  const center = localBox.getCenter(new THREE.Vector3()).applyMatrix4(node.matrixWorld);
  const halfExtents = localBox
    .getSize(new THREE.Vector3())
    .multiply(new THREE.Vector3(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z)))
    .multiplyScalar(0.5);
  // Rapier는 두께 0 박스를 허용하지 않으므로 최소 두께를 둔다
  halfExtents.max(new THREE.Vector3(0.005, 0.005, 0.005));
  return { center, rotation, halfExtents };
}

function yawFromQuaternion(q: THREE.Quaternion): number {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return Math.atan2(-forward.x, -forward.z);
}

export function buildLevel(gltf: GLTF, url: string, ctx: LevelContext): Level {
  const root = gltf.scene;
  root.updateMatrixWorld(true);

  const spawns = new Map<string, SpawnPoint>();
  const volumes: VolumeDef[] = [];
  const pathPoints = new Map<string, { index: number; point: THREE.Vector3 }[]>();
  const colliderMeshes: SourceMesh[] = [];
  const losMeshes: SourceMesh[] = [];
  const navSourceMeshes: SourceMesh[] = [];
  const colliders: RAPIER.Collider[] = [];
  const warnings: LevelWarning[] = [];

  const nodes: { obj: THREE.Object3D; parsed: ParsedNode }[] = [];
  root.traverse((obj) => {
    if (!isGltfNode(gltf, obj)) return;
    const rawName: string = typeof obj.userData['name'] === 'string' ? obj.userData['name'] : obj.name;
    if (!rawName) return;
    nodes.push({ obj, parsed: parseNodeName(rawName, obj.userData) });
  });

  for (const { obj, parsed } of nodes) {
    for (const issue of parsed.issues) warnings.push({ node: parsed.rawName, level: issue.level, message: issue.message });
    const { prefix, id, props } = parsed;
    const meshes = ownMeshes(gltf, obj);

    if (!isRenderedPrefix(prefix)) for (const m of meshes) m.visible = false;
    // 필수 속성이 틀린 노드는 게임플레이 요소를 만들지 않는다 (경고는 위에서 기록)
    if (props === null) continue;

    switch (prefix) {
      case 'VIS':
        break;

      case 'COL':
        for (const mesh of meshes) {
          colliderMeshes.push({ nodeName: parsed.rawName, mesh });
          if ((props as PropsOf<'COL'>).shape === 'box') {
            const obb = nodeObb(mesh, [mesh]);
            colliders.push(ctx.physics.addStaticBox(obb.center, obb.rotation, obb.halfExtents, WORLD_GROUPS));
          } else {
            const { vertices, indices } = worldTriangles(mesh);
            colliders.push(ctx.physics.addStaticTrimesh(vertices, indices, WORLD_GROUPS));
          }
        }
        if (meshes.length === 0) warnings.push({ node: parsed.rawName, level: 'warning', message: 'COL_ 노드에 메시가 없습니다' });
        break;

      case 'LOS':
        for (const mesh of meshes) {
          losMeshes.push({ nodeName: parsed.rawName, mesh });
          const { vertices, indices } = worldTriangles(mesh);
          colliders.push(ctx.physics.addStaticTrimesh(vertices, indices, LOS_GROUPS));
        }
        break;

      case 'NAV':
        for (const mesh of meshes) navSourceMeshes.push({ nodeName: parsed.rawName, mesh });
        break;

      case 'SPAWN': {
        const position = new THREE.Vector3();
        const rotation = new THREE.Quaternion();
        obj.matrixWorld.decompose(position, rotation, new THREE.Vector3());
        if (spawns.has(id)) warnings.push({ node: parsed.rawName, level: 'error', message: `SPAWN_${id}가 중복됩니다` });
        spawns.set(id, { id, position, yaw: yawFromQuaternion(rotation) });
        break;
      }

      case 'PATH': {
        const pathId = parsePathId(id);
        if (!pathId) break;
        const list = pathPoints.get(pathId.npcId) ?? [];
        list.push({ index: pathId.index, point: new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld) });
        pathPoints.set(pathId.npcId, list);
        break;
      }

      default:
        if (isVolumePrefix(prefix)) {
          if (meshes.length === 0) {
            warnings.push({ node: parsed.rawName, level: 'error', message: `${prefix}_ 볼륨에 메시가 없습니다 (박스 메시로 영역을 만들어 주세요)` });
            break;
          }
          const obb = nodeObb(obj, meshes);
          const def = { kind: prefix, id, nodeName: parsed.rawName, props, ...obb } as Omit<VolumeDef, 'collider'>;
          const collider = ctx.physics.addSensorBox(obb.center, obb.rotation, obb.halfExtents, SENSOR_GROUPS, def);
          const volume = Object.assign(def, { collider }) as VolumeDef;
          volumes.push(volume);
          colliders.push(collider);
        }
    }
  }

  const paths = new Map<string, THREE.Vector3[]>();
  for (const [npcId, list] of pathPoints) {
    list.sort((a, b) => a.index - b.index);
    paths.set(npcId, list.map((p) => p.point));
  }

  if (!spawns.has('player')) warnings.push({ node: '(level)', level: 'error', message: '필수 노드 SPAWN_player가 없습니다' });

  let navigation: Navigation | null = null;
  if (navSourceMeshes.length > 0) {
    const positions: number[] = [];
    const indices: number[] = [];
    // COL_도 장애물로 함께 넣어야 기둥·벽을 피해 길이 생긴다.
    // (COL_ 윗면도 걸을 수 있는 면으로 계산되지만 NAV_ 바닥과 연결되지 않으면 고립된 섬이 되어 무해하다)
    for (const { mesh } of [...navSourceMeshes, ...colliderMeshes]) {
      const tri = worldTriangles(mesh);
      const offset = positions.length / 3;
      for (const value of tri.vertices) positions.push(value);
      for (const i of tri.indices) indices.push(i + offset);
    }
    const result = buildNavigation(positions, indices, ctx.navmesh);
    if ('nav' in result) navigation = result.nav;
    else warnings.push({ node: '(navmesh)', level: 'error', message: `내비메시 생성 실패: ${result.error}` });
  }

  return {
    url,
    root,
    spawns,
    volumes,
    paths,
    colliderMeshes,
    losMeshes,
    navSourceMeshes,
    navigation,
    colliders,
    warnings,
    dispose() {
      root.removeFromParent();
      ctx.physics.removeColliders(colliders);
      navigation?.dispose();
      disposeObject(root);
    },
  };
}

function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
  });
}
