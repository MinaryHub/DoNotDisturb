import { crossCheck } from '../src/core/config';
import { buildWorld, layerOf } from '../src/world/World';
import { readConfig } from './lib/readData';

// npm run validate:world — /data의 월드·하루·대사·독백 데이터를 검증하고 리포트를 출력한다.
//   1) zod 스키마  2) 데이터 간 참조  3) 월드: 스폰·상호작용·포털 위치가 걸을 수 있는 칸인지, 층 안에서 도달 가능한지

const problems: string[] = [];
const warnings: string[] = [];
let cfg;
try {
  cfg = readConfig();
} catch (e) {
  console.error(`✖ ${(e as Error).message}`);
  process.exit(1);
}
problems.push(...crossCheck(cfg));

const world = buildWorld(cfg.world, cfg.tiles);
const map = world.map;
const walk = (x: number, y: number) => map.walkable(Math.floor(x), Math.floor(y));
for (const [id, p] of Object.entries(world.spawns)) if (!walk(p.x, p.y)) problems.push(`spawn ${id}: 막힌 칸 (${p.x}, ${p.y})`);
for (const it of world.interactables) if (!walk(it.at[0], it.at[1])) problems.push(`interactable ${it.id}: 막힌 칸 (${it.at.join(', ')})`);
for (const p of world.portals) {
  if (!walk(p.at[0], p.at[1])) problems.push(`portal ${p.id}: 막힌 칸`);
  if (!walk(p.arrive[0], p.arrive[1])) problems.push(`portal ${p.id}: 도착 지점이 막힌 칸`);
}
for (const [path, def] of Object.entries(world.paths)) {
  def.points.forEach((pt, i) => {
    if (!walk(pt.x, pt.y)) problems.push(`path ${path}[${i}]: 막힌 칸 (${pt.x}, ${pt.y})`);
  });
}

// 층마다 대표 지점에서 도달 가능한지
const anchors: Record<string, { x: number; y: number }> = {};
for (const p of world.portals) anchors[layerOf(world, { x: p.arrive[0], y: p.arrive[1] })] ??= { x: p.arrive[0], y: p.arrive[1] };
const reach = new Map<string, Uint8Array>();
for (const [layer, a] of Object.entries(anchors)) reach.set(layer, map.reachableFrom(a));
const reachable = (x: number, y: number) => {
  const r = reach.get(layerOf(world, { x, y }));
  return !r || r[Math.floor(y) * map.width + Math.floor(x)] === 1;
};
for (const it of world.interactables) if (!reachable(it.at[0], it.at[1])) warnings.push(`interactable ${it.id}: 같은 층 입구에서 걸어서 닿을 수 없음`);
for (const s of world.safes) if (!reachable(s.rect[0] + 0.5, s.rect[1] + 0.5)) warnings.push(`safe ${s.id}: 닿을 수 없음`);

const json = process.argv.includes('--json');
const strict = process.argv.includes('--strict');
if (json) console.log(JSON.stringify({ problems, warnings }, null, 2));
else {
  console.log(`월드 ${map.width}×${map.height} · 영역 ${world.def.areas.length} · 상호작용 ${world.interactables.length} · 포털 ${world.portals.length} · 하루 ${cfg.days.length}개`);
  for (const p of problems) console.log(`✖ ${p}`);
  for (const w of warnings) console.log(`⚠ ${w}`);
  if (!problems.length && !warnings.length) console.log('✔ 문제 없음');
}
process.exit(problems.length || (strict && warnings.length) ? 1 : 0);
