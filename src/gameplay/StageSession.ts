import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { GameConfig } from '../core/config';
import type { StageConfig } from '../core/configSchemas';
import { EventEmitter } from '../core/EventEmitter';
import { Simulation, type SimEvent } from '../sim/Simulation';
import { Npc } from '../npc/Npc';
import { SIGHT_RAY_GROUPS } from '../world/collisionGroups';
import { buildLevel, loadLevel, type Level, type VolumeDef } from '../world/LevelLoader';
import { LevelSensors } from '../world/LevelSensors';
import { PhysicsWorld } from '../world/physics';
import type { Mover } from '../world/Mover';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { Elevator } from './Elevator';
import { Interaction } from './Interaction';
import { PlayerController } from './PlayerController';
import { Skills } from './Skills';

export type Outcome = 'playing' | 'clear' | 'burnout';

export interface SessionInput {
  /** 로컬 이동 입력 (x: 오른쪽, y: 뒤쪽) */
  move: THREE.Vector2;
  run: boolean;
  interact: boolean;
  toggleEarphones: boolean;
  phonePretend: boolean;
}

export const NO_INPUT: SessionInput = {
  move: new THREE.Vector2(),
  run: false,
  interact: false,
  toggleEarphones: false,
  phonePretend: false,
};

export type SessionEvents = {
  /** 화면에 잠깐 띄울 문구 (텍스트 키) */
  message: { key: string };
  trigger: { eventId: string };
  outcome: { outcome: Outcome };
  objective: { id: string; completed: boolean };
};

/**
 * 한 스테이지 플레이의 모든 게임플레이 상태 (레벨·물리·sim·플레이어·NPC·엘리베이터·목표).
 * DOM·오디오에 의존하지 않으므로 테스트에서 그대로 돌릴 수 있다. 연출은 이 객체를 읽기만 한다.
 */
export class StageSession extends EventEmitter<SessionEvents> {
  readonly physics: PhysicsWorld;
  readonly sim: Simulation;
  readonly player: PlayerController;
  readonly skills: Skills;
  readonly sensors: LevelSensors;
  readonly interaction: Interaction;
  readonly elevator: Elevator | null;
  readonly npcs: Npc[] = [];
  outcome: Outcome = 'playing';
  readonly completed = new Set<string>();
  private freezeTimer = 0;
  private readonly simEvents: SimEvent[] = [];
  private readonly moverByCollider = new Map<number, Mover>();
  private readonly doorCenters: THREE.Vector3[] = [];
  private readonly zoneWarned = new Set<string>();

  private constructor(
    readonly cfg: GameConfig,
    readonly stage: StageConfig,
    readonly level: Level,
    physics: PhysicsWorld,
  ) {
    super();
    this.physics = physics;
    this.sim = new Simulation(cfg.balance, cfg.stimuli);
    this.skills = new Skills(cfg.skills);
    for (const m of level.movers.values()) for (const h of m.colliderHandles) this.moverByCollider.set(h, m);
    this.player = new PlayerController(physics, cfg.player, (h) => this.moverByCollider.get(h) ?? null);
    const spawn = level.spawns.get('player');
    if (spawn) this.player.placeAt(spawn.position, spawn.yaw);

    this.sensors = new LevelSensors(this.player.collider);
    this.sensors.on('trigger', ({ eventId, volume }) => this.onTrigger(eventId, volume));
    this.sensors.on('volumeEnter', ({ volume }) => this.onZone(volume, true));
    this.sensors.on('volumeExit', ({ volume }) => this.onZone(volume, false));
    this.interaction = new Interaction(level.volumes, physics.world, cfg.player.interactRange);

    this.elevator = stage.elevator ? new Elevator(stage.elevator, level.movers) : null;
    if (stage.elevator) {
      for (const stop of stage.elevator.stops) {
        const door = level.colliderMeshes.find((c) => c.mover?.id === stop.door);
        if (door) this.doorCenters.push(new THREE.Box3().setFromObject(door.mesh).getCenter(new THREE.Vector3()));
      }
    }

    for (const def of stage.npcs) {
      const profile = cfg.npcProfiles[def.profile];
      const npcSpawn = level.spawns.get(`npc_${def.id}`);
      if (!profile || !npcSpawn) {
        console.warn(`NPC ${def.id}: 프로필 또는 SPAWN_npc_${def.id}가 없습니다`);
        continue;
      }
      const npc = new Npc(def.id, profile, npcSpawn, level.paths.get(def.id) ?? [], level.navigation);
      level.root.add(npc.model);
      this.npcs.push(npc);
    }
  }

