import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 조용한 곳 도감과 사람들의 부탁

const cfg = readConfig();
const dt = 1 / 60;

function stay(s: GameSession, id: string, seconds: number): void {
  const q = cfg.quietSpots.spots.find((x) => x.id === id)!;
  for (let i = 0; i < Math.round(seconds / dt); i++) {
    s.player.pos.x = q.at[0];
    s.player.pos.y = q.at[1];
    s.step(dt, NO_CONTROLS);
  }
}

describe('조용한 곳 도감', () => {
  it('아무도 보지 않는 곳에 잠깐 머물면 도감에 오르고, 그 자리에서 마음이 가라앉는다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    s.clock.minutes = parseTime('11:00');
    stay(s, 'farBank', 1);
    expect(s.quietFound.has('farBank')).toBe(false);
    stay(s, 'farBank', cfg.quietSpots.discoverSec + 0.5);
    expect(s.quietFound.has('farBank')).toBe(true);
    // 같은 조건에서 조용한 곳 밖에 있던 사람과 비교
    const other = new GameSession(cfg);
    other.step(dt, { ...NO_CONTROLS, confirm: true });
    other.clock.minutes = s.clock.minutes;
    for (const g of [s, other]) g.sim.energy.debugSet({ stress: 40 });
    stay(s, 'farBank', 2);
    for (let i = 0; i < 120; i++) {
      other.player.pos.x = 1080;
      other.player.pos.y = 440;
      other.step(dt, NO_CONTROLS);
    }
    expect(s.quietHere?.id).toBe('farBank');
    expect(s.sim.energy.mood('stress')).toBeLessThan(other.sim.energy.mood('stress') - 1);
  });

  it('시간이 정해진 곳은 그 시간에만, 찾은 곳은 저장에 남는다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    s.clock.minutes = parseTime('11:00');
    stay(s, 'nightBridge', cfg.quietSpots.discoverSec + 1);
    expect(s.quietFound.has('nightBridge')).toBe(false);
    s.clock.minutes = parseTime('20:00');
    stay(s, 'nightBridge', cfg.quietSpots.discoverSec + 1);
    expect(s.quietFound.has('nightBridge')).toBe(true);
    const loaded = new GameSession(cfg, s.saveState());
    expect(loaded.quietFound.has('nightBridge')).toBe(true);
  });
});

describe('부탁', () => {
  it('부탁 문자에 답장하면 선택 목표가 생기고, 해내면 고마워한다 (인상·생활 지표)', () => {
    // 씨앗이 있을 때만 부탁이 온다: 부탁이 오는 씨앗을 찾는다
    let s: GameSession | null = null;
    for (let seed = 1; seed < 60 && !s; seed++) {
      const t = new GameSession(cfg, undefined, { seed, vacation: true });
      if (t.day.phone.some((p) => cfg.favors.list.some((f) => f.offerKey === p.textKey && f.id === 'farBank'))) s = t;
      if (t.day.phone.some((p) => p.textKey === 'favor.jiuIceCream.offer')) s = t;
    }
    expect(s).not.toBeNull();
    const g = s!;
    g.step(dt, { ...NO_CONTROLS, confirm: true });
    g.phone.receiveMessage('friend', 'favor.jiuIceCream.offer');
    g.step(dt, NO_CONTROLS);
    g.phone.reply(g.phone.messages.at(-1)!.id);
    g.step(dt, NO_CONTROLS);
    expect(g.objectives.get('favor_jiuIceCream')).toBeDefined();
    const jiu = g.reputation.get('jiu');
    g.gameEvent('enter:riverKiosk');
    g.step(dt, NO_CONTROLS);
    expect(g.objectives.isDone('favor_jiuIceCream')).toBe(true);
    expect(g.reputation.get('jiu')).toBeGreaterThan(jiu);
    expect(g.sim.report.favorsDone).toBe(1);
  });
});
