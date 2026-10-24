import { describe, expect, it } from 'vitest';
import { simConfigOf } from '../src/core/config';
import { DialogueBattle, type DialogueConfig, type DialoguePool } from '../src/sim/DialogueBattle';
import { GameClock, nightRecovery, parseTime, settleDay } from '../src/sim/DayCycle';
import { EnergyModel, NO_MODIFIERS, tierOf, type EnergyConfig } from '../src/sim/EnergyModel';
import { LifeStats } from '../src/sim/LifeStats';
import { Phone, applyContactOutcome } from '../src/sim/Phone';
import { Simulation, type SimConfig } from '../src/sim/Simulation';
import { SomaticController } from '../src/sim/SomaticController';
import { SpeechChallenge, stutterText } from '../src/sim/SpeechChallenge';
import { StimulusBus, type StimulusTable } from '../src/sim/StimulusBus';
import { readConfig } from '../tools/lib/readData';

const game = readConfig();

/** 테스트용 고정 설정 (데이터 파일 수치가 바뀌어도 규칙 검증은 유지) */
const energy: EnergyConfig = {
  battery: { max: 100, start: 100, outdoorDrainPerSec: 0.05, safeRecoverPerSec: 1, tiers: { tired: 69, danger: 39, critical: 14 } },
  stress: { max: 100, decayPerSec: 2, gainPerDamage: 1, decayDelaySec: 0 },
};
const simCfg: SimConfig = { ...simConfigOf(game), energy };
const table: StimulusTable = {
  call: { kind: 'ambush', channel: 'auditory', damage: 30 },
  talk: { kind: 'encounter', channel: 'social', damage: 10 },
  crowd: { kind: 'continuous', channel: 'auditory', ratePerSec: 0.3 },
  kick: { kind: 'rumination', channel: 'social', ratePerSec: 0.5, durationSec: 20 },
  awkwardSilence: { kind: 'continuous', channel: 'social', ratePerSec: 1 },
};

const quiet = { outdoor: false, inSafe: false, modifiers: NO_MODIFIERS };
function run(sim: Simulation, seconds: number, input: Parameters<Simulation['step']>[1] = quiet) {
  const dt = 1 / 60;
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt, input);
}

describe('StimulusBus', () => {
  it('기습형은 즉시 1회 데미지 + ambush 이벤트', () => {
    const bus = new StimulusBus(table);
    bus.emit('call');
    const r = bus.tick(1 / 60);
    expect(r.hits).toEqual([{ stimulusId: 'call', kind: 'ambush', channel: 'auditory', amount: 30, source: undefined }]);
    expect(r.ambushes).toEqual(['call']);
    expect(bus.tick(1 / 60).hits).toEqual([]);
  });

  it('데미지 배율 (리허설 −30%)', () => {
    const bus = new StimulusBus(table);
    bus.emit('talk', 'x', 0.7);
    expect(bus.tick(1).hits[0]!.amount).toBeCloseTo(7);
  });

  it('지속형은 강도 × 초당 데미지, 0이면 꺼짐, prefix로 일괄 해제', () => {
    const bus = new StimulusBus(table);
    bus.setContinuous('zone:lobby', 'crowd', 2);
    expect(bus.tick(1).hits[0]!.amount).toBeCloseTo(0.6);
    expect(bus.continuousRate((k) => k.startsWith('zone:'))).toBeCloseTo(0.6);
    bus.clearContinuous('zone:');
    expect(bus.tick(1).hits).toEqual([]);
  });

  it('내면형은 지속 시간 동안만 DoT, 정화하면 즉시 사라진다', () => {
    const bus = new StimulusBus(table);
    bus.emit('kick');
    let total = 0;
    for (let i = 0; i < 30; i++) total += bus.tick(1).hits.reduce((s, h) => s + h.amount, 0);
    expect(total).toBeCloseTo(10);
    bus.emit('kick');
    expect(bus.clearRuminations()).toBe(1);
    expect(bus.activeRuminations).toBe(0);
  });

  it('잘못된 사용은 즉시 오류', () => {
    const bus = new StimulusBus(table);
    expect(() => bus.emit('nope')).toThrow(/알 수 없는 자극/);
    expect(() => bus.emit('crowd')).toThrow(/setContinuous/);
    expect(() => bus.setContinuous('k', 'call', 1)).toThrow(/지속형/);
  });
});

