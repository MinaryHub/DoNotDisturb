import * as THREE from 'three';
import type { NpcProfile } from '../core/configSchemas';
import type { StimulusBus } from '../sim/StimulusBus';
import type { Navigation } from '../world/navigation';
import { findProceduralRig, ProceduralAnimator, type CharacterAnimator } from './CharacterAnimator';
import { perceive, type LineOfSight, type PerceptionResult } from './perception';

/** 경량 행동 상태 (CLAUDE.md 5.9: Idle → Notice → Approach → AttemptTalk → Dialogue / GiveUp) */
export type NpcState = 'patrol' | 'notice' | 'approach' | 'talk' | 'giveUp';

export interface NpcPlayerView {
  eye: THREE.Vector3;
  feet: THREE.Vector3;
  forward: THREE.Vector3;
  speed: number;
  eyeContactBlocked: boolean;
  /** 집(세이프 존) 안이면 NPC가 접근하지 않는다 */
  inSafe: boolean;
}

export interface NpcContext {
  player: NpcPlayerView;
  bus: StimulusBus;
  los: LineOfSight;
}

const EYE_HEIGHT = 1.6;
const REPATH_SEC = 0.4;

/** 코드로 만든 그레이박스 NPC 모델. Kreate 캐릭터가 생기면 같은 노드 이름(HEAD/BODY/ARM_L/ARM_R)으로 교체 */
export function createGreyboxNpcModel(color = 0x9fb4c8): THREE.Group {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8c9a8, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.8, 4, 12), mat);
  body.name = 'BODY';
  body.position.y = 0.9;
  const head = new THREE.Group();
  head.name = 'HEAD';
  head.position.y = 1.55;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), skin);
  skull.position.y = 0.05;
  // 얼굴 방향 표시 (−Z가 정면)
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.04), new THREE.MeshStandardMaterial({ color: 0x3b3b44 }));
  face.position.set(0, 0.07, -0.13);
  head.add(skull, face);
  const arm = (name: string, x: number) => {
    const pivot = new THREE.Group();
    pivot.name = name;
    pivot.position.set(x, 1.32, 0);
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), mat);
    mesh.position.y = -0.3;
    pivot.add(mesh);
    return pivot;
  };
  root.add(body, head, arm('ARM_L', -0.31), arm('ARM_R', 0.31));
  return root;
}

export class Npc {
  readonly model: THREE.Group;
  private readonly animator: CharacterAnimator;
  state: NpcState = 'patrol';
  /** 0~1, 1이 되면 플레이어를 알아챔 */
  notice = 0;
  readonly position = new THREE.Vector3();
  private readonly prevPosition = new THREE.Vector3();
  yaw = 0;
  private prevYaw = 0;
  lastPerception: PerceptionResult | null = null;

  private waypointIndex = 0;
  private waitTimer = 0;
  private stateTimer = 0;
  private stareTimer = 0;
  private lostTimer = 0;
  private outOfRangeTimer = 0;
  private path: THREE.Vector3[] = [];
  private pathIndex = 0;
  private repathTimer = 0;
  private speed = 0;
  private readonly gazeKey: string;
  private readonly lingerKey: string;

  constructor(
    readonly id: string,
    readonly profile: NpcProfile,
    spawn: { position: THREE.Vector3; yaw: number },
    private readonly patrol: THREE.Vector3[],
    private readonly nav: Navigation | null,
  ) {
    this.model = createGreyboxNpcModel();
    this.model.name = `npc:${id}`;
    const rig = findProceduralRig(this.model);
    if (!rig) throw new Error(`NPC ${id}: HEAD/BODY/ARM_L/ARM_R 노드가 없습니다`);
    this.animator = new ProceduralAnimator(rig);
    this.position.copy(this.snap(spawn.position));
    this.prevPosition.copy(this.position);
    this.yaw = this.prevYaw = spawn.yaw;
    this.gazeKey = `npc:${id}:gaze`;
    this.lingerKey = `npc:${id}:linger`;
    this.syncVisual(1);
  }