  static async load(cfg: GameConfig, stage: StageConfig, url: string): Promise<StageSession> {
    const physics = new PhysicsWorld(cfg.world.physics.gravity);
    const level = await loadLevel(url, { physics, navmesh: cfg.world.navmesh });
    return new StageSession(cfg, stage, level, physics);
  }

  /** 이미 파싱된 glTF로 생성 (테스트용) */
  static fromGltf(cfg: GameConfig, stage: StageConfig, gltf: GLTF): StageSession {
    const physics = new PhysicsWorld(cfg.world.physics.gravity);
    const level = buildLevel(gltf, stage.level, { physics, navmesh: cfg.world.navmesh });
    return new StageSession(cfg, stage, level, physics);
  }

  get inHome(): boolean {
    for (const v of this.sensors.activeVolumes) if (v.kind === 'SAFE' && v.id === this.stage.homeVolume) return true;
    return false;
  }

  /** 현재 진행 중인 목표 */
  get currentObjective(): StageConfig['objectives'][number] | null {
    return (
      this.stage.objectives.find((o) => !this.completed.has(o.id) && (o.requires ?? []).every((r) => this.completed.has(r))) ??
      null
    );
  }

  get frozen(): boolean {
    return this.freezeTimer > 0;
  }

  fixedUpdate(dt: number, input: SessionInput): void {
    const playing = this.outcome === 'playing';
    const active = playing ? input : NO_INPUT;

    if (active.toggleEarphones) this.skills.toggleEarphones();
    this.skills.phonePretend = active.phonePretend;

    // 1) 움직이는 바닥 먼저 (플레이어가 같은 스텝에 새 위치를 보도록)
    this.elevator?.beginStep();
    this.elevator?.fixedUpdate(dt, this.doorBlocked());

    // 2) 플레이어
    this.freezeTimer = Math.max(0, this.freezeTimer - dt);
    const speedMultiplier = playing && !this.frozen ? this.skills.moveMultiplier : 0;
    this.player.fixedUpdate(dt, { move: active.move, run: active.run }, { speedMultiplier });

    // 3) 상호작용
    this.interaction.update(this.player.eye, this.player.forward);
    if (active.interact && this.interaction.focused) this.sensors.fireInteract(this.interaction.focused);

    // 4) NPC
    const inSafe = this.inHome;
    const npcCtx = {
      player: {
        eye: this.player.eye,
        feet: this.player.feet,
        forward: this.player.forward,
        speed: this.player.horizontalSpeed,
        eyeContactBlocked: this.skills.eyeContactBlocked,
        inSafe,
      },
      bus: this.sim.bus,
      los: this.lineOfSight,
    };
    if (playing) for (const npc of this.npcs) npc.fixedUpdate(dt, npcCtx);

    // 5) 물리 (센서 진입/이탈 이벤트 발생)
    this.physics.step(dt, this.sensors.handleContact);

    // 6) 시뮬레이션
    if (playing) {
      this.sim.step(dt, { outdoor: !inSafe, inSafe, modifiers: this.skills.modifiers });
      for (const e of this.sim.drainEvents()) {
        this.simEvents.push(e);
        if (e.type === 'ambush') this.freezeTimer = this.cfg.balance.ambush.freezeSec;
        if (e.type === 'burnout') this.finish('burnout');
      }
    }
  }

