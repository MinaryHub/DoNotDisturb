// 미니게임 로직 (DOM 없음). 화면은 presentation/ui가 이 상태를 읽어 그린다.

/** 업무 미니게임: 집중해서 일을 쳐내는 동안 메신저 알림이 쏟아진다 (스테이지 2 '알림 폭탄') */
export interface WorkPing {
  id: number;
  from: 'boss' | 'team' | 'hr';
  age: number;
}

export type WorkEvent = { type: 'ping'; ping: WorkPing } | { type: 'pingIgnored'; ping: WorkPing } | { type: 'task' } | { type: 'done' };

export class WorkGame {
  progress = 0;
  tasksDone = 0;
  readonly pings: WorkPing[] = [];
  private nextPing: number;
  private seq = 0;
  private readonly events: WorkEvent[] = [];

  constructor(
    readonly tasks: number,
    private readonly focusPerSec: number,
    private readonly pingEvery: readonly [number, number],
    private readonly pingTimeout: number,
    private readonly rng: () => number,
  ) {
    this.nextPing = pingEvery[0];
  }

  get done(): boolean {
    return this.tasksDone >= this.tasks;
  }

  update(dt: number, focusing: boolean): void {
    if (this.done) return;
    // 답하지 않은 알림이 있으면 집중이 반으로 줄어든다
    if (focusing) this.progress += this.focusPerSec * dt * (this.pings.length > 0 ? 0.5 : 1);
    if (this.progress >= 100) {
      this.progress = 0;
      this.tasksDone++;
      this.events.push({ type: 'task' });
      if (this.done) {
        this.events.push({ type: 'done' });
        return;
      }
    }
    this.nextPing -= dt;
    if (this.nextPing <= 0) {
      this.nextPing = this.pingEvery[0] + this.rng() * (this.pingEvery[1] - this.pingEvery[0]);
      const r = this.rng();
      const ping: WorkPing = { id: ++this.seq, from: r < 0.3 ? 'boss' : r < 0.8 ? 'team' : 'hr', age: 0 };
      this.pings.push(ping);
      this.events.push({ type: 'ping', ping });
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]!;
      p.age += dt;
      if (p.age >= this.pingTimeout) {
        this.pings.splice(i, 1);
        this.events.push({ type: 'pingIgnored', ping: p });
      }
    }
  }

  /** 가장 오래된 알림에 답장 */
  reply(): WorkPing | null {
    return this.pings.shift() ?? null;
  }

  drainEvents(): WorkEvent[] {
    return this.events.splice(0);
  }
}

/** 건반 연주 (취미): 표시된 건반을 차례로 누른다. 틀려도 벌은 없다 — 다시 그 음부터. */
export class PianoGame {
  index = 0;
  mistakes = 0;
  lastNote = -1;
  lastCorrect = true;

  constructor(readonly melody: readonly number[]) {}

  get done(): boolean {
    return this.index >= this.melody.length;
  }

  get expected(): number {
    return this.melody[this.index] ?? -1;
  }

  press(note: number): boolean {
    if (this.done) return false;
    this.lastNote = note;
    this.lastCorrect = note === this.expected;
    if (this.lastCorrect) this.index++;
    else this.mistakes++;
    return this.lastCorrect;
  }
}

/** 작은 별 — 도도솔솔라라솔 파파미미레레도 (0=도 … 6=시) */
export const PIANO_MELODY = [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0];

/** 고기 굽기 (회식): 익으면 뒤집고, 타면 모두가 쳐다본다. 굽는 동안은 [집중 노동 중] */
export interface GrillSlot {
  t: number;
}

export type GrillEvent = { type: 'served'; slot: number } | { type: 'burnt'; slot: number } | { type: 'tooEarly'; slot: number };

export class GrillGame {
  readonly slots: GrillSlot[];
  served = 0;
  burnt = 0;
  private readonly events: GrillEvent[] = [];

  constructor(
    readonly cookSec: number,
    readonly burnSec: number,
    rng: () => number,
  ) {
    this.slots = [0, 1, 2].map(() => ({ t: rng() * cookSec * 0.6 }));
  }

  state(i: number): 'raw' | 'cooked' | 'burnt' {
    const t = this.slots[i]!.t;
    if (t < this.cookSec) return 'raw';
    if (t < this.cookSec + this.burnSec) return 'cooked';
    return 'burnt';
  }

  update(dt: number): void {
    this.slots.forEach((s, i) => {
      s.t += dt;
      if (this.state(i) === 'burnt') {
        this.burnt++;
        s.t = 0;
        this.events.push({ type: 'burnt', slot: i });
      }
    });
  }

  flip(i: number): void {
    const s = this.slots[i];
    if (!s) return;
    if (this.state(i) === 'cooked') {
      this.served++;
      s.t = 0;
      this.events.push({ type: 'served', slot: i });
    } else this.events.push({ type: 'tooEarly', slot: i });
  }

  drainEvents(): GrillEvent[] {
    return this.events.splice(0);
  }
}
