import { beforeAll, describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import worldJson from '../data/world.json';
import { worldConfigSchema } from '../src/core/configSchemas';
import { buildLevel, type Level } from '../src/world/LevelLoader';
import { LevelSensors } from '../src/world/LevelSensors';
import { initNavigation } from '../src/world/navigation';
import { initPhysics, PhysicsWorld } from '../src/world/physics';
import { createGreyboxLevel } from '../tools/lib/greybox';

// Phase 0 완료 기준: 접두어가 붙은 GLB를 넣으면 충돌·트리거·스폰이 자동 생성된다

const world = worldConfigSchema.parse(worldJson);

async function loadGreybox(physics: PhysicsWorld): Promise<Level> {
  const glb = await new NodeIO().writeBinary(createGreyboxLevel());
  const gltf = await new GLTFLoader().parseAsync(glb.buffer, '');
  return buildLevel(gltf, 'greybox', { physics, navmesh: world.navmesh });
}

describe('LevelLoader (그레이박스 GLB 통합)', () => {
  let physics: PhysicsWorld;
  let level: Level;

  beforeAll(async () => {
    await Promise.all([initPhysics(), initNavigation()]);
    physics = new PhysicsWorld(world.physics.gravity);
    level = await loadGreybox(physics);
  });

  it('경고 없이 로드', () => {
    expect(level.warnings).toEqual([]);
  });

  it('SPAWN_ 위치와 방향', () => {
    const player = level.spawns.get('player')!;
    expect(player.position.toArray()).toEqual([0, 0, 1.5]);
    expect(player.yaw).toBeCloseTo(0);
    const npc = level.spawns.get('npc_neighbor')!;
    expect(Math.abs(npc.yaw)).toBeCloseTo(Math.PI);
  });

  it('볼륨 센서와 속성 (이름 속성 · 소수점 값 포함)', () => {
    const byKind = Object.fromEntries(level.volumes.map((v) => [v.kind, v]));
    expect(byKind.TRG?.props).toEqual({ eventId: 'landlordCall', once: true });
    expect(byKind.ZONE?.props).toEqual({ stimulus: 'crowd', intensity: 0.6 });
    expect(byKind.SAFE?.props).toEqual({ capacity: 1, noiseAfterSec: 45 });
    expect(byKind.HIDE?.props).toEqual({ detectScale: 0.5 });
    expect(byKind.TRG?.halfExtents.toArray()).toEqual([3, 1, 0.5]);
    for (const v of level.volumes) expect(v.collider.isSensor()).toBe(true);
  });

  it('PATH_ 는 번호순으로 정렬', () => {
    const path = level.paths.get('neighbor')!;
    expect(path.map((p) => p.z)).toEqual([-18, -9, -9, -18]);
  });

  it('접두어 메시는 숨기고 VIS_만 보인다', () => {
    const visible: string[] = [];
    level.root.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh && o.visible) visible.push(o.userData['name'] as string);
    });
    expect(visible.length).toBe(8);
    expect(visible.every((n) => n.startsWith('VIS_'))).toBe(true);
  });

  it('COL_ 충돌체가 레이캐스트에 맞는다 (바닥)', async () => {
    const RAPIER = (await import('@dimforge/rapier3d-compat')).default;
    physics.step(1 / 60);
    const hit = physics.world.castRay(new RAPIER.Ray({ x: 0, y: 2, z: 0 }, { x: 0, y: -1, z: 0 }), 10, true);
    expect(hit).not.toBeNull();
    expect(hit!.timeOfImpact).toBeCloseTo(2, 3);
  });

  it('내비메시 생성 및 경로 탐색 (기둥 회피)', () => {
    expect(level.navigation).not.toBeNull();
    const { success, path } = level.navigation!.query.computePath({ x: 1.6, y: 0, z: -4 }, { x: 1.6, y: 0, z: -10 });
    expect(success).toBe(true);
    // 기둥(x=1.6, z=-7)을 돌아가야 하므로 직선보다 점이 많다
    expect(path.length).toBeGreaterThan(2);
  });

  it('TRG_ 진입 시 eventId 발동, once=true는 한 번만', () => {
    const probe = physics.addKinematicProbe(world.physics.probeRadius);
    const sensors = new LevelSensors(probe.collider);
    const fired: string[] = [];
    sensors.on('trigger', (e) => fired.push(e.eventId));

    const moveTo = (z: number) => {
      probe.body.setNextKinematicTranslation({ x: 0, y: 1, z });
      for (let i = 0; i < 3; i++) physics.step(1 / 60, sensors.handleContact);
    };
    moveTo(1); // 트리거 밖
    moveTo(-3); // 진입
    moveTo(1); // 이탈
    moveTo(-3); // 재진입 (once라서 무시)
    expect(fired).toEqual(['landlordCall']);
    physics.removeColliders([probe.collider]);
  });

  it('dispose 시 콜라이더 제거', async () => {
    const extra = await loadGreybox(physics);
    const before = physics.world.colliders.len();
    extra.dispose();
    expect(physics.world.colliders.len()).toBe(before - extra.colliders.length);
  });
});
