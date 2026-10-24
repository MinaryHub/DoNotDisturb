import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS, type Controls } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// GameSession은 DOM 없이 돌아가므로, 입력을 흉내 내 하루를 통째로 진행해 볼 수 있다.

const cfg = readConfig();
const dt = 1 / 60;

function step(s: GameSession, seconds: number, c: Partial<Controls> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.step(dt, { ...NO_CONTROLS, ...c });
}

function press(s: GameSession, c: Partial<Controls>): void {
  s.step(dt, { ...NO_CONTROLS, ...c });
}

function goTo(s: GameSession, id: string): void {
  const it = cfg.world.interactables.find((i) => i.id === id)!;
  s.player.pos.x = it.at[0];
  s.player.pos.y = it.at[1];
  step(s, 0.1);
}

function newDay(): GameSession {
  const s = new GameSession(cfg);
  press(s, { confirm: true });
  expect(s.mode.kind).toBe('free');
  return s;
}

describe('GameSession: 월요일 하루 진행', () => {
  it('필수 전화 → 출근 → 회의 발언 → 업무 → 귀가 → 밤 정산 → 다음 날', () => {
    const s = newDay();
    // 08:02 관리사무소 전화 (피할 수 없음: 거절해도 다시 온다)
    s.clock.minutes = parseTime('08:01');
    step(s, 70);
    expect(s.phone.ringing).toBe(true);
    press(s, { decline: true });
    expect(s.phone.ringing).toBe(true);
    press(s, { accept: true });
    expect(s.objectives.isDone('mgmtCall')).toBe(true);

    // 침대는 아직
    goTo(s, 'bed');
    press(s, { interactPressed: true });
    expect(s.mode.kind).toBe('free');

    // 출근 (회사 사무실 진입)
    s.player.pos.x = 150;
    s.player.pos.y = 25;
    step(s, 0.2);
    expect(s.objectives.isDone('commute')).toBe(true);

    // 회의 발언: 박자 구간에서 Space
    goTo(s, 'meetingSeat');
    press(s, { interactPressed: true });
    expect(s.mode.kind).toBe('speech');
    for (let i = 0; i < 60 * 30 && s.mode.kind === 'speech'; i++) {
      const m = s.mode;
      const hit = m.challenge.marker > m.challenge.zone.from + 0.02 && m.challenge.marker < m.challenge.zone.to - 0.02;
      s.step(dt, { ...NO_CONTROLS, spacePressed: hit });
    }
    expect(s.objectives.isDone('meeting')).toBe(true);
    expect(s.sim.report.mandatoryDone).toContain('meeting');

    // 업무: 집중(Space 홀드) + 메신저 답장
    goTo(s, 'officeDesk');
    press(s, { interactPressed: true });
    expect(s.mode.kind).toBe('work');
    for (let i = 0; i < 60 * 120 && s.mode.kind === 'work'; i++) s.step(dt, { ...NO_CONTROLS, smile: true, reply: i % 30 === 0 ? 'nod' : null });
    expect(s.objectives.isDone('work')).toBe(true);
    expect(s.clock.minutes).toBeGreaterThanOrEqual(parseTime('18:05'));

    // 귀가 → 침대
    goTo(s, 'bed');
    press(s, { interactPressed: true });
    expect(s.mode.kind).toBe('night');
    const night = s.mode.kind === 'night' ? s.mode : null;
    expect(night!.nextMax).toBeGreaterThan(0);
    press(s, { confirm: true });
    expect(s.dayIndex).toBe(1);
    expect(s.mode.kind).toBe('dayIntro');
  });

  it('이웃이 알아채고 다가와 말을 건다 (시야 콘 + 접근)', () => {
    const s = newDay();
    s.player.pos.x = 160;
    s.player.pos.y = 150;
    let talked = false;
    for (let i = 0; i < 60 * 20 && !talked; i++) {
      s.step(dt, NO_CONTROLS);
      talked = s.mode.kind === 'dialogue';
    }
    expect(talked).toBe(true);
  });

  it('은신처(HIDE)에 있으면 알아채기 어렵다', () => {
    const s = newDay();
    const n = () => s.npcs.find((x) => x.id === 'flyer')!;
    s.clock.minutes = parseTime('10:00');
    // 전단지 배포원 앞 6칸, 숨지 않음
    s.player.pos.x = n().pos.x - 5;
    s.player.pos.y = n().pos.y;
    n().facing = Math.PI;
    step(s, 0.4);
    const exposed = n().notice;
    expect(exposed).toBeGreaterThan(0);
  });

  it('Phase 2 흐름: 대화 오선택 → 이불킥 DoT → 홍조 발동 → 찬물 세수로 해제', () => {
    const s = new GameSession(cfg, undefined, { practiced: true });
    press(s, { confirm: true });
    const neighbor = s.npcs.find((x) => x.id === 'neighbor')!;
    s.player.pos.x = neighbor.pos.x + 1.5;
    s.player.pos.y = neighbor.pos.y;
    s.startDialogue(neighbor, false);
    expect(s.mode.kind).toBe('dialogue');
    press(s, { reply: 'exit' }); // 틈이 아닌 때 이탈 시도 = 오선택
    expect(s.snapshot.flush).toBeGreaterThan(0.05);
    for (let i = 0; i < 60 * 60 && s.mode.kind === 'dialogue'; i++) s.step(dt, { ...NO_CONTROLS, smile: true, confirm: true });
    expect(s.mode.kind).toBe('free');
    expect(s.snapshot.ruminations).toBeGreaterThan(0);
    const before = s.snapshot.battery;
    step(s, 3);
    expect(s.snapshot.battery).toBeLessThan(before);
    goTo(s, 'homeSink');
    press(s, { interactPressed: true });
    expect(s.snapshot.flush).toBe(0);
  });

  it('건반 연주: F(파)는 음을 치고, Esc로 언제든 그만둘 수 있다', () => {
    const s = newDay();
    goTo(s, 'piano');
    press(s, { interactPressed: true });
    expect(s.mode.kind).toBe('piano');
    press(s, { interactPressed: true, note: 3 });
    expect(s.mode.kind).toBe('piano');
    press(s, { cancel: true });
    expect(s.mode.kind).toBe('free');
  });

  it('에너지 0 → 주저앉음 → 집에서 다시 일어남 (시간이 흐르고 에너지 일부, 목표는 그대로)', () => {
    const s = newDay();
    s.player.pos.x = 104;
    s.player.pos.y = 30;
    const minutes = s.clock.minutes;
    s.sim.energy.debugSet({ battery: 1, panic: 80 });
    s.sim.bus.emit('voiceCall');
    step(s, 0.1);
    expect(s.mode.kind).toBe('burnout');
    step(s, 2.2);
    press(s, { confirm: true });
    expect(s.mode.kind).toBe('free');
    expect(s.atHome).toBe(true);
    expect(s.snapshot.battery).toBeCloseTo(cfg.balance.respawn.battery, 0);
    expect(s.snapshot.load).toBe(0);
    expect(s.clock.minutes).toBeGreaterThanOrEqual(minutes + cfg.balance.respawn.hours * 60);
  });

  it('너무 늦게 정신을 차리면 오늘은 그대로 끝난다', () => {
    const s = newDay();
    s.clock.skipTo(22 * 60);
    s.sim.energy.debugSet({ battery: 1 });
    s.sim.bus.emit('voiceCall');
    step(s, 2.3);
    press(s, { confirm: true });
    expect(['night', 'collapse']).toContain(s.mode.kind);
  });

  it('집 도어락을 잠그면 안전지대: 회복, 열면 해제', () => {
    const s = newDay();
    s.sim.energy.debugSet({ battery: 50 });
    step(s, 0.2);
    expect(s.sanctuary).toBe(true);
    step(s, 5);
    expect(s.snapshot.battery).toBeGreaterThan(51);
    goTo(s, 'doorLock');
    press(s, { interactPressed: true });
    expect(s.homeLocked).toBe(false);
    expect(s.sanctuary).toBe(false);
  });
});

