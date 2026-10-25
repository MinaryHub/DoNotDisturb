import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 생활 지표가 왜 바뀌었는지: 그 자리에서 알림, 밤 정산에 이유별 목록, 낮으면 메모에 할 일

const cfg = readConfig();
const dt = 1 / 60;

describe('생활 지표 변화의 이유', () => {
  it('지각하면 업무 평판이 깎이고, 이유가 기록되고 그 자리에서 알린다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    s.drainFx();
    s.clock.minutes = parseTime('09:00');
    s.step(dt, NO_CONTROLS);
    const late = s.sim.life.ledger.find((c) => c.why === 'late');
    expect(late?.stat).toBe('income');
    expect(late!.delta).toBeLessThan(0);
    expect(s.lifeWhyText(late!)).toContain(cfg.text['obj.commute']!);
    const toasts = s.drainFx().filter((f) => f.type === 'toast' && f.key === 'why.toast.down');
    expect(toasts.length).toBeGreaterThan(0);
  });

  it('전화를 피하면 누구의 무엇 때문인지 남는다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    s.phone.receiveMessage('boss', 'phone.boss.meeting');
    s.step(dt, NO_CONTROLS);
    s.phone.readIgnore(s.phone.messages.at(-1)!.id);
    s.step(dt, NO_CONTROLS);
    const c = s.sim.life.ledger.find((x) => x.why === 'phone.readIgnored');
    expect(c?.who).toBe('boss');
    expect(s.lifeWhyText(c!)).toContain(cfg.text['contact.boss']!);
  });

  it('하루가 새로 시작하면 기록을 비운다', () => {
    const s = new GameSession(cfg);
    s.sim.life.apply({ income: -5 }, 'late', 'obj.commute');
    s.startDay(1);
    expect(s.sim.life.ledger).toEqual([]);
  });
});
