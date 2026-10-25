import type { LifeDelta, LifeStatId, LifeStats } from './LifeStats';

// 하루 사이클: 게임 시계, 밤 회복(다음 날 배터리 상한), 정산 (CLAUDE.md 5.1, 5.4, 6 공통 흐름)

/** "08:10" → 490 (분) */
export function parseTime(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) throw new Error(`시간 형식 오류: "${hhmm}" (HH:MM)`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatTime(minutes: number): string {
  const total = Math.floor(minutes);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class GameClock {
  constructor(public minutes: number) {}

  advance(dtSec: number, minutesPerSecond: number): void {
    this.minutes += dtSec * minutesPerSecond;
  }

  /** 미니게임·이동 등으로 시간을 건너뛴다 (뒤로 가지는 않음) */
  skipTo(minutes: number): void {
    if (minutes > this.minutes) this.minutes = minutes;
  }

  passed(hhmm: string): boolean {
    return this.minutes >= parseTime(hhmm);
  }

  get label(): string {
    return formatTime(this.minutes);
  }
}

export interface NightConfig {
  baseMax: number;
  minMax: number;
  /** 잠들 때 스트레스 1당 다음 날 상한 감소 */
  stressPenaltyPerPoint: number;
  /** 정화하지 못한 이불킥 1개당 감소 */
  ruminationPenalty: number;
  /** 취미(건반 연주 등)를 했으면 보너스 */
  hobbyBonus: number;
  /** 이 시각 이후 잠들면 시간당 감소 */
  lateFrom: string;
  latePenaltyPerHour: number;
  /** 주거 안정이 이 미만이면 집 회복량 감소 */
  housingLow: number;
  housingLowPenalty: number;
  /** 생활 필수가 이 미만이면 (먹을 게 없음) 감소 */
  essentialsLow: number;
  essentialsLowPenalty: number;
}

export interface NightInput {
  stressAtBed: number;
  ruminations: number;
  hobbyDone: boolean;
  bedMinutes: number;
  housing: number;
  essentials: number;
}

export interface Breakdown {
  key: string;
  delta: number;
}

/** 밤 회복 결과로 다음 날 배터리 상한을 계산한다 */
export function nightRecovery(cfg: NightConfig, input: NightInput): { nextMax: number; breakdown: Breakdown[] } {
  const breakdown: Breakdown[] = [];
  const add = (key: string, delta: number) => {
    if (Math.abs(delta) >= 0.5) breakdown.push({ key, delta: Math.round(delta) });
  };
  add('night.stress', -input.stressAtBed * cfg.stressPenaltyPerPoint);
  add('night.rumination', -input.ruminations * cfg.ruminationPenalty);
  if (input.hobbyDone) add('night.hobby', cfg.hobbyBonus);
  const lateHours = (input.bedMinutes - parseTime(cfg.lateFrom)) / 60;
  if (lateHours > 0) add('night.late', -lateHours * cfg.latePenaltyPerHour);
  if (input.housing < cfg.housingLow) add('night.housing', -cfg.housingLowPenalty);
  if (input.essentials < cfg.essentialsLow) add('night.essentials', -cfg.essentialsLowPenalty);
  const total = breakdown.reduce((s, b) => s + b.delta, 0);
  return { nextMax: Math.max(cfg.minMax, Math.min(cfg.baseMax, cfg.baseMax + total)), breakdown };
}

export interface SettlementConfig {
  /** 하루가 지날 때마다 자연히 줄어드는 지표 (장보기·연락을 안 하면) */
  dailyDecay: LifeDelta;
  /** 매일 밤 나가는 생활비(식비·교통비). 못 내면 생활 필수가 줄어든다 */
  dailyCost: { money: number; unpaidEssentials: number };
  weekly: {
    /** 소득·업무 평판이 이 이상이면 좋은 평가 */
    goodIncome: number;
    goodBonusMoney: number;
    /** 미만이면 경고로 소득 지표 추가 감소 */
    badIncomeDelta: number;
  };
  monthEnd: {
    rent: number;
    salaryBase: number;
    /** 소득 지표 1당 급여 가산 */
    salaryPerIncome: number;
    /** 월세를 못 내면 주거 안정 감소 */
    unpaidHousingDelta: number;
  };
}

export interface SettlementLine {
  key: string;
  stat?: LifeStatId;
  delta?: number;
  money?: number;
}

/** 하루 끝 정산. 금요일 업무 평가, 월말 월세·급여 */
export function settleDay(cfg: SettlementConfig, life: LifeStats, flags: { weeklyEval?: boolean; monthEnd?: boolean }): SettlementLine[] {
  const lines: SettlementLine[] = [];
  for (const [stat, delta] of Object.entries(cfg.dailyDecay) as [LifeStatId, number][]) {
    if (!delta) continue;
    life.apply({ [stat]: delta }, 'settle.decay');
    lines.push({ key: `settle.decay.${stat}`, stat, delta });
  }
  if (cfg.dailyCost.money > 0) {
    if (life.spend(cfg.dailyCost.money)) lines.push({ key: 'settle.daily.cost', money: -cfg.dailyCost.money });
    else {
      life.apply({ essentials: cfg.dailyCost.unpaidEssentials }, 'settle.unpaid');
      lines.push({ key: 'settle.daily.unpaid', stat: 'essentials', delta: cfg.dailyCost.unpaidEssentials });
    }
  }
  if (flags.weeklyEval) {
    if (life.get('income') >= cfg.weekly.goodIncome) {
      life.addMoney(cfg.weekly.goodBonusMoney);
      lines.push({ key: 'settle.weekly.good', money: cfg.weekly.goodBonusMoney });
    } else {
      life.apply({ income: cfg.weekly.badIncomeDelta }, 'settle.weeklyBad');
      lines.push({ key: 'settle.weekly.bad', stat: 'income', delta: cfg.weekly.badIncomeDelta });
    }
  }
  if (flags.monthEnd) {
    const salary = Math.round(cfg.monthEnd.salaryBase + life.get('income') * cfg.monthEnd.salaryPerIncome);
    life.addMoney(salary);
    lines.push({ key: 'settle.month.salary', money: salary });
    if (life.spend(cfg.monthEnd.rent)) {
      lines.push({ key: 'settle.month.rent', money: -cfg.monthEnd.rent });
    } else {
      life.apply({ housing: cfg.monthEnd.unpaidHousingDelta }, 'settle.unpaidRent');
      lines.push({ key: 'settle.month.unpaid', stat: 'housing', delta: cfg.monthEnd.unpaidHousingDelta });
    }
  }
  return lines;
}
