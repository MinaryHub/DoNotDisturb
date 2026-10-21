import * as THREE from 'three';
import type { StageConfig } from '../core/configSchemas';
import type { Mover } from '../world/Mover';

type ElevatorConfig = NonNullable<StageConfig['elevator']>;

export type ElevatorPhase = 'closed' | 'opening' | 'open' | 'closing' | 'moving';

/**
 * 2개 이상 층을 오가는 엘리베이터. 칸(mover)은 Y로, 각 층 승강장 문(mover)은 +X로 미끄러진다.
 * - 호출 버튼: 칸이 그 층에 있으면 문을 열고, 아니면 그 층으로 보낸다.
 * - 칸 안 닫힘 버튼: 문이 열려 있으면 남은 시간을 줄이고(연타), 다른 층을 목적지로 정한다.
 * - 문이 닫히는 중 사람이 문턱에 있으면 다시 연다.
 */
export class Elevator {
  phase: ElevatorPhase = 'closed';
  stopIndex: number;
  private targetIndex: number | null = null;
  /** 문 열림 정도 0(닫힘)~1(열림) */
  private doorT = 0;
  private openTimer = 0;
  private readonly car: Mover;
  private readonly doors: Mover[];

  constructor(
    private readonly cfg: ElevatorConfig,
    movers: ReadonlyMap<string, Mover>,
  ) {
    const car = movers.get(cfg.car);
    if (!car) throw new Error(`엘리베이터 칸 mover "${cfg.car}"가 레벨에 없습니다`);
    this.car = car;
    this.doors = cfg.stops.map((s) => {
      const door = movers.get(s.door);
      if (!door) throw new Error(`엘리베이터 문 mover "${s.door}"가 레벨에 없습니다`);
      return door;
    });
    const start = cfg.stops.findIndex((s) => s.floor === cfg.startStop);
    this.stopIndex = start >= 0 ? start : 0;
    this.car.setOffset(new THREE.Vector3(0, this.stopOffset(this.stopIndex), 0));
  }

  private stopOffset(i: number): number {
    return this.cfg.stops[i]!.offsetY;
  }

  get floor(): string {
    return this.cfg.stops[this.stopIndex]!.floor;
  }

  get carOffsetY(): number {
    return this.car.offset.y;
  }

  /** 스테이지 이벤트 처리. 엘리베이터 관련이면 true */
  handleEvent(eventId: string): boolean {
    const callIndex = this.cfg.stops.findIndex((s) => s.callEvent === eventId);
    if (callIndex >= 0) {
      this.call(callIndex);
      return true;
    }
    if (eventId === this.cfg.panelEvent) {
      this.pressPanel();
      return true;
    }
    return false;
  }

  call(index: number): void {
    if (this.phase === 'moving') {
      this.targetIndex ??= index;
      return;
    }
    if (index === this.stopIndex) {
      if (this.phase === 'closed' || this.phase === 'closing') this.phase = 'opening';
      else if (this.phase === 'open') this.openTimer = this.cfg.doorOpenSec;
    } else {
      this.targetIndex = index;
      if (this.phase === 'open' || this.phase === 'opening') this.phase = 'closing';
      else if (this.phase === 'closed') this.phase = 'moving';
    }
  }

  pressPanel(): void {
    if (this.phase === 'moving') return;
    // 2층 이상 구성에서는 다음 정지 층을 목적지로 (스테이지 1은 1층↔3층)
    this.targetIndex = (this.stopIndex + 1) % this.cfg.stops.length;
    if (this.phase === 'open') this.openTimer = Math.max(0, this.openTimer - this.cfg.closePressCutSec);
    else if (this.phase === 'closed') this.phase = 'moving';
  }

  /**
   * @param blocked 현재 층 문턱에 사람이 있는지 (닫히는 문을 다시 연다)
   */
  fixedUpdate(dt: number, blocked: boolean): void {
    const doorStep = dt / this.cfg.doorMoveSec;
    switch (this.phase) {
      case 'opening':
        this.doorT = Math.min(1, this.doorT + doorStep);
        if (this.doorT >= 1) {
          this.phase = 'open';
          this.openTimer = this.cfg.doorOpenSec;
        }
        break;
      case 'open':
        this.openTimer -= dt;
        if (this.openTimer <= 0 && !blocked) this.phase = 'closing';
        break;
      case 'closing':
        if (blocked) {
          this.phase = 'opening';
          break;
        }
        this.doorT = Math.max(0, this.doorT - doorStep);
        if (this.doorT <= 0) this.phase = this.targetIndex !== null && this.targetIndex !== this.stopIndex ? 'moving' : 'closed';
        break;
      case 'moving': {
        const target = this.targetIndex ?? this.stopIndex;
        const goal = this.stopOffset(target);
        const y = this.car.offset.y;
        const step = this.cfg.speed * dt;
        const next = Math.abs(goal - y) <= step ? goal : y + Math.sign(goal - y) * step;
        this.car.setOffset(new THREE.Vector3(0, next, 0));
        if (next === goal) {
          this.stopIndex = target;
          this.targetIndex = null;
          this.phase = 'opening';
        }
        break;
      }
      case 'closed':
        break;
    }
    this.doors.forEach((door, i) => {
      const t = i === this.stopIndex && this.phase !== 'moving' ? this.doorT : 0;
      const x = this.cfg.doorSlide * t;
      if (door.offset.x !== x) door.setOffset(new THREE.Vector3(x, 0, 0));
    });
  }

  beginStep(): void {
    this.car.beginStep();
    for (const d of this.doors) d.beginStep();
  }
}