describe('EnergyModel', () => {
  it('구간 판정 (CLAUDE.md 5.1 표)', () => {
    const t = energy.battery.tiers;
    expect([100, 70, 69, 40, 39, 15, 14, 1, 0].map((b) => tierOf(b, t))).toEqual([
      'stable', 'stable', 'tired', 'tired', 'danger', 'danger', 'critical', 'critical', 'burnout',
    ]);
  });

  it('감소량 = 기본 데미지 × (1 + stress/100) × 채널 배율', () => {
    const e = new EnergyModel(energy);
    e.debugSet({ stress: 50 });
    const dealt = e.applyHits([{ stimulusId: 'call', kind: 'ambush', channel: 'auditory', amount: 20 }], { ...NO_MODIFIERS, auditory: 0.5 });
    expect(dealt).toBeCloseTo(15);
    expect(e.battery).toBeCloseTo(85);
  });

  it('실외 자연 감소 0.05/초, 세이프 존·추가 회복은 상한까지', () => {
    const e = new EnergyModel(energy);
    e.tick(100, { outdoor: true, inSafe: false });
    expect(e.battery).toBeCloseTo(95);
    e.tick(3, { outdoor: true, inSafe: true });
    expect(e.battery).toBeCloseTo(98);
    e.startDay(80);
    expect(e.battery).toBe(80);
    e.tick(100, { outdoor: false, inSafe: false, extraRecoverPerSec: 1 });
    expect(e.battery).toBe(80);
  });

  it('번아웃 후에는 회복되지 않는다', () => {
    const e = new EnergyModel(energy);
    e.applyHits([{ stimulusId: 'x', kind: 'ambush', channel: 'social', amount: 500 }]);
    expect(e.burnedOut).toBe(true);
    e.tick(10, { outdoor: false, inSafe: true });
    expect(e.recover(50)).toBe(0);
    expect(e.battery).toBe(0);
  });
});

describe('Simulation', () => {
  it('구간 변화·번아웃 이벤트를 한 번씩 낸다', () => {
    const sim = new Simulation(simCfg, table);
    sim.bus.emit('call');
    run(sim, 0.1);
    sim.bus.emit('call');
    run(sim, 0.1);
    const types = sim.drainEvents().map((e) => (e.type === 'tierChanged' ? `${e.from}->${e.to}` : e.type));
    expect(types).toContain('stable->danger');
    expect(types).toContain('ambush');
    sim.bus.setContinuous('npc', 'crowd', 100);
    run(sim, 5);
    expect(sim.drainEvents().filter((e) => e.type === 'burnout')).toHaveLength(1);
  });

  it('어색한 침묵: 좁은 공간 + 지인이면 1초에 1씩 어색함과 배터리 감소', () => {
    const sim = new Simulation(simCfg, table);
    run(sim, 10, { ...quiet, awkwardPair: true });
    expect(sim.snapshot().awkwardness).toBeCloseTo(10, 0);
    expect(sim.report.silenceSec).toBeCloseTo(10, 0);
    expect(sim.snapshot().battery).toBeLessThan(91);
  });

  it('실제 데이터로 구성 가능하고, 이어폰(청각 감쇠)이 군중 소음 피해를 줄인다', () => {
    const plain = new Simulation(simConfigOf(game), game.stimuli);
    const ear = new Simulation(simConfigOf(game), game.stimuli);
    for (const s of [plain, ear]) s.bus.setContinuous('crowd', 'crowd', 2);
    run(plain, 30);
    run(ear, 30, { ...quiet, modifiers: { ...NO_MODIFIERS, auditory: 0.5 } });
    expect(100 - ear.snapshot().battery).toBeLessThan((100 - plain.snapshot().battery) * 0.6);
  });
});

