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
}

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
  private sinceStimulus = Infinity;

  constructor(private readonly cfg: EnergyConfig) {
    this._battery = cfg.battery.start;
  }

  get battery(): number {
    return this._battery;
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

  /**
   * 자극 적용. 최종 데미지 = 기본 데미지 × 스트레스 배율 × 채널 배율.
   * @returns 실제로 깎인 배터리 양
   */
  applyHits(hits: readonly StimulusHit[], modifiers: ChannelModifiers = NO_MODIFIERS): number {
    if (this.burnedOut) return 0;
    let total = 0;
    for (const hit of hits) {
      if (hit.amount <= 0) continue;
      const damage = hit.amount * this.stressMultiplier * modifiers[hit.channel];
      if (damage <= 0) continue;
      total += damage;
      this._stress = Math.min(this.cfg.stress.max, this._stress + damage * this.cfg.stress.gainPerDamage);
      this.sinceStimulus = 0;
    }
    this._battery = Math.max(0, this._battery - total);
    return total;
  }

  /** 시간 경과: 실외 자연 감소, 세이프 존 회복, 스트레스 자연 감소 */
  tick(dt: number, ctx: EnergyContext): void {
    if (this.burnedOut) return;
    this.sinceStimulus += dt;
    if (this.sinceStimulus >= this.cfg.stress.decayDelaySec) {
      this._stress = Math.max(0, this._stress - this.cfg.stress.decayPerSec * dt);
    }
    if (ctx.inSafe) {
      this._battery = Math.min(this.cfg.battery.max, this._battery + this.cfg.battery.safeRecoverPerSec * dt);
    } else if (ctx.outdoor) {
      this._battery = Math.max(0, this._battery - this.cfg.battery.outdoorDrainPerSec * dt);
    }
  }

  /** 디버그용 직접 설정 */
  debugSet(values: { battery?: number; stress?: number }): void {
    if (values.battery !== undefined) this._battery = Math.min(this.cfg.battery.max, Math.max(0, values.battery));
    if (values.stress !== undefined) this._stress = Math.min(this.cfg.stress.max, Math.max(0, values.stress));
  }
}
