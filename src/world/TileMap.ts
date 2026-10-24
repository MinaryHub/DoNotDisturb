// 2D 타일 월드. 순수 TS (DOM 의존 없음) — 시야·길찾기·충돌을 단위 테스트할 수 있다.
// 좌표: 타일 (x, y)는 [x, x+1) × [y, y+1) 영역. 엔티티 위치는 타일 단위 실수.
// 3D 판의 Kreate 접두어 규칙(COL_/LOS_/NAV_/HIDE_/SAFE_/TRG_/SPAWN_/PATH_/ZONE_)을 그대로 옮겼다:
//   COL_  → 타일 walk=false        LOS_ → 타일 sight=true
//   NAV_  → walk=true 타일(A*)      HIDE_/SAFE_/ZONE_ → 사각형 영역
//   TRG_  → interactables/portals   SPAWN_/PATH_ → spawns/paths

export interface Vec2 {
  x: number;
  y: number;
}

export type Rect = readonly [number, number, number, number];

export interface TileDef {
  id: string;
  color: string;
  /** 지나갈 수 있는지 (false = COL_) */
  walk: boolean;
  /** 시선을 막는지 (true = LOS_) */
  sight: boolean;
  /** 벽처럼 그릴지 (입체감) */
  tall?: boolean;
  /** 무빙워크: 위에 있으면 이 방향으로 밀린다 (타일/초) */
  push?: readonly [number, number];
  /** 장식 무늬 */
  pattern?: 'none' | 'stripe' | 'dots' | 'grid' | 'plank';
  accent?: string;
}

export type AreaKind = 'outdoor' | 'indoor' | 'home';

export interface AreaDef {
  id: string;
  rect: Rect;
  kind: AreaKind;
  labelKey: string;
  /** ZONE_: 지속형 환경 자극 */
  stimulus?: { id: string; intensity: number };
  /** 좁은 공간 (지인과 단둘이면 어색한 침묵) */
  small?: boolean;
}

export function inRect(r: Rect, x: number, y: number): boolean {
  return x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
}

