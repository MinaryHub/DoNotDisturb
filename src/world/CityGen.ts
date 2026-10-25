import type { WorldDef } from '../core/configSchemas';
/** 사각형 [x, y, 너비, 높이] (city.json과 같은 모양) */
type Rect = [number, number, number, number];

// 넓은 도시 자동 생성 (data/world/districts.json). 씨앗이 같으면 늘 같은 도시가 나온다.
// 구역마다 양식(도심·번화가·시장·주택가·캠퍼스·강변)에 맞춰 길·블록·건물(안쪽 가구까지)·간판·가로등·군중 동선·동네 사람을 깐다.
// 손으로 만든 해오름동(city.json)과 랜드마크(landmarks.json)는 그대로 두고, 그 사이를 채운다.
// 결과는 city.json과 같은 모양의 조각이라 나머지 코드는 손으로 만든 월드와 구별하지 않는다.

export type Style = 'downtown' | 'nightlife' | 'market' | 'residential' | 'campus' | 'riverside';

export interface DistrictDef {
  id: string;
  nameKey: string;
  rect: Rect;
  style: Style;
  /** 랜드마크 자리: 이 사각형과 겹치는 블록은 비워 둔다 */
  reserve?: Rect[];
  /** 블록 크기와 길 너비 (없으면 양식 기본값) */
  block?: [number, number];
  street?: number;
  /** 동네 사람: 프로필마다 몇 명 (길을 따라 오간다) */
  ambient?: { profile: string; count: number; from?: string; to?: string; chance?: number }[];
  /** 영역 자극 (구역 바깥 공기: 번화가 소음 등) */
  stimulus?: { id: string; intensity: number };
}

export interface DistrictsConfig {
  seed: number;
  macro?: Partial<WorldPart>;
  districts: DistrictDef[];
}

type Op = WorldDef['ops'][number];
type Area = WorldDef['areas'][number];
type Interactable = WorldDef['interactables'][number];
type Prop = NonNullable<WorldDef['props']>[number];
type Label = WorldDef['labels'][number];
type Lane = WorldDef['crowdLanes'][number];

export interface Ambient {
  id: string;
  profile: string;
  at: string;
  path?: string;
  from?: string;
  to?: string;
  chance?: number;
}

/** 월드에 덧붙이는 조각 (city.json과 같은 모양, 일부만) */
export interface WorldPart {
  ops: Op[];
  areas: Area[];
  hides: { id: string; rect: Rect }[];
  interactables: Interactable[];
  spawns: Record<string, [number, number]>;
  paths: Record<string, { points: [number, number][]; loop: boolean }>;
  crowdLanes: Lane[];
  props: Prop[];
  labels: Label[];
  ambient: Ambient[];
}

export function emptyPart(): WorldPart {
  return { ops: [], areas: [], hides: [], interactables: [], spawns: {}, paths: {}, crowdLanes: [], props: [], labels: [], ambient: [] };
}

/** 조각들을 차례로 덧붙인다 (칠하기·영역은 뒤에 온 것이 앞을 덮는다) */
export function mergeWorld(base: WorldDef, ...parts: Partial<WorldPart>[]): WorldDef {
  const out: WorldDef = {
    ...base,
    ops: [...base.ops],
    areas: [...base.areas],
    hides: [...base.hides],
    interactables: [...base.interactables],
    spawns: { ...base.spawns },
    paths: { ...base.paths },
    crowdLanes: [...base.crowdLanes],
    props: [...(base.props ?? [])],
    labels: [...base.labels],
    ambient: [...(base.ambient ?? [])],
  };
  for (const p of parts) {
    out.ops.push(...(p.ops ?? []));
    out.areas.push(...(p.areas ?? []));
    out.hides.push(...(p.hides ?? []));
    out.interactables.push(...(p.interactables ?? []));
    Object.assign(out.spawns, p.spawns ?? {});
    Object.assign(out.paths, p.paths ?? {});
    out.crowdLanes.push(...(p.crowdLanes ?? []));
    out.props!.push(...(p.props ?? []));
    out.labels.push(...(p.labels ?? []));
    out.ambient!.push(...(p.ambient ?? []));
  }
  return out;
}

