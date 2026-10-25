import type { BusRouteDef } from '../core/configSchemas';

// 마을버스 시간표 (city.json의 bus + balance.json의 bus). 시각(분)만으로 버스 위치가 정해진다.
// 동쪽 방면은 서쪽 끝에서, 서쪽 방면은 동쪽 끝에서 intervalMin마다 출발해 정류장마다 dwellMin씩 선다.
// 화면의 버스와 플레이어가 기다리는 버스가 같은 시간표를 따른다.

export type BusDir = 1 | -1;

export interface BusTiming {
  intervalMin: number;
  tilesPerMin: number;
  dwellMin: number;
}

export interface BusOnRoad {
  x: number;
  y: number;
  dir: BusDir;
  /** 출발 시각 (같은 버스를 알아보는 데 쓴다) */
  depart: number;
  /** 정류장에 서 있는지 */
  stopped: boolean;
}

export class BusRoute {
  constructor(
    private readonly route: BusRouteDef,
    private readonly t: BusTiming,
  ) {}

  private start(dir: BusDir): number {
    return dir === 1 ? this.route.fromX : this.route.toX;
  }

  /** 이 방향으로 지나는 정류장 x (지나는 순서대로) */
  private stopsAlong(dir: BusDir): number[] {
    const xs = Object.values(this.route.stops).map((s) => s.x);
    return xs.sort((a, b) => (a - b) * dir);
  }

  /** 출발 뒤 이 정류장에 닿기까지 걸리는 분 (정류장에 서는 시간 포함) */
  private reachMin(dir: BusDir, x: number): number {
    const before = this.stopsAlong(dir).filter((s) => (s - x) * dir < 0).length;
    return Math.abs(x - this.start(dir)) / this.t.tilesPerMin + before * this.t.dwellMin;
  }

  /** 출발 뒤 elapsed분이 지났을 때 버스의 x와 정류장에 서 있는지. 노선을 벗어났으면 null */
  private positionAfter(dir: BusDir, elapsed: number): { x: number; stopped: boolean } | null {
    if (elapsed < 0) return null;
    let x = this.start(dir);
    let left = elapsed;
    for (const s of this.stopsAlong(dir)) {
      const run = Math.abs(s - x) / this.t.tilesPerMin;
      if (left < run) return { x: x + dir * left * this.t.tilesPerMin, stopped: false };
      left -= run;
      x = s;
      if (left < this.t.dwellMin) return { x, stopped: true };
      left -= this.t.dwellMin;
    }
    const end = dir === 1 ? this.route.toX : this.route.fromX;
    const nx = x + dir * left * this.t.tilesPerMin;
    return (nx - end) * dir > 0 ? null : { x: nx, stopped: false };
  }

  /** 지금 도로 위의 버스들 */
  busesAt(now: number): BusOnRoad[] {
    const out: BusOnRoad[] = [];
    for (const dir of [1, -1] as BusDir[]) {
      const offset = dir === 1 ? 0 : this.t.intervalMin / 2;
      const span = Math.abs(this.route.toX - this.route.fromX) / this.t.tilesPerMin + this.stopsAlong(dir).length * this.t.dwellMin;
      const latest = Math.floor((now - offset) / this.t.intervalMin) * this.t.intervalMin + offset;
      for (let depart = latest; depart > now - span - this.t.intervalMin; depart -= this.t.intervalMin) {
        const p = this.positionAfter(dir, now - depart);
        if (p) out.push({ x: p.x, y: this.laneY(dir), dir, depart, stopped: p.stopped });
      }
    }
    return out;
  }

  /** 정류장(x)에 now 이후 처음 서는 버스의 출발 시각과 도착 시각 */
  nextAt(dir: BusDir, x: number, now: number): { depart: number; arrive: number } {
    const offset = dir === 1 ? 0 : this.t.intervalMin / 2;
    const reach = this.reachMin(dir, x);
    // 정류장에 서 있는 동안 왔으면 그 버스를 탄다
    let depart = Math.ceil((now - reach - this.t.dwellMin - offset) / this.t.intervalMin) * this.t.intervalMin + offset;
    if (depart + reach + this.t.dwellMin <= now) depart += this.t.intervalMin;
    return { depart, arrive: depart + reach };
  }

  /** 이 출발 버스가 now에 있는 곳 (정류장을 지나 목적지까지) */
  busAt(dir: BusDir, depart: number, now: number): BusOnRoad | null {
    const p = this.positionAfter(dir, now - depart);
    return p ? { x: p.x, y: this.laneY(dir), dir, depart, stopped: p.stopped } : null;
  }

  /** 이 출발 버스가 정류장(x)을 떠나는 시각 */
  leavesAt(dir: BusDir, depart: number, x: number): number {
    return depart + this.reachMin(dir, x) + this.t.dwellMin;
  }

  /** 이 출발 버스가 정류장(x)에 닿는 시각 */
  reachesAt(dir: BusDir, depart: number, x: number): number {
    return depart + this.reachMin(dir, x);
  }

  laneY(dir: BusDir): number {
    return dir === 1 ? this.route.laneEastY : this.route.laneWestY;
  }

  /** 정류장에서 내리는 자리: 동쪽 방면은 남쪽 보도, 서쪽 방면은 북쪽 보도 */
  alightAt(dir: BusDir, x: number): { x: number; y: number } {
    return { x, y: dir === 1 ? this.route.curbSouthY : this.route.curbNorthY };
  }

  stopX(id: string): number {
    return this.route.stops[id]!.x;
  }
}
