import type { BalanceConfig } from '../core/configSchemas';
import type { SimEvent, SimSnapshot } from '../sim/Simulation';

/**
 * 시뮬레이션 수치를 연출 강도(0~1)로 바꾼다. 후처리·카메라·오디오가 같은 값을 읽는다.
 * 수치를 보여주지 않고 감각으로 전달하기 위한 변환 계층 (CLAUDE.md 2-2).
 */
export class PresentationState {
  /** 스트레스 0~1 (부드럽게 따라감) */
  stress = 0;
  /** Tired 구간 진입 정도 0~1 */
  tired = 0;
  /** Danger 구간 진입 정도 0~1 */
  danger = 0;
  /** Critical 구간 진입 정도 0~1 */
  critical = 0;
  /** 기습 충격 (카메라 셰이크), 1에서 감소 */
  trauma = 0;
  /** 번아웃 후 경과 시간 */
  burnoutTime = -1;
  /** 최근 피해 펄스 0~1 */
  hurt = 0;
  time = 0;
  readonly ambushes: string[] = [];

  constructor(private readonly balance: BalanceConfig) {}

  update(dt: number, snap: SimSnapshot, events: readonly SimEvent[], shakeSec: number): void {
    this.time += dt;
    this.ambushes.length = 0;
    const tiers = this.balance.battery.tiers;
    const b = snap.battery;
    const k = 1 - Math.exp(-3 * dt);
    this.stress += (snap.stress / snap.stressMax - this.stress) * k;
    this.tired += (ramp(b, tiers.tired + 1, tiers.danger + 1) - this.tired) * k;
    this.danger += (ramp(b, tiers.danger + 1, tiers.critical + 1) - this.danger) * k;
    this.critical += (ramp(b, tiers.critical + 1, 0) - this.critical) * k;
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.trauma = Math.max(0, this.trauma - dt / Math.max(0.01, shakeSec));

    for (const e of events) {
      if (e.type === 'ambush') {
        this.trauma = 1;
        this.ambushes.push(e.stimulusId);
      }
      if (e.type === 'damage' && e.amount > 1) this.hurt = Math.min(1, this.hurt + e.amount / 20);
    }
    if (snap.burnedOut) this.burnoutTime = this.burnoutTime < 0 ? 0 : this.burnoutTime + dt;
  }

  reset(): void {
    this.stress = this.tired = this.danger = this.critical = this.trauma = this.hurt = 0;
    this.burnoutTime = -1;
  }
}

/** value가 from에서 to로 갈수록 0→1 */
function ramp(value: number, from: number, to: number): number {
  const t = (from - value) / (from - to);
  return Math.min(1, Math.max(0, t));
}
