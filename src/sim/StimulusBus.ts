// 모든 사회적 자극이 거치는 단일 버스 (CLAUDE.md 5.3).
// 자극 정의는 /data/stimuli.json에서 오며, 여기서는 "기본 데미지"까지만 계산한다.
// 스트레스 배율·채널 감쇠는 EnergyModel이 적용한다.

export type StimulusKind = 'ambush' | 'continuous' | 'encounter' | 'rumination';
export type Channel = 'auditory' | 'visual' | 'social';

export interface StimulusDef {
  kind: StimulusKind;
  channel: Channel;
  /** ambush/encounter 즉시 데미지 */
  damage?: number;
  /** continuous/rumination 초당 데미지 */
  ratePerSec?: number;
  /** rumination 지속 시간 */
  durationSec?: number;
}

export type StimulusTable = Readonly<Record<string, StimulusDef>>;

/** 한 틱 동안 발생한 기본 데미지 (배율 적용 전) */
export interface StimulusHit {
  stimulusId: string;
  kind: StimulusKind;
  channel: Channel;
  amount: number;
  source?: string;
}

interface ContinuousEntry {
  stimulusId: string;
  intensity: number;
}

interface RuminationEntry {
  stimulusId: string;
  remainingSec: number;
}

export interface BusTickResult {
  hits: StimulusHit[];
  /** 이번 틱에 발생한 기습형 자극 (카메라 셰이크·경직 연출용) */
  ambushes: string[];
  /** 이번 틱에 시작된 대면형 자극 */
  encounters: string[];
}

export class StimulusBus {
  private readonly instant: StimulusHit[] = [];
  private readonly ambushes: string[] = [];
  private readonly encounters: string[] = [];
  private readonly continuous = new Map<string, ContinuousEntry>();
  private readonly ruminations: RuminationEntry[] = [];

  constructor(private readonly table: StimulusTable) {}

  def(stimulusId: string): StimulusDef {
    const def = this.table[stimulusId];
    if (!def) throw new Error(`알 수 없는 자극: "${stimulusId}" (data/stimuli.json 확인)`);
    return def;
  }

  has(stimulusId: string): boolean {
    return stimulusId in this.table;
  }

  /** 1회성 자극 발생. 지속형을 emit하면 오류 (setContinuous 사용) */
  emit(stimulusId: string, source?: string): void {
    const def = this.def(stimulusId);
    switch (def.kind) {
      case 'ambush':
      case 'encounter':
        this.instant.push({ stimulusId, kind: def.kind, channel: def.channel, amount: def.damage ?? 0, source });
        (def.kind === 'ambush' ? this.ambushes : this.encounters).push(stimulusId);
        break;
      case 'rumination':
        this.ruminations.push({ stimulusId, remainingSec: def.durationSec ?? 0 });
        break;
      case 'continuous':
        throw new Error(`지속형 자극 "${stimulusId}"은 setContinuous로 켜고 꺼야 합니다`);
    }
  }

  /**
   * 지속형 자극을 key 단위로 켜거나 강도를 바꾼다. intensity ≤ 0이면 끈다.
   * key는 발생원 식별자 (예: "zone:lobby", "npc:neighbor:gaze")
   */
  setContinuous(key: string, stimulusId: string, intensity: number): void {
    if (intensity <= 0) {
      this.continuous.delete(key);
      return;
    }
    const def = this.def(stimulusId);
    if (def.kind !== 'continuous') throw new Error(`"${stimulusId}"는 지속형 자극이 아닙니다`);
    this.continuous.set(key, { stimulusId, intensity });
  }

  isActive(key: string): boolean {
    return this.continuous.has(key);
  }

  get activeRuminations(): number {
    return this.ruminations.length;
  }

  tick(dt: number): BusTickResult {
    const hits = this.instant.splice(0);
    for (const [key, entry] of this.continuous) {
      const def = this.def(entry.stimulusId);
      hits.push({
        stimulusId: entry.stimulusId,
        kind: 'continuous',
        channel: def.channel,
        amount: (def.ratePerSec ?? 0) * entry.intensity * dt,
        source: key,
      });
    }
    for (let i = this.ruminations.length - 1; i >= 0; i--) {
      const r = this.ruminations[i]!;
      const def = this.def(r.stimulusId);
      const step = Math.min(dt, r.remainingSec);
      hits.push({ stimulusId: r.stimulusId, kind: 'rumination', channel: def.channel, amount: (def.ratePerSec ?? 0) * step });
      r.remainingSec -= dt;
      if (r.remainingSec <= 0) this.ruminations.splice(i, 1);
    }
    return { hits, ambushes: this.ambushes.splice(0), encounters: this.encounters.splice(0) };
  }

  /** 스테이지 재시작 시 초기화 */
  clear(): void {
    this.instant.length = 0;
    this.ambushes.length = 0;
    this.encounters.length = 0;
    this.continuous.clear();
    this.ruminations.length = 0;
  }
}