describe('GameSession: 모든 날이 시작된다', () => {
  it.each(cfg.days.map((d, i) => [d.id, i] as const))('%s', (_id, i) => {
    const s = new GameSession(cfg);
    s.startDay(i);
    press(s, { confirm: true });
    step(s, 5, { move: { x: 1, y: 0 } });
    expect(s.mode.kind).not.toBe('burnout');
  });
});

describe('조급함', () => {
  it('계속 달리면 조급함이 차고 긴장이 오르며, 걸으면 천천히 가라앉는다', () => {
    const s = newDay();
    // 집 안을 왔다 갔다 달린다 (자극 없는 곳)
    for (let k = 0; k < 4; k++) {
      step(s, 1.2, { move: { x: 1, y: 0 }, sprint: true });
      step(s, 1.2, { move: { x: -1, y: 0 }, sprint: true });
    }
    expect(s.hurry).toBeGreaterThan(0.95);
    const stressed = s.snapshot.tension;
    expect(stressed).toBeGreaterThan(8);
    step(s, 3, { move: { x: 1, y: 0 } });
    expect(s.hurry).toBeLessThan(0.7);
    expect(s.hurry).toBeGreaterThan(0.4);
  });
});

describe('비 오는 날', () => {
  it('집을 나서면 현관 우산을 챙기고, 산 우산은 다음 날에도 남는다', () => {
    const rainy = cfg.days.findIndex((d) => d.weather === 'rain');
    const s = new GameSession(cfg);
    s.startDay(rainy);
    press(s, { confirm: true });
    expect(s.player.inventory.gear).not.toContain('umbrella');
    // 집 밖 복도로 한 걸음
    const hall = cfg.world.areas.find((a) => a.id === 'apt3f')!;
    s.player.pos.x = hall.rect[0] + 2;
    s.player.pos.y = hall.rect[1] + 2;
    step(s, 0.2);
    expect(s.player.inventory.gear).toContain('umbrella');
    // 저장된 장비는 다음 세션에도
    const saved = { ...s.saveState(), gear: ['umbrella'] };
    const s2 = new GameSession(cfg, saved);
    expect(s2.player.inventory.gear).toContain('umbrella');
  });
});