// ───────────────────────── 건물 종류 ─────────────────────────

interface BuildingType {
  floor: string;
  /** 들어갈 수 있는지 (집·기숙사는 문이 없다) */
  enter: boolean;
  stimulus?: string;
  /** 간판 색 (없으면 간판 없음) */
  sign?: string;
  /** 이름 후보 수: gen.<종류>.1 … N (data/text) */
  names: number;
  furnish: (b: Building, g: Gen) => void;
}

interface Building {
  id: string;
  type: string;
  rect: Rect;
  /** 문이 있는 벽: 위(-1) 또는 아래(+1) */
  face: -1 | 1;
  doorX: number;
}

/** 안쪽 사각형 (벽 제외) */
const inner = (r: Rect): Rect => [r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2];

/** 문에서 곧장 들어가는 통로(두 칸)를 비워 두고 가구를 줄지어 놓는다 */
function rows(b: Building, g: Gen, tile: string, every: number, opts: { len?: number; skipFront?: number; skipBack?: number } = {}): void {
  const [ix, iy, iw, ih] = inner(b.rect);
  const front = opts.skipFront ?? 2;
  const back = opts.skipBack ?? 1;
  const rowsY: number[] = [];
  for (let k = front; k < ih - back; k += every) rowsY.push(b.face === -1 ? iy + k : iy + ih - 1 - k);
  for (const y of rowsY) {
    // 통로 양옆으로 나눠 놓는다
    const left: Rect = [ix + 1, y, b.doorX - ix - 2, 1];
    const right: Rect = [b.doorX + 3, y, ix + iw - b.doorX - 4, 1];
    for (const r of [left, right]) if (r[2] >= 2) g.op({ op: 'fill', rect: [r[0], r[1], Math.min(r[2], opts.len ?? r[2]), 1], tile });
  }
}

/** 안쪽 맨 뒤 벽을 따라 놓는 카운터와 그 앞(통로 끝) 상호작용 지점 */
function backCounter(b: Building, g: Gen, tile = 'counter'): [number, number] {
  const [ix, iy, iw, ih] = inner(b.rect);
  const y = b.face === -1 ? iy + ih - 1 : iy;
  g.op({ op: 'fill', rect: [ix + 1, y, iw - 2, 1], tile });
  return [b.doorX + 1, b.face === -1 ? y - 0.4 : y + 1.4];
}

function plants(b: Building, g: Gen): void {
  const [ix, iy, iw, ih] = inner(b.rect);
  g.op({ op: 'tiles', tile: 'plant', at: [[ix, iy], [ix + iw - 1, iy + ih - 1]] });
}

