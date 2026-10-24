// 신체화 디버프 (CLAUDE.md 5.7). 증상마다 강도 0~1 상태 머신.
// 홍조·편두통은 강도가 연속적으로 오르내리고, 말더듬·진땀은 스트레스 조건으로 켜지고 꺼진다.

export type Symptom = 'flush' | 'migraine' | 'stutter' | 'sweat';
export const symptoms: readonly Symptom[] = ['flush', 'migraine', 'stutter', 'sweat'];

export interface SomaticConfig {
  /** 이 스트레스 이상부터 신체화 판정 (balance.stress.somaticThreshold) */
  stressThreshold: number;
  flush: {
    /** 동시에 나를 보는 시선 수가 이 이상이면 홍조 상승 */
    gazeCount: number;
    gazeRisePerSec: number;
    decayPerSec: number;
    /** 볼 감싸기 중 추가 감소 */
    coverDecayPerSec: number;
    refusal: number;
    slip: number;
    /** 이 강도 이상이면 NPC가 "얼굴 왜 빨개요?" 지적 가능 */
    remarkThreshold: number;
  };
  migraine: {
    /** 지속형 자극이 이 시간 이상 이어지면 편두통 시작 */
    onsetSec: number;
    risePerSec: number;
    decayPerSec: number;
    /** 눈 감기 중 추가 감소 */
    eyesClosedDecayPerSec: number;
  };
  stutter: { stress: number };
  sweat: { stress: number; sustainSec: number; slipChance: number };
  remedies: { washFaceStressRelief: number };
}

export interface SomaticInput {
  stress: number;
  /** 지금 나를 보고 있는 시선 수 */
  gazeCount: number;
  /** 청각·시각 지속 자극에 노출 중인지 */
  continuousExposure: boolean;
  coveringCheeks: boolean;
  eyesClosed: boolean;
  /** 리허설 등으로 홍조 발동률 감소 (1 = 기본) */
  flushRiseScale: number;
  /** 안전지대(잠근 집)면 모든 증상이 빠르게 가라앉는다 */
  sanctuary: boolean;
}

export type SomaticEvent = { type: 'onset' | 'cleared'; symptom: Symptom };

export class SomaticController {
  private readonly level: Record<Symptom, number> = { flush: 0, migraine: 0, stutter: 0, sweat: 0 };
  private exposureSec = 0;
  private highStressSec = 0;
  private readonly events: SomaticEvent[] = [];

  constructor(private readonly cfg: SomaticConfig) {}

  intensity(s: Symptom): number {
    return this.level[s];
  }

  active(s: Symptom): boolean {
    return this.level[s] > 0.05;
  }

  /** 홍조 유발 (거절, 말실수 등) */
  trigger(s: Symptom, amount: number, scale = 1): void {
    this.set(s, this.level[s] + amount * scale);
  }

  /** NPC가 홍조를 지적하면 강도 1.0 */
  maxOut(s: Symptom): void {
    this.set(s, 1);
  }

  get flushRemarkable(): boolean {
    return this.level.flush >= this.cfg.flush.remarkThreshold;
  }

  /** 찬 음료·두통약 등: 증상 강도를 amount만큼 낮춘다 */
  relieve(s: Symptom, amount: number): void {
    this.set(s, this.level[s] - amount);
  }

  /** 찬물 세수·반려동물: 전 증상 초기화 */
  clearAll(): void {
    for (const s of symptoms) this.set(s, 0);
    this.exposureSec = 0;
    this.highStressSec = 0;
  }

  /** 진땀 상태에서 상호작용이 미끄러질지 (rng: 0~1) */
  slips(rng: number): boolean {
    return this.level.sweat > 0.5 && rng < this.cfg.sweat.slipChance;
  }

  step(dt: number, input: SomaticInput): void {
    const c = this.cfg;
    const somatic = input.stress >= c.stressThreshold;

    // 홍조: 다수 시선 + 스트레스가 높을 때 상승
    let flush = this.level.flush;
    if (!input.sanctuary && somatic && input.gazeCount >= c.flush.gazeCount) {
      flush += c.flush.gazeRisePerSec * (input.gazeCount - c.flush.gazeCount + 1) * input.flushRiseScale * dt;
    } else {
      flush -= c.flush.decayPerSec * dt;
    }
    if (input.coveringCheeks) flush -= c.flush.coverDecayPerSec * dt;
    if (input.sanctuary) flush -= c.flush.decayPerSec * 4 * dt;
    this.set('flush', flush);

    // 편두통: 지속형 자극 노출이 길어지면
    this.exposureSec = input.continuousExposure && !input.sanctuary ? this.exposureSec + dt : Math.max(0, this.exposureSec - dt * 2);
    let migraine = this.level.migraine;
    if (this.exposureSec >= c.migraine.onsetSec) migraine += c.migraine.risePerSec * dt;
    else migraine -= c.migraine.decayPerSec * dt;
    if (input.eyesClosed) migraine -= c.migraine.eyesClosedDecayPerSec * dt;
    if (input.sanctuary) migraine -= c.migraine.decayPerSec * 4 * dt;
    this.set('migraine', migraine);

    // 말더듬: 스트레스가 문턱 이상이면 즉시
    this.set('stutter', input.stress >= c.stutter.stress ? Math.min(1, (input.stress - c.stutter.stress) / 20 + 0.5) : 0);

    // 진땀: 높은 스트레스가 일정 시간 지속
    this.highStressSec = input.stress >= c.sweat.stress ? this.highStressSec + dt : 0;
    const sweatTarget = this.highStressSec >= c.sweat.sustainSec ? 1 : 0;
    this.set('sweat', this.level.sweat + (sweatTarget - this.level.sweat) * Math.min(1, dt * 0.5));
  }

  drainEvents(): SomaticEvent[] {
    return this.events.splice(0);
  }

  private set(s: Symptom, value: number): void {
    const before = this.level[s];
    const v = Math.min(1, Math.max(0, value));
    this.level[s] = v;
    if (before <= 0.05 && v > 0.05) this.events.push({ type: 'onset', symptom: s });
    if (before > 0.05 && v <= 0.05) this.events.push({ type: 'cleared', symptom: s });
  }
}