  /** 렌더 프레임: 시선, NPC·mover 보간 */
  frameUpdate(dt: number, alpha: number, look: { dx: number; dy: number }): void {
    if (this.outcome === 'playing') {
      this.player.look(look.dx, look.dy, this.cfg.player.mouseSensitivity, this.skills.pitchLock, dt, this.skills.pitchLerpPerSec);
    }
    for (const m of this.level.movers.values()) m.syncVisual(alpha);
    for (const npc of this.npcs) npc.frameUpdate(dt, alpha);
  }

  /** 연출 계층이 프레임마다 가져가는 sim 이벤트 */
  drainSimEvents(): SimEvent[] {
    return this.simEvents.splice(0);
  }

  private readonly lineOfSight = (from: THREE.Vector3, to: THREE.Vector3): boolean => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const dist = dir.length();
    if (dist < 1e-3) return true;
    dir.divideScalar(dist);
    const hit = this.physics.world.castRay(
      new RAPIER.Ray(from, dir),
      dist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      SIGHT_RAY_GROUPS,
    );
    return hit === null || hit.timeOfImpact >= dist - 0.05;
  };

  private doorBlocked(): boolean {
    if (!this.elevator) return false;
    const c = this.doorCenters[this.elevator.stopIndex];
    if (!c) return false;
    // 캡슐이 문이 닫히는 면과 겹치는지 (반경 + 문 두께의 절반)
    const f = this.player.feet;
    const reach = this.cfg.player.radius + 0.05;
    return Math.abs(f.x - c.x) < 0.8 + this.cfg.player.radius && Math.abs(f.z - c.z) < reach && Math.abs(f.y - (c.y - 1.1)) < 1;
  }

  private onTrigger(eventId: string, _volume: VolumeDef<'TRG'>): void {
    if (this.outcome !== 'playing') return;
    this.emit('trigger', { eventId });
    if (this.elevator?.handleEvent(eventId)) return;

    const scripted = this.stage.events[eventId];
    if (scripted) this.sim.bus.emit(scripted.stimulus, eventId);

    for (const o of this.stage.objectives) {
      if (o.completeOnEvent === eventId && !this.completed.has(o.id)) this.completeObjective(o.id);
    }

    if (eventId === this.stage.winEvent) {
      if (this.stage.winRequires.every((r) => this.completed.has(r))) {
        for (const o of this.stage.objectives) if (!this.completed.has(o.id)) this.completeObjective(o.id);
        this.finish('clear');
      } else {
        this.emit('message', { key: `interact.${eventId}.notYet` });
      }
    }
  }

  private completeObjective(id: string): void {
    this.completed.add(id);
    this.emit('objective', { id, completed: true });
  }

  private onZone(volume: VolumeDef, entered: boolean): void {
    if (volume.kind !== 'ZONE') return;
    const { stimulus, intensity } = (volume as VolumeDef<'ZONE'>).props;
    if (!this.sim.bus.has(stimulus)) {
      if (!this.zoneWarned.has(stimulus)) console.warn(`ZONE_${volume.id}: 알 수 없는 자극 "${stimulus}"`);
      this.zoneWarned.add(stimulus);
      return;
    }
    this.sim.bus.setContinuous(`zone:${volume.id}`, stimulus, entered ? (intensity ?? 1) : 0);
  }

  private finish(outcome: Exclude<Outcome, 'playing'>): void {
    if (this.outcome !== 'playing') return;
    this.outcome = outcome;
    for (const npc of this.npcs) npc.release(this.sim.bus);
    this.emit('outcome', { outcome });
  }

  dispose(): void {
    this.clear();
    for (const npc of this.npcs) npc.dispose();
    this.player.dispose();
    this.level.dispose();
    this.physics.dispose();
  }
}