export function rectCenter(r: Rect): Vec2 {
  return { x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 };
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class TileMap {
  readonly tiles: Uint16Array;
  private readonly areaGrid: Int16Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly defs: readonly TileDef[],
    tiles: Uint16Array,
    readonly areas: readonly AreaDef[],
  ) {
    if (tiles.length !== width * height) throw new Error('TileMap: 타일 수가 크기와 맞지 않습니다');
    this.tiles = tiles;
    // 영역 인덱스 격자 (나중에 정의된 영역이 우선 — 큰 영역 안에 작은 방)
    this.areaGrid = new Int16Array(width * height).fill(-1);
    areas.forEach((a, i) => {
      const [ax, ay, aw, ah] = a.rect;
      for (let y = Math.max(0, ay); y < Math.min(height, ay + ah); y++) {
        for (let x = Math.max(0, ax); x < Math.min(width, ax + aw); x++) this.areaGrid[y * width + x] = i;
      }
    });
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  def(tx: number, ty: number): TileDef {
    if (!this.inBounds(tx, ty)) return this.defs[0]!;
    return this.defs[this.tiles[ty * this.width + tx]!]!;
  }

  walkable(tx: number, ty: number): boolean {
    return this.inBounds(tx, ty) && this.def(tx, ty).walk;
  }

  blocksSight(tx: number, ty: number): boolean {
    return !this.inBounds(tx, ty) || this.def(tx, ty).sight;
  }

  areaAt(x: number, y: number): AreaDef | null {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inBounds(tx, ty)) return null;
    const i = this.areaGrid[ty * this.width + tx]!;
    return i >= 0 ? this.areas[i]! : null;
  }

  area(id: string): AreaDef | undefined {
    return this.areas.find((a) => a.id === id);
  }

  /** 두 점 사이 시선이 통하는지 (격자 DDA). 시작·끝 타일 자체는 검사하지 않는다 */
  lineOfSight(a: Vec2, b: Vec2): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let tx = Math.floor(a.x);
    let ty = Math.floor(a.y);
    const endX = Math.floor(b.x);
    const endY = Math.floor(b.y);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? tx + 1 - a.x : a.x - tx) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? ty + 1 - a.y : a.y - ty) * tDeltaY : Infinity;
    let guard = 0;
    while (!(tx === endX && ty === endY) && guard++ < 4096) {
      if (tMaxX < tMaxY) {
        tMaxX += tDeltaX;
        tx += stepX;
      } else {
        tMaxY += tDeltaY;
        ty += stepY;
      }
      if (tx === endX && ty === endY) break;
      if (this.blocksSight(tx, ty)) return false;
    }
    return true;
  }

  /** 원(반지름 r)이 막힌 타일과 겹치는지 */
  circleBlocked(x: number, y: number, r: number): boolean {
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r);
    const y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.walkable(tx, ty)) continue;
        const cx = Math.max(tx, Math.min(x, tx + 1));
        const cy = Math.max(ty, Math.min(y, ty + 1));
        if ((x - cx) ** 2 + (y - cy) ** 2 < r * r) return true;
      }
    }
    return false;
  }

  /** 축 분리 이동 (벽을 따라 미끄러진다). pos를 직접 수정하고, 막혔는지 돌려준다 */
  moveCircle(pos: Vec2, dx: number, dy: number, r: number): boolean {
    let blocked = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.5)));
    for (let i = 0; i < steps; i++) {
      const sx = dx / steps;
      const sy = dy / steps;
      if (sx !== 0) {
        if (!this.circleBlocked(pos.x + sx, pos.y, r)) pos.x += sx;
        else blocked = true;
      }
      if (sy !== 0) {
        if (!this.circleBlocked(pos.x, pos.y + sy, r)) pos.y += sy;
        else blocked = true;
      }
    }
    return blocked;
  }

  /**
   * A* 길찾기 (8방향, 모서리 끼어들기 금지). 타일 중심 좌표 경로를 돌려준다.
   * 목적지가 막혀 있으면 가장 가까운 열린 타일까지.
   */
  findPath(from: Vec2, to: Vec2, maxNodes = 20000): Vec2[] | null {
    const W = this.width;
    const sx = Math.floor(from.x);
    const sy = Math.floor(from.y);
    let gx = Math.floor(to.x);
    let gy = Math.floor(to.y);
    if (!this.walkable(sx, sy)) return null;
    if (!this.walkable(gx, gy)) {
      const near = this.nearestWalkable(gx, gy, 3);
      if (!near) return null;
      gx = near.x;
      gy = near.y;
    }
    const start = sy * W + sx;
    const goal = gy * W + gx;
    const g = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const open = new MinHeap();
    const h = (i: number) => {
      const x = i % W;
      const y = (i - x) / W;
      const ddx = Math.abs(x - gx);
      const ddy = Math.abs(y - gy);
      return Math.max(ddx, ddy) + 0.414 * Math.min(ddx, ddy);
    };
    open.push(start, h(start));
    const closed = new Set<number>();
    let expanded = 0;
    while (open.size > 0) {
      const cur = open.pop()!;
      if (cur === goal) return this.reconstruct(came, cur);
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (++expanded > maxNodes) return null;
      const cx = cur % W;
      const cy = (cur - cx) / W;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox;
          const ny = cy + oy;
          if (!this.walkable(nx, ny)) continue;
          if (ox !== 0 && oy !== 0 && (!this.walkable(cx + ox, cy) || !this.walkable(cx, cy + oy))) continue;
          const ni = ny * W + nx;
          if (closed.has(ni)) continue;
          const cost = g.get(cur)! + (ox !== 0 && oy !== 0 ? 1.414 : 1);
          if (cost < (g.get(ni) ?? Infinity)) {
            g.set(ni, cost);
            came.set(ni, cur);
            open.push(ni, cost + h(ni));
          }
        }
      }
    }
    return null;
  }

  nearestWalkable(tx: number, ty: number, radius: number): Vec2 | null {
    for (let r = 0; r <= radius; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          if (this.walkable(tx + ox, ty + oy)) return { x: tx + ox, y: ty + oy };
        }
      }
    }
    return null;
  }

  /** 시작 타일에서 걸어서 닿을 수 있는 타일 집합 (검증·테스트용) */
  reachableFrom(p: Vec2): Uint8Array {
    const W = this.width;
    const seen = new Uint8Array(W * this.height);
    const sx = Math.floor(p.x);
    const sy = Math.floor(p.y);
    if (!this.walkable(sx, sy)) return seen;
    const stack = [sy * W + sx];
    seen[sy * W + sx] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W;
      const y = (i - x) / W;
      for (const [ox, oy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = x + ox;
        const ny = y + oy;
        if (!this.walkable(nx, ny)) continue;
        const ni = ny * W + nx;
        if (seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    return seen;
  }

  private reconstruct(came: Map<number, number>, end: number): Vec2[] {
    const W = this.width;
    const out: Vec2[] = [];
    let cur: number | undefined = end;
    while (cur !== undefined) {
      const x = cur % W;
      out.push({ x: x + 0.5, y: (cur - x) / W + 0.5 });
      cur = came.get(cur);
    }
    out.reverse();
    return this.smooth(out);
  }

  /** 시야가 통하고 몸이 지나갈 수 있는 중간 점은 건너뛴다 */
  private smooth(path: Vec2[]): Vec2[] {
    if (path.length <= 2) return path;
    const out: Vec2[] = [path[0]!];
    let anchor = path[0]!;
    for (let i = 2; i < path.length; i++) {
      if (!this.walkLine(anchor, path[i]!)) {
        anchor = path[i - 1]!;
        out.push(anchor);
      }
    }
    out.push(path[path.length - 1]!);
    return out;
  }

  private walkLine(a: Vec2, b: Vec2): boolean {
    const d = dist(a, b);
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (this.circleBlocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0.3)) return false;
    }
    return true;
  }
}

/** A*용 이진 힙 */
class MinHeap {
  private readonly items: number[] = [];
  private readonly prio: number[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: number, p: number): void {
    this.items.push(item);
    this.prio.push(p);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.prio[parent]! <= this.prio[i]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const lastItem = this.items.pop()!;
    const lastPrio = this.prio.pop()!;
    if (this.items.length > 0) {
      this.items[0] = lastItem;
      this.prio[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.items.length && this.prio[l]! < this.prio[m]!) m = l;
        if (r < this.items.length && this.prio[r]! < this.prio[m]!) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!];
    [this.prio[a], this.prio[b]] = [this.prio[b]!, this.prio[a]!];
  }
}
