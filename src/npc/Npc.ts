import type { NpcProfile } from '../core/configSchemas';
import { dist, type TileMap, type Vec2 } from '../world/TileMap';
import { angleDiff, angleTo, perceive, type Perception, type PlayerPercept } from './perception';

// NPC 행동 상태 머신 (CLAUDE.md 5.9). 경량 행동 트리 대신 유형별 분기가 있는 상태 머신.
//   Idle/Patrol → Notice → Approach → AttemptTalk → Dialogue / GiveUp
//   Hunter: 알아채면 직선 돌진 / Stalker: 같은 매장 안에서 3m 거리 유지, 3초 응시 시 순간 접근
//   Ally: 다가오지 않고 곁에 있으면 회복 / Pet: 집 안을 어슬렁거림
// 사람은 적이 아니다. 이 코드는 '말을 걸고 싶어 하는 평범한 사람'의 동선을 흉내 낼 뿐이다.

export type NpcState = 'idle' | 'patrol' | 'notice' | 'approach' | 'attemptTalk' | 'dialogue' | 'giveUp' | 'stalk' | 'seated';

export interface NpcSpawn {
  id: string;
  profileId: string;
  profile: NpcProfile;
  pos: Vec2;
  path?: { points: Vec2[]; loop: boolean };
  seated?: boolean;
  /** 이 NPC가 머무는 영역 (Stalker는 이 영역 안에서만 따라온다) */
  areaId: string | null;
}

export interface NpcContext {
  map: TileMap;
  player: PlayerPercept;
  playerAreaId: string | null;
  /** 지금은 누구도 말을 걸 수 없는 상황 (대화 중, 미니게임 중 등) */
  talkBlocked: boolean;
  rng: () => number;
}

export type NpcEvent = { type: 'talk'; npc: Npc; fromBehind: boolean } | { type: 'noticed'; npc: Npc };

export class Npc {
  readonly id: string;
  readonly profileId: string;
  readonly profile: NpcProfile;
  readonly pos: Vec2;
  readonly home: Vec2;
  readonly radius: number;
  readonly areaId: string | null;
  facing = Math.PI / 2;
  state: NpcState;
  notice = 0;
  /** 이번 스텝 지각 결과 */
  percept: Perception = { dist: Infinity, inView: false, heard: false, eyeContact: false };
  /** 플레이어를 바라보고 있는지 (시선 수 집계·홍조 연출) */
  gazing = false;
  speed = 0;
  /** 몸짓 애니메이션용 (끄덕임, 손 내밀기) */
  gesture: 'none' | 'reach' | 'wave' | 'laugh' = 'none';
  cooldown = 0;
  /** 나에 대한 인상이 좋을수록 잘 알아보고 말을 건다 (알아챔 배율, Reputation.warmth) */
  warmth = 1;
  /** 플레이어가 이 NPC를 응시한 누적 시간 (Stalker) */
  staredAt = 0;

  private readonly path?: { points: Vec2[]; loop: boolean };
  private pathIndex = 0;
  private pathDir = 1;
  private wait = 0;
  private stateTime = 0;
  private route: Vec2[] = [];
  private repath = 0;
  private lostSight = 0;
  private stare = 0;
  private readonly events: NpcEvent[] = [];

  constructor(spawn: NpcSpawn) {
    this.id = spawn.id;
    this.profileId = spawn.profileId;
    this.profile = spawn.profile;
    this.pos = { ...spawn.pos };
    this.home = { ...spawn.pos };
    this.path = spawn.path;
    this.areaId = spawn.areaId;
    this.radius = spawn.profile.radius ?? 0.33;
    this.state = spawn.seated ? 'seated' : spawn.path ? 'patrol' : 'idle';
  }

  get type(): NpcProfile['type'] {
    return this.profile.type;
  }

  /** 다가오는 중인지 (위협 태그 강조·발소리) */
  get pursuing(): boolean {
    return this.state === 'approach' || this.state === 'attemptTalk' || this.state === 'notice';
  }

