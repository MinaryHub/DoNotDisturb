import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS, type Controls } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 공유 자전거: 빌리면 빠르고 아무도 말을 걸 수 없지만, 군중 속은 더 조마조마하고 폰·먹기는 못 한다

const cfg = readConfig();
const dt = 1 / 60;

function step(s: GameSession, seconds: number, c: Partial<Controls> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.step(dt, { ...NO_CONTROLS, ...c });
}

function atDock(id: string): GameSession {
  const s = new GameSession(cfg);
  s.step(dt, { ...NO_CONTROLS, confirm: true });
  s.clock.minutes = parseTime('11:00');
  const d = cfg.world.interactables.find((i) => i.id === id)!;
  s.player.pos.x = d.at[0];
  s.player.pos.y = d.at[1];
  step(s, 0.1);
  return s;
}

describe('공유 자전거', () => {
  it('대여소에서 요금을 내고 타면 빠르다, 반납하면 내린다', () => {
    const s = atDock('bikeOffice');
    const money = s.sim.life.money;
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.player.biking).toBe(true);
    expect(s.sim.life.money).toBe(money - cfg.balance.bike.fare);
    // 같은 시각·같은 자리에서 걸어간 사람과 비교
    const walker = atDock('bikeOffice');
    const x0 = s.player.pos.x;
    step(s, 1.5, { move: { x: -1, y: 0 } });
    step(walker, 1.5 + dt, { move: { x: -1, y: 0 } });
    expect(x0 - s.player.pos.x).toBeGreaterThan((x0 - walker.player.pos.x) * 1.8);
    step(s, 0.2, { move: { x: 1, y: 0 } });
    s.player.pos.x = cfg.world.interactables.find((i) => i.id === 'bikeOffice')!.at[0];
    step(s, 0.1);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.player.biking).toBe(false);
  });

  it('타는 동안 폰을 열 수 없고, 건물에 들어서면 문 앞에 세운다', () => {
    const s = atDock('bikeOffice');
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    s.step(dt, { ...NO_CONTROLS, phoneToggle: true });
    expect(s.phoneOpen).toBe(false);
    s.player.pos.x = 150;
    s.player.pos.y = 25;
    step(s, 0.1);
    expect(s.player.biking).toBe(false);
  });
});
