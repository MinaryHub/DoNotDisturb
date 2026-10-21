import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadConfig, loadStage, type GameConfig } from '../src/core/config';
import type { StageConfig } from '../src/core/configSchemas';
import { NO_INPUT, StageSession, type SessionInput } from '../src/gameplay/StageSession';
import { initNavigation } from '../src/world/navigation';
import { initPhysics } from '../src/world/physics';
import { volumeCenter } from '../src/world/LevelLoader';

// 실제 Kreate로 만든 스테이지 1 레벨로 게임플레이를 머리 없이(렌더링 없이) 돌려 본다

const GLB = path.join(import.meta.dirname, '..', 'assets', 'kreate', 'levels', 'stage01.glb');
const DT = 1 / 60;

let cfg: GameConfig;
let stage: StageConfig;
let session: StageSession;

async function parse(): Promise<GLTF> {
  const buf = fs.readFileSync(GLB);
  return new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
}

function run(seconds: number, input: Partial<SessionInput> = {}): void {
  const full = { ...NO_INPUT, ...input };
  for (let i = 0; i < Math.round(seconds / DT); i++) session.fixedUpdate(DT, full);
}

/** 플레이어를 발 위치로 옮기고 바라보는 방향 지정 */
function teleport(x: number, y: number, z: number, yaw = 0): void {
  session.player.placeAt(new THREE.Vector3(x, y, z), yaw);
  run(0.1);
}

beforeAll(async () => {
  await Promise.all([initPhysics(), initNavigation()]);
  cfg = loadConfig();
  stage = loadStage('stage01');
});

beforeEach(async () => {
  session = StageSession.fromGltf(cfg, stage, await parse());
  // NPC는 개별 테스트에서만 관여하도록 멀리 보낸다
});

afterEach(() => session.dispose());

describe('스테이지 1 레벨 로드', () => {
  it('경고 없이 로드, mover·내비메시·NPC 준비', () => {
    expect(session.level.warnings).toEqual([]);
    expect([...session.level.movers.keys()].sort()).toEqual(['elevCar', 'elevDoor1F', 'elevDoor3F']);
    expect(session.level.navigation).not.toBeNull();
    expect(session.npcs.map((n) => n.id)).toEqual(['neighbor']);
    // 3층 복도 (게임 좌표 y=6, 내비메시 셀 높이만큼 오차)
    expect(Math.abs(session.npcs[0]!.position.y - 6)).toBeLessThan(0.15);
  });

  it('플레이어는 집 바닥 위에 서 있고 떨어지지 않는다', () => {
    run(1);
    expect(session.player.isGrounded).toBe(true);
    expect(session.player.feet.y).toBeCloseTo(6, 1);
    expect(session.inHome).toBe(true);
  });

  it('앞으로 걸으면 집을 나와 복도로 간다 (실외 배터리 감소 시작)', () => {
    run(4, { move: new THREE.Vector2(0, -1) });
    expect(session.player.feet.z).toBeLessThan(-2.5);
    expect(session.inHome).toBe(false);
    expect(session.player.feet.y).toBeCloseTo(6, 1);
  });
});

describe('엘리베이터', () => {
  it('3층 호출 → 칸이 올라오고 문이 열린다', () => {
    session.elevator!.handleEvent('elevCall3F');
    run(6);
    expect(session.elevator!.floor).toBe('3F');
    expect(session.elevator!.carOffsetY).toBeCloseTo(6);
    expect(['opening', 'open']).toContain(session.elevator!.phase);
  });

  it('칸에 탄 플레이어가 함께 1층으로 내려간다 (닫힘 연타)', () => {
    session.elevator!.handleEvent('elevCall3F');
    run(6);
    // 칸 안 (게임 좌표: x 0, z -23.3)
    teleport(0, 6.05, -23.3, Math.PI);
    session.elevator!.handleEvent('elevPanel');
    session.elevator!.handleEvent('elevPanel');
    session.elevator!.handleEvent('elevPanel');
    run(10);
    expect(session.elevator!.floor).toBe('1F');
    expect(session.player.feet.y).toBeCloseTo(0, 0);
    expect(session.player.isGrounded).toBe(true);
  });

  it('칸 안쪽 문 가까이(0.4m) 서 있어도 문은 닫히고 출발한다', () => {
    session.elevator!.handleEvent('elevCall3F');
    run(6);
    teleport(0.25, 6.05, -22.5, -Math.PI / 2);
    session.elevator!.handleEvent('elevPanel');
    session.elevator!.handleEvent('elevPanel');
    session.elevator!.handleEvent('elevPanel');
    run(8);
    expect(session.elevator!.floor).toBe('1F');
    expect(session.player.feet.y).toBeCloseTo(0, 0);
  });

  it('승강장에서 걸어서 칸에 타고, 다시 걸어서 내릴 수 있다 (문턱·칸 바닥 이음매)', () => {
    session.elevator!.handleEvent('elevCall1F');
    run(3);
    teleport(0.3, 0, -20.5, 0); // 1층 승강장, 칸(−Z)을 바라봄
    run(1.2, { move: new THREE.Vector2(0, -1) });
    expect(session.player.feet.z).toBeLessThan(-23.0);
    session.player.yaw = Math.PI; // 로비 쪽으로 돌아서
    run(1.2, { move: new THREE.Vector2(0, -1) });
    expect(session.player.feet.z).toBeGreaterThan(-21.5);
  });

  it('칸이 올라갈 때 탄 사람이 바닥을 뚫고 떨어지지 않는다', () => {
    teleport(0, 0, -23.3);
    session.elevator!.handleEvent('elevPanel');
    run(8);
    expect(session.elevator!.floor).toBe('3F');
    expect(session.player.feet.y).toBeCloseTo(6, 0);
    expect(session.player.isGrounded).toBe(true);
  });

  it('문턱에 서 있으면 닫히던 문이 다시 열린다', () => {
    teleport(0, 0, -22.1);
    session.elevator!.handleEvent('elevCall1F');
    run(1.5 + cfg.balance.ambush.freezeSec + (stage.elevator!.doorOpenSec + 1));
    expect(session.elevator!.phase).not.toBe('closed');
  });
});

