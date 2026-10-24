import { simConfigOf, type GameConfig } from '../../src/core/config';
import { nightRecovery, parseTime, settleDay } from '../../src/sim/DayCycle';
import { NO_MODIFIERS } from '../../src/sim/EnergyModel';
import { applyContactOutcome, type CallHow, type MessageHow } from '../../src/sim/Phone';
import { Simulation } from '../../src/sim/Simulation';

// 한 주 밸런스 시뮬레이션 (sim 계층만). 실제 data로 세 가지 플레이 방식을 돌려 본다.
//   avoid    전부 회피: 전화·문자 무시, 대화 피함, 선택 목표 건너뜀 → 생활 지표가 무너져야 한다
//   accept   전부 수용: 모든 전화·문자·대화를 끝까지 → 배터리가 바닥나야 한다
//   balanced 적당히: 중요한 연락만 받고 나머지는 문자로, 대화 2번(짧게), 커피 1잔·집밥 → 한 주를 버텨야 한다
// 필수 상호작용은 세 방식 모두 수행한다. 이동·대화 시간은 대략값이다.

export type Policy = 'avoid' | 'accept' | 'balanced';

export interface WeekOptions {
  /** 하루 바깥 이동 시간 (초, 출퇴근 합) */
  commuteSec: number;
  /** 출퇴근 중 평균 군중 밀도 (기본 0.5 = 주변에 두 명쯤) */
  crowd?: number;
}

export interface DayRow {
  day: string;
  maxBattery: number;
  batteryEnd: number;
  talks: number;
  life: Record<string, number>;
  money: number;
}

export interface WeekResult {
  failed: 'burnout' | 'collapse' | null;
  day: string;
  stat?: string;
  rows: DayRow[];
}

const IMPORTANT = ['boss', 'landlord', 'mgmtOffice', 'delivery'];

export function playWeek(game: GameConfig, policy: Policy, opts: WeekOptions = { commuteSec: 120 }): WeekResult {
  const sim = new Simulation(simConfigOf(game), game.stimuli);
  const run = (sec: number, outdoor: boolean) => {
    const ctx = { outdoor, inSafe: false, modifiers: NO_MODIFIERS };
    for (let i = 0; i < Math.round(sec * 60); i++) sim.step(1 / 60, ctx);
  };
  /** 출퇴근: 거리 군중 속을 걷는다 (밀도만큼 군중 자극 + 긴장, 게임과 같은 규칙) */
  const commute = (sec: number) => {
    const cd = game.balance.crowdDensity;
    const density = opts.crowd ?? 0.5;
    sim.bus.setContinuous('crowd', 'crowd', density);
    const ctx = { outdoor: true, inSafe: false, modifiers: NO_MODIFIERS };
    for (let i = 0; i < Math.round(sec * 60); i++) {
      sim.energy.addMood('tension', (density * cd.stressPerSec) / 60, density >= cd.sustainFrom);
      sim.step(1 / 60, ctx);
    }
    sim.bus.setContinuous('crowd', 'crowd', 0);
  };
  const rows: DayRow[] = [];
  let nextMax = game.balance.battery.start;
  for (const day of game.days) {
    sim.startDay(nextMax);
    let talks = 0;
    const encounter = (stimulus: string, talkSec: number) => {
      talks++;
      sim.bus.emit(stimulus);
      sim.bus.setContinuous('dialogue', 'dialogue', 1);
      run(talkSec, true);
      sim.bus.setContinuous('dialogue', 'dialogue', 0);
      run(5, true);
    };
    commute(opts.commuteSec / 2);
    // 필수 상호작용
    const mandatoryCalls = day.objectives.filter((o) => o.mandatory && o.on.startsWith('answered:')).map((o) => o.on.split(':')[1]!);
    for (const o of day.objectives) {
      const speech = Object.values(game.speeches).find((s) => s.objectiveEvent === o.on);
      if (o.mandatory && speech) encounter(speech.stimulus, 0.1);
    }
    // 전화·문자
    for (const ev of day.phone) {
      const contact = game.life.contacts[ev.contact]!;
      const must = mandatoryCalls.includes(ev.contact);
      const important = IMPORTANT.includes(ev.contact) || !!contact.ally;
      let how: CallHow | MessageHow;
      if (policy === 'accept' || must) how = ev.kind === 'call' ? 'answered' : 'replied';
      else if (policy === 'avoid') how = ev.kind === 'call' ? 'missed' : 'unread';
      else how = ev.kind === 'call' ? (important ? 'answered' : 'texted') : important ? 'replied' : 'readIgnored';
      const out = applyContactOutcome(ev.contact, contact, how, sim.life);
      if (out.stimulus) sim.bus.emit(out.stimulus);
      if (how === 'replied') sim.bus.emit('textMessage');
      if (out.escalation) sim.bus.emit(out.escalation);
      run(2, true);
    }
    // 말을 걸어오는 사람들
    const approachers = day.npcs.filter((n) => game.npcProfiles[n.profile]!.approaches);
    if (policy === 'accept') for (const n of approachers) encounter(game.npcProfiles[n.profile]!.encounterStimulus, game.npcProfiles[n.profile]!.baseDurationSec);
    if (policy === 'balanced') {
      for (const n of approachers.slice(0, 2)) encounter(game.npcProfiles[n.profile]!.encounterStimulus, 12);
      sim.energy.recover(game.items.consumables.find((c) => c.id === 'coffee')?.effects.battery ?? 0);
    }
    // 업무: 일하는 동안 업무 스트레스, 끝나면 오후를 건너뛰고 지쳐서 퇴근
    if (day.work) {
      const w = game.balance.work;
      for (let i = 0; i < 40; i++) {
        sim.energy.addMood('stress', w.pressureStressPerSec + (i % 6 < 2 ? w.pendingPingStressPerSec : 0), true);
        if (i % 6 === 0) sim.bus.emit('workPing');
        run(1, false);
      }
      sim.life.apply(game.life.rewards.workDone);
      sim.life.addMoney(game.life.rewards.workPerTask * day.work.tasks);
      sim.energy.recover(game.balance.recovery.workAfternoon);
      sim.energy.addMood('stress', w.afternoonStress);
    }
    commute(opts.commuteSec / 2);
    // 선택 목표·장보기·집밥
    for (const o of day.objectives) if (o.optional && policy === 'avoid' && o.skip) sim.life.apply(o.skip);
    if (day.objectives.some((o) => o.on === 'done:checkout') && policy !== 'avoid') sim.life.apply(game.life.rewards.groceries);
    if (policy !== 'accept') {
      sim.energy.recover(game.balance.recovery.homeMeal);
      sim.life.apply({ essentials: game.life.rewards.homeMealEssentials });
    }
    const batteryEnd = sim.energy.battery;
    if (sim.energy.burnedOut) return { failed: 'burnout', day: day.id, rows };
    settleDay(game.life.settlement, sim.life, day.flags);
    rows.push({ day: day.id, maxBattery: nextMax, batteryEnd, talks, life: { ...sim.life.all() }, money: sim.life.money });
    const collapsed = sim.life.collapsed;
    if (collapsed) return { failed: 'collapse', day: day.id, stat: collapsed, rows };
    nextMax = nightRecovery(game.life.night, {
      stressAtBed: sim.energy.load,
      ruminations: sim.bus.activeRuminations,
      hobbyDone: false,
      bedMinutes: parseTime('22:00'),
      housing: sim.life.get('housing'),
      essentials: sim.life.get('essentials'),
    }).nextMax;
  }
  return { failed: null, day: 'all', rows };
}
