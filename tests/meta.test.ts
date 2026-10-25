import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { readConfig } from '../tools/lib/readData';

// 난이도·이번 주의 조건·한 주의 작은 승리

const cfg = readConfig();
const dt = 1 / 60;

describe('난이도: 나는 이만큼 지친다', () => {
  it('많이 내향이면 자극이 더 크게 박히고 첫날 기운이 적다, 저장에 남는다', () => {
    const mood = (difficulty: string) => {
      const s = new GameSession(cfg, undefined, { difficulty });
      s.step(dt, { ...NO_CONTROLS, confirm: true });
      s.sim.energy.debugSet({ tension: 0, stress: 0, panic: 0 });
      s.sim.bus.emit('voiceCall');
      s.step(dt, NO_CONTROLS);
      return { s, v: s.sim.energy.mood('tension') + s.sim.energy.mood('stress') + s.sim.energy.mood('panic') };
    };
    const mild = mood('mild');
    const deep = mood('deep');
    expect(deep.v).toBeGreaterThan(mild.v * 1.3);
    expect(deep.s.difficulty.batteryStart).toBeLessThan(100);
    expect(new GameSession(cfg, deep.s.saveState()).difficulty.id).toBe('deep');
  });
});

describe('이번 주의 조건', () => {
  it('새 캠페인(씨앗)마다 하나를 뽑고, 비 오는 주면 정해진 날에 비가 온다', () => {
    const s = new GameSession(cfg, undefined, { seed: 5 });
    expect(s.weekCondition).not.toBeNull();
    s.weekCondition = cfg.weekConditions.list.find((w) => w.id === 'rainy')!;
    s.startDay(cfg.days.findIndex((d) => d.id === 'day2'));
    expect(s.day.weather).toBe('rain');
    expect(s.day.notes?.[0]?.textKey).toBe('week.rainy.note');
    // 테스트 기본(씨앗 없음)은 조건 없음
    expect(new GameSession(cfg).weekCondition).toBeNull();
  });
});

describe('한 주의 작은 승리', () => {
  it('조건을 채우면 밤에 얻고, max 조건은 주간 리포트에서만', () => {
    const s = new GameSession(cfg);
    s.story.set('cafe', 3);
    (s as unknown as { checkAchievements(w: boolean): void }).checkAchievements(false);
    expect(s.achieved.has('regular')).toBe(true);
    expect(s.achieved.has('noWarp')).toBe(false);
    (s as unknown as { checkAchievements(w: boolean): void }).checkAchievements(true);
    expect(s.achieved.has('noWarp')).toBe(true);
    // 다음 날 아침에 저장된다
    s.startDay(1);
    expect(new GameSession(cfg, s.saveState()).achieved.has('regular')).toBe(true);
  });

  it('게임 이벤트를 한 주 동안 센다 (자전거·지하철·순간 이동)', () => {
    const s = new GameSession(cfg);
    s.gameEvent('bike:ride');
    s.gameEvent('bike:ride');
    expect(s.achievementValue('event.bike:ride')).toBe(2);
    expect(s.achievementValue('event.unrelated')).toBe(0);
  });
});
