import type { LifeDelta, LifeStats } from './LifeStats';

// 폰 시스템 (CLAUDE.md 5.10): 전화(받기·거절·문자로 대신·울리다 끊김), 문자(답장·읽씹·안읽씹).
// 결과(배터리 자극·생활 지표)는 연락처 정의(data/life.json contacts)에 따라 정해진다.

export type CallHow = 'answered' | 'declined' | 'missed' | 'texted';
export type MessageHow = 'replied' | 'readIgnored' | 'unread';

export interface ContactDef {
  nameKey: string;
  /** 받으면 발생하는 자극 (보통 voiceCall) */
  answerStimulus: string;
  answer: LifeDelta;
  /** 거절·부재중 */
  avoid: LifeDelta;
  /** 전화 대신 문자로 응답 (답장 대기 불안이 따라온다) */
  texted: LifeDelta;
  reply: LifeDelta;
  /** 읽고 답하지 않음 */
  readIgnored: LifeDelta;
  /** 하루가 끝날 때까지 안 읽음 */
  unread: LifeDelta;
  /** 회피 누적 시 발생하는 상위 자극 이벤트 id (예: doorbell) */
  escalation?: string;
  /** 내 사람: 받으면 오히려 회복 */
  ally?: boolean;
}

export interface PhoneConfig {
  ringSec: number;
  replyWaitSec: number;
  /** 화면에 동시에 쌓이는 알림 최대 수 */
  maxVisible: number;
}

export interface Call {
  id: string;
  contactId: string;
  textKey: string;
  ringElapsed: number;
}

export interface Message {
  id: string;
  contactId: string;
  textKey: string;
  read: boolean;
  resolved: boolean;
  /** 답장 대기 중 남은 시간 (불안 틱) */
  waitLeft: number;
}

export type PhoneEvent =
  | { type: 'ring'; call: Call }
  | { type: 'callResolved'; call: Call; how: CallHow }
  | { type: 'message'; message: Message }
  | { type: 'messageResolved'; message: Message; how: MessageHow }
  | { type: 'replyReceived'; contactId: string };

export class Phone {
  call: Call | null = null;
  readonly messages: Message[] = [];
  private readonly waits: { contactId: string; left: number }[] = [];
  private readonly events: PhoneEvent[] = [];
  private seq = 0;

  constructor(private readonly cfg: PhoneConfig) {}

  get ringing(): boolean {
    return this.call !== null;
  }

  get unread(): Message[] {
    return this.messages.filter((m) => !m.read);
  }

  /** 답장을 기다리며 불안한 상태인지 */
  get waitingReply(): boolean {
    return this.waits.length > 0;
  }

  receiveCall(contactId: string, textKey: string): void {
    // 통화 중 걸려온 전화는 부재중 처리
    if (this.call) {
      this.events.push({ type: 'callResolved', call: { id: `c${++this.seq}`, contactId, textKey, ringElapsed: 0 }, how: 'missed' });
      return;
    }
    this.call = { id: `c${++this.seq}`, contactId, textKey, ringElapsed: 0 };
    this.events.push({ type: 'ring', call: this.call });
  }

  answer(): void {
    this.resolveCall('answered');
  }

  decline(): void {
    this.resolveCall('declined');
  }

  /** 전화 대신 문자 → 답장 대기 불안 */
  textInstead(): void {
    const c = this.call;
    this.resolveCall('texted');
    if (c) this.waits.push({ contactId: c.contactId, left: this.cfg.replyWaitSec });
  }

  receiveMessage(contactId: string, textKey: string): Message {
    const m: Message = { id: `m${++this.seq}`, contactId, textKey, read: false, resolved: false, waitLeft: 0 };
    this.messages.push(m);
    this.events.push({ type: 'message', message: m });
    return m;
  }

  reply(id: string): void {
    const m = this.messages.find((x) => x.id === id);
    if (!m || m.resolved) return;
    m.read = true;
    m.resolved = true;
    this.waits.push({ contactId: m.contactId, left: this.cfg.replyWaitSec });
    this.events.push({ type: 'messageResolved', message: m, how: 'replied' });
  }

  /** 읽씹 */
  readIgnore(id: string): void {
    const m = this.messages.find((x) => x.id === id);
    if (!m || m.resolved) return;
    m.read = true;
    m.resolved = true;
    this.events.push({ type: 'messageResolved', message: m, how: 'readIgnored' });
  }

  update(dt: number): void {
    if (this.call) {
      this.call.ringElapsed += dt;
      if (this.call.ringElapsed >= this.cfg.ringSec) this.resolveCall('missed');
    }
    for (let i = this.waits.length - 1; i >= 0; i--) {
      const w = this.waits[i]!;
      w.left -= dt;
      if (w.left <= 0) {
        this.waits.splice(i, 1);
        this.events.push({ type: 'replyReceived', contactId: w.contactId });
      }
    }
  }

  /** 하루 끝: 안 읽은 메시지는 안읽씹으로 정산 */
  endDay(): void {
    for (const m of this.messages) {
      if (m.resolved) continue;
      m.resolved = true;
      this.events.push({ type: 'messageResolved', message: m, how: 'unread' });
    }
    this.messages.length = 0;
    this.waits.length = 0;
    this.call = null;
  }

  drainEvents(): PhoneEvent[] {
    return this.events.splice(0);
  }

  private resolveCall(how: CallHow): void {
    const c = this.call;
    if (!c) return;
    this.call = null;
    this.events.push({ type: 'callResolved', call: c, how });
  }
}

export interface ContactOutcome {
  /** 배터리 자극 (받은 전화) */
  stimulus?: string;
  /** 회피 누적으로 발생하는 상위 자극 이벤트 */
  escalation?: string;
  avoided: boolean;
}

/** 전화·문자 처리 결과를 생활 지표에 반영한다 */
export function applyContactOutcome(contactId: string, contact: ContactDef, how: CallHow | MessageHow, life: LifeStats): ContactOutcome {
  switch (how) {
    case 'answered':
      life.apply(contact.answer, `phone.${how}`, contactId);
      life.recordAccept(contactId);
      return { stimulus: contact.ally ? undefined : contact.answerStimulus, avoided: false };
    case 'texted':
      life.apply(contact.texted, `phone.${how}`, contactId);
      return { avoided: false };
    case 'replied':
      life.apply(contact.reply, `phone.${how}`, contactId);
      life.recordAccept(contactId);
      return { avoided: false };
    case 'declined':
    case 'missed':
    case 'readIgnored':
    case 'unread': {
      life.apply(how === 'readIgnored' ? contact.readIgnored : how === 'unread' ? contact.unread : contact.avoid, `phone.${how}`, contactId);
      const r = life.recordAvoid(contactId);
      return { avoided: true, escalation: r.escalate ? contact.escalation : undefined };
    }
  }
}
