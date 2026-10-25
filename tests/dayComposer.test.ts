import { describe, expect, it } from 'vitest';
import { composeDay } from '../src/gameplay/DayComposer';
import { storyAllows } from '../src/gameplay/Story';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { readConfig } from '../tools/lib/readData';

// 같은 요일이어도 매번 조금 다른 하루 (data/happenings.json + 하루 데이터의 alt·chance·textKeys)

const cfg = readConfig();

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('DayComposer', () => {
  it('씨앗이 없으면 기본 하루 그대로 (확률 NPC 제외, 사건 없음, 이야기 표지만 적용)', () => {
    for (const d of cfg.days) {
      const { day, happenings } = composeDay(d, cfg.happenings, null);
      expect(happenings).toEqual([]);
      expect(day.npcs.every((n) => n.alt === undefined && n.chance === undefined)).toBe(true);
      expect(day.phone.map((p) => p.textKey)).toEqual(d.phone.filter((p) => storyAllows(p.if, new Map())).map((p) => p.textKey));
    }
  });

  it('같은 씨앗이면 같은 하루, 씨앗이 다르면 사건·사람 구성이 달라진다', () => {
    const base = cfg.days[0]!;
    const sig = (seed: number) => {
      const { day, happenings } = composeDay(base, cfg.happenings, lcg(seed));
      return JSON.stringify([happenings.map((h) => h.id), day.npcs.map((n) => `${n.id}@${n.at}`), day.phone.map((p) => `${p.textKey}@${p.at ?? p.on}`)]);
    };
    expect(sig(7)).toBe(sig(7));
    const variants = new Set(Array.from({ length: 30 }, (_, i) => sig(i + 1)));
    expect(variants.size).toBeGreaterThan(20);
  });

  it('하루에 사건은 최대 maxPerDay개, 같은 group은 하나만, 조건(요일·날씨)을 지킨다', () => {
    for (const d of cfg.days) {
      for (let seed = 1; seed <= 200; seed++) {
        const { day, happenings } = composeDay(d, cfg.happenings, lcg(seed));
        expect(happenings.length).toBeLessThanOrEqual(cfg.happenings.maxPerDay);
        const groups = happenings.flatMap((h) => (h.group ? [h.group] : []));
        expect(new Set(groups).size).toBe(groups.length);
        for (const h of happenings) if (h.days) expect(h.days).toContain(d.id);
        expect(new Set(day.npcs.map((n) => n.id)).size).toBe(day.npcs.length);
        // 필수 전화는 빠지지 않는다
        for (const p of d.phone.filter((x) => x.mandatory)) expect(day.phone.some((x) => x.contact === p.contact && x.mandatory)).toBe(true);
      }
    }
  });

  it('모든 날 × 여러 씨앗으로 하루를 시작해 잠깐 진행해도 오류가 없다', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = new GameSession(cfg, undefined, { seed });
      for (let i = 0; i < cfg.days.length; i++) {
        s.startDay(i);
        s.step(1 / 60, { ...NO_CONTROLS, confirm: true });
        for (let k = 0; k < 120; k++) s.step(1 / 60, NO_CONTROLS);
        expect(s.mode.kind).not.toBe('dayIntro');
      }
    }
  });

  it('같은 날을 다시 하면 다른 변형이 나온다', () => {
    const s = new GameSession(cfg, undefined, { seed: 42 });
    const seen = new Set<string>();
    for (let k = 0; k < 8; k++) {
      s.retryDay();
      seen.add(JSON.stringify([s.happenings.map((h) => h.id), s.day.npcs.map((n) => `${n.id}@${n.at}`)]));
    }
    expect(seen.size).toBeGreaterThan(3);
  });
});
