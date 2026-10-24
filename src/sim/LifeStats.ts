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
}

export interface AvoidResult {
  count: number;
  /** 이번 회피로 에스컬레이션 문턱에 도달했는지 */
  escalate: boolean;
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

  apply(delta: LifeDelta): void {
    for (const id of lifeStatIds) {
      const d = delta[id];
      if (d === undefined || d === 0) continue;
      this.values[id] = Math.min(this.cfg.max, Math.max(0, this.values[id] + d));
    }
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
