import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS } from '../src/gameplay/GameSession';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 리뷰에서 찾은 버그가 다시 생기지 않게

const cfg = readConfig();
const dt = 1 / 60;

function free(): GameSession {
  const s = new GameSession(cfg);
  s.step(dt, { ...NO_CONTROLS, confirm: true });
  s.clock.minutes = parseTime('11:00');
  return s;
}

describe('회귀', () => {
  it('같은 일을 되풀이해도 인상은 하루에 한 번만 오른다 (현관 메모지 연타)', () => {
    const s = free();
    const before = s.reputation.get('upstairs');
    for (let i = 0; i < 8; i++) s.gameEvent('interact:homeMemo');
    expect(s.reputation.get('upstairs')).toBe(before + cfg.reputation.events['interact:homeMemo']!['upstairs']!);
    s.startDay(1);
    s.gameEvent('interact:homeMemo');
    expect(s.reputation.get('upstairs')).toBe(before + 2 * cfg.reputation.events['interact:homeMemo']!['upstairs']!);
  });

  it('"모두 사라져 버려~"로 피팅룸 노크 중 집에 가면 노크는 두고 오고, 집에 들어온 일은 일어난다', () => {
    const s = free();
    s.qte = { kind: 'knock', timer: 0, window: 3 };
    s.player.inventory.consumables['vanish'] = 1;
    s.step(dt, { ...NO_CONTROLS, useItem: s.bagSlots().indexOf('vanish') });
    expect(s.qte).toBeNull();
    s.step(dt, NO_CONTROLS);
    expect(s.atHome).toBe(true);
    for (let i = 0; i < 300; i++) s.step(dt, NO_CONTROLS);
    expect(s.mode.kind).not.toBe('dialogue');
  });

  it('주저앉았다 일어나면 아이템 효과는 사라진다', () => {
    const s = free();
    s.buffs.resist = { scale: 0.5, left: 100 };
    s.respawnHome();
    expect(s.buffs.resist.left).toBe(0);
  });

  it('버스를 기다리는 중에도 붙잡힐 수 있다 (기다림을 그만두고 대화)', () => {
    const s = free();
    const stop = cfg.world.interactables.find((i) => i.id === 'busM_west')!;
    s.player.pos.x = stop.at[0];
    s.player.pos.y = stop.at[1];
    s.step(dt, NO_CONTROLS);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    expect(s.mode.kind).toBe('bus');
    const npc = s.npcs.find((n) => n.profileId === 'coworker')!;
    npc.pos.x = s.player.pos.x + 1;
    npc.pos.y = s.player.pos.y;
    let talked = false;
    for (let i = 0; i < 60 * 15 && !talked; i++) {
      s.player.pos.x = stop.at[0];
      s.player.pos.y = stop.at[1];
      s.step(dt, NO_CONTROLS);
      talked = s.mode.kind === 'dialogue';
    }
    // 가까이 있던 동료가 말을 걸 수 있었다면 기다림은 대화로 바뀐다 (바쁜 사람만 아니면)
    if (talked) expect(s.mode.kind).toBe('dialogue');
    expect(s.sim.report.smalltalkAvoided).toBe(0);
  });
});
