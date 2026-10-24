// 필수 상호작용의 '한마디' (주간 회의 발언, 건배사, "다음에 올게요" 등).
// 문장을 마디로 나눠, 마디마다 움직이는 박자 표시가 목표 구간에 있을 때 입력하면 매끄럽게 말한다.
// 놓치면 그 마디는 더듬어 말하고 다음으로 넘어간다 (무한 반복 없음). 말더듬 중에는 구간이 절반.

export interface SpeechConfig {
  beatSec: number;
  /** 목표 구간 중심 (0~1) */
  zoneCenter: number;
  zoneWidth: number;
}

export type SpeechEvent = { type: 'chunk'; index: number; clean: boolean } | { type: 'done'; hits: number; misses: number };

export class SpeechChallenge {
  index = 0;
  marker = 0;
  hits = 0;
  misses = 0;
  readonly spoken: { text: string; clean: boolean }[] = [];
  private stutter = false;
  private readonly events: SpeechEvent[] = [];

  constructor(
    private readonly cfg: SpeechConfig,
    readonly chunks: readonly string[],
  ) {}

  get done(): boolean {
    return this.index >= this.chunks.length;
  }

  get zone(): { from: number; to: number } {
    const w = this.cfg.zoneWidth * (this.stutter ? 0.5 : 1);
    return { from: this.cfg.zoneCenter - w / 2, to: this.cfg.zoneCenter + w / 2 };
  }

  update(dt: number, stutter: boolean): void {
    if (this.done) return;
    this.stutter = stutter;
    this.marker += dt / this.cfg.beatSec;
    if (this.marker >= 1) this.resolve(false);
  }

  press(): void {
    if (this.done) return;
    const z = this.zone;
    this.resolve(this.marker >= z.from && this.marker <= z.to);
  }

  drainEvents(): SpeechEvent[] {
    return this.events.splice(0);
  }

  private resolve(clean: boolean): void {
    const text = this.chunks[this.index]!;
    this.spoken.push({ text, clean });
    if (clean) this.hits++;
    else this.misses++;
    this.events.push({ type: 'chunk', index: this.index, clean });
    this.index++;
    this.marker = 0;
    if (this.done) this.events.push({ type: 'done', hits: this.hits, misses: this.misses });
  }
}

/** 더듬는 말투로 바꾼다: "회의" → "회, 회의…" */
export function stutterText(text: string): string {
  const first = [...text.trim()][0];
  if (!first) return text;
  return `${first}, ${first}… ${text}`;
}
