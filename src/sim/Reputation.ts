// 사람들이 나를 어떻게 보는지 (data/reputation.json). 사람마다 0~100의 인상, 그 평균이 사회적 평판.
// 대화가 어떻게 끝났는지, 연락을 어떻게 받았는지, 중요한 순간(회의·발표·건배사·연차·지각)이 인상을 움직인다.
// 인상이 좋을수록 그 사람은 나를 더 잘 알아보고 말을 건다: 호감도 에너지가 든다.

export interface ReputationConfig {
  people: Record<string, { nameKey: string; npcs?: string[]; contacts?: string[]; start?: number }>;
  start: number;
  dialogue: Record<'satisfied' | 'parried' | 'endured' | 'awkward' | 'sos' | 'avoided', number>;
  phone: Record<'answered' | 'replied' | 'texted' | 'declined' | 'missed' | 'readIgnored' | 'unread', number>;
  events: Record<string, Record<string, number>>;
  warmth: { min: number; max: number };
  talk: { parryWindow: number; satisfy: number; duration: number; nodFrom: number; nodChance: number; nodCalm: number };
  tiers: { min: number; key: string }[];
}

export class Reputation {
  private values: Record<string, number> = {};
  /** 오늘 바뀐 양 (밤 정산) */
  private today: Record<string, number> = {};
  /** 오늘 이미 반영한 이벤트 (같은 일을 되풀이해 인상을 쌓지 못하게) */
  private readonly eventsToday = new Set<string>();

  constructor(private readonly cfg: ReputationConfig) {
    this.reset();
  }

  reset(): void {
    this.values = Object.fromEntries(Object.entries(this.cfg.people).map(([id, p]) => [id, p.start ?? this.cfg.start]));
    this.today = {};
  }

  get(person: string): number {
    return this.values[person] ?? this.cfg.start;
  }

  all(): Readonly<Record<string, number>> {
    return this.values;
  }

  /** 오늘 인상이 바뀐 사람과 그 양 */
  changedToday(): Readonly<Record<string, number>> {
    return this.today;
  }

  /** 사회적 평판: 모든 사람 인상의 평균 */
  get overall(): number {
    const v = Object.values(this.values);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : this.cfg.start;
  }

  change(person: string | null, delta: number): void {
    if (!person || !delta || !(person in this.values)) return;
    const before = this.values[person]!;
    this.values[person] = Math.min(100, Math.max(0, before + delta));
    const real = this.values[person]! - before;
    if (real) this.today[person] = (this.today[person] ?? 0) + real;
  }

  /** NPC id → 사람 (등록되지 않은 행인은 null) */
  personOfNpc(npcId: string): string | null {
    return Object.entries(this.cfg.people).find(([, p]) => p.npcs?.includes(npcId))?.[0] ?? null;
  }

  personOfContact(contactId: string): string | null {
    return Object.entries(this.cfg.people).find(([, p]) => p.contacts?.includes(contactId))?.[0] ?? null;
  }

  /** 게임 이벤트가 움직이는 인상 */
  onEvent(event: string): void {
    const d = this.cfg.events[event];
    if (!d || this.eventsToday.has(event)) return;
    this.eventsToday.add(event);
    for (const [person, v] of Object.entries(d)) this.change(person, v);
  }

  /** 인상 → 그 사람이 나를 알아보고 말을 거는 정도 (알아챔 배율) */
  warmth(person: string | null): number {
    if (!person) return 1;
    const { min, max } = this.cfg.warmth;
    return min + (max - min) * (this.get(person) / 100);
  }

  /** 그 사람과 얼마나 편한 사이인지 (−1~1, 인상 50에서 0). 편할수록 대화가 짧고 쉽다, 서운할수록 길고 어렵다 */
  ease(person: string | null): number {
    if (!person) return 0;
    return Math.max(-1, Math.min(1, (this.get(person) - 50) / 50));
  }

  /** 편한 사이라 말 대신 눈인사로 끝낼 수 있는지 (확률은 부르는 쪽에서) */
  canNodInstead(person: string | null): boolean {
    return !!person && this.get(person) >= this.cfg.talk.nodFrom;
  }

  /** 인상을 말로 (숫자 없이) */
  tierKey(value: number): string {
    return this.cfg.tiers.find((t) => value >= t.min)?.key ?? this.cfg.tiers.at(-1)!.key;
  }

  newDay(): void {
    this.today = {};
    this.eventsToday.clear();
  }

  snapshot(): Record<string, number> {
    return { ...this.values };
  }

  restore(values: Record<string, number> | undefined): void {
    this.reset();
    this.eventsToday.clear();
    for (const [k, v] of Object.entries(values ?? {})) if (k in this.values) this.values[k] = v;
  }
}
