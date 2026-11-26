import fs from 'node:fs';
import path from 'node:path';
import { buildWorld } from '../src/world/World';
import { readConfig } from './lib/readData';

// npx tsx tools/world-fingerprint.ts — 웹 판이 만든 월드의 지문을 game/tests/fixtures/world_fingerprint.json에 쓴다.
// Godot 판(game/tests/test_world.gd)이 같은 지문을 다시 계산해 비교한다: 자동 생성(CityGen)·칠하기(World)·
// 영역 격자·길찾기·시선이 두 판에서 똑같은지. 월드 데이터나 생성 규칙을 바꾸면 다시 돌린다.
//
// 지문 규칙 (game/tests/test_world.gd의 canon·fnv와 같아야 한다)
// - 숫자: Math.round(v * 1000)의 십진 문자열 (실수 표기 차이를 없앤다)
// - 객체: 키를 정렬해 {k:v,…}, 배열: [a,b,…], 문자열 그대로, true/false, null
// - 해시: canon 문자열의 UTF-8 바이트에 32비트 FNV-1a

const cfg = readConfig();
const world = buildWorld(cfg.world, cfg.tiles);
const map = world.map;

function canon(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(Math.round(v * 1000));
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${k}:${canon(o[k])}`)
    .join(',')}}`;
}

function fnvBytes(bytes: ArrayLike<number>, h = 2166136261): number {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i]!, 16777619) >>> 0;
  return h >>> 0;
}

const hashOf = (v: unknown): number => fnvBytes(Buffer.from(canon(v), 'utf8'));

/** 정수 배열 해시 (값마다 4바이트 리틀 엔디언) */
function fnvInts(values: ArrayLike<number>): number {
  let h = 2166136261;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]! >>> 0;
    h = Math.imul(h ^ (v & 0xff), 16777619);
    h = Math.imul(h ^ ((v >>> 8) & 0xff), 16777619);
    h = Math.imul(h ^ ((v >>> 16) & 0xff), 16777619);
    h = Math.imul(h ^ ((v >>> 24) & 0xff), 16777619);
  }
  return h >>> 0;
}

const W = map.width;
const H = map.height;
const tileCounts: Record<string, number> = {};
for (const d of cfg.tiles) tileCounts[d.id] = 0;
for (let i = 0; i < map.tiles.length; i++) tileCounts[cfg.tiles[map.tiles[i]!]!.id]!++;

// 영역 격자 (칸마다 영역 번호, 없으면 -1)
const areaIdx = new Int32Array(W * H);
const areaIndex = new Map(map.areas.map((a, i) => [a, i]));
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const a = map.areaAt(x + 0.5, y + 0.5);
  areaIdx[y * W + x] = a ? areaIndex.get(a)! : -1;
}

const ROWS = [0, 33, 61, 100, 200, 300, 400, 449, 470];
const rowHashes: Record<string, number> = {};
for (const y of ROWS) rowHashes[y] = fnvInts(map.tiles.subarray(y * W, (y + 1) * W));

// 길찾기·시선 표본 (좌표는 32비트 실수로도 정확한 값만: Godot Vector2)
const PATH_CASES: [number, number, number, number][] = [
  [30, 45, 33, 34],
  [17.5, 33.5, 120.5, 60.5],
  [200.5, 100.5, 260.5, 140.5],
  [130.5, 466.5, 180.5, 470.5],
];
const pathResults = PATH_CASES.map(([ax, ay, bx, by]) => map.findPath({ x: ax, y: ay }, { x: bx, y: by })?.map((p) => [p.x, p.y]) ?? null);
const losResults: number[] = [];
for (let k = 0; k < 400; k++) {
  const ax = 10 + ((k * 53) % 1080) + 0.25;
  const ay = 5 + ((k * 37) % 440) + 0.75;
  const bx = ax + ((k * 7) % 23) - 11.5;
  const by = ay + ((k * 11) % 19) - 9.25;
  losResults.push(map.lineOfSight({ x: ax, y: ay }, { x: bx, y: by }) ? 1 : 0);
}
let reachable = 0;
for (const b of map.reachableFrom({ x: 17.5, y: 33.5 })) reachable += b;

const def = world.def;
const fingerprint = {
  width: W,
  height: H,
  tileCounts,
  counts: {
    ops: def.ops.length,
    areas: def.areas.length,
    hides: def.hides.length,
    safes: def.safes.length,
    interactables: def.interactables.length,
    portals: def.portals.length,
    spawns: Object.keys(def.spawns).length,
    paths: Object.keys(def.paths).length,
    crowdLanes: def.crowdLanes.length,
    props: def.props?.length ?? 0,
    labels: def.labels.length,
    ambient: def.ambient?.length ?? 0,
  },
  gridHash: fnvInts(map.tiles),
  areaGridHash: fnvInts(areaIdx),
  rowHashes,
  hashes: {
    ops: hashOf(def.ops),
    areas: hashOf(def.areas),
    hides: hashOf(def.hides),
    safes: hashOf(def.safes),
    interactables: hashOf(def.interactables),
    portals: hashOf(def.portals),
    spawns: hashOf(def.spawns),
    paths: hashOf(def.paths),
    crowdLanes: hashOf(def.crowdLanes),
    props: hashOf(def.props ?? []),
    labels: hashOf(def.labels),
    ambient: hashOf(def.ambient ?? []),
    layers: hashOf(def.layers),
  },
  reachableFromHome: reachable,
  pathHash: hashOf(pathResults),
  pathLengths: pathResults.map((p) => (p ? p.length : -1)),
  losHash: hashOf(losResults),
  losOpen: losResults.reduce((a, b) => a + b, 0),
};

const out = path.resolve(import.meta.dirname, '../game/tests/fixtures/world_fingerprint.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(fingerprint, null, 2) + '\n');
console.log(`월드 지문 → ${path.relative(process.cwd(), out)}`);
console.log(JSON.stringify(fingerprint.counts));
