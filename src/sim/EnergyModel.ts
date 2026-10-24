import type { Channel, StimulusHit } from './StimulusBus';

// 사회적 배터리와 스트레스 게이지 (CLAUDE.md 5.1, 5.2)

export type BatteryTier = 'stable' | 'tired' | 'danger' | 'critical' | 'burnout';

export interface EnergyConfig {
  battery: {
    max: number;
    start: number;
    outdoorDrainPerSec: number;
    safeRecoverPerSec: number;
    tiers: { tired: number; danger: number; critical: number };
  };
  stress: {
    max: number;
    decayPerSec: number;
    /** 최종 데미지 1당 스트레스 상승량 */
    gainPerDamage: number;
    /** 마지막 자극 후 이 시간이 지나야 스트레스가 감소하기 시작 */
    decayDelaySec: number;
  };
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
}

/** 초당 이 미만의 지속 자극은 '자극이 없는 상태'로 본다 (스트레스 자연 감소 유지) */
const BACKGROUND_RATE = 0.5;

export function tierOf(battery: number, tiers: EnergyConfig['battery']['tiers']): BatteryTier {
  if (battery <= 0) return 'burnout';
  if (battery <= tiers.critical) return 'critical';
  if (battery <= tiers.danger) return 'danger';
  if (battery <= tiers.tired) return 'tired';
  return 'stable';
}

export class EnergyModel {
  private _battery: number;
  private _stress = 0;
  private _max: number;
  private sinceStimulus = Infinity;

  constructor(private readonly cfg: EnergyConfig) {
    this._max = cfg.battery.max;
    this._battery = Math.min(cfg.battery.start, this._max);
  }

  get battery(): number {
    return this._battery;
  }

  /** 오늘의 배터리 상한 (전날 밤 회복 결과로 변동) */
  get max(): number {
    return this._max;
  }

  get stress(): number {
    return this._stress;
  }

  get tier(): BatteryTier {
    return tierOf(this._battery, this.cfg.battery.tiers);
  }

  get burnedOut(): boolean {
    return this._battery <= 0;
  }

  /** 배터리 감소 배율 = 1 + stress / 100 */
  get stressMultiplier(): number {
    return 1 + this._stress / 100;
  }

  /** 새 하루 시작: 상한을 정하고 가득 채운 상태로 시작, 스트레스 초기화 */
  startDay(max: number): void {
    this._max = Math.max(1, Math.min(this.cfg.battery.max, max));
    this._battery = this._max;
    this._stress = 0;
    this.sinceStimulus = Infinity;
  }

  /**
   * 자극 적용. 최종 데미지 = 기본 데미지 × 스트레스 배율 × 채널 배율.
   * @returns 실제로 깎인 배터리 양
   */
  applyHits(hits: readonly StimulusHit[], modifiers: ChannelModifiers = NO_MODIFIERS, dt = 0): number {
    if (this.burnedOut) return 0;
    let total = 0;
    for (const hit of hits) {
      if (hit.amount <= 0) continue;
      const damage = hit.amount * this.stressMultiplier * modifiers[hit.channel];
      if (damage <= 0) continue;
      total += damage;
      this._stress = Math.min(this.cfg.stress.max, this._stress + damage * this.cfg.stress.gainPerDamage);
      // 배경 소음 같은 약한 지속 자극은 스트레스가 가라앉는 것까지 막지는 않는다
      const background = hit.kind === 'continuous' && dt > 0 && hit.amount / dt < BACKGROUND_RATE;
      if (!background) this.sinceStimulus = 0;
    }
    this._battery = Math.max(0, this._battery - total);
    return total;
  }

  /** 회복 아이템·이벤트 (간식 +20, 약속 취소 +50 등). 상한을 넘지 않는다 */
  recover(amount: number): number {
    if (this.burnedOut || amount <= 0) return 0;
    const before = this._battery;
    this._battery = Math.min(this._max, this._battery + amount);
    return this._battery - before;
  }

  /** 스트레스 직접 상승 (마스크 답답함 등, 배터리는 깎지 않음) */
  addStress(amount: number): void {
    this._stress = Math.min(this.cfg.stress.max, this._stress + Math.max(0, amount));
  }

  /** 스트레스 직접 완화 (찬물 세수, 반려동물 등) */
  relieveStress(amount: number): void {
    this._stress = Math.max(0, this._stress - amount);
  }

  /** 시간 경과: 실외 자연 감소, 세이프 존 회복, 스트레스 자연 감소 */
  tick(dt: number, ctx: EnergyContext): void {
    if (this.burnedOut) return;
    this.sinceStimulus += dt;
    if (this.sinceStimulus >= this.cfg.stress.decayDelaySec) {
      this._stress = Math.max(0, this._stress - this.cfg.stress.decayPerSec * dt);
    }
    const recover = (ctx.inSafe ? this.cfg.battery.safeRecoverPerSec : 0) + (ctx.extraRecoverPerSec ?? 0);
    if (recover > 0) {
      this._battery = Math.min(this._max, this._battery + recover * dt);
    } else if (ctx.outdoor) {
      this._battery = Math.max(0, this._battery - this.cfg.battery.outdoorDrainPerSec * dt);
    }
  }

  /** 디버그용 직접 설정 */
  debugSet(values: { battery?: number; stress?: number }): void {
    if (values.battery !== undefined) this._battery = Math.min(this._max, Math.max(0, values.battery));
    if (values.stress !== undefined) this._stress = Math.min(this.cfg.stress.max, Math.max(0, values.stress));
  }
}
