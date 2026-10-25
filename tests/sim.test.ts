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
import { playWeek } from '../tools/lib/weekSim';
import { StimulusBus, type StimulusTable } from '../src/sim/StimulusBus';
import { readConfig } from '../tools/lib/readData';

const game = readConfig();

/** 테스트용 고정 설정 (데이터 파일 수치가 바뀌어도 규칙 검증은 유지) */
const energy: EnergyConfig = {
  battery: { max: 100, start: 100, outdoorDrainPerSec: 0.05, safeRecoverPerSec: 1, tiers: { tired: 69, danger: 39, critical: 14 } },
  psyche: {
    max: 100,
    gain: { ambush: 2, encounter: 2, continuous: 2, rumination: 2 },
    hitEnergy: 0.5,
    drain: { tension: 1, stress: 1, panic: 1, meltdown: 2 },
    decay: { tension: 2, stress: 2, panic: 2 },
    decayDelaySec: { tension: 0.5, stress: 0.5, panic: 0.5 },
    meltdown: { threshold: 60, risePerSec: 5, decayPerSec: 1 },
    symptomFrom: 60,
  },
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

  it('자극은 심리 상태로: 기습 → 당황, 대면·시선 → 긴장, 소음 → 스트레스 (채널 배율 적용, 기습·대면은 순간 에너지도)', () => {
    const e = new EnergyModel(energy);
    const jolt = e.applyHits([{ stimulusId: 'call', kind: 'ambush', channel: 'auditory', amount: 20 }], { ...NO_MODIFIERS, auditory: 0.5 });
    expect(jolt).toBeCloseTo(5); // 20 × 0.5 × hitEnergy 0.5
    expect(e.mood('panic')).toBeCloseTo(20); // 20 × 0.5 × gain 2
    e.applyHits([{ stimulusId: 'talk', kind: 'encounter', channel: 'social', amount: 10 }]);
    expect(e.mood('tension')).toBeCloseTo(20);
    e.applyHits([{ stimulusId: 'noise', kind: 'continuous', channel: 'auditory', amount: 5 }]);
    expect(e.mood('stress')).toBeCloseTo(10);
  });

  it('에너지는 심리 상태에 비례해 닳는다 (상태 100이면 초당 drain)', () => {
    const e = new EnergyModel(energy);
    e.debugSet({ tension: 50 });
    expect(e.drainPerSec).toBeCloseTo(0.5);
    const before = e.battery;
    e.tick(0.1, { outdoor: false, inSafe: false });
    expect(before - e.battery).toBeCloseTo(0.05, 2);
  });

  it('멘붕: 둘 이상이 문턱을 넘으면 차오르고 가장 크게 깎는다', () => {
    const e = new EnergyModel(energy);
    e.debugSet({ tension: 90, stress: 90 });
    e.addMood('tension', 0, true);
    e.addMood('stress', 0, true);
    e.tick(1, { outdoor: false, inSafe: false });
    expect(e.mood('meltdown')).toBeGreaterThan(4);
    const one = new EnergyModel(energy);
    one.debugSet({ tension: 90 });
    one.tick(1, { outdoor: false, inSafe: false });
    expect(one.mood('meltdown')).toBe(0);
  });

  it('주저앉은 뒤 다시 일어나면 에너지 일부, 심리 상태 0', () => {
    const e = new EnergyModel(energy);
    e.debugSet({ battery: 0, panic: 80 });
    expect(e.burnedOut).toBe(true);
    e.revive(35);
    expect(e.battery).toBe(35);
    expect(e.load).toBe(0);
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
    for (let i = 0; i < 3; i++) {
      sim.bus.emit('call');
      run(sim, 0.1);
    }
    const types = sim.drainEvents().map((e) => (e.type === 'tierChanged' ? `${e.from}->${e.to}` : e.type));
    expect(types).toContain('stable->tired');
    expect(types).toContain('ambush');
    sim.bus.setContinuous('npc', 'crowd', 100);
    run(sim, 90);
    expect(sim.drainEvents().filter((e) => e.type === 'burnout')).toHaveLength(1);
  });

  it('어색한 침묵: 좁은 공간 + 지인이면 1초에 1씩 어색함, 긴장이 오르고 그만큼 에너지가 닳는다', () => {
    const sim = new Simulation(simCfg, table);
    run(sim, 10, { ...quiet, awkwardPair: true });
    expect(sim.snapshot().awkwardness).toBeCloseTo(10, 0);
    expect(sim.report.silenceSec).toBeCloseTo(10, 0);
    expect(sim.snapshot().tension).toBeGreaterThan(15);
    expect(sim.snapshot().battery).toBeLessThan(99.5);
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

  it('다수 시선 + 높은 긴장 → 홍조, 볼 감싸기로 가라앉음', () => {
    const s = new SomaticController(cfg);
    const base = { tension: 80, stress: 0, panic: 0, gazeCount: 4, continuousExposure: false, coveringCheeks: false, eyesClosed: false, flushRiseScale: 1, sanctuary: false };
    for (let i = 0; i < 60 * 8; i++) s.step(1 / 60, base);
    expect(s.intensity('flush')).toBeGreaterThan(0.5);
    const high = s.intensity('flush');
    for (let i = 0; i < 60 * 3; i++) s.step(1 / 60, { ...base, gazeCount: 0, coveringCheeks: true });
    expect(s.intensity('flush')).toBeLessThan(high - 0.3);
  });

  it('지속형 자극 60초 이상 + 문턱 이상 스트레스 → 편두통, 눈 감기·찬 음료로 완화', () => {
    const calm = new SomaticController(cfg);
    const calmBase = { tension: 0, stress: 20, panic: 0, gazeCount: 0, continuousExposure: true, coveringCheeks: false, eyesClosed: false, flushRiseScale: 1, sanctuary: false };
    for (let i = 0; i < 120; i++) calm.step(1, calmBase);
    expect(calm.active('migraine')).toBe(false);

    const s = new SomaticController(cfg);
    const base = { tension: 0, stress: 65, panic: 0, gazeCount: 0, continuousExposure: true, coveringCheeks: false, eyesClosed: false, flushRiseScale: 1, sanctuary: false };
    for (let i = 0; i < 59; i++) s.step(1, base);
    expect(s.active('migraine')).toBe(false);
    for (let i = 0; i < 20; i++) s.step(1, base);
    expect(s.active('migraine')).toBe(true);
    s.relieve('migraine', 0.5);
    expect(s.intensity('migraine')).toBeLessThan(0.1);
  });

  it('당황 ≥ 문턱이면 말더듬, 스트레스 ≥ 70이 30초 지속되면 진땀, 찬물 세수는 전 증상 초기화', () => {
    const s = new SomaticController(cfg);
    const base = { tension: 0, stress: 85, panic: 85, gazeCount: 0, continuousExposure: false, coveringCheeks: false, eyesClosed: false, flushRiseScale: 1, sanctuary: false };
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

  it('매일 밤 생활비: 낼 수 있으면 돈이 줄고, 모자라면 생활 필수가 깎인다', () => {
    const life = new LifeStats(game.life.stats);
    const cost = game.life.settlement.dailyCost;
    const money = life.money;
    settleDay(game.life.settlement, life, {});
    expect(life.money).toBe(money - cost.money);
    life.addMoney(-life.money);
    const before = life.get('essentials');
    const lines = settleDay(game.life.settlement, life, {});
    expect(lines.some((l) => l.key === 'settle.daily.unpaid')).toBe(true);
    expect(life.get('essentials')).toBeLessThan(before + (game.life.settlement.dailyDecay.essentials ?? 0) + 1);
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
 * + 밸런스 기준: "적당히 하는 플레이는 한 주를 버틴다" (tools/lib/weekSim.ts, npm run balance)
 */
describe('정책 시뮬레이션: 회피 vs 수용 vs 적당히', () => {
  it('전부 수용하면 배터리가 바닥나 번아웃', () => {
    expect(playWeek(game, 'accept').failed).toBe('burnout');
  });

  it('전부 회피하면 생활 지표가 무너진다 (번아웃은 아님)', () => {
    const r = playWeek(game, 'avoid');
    expect(r.failed).toBe('collapse');
    expect(r.stat).toBeDefined();
  });

  it('적당히 하면 한 주를 버티고, 생활 지표도 지켜진다', () => {
    const r = playWeek(game, 'balanced');
    expect(r.failed).toBeNull();
    for (const d of r.rows) for (const v of Object.values(d.life)) expect(v).toBeGreaterThan(20);
  });

  it('적당히 해도 생활 지표가 위에서 꽉 차지 않는다 (후반에도 회피의 대가가 남는다)', () => {
    const r = playWeek(game, 'balanced');
    for (const d of r.rows.slice(3)) for (const v of Object.values(d.life)) expect(v).toBeLessThan(95);
  });

  it('기술·조용한 곳·부탁까지 써도 한 주의 정점(목요일)은 여전히 빠듯하다', () => {
    const plain = playWeek(game, 'balanced');
    const r = playWeek(game, 'balanced', { commuteSec: 120, extras: true });
    expect(r.failed).toBeNull();
    const thu = (w: typeof r) => w.rows.find((d) => d.day === 'dayThu')!.batteryEnd;
    // 회복 수단을 찾아 쓴 만큼은 편해지지만, 반 넘게 남지는 않는다
    expect(thu(r)).toBeGreaterThan(thu(plain));
    expect(thu(r)).toBeLessThan(50);
  });
});
