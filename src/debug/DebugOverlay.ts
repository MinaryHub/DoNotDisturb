import * as THREE from 'three';
import type { Level, VolumeDef } from '../world/LevelLoader';
import type { VolumePrefix } from '../world/levelSchema';
import { navMeshDebugGeometry } from '../world/navigation';

export const OVERLAY_LAYERS = ['colliders', 'los', 'volumes', 'spawns', 'paths', 'navmesh', 'labels'] as const;
export type OverlayLayer = (typeof OVERLAY_LAYERS)[number];

const VOLUME_COLORS: Record<VolumePrefix, number> = {
  TRG: 0xffd23f,
  SAFE: 0x3fd0ff,
  HIDE: 0x5a6bff,
  ZONE: 0xff4fd8,
};

/** 레벨의 게임플레이 요소(충돌·센서·스폰·경로·내비메시)를 시각화한다 */
export class DebugOverlay {
  readonly root = new THREE.Group();
  private readonly layers = new Map<OverlayLayer, THREE.Group>();
  private readonly volumeMeshes = new Map<VolumeDef, THREE.Mesh>();
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  constructor() {
    this.root.name = 'DebugOverlay';
    for (const layer of OVERLAY_LAYERS) {
      const group = new THREE.Group();
      group.name = `overlay:${layer}`;
      this.layers.set(layer, group);
      this.root.add(group);
    }
  }

  setLayerVisible(layer: OverlayLayer, visible: boolean): void {
    this.layers.get(layer)!.visible = visible;
  }

  build(level: Level): void {
    this.clear();
    const layer = (name: OverlayLayer) => this.layers.get(name)!;

    const colMat = this.material(new THREE.MeshBasicMaterial({ color: 0x39ff6a, wireframe: true }));
    for (const { mesh } of level.colliderMeshes) layer('colliders').add(this.worldCopy(mesh, colMat));

    const losMat = this.material(new THREE.MeshBasicMaterial({ color: 0xff8a2a, wireframe: true }));
    for (const { mesh } of level.losMeshes) layer('los').add(this.worldCopy(mesh, losMat));

    for (const volume of level.volumes) {
      const size = volume.halfExtents.clone().multiplyScalar(2);
      const geom = this.geometry(new THREE.BoxGeometry(size.x, size.y, size.z));
      const mat = this.material(
        new THREE.MeshBasicMaterial({ color: VOLUME_COLORS[volume.kind], transparent: true, opacity: 0.18, depthWrite: false }),
      );
      const box = new THREE.Mesh(geom, mat);
      box.position.copy(volume.center);
      box.quaternion.copy(volume.rotation);
      const edges = new THREE.LineSegments(
        this.geometry(new THREE.EdgesGeometry(geom)),
        this.material(new THREE.LineBasicMaterial({ color: VOLUME_COLORS[volume.kind] })),
      );
      box.add(edges);
      layer('volumes').add(box);
      this.volumeMeshes.set(volume, box);

      const detail = volume.kind === 'TRG' ? `eventId=${(volume as VolumeDef<'TRG'>).props.eventId}` : '';
      layer('labels').add(this.label(`${volume.kind}_${volume.id} ${detail}`, volume.center, VOLUME_COLORS[volume.kind]));
    }

    for (const spawn of level.spawns.values()) {
      const color = spawn.id === 'player' ? 0x39ff6a : 0xff5050;
      const dir = new THREE.Vector3(-Math.sin(spawn.yaw), 0, -Math.cos(spawn.yaw));
      const arrow = new THREE.ArrowHelper(dir, spawn.position.clone().add(new THREE.Vector3(0, 0.05, 0)), 0.8, color, 0.25, 0.15);
      layer('spawns').add(arrow);
      const pillar = new THREE.Mesh(
        this.geometry(new THREE.CylinderGeometry(0.25, 0.25, 1.8, 12, 1, true)),
        this.material(new THREE.MeshBasicMaterial({ color, wireframe: true })),
      );
      pillar.position.copy(spawn.position).add(new THREE.Vector3(0, 0.9, 0));
      layer('spawns').add(pillar);
      layer('labels').add(this.label(`SPAWN_${spawn.id}`, spawn.position.clone().add(new THREE.Vector3(0, 2.1, 0)), color));
    }

    const pathMat = this.material(new THREE.LineBasicMaterial({ color: 0xff5050 }));
    const pointGeom = this.geometry(new THREE.SphereGeometry(0.08, 8, 6));
    const pointMat = this.material(new THREE.MeshBasicMaterial({ color: 0xff5050 }));
    for (const [npcId, points] of level.paths) {
      const lifted = points.map((p) => p.clone().add(new THREE.Vector3(0, 0.1, 0)));
      layer('paths').add(new THREE.Line(this.geometry(new THREE.BufferGeometry().setFromPoints(lifted)), pathMat));
      lifted.forEach((p, i) => {
        const dot = new THREE.Mesh(pointGeom, pointMat);
        dot.position.copy(p);
        layer('paths').add(dot);
        layer('labels').add(this.label(`${npcId} #${i + 1}`, p.clone().add(new THREE.Vector3(0, 0.35, 0)), 0xff5050, 0.5));
      });
    }

    if (level.navigation) {
      const { positions, indices } = navMeshDebugGeometry(level.navigation.navMesh);
      const geom = this.geometry(new THREE.BufferGeometry());
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setIndex(indices);
      const navMesh = new THREE.Mesh(
        geom,
        this.material(
          new THREE.MeshBasicMaterial({ color: 0x00c2a8, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
        ),
      );
      navMesh.position.y = 0.02;
      navMesh.add(new THREE.Mesh(geom, this.material(new THREE.MeshBasicMaterial({ color: 0x00c2a8, wireframe: true }))));
      layer('navmesh').add(navMesh);
    }
  }

  /** 플레이어가 들어가 있는 볼륨을 강조 */
  highlight(active: ReadonlySet<VolumeDef>): void {
    for (const [volume, mesh] of this.volumeMeshes) {
      (mesh.material as THREE.MeshBasicMaterial).opacity = active.has(volume) ? 0.45 : 0.18;
    }
  }

  clear(): void {
    for (const group of this.layers.values()) group.clear();
    this.volumeMeshes.clear();
    for (const g of this.ownedGeometries.splice(0)) g.dispose();
    for (const m of this.ownedMaterials.splice(0)) {
      if (m instanceof THREE.SpriteMaterial) m.map?.dispose();
      m.dispose();
    }
  }

  /** 원본 메시 지오메트리를 공유하고 월드 행렬만 복사한 표시용 메시 */
  private worldCopy(mesh: THREE.Mesh, material: THREE.Material): THREE.Mesh {
    const copy = new THREE.Mesh(mesh.geometry, material);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    return copy;
  }

  private label(text: string, position: THREE.Vector3, color: number, scale = 0.8): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const font = '28px ui-monospace, monospace';
    ctx.font = font;
    canvas.width = Math.ceil(ctx.measureText(text).width) + 16;
    canvas.height = 40;
    ctx.font = font;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fillText(text, 8, 29);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(this.material(new THREE.SpriteMaterial({ map: texture, depthTest: false })));
    sprite.renderOrder = 10;
    sprite.position.copy(position);
    sprite.scale.set((canvas.width / canvas.height) * 0.25 * scale, 0.25 * scale, 1);
    return sprite;
  }

  private geometry<T extends THREE.BufferGeometry>(g: T): T {
    this.ownedGeometries.push(g);
    return g;
  }

  private material<T extends THREE.Material>(m: T): T {
    this.ownedMaterials.push(m);
    return m;
  }
}
