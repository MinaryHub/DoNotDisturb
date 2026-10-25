import type { GameConfig } from '../core/config';
import { simConfigOf } from '../core/config';
import type { ConsumableDef, RecoveryEffects, DayDef, HappeningDef, InteractableDef, NpcProfile, PortalDef, SafeDef } from '../core/configSchemas';
import { DialogueBattle, replies, type Reply } from '../sim/DialogueBattle';
import { GameClock, nightRecovery, parseTime, settleDay, type Breakdown, type SettlementLine } from '../sim/DayCycle';
import type { DayReport } from '../sim/DayReport';
import { NO_MODIFIERS, type ChannelModifiers } from '../sim/EnergyModel';
import type { LifeChange, LifeSnapshot, LifeStatId } from '../sim/LifeStats';
import { Phone, applyContactOutcome, type CallHow, type MessageHow } from '../sim/Phone';
import { Simulation, type SimSnapshot } from '../sim/Simulation';
import { Reputation } from '../sim/Reputation';
import { SpeechChallenge } from '../sim/SpeechChallenge';
import { Crowd } from '../npc/Crowd';
import { Npc } from '../npc/Npc';
import { angleDiff, angleTo, type PlayerPercept } from '../npc/perception';
import { dist, inRect, type AreaDef, type Vec2 } from '../world/TileMap';
import { buildWorld, inHide, safeAt, type World } from '../world/World';
import { GrillGame, PIANO_MELODY, PianoGame, WorkGame } from './minigames';
import { composeDay } from './DayComposer';
import { applyMark, marksFor, storyFromSave } from './Story';
import { BusRoute, type BusDir, type BusOnRoad } from './Bus';
import { MonologueDirector } from './Monologue';
import { Objectives } from './Objectives';

// 하루 단위 게임 진행 (DOM·렌더링 없음). 입력(Controls)을 받아 시뮬레이션과 월드를 진행하고,
// 연출 계층은 이 객체의 상태를 읽기만 한다 (CLAUDE.md 8: 연출은 sim을 수정하지 않는다).

export interface Controls {
  move: Vec2;
  sprint: boolean;
  /** 마우스 방향 (라디안). null이면 이동 방향을 본다 */
  aim: number | null;
  interactPressed: boolean;
  interactHeld: boolean;
  earphonesPressed: boolean;
  phonePretend: boolean;
  cover: boolean;
  eyesClosed: boolean;
  maskPressed: boolean;
  /** 소모품 단축키 (0부터, items.json consumables 순서) */
  useItem: number | null;
  reply: Reply | null;
  smile: boolean;
  spacePressed: boolean;
  sos: boolean;
  confirm: boolean;
  accept: boolean;
  decline: boolean;
  textInstead: boolean;
  phoneToggle: boolean;
  /** 폰·상점 목록 위아래 */
  menuNav: -1 | 0 | 1;
  phoneReply: boolean;
  phoneIgnore: boolean;
  note: number | null;
  slot: number | null;
  retry: boolean;
  /** 하루 시작 화면에서 연차 쓰기 */
  leave: boolean;
  /** 미니게임·휴식 그만두기 (Esc) */
  cancel: boolean;
}

export const NO_CONTROLS: Controls = {
  move: { x: 0, y: 0 },
  sprint: false,
  aim: null,
  interactPressed: false,
  interactHeld: false,
  earphonesPressed: false,
  phonePretend: false,
  cover: false,
  eyesClosed: false,
  maskPressed: false,
  useItem: null,
  reply: null,
  smile: false,
  spacePressed: false,
  sos: false,
  confirm: false,
  accept: false,
  decline: false,
  textInstead: false,
  phoneToggle: false,
  menuNav: 0,
  phoneReply: false,
  phoneIgnore: false,
  note: null,
  slot: null,
  retry: false,
  leave: false,
  cancel: false,
};

export interface PlayerState {
  pos: Vec2;
  facing: number;
  moving: boolean;
  running: boolean;
  moveDir: Vec2 | null;
  earphones: boolean;
  phonePretend: boolean;
  cover: boolean;
  eyesClosed: boolean;
  mask: boolean;
  frozen: number;
  /** 계단 후 숨참: 달리기 불가 */
  winded: number;
  hidden: boolean;
  lockedSafe: SafeDef | null;
  safeTime: number;
  knockTimer: number;
  /** consumables: 소모품 id → 개수, items: 장바구니 */
  inventory: { consumables: Record<string, number>; gear: string[]; clothes: boolean; items: string[] };
  walkPhase: number;
  /** 공유 자전거를 타고 있는지 */
  biking: boolean;
}

export type Mode =
  | { kind: 'dayIntro' }
  | { kind: 'free' }
  | { kind: 'dialogue'; battle: DialogueBattle; npc: Npc; pool: string; closer: string | null; closerTime: number; myLine: string | null; myLineTime: number; practice: boolean; smiling: boolean; wrongAge: number }
  | { kind: 'speech'; challenge: SpeechChallenge; speechId: string; time: number }
  /** idle: Space를 누르지 않은 시간 (안내), ledgerFrom: 업무를 시작할 때의 생활 지표 기록 위치 (업무 화면의 '왜 깎였나') */
  | { kind: 'work'; game: WorkGame; idle: number; ledgerFrom: number }
  | { kind: 'piano'; game: PianoGame; doneTime: number }
  | { kind: 'travel'; portal: PortalDef; target: PortalDef; timer: number; total: number }
  | { kind: 'elevator'; phase: 'waiting' | 'closing' | 'riding'; timer: number; from: string; to: string; companion: Npc | null; presses: number }
  /** 마을버스: 정류장에서 기다리다(waiting) 타고 간다(riding). awkward = 아는 사람이 같이 탔다 */
  | { kind: 'bus'; phase: 'waiting' | 'riding'; dir: BusDir; fromX: number; to: string; depart: number; awkward: boolean }
  | { kind: 'selfCheckout'; timer: number; total: number }
  | { kind: 'rest'; what: 'bench' | 'window' | 'books'; time: number }
  | { kind: 'laundry'; time: number }
  | { kind: 'peephole' }
  | { kind: 'priceTag'; progress: number }
  | { kind: 'shop'; shopId: string; cursor: number }
  | { kind: 'seated'; seat: string; grill: GrillGame; time: number; toastDone: boolean; distractedFor: number; laughIn: number; bossCheckIn: number }
  | { kind: 'burnout'; time: number }
  | { kind: 'collapse'; stat: LifeStatId; time: number }
  | { kind: 'night'; breakdown: Breakdown[]; settlement: SettlementLine[]; nextMax: number; report: DayReport; lifeEnd: Record<LifeStatId, number>; moneyEnd: number }
  | { kind: 'final'; reports: DayReport[] };

export interface Qte {
  kind: 'laugh' | 'knock';
  timer: number;
  window: number;
}

export type FxEvent =
  | { type: 'ambush'; stimulusId: string }
  | { type: 'sound'; id: 'doorLock' | 'doorUnlock' | 'knock' | 'doorbell' | 'piano' | 'elevatorDing' | 'chime' | 'sigh' | 'laugh' | 'sizzle' | 'beep' | 'stairs' | 'vibrate' | 'fakeCall'; note?: number }
  | { type: 'toast'; key: string; vars?: Record<string, string | number> }
  | { type: 'rumble' }
  /** 집으로 순간 이동 (화면이 하얗게 번쩍) */
  | { type: 'warp' };

export interface SaveState {
  dayIndex: number;
  life: LifeSnapshot;
  nextMax: number;
  reports: DayReport[];
  /** 산 장비 (우산 등). 날이 바뀌어도 남는다 */
  gear?: string[];
  /** 첫 연습 대화를 마쳤는지 */
  practiced?: boolean;
  /** 이야기 표지·셈 (data/story.json). 그날 아침 기준. 예전 저장은 이름 목록 */
  story?: Record<string, number> | string[];
  /** 이번 주에 쓴 연차 (그날 아침 기준) */
  leaveUsed?: number;
  /** 사람들의 인상 (그날 아침 기준) */
  reputation?: Record<string, number>;
}

const INTERACT_RANGE_EXTRA = 0.2;

export class GameSession {
  readonly world: World;
  readonly sim: Simulation;
  readonly phone: Phone;
  readonly monologue: MonologueDirector;
  /** 사람들이 나를 보는 인상과 사회적 평판 */
  readonly reputation: Reputation;
  /** 마을버스 시간표 (city.json에 노선이 없으면 null) */
  readonly busRoute: BusRoute | null;
  crowd: Crowd;
  clock: GameClock;
  /** 오늘의 하루 (기본 하루 + 작은 사건, DayComposer) */
  day!: DayDef;
  /** 오늘 일어나는 작은 사건 */
  happenings: HappeningDef[] = [];
  /** 조급함 0~1: 달리면 차오르고 걸으면 가라앉는다 */
  hurry = 0;
  /** 지금 주변 군중 밀도 (0~crowdDensity.max) */
  crowdLevel = 0;
  dayIndex = 0;
  objectives!: Objectives;
  npcs: Npc[] = [];
  mode: Mode = { kind: 'dayIntro' };
  qte: Qte | null = null;
  player!: PlayerState;
  homeLocked = false;
  /** 외시경으로 보는 지점 (연출 카메라) */
  viewTarget: Vec2 | null = null;
  area: AreaDef | null = null;
  phoneOpen = false;
  phoneCursor = 0;
  private soakedToday = false;
  /** 오늘 이미 한 생활 행동 */
  private readonly choresDone = new Set<string>();
  /** 이번 프레임 상호작용 안내 */
  prompt: { labelKey: string; at: Vec2 } | null = null;
  rehearsed = false;
  hobbyDone = false;
  calmBuff = false;
  sosUsed = false;
  sanctuaryBroken = 0;
  reports: DayReport[] = [];
  readonly fx: FxEvent[] = [];
  /** 이야기 표지·셈: 지난 날들의 선택이 남긴 것 (data/story.json) */
  story = new Map<string, number>();
  /** 이번 주에 쓴 연차 */
  leaveUsed = 0;
  /** 오늘 연차를 냈는지 */
  onLeave = false;
  /** 생활 지표 변화 중 이미 알린 것 (알림 토스트) */
  private ledgerSeen = 0;
  private readonly lastWhyToast = new Map<string, number>();
  /** 오늘 이미 적용한 하루 한 번 규칙 (story.json marks의 순번) */
  private readonly marksToday = new Set<number>();
  /** 오늘 눈인사를 나눈 사람 */
  private readonly nodded = new Set<string>();
  /** 오늘 "늘 드시던 걸로요?"를 들은 가게 */
  private readonly regularGreeted = new Set<string>();

  private nextMax: number;
  private dayStart!: { life: LifeSnapshot; max: number; story: Record<string, number>; leaveUsed: number; reputation: Record<string, number> };
  private rngState = 12345;
  private hurryNoted = false;
  /** 가진 장비: 하루가 바뀌어도, 다시 해도 남는다 */
  private ownedGear = new Set<string>();
  /** 오늘 상점별로 챙긴 개수 (탕비실 perDay) */
  private readonly shopTaken = new Map<string, number>();
  /** 위안 물건을 오늘 쓴 횟수 */
  private readonly itemUses = new Map<string, number>();
  /** 아이템 효과 지속: 차분함(마음이 더 가라앉음), 스트레스 내성(자극 × scale). 남은 초 */
  buffs = { soothe: { perSec: 0, left: 0 }, resist: { scale: 1, left: 0 } };
  /** 혼자만의 틈: 멈춰 서서 천천히 먹거나 쓰는 중. paused면 누가 보고 있어 손이 멈췄다 */
  itemBreak: { id: string; time: number; dur: number; paused: boolean } | null = null;
  /** 첫 대화는 연습 (규칙을 하나씩 알려 준다) */
  private practiced = false;
  /** 변화 씨앗. 없으면(테스트) 매번 같은 기본 하루 */
  private readonly seed: number | null;
  /** 같은 날을 다시 할 때마다 다른 하루가 되도록 */
  private attempt = 0;
  private firedPhone = new Set<number>();
  private pendingEscalations: string[] = [];
  private personalSpaceCd = 0;
  private ignoredBossMessages = 0;
  private mandatoryRetry: { contact: string; textKey: string; timer: number } | null = null;
  private dinnerSeatTimer = -1;
  private stareTimers = new Map<string, number>();
  private wasPursuing = new Set<string>();
  private lastTier = '';

