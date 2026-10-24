// 대화 배틀 (CLAUDE.md 5.6). 목표는 최소 비용 이탈.
//   패링: NPC 대사 끝 ±윈도우에 '이탈' 멘트 → 즉시 종료 (틈이 있는 대사에서만)
//   리액션: 대사 종류에 맞는 반응으로 만족도 100 → 이탈
//   미소 유지: 홀드하지 않으면 만족도 하락
//   오선택: 대화 +10초, 종료 후 이불킥(Rumination)
// 렌더링·입력과 무관한 순수 상태 머신이다. 시간은 update(dt)로만 흐른다.

export type LineKind = 'question' | 'story' | 'opening' | 'remark';
export type Reply = 'nod' | 'agree' | 'answer' | 'exit';
export const replies: readonly Reply[] = ['nod', 'agree', 'answer', 'exit'];

/** 대사 종류별로 자연스러운 반응 */
export const fittingReplies: Readonly<Record<LineKind, readonly Reply[]>> = {
  question: ['answer'],
  story: ['nod', 'agree'],
  opening: ['nod', 'agree'],
  remark: ['answer', 'nod'],
};

export interface DialogueLine {
  text: string;
  kind: LineKind;
  durationSec: number;
}

export interface DialoguePool {
  greeting: DialogueLine;
  lines: readonly DialogueLine[];
  flushRemark: DialogueLine;
  closers: { satisfied: string; parried: string; endured: string; sos: string; awkward: string };
}

export interface DialogueConfig {
  parryWindowSec: number;
  /** 대사 사이 공백 */
  gapSec: number;
  satisfactionPerReply: number;
  /** 윈도우 안 반응 배율 */
  perfectMultiplier: number;
  wrongExtraSec: number;
  wrongSatisfactionLoss: number;
  /** 미소를 놓으면 초당 만족도 하락 */
  smileDropPerSec: number;
  /** 대사에 반응하지 않고 넘기면 만족도 하락 */
  ignoredLoss: number;
  sosDelaySec: number;
  /** 홍조가 지적 가능한 상태일 때 대사마다 지적 확률 */
  flushRemarkChance: number;
}

export interface DialogueOptions {
  /** NPC가 대화를 끝내지 않는 최소 시간 (Boss 등). 그 전에는 패링·만족 이탈 불가 */
  minDurationSec: number;
  /** 아무 반응을 안 해도 이 시간이 지나면 NPC가 스스로 끝낸다 */
  baseDurationSec: number;
  /** 내 사람: 미소 유지 불필요, 오선택 없음 */
  ally: boolean;
  /** 0~1 난수 (테스트에서 고정) */
  rng: () => number;
}

export interface DialogueFrameInput {
  smiling: boolean;
  /** 말더듬 중이면 패링 윈도우 절반 */
  stutter: boolean;
  /** 홍조가 지적 가능한 강도인지 */
  flushRemarkable: boolean;
}

export type DialogueOutcome = 'satisfied' | 'parried' | 'endured' | 'sos';

export type DialogueEvent =
  | { type: 'line'; line: DialogueLine }
  | { type: 'reply'; reply: Reply; fitting: boolean; perfect: boolean }
  | { type: 'parry' }
  | { type: 'wrong'; reply: Reply }
  | { type: 'flushRemark' }
  | { type: 'end'; outcome: DialogueOutcome; closer: string };

type Phase = 'speaking' | 'gap' | 'ended';

export class DialogueBattle {
  satisfaction = 0;
  elapsed = 0;
  wrongCount = 0;
  smileDroppedSec = 0;
  outcome: DialogueOutcome | null = null;

  private phase: Phase = 'speaking';
  private line: DialogueLine;
  private lineElapsed = 0;
  private replied = false;
  private gapLeft = 0;
  private extraSec = 0;
  private remarked = false;
  private sosLeft = -1;
  private stutterNow = false;
  private readonly bag: DialogueLine[] = [];
  private readonly events: DialogueEvent[] = [];

  constructor(
    private readonly cfg: DialogueConfig,
    private readonly pool: DialoguePool,
    private readonly opts: DialogueOptions,
  ) {
    this.line = pool.greeting;
    this.events.push({ type: 'line', line: this.line });
  }

  get currentLine(): DialogueLine {
    return this.line;
  }

  get ended(): boolean {
    return this.phase === 'ended';
  }

  /** 현재 대사 진행률 0~1 (대사 끝 = 1) */
  get lineProgress(): number {
    return Math.min(1, this.lineElapsed / this.line.durationSec);
  }

  get lineElapsedSec(): number {
    return this.lineElapsed;
  }

  get windowSec(): number {
    return this.cfg.parryWindowSec * (this.stutterNow ? 0.5 : 1);
  }

