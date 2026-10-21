import { EnergyModel, type BatteryTier, type ChannelModifiers, type EnergyConfig, type EnergyContext } from './EnergyModel';
import { StimulusBus, type StimulusTable } from './StimulusBus';

// 시뮬레이션 계층의 진입점. 게임플레이는 입력(자극·상황)을 넣고, 연출은 snapshot과 이벤트만 읽는다.

export type SimEvent =
  | { type: 'ambush'; stimulusId: string }
  | { type: 'encounter'; stimulusId: string }
  | { type: 'damage'; amount: number }
  | { type: 'tierChanged'; from: BatteryTier; to: BatteryTier }
  | { type: 'burnout' };

export interface SimSnapshot {
  readonly time: number;
  readonly battery: number;
  readonly batteryMax: number;
  readonly stress: number;
  readonly stressMax: number;
  readonly tier: BatteryTier;
  readonly burnedOut: boolean;
  /** 이번 프레임까지 누적된 최근 데미지 (연출용, 초당 감쇠) */
  readonly recentDamage: number;
}

export interface SimStepInput extends EnergyContext {
  modifiers: ChannelModifiers;
}

export class Simulation {
  readonly bus: StimulusBus;
  readonly energy: EnergyModel;
  private time = 0;
  private recentDamage = 0;
  private readonly events: SimEvent[] = [];

  constructor(
    private readonly energyConfig: EnergyConfig,
    stimuli: StimulusTable,
  ) {
    this.bus = new StimulusBus(stimuli);
    this.energy = new EnergyModel(energyConfig);
  }

  step(dt: number, input: SimStepInput): void {
    const before = this.energy.tier;
    const wasBurnedOut = this.energy.burnedOut;
    this.time += dt;

    const result = this.bus.tick(dt);
    for (const id of result.ambushes) this.events.push({ type: 'ambush', stimulusId: id });
    for (const id of result.encounters) this.events.push({ type: 'encounter', stimulusId: id });

    const damage = this.energy.applyHits(result.hits, input.modifiers);
    this.energy.tick(dt, input);
    if (damage > 0) this.events.push({ type: 'damage', amount: damage });
    this.recentDamage = Math.max(0, this.recentDamage * Math.exp(-3 * dt)) + damage;

    const after = this.energy.tier;
    if (after !== before) this.events.push({ type: 'tierChanged', from: before, to: after });
    if (!wasBurnedOut && this.energy.burnedOut) this.events.push({ type: 'burnout' });
  }

  /** 쌓인 이벤트를 꺼낸다 (연출·게임플레이가 프레임마다 소비) */
  drainEvents(): SimEvent[] {
    return this.events.splice(0);
  }

  snapshot(): SimSnapshot {
    return {
      time: this.time,
      battery: this.energy.battery,
      batteryMax: this.energyConfig.battery.max,
      stress: this.energy.stress,
      stressMax: this.energyConfig.stress.max,
      tier: this.energy.tier,
      burnedOut: this.energy.burnedOut,
      recentDamage: this.recentDamage,
    };
  }
}