const TYPES: Record<string, BuildingType> = {
  office: { floor: 'floorOffice', enter: true, stimulus: 'officeHum', names: 8, furnish: (b, g) => (rows(b, g, 'desk', 3), plants(b, g)) },
  tower: {
    floor: 'floorTile',
    enter: true,
    stimulus: 'officeHum',
    names: 8,
    furnish: (b, g) => {
      const at = backCounter(b, g, 'appliance');
      plants(b, g);
      g.interact({ kind: 'flavor', at, labelKey: 'interact.gen.tower', monologue: 'mono.gen.tower' }, b);
    },
  },
  cafe: {
    floor: 'floorWood',
    enter: true,
    stimulus: 'cafeChatter',
    sign: '#5b7d63',
    names: 10,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'table', 3, { len: 4 });
      g.interact({ kind: 'shop', at, labelKey: 'interact.cafeOrder', shop: 'cafe' }, b);
    },
  },
  restaurant: {
    floor: 'floorRestaurant',
    enter: true,
    stimulus: 'restaurantNoise',
    sign: '#a8432f',
    names: 10,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'table', 3, { len: 4 });
      g.interact({ kind: 'soloMeal', at, labelKey: 'interact.gen.soloMeal', price: 8000 }, b);
    },
  },
  bar: {
    floor: 'floorRestaurant',
    enter: true,
    stimulus: 'restaurantNoise',
    sign: '#6c3a5c',
    names: 10,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'table', 3, { len: 3 });
      g.interact({ kind: 'flavor', at, labelKey: 'interact.menu', monologue: 'mono.gen.bar' }, b);
    },
  },
  convenience: {
    floor: 'floorStore',
    enter: true,
    stimulus: 'storeMusic',
    sign: '#3b6fb6',
    names: 4,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'shelf', 3);
      g.interact({ kind: 'shop', at, labelKey: 'interact.convShop', shop: 'convStore' }, b);
    },
  },
  pharmacy: {
    floor: 'floorBath',
    enter: true,
    sign: '#2e8b57',
    names: 6,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'shelf', 4);
      g.interact({ kind: 'shop', at, labelKey: 'interact.gen.pharmacy', shop: 'pharmacy' }, b);
    },
  },
  bakery: {
    floor: 'floorWood',
    enter: true,
    sign: '#b07a3a',
    names: 6,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'shelf', 4, { len: 6 });
      g.interact({ kind: 'shop', at, labelKey: 'interact.bakery', shop: 'bakery' }, b);
    },
  },
  clothing: {
    floor: 'floorStore',
    enter: true,
    stimulus: 'storeMusic',
    sign: '#2f2f35',
    names: 8,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'rack', 3);
      g.interact({ kind: 'flavor', at, labelKey: 'interact.gen.clothing', monologue: 'mono.gen.clothing' }, b);
    },
  },
  bookshop: {
    floor: 'floorWood',
    enter: true,
    sign: '#8a5a3c',
    names: 6,
    furnish: (b, g) => {
      const at = backCounter(b, g, 'bookshelf');
      rows(b, g, 'bookshelf', 3);
      g.interact({ kind: 'browse', at, labelKey: 'interact.gen.browse' }, b);
    },
  },
  karaoke: {
    floor: 'floorCarpet',
    enter: true,
    stimulus: 'buskingMusic',
    sign: '#8a3fb5',
    names: 6,
    furnish: (b, g) => {
      rows(b, g, 'partition', 3, { len: 5 });
      const at = backCounter(b, g);
      g.interact({ kind: 'flavor', at, labelKey: 'interact.gen.karaoke', monologue: 'mono.gen.karaoke' }, b);
    },
  },
  marketShop: {
    floor: 'floorStore',
    enter: true,
    stimulus: 'marketChatter',
    sign: '#c0392b',
    names: 12,
    furnish: (b, g) => {
      const at = backCounter(b, g);
      rows(b, g, 'shelf', 3, { len: 4 });
      g.interact({ kind: 'flavor', at, labelKey: 'interact.gen.marketShop', monologue: 'mono.gen.marketShop' }, b);
    },
  },
  laundromat: {
    floor: 'floorTile',
    enter: true,
    stimulus: 'laundryHum',
    sign: '#3b6fb6',
    names: 4,
    furnish: (b, g) => {
      const at = backCounter(b, g, 'washer');
      rows(b, g, 'washer', 4, { len: 5 });
      g.interact({ kind: 'flavor', at, labelKey: 'interact.gen.laundromat', monologue: 'mono.gen.laundromat' }, b);
    },
  },
  lecture: {
    floor: 'floorOffice',
    enter: true,
    names: 8,
    furnish: (b, g) => {
      rows(b, g, 'desk', 2);
      const at = backCounter(b, g, 'counter');
      g.interact({ kind: 'flavor', at, labelKey: 'interact.gen.lecture', monologue: 'mono.gen.lecture' }, b);
    },
  },
  studentHall: {
    floor: 'floorTile',
    enter: true,
    stimulus: 'cafeChatter',
    names: 4,
    furnish: (b, g) => {
      const at = backCounter(b, g, 'vending');
      rows(b, g, 'table', 3, { len: 4 });
      g.interact({ kind: 'shop', at, labelKey: 'interact.gen.vending', shop: 'vending' }, b);
    },
  },
  house: { floor: 'floorWood', enter: false, names: 6, furnish: () => undefined },
  villa: { floor: 'floorWood', enter: false, names: 6, furnish: () => undefined },
  dorm: { floor: 'floorWood', enter: false, names: 4, furnish: () => undefined },
};

