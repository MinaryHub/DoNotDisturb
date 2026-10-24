import type { Channel, StimulusHit } from './StimulusBus';

// 에너지(사회적 배터리)와 심리 상태 (CLAUDE.md 5.1, 5.2)
//
//   자극 ──▶ 심리 상태(긴장·스트레스·당황·멘붕, 각 0~100) ──▶ 에너지 소모
//
//   · 기습형(전화·어깨 톡톡·지적)은 당황, 대면형(말 걸기)과 시선·대화·군중은 긴장,
//     소음·업무·답장 대기·이불킥은 스트레스로 들어간다
//   · 기습·대면은 그 순간 에너지를 조금 깎고(놀람), 나머지는 상태가 높은 동안 초당 깎는다
//   · 멘붕: 긴장·스트레스·당황 중 둘 이상이 문턱을 넘으면 차오르고, 가장 크게 에너지를 깎는다
//   · 에너지가 0이 되면 주저앉는다 (번아웃). 게임이 끝나는 기준은 에너지 하나뿐이다

export type BatteryTier = 'stable' | 'tired' | 'danger' | 'critical' | 'burnout';
export type Mood = 'tension' | 'stress' | 'panic' | 'meltdown';
export const moods: readonly Mood[] = ['tension', 'stress', 'panic', 'meltdown'];
/** 자극이 직접 올리는 상태 (멘붕은 이들에서 생긴다) */
type BaseMood = Exclude<Mood, 'meltdown'>;
const baseMoods: readonly BaseMood[] = ['tension', 'stress', 'panic'];

export interface PsycheConfig {
  max: number;
  /** 자극 기본 데미지 1당 상태 상승 (자극 종류별) */
  gain: { ambush: number; encounter: number; continuous: number; rumination: number };
  /** 기습·대면 자극이 그 순간 깎는 에너지 = 기본 데미지 × hitEnergy */
  hitEnergy: number;
  /** 상태 100일 때 초당 에너지 소모 */
  drain: Record<Mood, number>;
  /** 초당 자연 감소와, 마지막 자극 후 감소가 시작되기까지의 지연 */
  decay: Record<BaseMood, number>;
  decayDelaySec: Record<BaseMood, number>;
  meltdown: { threshold: number; risePerSec: number; decayPerSec: number };
  /** 이 이상이면 증상(홍조·편두통 등) 판정 */
  symptomFrom: number;
}

export interface EnergyConfig {
  battery: {
    max: number;
    start: number;
    outdoorDrainPerSec: number;
    safeRecoverPerSec: number;
    tiers: { tired: number; danger: number; critical: number };
  };
  psyche: PsycheConfig;
}

/** 채널별 감쇠 배율 (예: 이어폰 착용 시 auditory 0.5) */
export type ChannelModifiers = Readonly<Record<Channel, number>>;
export const NO_MODIFIERS: ChannelModifiers = { auditory: 1, visual: 1, social: 1 };

export interface EnergyContext {
  /** 집 밖에 있는지 (실외 자연 감소) */
  outdoor: boolean;
  /** 세이프 존 안에 있는지 (회복) */
  inSafe: boolean;
  /** 세이프 존 외의 추가 회복 (집 안 안전지대, 내 사람 곁 등) 초당 */
  extraRecoverPerSec?: number;
  /** 안전지대: 심리 상태가 빨리 가라앉는다 */
  calming?: boolean;
}

/** 초당 이 미만의 지속 자극(차 소리·사무실 웅웅거림 등)은 '자극이 없는 상태'로 본다 (상태 자연 감소 유지) */
const BACKGROUND_RATE = 0.08;

export function tierOf(battery: number, tiers: EnergyConfig['battery']['tiers']): BatteryTier {
  if (battery <= 0) return 'burnout';
  if (battery <= tiers.critical) return 'critical';
  if (battery <= tiers.danger) return 'danger';
  if (battery <= tiers.tired) return 'tired';
  return 'stable';
}

/** 자극이 들어가는 심리 상태 */
function moodOf(hit: StimulusHit): BaseMood {
  if (hit.kind === 'ambush') return 'panic';
  if (hit.kind === 'encounter') return 'tension';
  if (hit.kind === 'rumination') return 'stress';
  return hit.channel === 'auditory' ? 'stress' : 'tension';
}

export class EnergyModel {
  private _battery: number;
  private _max: number;
  private readonly level: Record<Mood, number> = { tension: 0, stress: 0, panic: 0, meltdown: 0 };
  private readonly since: Record<BaseMood, number> = { tension: Infinity, stress: Infinity, panic: Infinity };

  constructor(private readonly cfg: EnergyConfig) {
    this._max = cfg.battery.max;
    this._battery = Math.min(cfg.battery.start, this._max);
  }

  get battery(): number {
    return this._battery;
  }

  /** 오늘의 에너지 상한 (전날 밤 회복 결과로 변동) */
  get max(): number {
    return this._max;
  }

  mood(m: Mood): number {
    return this.level[m];
  }

  /** 마음의 부하: 심리 상태 중 가장 높은 값 (화면·소리 연출, 밤 회복 계산) */
  get load(): number {
    return Math.max(this.level.tension, this.level.stress, this.level.panic, this.level.meltdown);
  }

