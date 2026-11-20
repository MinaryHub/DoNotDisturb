import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import type { Npc } from '../src/npc/Npc';
import { salaryOf } from '../src/sim/DayCycle';
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
    // 첫날은 월급날: 급여가 먼저 들어온 뒤 지출이 나간다
    const salary = s.day.flags.payday ? salaryOf(cfg.life.settlement, s.sim.life) : 0;
    expect(s.sim.life.money).toBe(money + salary - vet.expense!.money);
    expect(s.drainFx().some((f) => f.type === 'toast' && f.key === vet.expense!.toastKey)).toBe(true);
  });

  it('월급은 첫날 아침에 들어오고, 토요일 밤엔 월세가 나간다 (한 주 동안 나눠 쓴다)', () => {
    expect(cfg.days[0]!.flags.payday).toBe(true);
    expect(cfg.days.at(-1)!.flags.monthEnd).toBe(true);
    const s = new GameSession(cfg);
    const money = s.sim.life.money;
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    expect(s.sim.life.money).toBe(money + salaryOf(cfg.life.settlement, s.sim.life));
    expect(s.sim.life.money).toBeGreaterThan(cfg.life.settlement.monthEnd.rent);
    // 다시 해도 두 번 받지 않는다 (아침 기록으로 돌아간 뒤 다시 받음)
    s.retryDay();
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    expect(s.sim.life.money).toBe(money + salaryOf(cfg.life.settlement, s.sim.life));
  });

  it('오래 쓰는 물건: 사면 그 효과가 기술처럼 붙는다', () => {
    const s = new GameSession(cfg);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    const before = s.perkMul('earphoneScale');
    (s as unknown as { ownedGear: Set<string> }).ownedGear.add('ncEarbuds');
    expect(s.perkMul('earphoneScale')).toBeCloseTo(before * 0.75);
    expect(cfg.world.interactables.some((i) => i.kind === 'shop' && i.shop === 'deptLiving')).toBe(true);
    for (const g of cfg.items.gear.filter((x) => x.effects)) {
      const sold = Object.values(cfg.items.shops).some((sh) => sh.stock.some((e) => e.item === g.id && e.price > 0));
      expect(sold, g.id).toBe(true);
    }
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

describe('넓은 도시를 캠페인에서 쓴다 (게임성 검토 2)', () => {
  const inHomeDistrict = (at: readonly [number, number]) => at[0] < 340 && at[1] < 140;
  const where = (id: string) => cfg.world.interactables.find((i) => i.id === id)?.at;

  it('수요일 반차 오후: 도심 백화점에서 엄마 선물 (말하고 값을 치르면 끝, 못 하면 관계만 깎이고 하루는 끝난다)', () => {
    const idx = cfg.days.findIndex((d) => d.id === 'dayWed');
    const gift = cfg.days[idx]!.objectives.find((o) => o.id === 'gift')!;
    expect(inHomeDistrict(where(gift.marker!)!)).toBe(false);
    expect(gift.closes).toBeDefined();
    expect(gift.missed?.bond).toBeLessThan(0);

    const s = new GameSession(cfg);
    s.startDay(idx);
    s.step(dt, { ...NO_CONTROLS, confirm: true });
    for (const o of s.objectives.list) if (o.def.id === 'commute' || o.def.id === 'work') o.done = true;
    const at = where('deptGift')!;
    s.player.pos.x = at[0];
    s.player.pos.y = at[1];
    for (let i = 0; i < 6; i++) s.step(dt, NO_CONTROLS);
    const money = s.sim.life.money;
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.mode.kind).toBe('speech');
    for (let i = 0; i < 60 * 40 && s.mode.kind === 'speech'; i++) {
      const m = s.mode as Extract<typeof s.mode, { kind: 'speech' }>;
      const ch = m.challenge;
      s.step(dt, { ...NO_CONTROLS, spacePressed: ch.marker > ch.zone.from + 0.02 && ch.marker < ch.zone.to - 0.02 });
    }
    expect(s.objectives.isDone('gift')).toBe(true);
    expect(s.sim.life.money).toBe(money - cfg.speeches['giftWrap']!.grant!.price);
  });

  it('토요일 지우와의 마지막 만남은 한빛강 강변에서', () => {
    const day4 = cfg.days.find((d) => d.id === 'day4')!;
    const friend = day4.npcs.find((n) => n.id === 'friend')!;
    const spawn = cfg.world.spawns[friend.at]!;
    expect(inHomeDistrict(spawn)).toBe(false);
    const area = cfg.world.areas.find((a) => a.id === day4.objectives.find((o) => o.id === 'friend')!.marker)!;
    expect(Math.hypot(area.rect[0] + area.rect[2] / 2 - spawn[0], area.rect[1] + area.rect[3] / 2 - spawn[1])).toBeLessThan(20);
  });
});
