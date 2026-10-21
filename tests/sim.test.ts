import { describe, expect, it } from 'vitest';
import balanceJson from '../data/balance.json';
import stimuliJson from '../data/stimuli.json';
import { balanceConfigSchema, stimulusTableSchema } from '../src/core/configSchemas';
import { EnergyModel, NO_MODIFIERS, tierOf, type EnergyConfig } from '../src/sim/EnergyModel';
import { StimulusBus, type StimulusTable } from '../src/sim/StimulusBus';
import { Simulation } from '../src/sim/Simulation';

const balance = balanceConfigSchema.parse(balanceJson);
const stimuli = stimulusTableSchema.parse(stimuliJson);

/** 테스트용 고정 설정 (데이터 파일 수치가 바뀌어도 규칙 검증은 유지) */
const cfg: EnergyConfig = {
  battery: { max: 100, start: 100, outdoorDrainPerSec: 0.05, safeRecoverPerSec: 1, tiers: { tired: 69, danger: 39, critical: 14 } },
  stress: { max: 100, decayPerSec: 2, gainPerDamage: 1, decayDelaySec: 0 },
};
const table: StimulusTable = {
  call: { kind: 'ambush', channel: 'auditory', damage: 30 },
  talk: { kind: 'encounter', channel: 'social', damage: 10 },
  crowd: { kind: 'continuous', channel: 'auditory', ratePerSec: 0.3 },
  kick: { kind: 'rumination', channel: 'social', ratePerSec: 0.5, durationSec: 20 },
};

function run(sim: Simulation, seconds: number, input = { outdoor: false, inSafe: false, modifiers: NO_MODIFIERS }) {
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

  it('지속형은 강도 × 초당 데미지, 0이면 꺼짐', () => {
    const bus = new StimulusBus(table);
    bus.setContinuous('zone:lobby', 'crowd', 2);
    expect(bus.tick(1).hits[0]!.amount).toBeCloseTo(0.6);
    bus.setContinuous('zone:lobby', 'crowd', 0);
    expect(bus.tick(1).hits).toEqual([]);
  });

  it('내면형은 지속 시간 동안만 DoT', () => {
    const bus = new StimulusBus(table);
    bus.emit('kick');
    let total = 0;
    for (let i = 0; i < 30; i++) total += bus.tick(1).hits.reduce((s, h) => s + h.amount, 0);
    expect(total).toBeCloseTo(10); // 0.5/초 × 20초
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
    const t = cfg.battery.tiers;
    expect(tierOf(100, t)).toBe('stable');
    expect(tierOf(70, t)).toBe('stable');
    expect(tierOf(69, t)).toBe('tired');
    expect(tierOf(40, t)).toBe('tired');
    expect(tierOf(39, t)).toBe('danger');
    expect(tierOf(15, t)).toBe('danger');
    expect(tierOf(14, t)).toBe('critical');
    expect(tierOf(1, t)).toBe('critical');
    expect(tierOf(0, t)).toBe('burnout');
  });

  it('감소량 = 기본 데미지 × (1 + stress/100) × 채널 배율', () => {
    const e = new EnergyModel(cfg);
    e.debugSet({ stress: 50 });
    const dealt = e.applyHits([{ stimulusId: 'call', kind: 'ambush', channel: 'auditory', amount: 20 }], {
      ...NO_MODIFIERS,
      auditory: 0.5,
    });
    expect(dealt).toBeCloseTo(20 * 1.5 * 0.5);
    expect(e.battery).toBeCloseTo(85);
  });

  it('자극을 받으면 스트레스 상승, 없으면 초당 2 감소', () => {
    const e = new EnergyModel(cfg);
    e.applyHits([{ stimulusId: 'x', kind: 'ambush', channel: 'social', amount: 10 }]);
    expect(e.stress).toBeCloseTo(10);
    e.tick(2, { outdoor: false, inSafe: false });
    expect(e.stress).toBeCloseTo(6);
  });

  it('실외 자연 감소 0.05/초, 실내는 감소 없음, 세이프 존은 회복', () => {
    const e = new EnergyModel(cfg);
    e.tick(100, { outdoor: true, inSafe: false });
    expect(e.battery).toBeCloseTo(95);
    e.tick(100, { outdoor: false, inSafe: false });
    expect(e.battery).toBeCloseTo(95);
    e.tick(3, { outdoor: true, inSafe: true });
    expect(e.battery).toBeCloseTo(98);
    e.tick(100, { outdoor: false, inSafe: true });
    expect(e.battery).toBe(100);
  });

  it('번아웃 후에는 더 변하지 않는다', () => {
    const e = new EnergyModel(cfg);
    e.applyHits([{ stimulusId: 'x', kind: 'ambush', channel: 'social', amount: 500 }]);
    expect(e.battery).toBe(0);
    expect(e.burnedOut).toBe(true);
    e.tick(10, { outdoor: false, inSafe: true });
    expect(e.battery).toBe(0);
  });
});

describe('Simulation', () => {
  it('구간 변화·번아웃 이벤트를 한 번씩 낸다', () => {
    const sim = new Simulation(cfg, table);
    sim.bus.emit('call'); // 100 → 70 (아직 stable)
    run(sim, 0.1);
    sim.bus.emit('call'); // 30 × 1.3(스트레스 30) = 39 → 31, tired를 건너뛰고 danger
    run(sim, 0.1);
    const types = sim.drainEvents().map((e) => (e.type === 'tierChanged' ? `${e.from}->${e.to}` : e.type));
    expect(types).toContain('stable->danger');
    expect(types).toContain('ambush');
    sim.bus.setContinuous('npc', 'crowd', 100);
    run(sim, 5);
    const later = sim.drainEvents();
    expect(later.filter((e) => e.type === 'burnout')).toHaveLength(1);
    expect(sim.snapshot().tier).toBe('burnout');
  });

  it('실제 데이터(balance.json, stimuli.json)로 구성 가능하고, 지속 자극만으로도 결국 번아웃', () => {
    const sim = new Simulation(balance, stimuli);
    sim.bus.setContinuous('zone', 'crowd', 1);
    sim.bus.setContinuous('npc', 'smalltalkLinger', 1);
    run(sim, 120, { outdoor: true, inSafe: false, modifiers: NO_MODIFIERS });
    expect(sim.snapshot().burnedOut).toBe(true);
  });

  it('이어폰(청각 감쇠)이 군중 소음 피해를 줄인다', () => {
    const plain = new Simulation(balance, stimuli);
    const earphones = new Simulation(balance, stimuli);
    for (const s of [plain, earphones]) s.bus.setContinuous('zone', 'crowd', 1);
    run(plain, 30);
    run(earphones, 30, { outdoor: false, inSafe: false, modifiers: { ...NO_MODIFIERS, auditory: 0.5 } });
    expect(100 - earphones.snapshot().battery).toBeLessThan((100 - plain.snapshot().battery) * 0.6);
  });
});
