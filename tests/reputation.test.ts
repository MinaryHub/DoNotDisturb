import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { Reputation } from '../src/sim/Reputation';
import { readConfig } from '../tools/lib/readData';

// 사람들의 인상과 사회적 평판: 대화·연락·중요한 순간이 움직이고, 인상이 좋을수록 더 잘 알아보고 말을 건다

const cfg = readConfig();
const dt = 1 / 60;

describe('사람들의 인상', () => {
  it('연락을 어떻게 받았는지가 그 사람의 인상으로 남는다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    const boss = s.reputation.get('boss');
    s.phone.receiveMessage('boss', 'phone.boss.meeting');
    s.step(dt, NO_CONTROLS);
    s.phone.readIgnore(s.phone.messages.at(-1)!.id);
    s.step(dt, NO_CONTROLS);
    expect(s.reputation.get('boss')).toBe(boss + cfg.reputation.phone.readIgnored);
    expect(s.reputation.changedToday()['boss']).toBe(cfg.reputation.phone.readIgnored);
  });

  it('중요한 순간: 회의 발언은 팀장님·팀, 연차는 조금 아쉽게', () => {
    const s = new GameSession(cfg);
    s.gameEvent('done:meeting');
    expect(s.reputation.get('boss')).toBeGreaterThan(cfg.reputation.start);
    s.gameEvent('leave');
    expect(s.reputation.changedToday()['team']).toBe(cfg.reputation.events['done:meeting']!['team']! + cfg.reputation.events['leave']!['team']!);
  });

  it('인상이 좋을수록 잘 알아본다 (알아챔 배율), 다시 하면 아침의 인상으로', () => {
    const r = new Reputation(cfg.reputation);
    const before = r.warmth('neighbor');
    r.change('neighbor', 30);
    expect(r.warmth('neighbor')).toBeGreaterThan(before);
    expect(r.warmth(null)).toBe(1);
    const s = new GameSession(cfg);
    s.reputation.change('neighbor', 20);
    s.retryDay();
    expect(s.reputation.get('neighbor')).toBe(cfg.reputation.start);
    expect(s.npcs.find((n) => n.id === 'neighbor')!.warmth).toBeCloseTo(s.reputation.warmth('neighbor'));
  });

  it('사회적 평판은 모든 사람 인상의 평균, 말로 보인다', () => {
    const r = new Reputation(cfg.reputation);
    const vals = Object.values(r.all());
    expect(r.overall).toBeCloseTo(vals.reduce((a, b) => a + b, 0) / vals.length);
    expect(cfg.text[r.tierKey(r.overall)]).toBeDefined();
  });
});
