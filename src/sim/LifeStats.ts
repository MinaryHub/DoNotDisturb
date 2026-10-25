// 생활 지표 — 회피의 대가 (CLAUDE.md 5.4)
// 회피는 생활 지표를 깎고, 감수한 상호작용은 지표와 소득(재화)을 준다.

export const lifeStatIds = ['income', 'housing', 'essentials', 'bond'] as const;
export type LifeStatId = (typeof lifeStatIds)[number];
export type LifeDelta = Partial<Record<LifeStatId, number>>;

export interface LifeStatsConfig {
  max: number;
  start: Record<LifeStatId, number>;
  startMoney: number;
  /** 같은 대상을 이 횟수만큼 회피하면 상위 자극으로 에스컬레이션 */
  escalateAfter: number;
  lowTipBelow?: number;
  softCap?: { from: number; keep: number };
}

export interface AvoidResult {
  count: number;
  /** 이번 회피로 에스컬레이션 문턱에 도달했는지 */
  escalate: boolean;
}

/** 생활 지표가 왜 바뀌었는지 (하루 동안 쌓는다). why = 텍스트 키 'why.<why>', who = 대상(연락처·목표 id) */
export interface LifeChange {
  stat: LifeStatId;
  delta: number;
  why: string;
  who?: string;
}

export interface LifeSnapshot {
  values: Record<LifeStatId, number>;
  money: number;
  avoidCounts: Record<string, number>;
}

export class LifeStats {
  private values: Record<LifeStatId, number>;
  private _money: number;
  private readonly avoidCounts = new Map<string, number>();
  /** 오늘 생활 지표가 바뀐 기록 (이유와 함께) */
  readonly ledger: LifeChange[] = [];

  constructor(private readonly cfg: LifeStatsConfig) {
    this.values = { ...cfg.start };
    this._money = cfg.startMoney;
  }

  get(id: LifeStatId): number {
    return this.values[id];
  }

  get money(): number {
    return this._money;
  }

  all(): Readonly<Record<LifeStatId, number>> {
    return this.values;
  }

  /** why: 왜 바뀌었는지 (화면에 보여 줄 이유), who: 대상 */
  apply(delta: LifeDelta, why = 'other', who?: string): void {
    for (const id of lifeStatIds) {
      const d = delta[id];
      if (d === undefined || d === 0) continue;
      const before = this.values[id];
      this.values[id] = Math.min(this.cfg.max, Math.max(0, before + (d > 0 ? this.softened(before, d) : d)));
      const real = this.values[id] - before;
      if (real !== 0) this.ledger.push({ stat: id, delta: real, why, who });
    }
  }

  /** 높을수록 덜 오른다 (softCap.from 위에서 max에 가까울수록 keep배까지) */
  private softened(value: number, gain: number): number {
    const sc = this.cfg.softCap;
    if (!sc || value + gain <= sc.from) return gain;
    const below = Math.max(0, sc.from - value);
    const span = this.cfg.max - sc.from;
    const mid = Math.min(1, (Math.max(value, sc.from) - sc.from + (gain - below) / 2) / span);
    // 지표는 정수로 둔다 (오르는 일이면 적어도 1)
    return Math.max(1, Math.round(below + (gain - below) * (1 - (1 - sc.keep) * mid)));
  }

  clearLedger(): void {
    this.ledger.length = 0;
  }

  addMoney(amount: number): void {
    this._money += amount;
  }

  /** 지불. 잔액이 모자라면 false (지불하지 않음) */
  spend(amount: number): boolean {
    if (amount > this._money) return false;
    this._money -= amount;
    return true;
  }

  /** 대상(연락처·NPC id) 회피 기록 */
  recordAvoid(targetId: string): AvoidResult {
    const count = (this.avoidCounts.get(targetId) ?? 0) + 1;
    this.avoidCounts.set(targetId, count);
    return { count, escalate: count % this.cfg.escalateAfter === 0 };
  }

  /** 대상과 마주했으면 회피 누적을 초기화 */
  recordAccept(targetId: string): void {
    this.avoidCounts.delete(targetId);
  }

  avoidCount(targetId: string): number {
    return this.avoidCounts.get(targetId) ?? 0;
  }

  /** 0이 된 지표 (생활 붕괴). 여러 개면 첫 번째 */
  get collapsed(): LifeStatId | null {
    return lifeStatIds.find((id) => this.values[id] <= 0) ?? null;
  }

  snapshot(): LifeSnapshot {
    return { values: { ...this.values }, money: this._money, avoidCounts: Object.fromEntries(this.avoidCounts) };
  }

  restore(s: LifeSnapshot): void {
    this.values = { ...s.values };
    this._money = s.money;
    this.avoidCounts.clear();
    for (const [k, v] of Object.entries(s.avoidCounts)) this.avoidCounts.set(k, v);
  }
}