describe('SomaticController', () => {
  const cfg = simConfigOf(game).somatic;

  it('다수 시선 + 높은 스트레스 → 홍조, 볼 감싸기로 가라앉음', () => {
    const s = new SomaticController(cfg);
    const base = { stress: 80, gazeCount: 4, continuousExposure: false, coveringCheeks: false, eyesClosed: false, flushRiseScale: 1, sanctuary: false };
    for (let i = 0; i < 60 * 8; i++) s.step(1 / 60, base);
    expect(s.intensity('flush')).toBeGreaterThan(0.5);
    const high = s.intensity('flush');
    for (let i = 0; i < 60 * 3; i++) s.step(1 / 60, { ...base, gazeCount: 0, coveringCheeks: true });
    expect(s.intensity('flush')).toBeLessThan(high - 0.3);
  });

  it('지속형 자극 60초 이상 → 편두통, 눈 감기·찬 음료로 완화', () => {
    const s = new SomaticController(cfg);
    const base = { stress: 0, gazeCount: 0, continuousExposure: true, coveringCheeks: false, eyesClosed: false, flushRiseScale: 1, sanctuary: false };
    for (let i = 0; i < 59; i++) s.step(1, base);
    expect(s.active('migraine')).toBe(false);
    for (let i = 0; i < 20; i++) s.step(1, base);
    expect(s.active('migraine')).toBe(true);
    s.coldDrink();
    expect(s.intensity('migraine')).toBeLessThan(0.1);
  });

  it('stress ≥ 80 말더듬, ≥ 70이 30초 지속되면 진땀, 찬물 세수는 전 증상 초기화', () => {
    const s = new SomaticController(cfg);
    const base = { stress: 85, gazeCount: 0, continuousExposure: false, coveringCheeks: false, eyesClosed: false, flushRiseScale: 1, sanctuary: false };
    s.step(0.1, base);
    expect(s.active('stutter')).toBe(true);
    for (let i = 0; i < 40 * 10; i++) s.step(0.1, base);
    expect(s.intensity('sweat')).toBeGreaterThan(0.5);
    expect(s.slips(0.01)).toBe(true);
    s.clearAll();
    expect(s.active('sweat') || s.active('stutter') || s.active('flush')).toBe(false);
  });
});

describe('DialogueBattle', () => {
  const rules: DialogueConfig = game.dialogueRules;
  const pool: DialoguePool = {
    greeting: { text: '안녕', kind: 'opening', durationSec: 2 },
    lines: [{ text: '질문?', kind: 'question', durationSec: 2 }],
    flushRemark: { text: '얼굴 빨개요', kind: 'remark', durationSec: 2 },
    closers: { satisfied: 's', parried: 'p', endured: 'e', sos: 'sos', awkward: 'a' },
  };
  const opts = { minDurationSec: 0, baseDurationSec: 30, ally: false, rng: () => 0.5 };
  const frame = { smiling: true, stutter: false, flushRemarkable: false };

  it('패링: 틈이 있는 대사 끝 ±0.4초에 이탈 → 즉시 종료', () => {
    const b = new DialogueBattle(rules, pool, opts);
    b.update(1.75, frame);
    expect(b.inWindow).toBe(true);
    b.respond('exit');
    expect(b.outcome).toBe('parried');
  });

  it('윈도우 밖 이탈은 오선택 → +10초, 종료 후 이불킥 대상', () => {
    const b = new DialogueBattle(rules, pool, opts);
    b.update(0.5, frame);
    b.respond('exit');
    expect(b.ended).toBe(false);
    expect(b.wrongCount).toBe(1);
    expect(b.remainingSec).toBeCloseTo(30 + 10 - 0.5);
  });

  it('말더듬 중에는 패링 윈도우가 절반', () => {
    const b = new DialogueBattle(rules, pool, opts);
    b.update(1.7, { ...frame, stutter: true });
    expect(b.inWindow).toBe(false);
  });

  it('맞는 리액션으로 만족도 100 → 이탈, 미소를 놓으면 만족도 하락', () => {
    const b = new DialogueBattle(rules, pool, opts);
    for (let i = 0; i < 30 && !b.ended; i++) {
      b.update(b.currentLine.durationSec - 0.1, frame);
      b.respond(b.currentLine.kind === 'question' ? 'answer' : 'nod');
      b.update(0.2 + rules.gapSec, frame);
    }
    expect(b.outcome).toBe('satisfied');
    const c = new DialogueBattle(rules, pool, opts);
    c.respond('nod');
    const before = c.satisfaction;
    c.update(1, { ...frame, smiling: false });
    expect(c.satisfaction).toBeLessThan(before);
  });

  it('최소 대화 시간(Boss) 전에는 패링도 만족 이탈도 불가', () => {
    const b = new DialogueBattle(rules, pool, { ...opts, minDurationSec: 60 });
    b.update(1.75, frame);
    b.respond('exit');
    expect(b.ended).toBe(false);
  });

  it('SOS: 10초 후 페널티 없이 이탈', () => {
    const b = new DialogueBattle(rules, pool, opts);
    b.requestSos();
    for (let i = 0; i < 11; i++) b.update(1, frame);
    expect(b.outcome).toBe('sos');
    expect(b.wrongCount).toBe(0);
  });

  it('홍조가 지적 가능하면 "얼굴 왜 빨개요?" 대사가 끼어든다 (1회)', () => {
    const b = new DialogueBattle(rules, pool, { ...opts, rng: () => 0 });
    b.update(2.01, { ...frame, flushRemarkable: true });
    b.update(rules.gapSec + 0.01, { ...frame, flushRemarkable: true });
    expect(b.drainEvents().some((e) => e.type === 'flushRemark')).toBe(true);
  });
});

