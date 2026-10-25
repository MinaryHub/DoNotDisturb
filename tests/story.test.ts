import { describe, expect, it } from 'vitest';
import { GameSession, NO_CONTROLS, type Controls } from '../src/gameplay/GameSession';
import { applyStory, epilogueKeys, storyAllows } from '../src/gameplay/Story';
import { parseTime } from '../src/sim/DayCycle';
import { readConfig } from '../tools/lib/readData';

// 한 주를 꿰는 이야기 줄기: 지난 날의 선택(표지)이 다음 날의 전화·목표·사람·결말을 바꾼다.

const cfg = readConfig();
const dt = 1 / 60;
const dayIndex = (id: string) => cfg.days.findIndex((d) => d.id === id);

function step(s: GameSession, seconds: number, c: Partial<Controls> = {}): void {
  for (let i = 0; i < Math.round(seconds / dt); i++) s.step(dt, { ...NO_CONTROLS, ...c });
}

function dayWith(id: string, flags: string[]): GameSession {
  const s = new GameSession(cfg);
  for (const f of flags) s.story.add(f);
  s.startDay(dayIndex(id));
  s.step(dt, { ...NO_CONTROLS, confirm: true });
  return s;
}

describe('이야기 조건', () => {
  it('"flag"는 있어야, "!flag"는 없어야 한다', () => {
    const flags = new Set(['a']);
    expect(storyAllows(undefined, flags)).toBe(true);
    expect(storyAllows(['a'], flags)).toBe(true);
    expect(storyAllows(['!a'], flags)).toBe(false);
    expect(storyAllows(['a', '!b'], flags)).toBe(true);
  });

  it('조건에 맞지 않는 목표가 빠지면 그 목표를 기다리던 requires도 지운다', () => {
    const thu = cfg.days[dayIndex('dayThu')]!;
    const day = applyStory({ ...thu, objectives: [...thu.objectives, { id: 'x', textKey: 'obj.home', on: 'never', requires: ['memo'] }] }, new Set(['upstairs.resolved']));
    expect(day.objectives.some((o) => o.id === 'memo')).toBe(false);
    expect(day.objectives.find((o) => o.id === 'x')!.requires).toEqual([]);
  });
});

describe('발표 줄기', () => {
  it('화요일에 팀장님 메시지에 답하면 표지가 남고, 그날을 다시 하면 아침으로 돌아간다', () => {
    const s = dayWith('day2', []);
    s.clock.minutes = parseTime('09:19');
    step(s, 70);
    const msg = s.phone.messages.find((m) => m.contactId === 'boss' && !m.resolved)!;
    expect(msg.textKey).toBe('phone.boss.pitchPrep');
    s.phone.reply(msg.id);
    step(s, 0.1);
    expect(s.story.has('pitch.prepped')).toBe(true);
    expect(s.saveState().story).not.toContain('pitch.prepped');
    s.retryDay();
    expect(s.story.has('pitch.prepped')).toBe(false);
  });

  it('초안을 미리 보냈으면 목요일은 점검만, 아니면 10시 반 마감과 재촉 메시지', () => {
    const ready = dayWith('dayThu', ['pitch.prepped']);
    expect(ready.objectives.get('work')!.def.textKey).toBe('obj.workPitchCheck');
    expect(ready.day.phone.some((p) => p.textKey === 'phone.boss.pitchWhere')).toBe(false);
    expect(ready.day.notes!.map((n) => n.textKey)).toContain('note.thu.prepped');

    const rushed = dayWith('dayThu', []);
    expect(rushed.objectives.get('work')!.def.textKey).toBe('obj.workPitchRush');
    expect(rushed.objectives.get('work')!.def.deadline).toBe('10:30');
    expect(rushed.day.phone.some((p) => p.textKey === 'phone.boss.pitchWhere')).toBe(true);
  });

  it('목요일 회의 자리는 발표 → 질문 시간으로 이어지고, 잘 끝나도 이불킥이 온다', () => {
    const s = dayWith('dayThu', ['pitch.prepped']);
    s.player.pos.x = 150;
    s.player.pos.y = 25;
    step(s, 0.2);
    s.objectives.get('work')!.done = true;
    const seat = cfg.world.interactables.find((i) => i.id === 'meetingSeat')!;
    s.player.pos.x = seat.at[0];
    s.player.pos.y = seat.at[1];
    step(s, 0.1);
    s.step(dt, { ...NO_CONTROLS, interactPressed: true });
    const speeches: string[] = [];
    for (let i = 0; i < 60 * 60 && s.mode.kind === 'speech'; i++) {
      const m = s.mode;
      if (speeches.at(-1) !== m.speechId) speeches.push(m.speechId);
      const hit = m.challenge.marker > m.challenge.zone.from + 0.02 && m.challenge.marker < m.challenge.zone.to - 0.02;
      s.step(dt, { ...NO_CONTROLS, spacePressed: hit });
    }
    expect(speeches).toEqual(['pitch', 'pitchQna']);
    expect(s.objectives.isDone('pitch')).toBe(true);
    expect(s.story.has('pitch.done')).toBe(true);
    expect(s.sim.bus.activeRuminations).toBeGreaterThan(0);
  });
});

describe('윗집·지우 줄기', () => {
  it('윗집 일이 풀리지 않았으면 목요일에 쪽지 목표와 윗집 사람이 있고, 현관 메모지가 쪽지가 된다', () => {
    const s = dayWith('dayThu', []);
    expect(s.objectives.get('memo')).toBeDefined();
    expect(s.day.npcs.some((n) => n.id === 'upstairs')).toBe(true);
    s.gameEvent('interact:homeMemo');
    expect(s.story.has('upstairs.resolved')).toBe(true);

    const calm = dayWith('dayThu', ['upstairs.resolved']);
    expect(calm.objectives.get('memo')).toBeUndefined();
    expect(calm.day.areaStimuli ?? []).toEqual([]);
  });

  it('지우에게 한 번도 답하지 않았으면 토요일 약속이 없고, 답했으면 카페에서 만난다', () => {
    const none = dayWith('day4', []);
    expect(none.objectives.get('friend')).toBeUndefined();
    expect(none.day.npcs.some((n) => n.id === 'friend')).toBe(false);
    expect(none.day.phone.some((p) => p.textKey === 'phone.friend.nextTime')).toBe(true);

    const met = dayWith('day4', ['jiu.answered']);
    expect(met.objectives.get('friend')!.def.textKey).toBe('obj.friendMoving');
    expect(met.day.npcs.some((n) => n.id === 'friend')).toBe(true);
  });
});

describe('주간 결말', () => {
  it('줄기마다 조건이 맞는 첫 줄', () => {
    expect(epilogueKeys(cfg.story, new Set())).toEqual(['epi.pitch.rushed', 'epi.upstairs.none', 'epi.jiu.none']);
    expect(epilogueKeys(cfg.story, new Set(['pitch.prepped', 'pitch.rehearsed', 'upstairs.note', 'upstairs.resolved', 'jiu.answered', 'jiu.met']))).toEqual([
      'epi.pitch.ready',
      'epi.upstairs.note',
      'epi.jiu.met',
    ]);
  });
});
