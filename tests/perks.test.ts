import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { readConfig } from '../tools/lib/readData';

// 내향인의 기술: 밤마다 셋 중 하나를 고르고, 한 주 동안 쌓인다

const cfg = readConfig();
const dt = 1 / 60;

function toNight(s: GameSession): void {
  s.step(dt, { ...NO_CONTROLS, confirm: true });
  const bed = cfg.world.interactables.find((i) => i.kind === 'bed')!;
  s.player.pos.x = bed.at[0];
  s.player.pos.y = bed.at[1];
  s.step(dt, NO_CONTROLS);
  s.step(dt, { ...NO_CONTROLS, interactPressed: true });
}

describe('내향인의 기술', () => {
  it('밤에 셋을 보여 주고, [2]로 고르면 익히고 저장에 남는다', () => {
    const s = new GameSession(cfg, undefined, { vacation: true });
    toNight(s);
    expect(s.mode.kind).toBe('night');
    const m = s.mode.kind === 'night' ? s.mode : null;
    expect(m!.perkChoices.length).toBe(cfg.perks.offer);
    s.step(dt, { ...NO_CONTROLS, useItem: 1 });
    expect(s.perks.has(m!.perkChoices[1]!)).toBe(true);
    // 한 밤에 하나만
    s.step(dt, { ...NO_CONTROLS, useItem: 0 });
    expect(s.perks.size).toBe(1);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    expect(new GameSession(cfg, s.saveState()).perks.has(m!.perkChoices[1]!)).toBe(true);
  });

  it('효과: 배율은 곱하고 더하기는 더한다, 이미 가진 기술은 다시 나오지 않는다', () => {
    const s = new GameSession(cfg);
    s.perks.add('stealthStep');
    s.perks.add('graceExit');
    expect(s.perkMul('noticeScale')).toBeCloseTo(0.85);
    expect(s.perkAdd('parryBonusSec')).toBeCloseTo(0.15);
    expect(s.perkMul('walkScale')).toBe(1);
    s.startDay(0);
    expect(s.npcs.find((n) => n.id === 'neighbor')!.warmth).toBeCloseTo(s.reputation.warmth('neighbor') * 0.85);
    const v = new GameSession(cfg, undefined, { vacation: true });
    v.perks.add('stealthStep');
    toNight(v);
    const m = v.mode.kind === 'night' ? v.mode : null;
    expect(m!.perkChoices.includes('stealthStep')).toBe(false);
  });
});