describe('SpeechChallenge', () => {
  it('구간 안 입력은 매끄럽게, 놓치면 더듬고 다음 마디로', () => {
    const s = new SpeechChallenge({ beatSec: 1, zoneCenter: 0.7, zoneWidth: 0.2 }, ['하나', '둘']);
    s.update(0.7, false);
    s.press();
    s.update(1.01, false);
    expect(s.done).toBe(true);
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(stutterText('회의')).toBe('회, 회… 회의');
  });
});

describe('LifeStats · Phone · 에스컬레이션', () => {
  it('같은 대상 3회 회피 → 에스컬레이션, 받으면 누적 초기화', () => {
    const life = new LifeStats(game.life.stats);
    const landlord = game.life.contacts['landlord']!;
    expect(applyContactOutcome('landlord', landlord, 'declined', life).escalation).toBeUndefined();
    applyContactOutcome('landlord', landlord, 'missed', life);
    expect(applyContactOutcome('landlord', landlord, 'declined', life).escalation).toBe('doorbell');
    applyContactOutcome('landlord', landlord, 'answered', life);
    expect(life.avoidCount('landlord')).toBe(0);
  });

  it('전화는 울리다 끊기면 부재중, 문자로 대신하면 답장 대기 불안', () => {
    const phone = new Phone({ ringSec: 5, replyWaitSec: 10, maxVisible: 4 });
    phone.receiveCall('boss', 'k');
    phone.update(6);
    expect(phone.drainEvents().map((e) => (e.type === 'callResolved' ? e.how : e.type))).toEqual(['ring', 'missed']);
    phone.receiveCall('mom', 'k');
    phone.textInstead();
    expect(phone.waitingReply).toBe(true);
    phone.update(11);
    expect(phone.waitingReply).toBe(false);
  });

  it('하루가 끝나면 안 읽은 메시지는 안읽씹으로 정산', () => {
    const phone = new Phone({ ringSec: 5, replyWaitSec: 10, maxVisible: 4 });
    phone.receiveMessage('friend', 'k');
    phone.drainEvents();
    phone.endDay();
    expect(phone.drainEvents()[0]).toMatchObject({ type: 'messageResolved', how: 'unread' });
  });
});

describe('DayCycle', () => {
  it('시계·밤 회복·정산', () => {
    const c = new GameClock(parseTime('08:59'));
    c.advance(1, 1);
    expect(c.label).toBe('09:00');
    const good = nightRecovery(game.life.night, { stressAtBed: 0, ruminations: 0, hobbyDone: true, bedMinutes: parseTime('22:00'), housing: 60, essentials: 60 });
    const bad = nightRecovery(game.life.night, { stressAtBed: 80, ruminations: 3, hobbyDone: false, bedMinutes: parseTime('25:00'), housing: 10, essentials: 10 });
    expect(good.nextMax).toBe(game.life.night.baseMax);
    expect(bad.nextMax).toBeLessThan(80);
    expect(bad.nextMax).toBeGreaterThanOrEqual(game.life.night.minMax);
    const life = new LifeStats(game.life.stats);
    const lines = settleDay(game.life.settlement, life, { weeklyEval: true, monthEnd: true });
    expect(lines.map((l) => l.key)).toContain('settle.month.salary');
  });
});

