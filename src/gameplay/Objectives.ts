import type { DayDef, ObjectiveDef } from '../core/configSchemas';
import { parseTime } from '../sim/DayCycle';

// 하루의 목표 진행. 게임 이벤트 문자열("enter:officeFloor", "done:meeting", "pick:martItem" …)로 완료된다.

export interface ObjectiveState {
  def: ObjectiveDef;
  progress: number;
  done: boolean;
  /** 마감을 넘겨 페널티를 이미 받았는지 */
  late: boolean;
  /** 닫히는 시각(closes)이 지나 못 하고 넘어갔는지. 뒤따르는 목표는 막지 않는다 */
  missed: boolean;
}

export type ObjectiveEvent =
  | { type: 'completed'; objective: ObjectiveState }
  | { type: 'late'; objective: ObjectiveState }
  | { type: 'missed'; objective: ObjectiveState };

export class Objectives {
  readonly list: ObjectiveState[];
  private readonly events: ObjectiveEvent[] = [];

  constructor(day: DayDef) {
    this.list = day.objectives.map((def) => ({ def, progress: 0, done: false, late: false, missed: false }));
  }

  /** 하루 중에 생기는 목표 (부탁을 받았을 때) */
  add(def: ObjectiveDef): ObjectiveState {
    const o: ObjectiveState = { def, progress: 0, done: false, late: false, missed: false };
    this.list.splice(Math.max(0, this.list.findIndex((x) => x.def.endsDay)), 0, o);
    return o;
  }

  get(id: string): ObjectiveState | undefined {
    return this.list.find((o) => o.def.id === id);
  }

  isDone(id: string): boolean {
    return this.get(id)?.done ?? false;
  }

  /** 끝났거나 놓쳐서 더는 붙잡지 않는 목표 */
  resolved(id: string): boolean {
    const o = this.get(id);
    return !!o && (o.done || o.missed);
  }

  /** 선행 목표가 모두 끝나(또는 놓쳐) 지금 진행할 수 있는지 */
  available(o: ObjectiveState): boolean {
    return !o.done && !o.missed && (o.def.requires ?? []).every((r) => this.resolved(r));
  }

  /** 화면에 보여줄 목표 (진행 가능 + 미완료, 선택 목표 포함) */
  visible(): ObjectiveState[] {
    return this.list.filter((o) => this.available(o));
  }

  /** 하루를 끝낼 수 있는 목표(침대)가 진행 가능한지 */
  get canEndDay(): boolean {
    return this.list.some((o) => o.def.endsDay && this.available(o));
  }

  /** 이벤트 발생. 선행 목표가 끝난 목표만 진행된다 */
  fire(event: string): void {
    for (const o of this.list) {
      if (o.def.on !== event || !this.available(o)) continue;
      o.progress++;
      if (o.progress >= (o.def.count ?? 1)) {
        o.done = true;
        this.events.push({ type: 'completed', objective: o });
      }
    }
  }

  /** 마감 시각 확인 (늦으면 페널티, 닫히면 놓침) */
  checkDeadlines(minutes: number): void {
    for (const o of this.list) {
      if (!o.done && !o.missed && o.def.closes && minutes >= parseTime(o.def.closes)) {
        o.missed = true;
        this.events.push({ type: 'missed', objective: o });
        continue;
      }
      if (o.done || o.late || !o.def.deadline) continue;
      if (minutes >= parseTime(o.def.deadline)) {
        o.late = true;
        this.events.push({ type: 'late', objective: o });
      }
    }
  }

  /** 선택 목표 중 하지 않은 것 */
  skippedOptional(): ObjectiveState[] {
    return this.list.filter((o) => o.def.optional && !o.done);
  }

  drainEvents(): ObjectiveEvent[] {
    return this.events.splice(0);
  }
}
