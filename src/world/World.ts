import type { InteractableDef, PortalDef, SafeDef, WorldDef } from '../core/configSchemas';
import { TileMap, inRect, type Rect, type TileDef, type Vec2 } from './TileMap';

// data/world/city.json → 실행용 월드. 연산(fill/room/tiles)을 순서대로 타일에 칠하고,
// 영역·은신·세이프·상호작용·포털·스폰·경로·군중 동선을 그대로 넘긴다.

export interface World {
  map: TileMap;
  def: WorldDef;
  interactables: InteractableDef[];
  portals: PortalDef[];
  safes: SafeDef[];
  hides: { id: string; rect: Rect }[];
  spawns: Record<string, Vec2>;
  paths: Record<string, { points: Vec2[]; loop: boolean }>;
}

const v = (p: readonly [number, number]): Vec2 => ({ x: p[0], y: p[1] });

export function buildWorld(def: WorldDef, tiles: readonly TileDef[]): World {
  const [W, H] = def.size;
  const index = new Map(tiles.map((t, i) => [t.id, i]));
  const id = (name: string) => {
    const i = index.get(name);
    if (i === undefined) throw new Error(`월드: 알 수 없는 타일 "${name}" (data/world/tiles.json)`);
    return i;
  };
  const grid = new Uint16Array(W * H).fill(id(def.base));
  const fill = (r: Rect, tile: number) => {
    for (let y = Math.max(0, r[1]); y < Math.min(H, r[1] + r[3]); y++) {
      for (let x = Math.max(0, r[0]); x < Math.min(W, r[0] + r[2]); x++) grid[y * W + x] = tile;
    }
  };
  for (const op of def.ops) {
    switch (op.op) {
      case 'fill':
        fill(op.rect, id(op.tile));
        break;
      case 'room': {
        const [x, y, w, h] = op.rect;
        fill(op.rect, id(op.wall));
        if (w > 2 && h > 2) fill([x + 1, y + 1, w - 2, h - 2], id(op.floor));
        break;
      }
      case 'tiles':
        for (const [x, y] of op.at) fill([x, y, 1, 1], id(op.tile));
        break;
    }
  }
  return {
    map: new TileMap(W, H, tiles, grid, def.areas),
    def,
    interactables: def.interactables,
    portals: def.portals,
    safes: def.safes,
    hides: def.hides,
    spawns: Object.fromEntries(Object.entries(def.spawns).map(([k, p]) => [k, v(p)])),
    paths: Object.fromEntries(Object.entries(def.paths).map(([k, p]) => [k, { points: p.points.map(v), loop: p.loop }])),
  };
}

/** 위치가 속한 층 id (지상·지하·3층) */
export function layerOf(world: World, p: Vec2): string {
  return world.def.layers.find((l) => inRect(l.rect, p.x, p.y))?.id ?? world.def.layers[0]!.id;
}

export function safeAt(world: World, p: Vec2): SafeDef | null {
  return world.safes.find((s) => inRect(s.rect, p.x, p.y)) ?? null;
}

export function inHide(world: World, p: Vec2): boolean {
  return world.hides.some((h) => inRect(h.rect, p.x, p.y));
}
