import { describe, expect, it } from 'vitest';
import { BusRoute } from '../src/gameplay/Bus';
import { GameSession, NO_CONTROLS, type Controls } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 마을버스: 시간표대로 달리는 버스를 정류장에서 기다렸다가 타고 간다.

const cfg = readConfig();
const route = new BusRoute(cfg.world.bus!, cfg.balance.bus);
const dt = 1 / 60;

function step(s: GameSession, seconds: number, c: Partial<Controls> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.step(dt, { ...NO_CONTROLS, ...c });
}

describe('마을버스 시간표', () => {
  it('정류장에 닿는 버스는 그 자리에 서 있고, 다음 버스는 지금 이후에 온다', () => {
    const x = route.stopX('middle');
    for (const now of [480, 481.3, 600, 777.7]) {
      const next = route.nextAt(1, x, now);
      expect(next.arrive + cfg.balance.bus.dwellMin).toBeGreaterThan(now);
      const bus = route.busAt(1, next.depart, Math.max(now, next.arrive) + 0.01)!;
      expect(bus.stopped).toBe(true);
      expect(bus.x).toBeCloseTo(x, 5);
    }
  });

  it('양방향 버스가 늘 도로 위를 달린다 (차로·방향이 맞다)', () => {
    const buses = route.busesAt(parseTime('12:00'));
    expect(buses.some((b) => b.dir === 1)).toBe(true);
    expect(buses.some((b) => b.dir === -1)).toBe(true);
    for (const b of buses) expect(b.y).toBe(route.laneY(b.dir));
  });
});

describe('마을버스 타기', () => {
  it('정류장에서 기다림 → 도착하면 요금을 내고 탐 → 버스와 함께 움직임 → 목적지 보도에 내림', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    s.clock.minutes = parseTime('11:00');
    const stop = cfg.world.interactables.find((i) => i.id === 'busW_east')!;
    s.player.pos.x = stop.at[0];
    s.player.pos.y = stop.at[1];
    step(s, 0.1);
    const money = s.sim.life.money;
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.mode.kind).toBe('bus');
    for (let i = 0; i < 60 * (cfg.balance.bus.intervalMin + 1) && !(s.mode.kind === 'bus' && s.mode.phase === 'riding'); i++) s.step(dt, NO_CONTROLS);
    expect(s.mode.kind === 'bus' && s.mode.phase).toBe('riding');
    expect(s.sim.life.money).toBe(money - cfg.balance.bus.fare);
    const x0 = s.player.pos.x;
    step(s, 2);
    // 타고 가는 동안 시간이 빨리 흐른다
    expect(s.player.pos.x).toBeGreaterThan(x0 + 20);
    expect(s.crowdLevel).toBeGreaterThan(0);
    step(s, 60);
    expect(s.mode.kind).toBe('free');
    expect(s.player.pos.x).toBeCloseTo(route.stopX('east'), 1);
    expect(s.player.pos.y).toBe(cfg.world.bus!.curbSouthY);
  });

  it('기다리다 움직이면 그만 기다린다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    const stop = cfg.world.interactables.find((i) => i.id === 'busM_west')!;
    s.player.pos.x = stop.at[0];
    s.player.pos.y = stop.at[1];
    step(s, 0.1);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.mode.kind).toBe('bus');
    s.step(dt, { ...NO_CONTROLS, move: { x: 1, y: 0 } });
    expect(s.mode.kind).toBe('free');
  });
});

describe('지하철', () => {
  it('개찰구에서 역을 고르면 요금을 내고, 시간이 빨리 흐르며 그 역에 내린다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    s.clock.minutes = parseTime('11:00');
    const gate = cfg.world.interactables.find((i) => i.id === 'metroHaeoreum')!;
    s.player.pos.x = gate.at[0];
    s.player.pos.y = gate.at[1];
    step(s, 0.1);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.mode.kind).toBe('metroMenu');
    const dests = s.metroDestinations('haeoreum');
    const central = dests.findIndex((d) => d.id === 'central');
    for (let i = 0; i < central; i++) s.step(dt, { ...NO_CONTROLS, menuNav: 1 });
    const money = s.sim.life.money;
    const t0 = s.clock.minutes;
    s.step(dt, { ...NO_CONTROLS, phoneReply: true });
    expect(s.mode.kind).toBe('metro');
    expect(s.sim.life.money).toBe(money - cfg.balance.metro.fare);
    step(s, 30);
    expect(s.mode.kind).toBe('free');
    const st = cfg.world.metro!.stations['central']!;
    expect(s.player.pos.x).toBeCloseTo(st.at[0], 1);
    expect(s.clock.minutes - t0).toBeGreaterThanOrEqual(dests[central]!.stops * cfg.balance.metro.minutesPerStop - 1);
  });
});