/** 양식마다 건물 종류의 비중 */
const MIX: Record<Exclude<Style, 'riverside'>, Record<string, number>> = {
  downtown: { office: 5, tower: 3, cafe: 2, restaurant: 2, convenience: 1, clothing: 1, pharmacy: 1, bakery: 1, bookshop: 1 },
  nightlife: { bar: 4, cafe: 3, restaurant: 3, karaoke: 2, convenience: 1, clothing: 1, bookshop: 1 },
  market: { marketShop: 5, restaurant: 2, house: 3, pharmacy: 1, bakery: 1, convenience: 1 },
  residential: { house: 6, villa: 4, convenience: 1, cafe: 1, laundromat: 1, bakery: 1 },
  campus: { lecture: 4, dorm: 2, studentHall: 1, cafe: 1, bookshop: 1 },
};

const DEFAULTS: Record<Style, { block: [number, number]; street: number; streetTile: string; crowd: number; lamp: number }> = {
  downtown: { block: [40, 26], street: 6, streetTile: 'sidewalk', crowd: 6, lamp: 12 },
  nightlife: { block: [30, 22], street: 6, streetTile: 'plaza', crowd: 6, lamp: 10 },
  market: { block: [24, 16], street: 4, streetTile: 'alley', crowd: 4, lamp: 14 },
  residential: { block: [30, 22], street: 5, streetTile: 'alley', crowd: 1, lamp: 16 },
  campus: { block: [56, 40], street: 6, streetTile: 'sidewalk', crowd: 2, lamp: 18 },
  riverside: { block: [0, 0], street: 0, streetTile: 'sidewalk', crowd: 3, lamp: 20 },
};

// ───────────────────────── 생성기 ─────────────────────────

class Gen {
  readonly part = emptyPart();
  private n = 0;
  constructor(private readonly rand: () => number) {}

  r(): number {
    return this.rand();
  }

