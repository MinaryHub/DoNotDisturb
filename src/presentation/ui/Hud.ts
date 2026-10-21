import { t } from '../../core/config';
import type { TextTable } from '../../core/configSchemas';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  parent.appendChild(e);
  return e;
}

export type ScreenKind = 'start' | 'paused' | 'burnout' | 'clear' | null;

/**
 * 플레이 화면 오버레이: 목표, 상호작용 안내, 짧은 문구, 스킬 상태, 시작/결과 화면.
 * 배터리·스트레스 수치는 표시하지 않는다 (디버그 패널 전용).
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly objective: HTMLDivElement;
  private readonly prompt: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly skills: HTMLDivElement;
  private readonly screen: HTMLDivElement;
  private readonly screenTitle: HTMLHeadingElement;
  private readonly screenBody: HTMLParagraphElement;
  private readonly screenHint: HTMLParagraphElement;
  private toastTimer = 0;
  private current: ScreenKind = null;

  constructor(private readonly text: TextTable) {
    this.root = el('div', 'hud', document.body);
    el('div', 'hud__crosshair', this.root);
    this.objective = el('div', 'hud__objective', this.root);
    this.prompt = el('div', 'hud__prompt', this.root);
    this.toast = el('div', 'hud__toast', this.root);
    this.skills = el('div', 'hud__skills', this.root);
    this.screen = el('div', 'screen', document.body);
    const box = el('div', 'screen__box', this.screen);
    this.screenTitle = el('h1', 'screen__title', box);
    this.screenBody = el('p', 'screen__body', box);
    this.screenHint = el('p', 'screen__hint', box);
  }

  setObjective(textKey: string | null): void {
    this.objective.textContent = textKey ? `${t(this.text, 'hud.objectivePrefix')} · ${t(this.text, textKey)}` : '';
  }

  setPrompt(textKey: string | null): void {
    this.prompt.textContent = textKey ? `[F] ${t(this.text, textKey)}` : '';
    this.prompt.style.opacity = textKey ? '1' : '0';
  }

  showToast(textKey: string, seconds = 2.5): void {
    this.toast.textContent = t(this.text, textKey);
    this.toast.style.opacity = '1';
    this.toastTimer = seconds;
  }

  setSkills(earphones: boolean, phone: boolean): void {
    const parts: string[] = [];
    if (earphones) parts.push(t(this.text, 'hud.skill.earphones'));
    if (phone) parts.push(t(this.text, 'hud.skill.phone'));
    this.skills.textContent = parts.join('   ');
  }

  update(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.style.opacity = '0';
    }
  }

  showScreen(kind: ScreenKind, stageTitleKey?: string): void {
    if (kind === this.current) return;
    this.current = kind;
    this.screen.dataset['kind'] = kind ?? '';
    this.screen.style.display = kind ? 'flex' : 'none';
    this.root.style.display = kind === 'burnout' || kind === 'clear' ? 'none' : '';
    switch (kind) {
      case 'start':
        this.screenTitle.textContent = t(this.text, 'hud.start.title');
        this.screenBody.textContent = stageTitleKey ? t(this.text, stageTitleKey) : '';
        this.screenHint.textContent = t(this.text, 'hud.start.hint');
        break;
      case 'paused':
        this.screenTitle.textContent = '';
        this.screenBody.textContent = t(this.text, 'hud.paused');
        this.screenHint.textContent = '';
        break;
      case 'burnout':
      case 'clear':
        this.screenTitle.textContent = t(this.text, `result.${kind}.title`);
        this.screenBody.textContent = t(this.text, `result.${kind}.body`);
        this.screenHint.textContent = t(this.text, 'result.retry');
        break;
      case null:
        break;
    }
  }

  get screenKind(): ScreenKind {
    return this.current;
  }
}
