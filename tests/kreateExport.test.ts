import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import worldJson from '../data/world.json';
import budgetJson from '../data/assetBudget.json';
import { assetBudgetSchema, worldConfigSchema } from '../src/core/configSchemas';
import { buildLevel, type Level } from '../src/world/LevelLoader';
import { initNavigation } from '../src/world/navigation';
import { initPhysics, PhysicsWorld } from '../src/world/physics';
import { validateAsset } from '../tools/lib/validateAsset';

// 실제 Kreate에서 내보낸 GLB (2026-10-21, Kreate glTF 내보내기)
// Kreate 씬(Z-up): SPAWN_player (0,4,0), SPAWN_npc_a (2,0,0) Z축 90° 회전,
// TRG_test (0,-3,1) 2×1×2, ZONE_test (0,3,1.5) 6×2×3, COL_dup 두 개(두 번째는 COL_dup.001)
const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'kreate_check.glb');
const world = worldConfigSchema.parse(worldJson);

describe('Kreate 실제 내보내기 호환성', () => {
  let level: Level;

  beforeAll(async () => {
    await Promise.all([initPhysics(), initNavigation()]);
    const buffer = fs.readFileSync(FIXTURE);
    const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
    level = buildLevel(gltf, 'kreate_check', { physics: new PhysicsWorld(world.physics.gravity), navmesh: world.navmesh });
  });

  it('특수문자(=, __)가 포함된 이름 속성을 그대로 읽는다', () => {
    const trg = level.volumes.find((v) => v.kind === 'TRG');
    const zone = level.volumes.find((v) => v.kind === 'ZONE');
    expect(trg?.props).toEqual({ eventId: 'hello', once: true });
    expect(zone?.props).toEqual({ stimulus: 'crowd', intensity: 0.6 });
  });

  it('Kreate Z-up (x, y, z) → 게임 Y-up (x, z, −y) 로 변환된다', () => {
    expect(level.spawns.get('player')!.position.toArray()).toEqual([0, 0, -4]);
    const trg = level.volumes.find((v) => v.kind === 'TRG')!;
    expect(trg.center.x).toBeCloseTo(0);
    expect(trg.center.y).toBeCloseTo(1);
    expect(trg.center.z).toBeCloseTo(3);
    // Kreate 2×1×2 (X×Y×Z) → 게임 2×2×1
    expect(trg.halfExtents.toArray().map((v) => +v.toFixed(3))).toEqual([1, 1, 0.5]);
  });

  it('Kreate의 +Y 방향이 게임의 정면(−Z)이 된다', () => {
    expect(level.spawns.get('player')!.yaw).toBeCloseTo(0);
    // Z축 +90° 회전 → 게임 yaw +90° (−X를 바라봄)
    expect(level.spawns.get('npc_a')!.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('빈 오브젝트(Empty)가 노드로 내보내진다', () => {
    expect([...level.spawns.keys()].sort()).toEqual(['npc_a', 'player']);
  });

  it('내비메시 생성', () => {
    expect(level.navigation).not.toBeNull();
  });

  it('검증 도구: 오류 없음, 중복 이름(.001)만 경고', async () => {
    const doc = await new NodeIO().read(FIXTURE);
    const report = validateAsset(doc, 'levels/kreate_check.glb', assetBudgetSchema.parse(budgetJson));
    expect(report.items.filter((i) => i.level === 'error')).toEqual([]);
    expect(report.items.map((i) => i.node)).toEqual(['COL_dup.001']);
  });
});
