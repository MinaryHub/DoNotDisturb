import type { LifeStatId } from './LifeStats';

// 엔딩 리포트용 하루 기록 (CLAUDE.md 6 공통 흐름)
// 피한 스몰토크 수, 견딘 침묵 시간, 감수한 필수 상호작용, 지켜낸 생활 지표

export interface DayReport {
  smalltalkAvoided: number;
  smalltalkEndured: number;
  parried: number;
  silenceSec: number;
  mandatoryDone: string[];
  callsAnswered: number;
  callsAvoided: number;
  messagesReplied: number;
  messagesIgnored: number;
  recoveredBattery: number;
  hobbies: string[];
  /** 들어준 부탁 */
  favorsDone?: number;
  lifeStart: Record<LifeStatId, number>;
  moneyStart: number;
}

export function emptyReport(lifeStart: Record<LifeStatId, number>, moneyStart: number): DayReport {
  return {
    smalltalkAvoided: 0,
    smalltalkEndured: 0,
    parried: 0,
    silenceSec: 0,
    mandatoryDone: [],
    callsAnswered: 0,
    callsAvoided: 0,
    messagesReplied: 0,
    messagesIgnored: 0,
    recoveredBattery: 0,
    hobbies: [],
    lifeStart: { ...lifeStart },
    moneyStart,
  };
}

/** 여러 날의 기록을 합친다 (주간 최종 리포트) */
export function mergeReports(reports: readonly DayReport[]): Omit<DayReport, 'lifeStart' | 'moneyStart'> {
  const total = {
    smalltalkAvoided: 0,
    smalltalkEndured: 0,
    parried: 0,
    silenceSec: 0,
    mandatoryDone: [] as string[],
    callsAnswered: 0,
    callsAvoided: 0,
    messagesReplied: 0,
    messagesIgnored: 0,
    recoveredBattery: 0,
    hobbies: [] as string[],
    favorsDone: 0,
  };
  for (const r of reports) {
    total.smalltalkAvoided += r.smalltalkAvoided;
    total.smalltalkEndured += r.smalltalkEndured;
    total.parried += r.parried;
    total.silenceSec += r.silenceSec;
    total.mandatoryDone.push(...r.mandatoryDone);
    total.callsAnswered += r.callsAnswered;
    total.callsAvoided += r.callsAvoided;
    total.messagesReplied += r.messagesReplied;
    total.messagesIgnored += r.messagesIgnored;
    total.recoveredBattery += r.recoveredBattery;
    total.hobbies.push(...r.hobbies);
    total.favorsDone += r.favorsDone ?? 0;
  }
  return total;
}
