import type { MonologueTrigger, NpcType } from '../core/configSchemas';

// 내면 독백 (CLAUDE.md 5.11). 상황·거리 조건에 맞는 문구를 고른다. 문구는 data/monologue/<lang>.csv.

export interface MonologueNpcInfo {
  profileId: string;
  type: NpcType;
  dist: number;
  visible: boolean;
  noticed: boolean;
}

export interface MonologueContext {
  areaId: string | null;
  npcs: readonly MonologueNpcInfo[];
  /** 오늘 할 일을 마치고 귀가 중 */
  returning: boolean;
}

export interface MonologueLine {
  key: string;
  text: string;
  /** 표시 시간 */
  duration: number;
  age: number;
}

export class MonologueDirector {
  current: MonologueLine | null = null;
  private readonly queue: MonologueLine[] = [];
  private readonly cooldown = new Map<number, number>();
  private readonly fired = new Set<number>();
  private lastArea: string | null = null;
  private checkTimer = 0;

  constructor(
    private readonly triggers: readonly MonologueTrigger[],
    private readonly texts: Readonly<Record<string, string>>,
  ) {}

  /** 이벤트 기반 독백 ("phone:ring", "onset:flush" …) */
  onEvent(event: string): void {
    this.triggers.forEach((tr, i) => {
      if (tr.when.event === event) this.tryFire(i);
    });
  }

  /** 직접 키로 띄우기 (상호작용 flavor 등) */
  say(key: string): void {
    const text = this.texts[key];
    if (text) this.push(key, text);
  }

  update(dt: number, ctx: MonologueContext): void {
    for (const [i, left] of this.cooldown) this.cooldown.set(i, left - dt);
    if (this.current) {
      this.current.age += dt;
      if (this.current.age >= this.current.duration) this.current = null;
    }
    if (!this.current && this.queue.length) this.current = this.queue.shift()!;

    const enteredArea = ctx.areaId !== this.lastArea ? ctx.areaId : null;
    this.lastArea = ctx.areaId;
    this.checkTimer -= dt;
    if (this.checkTimer > 0 && !enteredArea) return;
    this.checkTimer = 0.5;

    this.triggers.forEach((tr, i) => {
      const w = tr.when;
      if (w.event !== undefined) return;
      if (w.area !== undefined) {
        if (enteredArea !== w.area) return;
        if (w.returning !== undefined && w.returning !== ctx.returning) return;
        this.tryFire(i);
        return;
      }
      if (w.npcProfile === undefined && w.npcType === undefined) return;
      const match = ctx.npcs.some(
        (n) =>
          (w.npcProfile === undefined || n.profileId === w.npcProfile) &&
          (w.npcType === undefined || n.type === w.npcType) &&
          n.dist >= (w.distMin ?? 0) &&
          n.dist <= (w.distMax ?? Infinity) &&
          (!w.visible || n.visible) &&
          (!w.noticed || n.noticed),
      );
      if (match) this.tryFire(i);
    });
  }

  clear(): void {
    this.current = null;
    this.queue.length = 0;
  }

  /** 새 하루: 1회성 기록과 쿨다운 초기화 */
  reset(): void {
    this.clear();
    this.cooldown.clear();
    this.fired.clear();
    this.lastArea = null;
  }

  private tryFire(i: number): void {
    const tr = this.triggers[i]!;
    if (tr.once && this.fired.has(i)) return;
    if ((this.cooldown.get(i) ?? 0) > 0) return;
    const text = this.texts[tr.key];
    if (!text) return;
    this.fired.add(i);
    this.cooldown.set(i, tr.cooldownSec ?? 30);
    this.push(tr.key, text);
  }

  private push(key: string, text: string): void {
    if (this.current?.key === key || this.queue.some((q) => q.key === key)) return;
    const line = { key, text, duration: 2.2 + text.length * 0.07, age: 0 };
    if (this.queue.length >= 2) this.queue.shift();
    if (!this.current) this.current = line;
    else this.queue.push(line);
  }
}