  constructor(
    readonly cfg: GameConfig,
    save?: SaveState,
    options: { seed?: number; practiced?: boolean } = {},
  ) {
    this.seed = options.seed ?? null;
    if (options.practiced) this.practiced = true;
    this.world = buildWorld(cfg.world, cfg.tiles);
    this.sim = new Simulation(simConfigOf(cfg), cfg.stimuli);
    this.phone = new Phone({ ringSec: 12, replyWaitSec: 25, maxVisible: 4 });
    this.monologue = new MonologueDirector(cfg.monologueTriggers, cfg.monologue, () => this.rng());
    this.crowd = new Crowd(cfg.world.crowdLanes, () => this.rng());
    this.busRoute = cfg.world.bus ? new BusRoute(cfg.world.bus, cfg.balance.bus) : null;
    this.reputation = new Reputation(cfg.reputation);
    this.clock = new GameClock(0);
    this.nextMax = cfg.balance.battery.start;
    if (save) {
      this.dayIndex = Math.min(save.dayIndex, cfg.days.length - 1);
      this.sim.life.restore(save.life);
      this.nextMax = save.nextMax;
      this.reports = save.reports;
      for (const g of save.gear ?? []) this.ownedGear.add(g);
      this.practiced = save.practiced ?? save.dayIndex > 0;
      this.story = storyFromSave(save.story);
      this.leaveUsed = save.leaveUsed ?? 0;
      this.reputation.restore(save.reputation);
    }
    this.startDay(this.dayIndex);
  }

