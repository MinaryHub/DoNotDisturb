import { EnergyModel, type BatteryTier, type ChannelModifiers, type EnergyConfig, type EnergyContext } from './EnergyModel';
import { LifeStats, type LifeStatId, type LifeStatsConfig } from './LifeStats';
import { SomaticController, type SomaticConfig, type SomaticEvent } from './SomaticController';
import { StimulusBus, type StimulusTable } from './StimulusBus';
import { emptyReport, type DayReport } from './DayReport';

// 시뮬레이션 계층의 진입점. 게임플레이는 입력(자극·상황)을 넣고, 연출은 snapshot과 이벤트만 읽는다.
// 데이터 흐름: StimulusBus → EnergyModel / LifeStats → SomaticController → (연출)

/** 이 이상(초당 기본 데미지)의 환경 자극이 이어지면 편두통 노출로 본다 */
const EXPOSURE_RATE = 0.1;

export type SimEvent =
  | { type: 'ambush'; stimulusId: string }
  | { type: 'encounter'; stimulusId: string }
  | { type: 'damage'; amount: number }
  | { type: 'tierChanged'; from: BatteryTier; to: BatteryTier }
  | { type: 'burnout' }
  | { type: 'lifeCollapse'; stat: LifeStatId }
  | SomaticEvent;

export interface SimConfig {
  energy: EnergyConfig;
  somatic: SomaticConfig;
  life: LifeStatsConfig;
}

export interface SimSnapshot {
  readonly time: number;
  readonly battery: number;
  readonly batteryMax: number;
  /** 심리 상태 0~100 (에너지를 깎는 원인) */
  readonly tension: number;
  readonly stress: number;
  readonly panic: number;
  readonly meltdown: number;
  /** 마음의 부하 = 심리 상태 중 최댓값 (연출용) */
  readonly load: number;
  /** 지금 심리 상태 때문에 초당 깎이는 에너지 */
  readonly drainPerSec: number;
  readonly tier: BatteryTier;
  readonly burnedOut: boolean;
  /** 이번 프레임까지 누적된 최근 데미지 (연출용, 초당 감쇠) */
  readonly recentDamage: number;
  readonly flush: number;
  readonly migraine: number;
  readonly stutter: number;
  readonly sweat: number;
  readonly ruminations: number;
  readonly awkwardness: number;
}

export interface SimStepInput extends EnergyContext {
  modifiers: ChannelModifiers;
  gazeCount?: number;
  coveringCheeks?: boolean;
  eyesClosed?: boolean;
  flushRiseScale?: number;
  /** 잠근 집 안 (모든 왜곡 해제) */
  sanctuary?: boolean;
  /** 좁은 공간에 지인과 단둘이 (어색한 침묵) */
  awkwardPair?: boolean;
}

export class Simulation {
  readonly bus: StimulusBus;
  readonly energy: EnergyModel;
  readonly somatic: SomaticController;
  readonly life: LifeStats;
  report: DayReport;
  private time = 0;
  private recentDamage = 0;
  private awkwardness = 0;
  private lifeCollapsed = false;
  private readonly events: SimEvent[] = [];

  constructor(
    private readonly cfg: SimConfig,
    stimuli: StimulusTable,
  ) {
    this.bus = new StimulusBus(stimuli);
    this.energy = new EnergyModel(cfg.energy);
    this.somatic = new SomaticController(cfg.somatic);
    this.life = new LifeStats(cfg.life);
    this.report = emptyReport(this.life.all(), this.life.money);
  }

  /** 주저앉은 뒤 집에서 다시 일어남: 에너지 일부, 심리 상태·증상·지속 자극 초기화 (하루 기록은 이어진다) */
  revive(battery: number): void {
    this.bus.clear();
    this.energy.revive(battery);
    this.somatic.clearAll();
    this.somatic.drainEvents();
    this.awkwardness = 0;
    this.recentDamage = 0;
  }

