import { describe, expect, it } from 'vitest';
import { buildWorld } from '../src/world/World';
import { readConfig } from '../tools/lib/readData';

const cfg = readConfig();
const world = buildWorld(cfg.world, cfg.tiles);
const map = world.map;

describe('월드 타일맵', () => {
  it('스폰 지점은 모두 걸을 수 있는 칸이다', () => {
    for (const [id, p] of Object.entries(world.spawns)) {
      expect(map.walkable(Math.floor(p.x), Math.floor(p.y)), `spawn ${id}`).toBe(true);
    }
  });

  it('상호작용 지점·포털 도착 지점·엘리베이터 앞은 걸을 수 있는 칸이다', () => {
    for (const it of world.interactables) expect(map.walkable(Math.floor(it.at[0]), Math.floor(it.at[1])), `interactable ${it.id}`).toBe(true);
    for (const p of world.portals) {
      expect(map.walkable(Math.floor(p.at[0]), Math.floor(p.at[1])), `portal ${p.id}`).toBe(true);
      expect(map.walkable(Math.floor(p.arrive[0]), Math.floor(p.arrive[1])), `portal ${p.id} arrive`).toBe(true);
    }
    for (const [id, f] of Object.entries(cfg.world.elevator.fronts)) expect(map.walkable(Math.floor(f[0]), Math.floor(f[1])), id).toBe(true);
  });

  it('집 → 1층 → 거리 → 회사·마트·고깃집·옷 매장까지 걸어서 이어진다 (계단 포털 경유)', () => {
    // 3층(섬)은 계단 포털로 1층과 연결되므로, 1층 도착 지점에서 지상 전체 도달성을 본다
    const home = map.reachableFrom(world.spawns['player']!);
    const ground = map.reachableFrom({ x: 17.5, y: 33.5 });
    const at = (set: Uint8Array, x: number, y: number) => set[Math.floor(y) * map.width + Math.floor(x)] === 1;
    expect(at(home, 184, 470.5), '집 → 3층 계단').toBe(true);
    expect(at(home, 177, 469.6), '집 → 3층 엘리베이터 앞').toBe(true);
    for (const id of ['officeDesk', 'meetingSeat', 'item_tofu', 'item_egg', 'item_onion', 'item_ramen', 'checkoutNormal', 'checkoutSelf', 'seatCorner', 'returnCounter', 'clothesPick', 'soloSeat', 'convShop', 'parkBench']) {
      const it = world.interactables.find((i) => i.id === id)!;
      expect(at(ground, it.at[0], it.at[1]), id).toBe(true);
    }
    for (const s of world.safes) expect(at(ground, s.rect[0] + 0.5, s.rect[1] + 0.5), s.id).toBe(true);
    expect(at(ground, 31.5, 61), '지하철 서쪽 입구').toBe(true);
    expect(at(ground, 177.5, 61), '지하철 동쪽 입구').toBe(true);
    const subway = map.reachableFrom({ x: 6, y: 470 });
    expect(at(subway, 118, 470), '환승 통로 관통').toBe(true);
  });

  it('벽은 시선을 막고 유리창은 막지 않는다', () => {
    // 관리사무소: 유리창 너머로 로비가 보인다
    expect(map.lineOfSight({ x: 30, y: 37.5 }, { x: 30, y: 44 })).toBe(true);
    // 사무실 벽 너머 로비는 보이지 않는다
    expect(map.lineOfSight({ x: 140, y: 40 }, { x: 140, y: 50 })).toBe(false);
  });

  it('A* 경로는 벽을 통과하지 않는다', () => {
    const path = map.findPath({ x: 30, y: 45 }, { x: 33, y: 34 });
    expect(path).not.toBeNull();
    const pts = path!;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.2);
      for (let k = 0; k <= n; k++) {
        const x = a.x + ((b.x - a.x) * k) / n;
        const y = a.y + ((b.y - a.y) * k) / n;
        expect(map.walkable(Math.floor(x), Math.floor(y))).toBe(true);
      }
    }
  });

  it('충돌 이동은 벽을 넘지 않는다', () => {
    const p = { x: 130.6, y: 466.5 };
    for (let i = 0; i < 200; i++) map.moveCircle(p, 0, -0.1, 0.32);
    expect(p.y).toBeGreaterThan(463);
  });
});

describe('넓은 도시 (자동 생성 + 랜드마크)', () => {
  it('씨앗이 같으면 같은 도시가 나온다', () => {
    const a = readConfig().world;
    const b = readConfig().world;
    expect(a.areas.length).toBe(b.areas.length);
    expect(JSON.stringify(a.interactables.map((i) => i.at))).toBe(JSON.stringify(b.interactables.map((i) => i.at)));
  });

  it('해오름동에서 도심·시장·대학·강변·남쪽 둔치까지 걸어서 이어진다 (다리 경유)', () => {
    const ground = map.reachableFrom({ x: 17.5, y: 33.5 });
    const at = (x: number, y: number) => ground[Math.floor(y) * map.width + Math.floor(x)] === 1;
    for (const id of ['metroCentral', 'stationConv', 'deptCafe', 'mkGukbap', 'univRead1', 'riverKioskShop', 'metroUniv', 'metroRiver', 'metroMarket', 'busD_east', 'busC_west']) {
      const it = world.interactables.find((i) => i.id === id)!;
      expect(at(it.at[0], it.at[1]), id).toBe(true);
    }
    expect(at(352, 440), '중앙로 다리 건너 남쪽 둔치').toBe(true);
    expect(at(900, 440), '보행 다리 건너 남쪽 둔치').toBe(true);
  });

  it('생성된 건물의 상호작용은 모두 걸어서 닿는다', () => {
    const ground = map.reachableFrom({ x: 17.5, y: 33.5 });
    const gen = world.interactables.filter((i) => /_(b|bench|it)_?\d+/.test(i.id));
    expect(gen.length).toBeGreaterThan(200);
    const unreachable = gen.filter((i) => ground[Math.floor(i.at[1]) * map.width + Math.floor(i.at[0])] !== 1).map((i) => i.id);
    expect(unreachable).toEqual([]);
  });
});