describe('상호작용', () => {
  it('침대를 바라보고 F → 목표 미완료면 안내 문구', () => {
    const messages: string[] = [];
    session.on('message', (m) => messages.push(m.key));
    const bed = session.level.volumes.find((v) => v.id === 'bed')!;
    const c = volumeCenter(bed);
    // 침대 옆에서 침대를 바라본다
    teleport(c.x + 1.3, 6, c.z, Math.PI / 2);
    session.player.pitch = -0.6;
    session.fixedUpdate(DT, { ...NO_INPUT, interact: true });
    expect(session.interaction.focused?.id).toBe('bed');
    expect(messages).toEqual(['interact.bed.notYet']);
    expect(session.outcome).toBe('playing');
  });

  it('1층 현관 도착 후 침대에 누우면 클리어', () => {
    const exit = session.level.volumes.find((v) => v.id === 'lobbyExit')!;
    const e = volumeCenter(exit);
    teleport(e.x, 0, e.z);
    expect(session.completed.has('reachLobby')).toBe(true);
    expect(session.currentObjective?.id).toBe('goHome');

    const bed = session.level.volumes.find((v) => v.id === 'bed')!;
    const c = volumeCenter(bed);
    teleport(c.x + 1.3, 6, c.z, Math.PI / 2);
    session.player.pitch = -0.6;
    session.fixedUpdate(DT, { ...NO_INPUT, interact: true });
    expect(session.outcome).toBe('clear');
  });
});

describe('이웃 NPC', () => {
  it('복도에서 이웃 정면에 서 있으면 알아채고 다가와 말을 건다 → 배터리 감소', () => {
    const npc = session.npcs[0]!;
    // 이웃 앞 4m, 이웃을 바라보며 서 있기
    const p = npc.position.clone().add(npc.forward.multiplyScalar(4));
    const yawToNpc = Math.atan2(-(npc.position.x - p.x), -(npc.position.z - p.z));
    teleport(p.x, p.y, p.z, yawToNpc);
    const before = session.sim.energy.battery;
    const states = new Set<string>();
    for (let i = 0; i < 8 / DT; i++) {
      session.fixedUpdate(DT, NO_INPUT);
      states.add(npc.state);
    }
    expect(states).toContain('notice');
    expect(states).toContain('talk');
    expect(before - session.sim.energy.battery).toBeGreaterThan(cfg.stimuli['smalltalkPlaceholder']!.damage!);
  });

  it('폰 보는 척은 눈 맞춤을 막아 알아채는 속도를 늦춘다', () => {
    const npc = session.npcs[0]!;
    const p = npc.position.clone().add(npc.forward.multiplyScalar(8));
    const yawToNpc = Math.atan2(-(npc.position.x - p.x), -(npc.position.z - p.z));
    teleport(p.x, p.y, p.z, yawToNpc);
    session.fixedUpdate(DT, NO_INPUT);
    expect(npc.lastPerception?.sees).toBe(true);
    expect(npc.lastPerception?.eyeContact).toBe(true);
    session.fixedUpdate(DT, { ...NO_INPUT, phonePretend: true });
    expect(npc.lastPerception?.eyeContact).toBe(false);
  });

  it('집 안에 있으면 벽에 가려 보이지 않는다', () => {
    run(2);
    const npc = session.npcs[0]!;
    expect(npc.lastPerception?.sees).toBe(false);
    expect(npc.state).toBe('patrol');
  });
});

describe('패배', () => {
  it('배터리가 0이 되면 번아웃, 입력이 막힌다', () => {
    session.sim.energy.debugSet({ battery: 1 });
    session.sim.bus.emit('voiceCall');
    run(0.1);
    expect(session.outcome).toBe('burnout');
    const before = session.player.feet.clone();
    run(1, { move: new THREE.Vector2(0, -1) });
    expect(session.player.feet.distanceTo(before)).toBeLessThan(0.05);
  });
});
