import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS, type Controls } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 쉼터와 시간의 값 (게임 밸런스 검토 2026-11-20): 화장실 칸은 노크 전까지만 쉬어지고, 같은 칸은 한동안 다시 쉬어지지 않는다.
// 근무 시간에 자리를 오래 비우면 팀장님이 찾는다.

const cfg = readConfig();
const dt = 1 / 60;

function step(s: GameSession, seconds: number, c: Partial<Controls> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.step(dt, { ...NO_CONTROLS, ...c });
}

function office(time: string): GameSession {
  const s = new GameSession(cfg, undefined, { practiced: true });
  s.step(dt, { ...NO_CONTROLS, confirm: true });
  s.day.phone.length = 0;
  s.phone.call = null;
  s.homeLocked = false;
  s.clock.minutes = parseTime(time);
  return s;
}

const stall = cfg.world.safes.find((sf) => sf.id === 'officeStall1')!;

function lockStall(s: GameSession): void {
  s.player.pos.x = stall.rect[0] + stall.rect[2] / 2;
  s.player.pos.y = stall.rect[1] + stall.rect[3] / 2;
  step(s, 0.2);
  s.step(dt, { ...NO_CONTROLS, interactPressed: true });
  expect(s.player.lockedSafe?.id).toBe(stall.id);
}

describe('쉼터: 화장실 칸', () => {
  it('노크(누가 기다린다) 전까지만 쉬어지고, 더 있어도 차지 않는다', () => {
    const s = office('12:00');
    s.sim.energy.debugSet({ battery: 40 });
    lockStall(s);
    step(s, stall.noiseAfterSec - 1);
    const atKnock = s.snapshot.battery;
    expect(atKnock - 40).toBeGreaterThan(cfg.balance.battery.safeRecoverPerSec * (stall.noiseAfterSec - 1) * 0.8);
    step(s, 30, { spacePressed: false });
    expect(s.snapshot.battery).toBeLessThanOrEqual(atKnock + 0.5);
  });

  it('방금 쉰 칸은 다시 잠가도 쉬어지지 않고, reuseMin이 지나면 다시 쉬어진다', () => {
    const s = office('12:00');
    s.sim.energy.debugSet({ battery: 40 });
    lockStall(s);
    step(s, 10);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.player.lockedSafe).toBeNull();
    const b = s.snapshot.battery;
    lockStall(s);
    step(s, 10);
    expect(s.snapshot.battery).toBeLessThanOrEqual(b + 0.1);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    s.clock.minutes += cfg.balance.safe.reuseMin;
    const b2 = s.snapshot.battery;
    lockStall(s);
    step(s, 10);
    expect(s.snapshot.battery).toBeGreaterThan(b2 + 2);
  });
});

describe('시간의 값: 근무 시간 자리 비움', () => {
  it('출근한 뒤 업무를 마치기 전에 사무실 밖에 오래 있으면 업무 평판이 깎이고, 사무실 안이면 괜찮다', () => {
    const s = office('11:00');
    s.objectives.get('commute')!.done = true;
    const income = s.sim.life.get('income');
    // 사무실 안
    const desk = cfg.world.interactables.find((i) => i.id === 'officeDesk')!;
    s.player.pos.x = desk.at[0];
    s.player.pos.y = desk.at[1] + 1;
    step(s, cfg.balance.deskAway.everyMin + 5);
    expect(s.sim.life.get('income')).toBe(income);
    // 공원 (사무실 밖)
    s.player.pos.x = 73.5;
    s.player.pos.y = 32;
    step(s, cfg.balance.deskAway.everyMin + 2);
    expect(s.sim.life.get('income')).toBe(income + (cfg.life.rewards.deskAway.income ?? 0));
    expect(s.sim.life.ledger.at(-1)?.why).toBe('deskAway');
  });

  it('출근 전이나 업무를 마친 뒤에는 어디 있어도 찾지 않는다', () => {
    const s = office('08:10');
    const income = s.sim.life.get('income');
    s.player.pos.x = 73.5;
    s.player.pos.y = 32;
    step(s, cfg.balance.deskAway.everyMin + 2);
    expect(s.sim.life.get('income')).toBe(income);
  });
});