  /** 지금이 대사 끝 ±윈도우 안인지 */
  get inWindow(): boolean {
    if (this.phase === 'ended') return false;
    const t = this.phase === 'speaking' ? this.lineElapsed - this.line.durationSec : this.cfg.gapSec - this.gapLeft;
    return Math.abs(t) <= this.windowSec;
  }

  get canExitNow(): boolean {
    return this.elapsed >= this.opts.minDurationSec;
  }

  get sosPending(): boolean {
    return this.sosLeft >= 0;
  }

  get sosRemaining(): number {
    return this.sosLeft;
  }

  get remainingSec(): number {
    return Math.max(0, this.opts.baseDurationSec + this.extraSec - this.elapsed);
  }

  /** SOS: 일정 시간 후 가짜 긴급 전화로 페널티 없이 이탈 */
  requestSos(): void {
    if (this.phase !== 'ended' && this.sosLeft < 0) this.sosLeft = this.cfg.sosDelaySec;
  }

  respond(reply: Reply): void {
    if (this.phase === 'ended' || this.replied) return;
    const perfect = this.inWindow;
    this.replied = true;

    if (reply === 'exit') {
      if (this.line.kind === 'opening' && perfect && this.canExitNow) {
        this.events.push({ type: 'parry' });
        this.finish('parried');
      } else {
        this.wrong(reply);
      }
      return;
    }

    const fitting = fittingReplies[this.line.kind].includes(reply);
    if (!fitting && !this.opts.ally) {
      this.wrong(reply);
      return;
    }
    const gain = this.cfg.satisfactionPerReply * (perfect ? this.cfg.perfectMultiplier : 1);
    this.satisfaction = Math.min(100, this.satisfaction + gain);
    this.events.push({ type: 'reply', reply, fitting, perfect });
    if (this.satisfaction >= 100 && this.canExitNow) this.finish('satisfied');
  }

  update(dt: number, input: DialogueFrameInput): void {
    if (this.phase === 'ended') return;
    this.stutterNow = input.stutter;
    this.elapsed += dt;

    if (!this.opts.ally && !input.smiling) {
      this.smileDroppedSec += dt;
      this.satisfaction = Math.max(0, this.satisfaction - this.cfg.smileDropPerSec * dt);
    }

    if (this.sosLeft >= 0) {
      this.sosLeft -= dt;
      if (this.sosLeft <= 0) {
        this.finish('sos');
        return;
      }
    }

    if (this.phase === 'speaking') {
      this.lineElapsed += dt;
      if (this.lineElapsed >= this.line.durationSec) {
        this.phase = 'gap';
        this.gapLeft = this.cfg.gapSec;
      }
      return;
    }

    // gap
    this.gapLeft -= dt;
    if (this.gapLeft > 0) return;
    if (!this.replied && !this.opts.ally) this.satisfaction = Math.max(0, this.satisfaction - this.cfg.ignoredLoss);

    if (this.satisfaction >= 100 && this.canExitNow) {
      this.finish('satisfied');
      return;
    }
    if (this.elapsed >= this.opts.baseDurationSec + this.extraSec && this.canExitNow) {
      this.finish('endured');
      return;
    }
    this.nextLine(input.flushRemarkable);
  }

  drainEvents(): DialogueEvent[] {
    return this.events.splice(0);
  }

  private nextLine(flushRemarkable: boolean): void {
    if (flushRemarkable && !this.remarked && !this.opts.ally && this.opts.rng() < this.cfg.flushRemarkChance) {
      this.remarked = true;
      this.line = this.pool.flushRemark;
      this.events.push({ type: 'flushRemark' });
    } else {
      if (this.bag.length === 0) {
        this.bag.push(...this.pool.lines);
        // Fisher–Yates
        for (let i = this.bag.length - 1; i > 0; i--) {
          const j = Math.floor(this.opts.rng() * (i + 1));
          [this.bag[i], this.bag[j]] = [this.bag[j]!, this.bag[i]!];
        }
      }
      this.line = this.bag.pop()!;
    }
    this.phase = 'speaking';
    this.lineElapsed = 0;
    this.replied = false;
    this.events.push({ type: 'line', line: this.line });
  }

  private wrong(reply: Reply): void {
    this.wrongCount++;
    this.extraSec += this.cfg.wrongExtraSec;
    this.satisfaction = Math.max(0, this.satisfaction - this.cfg.wrongSatisfactionLoss);
    this.events.push({ type: 'wrong', reply });
  }

  private finish(outcome: DialogueOutcome): void {
    this.phase = 'ended';
    this.outcome = outcome;
    const closer = outcome === 'endured' && this.wrongCount > 0 ? this.pool.closers.awkward : this.pool.closers[outcome];
    this.events.push({ type: 'end', outcome, closer });
  }
}
