import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import type { Npc } from '../src/npc/Npc';
import { LifeStats } from '../src/sim/LifeStats';
import { readConfig } from '../tools/lib/readData';

// 게임성 추가 검토: 관계에 쓴 에너지가 돌아온다(편한 사이는 대화가 쉽고 짧다),
// 생활 지표는 위에서 꽉 차지 않는다, 돈은 쓸 곳이 있다(배달·예상 못 한 지출)

const cfg = readConfig();
const dt = 1 / 60;

function dialogueWith(person: number) {
  const s = new GameSession(cfg, undefined, { practiced: true });
  s.step(dt, { ...NO_CONTROLS, confirm: true });
  s.reputation.change('neighbor', person - s.reputation.get('neighbor'));
  s.startDialogue(s.npcs.find((n) => n.id === 'neighbor')!, false);
  if (s.mode.kind !== 'dialogue') throw new Error('대화가 시작되지 않음');
  return s.mode.battle;
}

describe('편한 사이', () => {
  it('인상이 좋을수록 틈이 넓고 대화가 짧다, 서운한 사이는 반대', () => {
    const warm = dialogueWith(100);
    const mid = dialogueWith(50);
    const hurt = dialogueWith(0);
    expect(warm.windowSec).toBeGreaterThan(mid.windowSec);
    expect(hurt.windowSec).toBeLessThan(mid.windowSec);
    expect(warm.remainingSec).toBeLessThan(mid.remainingSec);
    expect(hurt.remainingSec).toBeGreaterThan(mid.remainingSec);
  });

  it('아주 편한 사이는 말 대신 눈인사만 하고 지나가기도 한다 (하루 한 번, 피한 대화로 세지 않음)', () => {
    const always = { ...cfg, reputation: { ...cfg.reputation, talk: { ...cfg.reputation.talk, nodChance: 1 } } };
    const s = new GameSession(always);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    const neighbor = s.npcs.find((n) => n.id === 'neighbor')!;
    const nod = (n: Npc) => (s as unknown as { warmNod(n: Npc): boolean }).warmNod(n);
    expect(nod(neighbor)).toBe(false);
    s.reputation.change('neighbor', 100);
    s.sim.energy.addMood('tension', 30, false);
    const tension = s.sim.energy.load;
    s.drainFx();
    expect(nod(neighbor)).toBe(true);
    expect(s.sim.energy.load).toBeLessThan(tension);
    expect(s.drainFx().some((f) => f.type === 'toast' && f.key === 'toast.warmNod')).toBe(true);
    expect(nod(neighbor)).toBe(false);
    expect(s.sim.report.smalltalkAvoided).toBe(0);
  });
});

describe('생활 지표의 상한', () => {
  it('높을수록 덜 오른다 (낮을 땐 그대로)', () => {
    const life = new LifeStats({ ...cfg.life.stats, start: { income: 40, housing: 60, essentials: 60, bond: 90 } });
    life.apply({ income: 10, bond: 10 });
    expect(life.get('income')).toBe(50);
    expect(life.get('bond')).toBeLessThan(100);
    expect(life.get('bond')).toBeGreaterThan(90);
    // 내려가는 건 그대로
    life.apply({ bond: -10 });
    expect(life.ledger.at(-1)!.delta).toBe(-10);
  });
});

describe('돈을 쓸 곳', () => {
  it('예상 못 한 지출은 하루를 시작할 때 나간다', () => {
    const s = new GameSession(cfg, undefined, { seed: 1 });
    const vet = cfg.happenings.list.find((h) => h.id === 'catVet')!;
    s.happenings = [vet];
    const money = s.sim.life.money;
    s.drainFx();
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    expect(s.sim.life.money).toBe(money - vet.expense!.money);
    expect(s.drainFx().some((f) => f.type === 'toast' && f.key === vet.expense!.toastKey)).toBe(true);
  });

  it('집에서 배달을 시킬 수 있다 (돈으로 회복을 산다)', () => {
    const shop = cfg.items.shops['homeDelivery']!;
    expect(cfg.world.interactables.some((i) => i.kind === 'shop' && i.shop === 'homeDelivery')).toBe(true);
    for (const st of shop.stock) {
      expect(st.price).toBeGreaterThan(5000);
      expect(cfg.items.consumables.find((c) => c.id === st.item)!.effects.battery).toBeGreaterThan(0);
    }
  });
});
