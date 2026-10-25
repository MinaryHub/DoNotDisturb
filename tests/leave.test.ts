import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { readConfig } from '../tools/lib/readData';

// 연차: 하루 시작 화면에서 [L]. 회사 일 목표가 빠지고 쉬는 날이 된다. 한 주에 balance.leave.perWeek일

const cfg = readConfig();
const dt = 1 / 60;
const idx = (id: string) => cfg.days.findIndex((d) => d.id === id);

describe('연차', () => {
  it('화요일에 연차: 출근·업무가 빠지고 장보기는 바로, 소득이 조금 깎인다', () => {
    const s = new GameSession(cfg);
    s.startDay(idx('day2'));
    const income = s.sim.life.get('income');
    expect(s.canTakeLeave).toBe(true);
    s.step(dt, { ...NO_CONTROLS, leave: true });
    expect(s.onLeave).toBe(true);
    expect(s.objectives.get('commute')).toBeUndefined();
    expect(s.objectives.get('work')).toBeUndefined();
    expect(s.objectives.available(s.objectives.get('groceries')!)).toBe(true);
    expect(s.sim.life.get('income')).toBe(income - 6);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    expect(s.mode.kind).toBe('free');
  });

  it('한 주에 한 번만, 발표 날은 못 쓰고, 그날을 다시 하면 연차도 돌려받는다', () => {
    const s = new GameSession(cfg);
    s.startDay(idx('day1'));
    s.step(dt, { ...NO_CONTROLS, leave: true });
    expect(s.leaveUsed).toBe(1);
    s.retryDay();
    expect(s.leaveUsed).toBe(0);
    expect(s.onLeave).toBe(false);
    s.step(dt, { ...NO_CONTROLS, leave: true });
    s.startDay(idx('day3'));
    expect(s.canTakeLeave).toBe(false);
    s.startDay(idx('dayThu'));
    s.leaveUsed = 0;
    expect(s.canTakeLeave).toBe(false);
  });
});