  /** 지금 심리 상태 때문에 초당 깎이는 에너지 */
  get drainPerSec(): number {
    const d = this.cfg.psyche.drain;
    return moods.reduce((a, m) => a + (this.level[m] / 100) * d[m], 0);
  }

  get tier(): BatteryTier {
    return tierOf(this._battery, this.cfg.battery.tiers);
  }

  get burnedOut(): boolean {
    return this._battery <= 0;
  }

  /** 새 하루 시작: 상한을 정하고 가득 채운 상태로, 심리 상태 초기화 */
  startDay(max: number): void {
    this._max = Math.max(1, Math.min(this.cfg.battery.max, max));
    this._battery = this._max;
    this.reset();
  }

  /** 주저앉은 뒤 집에서 다시 일어남: 에너지 일부만, 심리 상태는 가라앉은 채로 */
  revive(battery: number): void {
    this._battery = Math.max(1, Math.min(this._max, battery));
    this.reset();
  }

  private reset(): void {
    for (const m of moods) this.level[m] = 0;
    for (const m of baseMoods) this.since[m] = Infinity;
  }

  /**
   * 자극 적용: 해당 심리 상태를 올리고, 기습·대면은 그 순간 에너지도 조금 깎는다.
   * @returns 그 순간 깎인 에너지
   */
  applyHits(hits: readonly StimulusHit[], modifiers: ChannelModifiers = NO_MODIFIERS, dt = 0): number {
    if (this.burnedOut) return 0;
    const p = this.cfg.psyche;
    let jolt = 0;
    for (const hit of hits) {
      const amount = hit.amount * modifiers[hit.channel];
      if (amount <= 0) continue;
      const m = moodOf(hit);
      this.add(m, amount * p.gain[hit.kind]);
      if (hit.kind === 'ambush' || hit.kind === 'encounter') jolt += amount * p.hitEnergy;
      // 배경 소음 같은 약한 지속 자극은 상태가 가라앉는 것까지 막지는 않는다
      const background = hit.kind === 'continuous' && dt > 0 && hit.amount / dt < BACKGROUND_RATE;
      if (!background) this.since[m] = 0;
    }
    this._battery = Math.max(0, this._battery - jolt);
    return jolt;
  }

  /** 상황이 직접 올리는 심리 상태 (업무 압박·군중 밀도·마스크 답답함·조급함·대화 실수). sustain이면 그동안 가라앉지 않는다 */
  addMood(m: BaseMood, amount: number, sustain = false): void {
    this.add(m, Math.max(0, amount));
    if (sustain) this.since[m] = 0;
  }

  /** 마음을 가라앉힘 (찬물 세수·차·반려동물·취미 등): 모든 상태를 amount만큼, 멘붕은 절반만큼 */
  calm(amount: number): void {
    if (amount <= 0) return;
    for (const m of baseMoods) this.level[m] = Math.max(0, this.level[m] - amount);
    this.level.meltdown = Math.max(0, this.level.meltdown - amount / 2);
  }

  /** 회복 아이템·이벤트. 상한을 넘지 않는다 */
  recover(amount: number): number {
    if (this.burnedOut || amount <= 0) return 0;
    const before = this._battery;
    this._battery = Math.min(this._max, this._battery + amount);
    return this._battery - before;
  }

  /** 시간 경과: 상태 자연 감소·멘붕, 상태에 따른 에너지 소모, 바깥 자연 감소, 쉼터 회복 */
  tick(dt: number, ctx: EnergyContext): void {
    if (this.burnedOut) return;
    const p = this.cfg.psyche;
    const calmScale = ctx.calming ? 3 : 1;
    for (const m of baseMoods) {
      this.since[m] += dt;
      if (this.since[m] >= p.decayDelaySec[m]) this.level[m] = Math.max(0, this.level[m] - p.decay[m] * calmScale * dt);
    }
    // 멘붕: 둘 이상이 문턱을 넘으면 차오른다 (셋이면 더 빨리)
    const hot = baseMoods.filter((m) => this.level[m] >= p.meltdown.threshold).length;
    if (hot >= 2) this.level.meltdown = Math.min(p.max, this.level.meltdown + p.meltdown.risePerSec * (hot - 1) * dt);
    else this.level.meltdown = Math.max(0, this.level.meltdown - p.meltdown.decayPerSec * calmScale * dt);

    const recover = (ctx.inSafe ? this.cfg.battery.safeRecoverPerSec : 0) + (ctx.extraRecoverPerSec ?? 0);
    let delta = -this.drainPerSec * dt;
    if (recover > 0) delta += recover * dt;
    else if (ctx.outdoor) delta -= this.cfg.battery.outdoorDrainPerSec * dt;
    this._battery = Math.max(0, Math.min(this._max, this._battery + delta));
  }

  /** 디버그용 직접 설정 */
  debugSet(values: { battery?: number } & Partial<Record<Mood, number>>): void {
    if (values.battery !== undefined) this._battery = Math.min(this._max, Math.max(0, values.battery));
    for (const m of moods) if (values[m] !== undefined) this.level[m] = Math.min(this.cfg.psyche.max, Math.max(0, values[m]!));
  }

  private add(m: Mood, v: number): void {
    this.level[m] = Math.min(this.cfg.psyche.max, this.level[m] + v);
  }
}
