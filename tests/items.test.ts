import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS, type Controls } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 먹는 아이템: 피로회복·스트레스 해소·차분함·스트레스 내성, 그리고 "모두 사라져 버려~" (집으로 순간 이동)

const cfg = readConfig();
const dt = 1 / 60;

function step(s: GameSession, seconds: number, c: Partial<Controls> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.step(dt, { ...NO_CONTROLS, ...c });
}

function outside(items: string[]): GameSession {
  const s = new GameSession(cfg);
  s.step(dt, { ...NO_CONTROLS, confirm: true });
  s.clock.minutes = parseTime('11:00');
  s.player.pos.x = 150;
  s.player.pos.y = 58;
  for (const id of items) s.player.inventory.consumables[id] = 1;
  step(s, 0.1);
  return s;
}

/** 가방 칸 순서대로 단축키 */
function use(s: GameSession, id: string): void {
  s.step(dt, { ...NO_CONTROLS, useItem: s.bagSlots().indexOf(id) });
}

describe('먹는 아이템', () => {
  it('피로회복 드링크: 그 자리에서 에너지가 찬다', () => {
    const s = outside(['energyShot']);
    s.sim.energy.debugSet({ battery: 50 });
    use(s, 'energyShot');
    expect(s.sim.energy.battery).toBeGreaterThan(65);
  });

  it('캐모마일 젤리: 먹은 뒤 한동안 마음이 계속 가라앉는다', () => {
    const plain = outside([]);
    const jelly = outside(['calmJelly']);
    use(jelly, 'calmJelly');
    step(jelly, 3.2);
    step(plain, 3.2);
    for (const s of [plain, jelly]) {
      s.sim.energy.debugSet({ stress: 50 });
      step(s, 2);
    }
    expect(jelly.sim.energy.mood('stress')).toBeLessThan(plain.sim.energy.mood('stress') - 2.5);
  });

  it('단단 비타민: 한동안 자극이 마음을 올리는 양이 절반', () => {
    const plain = outside([]);
    const tough = outside(['toughVitamin']);
    use(tough, 'toughVitamin');
    for (const s of [plain, tough]) {
      s.sim.energy.debugSet({ tension: 0, stress: 0, panic: 0 });
      s.sim.bus.emit('voiceCall');
      s.step(dt, NO_CONTROLS);
    }
    const sum = (s: GameSession) => s.sim.energy.mood('tension') + s.sim.energy.mood('stress') + s.sim.energy.mood('panic');
    expect(sum(tough)).toBeLessThan(sum(plain) * 0.7);
  });

  it('"모두 사라져 버려~": 그 자리에서 잠근 집으로, 시간은 그대로, 하루 한 번', () => {
    const s = outside(['vanish']);
    const t = s.clock.minutes;
    use(s, 'vanish');
    expect(s.atHome).toBe(true);
    expect(s.sanctuary).toBe(true);
    expect(s.clock.minutes - t).toBeLessThan(1);
    expect(s.player.inventory.consumables['vanish']).toBe(1);
    s.player.pos.x = 150;
    s.player.pos.y = 58;
    step(s, 0.1);
    use(s, 'vanish');
    expect(s.atHome).toBe(false);
  });
});