  int(a: number, b: number): number {
    return a + Math.floor(this.rand() * (b - a + 1));
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rand() * items.length)]!;
  }

  weighted(mix: Record<string, number>): string {
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    let k = this.rand() * total;
    for (const [id, w] of Object.entries(mix)) if ((k -= w) <= 0) return id;
    return Object.keys(mix)[0]!;
  }

  op(o: Op): void {
    this.part.ops.push(o);
  }

  uid(prefix: string): string {
    return `${prefix}_${++this.n}`;
  }

  interact(i: Omit<Interactable, 'id'>, b: Building): void {
    this.part.interactables.push({ id: this.uid(`${b.id}_it`), ...i } as Interactable);
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 모든 구역을 생성해 한 조각으로 */
export function generateCity(cfg: DistrictsConfig): WorldPart {
  const out = emptyPart();
  const m = cfg.macro ?? {};
  out.ops.push(...(m.ops ?? []));
  out.areas.push(...(m.areas ?? []));
  out.hides.push(...(m.hides ?? []));
  out.interactables.push(...(m.interactables ?? []));
  Object.assign(out.spawns, m.spawns ?? {});
  Object.assign(out.paths, m.paths ?? {});
  out.crowdLanes.push(...(m.crowdLanes ?? []));
  out.props.push(...(m.props ?? []));
  out.labels.push(...(m.labels ?? []));
  out.ambient.push(...(m.ambient ?? []));
  for (const d of cfg.districts) {
    const g = new Gen(mulberry32(cfg.seed ^ hashStr(d.id)));
    if (d.style === 'riverside') riverside(d, g);
    else blocks(d, g);
    ambient(d, g);
    const p = g.part;
    out.ops.push(...p.ops);
    out.areas.push(...p.areas);
    out.hides.push(...p.hides);
    out.interactables.push(...p.interactables);
    Object.assign(out.spawns, p.spawns);
    Object.assign(out.paths, p.paths);
    out.crowdLanes.push(...p.crowdLanes);
    out.props.push(...p.props);
    out.labels.push(...p.labels);
    out.ambient.push(...p.ambient);
  }
  return out;
}

/** 길 사이 블록에 건물을 채운다 (도심·번화가·시장·주택가·캠퍼스) */
function blocks(d: DistrictDef, g: Gen): void {
  const def = DEFAULTS[d.style];
  const [bw, bh] = d.block ?? def.block;
  const sw = d.street ?? def.street;
  const [x0, y0, w, h] = d.rect;
  g.part.areas.push({ id: d.id, rect: d.rect, kind: 'outdoor', labelKey: d.nameKey, ...(d.stimulus ? { stimulus: d.stimulus } : {}) });
  g.op({ op: 'fill', rect: d.rect, tile: def.streetTile });
  const campus = d.style === 'campus';
  const streetsY: number[] = [];
  for (let by = y0 + sw; by + Math.min(bh, 10) <= y0 + h; by += bh + sw) {
    streetsY.push(by - sw / 2);
    for (let bx = x0 + sw; bx + Math.min(bw, 10) <= x0 + w; bx += bw + sw) {
      const block: Rect = [bx, by, Math.min(bw, x0 + w - bx - 1), Math.min(bh, y0 + h - by - 1)];
      if (block[2] < 10 || block[3] < 9) continue;
      if (d.reserve?.some((r) => overlaps(r, block))) continue;
      if (campus) campusBlock(d, g, block);
      else cityBlock(d, g, block);
    }
  }
  streetsY.push(y0 + h - sw / 2);
  // 가로등·군중: 가로 길마다
  streetsY.forEach((sy, i) => {
    if (sy < y0 || sy > y0 + h) return;
    for (let x = x0 + 4; x < x0 + w - 2; x += def.lamp) g.part.props.push({ kind: 'lamp', at: [x, Math.round(sy * 10) / 10] });
    if (def.crowd > 0 && i % 2 === 0) {
      const dir = i % 4 === 0;
      g.part.crowdLanes.push({
        id: g.uid(`${d.id}_lane`),
        from: [dir ? x0 + 1 : x0 + w - 1, sy],
        to: [dir ? x0 + w - 1 : x0 + 1, sy],
        width: Math.max(1, sw / 3),
        // crowd = 길 60칸마다 몇 명 (도심·번화가는 붐빈다)
        count: Math.max(1, Math.round((def.crowd * w) / 60)),
        speed: 1.2 + g.r() * 0.3,
        zone: d.id,
      });
    }
  });
}

/** 도시 블록: 한두 줄로 필지를 나눠 건물을 세운다 (블록 가장자리 한 칸은 길) */
function cityBlock(d: DistrictDef, g: Gen, block: Rect): void {
  const [bx, by, bw, bh] = block;
  const mix = MIX[d.style as keyof typeof MIX];
  const twoRows = bh >= 18;
  const rowsDef: { y: number; h: number; face: -1 | 1 }[] = twoRows
    ? [
        { y: by + 1, h: Math.floor((bh - 3) / 2), face: -1 },
        { y: by + 2 + Math.floor((bh - 3) / 2), h: bh - 3 - Math.floor((bh - 3) / 2), face: 1 },
      ]
    : [{ y: by + 1, h: bh - 2, face: g.r() < 0.5 ? -1 : 1 }];
  for (const row of rowsDef) {
    let x = bx + 1;
    const end = bx + bw - 1;
    while (end - x >= 8) {
      const left = end - x;
      const lw = left < 20 ? left : Math.min(left - 9, g.int(9, 16));
      const type = g.weighted(mix);
      building(d, g, type, [x, row.y, lw, row.h], row.face);
      x += lw + 1;
    }
  }
  // 블록 모서리 나무 (문 앞은 피한다)
  g.op({ op: 'tiles', tile: 'tree', at: [[bx, by], [bx + bw - 1, by + bh - 1]] });
}

/** 캠퍼스 블록: 잔디 가운데 큰 건물 하나, 문에서 길까지 보도, 둘레에 나무·벤치 */
function campusBlock(d: DistrictDef, g: Gen, block: Rect): void {
  const [bx, by, bw, bh] = block;
  g.op({ op: 'fill', rect: block, tile: 'grass' });
  const w = Math.floor(bw * (0.45 + g.r() * 0.2));
  const h = Math.floor(bh * (0.4 + g.r() * 0.15));
  const rx = bx + Math.floor((bw - w) / 2);
  const ry = by + Math.floor((bh - h) / 2);
  const face: -1 | 1 = g.r() < 0.5 ? -1 : 1;
  const type = g.weighted(MIX.campus);
  const b = building(d, g, type, [rx, ry, w, h], face);
  // 문에서 길까지 보도
  if (b && TYPES[type]!.enter) {
    const py = face === -1 ? by : ry + h;
    const ph = face === -1 ? ry - by : by + bh - (ry + h);
    g.op({ op: 'fill', rect: [b.doorX, py, 2, ph], tile: 'sidewalk' });
  }
  const trees: [number, number][] = [];
  for (let k = 0; k < 8; k++) {
    const tx = g.int(bx + 1, bx + bw - 2);
    const ty = g.int(by + 1, by + bh - 2);
    if (tx >= rx - 1 && tx <= rx + w && ty >= ry - 2 && ty <= ry + h + 1) continue;
    if (b && Math.abs(tx - b.doorX) < 3) continue;
    trees.push([tx, ty]);
  }
  if (trees.length) g.op({ op: 'tiles', tile: 'tree', at: trees });
  const benchY = by + 2;
  const benchX = bx + 3;
  if (!(b && Math.abs(benchX - b.doorX) < 4)) {
    g.op({ op: 'fill', rect: [benchX, benchY, 3, 1], tile: 'bench' });
    g.part.interactables.push({ id: g.uid(`${d.id}_bench`), kind: 'bench', at: [benchX + 1.5, benchY + 1.6], labelKey: 'interact.bench' } as Interactable);
  }
}

/** 건물 하나: 벽·바닥·문·창, 안쪽 가구와 상호작용, 영역, 간판 */
function building(d: DistrictDef, g: Gen, type: string, rect: Rect, face: -1 | 1): Building | null {
  const t = TYPES[type]!;
  const [x, y, w, h] = rect;
  if (w < 8 || h < 7) return null;
  const id = g.uid(`${d.id}_b`);
  g.op({ op: 'room', rect, floor: t.floor, wall: 'wall' });
  const wallY = face === -1 ? y : y + h - 1;
  const doorX = x + Math.floor(w / 2) - 1;
  // 창 (문 양옆으로 띄엄띄엄)
  for (let wx = x + 2; wx < x + w - 2; wx += 3) if (wx + 1 < doorX || wx > doorX + 2) g.op({ op: 'fill', rect: [wx, wallY, 2, 1], tile: 'window' });
  const b: Building = { id, type, rect, face, doorX };
  const nameKey = `gen.${type}.${g.int(1, t.names)}`;
  g.part.areas.push({ id, rect, kind: 'indoor', labelKey: nameKey, ...(t.stimulus ? { stimulus: { id: t.stimulus, intensity: 1 } } : {}) });
  if (t.enter) {
    g.op({ op: 'fill', rect: [doorX, wallY, 2, 1], tile: 'door' });
    t.furnish(b, g);
    if (t.sign) g.part.labels.push({ at: [doorX + 1, face === -1 ? y - 0.6 : y + h + 0.6], textKey: nameKey, color: t.sign });
  }
  return b;
}

/** 강변: 잔디·자전거길·나무 줄·벤치·수풀 (강물과 다리는 랜드마크) */
function riverside(d: DistrictDef, g: Gen): void {
  const [x0, y0, w, h] = d.rect;
  g.part.areas.push({ id: d.id, rect: d.rect, kind: 'outdoor', labelKey: d.nameKey, ...(d.stimulus ? { stimulus: d.stimulus } : {}) });
  g.op({ op: 'fill', rect: d.rect, tile: 'grass' });
  const pathY = y0 + Math.floor(h / 2) - 1;
  g.op({ op: 'fill', rect: [x0, pathY, w, 3], tile: 'sidewalk' });
  const trees: [number, number][] = [];
  for (let x = x0 + 3; x < x0 + w - 2; x += 7) {
    trees.push([x, pathY - 3], [x + 3, pathY + 5]);
  }
  g.op({ op: 'tiles', tile: 'tree', at: trees });
  for (let x = x0 + 12; x < x0 + w - 6; x += 34) {
    g.op({ op: 'fill', rect: [x, pathY - 1, 3, 1], tile: 'bench' });
    g.part.interactables.push({ id: g.uid(`${d.id}_bench`), kind: 'bench', at: [x + 1.5, pathY + 0.6], labelKey: 'interact.streamBench' } as Interactable);
    g.part.props.push({ kind: 'lamp', at: [x + 6, pathY - 0.6] });
  }
  for (let x = x0 + 20; x < x0 + w - 6; x += 46) {
    const r: Rect = [x, y0 + 2, 4, 2];
    g.op({ op: 'fill', rect: r, tile: 'bush' });
    g.part.hides.push({ id: g.uid(`${d.id}_reed`), rect: r });
  }
  const cy = pathY + 1;
  g.part.crowdLanes.push(
    { id: g.uid(`${d.id}_jog`), from: [x0 + 1, cy - 0.6], to: [x0 + w - 1, cy - 0.6], width: 1, count: Math.max(2, Math.round(w / 90)), speed: 2.1, zone: d.id },
    { id: g.uid(`${d.id}_walk`), from: [x0 + w - 1, cy + 0.7], to: [x0 + 1, cy + 0.7], width: 1, count: Math.max(2, Math.round(w / 70)), speed: 0.9, zone: d.id },
  );
}

/** 동네 사람: 가로 길을 따라 오가는 순찰 경로를 만들어 준다 */
function ambient(d: DistrictDef, g: Gen): void {
  const def = DEFAULTS[d.style];
  const [x0, y0, w, h] = d.rect;
  const sw = d.street ?? def.street;
  const bh = (d.block ?? def.block)[1];
  const ys: number[] = [];
  if (d.style === 'riverside') ys.push(y0 + Math.floor(h / 2) + 0.5);
  else for (let by = y0 + sw; by <= y0 + h; by += bh + sw) ys.push(by - sw / 2);
  if (!ys.length) return;
  for (const a of d.ambient ?? []) {
    for (let i = 0; i < a.count; i++) {
      // 랜드마크 자리(reserve)를 지나지 않는 길 구간을 고른다
      let y = 0;
      let len = 0;
      let xa = 0;
      for (let tries = 0; tries < 20; tries++) {
        y = g.pick(ys);
        len = g.int(20, 60);
        xa = g.int(x0 + 2, Math.max(x0 + 2, x0 + w - len - 2));
        const seg: Rect = [xa - 1, Math.floor(y) - 1, len + 2, 3];
        if (!d.reserve?.some((r) => overlaps(r, seg))) break;
      }
      const id = g.uid(`${d.id}_${a.profile}`);
      g.part.spawns[id] = [xa, y];
      g.part.paths[id] = { points: [[xa, y], [xa + len, y]], loop: true };
      g.part.ambient.push({ id, profile: a.profile, at: id, path: id, ...(a.from ? { from: a.from } : {}), ...(a.to ? { to: a.to } : {}), ...(a.chance !== undefined ? { chance: a.chance } : {}) });
    }
  }
}