  update(dt: number, ctx: NpcContext): void {
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.gesture = 'none';
    this.speed = 0;
    const p = this.profile;
    const player = ctx.player;

    this.percept = perceive(ctx.map, this.pos, this.facing, p, player);
    const { inView, heard, eyeContact } = this.percept;
    const reachable = !player.unreachable;

    // 알아챔 게이지
    if ((inView || heard) && reachable) {
      // 가까울수록 빨리 알아챈다
      const near = 1.2 - Math.min(1, this.percept.dist / p.viewDistance) * 0.8;
      const mul = (inView ? near : 0.5) * (eyeContact ? p.eyeContactMultiplier : 1) * (player.hidden ? 0.25 : 1);
      this.notice = Math.min(1, this.notice + p.noticeFillPerSec * mul * this.warmth * dt);
    } else {
      this.notice = Math.max(0, this.notice - p.noticeDecayPerSec * dt);
    }
    this.gazing = inView && reachable && this.notice >= 0.35 && this.state !== 'dialogue';
    if (this.gazing && this.state !== 'approach') this.turnToward(angleTo(this.pos, player.pos), dt, 3);

    // Stalker: 플레이어가 이쪽을 응시하는 시간 누적
    if (this.type === 'stalker') {
      const playerLooks = angleDiff(angleTo(player.pos, this.pos), player.facing) < 0.35 && !player.phonePretend && this.percept.dist < 10;
      this.staredAt = playerLooks ? this.staredAt + dt : Math.max(0, this.staredAt - dt * 0.5);
    }

    switch (this.state) {
      case 'seated':
        if (this.gazing) this.gesture = 'none';
        break;
      case 'idle':
      case 'patrol':
        this.wander(dt, ctx);
        this.considerApproach(ctx);
        break;
      case 'stalk':
        this.updateStalk(dt, ctx);
        break;
      case 'notice':
        // 잠깐 멈칫 → 다가옴 (Hunter는 바로 돌진)
        if (this.stateTime >= (this.type === 'hunter' ? 0.15 : 0.6)) this.setState('approach');
        break;
      case 'approach':
        this.updateApproach(dt, ctx);
        break;
      case 'attemptTalk':
        this.updateAttempt(dt, ctx);
        break;
      case 'dialogue':
        this.turnToward(angleTo(this.pos, player.pos), dt, 6);
        if (this.type === 'hunter') this.gesture = 'reach';
        break;
      case 'giveUp':
        this.walkHome(dt, ctx);
        break;
    }
  }

  /** 대화 시작 (세션이 호출) */
  beginDialogue(): void {
    this.setState('dialogue');
  }

  /** 대화 종료: 쿨다운 후 원래 자리로 */
  endDialogue(graceSec?: number): void {
    this.notice = 0;
    this.cooldown = graceSec ?? this.profile.cooldownSec;
    this.staredAt = 0;
    this.setState('giveUp');
  }

  /** 플레이어를 놓침 (세이프 존 잠금 = 추적 초기화) */
  loseTrack(): void {
    if (this.state === 'approach' || this.state === 'attemptTalk' || this.state === 'notice' || this.state === 'stalk') {
      this.notice = 0;
      this.cooldown = Math.max(this.cooldown, this.profile.cooldownSec * 0.5);
      this.setState('giveUp');
    }
  }

  drainEvents(): NpcEvent[] {
    return this.events.splice(0);
  }

  private considerApproach(ctx: NpcContext): void {
    const p = this.profile;
    if (!p.approaches || this.cooldown > 0 || ctx.player.unreachable || ctx.talkBlocked) return;
    if (this.type === 'stalker') {
      if (ctx.playerAreaId && ctx.playerAreaId === this.areaId) this.setState('stalk');
      return;
    }
    if (this.notice >= 1 && this.withinLeash(ctx.player.pos)) {
      this.events.push({ type: 'noticed', npc: this });
      this.setState('notice');
    }
  }

  private updateStalk(dt: number, ctx: NpcContext): void {
    const p = this.profile;
    const player = ctx.player;
    if (ctx.playerAreaId !== this.areaId || player.unreachable) {
      this.setState('giveUp');
      return;
    }
    const d = dist(this.pos, player.pos);
    const keep = p.stalkDistance ?? 3;
    this.turnToward(angleTo(this.pos, player.pos), dt, 4);
    if (d > keep + 0.6) this.moveToward(player.pos, p.walkSpeed * 1.2, dt, ctx);
    // 3초 응시하면 순간 접근 / 오래 따라다니면 결국 말을 건다
    if (!ctx.talkBlocked && this.cooldown <= 0 && (this.staredAt >= (p.stareTriggerSec ?? 3) || this.stateTime > 25)) {
      this.events.push({ type: 'noticed', npc: this });
      this.setState('approach');
    }
  }

  private updateApproach(dt: number, ctx: NpcContext): void {
    const p = this.profile;
    const player = ctx.player;
    if (player.unreachable || ctx.talkBlocked) {
      this.loseTrack();
      return;
    }
    const d = dist(this.pos, player.pos);
    this.lostSight = this.percept.inView || this.percept.heard ? 0 : this.lostSight + dt;
    if (this.lostSight >= p.giveUpSec || !this.withinLeash(player.pos)) {
      this.notice *= 0.3;
      this.cooldown = p.cooldownSec * 0.4;
      this.setState('giveUp');
      return;
    }
    if (d <= p.talkRange) {
      this.setState('attemptTalk');
      return;
    }
    if (this.type === 'hunter') this.gesture = 'reach';
    this.moveToward(player.pos, p.approachSpeed, dt, ctx);
  }