/**
 * Phase 3 완료 기준: "전부 회피하는 플레이와 전부 수용하는 플레이가 각각 다른 이유로 실패한다"
 * 실제 data(days, life, stimuli, npcProfiles, speeches)로 한 주를 시뮬레이션한다.
 * 필수 상호작용은 두 정책 모두 수행한다 (회피 불가).
 */
describe('정책 시뮬레이션: 완전 회피 vs 완전 수용', () => {
  type Policy = 'avoid' | 'accept';

  function playWeek(policy: Policy): { failed: 'burnout' | 'collapse' | null; day: string; stat?: string } {
    const sim = new Simulation(simConfigOf(game), game.stimuli);
    let nextMax = game.balance.battery.start;
    for (const day of game.days) {
      sim.startDay(nextMax);
      const outdoor = { outdoor: true, inSafe: false, modifiers: NO_MODIFIERS };
      const encounter = (stimulus: string, talkSec: number) => {
        sim.bus.emit(stimulus);
        sim.bus.setContinuous('dialogue', 'dialogue', 1);
        run(sim, talkSec, outdoor);
        sim.bus.setContinuous('dialogue', 'dialogue', 0);
        run(sim, 5, outdoor);
      };
      // 출퇴근 이동 (실외 자연 감소)
      run(sim, 90, outdoor);
      // 필수 상호작용
      const mandatoryCalls = day.objectives.filter((o) => o.mandatory && o.on.startsWith('answered:')).map((o) => o.on.split(':')[1]!);
      for (const o of day.objectives) {
        const speech = Object.values(game.speeches).find((s) => s.objectiveEvent === o.on);
        if (o.mandatory && speech) encounter(speech.stimulus, 0.1);
      }
      // 전화·문자
      for (const ev of day.phone) {
        const contact = game.life.contacts[ev.contact]!;
        const mustAnswer = mandatoryCalls.includes(ev.contact);
        const how = policy === 'accept' || mustAnswer ? (ev.kind === 'call' ? 'answered' : 'replied') : ev.kind === 'call' ? 'missed' : 'unread';
        const out = applyContactOutcome(ev.contact, contact, how, sim.life);
        if (out.stimulus) sim.bus.emit(out.stimulus);
        if (how === 'replied') sim.bus.emit('textMessage');
        if (out.escalation) sim.bus.emit(out.escalation);
        run(sim, 2, outdoor);
      }
      // 말을 걸어오는 사람들: 수용하면 끝까지 대화, 회피하면 숨어서 지나간다
      if (policy === 'accept') {
        for (const n of day.npcs) {
          const p = game.npcProfiles[n.profile]!;
          if (p.approaches) encounter(p.encounterStimulus, p.baseDurationSec);
        }
      }
      // 선택 목표: 회피하면 건너뜀
      for (const o of day.objectives) if (o.optional && policy === 'avoid' && o.skip) sim.life.apply(o.skip);
      if (sim.energy.burnedOut) return { failed: 'burnout', day: day.id };
      settleDay(game.life.settlement, sim.life, day.flags);
      const collapsed = sim.life.collapsed;
      if (collapsed) return { failed: 'collapse', day: day.id, stat: collapsed };
      nextMax = nightRecovery(game.life.night, {
        stressAtBed: sim.energy.stress,
        ruminations: sim.bus.activeRuminations,
        hobbyDone: false,
        bedMinutes: parseTime('22:00'),
        housing: sim.life.get('housing'),
        essentials: sim.life.get('essentials'),
      }).nextMax;
    }
    return { failed: null, day: 'all' };
  }

  it('전부 수용하면 배터리가 바닥나 번아웃', () => {
    expect(playWeek('accept').failed).toBe('burnout');
  });

  it('전부 회피하면 생활 지표가 무너진다 (번아웃은 아님)', () => {
    const r = playWeek('avoid');
    expect(r.failed).toBe('collapse');
    expect(r.stat).toBeDefined();
  });
});