describe('회복 조이기', () => {
  it('마스크를 쓰고 있으면 긴장이 가라앉지 않고 오른다', () => {
    const s = newDay();
    s.sim.energy.debugSet({ stress: 30 });
    s.player.mask = true;
    step(s, 10);
    expect(s.snapshot.stress).toBeGreaterThan(30);
  });

  it('가방은 bagMax개까지만', () => {
    const s = newDay();
    s.sim.life.addMoney(100000);
    s.mode = { kind: 'shop', shopId: 'convStore', cursor: 0 };
    for (let i = 0; i < cfg.items.bagMax + 2; i++) {
      press(s, { interactPressed: true });
      step(s, 0.05);
    }
    expect(s.bagCount()).toBe(cfg.items.bagMax);
  });
});

describe('연습 대화', () => {
  it('첫 대화는 연습: 어색한 반응도 홍조·이불킥이 없고, 두 번째부터는 진짜', () => {
    const s = newDay();
    const neighbor = s.npcs.find((x) => x.id === 'neighbor')!;
    s.startDialogue(neighbor, false);
    expect(s.mode.kind === 'dialogue' && s.mode.practice).toBe(true);
    press(s, { reply: 'exit' });
    expect(s.snapshot.flush).toBeLessThan(0.05);
    for (let i = 0; i < 60 * 60 && s.mode.kind === 'dialogue'; i++) s.step(dt, { ...NO_CONTROLS, smile: true, confirm: true });
    expect(s.snapshot.ruminations).toBe(0);
    expect(s.saveState().practiced).toBe(true);
    const manager = s.npcs.find((x) => x.id === 'manager')!;
    s.startDialogue(manager, false);
    expect(s.mode.kind === 'dialogue' && s.mode.practice).toBe(false);
  });
});

describe('군중 밀도', () => {
  it('주변에 사람이 많을수록 긴장이 오르고, 충돌 이벤트는 없다', () => {
    const s = newDay();
    const lane = cfg.world.crowdLanes.find((l) => l.zone === 'boulevard')!;
    s.player.pos.x = (lane.from[0] + lane.to[0]) / 2;
    s.player.pos.y = lane.from[1];
    const stressAt = (n: number) => {
      s.sim.energy.debugSet({ tension: 0 });
      const agents = s.crowd.agents.filter((a) => a.active).slice(0, n);
      for (let k = 0; k < 60; k++) {
        for (const a of agents) Object.assign(a.pos, { x: s.player.pos.x + 1.2, y: s.player.pos.y + 1.2 });
        step(s, 1 / 30);
        expect(s.qte).toBeNull();
      }
      return s.snapshot.tension;
    };
    const few = stressAt(1);
    const many = stressAt(6);
    expect(many).toBeGreaterThan(few + 2);
  });
});