  /** 새 하루: 배터리 상한 설정, 하루 기록 초기화 */
  startDay(batteryMax: number): void {
    this.bus.clear();
    this.energy.startDay(batteryMax);
    this.somatic.clearAll();
    this.somatic.drainEvents();
    this.awkwardness = 0;
    this.recentDamage = 0;
    this.lifeCollapsed = false;
    this.events.length = 0;
    this.report = emptyReport(this.life.all(), this.life.money);
  }

  step(dt: number, input: SimStepInput): void {
    const before = this.energy.tier;
    const wasBurnedOut = this.energy.burnedOut;
    this.time += dt;

    // 어색한 침묵: 좁은 공간 + 지인 → 어색함 상승, 그만큼 배터리 추가 감소
    if (input.awkwardPair) {
      this.awkwardness += dt;
      this.report.silenceSec += dt;
      this.bus.setContinuous('awkward', 'awkwardSilence', 1);
    } else {
      this.awkwardness = Math.max(0, this.awkwardness - dt * 2);
      this.bus.setContinuous('awkward', 'awkwardSilence', 0);
    }

    // 편두통: 환경 소음·군중 같은 지속형 자극에 의미 있게 노출되고 있는지
    const continuousExposure = this.bus.continuousRate((k) => k.startsWith('zone:') || k.startsWith('crowd')) >= EXPOSURE_RATE;

    const result = this.bus.tick(dt);
    for (const id of result.ambushes) this.events.push({ type: 'ambush', stimulusId: id });
    for (const id of result.encounters) this.events.push({ type: 'encounter', stimulusId: id });

    const damage = this.energy.applyHits(result.hits, input.modifiers, dt);
    const batteryBefore = this.energy.battery;
    this.energy.tick(dt, { ...input, calming: input.sanctuary ?? false });
    const recovered = this.energy.battery - batteryBefore;
    if (recovered > 0) this.report.recoveredBattery += recovered;
    if (damage > 0) this.events.push({ type: 'damage', amount: damage });
    this.recentDamage = Math.max(0, this.recentDamage * Math.exp(-3 * dt)) + damage;

    this.somatic.step(dt, {
      tension: this.energy.mood('tension'),
      stress: this.energy.mood('stress'),
      panic: this.energy.mood('panic'),
      gazeCount: input.gazeCount ?? 0,
      continuousExposure,
      coveringCheeks: input.coveringCheeks ?? false,
      eyesClosed: input.eyesClosed ?? false,
      flushRiseScale: input.flushRiseScale ?? 1,
      sanctuary: input.sanctuary ?? false,
    });
    this.events.push(...this.somatic.drainEvents());

    const after = this.energy.tier;
    if (after !== before) this.events.push({ type: 'tierChanged', from: before, to: after });
    if (!wasBurnedOut && this.energy.burnedOut) this.events.push({ type: 'burnout' });
    const collapsed = this.life.collapsed;
    if (collapsed && !this.lifeCollapsed) {
      this.lifeCollapsed = true;
      this.events.push({ type: 'lifeCollapse', stat: collapsed });
    }
  }

  /** 쌓인 이벤트를 꺼낸다 (연출·게임플레이가 프레임마다 소비) */
  drainEvents(): SimEvent[] {
    return this.events.splice(0);
  }

  snapshot(): SimSnapshot {
    return {
      time: this.time,
      battery: this.energy.battery,
      batteryMax: this.energy.max,
      tension: this.energy.mood('tension'),
      stress: this.energy.mood('stress'),
      panic: this.energy.mood('panic'),
      meltdown: this.energy.mood('meltdown'),
      load: this.energy.load,
      drainPerSec: this.energy.drainPerSec,
      tier: this.energy.tier,
      burnedOut: this.energy.burnedOut,
      recentDamage: this.recentDamage,
      flush: this.somatic.intensity('flush'),
      migraine: this.somatic.intensity('migraine'),
      stutter: this.somatic.intensity('stutter'),
      sweat: this.somatic.intensity('sweat'),
      ruminations: this.bus.activeRuminations,
      awkwardness: this.awkwardness,
    };
  }
}