  rng(): number {
    // 결정적 난수 (테스트 재현성)
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  get snapshot(): SimSnapshot {
    return this.sim.snapshot();
  }

  get sanctuary(): boolean {
    return this.homeLocked && this.area?.kind === 'home' && this.sanctuaryBroken <= 0;
  }

  get atHome(): boolean {
    return this.area?.kind === 'home';
  }

  get returning(): boolean {
    return this.objectives.canEndDay;
  }

  saveState(): SaveState {
    return { dayIndex: this.dayIndex, life: this.dayStart.life, nextMax: this.dayStart.max, reports: this.reports, gear: [...this.ownedGear], practiced: this.practiced, story: this.dayStart.story, leaveUsed: this.dayStart.leaveUsed, reputation: this.dayStart.reputation };
  }

  // ───────────────────────── 하루 시작·재시작 ─────────────────────────

  startDay(index: number): void {
    this.dayIndex = index;
    if (this.seed !== null) this.rngState = mix(this.seed, index, this.attempt++);
    const composed = composeDay(this.cfg.days[index]!, this.cfg.happenings, this.seed !== null ? () => this.rng() : null, this.story);
    this.day = composed.day;
    this.happenings = composed.happenings;
    this.sim.life.clearLedger();
    this.ledgerSeen = 0;
    this.lastWhyToast.clear();
    this.dayStart = { life: this.sim.life.snapshot(), max: this.nextMax, story: Object.fromEntries(this.story), leaveUsed: this.leaveUsed, reputation: this.reputation.snapshot() };
    this.reputation.newDay();
    this.onLeave = false;
    this.sim.startDay(this.nextMax);
    this.clock = new GameClock(parseTime(this.day.start));
    this.objectives = new Objectives(this.day);
    this.phone.endDay();
    this.phone.drainEvents();
    // 그날만 생기는 군중 동선까지 포함해 다시 만든다
    this.crowd = new Crowd([...this.cfg.world.crowdLanes, ...(this.day.crowdLanes ?? [])], () => this.rng());
    this.monologue.reset(this.day.id, new Map(this.story));
    this.marksToday.clear();
    this.nodded.clear();
    this.regularGreeted.clear();
    this.firedPhone = new Set();
    this.pendingEscalations = [];
    this.homeLocked = true;
    this.rehearsed = false;
    this.choresDone.clear();
    this.shopTaken.clear();
    this.itemUses.clear();
    this.itemBreak = null;
    this.buffs = { soothe: { perSec: 0, left: 0 }, resist: { scale: 1, left: 0 } };
    this.soakedToday = false;
    this.hurry = 0;
    this.hurryNoted = false;
    this.hobbyDone = false;
    this.calmBuff = false;
    this.sosUsed = false;
    this.sanctuaryBroken = 0;
    this.phoneOpen = false;
    this.qte = null;
    this.viewTarget = null;
    this.ignoredBossMessages = 0;
    this.mandatoryRetry = null;
    this.dinnerSeatTimer = -1;
    this.stareTimers.clear();
    this.wasPursuing.clear();
    const spawn = this.world.spawns[this.day.spawn]!;
    this.player = {
      pos: { ...spawn },
      facing: 0,
      moving: false,
      running: false,
      moveDir: null,
      earphones: false,
      phonePretend: false,
      cover: false,
      eyesClosed: false,
      mask: false,
      frozen: 0,
      winded: 0,
      hidden: false,
      lockedSafe: null,
      safeTime: 0,
      knockTimer: 0,
      inventory: { consumables: {}, gear: [...this.ownedGear], clothes: false, items: [] },
      walkPhase: 0,
      biking: false,
    };
    this.spawnNpcs();
    // 지난 날의 일이 오늘 아침 가방에 남긴 것 (옆집 반찬 등)
    for (const n of this.day.notes ?? []) if (n.give) this.addItem(n.give);
    this.area = this.world.map.areaAt(spawn.x, spawn.y);
    this.mode = { kind: 'dayIntro' };
    this.lastTier = 'stable';
  }

  /** 오늘 연차를 쓸 수 있는지 (그날 허용 + 이번 주 남은 연차) */
  get canTakeLeave(): boolean {
    return !!this.day.leave?.allowed && !this.onLeave && this.leaveUsed < this.cfg.balance.leave.perWeek;
  }

  /** 연차: 회사 일 목표가 빠지고 쉬는 날이 된다. 그만큼 소득·평판이 조금 깎인다 (그날을 다시 하면 아침으로 돌아간다) */
  takeLeave(): void {
    if (!this.canTakeLeave || this.mode.kind !== 'dayIntro') return;
    const leave = this.day.leave!;
    this.onLeave = true;
    this.leaveUsed++;
    if (leave.cost) this.sim.life.apply(leave.cost, 'leave');
    const objectives = this.day.objectives.filter((o) => !o.workday);
    const ids = new Set(objectives.map((o) => o.id));
    this.day = { ...this.day, objectives: objectives.map((o) => (o.requires ? { ...o, requires: o.requires.filter((r) => ids.has(r)) } : o)) };
    this.objectives = new Objectives(this.day);
    this.toast(leave.noteKey);
    this.gameEvent('leave');
  }

  /**
   * 주저앉은 뒤 집 침대에서 다시 일어난다: 시간이 흐르고(respawn.hours), 에너지는 일부만(respawn.battery),
   * 심리 상태·증상은 가라앉은 채로. 목표·생활 지표·소지품은 그대로 이어진다.
   * 일어난 시각이 respawn.latestTime을 넘으면 오늘은 그대로 끝난다 (못 한 필수 목표는 생활 지표 감소).
   */
  respawnHome(): void {
    const r = this.cfg.balance.respawn;
    const wake = this.clock.minutes + r.hours * 60;
    for (const n of this.npcs) if (n.state === 'dialogue') n.endDialogue();
    this.sim.revive(r.battery);
    this.phoneOpen = false;
    this.qte = null;
    this.viewTarget = null;
    this.hurry = 0;
    const p = this.player;
    Object.assign(p, { frozen: 0, winded: 0, lockedSafe: null, hidden: false, phonePretend: false, cover: false, eyesClosed: false, moving: false, running: false, moveDir: null, biking: false });
    const bed = this.world.interactables.find((i) => i.kind === 'bed');
    const home = bed ? { x: bed.at[0], y: bed.at[1] + 1.2 } : this.world.spawns[this.day.spawn]!;
    this.teleport({ ...home });
    this.area = this.world.map.areaAt(p.pos.x, p.pos.y);
    this.homeLocked = true;
    this.mode = { kind: 'free' };
    const latest = parseTime(r.latestTime);
    if (wake >= latest) {
      this.clock.skipTo(latest);
      for (const o of this.objectives.list) if (o.def.mandatory && !o.done && !o.missed) this.sim.life.apply(this.cfg.life.rewards.mandatorySkipped, 'mandatorySkipped', o.def.textKey);
      this.toast('respawn.late');
      this.endDay();
      return;
    }
    this.clock.skipTo(wake);
    this.toast('respawn.home');
    this.gameEvent('respawn');
  }

  /** 실패 후 오늘 다시 */
  retryDay(): void {
    this.sim.life.restore(this.dayStart.life);
    this.nextMax = this.dayStart.max;
    this.story = storyFromSave(this.dayStart.story);
    this.leaveUsed = this.dayStart.leaveUsed;
    this.reputation.restore(this.dayStart.reputation);
    this.startDay(this.dayIndex);
  }

  /** 처음부터 */
  static newGame(cfg: GameConfig): GameSession {
    return new GameSession(cfg);
  }

  private spawnNpcs(): void {
    this.npcs = [];
    for (const n of this.day.npcs) {
      const base = this.cfg.npcProfiles[n.profile]!;
      const profile = n.dialogue ? { ...base, dialogue: n.dialogue } : base;
      const pos = this.world.spawns[n.at]!;
      this.npcs.push(
        new Npc({
          id: n.id,
          profileId: n.profile,
          profile,
          pos,
          path: n.path ? this.world.paths[n.path] : undefined,
          seated: n.seated,
          areaId: this.world.map.areaAt(pos.x, pos.y)?.id ?? null,
        }),
      );
      this.npcs.at(-1)!.warmth = this.reputation.warmth(this.reputation.personOfNpc(n.id));
    }
  }

  /** NPC가 지금 시각에 활동 중인지 */
  npcActive(npc: Npc): boolean {
    const def = this.day.npcs.find((n) => n.id === npc.id);
    if (!def) return false;
    const m = this.clock.minutes;
    if (def.from && m < parseTime(def.from)) return false;
    if (def.to && m >= parseTime(def.to) && npc.state !== 'dialogue') return false;
    return true;
  }

  activeNpcs(): Npc[] {
    return this.npcs.filter((n) => this.npcActive(n));
  }

  // ───────────────────────── 메인 스텝 ─────────────────────────

  step(dt: number, c: Controls): void {
    switch (this.mode.kind) {
      case 'dayIntro':
        if (c.leave) this.takeLeave();
        if (c.confirm) {
          this.mode = { kind: 'free' };
          this.gameEvent(`dayStart:${this.day.id}`);
          for (const h of this.happenings) this.gameEvent(`happening:${h.id}`);
        }
        return;
      case 'night':
        if (c.confirm) this.advanceDay();
        return;
      case 'final':
        if (c.retry) {
          this.sim.life.restore({ values: { ...this.cfg.life.stats.start }, money: this.cfg.life.stats.startMoney, avoidCounts: {} });
          this.reports = [];
          this.story.clear();
          this.leaveUsed = 0;
          this.reputation.reset();
          this.nextMax = this.cfg.balance.battery.start;
          this.startDay(0);
        }
        return;
      case 'burnout':
        // 에너지 0: 흐물흐물 주저앉은 뒤, 집에서 다시 일어난다
        this.mode.time += dt;
        if ((c.confirm || c.retry) && this.mode.time > 2) this.respawnHome();
        return;
      case 'collapse':
        this.mode.time += dt;
        if (c.retry && this.mode.time > 1) this.retryDay();
        return;
    }

    const minutesPerSec = this.mode.kind === 'seated' && this.day.dinner ? this.day.dinner.minutesPerSecond : this.cfg.balance.clock.minutesPerSecond;
    this.clock.advance(dt, minutesPerSec);
    this.sanctuaryBroken = Math.max(0, this.sanctuaryBroken - dt);
    this.personalSpaceCd = Math.max(0, this.personalSpaceCd - dt);

    this.updatePlayerToggles(c);
    this.updateMode(dt, c);
    if (this.stopped()) return;
    this.updateItemBreak(dt, c);
    this.updateBuffs(dt);
    this.updatePhone(dt, c);
    this.updateWorld(dt);
    this.updateSim(dt);
    this.updateMonologue(dt);
    this.announceLifeChanges();
  }

  /** 생활 지표가 바뀐 이유 한 줄 (화면·밤 정산에서 쓴다) */
  lifeWhyText(c: LifeChange): string {
    const who = c.who ? (this.cfg.life.contacts[c.who] ? this.cfg.text[this.cfg.life.contacts[c.who]!.nameKey] : this.cfg.text[c.who]) ?? c.who : '';
    const t = this.cfg.text[`why.${c.why}`] ?? this.cfg.text['why.other'] ?? c.why;
    return t.replaceAll('{who}', who);
  }

  /** 생활 지표가 바뀌면 그 자리에서 이유를 알린다: 깎이면 늘, 오르면 크게 오를 때만. 같은 이유는 잠깐 묶는다 */
  private announceLifeChanges(): void {
    const ledger = this.sim.life.ledger;
    const now = this.sim.snapshot().time;
    for (; this.ledgerSeen < ledger.length; this.ledgerSeen++) {
      const c = ledger[this.ledgerSeen]!;
      if (c.delta > -1 && c.delta < 4) continue;
      const key = `${c.stat}:${c.why}:${c.who ?? ''}`;
      if (now - (this.lastWhyToast.get(key) ?? -99) < 3) continue;
      this.lastWhyToast.set(key, now);
      this.toast(c.delta < 0 ? 'why.toast.down' : 'why.toast.up', { stat: this.cfg.text[`life.${c.stat}`] ?? c.stat, why: this.lifeWhyText(c) });
    }
  }

  /** 실패·밤 화면으로 넘어가 하루 진행이 멈췄는지 (updateMode 안에서 모드가 바뀔 수 있다) */
  private stopped(): boolean {
    const k: Mode['kind'] = this.mode.kind;
    return k === 'burnout' || k === 'night' || k === 'collapse';
  }

  // ───────────────────────── 플레이어 ─────────────────────────

  private updatePlayerToggles(c: Controls): void {
    const p = this.player;
    const modal = this.isModal();
    if (c.earphonesPressed) p.earphones = !p.earphones;
    if (c.maskPressed) p.mask = !p.mask;
    p.phonePretend = c.phonePretend && !modal && !c.cover;
    p.cover = c.cover && this.mode.kind !== 'speech';
    p.eyesClosed = c.eyesClosed && !modal;
    if (c.phoneToggle && p.biking) this.toast('bike.noPhone');
    else if (c.phoneToggle && !p.cover && this.mode.kind !== 'speech') {
      this.phoneOpen = !this.phoneOpen;
      this.phoneCursor = 0;
    }
    if (p.cover) this.phoneOpen = false;
    if (!modal && !p.biking) {
      // 단축키 1~8 = 가방 칸 순서
      const id = c.useItem !== null ? this.bagSlots()[c.useItem] : undefined;
      const def = id ? this.consumable(id) : undefined;
      if (def) this.useItem(def);
    }
  }

  /** 이동이 막히는 모드 */
  isModal(): boolean {
    const k = this.mode.kind;
    return k !== 'free' && k !== 'peephole';
  }

  private movePlayer(dt: number, c: Controls): void {
    const p = this.player;
    const sk = this.cfg.skills;
    p.frozen = Math.max(0, p.frozen - dt);
    p.winded = Math.max(0, p.winded - dt);
    let mx = c.move.x;
    let my = c.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const canMove = p.frozen <= 0 && !this.phoneOpen && !p.lockedSafe && this.mode.kind === 'free';
    p.moving = canMove && len > 0.01;
    p.running = p.moving && c.sprint && p.winded <= 0 && !p.phonePretend && !p.biking;
    let speed = p.running ? this.cfg.player.runSpeed : this.cfg.player.walkSpeed;
    if (p.biking) speed *= this.cfg.balance.bike.speedMultiplier;
    if (p.phonePretend) speed *= sk.phonePretend.moveMultiplier;
    if (p.cover) speed *= sk.coverCheeks.moveMultiplier;
    if (p.eyesClosed) speed *= sk.closeEyes.moveMultiplier;
    // 바닥이 미는 힘 (무빙워크)
    const tile = this.world.map.def(Math.floor(p.pos.x), Math.floor(p.pos.y));
    const push = tile.push;
    if (p.moving) {
      this.world.map.moveCircle(p.pos, mx * speed * dt, my * speed * dt, this.cfg.player.radius);
      p.moveDir = { x: mx, y: my };
      p.walkPhase += dt * speed * 2.2;
    } else p.moveDir = null;
    // 조급함: 서두를수록 마음도 급해진다. 멈춰도 바로 풀리지 않는다
    const hc = this.cfg.balance.hurry;
    this.hurry = p.running ? Math.min(1, this.hurry + dt / hc.fullAfterSec) : Math.max(0, this.hurry - dt / hc.calmSec);
    // 서두르는 동안(조급함 절반 이상)은 긴장이 가라앉지 않는다
    if (this.hurry > 0) this.sim.energy.addMood('tension', this.hurry * hc.stressPerSec * dt, this.hurry > 0.5);
    if (this.hurry >= 1 && !this.hurryNoted) {
      this.hurryNoted = true;
      this.gameEvent('hurry:full');
    } else if (this.hurry <= 0) this.hurryNoted = false;
    if (push && !p.lockedSafe && this.mode.kind === 'free') this.world.map.moveCircle(p.pos, push[0] * dt, push[1] * dt, this.cfg.player.radius);

    // 바라보는 방향: 마우스, 없으면 이동 방향. 편두통이면 시선이 흔들린다
    let target = c.aim ?? (p.moving ? Math.atan2(my, mx) : p.facing);
    const migraine = this.sim.somatic.intensity('migraine');
    if (migraine > 0.2) target += Math.sin(this.sim.snapshot().time * 3.1) * migraine * 0.35;
    p.facing = target;
  }

  // ───────────────────────── 모드별 ─────────────────────────

  private updateMode(dt: number, c: Controls): void {
    const m = this.mode;
    switch (m.kind) {
      case 'free':
      case 'peephole':
        this.movePlayer(dt, c);
        this.updateFree(dt, c);
        break;
      case 'dialogue':
        this.updateDialogue(dt, c, m);
        break;
      case 'speech':
        this.updateSpeech(dt, c, m);
        break;
      case 'work':
        this.updateWork(dt, c, m);
        break;
      case 'piano':
        if (m.game.done) {
          m.doneTime += dt;
          if (m.doneTime > 1.6 || c.interactPressed) this.finishPiano();
        } else if (c.cancel) this.mode = { kind: 'free' };
        else if (c.note !== null) {
          const ok = m.game.press(c.note);
          this.fx.push({ type: 'sound', id: 'piano', note: c.note + (ok ? 0 : 0.5) });
        }
        break;
      case 'travel':
        m.timer += dt;
        if (m.timer >= m.total) {
          this.teleport({ x: m.target.arrive[0], y: m.target.arrive[1] });
          if (m.portal.kind === 'stairs') this.player.winded = 10;
          this.mode = { kind: 'free' };
        }
        break;
      case 'elevator':
        this.updateElevator(dt, c, m);
        break;
      case 'bus':
        this.updateBus(c, m);
        break;
      case 'selfCheckout':
        m.timer += dt;
        if (Math.floor(m.timer * 2) !== Math.floor((m.timer - dt) * 2)) this.fx.push({ type: 'sound', id: 'beep' });
        if (m.timer >= m.total) {
          this.completeCheckout();
          this.mode = { kind: 'free' };
        }
        break;
      case 'rest': {
        m.time += dt;
        const r = this.cfg.balance.recovery;
        this.sim.energy.recover((m.what === 'bench' ? r.benchPerSec : m.what === 'books' ? r.booksPerSec : r.windowPerSec) * dt);
        if (m.what === 'books') this.sim.energy.calm(r.booksStressPerSec * dt);
        if (m.what === 'window' && m.time > 4) this.calmBuff = true;
        if (c.interactPressed || c.cancel || Math.hypot(c.move.x, c.move.y) > 0.1) this.mode = { kind: 'free' };
        break;
      }
      case 'priceTag': {
        const clerk = this.npcs.find((n) => n.type === 'stalker' && this.npcActive(n));
        const watched = clerk ? clerk.gazing || clerk.pursuing : false;
        if (c.smile && !watched) m.progress += dt / 2.5;
        if (c.smile && watched && clerk) {
          this.toast('priceTag.caught');
          this.startDialogue(clerk, false);
          return;
        }
        if (m.progress >= 1) {
          this.toast('priceTag.done');
          this.mode = { kind: 'free' };
        } else if (c.interactPressed || c.cancel || Math.hypot(c.move.x, c.move.y) > 0.1) this.mode = { kind: 'free' };
        break;
      }
      case 'seated':
        this.updateSeated(dt, c, m);
        break;
      case 'shop':
        this.updateShop(c, m);
        break;
      case 'laundry': {
        // 세탁이 끝날 때까지 기다린다. 자리를 뜨면 처음부터
        m.time += dt;
        const l = this.cfg.balance.laundry;
        if (m.time >= l.waitSec) {
          this.sim.life.apply({ essentials: l.essentials }, 'laundry');
          this.clock.advance(l.minutes, 1);
          this.toast('laundry.done');
          this.gameEvent('done:laundry');
          this.mode = { kind: 'free' };
        } else if (c.cancel || Math.hypot(c.move.x, c.move.y) > 0.1) {
          this.toast('laundry.cancel');
          this.mode = { kind: 'free' };
        }
        break;
      }
    }
  }

  private updateFree(dt: number, c: Controls): void {
    const p = this.player;
    // 외시경: 누르고 있는 동안만
    if (this.mode.kind === 'peephole') {
      if (!c.interactHeld) {
        this.mode = { kind: 'free' };
        this.viewTarget = null;
      }
      return;
    }
    this.updateQte(dt, c);

    // 세이프 존 (화장실 칸·피팅룸)
    const safe = safeAt(this.world, p.pos);
    if (p.lockedSafe) {
      p.safeTime += dt;
      const s = p.lockedSafe;
      if (s.kind === 'fitting' && !this.objectives.isDone('tryOn') && p.inventory.clothes && p.safeTime > 3) this.gameEvent('tryOn');
      if (p.safeTime >= s.noiseAfterSec) {
        p.knockTimer -= dt;
        if (p.knockTimer <= 0) {
          p.knockTimer = this.cfg.balance.safe.knockRepeatSec;
          this.sim.bus.emit('knock');
          this.fx.push({ type: 'sound', id: 'knock' });
          this.gameEvent('safe:knock');
          if (s.kind === 'fitting') this.qte = { kind: 'knock', timer: 0, window: this.cfg.balance.safe.fittingAnswerSec };
        }
      }
      if (c.interactPressed) {
        p.lockedSafe = null;
        this.toast('interact.unlockStall');
      }
      this.prompt = { labelKey: 'interact.unlockStall', at: p.pos };
      return;
    }

    // 상호작용 대상
    const target = this.nearestInteractable();
    this.prompt = target ? { labelKey: target.labelKey, at: target.at } : null;
    if (safe && !p.lockedSafe && !target) this.prompt = { labelKey: 'interact.lockStall', at: p.pos };
    if (!c.interactPressed) return;
    if (this.sim.somatic.slips(this.rng())) {
      this.toast('slip');
      return;
    }
    if (target) this.interact(target);
    else if (safe) {
      p.lockedSafe = safe;
      p.safeTime = 0;
      p.knockTimer = 0;
      for (const n of this.npcs) n.loseTrack();
      this.toast('safe.locked');
      this.gameEvent('safe:lock');
    }
  }

  // ───────────────────────── 상호작용 ─────────────────────────

  private nearestInteractable(): (Pick<InteractableDef, 'labelKey' | 'kind'> & { at: Vec2; def?: InteractableDef; portal?: PortalDef; npc?: Npc }) | null {
    const p = this.player.pos;
    const range = this.cfg.player.interactRange + INTERACT_RANGE_EXTRA;
    let best: ReturnType<GameSession['nearestInteractable']> = null;
    let bestD = range;
    for (const it of this.world.interactables) {
      const at = { x: it.at[0], y: it.at[1] };
      const d = dist(at, p);
      if (d >= bestD) continue;
      if (it.kind === 'doorLock' && !this.atHome) continue;
      bestD = d;
      best = { kind: it.kind, labelKey: it.kind === 'doorLock' && this.homeLocked ? 'interact.doorUnlock' : (this.day.interactAt?.[it.id]?.labelKey ?? it.labelKey), at, def: it };
    }
    for (const portal of this.world.portals) {
      const at = { x: portal.at[0], y: portal.at[1] };
      const d = dist(at, p);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'flavor', labelKey: portal.labelKey, at, portal };
      }
    }
    for (const npc of this.activeNpcs()) {
      if (npc.type !== 'ally' && npc.type !== 'pet') continue;
      const d = dist(npc.pos, p);
      if (d < bestD + 0.4) {
        bestD = d;
        best = { kind: 'flavor', labelKey: npc.type === 'pet' ? 'interact.pet' : 'interact.talkAlly', at: npc.pos, npc };
      }
    }
    return best;
  }

  private interact(target: NonNullable<ReturnType<GameSession['nearestInteractable']>>): void {
    // 자전거는 대여소에 반납하거나, 다른 걸 하려면 그 자리에 세운다
    if (this.player.biking && target.def?.kind !== 'bikeDock') this.parkBike('bike.parked');
    if (target.portal) {
      this.startTravel(target.portal);
      return;
    }
    if (target.npc) {
      if (target.npc.type === 'pet') this.petCat();
      else this.startDialogue(target.npc, false);
      return;
    }
    const it = target.def!;
    const blocked = this.day.blocked?.find((b) => b.interactable === it.id);
    if (blocked) {
      this.toast(blocked.toastKey);
      return;
    }
    const r = this.cfg.balance.recovery;
    const life = this.sim.life;
    const canEndDay = this.objectives.canEndDay;
    this.gameEvent(`interact:${it.id}`);
    switch (it.kind) {
      case 'bed':
        if (canEndDay) this.endDay();
        else this.toast('interact.bed.notYet');
        break;
      case 'piano':
        this.mode = { kind: 'piano', game: new PianoGame(PIANO_MELODY), doneTime: 0 };
        break;
      case 'window':
        this.mode = { kind: 'rest', what: 'window', time: 0 };
        this.toast('window.done');
        break;
      case 'bench':
        this.mode = { kind: 'rest', what: 'bench', time: 0 };
        this.toast('bench.done');
        break;
      case 'drip':
        this.addItem('coffee');
        this.clock.advance(10, 1);
        this.toast('drip.done');
        break;
      case 'fridge':
        if (life.get('essentials') > 10) {
          this.sim.energy.recover(r.homeMeal);
          life.apply({ essentials: this.cfg.life.rewards.homeMealEssentials }, 'homeMeal');
          this.toast('fridge.done');
        } else this.toast('fridge.empty');
        break;
      case 'sink':
        this.sim.somatic.clearAll();
        this.sim.energy.calm(r.washStressRelief);
        this.toast('sink.done');
        break;
      case 'mirror':
        this.rehearsed = true;
        this.toast('mirror.done');
        break;
      case 'doorLock':
        this.homeLocked = !this.homeLocked;
        this.fx.push({ type: 'sound', id: this.homeLocked ? 'doorLock' : 'doorUnlock' });
        this.toast(this.homeLocked ? 'doorLock.locked' : 'doorLock.unlocked');
        if (this.homeLocked) this.gameEvent('home:lock');
        break;
      case 'peephole': {
        this.mode = { kind: 'peephole' };
        const hall = this.world.map.area('apt3f')!;
        this.viewTarget = { x: hall.rect[0] + 10, y: hall.rect[1] + 2.5 };
        const busy = this.activeNpcs().some((n) => inRect(hall.rect, n.pos.x, n.pos.y) && n.type !== 'pet');
        this.gameEvent(busy ? 'peephole:busy' : 'peephole:clear');
        break;
      }
      case 'elevator':
        this.callElevator(it);
        break;
      case 'busStop':
        this.waitBus(it);
        break;
      case 'bikeDock':
        if (this.player.biking) this.parkBike('bike.returned');
        else if (this.pay(this.cfg.balance.bike.fare)) {
          this.player.biking = true;
          this.toast('bike.rent', { fare: this.cfg.balance.bike.fare.toLocaleString(this.cfg.lang === 'en' ? 'en-US' : 'ko-KR') });
          this.gameEvent('bike:ride');
        }
        break;
      case 'flavor': {
        const mono = this.day.interactAt?.[it.id]?.monologue ?? it.monologue;
        if (mono) this.monologue.say(mono);
        break;
      }
      case 'desk':
        if (this.objectiveAvailable('done:work') && this.day.work) {
          const w = this.day.work;
          this.mode = { kind: 'work', game: new WorkGame(w.tasks, w.focusPerSec, w.pingEverySec, w.pingTimeoutSec, () => this.rng()), idle: 0, ledgerFrom: this.sim.life.ledger.length };
        } else this.toast('interact.bed.notYet');
        break;
      case 'speech': {
        const speechId = this.day.interactAt?.[it.id]?.speech ?? it.speech!;
        const sp = this.cfg.speeches[speechId]!;
        if (this.objectiveAvailable(sp.objectiveEvent) || sp.anytime) this.startSpeech(speechId);
        else this.toast('interact.bed.notYet');
        break;
      }
      case 'coldDrink':
        if (this.pay(it.price ?? 0)) {
          // 무료(탕비실 정수기)는 그 자리에서 마시고, 사 온 것은 들고 다닌다
          if ((it.price ?? 0) === 0) this.applyEffects(this.consumable('coldDrink')!.effects);
          else this.addItem('coldDrink');
          this.toast('coldDrink.done');
        }
        break;
      case 'shop':
        this.mode = { kind: 'shop', shopId: it.shop!, cursor: 0 };
        break;
      case 'chore': {
        const ch = this.cfg.chores[it.chore!]!;
        if (this.choresDone.has(it.chore!)) {
          this.toast('chore.already');
          break;
        }
        this.choresDone.add(it.chore!);
        this.applyEffects(ch.effects);
        if (ch.life) this.sim.life.apply(ch.life, 'chore', ch.toastKey);
        this.clock.advance(ch.minutes, 1);
        this.toast(ch.toastKey);
        this.gameEvent(`chore:${it.chore!}`);
        break;
      }
      case 'laundry':
        this.mode = { kind: 'laundry', time: 0 };
        this.toast('laundry.start');
        break;
      case 'browse':
        this.mode = { kind: 'rest', what: 'books', time: 0 };
        this.toast('browse.start');
        break;
      case 'soloMeal':
        if (this.pay(it.price ?? 0)) {
          this.sim.energy.recover(r.soloMeal);
          this.clock.advance(30, 1);
          this.toast('soloMeal.done');
        }
        break;
      case 'martItem': {
        const inv = this.player.inventory;
        if (inv.items.includes(it.item!)) {
          this.toast('martItem.already');
          break;
        }
        inv.items.push(it.item!);
        this.toast('martItem.done', { item: this.cfg.text[`martItem.${it.item}`] ?? it.item!, n: inv.items.length });
        this.gameEvent('pick:martItem');
        break;
      }
      case 'checkout':
        if (!this.objectiveAvailable('done:checkout')) {
          this.toast('interact.bed.notYet');
          break;
        }
        if (it.mode === 'self') {
          this.mode = { kind: 'selfCheckout', timer: 0, total: 22 };
          this.toast('checkout.self.waiting');
        } else this.startSpeech('checkoutNormal');
        break;
      case 'priceTag':
        this.mode = { kind: 'priceTag', progress: 0 };
        this.toast('priceTag.hint');
        break;
      case 'clothesPick':
        this.player.inventory.clothes = true;
        this.toast('clothesPick.done');
        break;
      case 'seat':
        this.takeSeat(it.seat ?? 'middle');
        break;
    }
  }

  private objectiveAvailable(event: string): boolean {
    return this.objectives.list.some((o) => o.def.on === event && this.objectives.available(o));
  }

  private pay(price: number): boolean {
    if (price <= 0) return true;
    if (this.sim.life.spend(price)) return true;
    this.toast('noMoney');
    return false;
  }

  private consumable(id: string): ConsumableDef | undefined {
    return this.cfg.items.consumables.find((d) => d.id === id);
  }

  /** 가방에 넣는다. 가득 차면 false (소모품은 합쳐서 items.bagMax개까지) */
  private addItem(id: string): boolean {
    const inv = this.player.inventory.consumables;
    if (this.bagCount() >= this.cfg.items.bagMax) {
      this.toast('bag.full');
      return false;
    }
    inv[id] = (inv[id] ?? 0) + 1;
    return true;
  }

  /** 가방 칸: 든 순서대로 소모품 id (단축키 1~8, 메모 표시) */
  bagSlots(): string[] {
    return Object.entries(this.player.inventory.consumables)
      .filter(([, n]) => n > 0)
      .map(([id]) => id);
  }

  /** 상점 품목을 오늘 몇 개 더 챙길 수 있는지 (perDay 없으면 무제한) */
  shopLeft(shopId: string, item: string): number {
    const entry = this.cfg.items.shops[shopId]?.stock.find((e) => e.item === item);
    if (!entry?.perDay) return Infinity;
    return entry.perDay - (this.shopTaken.get(`${shopId}:${item}`) ?? 0);
  }

  bagCount(): number {
    return Object.values(this.player.inventory.consumables).reduce((a, b) => a + b, 0);
  }

  private useItem(def: ConsumableDef): void {
    const inv = this.player.inventory.consumables;
    if ((inv[def.id] ?? 0) <= 0) {
      this.toast('use.none');
      return;
    }
    if (this.itemBreak) return;
    if (def.usesPerDay && this.usesLeft(def.id) <= 0) {
      this.toast('use.enoughToday');
      return;
    }
    if (def.usesPerDay) this.itemUses.set(def.id, (this.itemUses.get(def.id) ?? 0) + 1);
    else inv[def.id]!--;
    if (!def.breakSec) {
      this.applyEffects(def.effects);
      this.toast(def.useKey);
      this.applyLasting(def.effects);
      return;
    }
    // 혼자만의 틈: 멈춰 서서 천천히. 효과는 그동안 나눠 찬다
    this.itemBreak = { id: def.id, time: 0, dur: def.breakSec, paused: false };
    this.toast(def.usesPerDay ? 'break.startComfort' : 'break.startFood', { item: this.cfg.text[def.nameKey] ?? def.id });
  }

  /** 위안 물건을 오늘 몇 번 더 쓸 수 있는지 (소모품은 Infinity) */
  usesLeft(id: string): number {
    const per = this.consumable(id)?.usesPerDay;
    return per ? per - (this.itemUses.get(id) ?? 0) : Infinity;
  }

  private updateItemBreak(dt: number, c: Controls): void {
    const b = this.itemBreak;
    if (!b) return;
    const def = this.consumable(b.id)!;
    // 움직이거나, 말을 걸려 오거나, 폰을 열면 그만둔다 (먹던 만큼만 남는다)
    if (this.mode.kind !== 'free' || this.phoneOpen || Math.hypot(c.move.x, c.move.y) > 0.1) {
      this.itemBreak = null;
      this.toast(this.mode.kind === 'dialogue' ? 'break.interrupted' : 'break.stopped');
      return;
    }
    const watched = !!def.quiet && (this.gazeCount() > 0 || this.crowd.countNear(this.player.pos, 3) > 0);
    if (watched && !b.paused) this.toast('break.watched');
    b.paused = watched;
    if (watched) return;
    const k = Math.min(dt, b.dur - b.time) / b.dur;
    b.time += dt;
    const e = def.effects;
    this.applyEffects({ battery: (e.battery ?? 0) * k, stress: (e.stress ?? 0) * k, flush: (e.flush ?? 0) * k, migraine: (e.migraine ?? 0) * k });
    if (b.time >= b.dur) {
      this.itemBreak = null;
      this.toast(def.useKey);
      this.applyLasting(def.effects);
    }
  }

  /** 지속 효과와 순간 이동 (먹기를 마쳤을 때) */
  private applyLasting(e: RecoveryEffects): void {
    if (e.soothe) this.buffs.soothe = { perSec: e.soothe.perSec, left: e.soothe.sec };
    if (e.resist) this.buffs.resist = { scale: e.resist.scale, left: e.resist.sec };
    if (e.warpHome) this.warpHome();
  }

  /** "모두 사라져 버려~": 주변의 자극에서 곧장 집으로. 문은 잠겨 있고, 시간은 그대로 */
  private warpHome(): void {
    for (const n of this.npcs) if (n.state === 'dialogue') n.endDialogue();
    const bed = this.world.interactables.find((i) => i.kind === 'bed');
    const home = bed ? { x: bed.at[0], y: bed.at[1] + 1.2 } : this.world.spawns[this.day.spawn]!;
    Object.assign(this.player, { frozen: 0, lockedSafe: null, hidden: false, phonePretend: false, cover: false, eyesClosed: false, moving: false, running: false, moveDir: null, biking: false });
    this.phoneOpen = false;
    this.hurry = 0;
    this.teleport({ ...home });
    this.area = this.world.map.areaAt(home.x, home.y);
    this.homeLocked = true;
    this.mode = { kind: 'free' };
    this.fx.push({ type: 'warp' });
    this.fx.push({ type: 'sound', id: 'doorLock' });
    this.gameEvent('warp:home');
  }

  /** 아이템 지속 효과의 시간 흐름 */
  private updateBuffs(dt: number): void {
    const b = this.buffs;
    if (b.soothe.left > 0) {
      b.soothe.left = Math.max(0, b.soothe.left - dt);
      this.sim.energy.calm(b.soothe.perSec * dt);
    }
    if (b.resist.left > 0) {
      b.resist.left = Math.max(0, b.resist.left - dt);
      if (b.resist.left === 0) this.toast('buff.resist.end');
    }
  }

  get raining(): boolean {
    return this.day.weather === 'rain';
  }

  private applyEffects(e: RecoveryEffects): void {
    if (e.battery) this.sim.energy.recover(e.battery);
    if (e.stress) this.sim.energy.calm(e.stress);
    if (e.flush) this.sim.somatic.relieve('flush', e.flush);
    if (e.migraine) this.sim.somatic.relieve('migraine', e.migraine);
  }

  /** 주문: 단골이 되기 전엔 짧은 주문 대화가 자극, 단골이면 "늘 드시던 걸로요?" (그날 처음 한 번) */
  private orderAt(shopId: string): void {
    const reg = this.cfg.items.shops[shopId]?.regular;
    if (reg) {
      if ((this.story.get(reg.counter) ?? 0) < reg.minVisits) this.sim.bus.emit(reg.orderStimulus, shopId);
      else if (!this.regularGreeted.has(shopId)) {
        this.regularGreeted.add(shopId);
        this.toast(reg.greetKey);
      }
    }
    this.gameEvent(`bought:${shopId}`);
  }

  private updateShop(c: Controls, m: Extract<Mode, { kind: 'shop' }>): void {
    const stock = this.cfg.items.shops[m.shopId]!.stock;
    if (c.menuNav !== 0) m.cursor = (m.cursor + c.menuNav + stock.length) % stock.length;
    if (c.cancel || c.phoneIgnore) {
      this.mode = { kind: 'free' };
      return;
    }
    if (!(c.interactPressed || c.phoneReply)) return;
    const entry = stock[m.cursor]!;
    const gear = this.cfg.items.gear.find((g) => g.id === entry.item);
    if (gear) {
      // 우산 같은 물건은 하나면 충분하다
      if (this.player.inventory.gear.includes(gear.id)) {
        this.toast('shop.owned');
        return;
      }
      if (!this.pay(entry.price)) return;
      this.player.inventory.gear.push(gear.id);
      this.ownedGear.add(gear.id);
      this.toast('shop.bought', { item: this.cfg.text[gear.nameKey] ?? gear.id });
      return;
    }
    if (this.bagCount() >= this.cfg.items.bagMax) {
      this.toast('bag.full');
      return;
    }
    if (this.shopLeft(m.shopId, entry.item) <= 0) {
      this.toast('shop.soldOut');
      return;
    }
    if (entry.price > 0 && !this.pay(entry.price)) return;
    if (entry.life) this.sim.life.apply(entry.life, 'shop');
    this.addItem(entry.item);
    this.orderAt(m.shopId);
    const key = `${m.shopId}:${entry.item}`;
    this.shopTaken.set(key, (this.shopTaken.get(key) ?? 0) + 1);
    const name = this.cfg.text[this.consumable(entry.item)!.nameKey] ?? entry.item;
    this.toast(entry.price > 0 ? 'shop.bought' : 'shop.taken', { item: name });
  }

  private petCat(): void {
    this.sim.somatic.clearAll();
    this.sim.energy.calm(this.cfg.balance.recovery.petStressRelief);
    this.calmBuff = true;
    this.gameEvent('pet');
  }

  // ───────────────────────── 이동 수단 ─────────────────────────

  private startTravel(portal: PortalDef): void {
    const target = this.world.portals.find((p) => p.id === portal.to)!;
    this.mode = { kind: 'travel', portal, target, timer: 0, total: Math.max(0.6, portal.travelSec) };
    this.gameEvent(`portal:${portal.kind}`);
    if (portal.kind === 'stairs') this.fx.push({ type: 'sound', id: 'stairs' });
  }

  private teleport(to: Vec2): void {
    this.player.pos.x = to.x;
    this.player.pos.y = to.y;
  }

  // ───────────────────────── 공유 자전거 ─────────────────────────

  private parkBike(toastKey: string): void {
    if (!this.player.biking) return;
    this.player.biking = false;
    this.toast(toastKey);
    this.gameEvent('bike:park');
  }

  // ───────────────────────── 마을버스 ─────────────────────────

  /** 지금 도로 위의 버스 (연출용) */
  busesOnRoad(): BusOnRoad[] {
    return this.busRoute ? this.busRoute.busesAt(this.clock.minutes) : [];
  }

  private isRush(): boolean {
    return this.cfg.balance.clock.rushHours.some(([a, b]) => this.clock.minutes >= parseTime(a) && this.clock.minutes < parseTime(b));
  }

  /** 정류장에서 다음 버스를 기다린다. 움직이면 그만 기다린다 */
  private waitBus(it: InteractableDef): void {
    const route = this.busRoute;
    if (!route || !it.target) return;
    const stops = this.cfg.world.bus!.stops;
    const fromX = Object.values(stops).reduce((best, st) => (Math.abs(st.x - it.at[0]) < Math.abs(best - it.at[0]) ? st.x : best), Infinity);
    const toX = route.stopX(it.target);
    const dir: BusDir = toX > fromX ? 1 : -1;
    const next = route.nextAt(dir, fromX, this.clock.minutes);
    this.mode = { kind: 'bus', phase: 'waiting', dir, fromX, to: it.target, depart: next.depart, awkward: false };
    this.player.facing = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
    this.gameEvent('bus:wait');
  }

  /** 기다릴 남은 분 (UI) */
  busWaitMin(): number {
    const m = this.mode;
    if (m.kind !== 'bus' || !this.busRoute) return 0;
    return Math.max(0, this.busRoute.reachesAt(m.dir, m.depart, m.fromX) - this.clock.minutes);
  }

  private updateBus(c: Controls, m: Extract<Mode, { kind: 'bus' }>): void {
    const route = this.busRoute!;
    const b = this.cfg.balance.bus;
    const now = this.clock.minutes;
    if (m.phase === 'waiting') {
      if (Math.hypot(c.move.x, c.move.y) > 0.3 || c.cancel) {
        this.mode = { kind: 'free' };
        return;
      }
      if (now < route.reachesAt(m.dir, m.depart, m.fromX)) return;
      // 버스 도착: 교통카드 삑
      if (!this.pay(b.fare)) {
        this.mode = { kind: 'free' };
        return;
      }
      this.fx.push({ type: 'sound', id: 'beep' });
      this.toast('bus.board', { fare: b.fare.toLocaleString(this.cfg.lang === 'en' ? 'en-US' : 'ko-KR') });
      m.phase = 'riding';
      m.awkward = this.rng() < b.acquaintanceChance;
      this.gameEvent('bus:board');
      if (this.isRush()) this.gameEvent('bus:rush');
      if (m.awkward) {
        this.toast('bus.acquaintance');
        this.gameEvent('bus:awkward');
      }
      return;
    }
    // 타고 가는 동안 버스와 함께 움직인다 (카메라가 따라간다)
    const toX = route.stopX(m.to);
    const bus = route.busAt(m.dir, m.depart, now);
    if (bus) {
      this.player.pos.x = bus.x;
      this.player.pos.y = bus.y;
    }
    if (!bus || now >= route.reachesAt(m.dir, m.depart, toX)) {
      this.teleport(route.alightAt(m.dir, toX));
      this.fx.push({ type: 'sound', id: 'chime' });
      this.mode = { kind: 'free' };
      this.gameEvent(`bus:arrive:${m.to}`);
    }
  }

  private callElevator(it: InteractableDef): void {
    const front = this.cfg.world.elevator.fronts[it.id];
    const fp = front ? { x: front[0], y: front[1] } : this.player.pos;
    // 근처에 있던 지인이 같이 탈 수도 있다
    const companion =
      this.activeNpcs().find(
        (n) =>
          (n.type === 'acquaintance' || n.type === 'boss') &&
          n.state !== 'dialogue' &&
          dist(n.pos, fp) < (n.pursuing ? 10 : 6) &&
          (n.pursuing || this.rng() < 0.6),
      ) ?? null;
    this.mode = { kind: 'elevator', phase: 'waiting', timer: 3 + this.rng() * 4, from: it.id, to: it.target!, companion, presses: 0 };
    this.gameEvent('elevator:call');
  }

  private updateElevator(dt: number, c: Controls, m: Extract<Mode, { kind: 'elevator' }>): void {
    m.timer -= dt;
    if (m.phase === 'waiting') {
      if (Math.hypot(c.move.x, c.move.y) > 0.3 && !m.companion) {
        this.mode = { kind: 'free' };
        return;
      }
      if (m.timer <= 0) {
        this.fx.push({ type: 'sound', id: 'elevatorDing' });
        const car = this.cfg.world.elevator.car;
        this.teleport({ x: car[0] - 0.8, y: car[1] });
        if (m.companion) {
          m.companion.pos.x = car[0] + 0.9;
          m.companion.pos.y = car[1] - 0.4;
          m.companion.beginDialogue();
          this.gameEvent('elevator:awkward');
          this.toast('elevator.joined');
        }
        m.phase = 'closing';
        m.timer = 2.5;
      }
      return;
    }
    if (m.phase === 'closing') {
      // 닫힘 버튼 연타: 문이 빨리 닫힌다
      if (c.interactPressed) {
        m.presses++;
        m.timer -= 0.35;
      }
      if (m.timer <= 0) {
        m.phase = 'riding';
        m.timer = 7;
      }
      return;
    }
    if (m.timer <= 0) {
      const front = this.cfg.world.elevator.fronts[m.to]!;
      this.teleport({ x: front[0], y: front[1] });
      this.fx.push({ type: 'sound', id: 'elevatorDing' });
      if (m.companion) {
        m.companion.pos.x = front[0] + 1.2;
        m.companion.pos.y = front[1];
        m.companion.endDialogue();
      }
      this.mode = { kind: 'free' };
    }
  }

  // ───────────────────────── 대화 배틀 ─────────────────────────

  startDialogue(npc: Npc, fromBehind: boolean): void {
    if (this.mode.kind === 'dialogue' || this.mode.kind === 'speech') return;
    const p = npc.profile;
    const pool = this.cfg.dialoguePools[p.dialogue]!;
    const ally = p.type === 'ally';
    if (fromBehind && !ally) {
      const chance = this.cfg.skills.earphones.backApproachTapChance * (this.player.earphones ? this.cfg.skills.earphones.ambushChanceMultiplier : 1);
      if (this.rng() < chance) this.sim.bus.emit('shoulderTap', npc.id);
    }
    if (!ally) {
      this.sim.bus.emit(p.encounterStimulus, npc.id);
      this.sim.bus.setContinuous('dialogue', 'dialogue', 1);
    }
    this.phoneOpen = false;
    npc.beginDialogue();
    this.sim.life.recordAccept(npc.id);
    const practice = !this.practiced && !ally;
    const battle = new DialogueBattle(this.cfg.dialogueRules, pool, {
      minDurationSec: practice ? 0 : p.minDurationSec,
      baseDurationSec: practice ? Math.max(p.baseDurationSec, 20) : p.baseDurationSec,
      ally,
      rng: () => this.rng(),
      practice,
    });
    this.mode = { kind: 'dialogue', battle, npc, pool: p.dialogue, closer: null, closerTime: 0, myLine: null, myLineTime: 0, practice, smiling: false, wrongAge: 99 };
  }

  private updateDialogue(dt: number, c: Controls, m: Extract<Mode, { kind: 'dialogue' }>): void {
    const b = m.battle;
    m.myLineTime += dt;
    m.wrongAge += dt;
    m.smiling = c.smile;
    if (b.ended) {
      m.closerTime += dt;
      if (m.closerTime > 1.8 || (m.closerTime > 0.4 && c.confirm)) this.finishDialogue(m);
      return;
    }
    if (c.reply) {
      b.respond(c.reply);
      m.myLine = `dialogue.myLine.${c.reply}`;
      m.myLineTime = 0;
    }
    if (c.sos && !this.sosUsed && this.sim.life.get('bond') >= this.cfg.balance.sos.bondMin && m.npc.type !== 'ally') {
      this.sosUsed = true;
      b.requestSos();
    }
    const flushVisible = !this.player.mask;
    b.update(dt, {
      smiling: c.smile,
      stutter: this.sim.somatic.active('stutter'),
      flushRemarkable: flushVisible && this.sim.somatic.flushRemarkable,
    });
    if (m.npc.type === 'ally') this.sim.energy.recover(this.cfg.balance.recovery.allyNearPerSec * dt);
    for (const e of b.drainEvents()) {
      switch (e.type) {
        case 'wrong':
          m.wrongAge = 0;
          if (m.practice) break;
          // 어색한 대답: 당황 + 얼굴이 달아오른다
          this.sim.energy.addMood('panic', this.cfg.dialogueRules.wrongPanic);
          this.sim.somatic.trigger('flush', this.cfg.somatic.flush.slip, this.flushScale());
          this.gameEvent('dialogue:wrong');
          break;
        case 'flushRemark':
          this.sim.somatic.maxOut('flush');
          this.sim.bus.emit('flushRemark', m.npc.id);
          break;
        case 'parry':
          this.sim.report.parried++;
          if (m.npc.type === 'hunter') {
            this.sim.somatic.trigger('flush', this.cfg.somatic.flush.refusal, this.flushScale());
            this.sim.bus.emit('refusal');
          }
          break;
        case 'end':
          m.closer = e.closer;
          m.closerTime = 0;
          if (e.outcome === 'sos') {
            this.fx.push({ type: 'sound', id: 'fakeCall' });
            this.gameEvent('dialogue:sos');
          }
          break;
        default:
          break;
      }
    }
  }

  private finishDialogue(m: Extract<Mode, { kind: 'dialogue' }>): void {
    const b = m.battle;
    const npc = m.npc;
    this.sim.bus.setContinuous('dialogue', 'dialogue', 0);
    if (m.practice) {
      this.practiced = true;
      this.toast('coach.done');
    }
    // 대화가 어떻게 끝났는지가 그 사람의 인상으로 남는다
    const ending = b.outcome === 'endured' && b.wrongCount > 0 ? 'awkward' : b.outcome;
    if (ending) this.reputation.change(this.reputation.personOfNpc(npc.id), this.cfg.reputation.dialogue[ending]);
    if (npc.type === 'ally') {
      this.sim.life.apply(this.cfg.life.rewards.allyMeet, 'allyMeet');
      this.gameEvent(`met:${npc.id}`);
    } else {
      this.sim.report.smalltalkEndured++;
      this.gameEvent(`talked:${npc.id}`);
      if (b.wrongCount > 0) {
        this.sim.bus.emit('rumination');
        this.gameEvent('rumination');
      }
      if (npc.type === 'boss' && b.outcome === 'satisfied') this.sim.life.apply({ income: 4 }, 'bossTalk');
    }
    npc.endDialogue(b.outcome === 'parried' ? npc.profile.graceAfterParrySec : undefined);
    this.fx.push({ type: 'sound', id: 'sigh' });
    this.mode = this.resumeMode();
  }

  // ───────────────────────── 필수 발화 ─────────────────────────

  private startSpeech(speechId: string): void {
    const sp = this.cfg.speeches[speechId]!;
    const scale = this.rehearsed ? this.cfg.balance.rehearsal.damageScale : 1;
    this.sim.bus.emit(sp.stimulus, speechId, scale);
    this.phoneOpen = false;
    this.mode = { kind: 'speech', challenge: new SpeechChallenge(this.cfg.dialogueRules.speech, this.cfg.lang === 'en' && sp.chunksEn ? sp.chunksEn : sp.chunks), speechId, time: 0 };
  }

  private updateSpeech(dt: number, c: Controls, m: Extract<Mode, { kind: 'speech' }>): void {
    m.time += dt;
    const ch = m.challenge;
    if (ch.done) {
      if (m.time > 1.4) this.finishSpeech(m);
      return;
    }
    if (m.time < 1.5) return; // 소개 문구 읽는 시간
    if (c.spacePressed) ch.press();
    ch.update(dt, this.sim.somatic.active('stutter'));
    for (const e of ch.drainEvents()) {
      if (e.type === 'chunk' && !e.clean) {
        this.sim.bus.emit('speechSlip');
        this.sim.somatic.trigger('flush', this.cfg.somatic.flush.slip * 0.6, this.flushScale());
      }
      if (e.type === 'done') m.time = 0;
    }
  }

  private finishSpeech(m: Extract<Mode, { kind: 'speech' }>): void {
    const sp = this.cfg.speeches[m.speechId]!;
    // 잘 끝나도 이불킥이 오는 발화가 있다 (발표)
    if (m.challenge.misses >= 2 || sp.rumination) {
      this.sim.bus.emit('rumination');
      this.gameEvent('rumination');
    }
    if (m.speechId === 'checkoutNormal') this.completeCheckout();
    else {
      // 엔딩 리포트의 '감수한 필수 상호작용'에는 그날 필수 목표였던 것만 센다
      if (this.objectives.list.some((o) => o.def.on === sp.objectiveEvent && o.def.mandatory)) this.sim.report.mandatoryDone.push(m.speechId);
      this.gameEvent(sp.objectiveEvent);
    }
    if (sp.grant && this.pay(sp.grant.price)) {
      this.addItem(sp.grant.item);
      this.toast('shop.bought', { item: this.cfg.text[this.consumable(sp.grant.item)!.nameKey] ?? sp.grant.item });
    }
    this.mode = this.resumeMode();
    if (sp.next) {
      this.startSpeech(sp.next);
      return;
    }
    // 일반 계산대: 스몰토크 확률
    if (m.speechId === 'checkoutNormal' && this.rng() < 0.5) {
      const cashier = this.activeNpcs().find((n) => n.profileId === 'cashier' && dist(n.pos, this.player.pos) < 4);
      if (cashier) this.startDialogue(cashier, false);
    }
  }

  private completeCheckout(): void {
    const total = this.player.inventory.items.reduce((s, item) => {
      const it = this.world.interactables.find((i) => i.item === item);
      return s + (it?.price ?? 0);
    }, 0);
    this.sim.life.addMoney(-Math.min(total, this.sim.life.money));
    this.sim.life.apply(this.cfg.life.rewards.groceries, 'groceries');
    this.toast('checkout.done');
    this.gameEvent('done:checkout');
    if (!this.sim.report.mandatoryDone.includes('checkout')) this.sim.report.mandatoryDone.push('checkout');
  }

  private flushScale(): number {
    return this.rehearsed ? this.cfg.balance.rehearsal.flushScale : 1;
  }

  // ───────────────────────── 업무·취미 ─────────────────────────

  private updateWork(dt: number, c: Controls, m: Extract<Mode, { kind: 'work' }>): void {
    const g = m.game;
    const rw = this.cfg.life.rewards;
    const sender: Record<string, string> = { boss: 'boss', team: 'teamChat', hr: 'work.from.hr' };
    if (c.reply === 'nod' || c.note === 0) {
      const ping = g.reply();
      if (ping) {
        this.sim.bus.emit('workReply');
        this.sim.life.apply(rw.workPing[ping.from]!.replied, 'workPingReplied', sender[ping.from]);
        this.reputation.onEvent(`workPing:replied:${ping.from}`);
      }
    }
    m.idle = c.smile ? 0 : m.idle + dt;
    g.update(dt, c.smile);
    // 업무 스트레스: 일하는 동안 긴장이 쌓이고, 답 못 한 메신저(팀장은 더)가 짓누른다
    const wc = this.cfg.balance.work;
    const pending = g.pings.reduce((a, pg) => a + (pg.from === 'boss' ? wc.bossPingMultiplier : 1), 0);
    this.sim.energy.addMood('stress', (wc.pressureStressPerSec + pending * wc.pendingPingStressPerSec) * dt, true);
    for (const e of g.drainEvents()) {
      if (e.type === 'ping') {
        this.sim.bus.emit('workPing');
        this.fx.push({ type: 'sound', id: 'vibrate' });
      } else if (e.type === 'pingIgnored') {
        const cost = rw.workPing[e.ping.from]!.ignored;
        this.sim.life.apply(cost, 'workPingIgnored', sender[e.ping.from]);
        this.reputation.onEvent(`workPing:ignored:${e.ping.from}`);
        this.sim.bus.emit('workPingMissed');
        if ((cost.income ?? 0) < 0) this.gameEvent('avoided:income');
      }
      else if (e.type === 'task') this.sim.life.addMoney(rw.workPerTask);
      else if (e.type === 'done') {
        this.sim.life.apply(rw.workDone, 'workDone');
        this.clock.skipTo(parseTime(this.day.work!.endTime));
        this.sim.energy.recover(this.cfg.balance.recovery.workAfternoon);
        // 오후 업무를 마친 피로: 긴장을 안고 퇴근한다
        this.sim.energy.addMood('stress', wc.afternoonStress);
        this.toast('work.done');
        this.mode = { kind: 'free' };
        this.gameEvent('done:work');
        return;
      }
    }
    if (c.interactPressed || c.cancel) this.mode = { kind: 'free' };
  }

  private finishPiano(): void {
    const n = this.sim.bus.clearRuminations();
    this.sim.energy.calm(this.cfg.balance.recovery.hobbyStressRelief);
    this.hobbyDone = true;
    this.sim.report.hobbies.push('piano');
    this.toast('piano.done');
    if (n > 0) this.fx.push({ type: 'sound', id: 'chime' });
    this.mode = { kind: 'free' };
  }

  // ───────────────────────── 회식 ─────────────────────────

  private takeSeat(seat: string): void {
    const dinner = this.day.dinner;
    if (!dinner || !this.objectiveAvailable('seated')) {
      this.toast('interact.bed.notYet');
      return;
    }
    this.dinnerSeatTimer = -1;
    const it = this.world.interactables.find((i) => i.kind === 'seat' && i.seat === seat)!;
    this.teleport({ x: it.at[0], y: it.at[1] });
    this.gameEvent('seated');
    this.gameEvent('dinner:grill');
    const [a, b] = dinner.laughEverySec;
    this.mode = {
      kind: 'seated',
      seat,
      grill: new GrillGame(dinner.grillCookSec, dinner.grillBurnSec, () => this.rng()),
      time: 0,
      toastDone: false,
      distractedFor: 0,
      laughIn: a + this.rng() * (b - a),
      bossCheckIn: 20,
    };
  }

  private updateSeated(dt: number, c: Controls, m: Extract<Mode, { kind: 'seated' }>): void {
    const dinner = this.day.dinner!;
    m.time += dt;
    // 플레이어는 상석 쪽을 바라본다
    const boss = this.npcs.find((n) => n.id === 'restBoss');
    if (boss) this.player.facing = angleTo(this.player.pos, boss.pos);
    this.updateQte(dt, c);

    if (c.slot !== null) m.grill.flip(c.slot);
    m.grill.update(dt);
    for (const e of m.grill.drainEvents()) {
      if (e.type === 'burnt') {
        this.sim.bus.emit('burntMeat');
        this.sim.somatic.trigger('flush', 0.2, this.flushScale());
        this.fx.push({ type: 'sound', id: 'sizzle' });
      } else if (e.type === 'served') this.fx.push({ type: 'sound', id: 'sizzle' });
    }

    if (!m.toastDone && m.time >= dinner.toastAfterSec - 6 && m.time - dt < dinner.toastAfterSec - 6) {
      this.toast('dinner.toastSoon');
      this.gameEvent('dinner:toastSoon');
    }
    if (!m.toastDone && m.time >= dinner.toastAfterSec && this.objectiveAvailable('done:toast')) {
      this.startSpeech('toast');
      return;
    }
    // 단체 웃음 QTE
    m.laughIn -= dt;
    if (m.laughIn <= 0 && !this.qte) {
      const [a, b] = dinner.laughEverySec;
      m.laughIn = a + this.rng() * (b - a);
      this.qte = { kind: 'laugh', timer: 0, window: dinner.laughWindowSec };
      this.fx.push({ type: 'sound', id: 'laugh' });
    }
    // 건배사 후: 2차 얘기로 시선이 흩어지는 틈
    if (m.toastDone) {
      if (m.distractedFor <= 0 && m.time > dinner.toastAfterSec + 12 && m.time - dt <= dinner.toastAfterSec + 12) {
        m.distractedFor = 15;
        this.toast('dinner.secondRound');
        this.gameEvent('dinner:secondRoundTalk');
      }
      m.distractedFor = Math.max(0, m.distractedFor - dt);
    }
    // 상사의 관심 (자리 효과)
    m.bossCheckIn -= dt;
    const eff = dinner.seatEffects[m.seat] ?? { gazeExtra: 0, bossAttention: 0.5 };
    if (m.bossCheckIn <= 0 && boss && m.distractedFor <= 0) {
      m.bossCheckIn = 22;
      if (this.rng() < eff.bossAttention * 0.6) {
        this.startDialogue(boss, false);
        return;
      }
    }
    // 일어나기: 시선이 흩어진 틈이면 조용히, 아니면 붙잡힌다
    if (c.interactPressed && m.toastDone) {
      this.mode = { kind: 'free' };
      if (m.distractedFor <= 0 && boss && this.rng() < 0.7) this.startDialogue(boss, false);
    }
  }

  /** 대화·발화가 끝난 뒤 돌아갈 모드 (회식 자리면 다시 자리로) */
  private resumeMode(): Mode {
    if (this.day.dinner && this.objectives.isDone('dinner') && !this.objectives.isDone('escape')) {
      const area = this.world.map.areaAt(this.player.pos.x, this.player.pos.y);
      const seat = this.world.interactables.find((i) => i.kind === 'seat' && dist({ x: i.at[0], y: i.at[1] }, this.player.pos) < 0.6);
      if (area?.id === this.day.dinner.area && seat) {
        const d = this.day.dinner;
        return {
          kind: 'seated',
          seat: seat.seat ?? 'middle',
          grill: new GrillGame(d.grillCookSec, d.grillBurnSec, () => this.rng()),
          time: this.objectives.isDone('toast') ? d.toastAfterSec + 1 : d.toastAfterSec * 0.6,
          toastDone: this.objectives.isDone('toast'),
          distractedFor: 0,
          laughIn: d.laughEverySec[0],
          bossCheckIn: 25,
        };
      }
    }
    return { kind: 'free' };
  }

  // ───────────────────────── QTE ─────────────────────────

  private updateQte(dt: number, c: Controls): void {
    const q = this.qte;
    if (!q) return;
    q.timer += dt;
    let resolved = false;
    if (q.kind === 'laugh') {
      if (c.spacePressed) resolved = true;
      else if (q.timer >= q.window) {
        this.sim.bus.emit('groupLaughMiss');
        this.sim.somatic.trigger('flush', 0.25, this.flushScale());
        resolved = true;
      }
    } else if (q.kind === 'knock') {
      if (c.spacePressed) resolved = true;
      else if (q.timer >= q.window) {
        // 대답이 없으면 점원이 커튼 너머로 말을 건다
        const clerk = this.activeNpcs().find((n) => n.type === 'stalker');
        this.player.lockedSafe = null;
        if (clerk) this.startDialogue(clerk, false);
        resolved = true;
      }
    }
    if (resolved) this.qte = null;
  }

  // ───────────────────────── 폰 ─────────────────────────

  private updatePhone(dt: number, c: Controls): void {
    const phone = this.phone;
    // 예약된 전화·문자
    this.day.phone.forEach((ev, i) => {
      if (this.firedPhone.has(i) || !ev.at) return;
      if (this.clock.minutes >= parseTime(ev.at)) {
        this.firedPhone.add(i);
        this.deliverPhoneEvent(ev);
      }
    });
    if (this.mandatoryRetry) {
      this.mandatoryRetry.timer -= dt;
      if (this.mandatoryRetry.timer <= 0 && !phone.ringing) {
        const r = this.mandatoryRetry;
        this.mandatoryRetry = null;
        this.deliverPhone('call', r.contact, r.textKey);
      }
    }
    phone.update(dt);

    // 전화 받기/거절 — 볼 감싸는 중이면 손을 쓸 수 없다
    const call = phone.call;
    const canUse = !this.player.cover && this.mode.kind !== 'speech';
    if (call && canUse) {
      const mandatory = this.isMandatoryCall(call.contactId);
      const slips = (c.decline || c.textInstead) && this.sim.somatic.slips(this.rng());
      if (slips) {
        this.toast('slip.phone');
        phone.answer();
      } else if (c.accept) phone.answer();
      else if (c.decline && !mandatory) phone.decline();
      else if (c.textInstead && !mandatory) phone.textInstead();
    }
    this.sim.bus.setContinuous('phone', 'phoneRinging', phone.ringing ? 1 : 0);
    this.sim.bus.setContinuous('replyAnxiety', 'replyAnxiety', phone.waitingReply ? 1 : 0);

    // 폰 화면 조작
    if (this.phoneOpen && canUse) {
      const msgs = phone.messages.filter((m) => !m.resolved);
      if (c.menuNav !== 0 && msgs.length) this.phoneCursor = (this.phoneCursor + c.menuNav + msgs.length) % msgs.length;
      const sel = msgs[Math.min(this.phoneCursor, msgs.length - 1)];
      if (sel) sel.read = true;
      if (sel && c.phoneReply) {
        if (this.sim.somatic.slips(this.rng())) this.toast('slip');
        else {
          this.sim.bus.emit('textMessage');
          phone.reply(sel.id);
        }
      } else if (sel && c.phoneIgnore) phone.readIgnore(sel.id);
    }

    for (const e of phone.drainEvents()) {
      switch (e.type) {
        case 'ring':
          this.sim.bus.emit('phoneRingStartle');
          this.gameEvent('phone:ring');
          if (this.sim.somatic.active('sweat')) this.fx.push({ type: 'rumble' });
          break;
        case 'message':
          // 알림을 꺼 둔 단톡방은 조용히 쌓인다
          if (this.cfg.life.contacts[e.message.contactId]?.muted) break;
          this.sim.bus.emit('textMessage');
          if (this.loudUnread() >= 3) this.gameEvent('phone:unread3');
          break;
        case 'callResolved':
          this.resolveContact(e.call.contactId, e.how, e.call.textKey);
          break;
        case 'messageResolved':
          this.resolveContact(e.message.contactId, e.how, e.message.textKey);
          break;
        case 'replyReceived':
          this.toast('phone.replyReceived', { name: this.cfg.text[this.cfg.life.contacts[e.contactId]?.nameKey ?? ''] ?? e.contactId });
          break;
      }
    }
  }

  /** 알림이 울리는(꺼 두지 않은) 안 읽은 메시지 수 */
  loudUnread(): number {
    return this.phone.unread.filter((m) => !this.cfg.life.contacts[m.contactId]?.muted).length;
  }

  /** 피할 수 없는 전화 (그 전화를 받는 것이 필수 목표) */
  private isMandatoryCall(contactId: string): boolean {
    return this.objectives.list.some((o) => o.def.on === `answered:${contactId}` && o.def.mandatory && !o.done);
  }

  private deliverPhoneEvent(ev: DayDef['phone'][number]): void {
    if (ev.chance !== undefined && this.rng() >= ev.chance) return;
    this.deliverPhone(ev.kind, ev.contact, ev.textKey);
    if (ev.effect === 'plansCancelled') {
      // 상대가 먼저 약속을 취소: 미안하지만, 솔직히 조금 기쁘다
      this.sim.energy.recover(this.cfg.balance.recovery.plansCancelled);
      for (const o of this.objectives.list) if (o.def.optional && o.def.on.startsWith(`met:`)) o.done = true;
      this.toast('plansCancelled');
      this.gameEvent('plansCancelled');
    }
  }

  private deliverPhone(kind: 'call' | 'message', contact: string, textKey: string): void {
    if (kind === 'call') this.phone.receiveCall(contact, textKey);
    else this.phone.receiveMessage(contact, textKey);
  }

  private resolveContact(contactId: string, how: CallHow | MessageHow, textKey: string): void {
    const contact = this.cfg.life.contacts[contactId];
    if (!contact || contact.muted) return;
    this.reputation.change(this.reputation.personOfContact(contactId), this.cfg.reputation.phone[how]);
    const report = this.sim.report;
    if (how === 'answered') report.callsAnswered++;
    if (how === 'declined' || how === 'missed') report.callsAvoided++;
    if (how === 'replied') report.messagesReplied++;
    if (how === 'readIgnored' || how === 'unread') report.messagesIgnored++;

    // 피할 수 없는 전화: 놓치면 다시 온다
    if ((how === 'missed' || how === 'declined') && this.isMandatoryCall(contactId)) {
      this.mandatoryRetry = { contact: contactId, textKey, timer: 20 };
    }
    const out = applyContactOutcome(contactId, contact, how, this.sim.life);
    if (out.stimulus) this.sim.bus.emit(out.stimulus, contactId);
    if (out.avoided) {
      // 회피의 대가를 그 자리에서 느끼게: 어떤 생활이 흔들리는지 독백으로
      const delta = how === 'readIgnored' ? contact.readIgnored : how === 'unread' ? contact.unread : contact.avoid;
      const worst = (Object.entries(delta) as [string, number][]).sort((a, b) => a[1] - b[1])[0];
      if (worst && worst[1] < 0) this.gameEvent(`avoided:${worst[0]}`);
      if (contact.escalation && this.sim.life.avoidCount(contactId) % this.cfg.life.stats.escalateAfter === this.cfg.life.stats.escalateAfter - 1) {
        this.gameEvent('avoided:almost');
      }
    }
    if (how === 'answered' && contact.ally) this.sim.energy.recover(8);
    if (how === 'replied') this.gameEvent(`replied:${contactId}`);
    if (how === 'answered') {
      this.gameEvent(`answered:${contactId}`);
      if (this.isMandatoryLike(contactId) && !report.mandatoryDone.includes(`call:${contactId}`)) report.mandatoryDone.push(`call:${contactId}`);
    }
    if (contactId === 'boss' && (how === 'readIgnored' || how === 'unread')) this.ignoredBossMessages++;
    if (out.escalation) this.escalate(out.escalation);
    else if (contactId === 'boss' && this.ignoredBossMessages >= this.cfg.balance.boss.visitAfterIgnoredMessages) {
      this.ignoredBossMessages = 0;
      this.escalate('bossVisit');
    }
  }

  private isMandatoryLike(contactId: string): boolean {
    return this.day.phone.some((p) => p.contact === contactId && p.mandatory);
  }

  /** 회피 에스컬레이션: 같은 대상 3회 회피 → 상위 자극 */
  private escalate(id: string): void {
    if (id === 'doorbell' && !this.atHome) {
      this.pendingEscalations.push(id);
      return;
    }
    this.sim.bus.emit(id);
    this.gameEvent(`escalation:${id}`);
    this.toast(`escalation.${id}`);
    if (id === 'doorbell') {
      this.sanctuaryBroken = 10;
      this.fx.push({ type: 'sound', id: 'doorbell' });
    }
    if (id === 'bossVisit') {
      const boss = this.activeNpcs().find((n) => n.profileId === 'boss');
      if (boss && this.area?.id === 'officeFloor') boss.notice = 1;
    }
  }

  // ───────────────────────── 월드 진행 ─────────────────────────

  private updateWorld(dt: number): void {
    const p = this.player;
    const prevArea = this.area;
    this.area = this.world.map.areaAt(p.pos.x, p.pos.y);
    if (this.area && this.area !== prevArea) {
      // 건물에 들어서면 자전거는 문 앞에 세운다
      if (p.biking && this.area.kind !== 'outdoor') this.parkBike('bike.parkedDoor');
      this.gameEvent(`enter:${this.area.id}`);
      // 밖으로 나갔을 때만 '빠져나감' (건물 안 화장실로 가는 건 제외)
      if (prevArea && this.area.kind === 'outdoor') this.gameEvent(`exit:${prevArea.id}`);
      if (this.area.kind === 'home' && this.pendingEscalations.length) this.escalate(this.pendingEscalations.shift()!);
    }
    if (this.area?.kind !== 'home' && this.homeLocked && prevArea?.kind === 'home') this.homeLocked = false;
    // 비 오는 날 현관을 나서면 집 우산을 챙긴다
    if (this.raining && prevArea?.kind === 'home' && this.area?.kind !== 'home' && !p.inventory.gear.includes('umbrella')) {
      p.inventory.gear.push('umbrella');
      this.toast('umbrella.fromHome');
    }
    p.hidden = inHide(this.world, p.pos);

    // 회식 자리 고르기 카운트다운
    if (this.day.dinner && this.area?.id === this.day.dinner.area && this.objectiveAvailable('seated')) {
      if (this.dinnerSeatTimer < 0) {
        this.dinnerSeatTimer = this.day.dinner.seatChoiceSec;
        this.gameEvent('dinner:seatChoice');
      }
      if (this.mode.kind === 'free') {
        this.dinnerSeatTimer -= dt;
        if (this.dinnerSeatTimer <= 0) this.takeSeat('head');
      }
    }

    // NPC
    const percept = this.playerPercept();
    const talkBlocked = this.isModal() && this.mode.kind !== 'seated';
    const seatedFocus = this.mode.kind === 'seated';
    for (const npc of this.npcs) {
      if (!this.npcActive(npc)) continue;
      const wasPursuing = npc.pursuing;
      npc.update(dt, {
        map: this.world.map,
        player: percept,
        playerAreaId: this.area?.id ?? null,
        talkBlocked: talkBlocked || (seatedFocus && npc.type !== 'boss'),
        rng: () => this.rng(),
      });
      for (const e of npc.drainEvents()) {
        if (e.type !== 'talk') continue;
        if (this.mode.kind === 'free') this.startDialogue(e.npc, e.fromBehind);
        else e.npc.endDialogue(5);
      }
      // 다가오던 사람이 말을 걸지 못하고 돌아섬 = 피한 스몰토크
      if (wasPursuing && npc.state === 'giveUp') {
        this.sim.report.smalltalkAvoided++;
        this.reputation.change(this.reputation.personOfNpc(npc.id), this.cfg.reputation.dialogue.avoided);
      }
    }

    // 군중
    const rush = this.isRush();
    this.crowd.setDensity(rush ? this.cfg.balance.clock.rushCrowdMultiplier : 1);
    this.crowd.update(dt, p.pos, this.cfg.player.radius);
    if (this.mode.kind === 'free' && !p.lockedSafe) this.crowdInteractions();
  }

  private crowdInteractions(): void {
    const p = this.player;
    const b = this.cfg.balance;
    // 개인 공간 침범
    if (this.personalSpaceCd <= 0 && this.crowd.touching(p.pos, b.personalSpace.radius * 0.7)) {
      this.personalSpaceCd = b.personalSpace.cooldownSec;
      this.sim.bus.emit('personalSpace');
      p.frozen = Math.max(p.frozen, b.personalSpace.freezeSec);
    }
  }

  playerPercept(): PlayerPercept {
    const p = this.player;
    const m = this.mode.kind;
    return {
      pos: p.pos,
      facing: p.facing,
      moving: p.moving,
      noise: p.running ? this.cfg.player.runNoiseMultiplier : 1,
      phonePretend: p.phonePretend || this.phoneOpen,
      eyesClosed: p.eyesClosed,
      hidden: p.hidden,
      unreachable: !!p.lockedSafe || this.sanctuary || this.atHome || m === 'travel' || m === 'elevator' || m === 'work' || m === 'speech' || (this.mode.kind === 'bus' && this.mode.phase === 'riding') || p.biking,
    };
  }

  /** 눈인사만 하는 사람과 눈이 마주치면: 서로 고개만 끄덕이고, 마음이 조금 가라앉는다 (하루 한 번) */
  private updateNods(): void {
    const nod = this.cfg.balance.nod;
    for (const n of this.activeNpcs()) {
      if (!n.profile.nodOnly || this.nodded.has(n.id) || !n.percept.eyeContact || n.percept.dist > nod.range) continue;
      this.nodded.add(n.id);
      this.sim.energy.calm(nod.calm);
      this.gameEvent(`nod:${n.id}`);
    }
  }

  /** 지금 나를 보고 있는 시선 수 */
  gazeCount(): number {
    let n = 0;
    const range = this.cfg.balance.gaze.range;
    for (const npc of this.activeNpcs()) if (npc.gazing && npc.percept.dist <= range && npc.type !== 'pet' && npc.type !== 'ally' && !npc.profile.nodOnly) n++;
    if (this.mode.kind === 'seated') n += this.day.dinner?.seatEffects[this.mode.seat]?.gazeExtra ?? 0;
    if (this.mode.kind === 'speech') n += this.cfg.speeches[this.mode.speechId]?.audience ?? 0;
    return n;
  }

  // ───────────────────────── 시뮬레이션 ─────────────────────────

  private updateSim(dt: number): void {
    const p = this.player;
    const bus = this.sim.bus;
    const b = this.cfg.balance;
    const areaStim = this.day.areaStimuli?.find((a) => a.area === this.area?.id) ?? this.area?.stimulus;
    // 환경 자극 구역 (ZONE)
    bus.clearContinuous('zone:');
    if (areaStim && !p.lockedSafe) bus.setContinuous(`zone:${this.area!.id}`, areaStim.id, areaStim.intensity);
    // 군중 밀도
    const near = this.crowd.countNear(p.pos, b.crowdDensity.radius);
    let crowd = Math.min(b.crowdDensity.max, near * b.crowdDensity.perAgent);
    if (this.crowd.slipstream(p.pos, p.moveDir, b.slipstream.behindDist, b.slipstream.lateral)) crowd *= b.slipstream.crowdScale;
    // 자전거로 사람들 사이를 지나가면 더 조마조마하다
    if (p.biking) crowd *= b.bike.crowdScale;
    // 버스 안: 러시아워엔 빽빽하다
    if (this.mode.kind === 'bus' && this.mode.phase === 'riding') crowd = this.isRush() ? b.bus.crowdRush : b.bus.crowd;
    bus.setContinuous('crowd', 'crowd', p.lockedSafe ? 0 : crowd);
    // 사람이 많을수록 긴장이 오른다. 빽빽하면 그동안 가라앉지 않는다
    if (crowd > 0 && !p.lockedSafe) this.sim.energy.addMood('tension', crowd * b.crowdDensity.stressPerSec * dt, crowd >= b.crowdDensity.sustainFrom);
    this.crowdLevel = p.lockedSafe ? 0 : crowd;
    // 비: 우산 없이 바깥에 있으면 축축하고 불편하다
    // 자전거를 타면 우산을 쓸 수 없다
    const soaked = this.raining && this.area?.kind === 'outdoor' && (!this.player.inventory.gear.includes('umbrella') || p.biking);
    bus.setContinuous('weather', 'rainSoaked', soaked ? 1 : 0);
    if (soaked && !this.soakedToday) {
      this.soakedToday = true;
      this.gameEvent('rain:soaked');
    }
    // 아이컨택
    const eye = this.activeNpcs().filter((n) => n.percept.eyeContact && n.type !== 'ally' && n.type !== 'pet' && !n.profile.nodOnly).length;
    this.updateNods();
    bus.setContinuous('eye', 'eyeContact', eye);

    // 어색한 침묵: 좁은 공간 + 지인
    const awkwardPair =
      (this.mode.kind === 'elevator' && this.mode.phase !== 'waiting' && this.mode.companion !== null) || (this.mode.kind === 'bus' && this.mode.phase === 'riding' && this.mode.awkward);

    // 이어폰은 청각만, 스트레스 내성(아이템)은 모든 자극을 줄인다
    const rs = this.buffs.resist.left > 0 ? this.buffs.resist.scale : 1;
    const ear = p.earphones ? this.cfg.skills.earphones.auditoryMultiplier : 1;
    const modifiers: ChannelModifiers = rs === 1 && ear === 1 ? NO_MODIFIERS : { auditory: ear * rs, visual: rs, social: rs };
    const ally = this.activeNpcs().some((n) => n.type === 'ally' && dist(n.pos, p.pos) < b.recovery.allyRange);
    let extra = 0;
    if (this.sanctuary) extra += b.recovery.homeLockedPerSec;
    if (ally) extra += b.recovery.allyNearPerSec;
    this.sim.step(dt, {
      outdoor: this.area?.kind === 'outdoor',
      inSafe: !!p.lockedSafe,
      extraRecoverPerSec: extra,
      modifiers,
      gazeCount: this.gazeCount(),
      coveringCheeks: p.cover,
      eyesClosed: p.eyesClosed,
      flushRiseScale: this.flushScale(),
      sanctuary: this.sanctuary,
      awkwardPair,
    });
    // 모자·마스크: 홍조는 가려지지만 답답하다
    // 마스크: 답답해서 긴장이 가라앉지 않고 조금씩 오른다
    if (p.mask) this.sim.energy.addMood('stress', this.cfg.skills.mask.stuffyStressPerSec * dt, true);

    for (const e of this.sim.drainEvents()) {
      switch (e.type) {
        case 'ambush':
          p.frozen = Math.max(p.frozen, b.ambush.freezeSec * (this.calmBuff ? 0.7 : 1));
          this.fx.push({ type: 'ambush', stimulusId: e.stimulusId });
          break;
        case 'tierChanged':
          if (['tired', 'danger', 'critical'].includes(e.to) && e.to !== this.lastTier) {
            this.gameEvent(`tier:${e.to}`);
            // 게임이 끝나는 기준은 긴장이 아니라 기운: 위험해지면 분명히 알린다
            if (e.to === 'danger' || e.to === 'critical') this.toast(`energy.${e.to}`);
          }
          this.lastTier = e.to;
          break;
        case 'burnout':
          this.mode = { kind: 'burnout', time: 0 };
          this.phoneOpen = false;
          break;
        case 'lifeCollapse':
          this.mode = { kind: 'collapse', stat: e.stat, time: 0 };
          break;
        case 'onset':
          this.gameEvent(`onset:${e.symptom}`);
          if (e.symptom === 'sweat') this.fx.push({ type: 'rumble' });
          break;
        default:
          break;
      }
    }

    // 목표 마감
    this.objectives.checkDeadlines(this.clock.minutes);
    for (const e of this.objectives.drainEvents()) {
      if (e.type === 'missed') {
        const d = e.objective.def;
        const delta = d.missed ?? (d.mandatory ? this.cfg.life.rewards.mandatorySkipped : null);
        if (delta) this.sim.life.apply(delta, 'missed', d.textKey);
        this.toast('obj.missed', { obj: this.cfg.text[d.textKey] ?? d.id });
        this.gameEvent(`missed:${d.id}`);
        continue;
      }
      if (e.type === 'late') {
        if (e.objective.def.late) this.sim.life.apply(e.objective.def.late, 'late', e.objective.def.textKey);
        if (e.objective.def.lateStimulus) {
          this.sim.bus.emit(e.objective.def.lateStimulus);
          this.toast(e.objective.def.lateStimulus);
          // 2차에 끌려감: 시간이 흐르고 강제로 목표 처리
          if (e.objective.def.lateStimulus === 'secondRound') {
            this.clock.skipTo(this.clock.minutes + 90);
            this.objectives.fire(e.objective.def.on);
            this.mode = { kind: 'free' };
          }
        } else this.toast('late');
        this.gameEvent(`late:${e.objective.def.id}`);
      }
    }
  }

  private updateMonologue(dt: number): void {
    this.monologue.update(dt, {
      areaId: this.area?.id ?? null,
      returning: this.returning,
      npcs: this.activeNpcs().map((n) => ({
        profileId: n.profileId,
        type: n.type,
        dist: n.percept.dist,
        visible: n.percept.inView || this.world.map.lineOfSight(this.player.pos, n.pos),
        noticed: n.notice > 0.4,
      })),
    });
  }

  /** 게임 이벤트: 목표·독백·이벤트 전화로 퍼진다 */
  gameEvent(event: string): void {
    for (const m of marksFor(this.cfg.story, event, this.day.id)) {
      const i = this.cfg.story.marks.indexOf(m);
      if (m.oncePerDay && this.marksToday.has(i)) continue;
      this.marksToday.add(i);
      applyMark(this.story, m);
      if (m.give && this.addItem(m.give)) this.toast(m.toastKey ?? 'shop.taken', { item: this.cfg.text[this.consumable(m.give)?.nameKey ?? ''] ?? m.give });
    }
    this.objectives.fire(event);
    this.reputation.onEvent(event);
    this.monologue.onEvent(event);
    this.day.phone.forEach((ev, i) => {
      if (ev.on === event && !this.firedPhone.has(i)) {
        this.firedPhone.add(i);
        this.deliverPhoneEvent(ev);
      }
    });
  }

  toast(key: string, vars?: Record<string, string | number>): void {
    this.fx.push({ type: 'toast', key, vars });
  }

  drainFx(): FxEvent[] {
    return this.fx.splice(0);
  }

  // ───────────────────────── 하루 끝 ─────────────────────────

  private endDay(): void {
    const life = this.sim.life;
    this.phone.endDay();
    for (const e of this.phone.drainEvents()) if (e.type === 'messageResolved') this.resolveContact(e.message.contactId, e.how, e.message.textKey);
    for (const o of this.objectives.skippedOptional()) if (o.def.skip) life.apply(o.def.skip, 'skipped', o.def.textKey);
    const settlement = settleDay(this.cfg.life.settlement, life, this.day.flags);
    const night = nightRecovery(this.cfg.life.night, {
      stressAtBed: this.sim.energy.load,
      ruminations: this.sim.bus.activeRuminations,
      hobbyDone: this.hobbyDone,
      bedMinutes: this.clock.minutes,
      housing: life.get('housing'),
      essentials: life.get('essentials'),
    });
    const report = this.sim.report;
    this.reports = [...this.reports.slice(0, this.dayIndex), report];
    this.nextMax = night.nextMax;
    const collapsed = life.collapsed;
    if (collapsed) {
      this.mode = { kind: 'collapse', stat: collapsed, time: 0 };
      return;
    }
    this.mode = { kind: 'night', breakdown: night.breakdown, settlement, nextMax: night.nextMax, report, lifeEnd: { ...life.all() }, moneyEnd: life.money };
  }

  private advanceDay(): void {
    if (this.dayIndex + 1 >= this.cfg.days.length) {
      this.mode = { kind: 'final', reports: this.reports };
      return;
    }
    this.startDay(this.dayIndex + 1);
  }

  /** 대화 중 선택지 (UI가 표시) */
  static readonly replies = replies;

  /** 디버그: 자극 발생 */
  debugEmit(stimulusId: string): void {
    this.sim.bus.emit(stimulusId);
  }

  /** NPC가 플레이어를 쳐다보는지 (시선 연출) */
  npcLooksAtPlayer(n: Npc): boolean {
    return n.gazing && angleDiff(n.facing, angleTo(n.pos, this.player.pos)) < 0.6;
  }

  profileOf(n: Npc): NpcProfile {
    return n.profile;
  }
}

/** 씨앗·하루·시도 횟수 → 난수 상태 */
function mix(seed: number, day: number, attempt: number): number {
  let h = (seed ^ Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(attempt + 1, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
