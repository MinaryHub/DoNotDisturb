import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { readConfig } from '../tools/lib/readData';

// 사람마다 다른 말하는 방식: 같은 대화 규칙을 틈·빠르기·만족·미소 민감도로 다르게

const cfg = readConfig();

function talkTo(id: string): GameSession {
  const s = new GameSession(cfg, undefined, { practiced: true });
  s.step(1 / 60, { ...NO_CONTROLS, confirm: true });
  const npc = s.npcs.find((n) => n.id === id)!;
  s.startDialogue(npc, false);
  return s;
}

describe('말하는 방식', () => {
  it('팀장님은 틈이 좁고 대사가 길다, 호객은 틈이 넓다', () => {
    const rules = cfg.dialogueRules;
    const boss = talkTo('boss');
    const flyer = talkTo('flyer');
    expect(boss.mode.kind === 'dialogue' && boss.mode.battle.windowSec).toBeCloseTo(rules.parryWindowSec * 0.7);
    expect(flyer.mode.kind === 'dialogue' && flyer.mode.battle.windowSec).toBeCloseTo(rules.parryWindowSec * 1.5);
    const greet = cfg.dialoguePools['boss']!.greeting.durationSec;
    expect(boss.mode.kind === 'dialogue' && boss.mode.battle.currentLine.durationSec).toBeCloseTo(greet / 0.8);
  });

  it('말하는 방식 안내 문구가 모두 있다', () => {
    for (const p of Object.values(cfg.npcProfiles)) if (p.talkStyle?.hintKey) expect(cfg.text[p.talkStyle.hintKey]).toBeDefined();
  });
});