  private updateAttempt(dt: number, ctx: NpcContext): void {
    const p = this.profile;
    const player = ctx.player;
    const d = dist(this.pos, player.pos);
    this.turnToward(angleTo(this.pos, player.pos), dt, 8);
    this.gesture = this.type === 'hunter' ? 'reach' : 'wave';
    if (player.unreachable || ctx.talkBlocked) {
      this.loseTrack();
      return;
    }
    if (d > p.talkRange * 1.7) {
      this.stare = 0;
      this.setState('approach');
      return;
    }
    // 1초 응시(또는 붙잡힘) → 대화. 뒤에서 다가온 경우 어깨 톡톡
    const playerFacesMe = angleDiff(angleTo(player.pos, this.pos), player.facing) < Math.PI / 2;
    this.stare += dt;
    if (this.stare >= p.stareSec || d < 0.9) {
      this.stare = 0;
      this.events.push({ type: 'talk', npc: this, fromBehind: !playerFacesMe });
      this.setState('dialogue');
    }
  }

  private wander(dt: number, ctx: NpcContext): void {
    if (this.type === 'pet') {
      this.petWander(dt, ctx);
      return;
    }
    if (!this.path || this.path.points.length < 2) {
      if (dist(this.pos, this.home) > 0.3) this.moveToward(this.home, this.profile.walkSpeed, dt, ctx);
      return;
    }
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    const target = this.path.points[this.pathIndex]!;
    if (dist(this.pos, target) < 0.3) {
      this.wait = this.profile.waypointWaitSec * (0.6 + ctx.rng() * 0.8);
      const n = this.path.points.length;
      if (this.path.loop) this.pathIndex = (this.pathIndex + 1) % n;
      else {
        if (this.pathIndex + this.pathDir >= n || this.pathIndex + this.pathDir < 0) this.pathDir *= -1;
        this.pathIndex += this.pathDir;
      }
      return;
    }
    this.moveToward(target, this.profile.walkSpeed, dt, ctx);
  }

  private petWander(dt: number, ctx: NpcContext): void {
    const d = dist(this.pos, ctx.player.pos);
    if (d < 6 && d > 1.4 && ctx.playerAreaId === this.areaId) {
      this.moveToward(ctx.player.pos, this.profile.walkSpeed, dt, ctx);
      return;
    }
    if (this.wait > 0) {
      this.wait -= dt;
      return;
    }
    if (this.route.length === 0) {
      this.wait = 2 + ctx.rng() * 4;
      const target = { x: this.home.x + (ctx.rng() - 0.5) * 6, y: this.home.y + (ctx.rng() - 0.5) * 4 };
      if (ctx.map.walkable(Math.floor(target.x), Math.floor(target.y))) this.route = [target];
      return;
    }
    const t = this.route[0]!;
    if (dist(this.pos, t) < 0.3) this.route.shift();
    else this.step(t, this.profile.walkSpeed, dt, ctx);
  }

  private walkHome(dt: number, ctx: NpcContext): void {
    const goal = this.path ? this.path.points[this.pathIndex]! : this.home;
    if (dist(this.pos, goal) < 0.4 || this.stateTime > 30) {
      this.route = [];
      this.setState(this.path ? 'patrol' : 'idle');
      return;
    }
    this.moveToward(goal, this.profile.walkSpeed, dt, ctx);
  }

  private withinLeash(target: Vec2): boolean {
    const leash = this.profile.leash;
    return leash === undefined || dist(this.home, target) <= leash;
  }

  /** A* 경로를 따라 이동 (0.5초마다 재계산) */
  private moveToward(goal: Vec2, speed: number, dt: number, ctx: NpcContext): void {
    this.repath -= dt;
    if (this.repath <= 0 || this.route.length === 0) {
      this.repath = 0.5 + ctx.rng() * 0.2;
      if (ctx.map.lineOfSight(this.pos, goal) && dist(this.pos, goal) < 4) this.route = [goal];
      else this.route = (ctx.map.findPath(this.pos, goal, 6000) ?? [goal]).slice(1);
    }
    let next = this.route[0];
    while (next && dist(this.pos, next) < 0.25 && this.route.length > 1) {
      this.route.shift();
      next = this.route[0];
    }
    if (!next) return;
    this.step(next, speed, dt, ctx);
  }

  private step(target: Vec2, speed: number, dt: number, ctx: NpcContext): void {
    const dx = target.x - this.pos.x;
    const dy = target.y - this.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) return;
    const s = Math.min(d, speed * dt);
    ctx.map.moveCircle(this.pos, (dx / d) * s, (dy / d) * s, this.radius * 0.8);
    this.speed = speed;
    this.turnToward(Math.atan2(dy, dx), dt, 8);
  }

  private turnToward(target: number, dt: number, rate: number): void {
    let d = (target - this.facing) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, rate * dt);
  }

  private setState(s: NpcState): void {
    this.state = s;
    this.stateTime = 0;
    this.stare = 0;
    this.lostSight = 0;
    this.route = [];
  }
}
