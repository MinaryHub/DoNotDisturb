import type { BalanceConfig } from '../core/configSchemas';
import type { FxEvent, GameSession } from '../gameplay/GameSession';

/**
 * 시뮬레이션 수치를 연출 강도(0~1)로 바꾼다. 화면·오디오가 같은 값을 읽는다.
 * 수치를 보여주지 않고 감각으로 전달하기 위한 변환 계층 (CLAUDE.md 2-2). sim을 읽기만 한다.
 */
export class PresentationState {
  stress = 0;
  tired = 0;
  danger = 0;
  critical = 0;
  /** 기습 충격 (화면 흔들림), 1에서 감소 */
  trauma = 0;
  hurt = 0;
  flush = 0;
  migraine = 0;
  sweat = 0;
  stutter = 0;
  awkward = 0;
  sanctuary = 0;
  earphones = 0;
  phone = 0;
  eyes = 0;
  cover = 0;
  /** 번아웃 후 경과 시간 (-1 = 아님) */
  burnoutTime = -1;
  /** "모두 사라져 버려~" 순간 이동 직후 번지는 빛 (1 → 0) */
  warp = 0;
  /** 심박 박동 (0~1, 박동 직후 1) */
  beat = 0;
  time = 0;
  readonly ambushes: string[] = [];
  readonly sounds: Extract<FxEvent, { type: 'sound' }>[] = [];

  constructor(private readonly balance: BalanceConfig) {}

  update(dt: number, s: GameSession, fx: readonly FxEvent[]): void {
    this.time += dt;
    this.ambushes.length = 0;
    this.sounds.length = 0;
    const snap = s.snapshot;
    const tiers = this.balance.battery.tiers;
    const b = snap.battery;
    const k = 1 - Math.exp(-3 * dt);
    const slow = 1 - Math.exp(-1.2 * dt);
    const p = s.player;
    // 마음의 부하(심리 상태 중 최댓값)가 비네팅·심박을 움직인다
    this.stress += (snap.load / 100 - this.stress) * k;
    this.tired += (ramp(b, tiers.tired + 1, tiers.danger + 1) - this.tired) * k;
    this.danger += (ramp(b, tiers.danger + 1, tiers.critical + 1) - this.danger) * k;
    this.critical += (ramp(b, tiers.critical + 1, 0) - this.critical) * k;
    this.flush += (snap.flush - this.flush) * k;
    this.migraine += (snap.migraine - this.migraine) * k;
    this.sweat += (snap.sweat - this.sweat) * k;
    this.stutter += (snap.stutter - this.stutter) * k;
    this.awkward += (Math.min(1, snap.awkwardness / 10) - this.awkward) * k;
    this.sanctuary += ((s.sanctuary ? 1 : 0) - this.sanctuary) * (s.sanctuary ? 1 - Math.exp(-dt / 0.7) : slow);
    this.earphones += ((p.earphones ? 1 : 0) - this.earphones) * (1 - Math.exp(-8 * dt));
    this.phone += ((p.phonePretend || s.phoneOpen ? 1 : 0) - this.phone) * (1 - Math.exp(-8 * dt));
    this.eyes += ((p.eyesClosed ? 1 : 0) - this.eyes) * (1 - Math.exp(-10 * dt));
    this.cover += ((p.cover ? 1 : 0) - this.cover) * (1 - Math.exp(-10 * dt));
    this.hurt = Math.max(0, this.hurt - dt * 2);
    this.trauma = Math.max(0, this.trauma - dt / Math.max(0.01, this.balance.ambush.shakeSec));
    this.beat = Math.max(0, this.beat - dt * 4);
    this.warp = Math.max(0, this.warp - dt / 1.4);

    // 안전지대에서는 모든 왜곡이 풀린다
    if (this.sanctuary > 0.01) {
      const calm = 1 - this.sanctuary;
      this.danger *= calm;
      this.critical *= calm;
      this.migraine *= calm;
      this.flush *= calm;
    }
    if (snap.recentDamage > 1) this.hurt = Math.min(1, this.hurt + snap.recentDamage / 40);

    for (const e of fx) {
      if (e.type === 'ambush') {
        this.trauma = 1;
        this.ambushes.push(e.stimulusId);
      } else if (e.type === 'sound') this.sounds.push(e);
      else if (e.type === 'warp') this.warp = 1;
    }
    const burned = s.mode.kind === 'burnout';
    this.burnoutTime = burned ? (this.burnoutTime < 0 ? 0 : this.burnoutTime + dt) : -1;
  }

  /** 오디오가 심박을 칠 때 호출 */
  pulse(): void {
    this.beat = 1;
  }
}

/** value가 from에서 to로 갈수록 0→1 */
function ramp(value: number, from: number, to: number): number {
  const t = (from - value) / (from - to);
  return Math.min(1, Math.max(0, t));
}
