import type { GameConfig } from '../../core/config';
import type { Input } from '../../core/Input';
import type { GameSession } from '../../gameplay/GameSession';
import { t } from '../../core/config';
import { el, show } from './dom';
import { itemIcon } from './icons';

// 휴대폰·태블릿 터치 조작. 키보드 입력을 흉내 낸다(Input.touchDown/touchUp, Input.stick).
// 화면 왼쪽을 누르면 그 자리에 조이스틱이 생기고, 오른쪽에는 지금 상황에 맞는 버튼만 보인다.

interface Btn {
  code: string;
  /** 텍스트 키 (data/text/ko.json의 touch.*) */
  label: string;
  hold?: boolean;
  big?: boolean;
}

export interface TouchContext {
  screen: 'title' | 'game';
  session: GameSession | null;
  optionsOpen: boolean;
  mapOpen: boolean;
}

export function isTouchDevice(): boolean {
  return new URLSearchParams(location.search).has('touch') || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

const STICK_RADIUS = 56;

export class TouchControls {
  private readonly root = el('div', 'touch', document.body);
  private readonly stickZone = el('div', 'touch__zone', this.root);
  private readonly stickBase = el('div', 'touch__stick', this.root);
  private readonly stickKnob = el('div', 'touch__knob', this.stickBase);
  private readonly pad = el('div', 'touch__pad', this.root);
  private readonly top = el('div', 'touch__top', this.root);
  private readonly rotate = el('div', 'touch__rotate', document.body);
  /** 가방 버튼을 누르면 펼쳐지는 아이템 버튼 줄 */
  private readonly tray = el('div', 'touch__tray', this.root);
  private bagOpen = false;
  private traySignature = '';
  private signature = '';
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  /** 지금 누르고 있는 버튼 (포인터 id → 키) */
  private readonly held = new Map<number, string>();

  constructor(
    private readonly cfg: GameConfig,
    private readonly input: Input,
  ) {
    document.body.classList.add('is-touch');
    this.rotate.textContent = this.tx('touch.rotate');
    this.stickZone.addEventListener('pointerdown', this.onStickDown);
    window.addEventListener('pointermove', this.onStickMove);
    window.addEventListener('pointerup', this.onStickUp);
    window.addEventListener('pointercancel', this.onStickUp);
    // 메모의 아이템 아이콘을 누르면 그 아이템을 쓴다
    document.addEventListener('pointerdown', (e) => {
      const item = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-code]');
      if (item && !item.closest('.touch')) this.tap(item.dataset['code']!);
    });
    // 길게 눌러 생기는 메뉴·확대를 막는다
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private tx(key: string): string {
    return t(this.cfg.text, key);
  }

  update(ctx: TouchContext): void {
    const { main, top, stick } = this.layout(ctx);
    this.updateTray(ctx, main.some((b) => b.code === '#bag'));
    show(this.stickZone, stick);
    if (!stick) this.releaseStick();
    const sig = JSON.stringify([main, top]);
    if (sig !== this.signature) {
      this.signature = sig;
      this.releaseAll();
      this.build(this.pad, main);
      this.build(this.top, top);
    }
  }

  /** 상황별 버튼 구성 */
  private layout(ctx: TouchContext): { main: Btn[]; top: Btn[]; stick: boolean } {
    const settings: Btn = { code: 'KeyO', label: 'touch.options' };
    const full: Btn = { code: '#fullscreen', label: 'touch.fullscreen' };
    if (ctx.optionsOpen) return { main: [{ code: 'KeyO', label: 'touch.close', big: true }], top: [], stick: false };
    if (ctx.screen === 'title' || !ctx.session) {
      const vacation: Btn[] = this.cfg.vacationDay ? [{ code: 'KeyV', label: 'touch.vacation' }] : [];
      return { main: [{ code: 'Enter', label: 'touch.start', big: true }, { code: 'KeyN', label: 'touch.newGame' }, ...vacation], top: [settings, full], stick: false };
    }
    // 지도: [M]은 주변 ↔ 도시 전체, 닫기는 Esc
    if (ctx.mapOpen) return { main: [{ code: 'Escape', label: 'touch.close', big: true }, { code: 'KeyM', label: 'touch.mapZoom' }], top: [], stick: false };
    const s = ctx.session;
    const m = s.mode.kind;
    const top: Btn[] = [settings, full];
    const call: Btn[] = s.phone.ringing
      ? [{ code: 'KeyY', label: 'touch.accept', big: true }, { code: 'KeyN', label: 'touch.decline' }, { code: 'KeyU', label: 'touch.textInstead' }]
      : [];
    if (m === 'dayIntro') {
      const leave: Btn[] = s.canTakeLeave ? [{ code: 'KeyL', label: 'touch.leave' }] : [];
      return { main: [{ code: 'Enter', label: 'touch.continue', big: true }, ...leave], top, stick: false };
    }
    if (m === 'night' || m === 'final') return { main: [{ code: 'Enter', label: 'touch.continue', big: true }], top, stick: false };
    if (m === 'burnout') return { main: [{ code: 'Enter', label: 'touch.wakeHome', big: true }], top, stick: false };
    if (m === 'collapse') return { main: [{ code: 'KeyR', label: 'touch.retry', big: true }], top, stick: false };
    if (s.phoneOpen) {
      return {
        main: [
          { code: 'ArrowUp', label: 'touch.up' },
          { code: 'ArrowDown', label: 'touch.down' },
          { code: 'Enter', label: 'touch.reply', big: true },
          { code: 'Backspace', label: 'touch.readSkip' },
          { code: 'Tab', label: 'touch.close' },
        ],
        top,
        stick: false,
      };
    }
    const qte = s.qte;
    if (qte) return { main: [{ code: 'Space', label: qte.kind === 'laugh' ? 'touch.laugh' : 'touch.answer', big: true }], top, stick: false };
    switch (m) {
      case 'dialogue':
        return {
          main: [
            ...call,
            { code: 'Digit1', label: 'touch.nod' },
            { code: 'Digit2', label: 'touch.agree' },
            { code: 'Digit3', label: 'touch.short' },
            { code: 'Digit4', label: 'touch.exit' },
            { code: 'Space', label: 'touch.smile', hold: true, big: true },
            { code: 'KeyT', label: 'touch.sos' },
          ],
          top,
          stick: false,
        };
      case 'speech':
        return { main: [...call, { code: 'Space', label: 'touch.speak', big: true }], top, stick: false };
      case 'work':
        return { main: [...call, { code: 'Space', label: 'touch.focus', hold: true, big: true }, { code: 'Digit1', label: 'touch.reply' }, { code: 'Escape', label: 'touch.break' }], top, stick: false };
      case 'piano':
        return {
          main: ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'KeyH', 'KeyJ'].map((code, i) => ({ code, label: `touch.note${i + 1}` })).concat([{ code: 'Escape', label: 'touch.stop' }]),
          top,
          stick: false,
        };
      case 'seated':
        return {
          main: [...call, { code: 'Digit1', label: 'touch.meat1' }, { code: 'Digit2', label: 'touch.meat2' }, { code: 'Digit3', label: 'touch.meat3' }, { code: 'KeyF', label: 'touch.leave', big: true }],
          top,
          stick: false,
        };
      case 'shop':
        return { main: [{ code: 'ArrowUp', label: 'touch.up' }, { code: 'ArrowDown', label: 'touch.down' }, { code: 'KeyF', label: 'touch.buy', big: true }, { code: 'Escape', label: 'touch.close' }], top, stick: false };
      case 'priceTag':
        return { main: [...call, { code: 'Space', label: 'touch.peek', hold: true, big: true }, { code: 'Escape', label: 'touch.stop' }], top, stick: true };
      case 'free':
        return {
          main: [
            ...call,
            { code: 'KeyF', label: 'touch.interact', big: true, hold: true },
            { code: 'ShiftLeft', label: 'touch.run', hold: true },
            { code: 'KeyE', label: 'touch.earphones' },
            { code: 'KeyQ', label: 'touch.phonePretend', hold: true },
            { code: 'KeyC', label: 'touch.cover', hold: true },
            { code: 'KeyX', label: 'touch.eyes', hold: true },
            { code: 'KeyV', label: 'touch.mask' },
            ...(s.bagCount() > 0 ? [{ code: '#bag', label: 'touch.bag' }] : []),
          ],
          top: [{ code: 'Tab', label: 'touch.phone' }, { code: 'KeyM', label: 'touch.map' }, ...top],
          stick: true,
        };
      default:
        // 이동·엘리베이터·벤치·외시경 등: 상호작용·그만두기
        return { main: [...call, { code: 'KeyF', label: 'touch.interact', big: true, hold: true }, { code: 'Escape', label: 'touch.stop' }], top, stick: m === 'rest' || m === 'laundry' || m === 'peephole' };
    }
  }

  private build(host: HTMLElement, btns: Btn[]): void {
    host.replaceChildren();
    for (const b of btns) {
      const e = el('button', `touch__btn${b.big ? ' touch__btn--big' : ''}${b.hold ? ' touch__btn--hold' : ''}`, host, this.tx(b.label));
      e.type = 'button';
      e.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        if (b.code === '#fullscreen') {
          toggleFullscreen();
          return;
        }
        if (b.code === '#bag') {
          this.bagOpen = !this.bagOpen;
          e.classList.toggle('is-on', this.bagOpen);
          return;
        }
        e.setPointerCapture(ev.pointerId);
        e.classList.add('is-down');
        this.held.set(ev.pointerId, b.code);
        this.input.touchDown(b.code);
      });
      const up = (ev: PointerEvent) => {
        e.classList.remove('is-down');
        const code = this.held.get(ev.pointerId);
        if (code) this.input.touchUp(code);
        this.held.delete(ev.pointerId);
      };
      e.addEventListener('pointerup', up);
      e.addEventListener('pointercancel', up);
    }
  }

  /** 가방 펼침: 칸마다 큰 버튼 (아이콘·이름·개수). 누르면 먹고 접힌다 */
  private updateTray(ctx: TouchContext, available: boolean): void {
    if (!available) this.bagOpen = false;
    const s = ctx.session;
    const slots = s && this.bagOpen ? s.bagSlots().map((id) => [id, this.countOf(s, id)] as const) : [];
    show(this.tray, slots.length > 0, 'flex');
    // 버튼 묶음 바로 위에 뜬다
    if (slots.length) this.tray.style.bottom = `${window.innerHeight - this.pad.getBoundingClientRect().top + 8}px`;
    const sig = JSON.stringify(slots);
    if (sig === this.traySignature) return;
    this.traySignature = sig;
    this.tray.replaceChildren();
    slots.forEach(([id, n], i) => {
      const d = this.cfg.items.consumables.find((c) => c.id === id);
      if (!d) return;
      const b = el('button', 'touch__item', this.tray);
      b.type = 'button';
      b.innerHTML = `${itemIcon(d.icon, 30)}<span>${this.tx(d.nameKey)}</span><b>${n}</b>`;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        this.tap(`Digit${i + 1}`);
        this.bagOpen = false;
      });
    });
  }

  /** 위안 물건은 오늘 남은 횟수, 소모품은 개수 */
  private countOf(s: GameSession, id: string): string {
    const per = this.cfg.items.consumables.find((c) => c.id === id)?.usesPerDay;
    return per ? `${s.usesLeft(id)}/${per}` : `×${s.player.inventory.consumables[id] ?? 0}`;
  }

  /** 한 번 톡 (아이템 아이콘 등) */
  private tap(code: string): void {
    this.input.touchDown(code);
    setTimeout(() => this.input.touchUp(code), 80);
  }

  private releaseAll(): void {
    for (const code of this.held.values()) this.input.touchUp(code);
    this.held.clear();
  }

  private readonly onStickDown = (e: PointerEvent): void => {
    if (this.stickId !== null) return;
    e.preventDefault();
    this.stickId = e.pointerId;
    this.stickOrigin = { x: e.clientX, y: e.clientY };
    this.stickBase.style.left = `${e.clientX}px`;
    this.stickBase.style.top = `${e.clientY}px`;
    this.stickBase.classList.add('is-on');
    this.input.stick = { x: 0, y: 0 };
    this.stickKnob.style.transform = 'translate(-50%, -50%)';
  };

  private readonly onStickMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.stickId) return;
    let dx = e.clientX - this.stickOrigin.x;
    let dy = e.clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      dx = (dx / len) * STICK_RADIUS;
      dy = (dy / len) * STICK_RADIUS;
    }
    this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    // 살짝 기울이면 멈춤 (손 떨림)
    this.input.stick = len < 8 ? { x: 0, y: 0 } : { x: dx / STICK_RADIUS, y: dy / STICK_RADIUS };
  };

  private readonly onStickUp = (e: PointerEvent): void => {
    if (e.pointerId === this.stickId) this.releaseStick();
  };

  private releaseStick(): void {
    this.stickId = null;
    this.input.stick = null;
    this.stickBase.classList.remove('is-on');
  }
}

function toggleFullscreen(): void {
  const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  try {
    if (document.fullscreenElement || d.webkitFullscreenElement) (document.exitFullscreen?.bind(document) ?? d.webkitExitFullscreen)?.();
    else if (root.requestFullscreen) void root.requestFullscreen().catch(() => undefined);
    else root.webkitRequestFullscreen?.();
  } catch {
    // iOS 사파리 등 지원하지 않으면 무시
  }
}