  get eye(): THREE.Vector3 {
    return this.position.clone().setY(this.position.y + EYE_HEIGHT);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  fixedUpdate(dt: number, ctx: NpcContext): void {
    this.prevPosition.copy(this.position);
    this.prevYaw = this.yaw;
    const p = this.profile;
    const player = ctx.player;

    const perception = perceive(
      {
        npcEye: this.eye,
        npcForward: this.forward,
        playerEye: player.eye,
        playerForward: player.forward,
        playerSpeed: player.speed,
        eyeContactBlocked: player.eyeContactBlocked,
      },
      p,
      ctx.los,
    );
    this.lastPerception = perception;
    const aware = (perception.sees || perception.hears) && !player.inSafe;
    this.stateTimer += dt;

    switch (this.state) {
      case 'patrol': {
        if (aware) {
          // 가까울수록, 눈이 마주칠수록 빨리 알아챈다
          const proximity = 1 + Math.max(0, 1 - perception.distance / p.viewDistance);
          const eye = perception.eyeContact ? p.eyeContactMultiplier : 1;
          this.notice = Math.min(1, this.notice + p.noticeFillPerSec * proximity * eye * dt * (perception.sees ? 1 : 0.5));
        } else {
          this.notice = Math.max(0, this.notice - p.noticeDecayPerSec * dt);
        }
        if (this.notice >= 1) this.enter('notice');
        else this.followPatrol(dt);
        break;
      }
      case 'notice':
        this.speed = 0;
        this.faceTowards(player.feet, dt, 8);
        if (this.stateTimer >= p.noticePauseSec) this.enter('approach');
        break;
      case 'approach': {
        this.lostTimer = aware ? 0 : this.lostTimer + dt;
        if (this.lostTimer >= p.loseSightGiveUpSec || player.inSafe) {
          this.enter('giveUp');
          break;
        }
        const close = perception.distance <= p.talkRange;
        this.stareTimer = close && perception.sees ? this.stareTimer + dt : 0;
        if (this.stareTimer >= p.stareSec) {
          this.enter('talk');
          ctx.bus.emit(p.encounterStimulus, this.id);
          break;
        }
        if (perception.distance > p.talkRange * 0.8) this.moveTo(player.feet, p.approachSpeed, dt);
        else {
          this.speed = 0;
          this.faceTowards(player.feet, dt, 6);
        }
        break;
      }
      case 'talk': {
        this.speed = 0;
        this.faceTowards(player.feet, dt, 6);
        const inRange = perception.distance <= p.lingerRange;
        this.outOfRangeTimer = inRange ? 0 : this.outOfRangeTimer + dt;
        if (this.stateTimer >= p.talkDurationSec || this.outOfRangeTimer > 1) this.enter('giveUp');
        break;
      }
      case 'giveUp':
        this.notice = 0;
        this.followPatrol(dt);
        if (this.stateTimer >= p.cooldownSec) this.enter('patrol');
        break;
    }

    // 지속 자극: 대화 중 머무름, 다가오며 눈 맞춤
    const talking = this.state === 'talk' && perception.distance <= p.lingerRange;
    ctx.bus.setContinuous(this.lingerKey, p.lingerStimulus, talking ? 1 : 0);
    const gazing = (this.state === 'notice' || this.state === 'approach') && perception.eyeContact;
    ctx.bus.setContinuous(this.gazeKey, p.gazeStimulus, gazing ? 1 : 0);

    this.animator.setLocomotion(this.speed);
    this.animator.setTalking(this.state === 'talk');
    this.animator.lookAt(this.state === 'patrol' && !aware ? null : player.eye);
  }

  /** 렌더 프레임: 보간 + 애니메이션 */
  frameUpdate(dt: number, alpha: number): void {
    this.syncVisual(alpha);
    this.animator.update(dt);
  }

  private syncVisual(alpha: number): void {
    this.model.position.lerpVectors(this.prevPosition, this.position, alpha);
    let d = this.yaw - this.prevYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.model.rotation.y = this.prevYaw + d * alpha;
  }

  /** 스테이지 종료·재시작 시 지속 자극 해제 */
  release(bus: StimulusBus): void {
    bus.setContinuous(this.lingerKey, this.profile.lingerStimulus, 0);
    bus.setContinuous(this.gazeKey, this.profile.gazeStimulus, 0);
  }

  private enter(state: NpcState): void {
    this.state = state;
    this.stateTimer = 0;
    this.stareTimer = 0;
    this.lostTimer = 0;
    this.outOfRangeTimer = 0;
    this.path = [];
    this.repathTimer = 0;
    if (state === 'patrol' || state === 'giveUp') this.waypointIndex = this.nearestWaypoint();
  }

  private followPatrol(dt: number): void {
    if (this.patrol.length === 0) {
      this.speed = 0;
      return;
    }
    const target = this.patrol[this.waypointIndex]!;
    if (this.position.distanceTo(target) < 0.2) {
      this.speed = 0;
      this.waitTimer += dt;
      if (this.waitTimer >= this.profile.waypointWaitSec) {
        this.waitTimer = 0;
        this.waypointIndex = (this.waypointIndex + 1) % this.patrol.length;
        this.path = [];
      }
      return;
    }
    this.moveTo(target, this.profile.walkSpeed, dt);
  }

  private nearestWaypoint(): number {
    let best = 0;
    let bestD = Infinity;
    this.patrol.forEach((p, i) => {
      const d = p.distanceTo(this.position);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private moveTo(goal: THREE.Vector3, speed: number, dt: number): void {
    this.repathTimer -= dt;
    if (this.path.length === 0 || this.repathTimer <= 0) {
      this.path = this.computePath(goal);
      this.pathIndex = 0;
      this.repathTimer = REPATH_SEC;
    }
    let budget = speed * dt;
    let moved = 0;
    while (budget > 1e-6 && this.pathIndex < this.path.length) {
      const corner = this.path[this.pathIndex]!;
      const to = corner.clone().sub(this.position);
      const dist = to.length();
      if (dist <= budget) {
        this.position.copy(corner);
        budget -= dist;
        moved += dist;
        this.pathIndex++;
      } else {
        this.position.addScaledVector(to.normalize(), budget);
        moved += budget;
        budget = 0;
      }
    }
    this.speed = moved / dt;
    const next = this.path[this.pathIndex] ?? goal;
    this.faceTowards(next, dt, 8);
  }

  private computePath(goal: THREE.Vector3): THREE.Vector3[] {
    if (!this.nav) return [goal.clone()];
    const { success, path } = this.nav.query.computePath(this.position, goal);
    if (!success || path.length === 0) return [];
    return path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  }

  private snap(point: THREE.Vector3): THREE.Vector3 {
    if (!this.nav) return point.clone();
    const r = this.nav.query.findClosestPoint(point);
    return r.success ? new THREE.Vector3(r.point.x, r.point.y, r.point.z) : point.clone();
  }

  private faceTowards(target: THREE.Vector3, dt: number, rate: number): void {
    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    if (dx * dx + dz * dz < 1e-4) return;
    const desired = Math.atan2(-dx, -dz);
    let d = desired - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * (1 - Math.exp(-rate * dt));
  }

  dispose(): void {
    this.model.removeFromParent();
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
  }
}
