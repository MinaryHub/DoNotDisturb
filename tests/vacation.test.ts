import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { readConfig } from '../tools/lib/readData';

// 휴가 모드: 해야 할 일 없이 날마다 휴가 하루를 되풀이한다. 정산이 없고 캠페인 진행과 따로 간다

const cfg = readConfig();
const dt = 1 / 60;

describe('휴가 모드', () => {
  it('휴가 하루로 시작하고, 회사 일·필수 목표가 없고, 침대는 바로 쓸 수 있다', () => {
    const s = new GameSession(cfg, undefined, { vacation: true });
    expect(s.day.id).toBe(cfg.vacationDay!.id);
    expect(s.objectives.list.some((o) => o.def.mandatory || o.def.workday)).toBe(false);
    expect(s.objectives.canEndDay).toBe(true);
  });

  it('잠들면 정산 없이 다음 휴가 날로 (며칠째가 늘고, 캠페인 날짜는 그대로)', () => {
    const s = new GameSession(cfg, undefined, { vacation: true });
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    const money = s.sim.life.money;
    const bed = cfg.world.interactables.find((i) => i.kind === 'bed')!;
    s.player.pos.x = bed.at[0];
    s.player.pos.y = bed.at[1];
    s.step(dt, NO_CONTROLS);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.mode.kind).toBe('night');
    expect(s.mode.kind === 'night' && s.mode.settlement).toEqual([]);
    expect(s.sim.life.money).toBe(money);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    expect(s.mode.kind).toBe('dayIntro');
    expect(s.vacationDayCount).toBe(2);
    expect(s.dayIndex).toBe(0);
    expect(s.day.id).toBe(cfg.vacationDay!.id);
  });
});
