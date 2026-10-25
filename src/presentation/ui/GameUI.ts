import { t, type GameConfig } from '../../core/config';
import type { GameSession, Mode } from '../../gameplay/GameSession';
import { replies } from '../../sim/DialogueBattle';
import { formatTime } from '../../sim/DayCycle';
import { mergeReports } from '../../sim/DayReport';
import { lifeStatIds } from '../../sim/LifeStats';
import { moods } from '../../sim/EnergyModel';
import { stutterText } from '../../sim/SpeechChallenge';
import type { Camera2D } from '../Camera2D';
import type { PresentationState } from '../PresentationState';
import type { Settings } from '../Settings';
import { layerOf } from '../../world/World';
import { epilogueKeys } from '../../gameplay/Story';
import { el, escapeHtml, setHtml, setText, show } from './dom';
import { itemIcon } from './icons';

// 플레이 화면 HTML 오버레이. 배터리·스트레스 수치는 보여주지 않는다 (디버그 패널 전용).
// 상태는 말투·떨림·가려짐 같은 '감각'으로 드러낸다. 예외: 스트레스는 숫자 없는 게이지로 보여준다 (설정에서 끌 수 있음).

export type Screen = 'title' | 'game';

export class GameUI {
  private readonly root = el('div', 'ui', document.body);
  private readonly memo = el('div', 'memo', this.root);
  private readonly memoHead = el('div', 'memo__head', this.memo);
  private readonly memoList = el('ul', 'memo__list', this.memo);
  private readonly memoFoot = el('div', 'memo__foot', this.memo);
  private readonly arrow = el('div', 'objective-arrow', this.root, '➤');
  private readonly skills = el('div', 'skills', this.root);
  private readonly prompt = el('div', 'prompt', this.root);
  private readonly toastEl = el('div', 'toast', this.root);
  private readonly hint = el('div', 'hint', this.root);
  private readonly mono = el('div', 'monologue', this.root);
  private readonly tagLayer = el('div', 'tags', this.root);
  private readonly tags = new Map<string, HTMLDivElement>();
  private readonly notifs = el('div', 'notifs', this.root);
  private readonly call = el('div', 'call', this.root);
  private readonly phonePanel = el('div', 'phone', this.root);
  private readonly panel = el('div', 'panel', this.root);
  private panelH = -1;
  private readonly qte = el('div', 'qte', this.root);
  private readonly status = el('div', 'status', this.root);
  /** 오른쪽 위 게이지: 에너지(핵심) → 심리 상태(에너지를 깎는 원인) → 증상(겉모습). 숫자 없이 길이·색으로 */
  private readonly gauges = el('div', 'gauges', this.root);
  private readonly energyRow = el('div', 'gauge gauge--energy', this.gauges);
  private readonly energyFill: HTMLDivElement;
  private readonly drainEl: HTMLSpanElement;
  private energyShown = 1;
  private readonly moodGroup = el('div', 'gauges__group', this.gauges);
  private readonly symptomGroup = el('div', 'gauges__group gauges__group--symptoms', this.gauges);
  private readonly bars: { key: string; get: (s: GameSession) => number; row: HTMLElement; fill: HTMLElement; shown: number }[] = [];
  private readonly optionInputs = new Map<string, HTMLInputElement>();
  private readonly screen = el('div', 'screen', document.body);
  private readonly mapEl = el('div', 'map', document.body);
  private readonly mapCanvas = el('canvas', 'map__canvas', this.mapEl);
  private readonly optionsEl = el('div', 'options', document.body);
  private toastTimer = 0;
  private mapOpen = false;
  private minimap: HTMLCanvasElement | null = null;

  constructor(
    private readonly cfg: GameConfig,
    private readonly settings: Settings,
    private readonly onSettings: (s: Settings) => void,
  ) {
    setText(this.hint, this.tx('hud.controls'));
    el('span', 'gauge__label', this.energyRow, this.tx('hud.energy'));
    this.energyFill = el('div', 'gauge__fill', el('div', 'gauge__bar', this.energyRow));
    this.drainEl = el('span', 'gauge__drain', this.energyRow);
    const bar = (host: HTMLElement, key: string, get: (s: GameSession) => number) => {
      const row = el('div', `gauge gauge--${key}`, host);
      el('span', 'gauge__label', row, this.tx(`hud.${key}`));
      const fill = el('div', 'gauge__fill', el('div', 'gauge__bar', row));
      this.bars.push({ key, get, row, fill, shown: 0 });
    };
    for (const m of moods) bar(this.moodGroup, m, (s) => s.snapshot[m] / 100);
    for (const sy of ['flush', 'stutter', 'sweat', 'migraine'] as const) bar(this.symptomGroup, sy, (s) => s.snapshot[sy]);
    bar(this.symptomGroup, 'hurry', (s) => s.hurry);
    this.buildOptions();
    el('div', 'map__title', this.mapEl, this.tx('map.title'));
    el('div', 'map__hint', this.mapEl, this.tx('map.hint'));
  }

  private tx(key: string, vars?: Record<string, string | number>): string {
    return t(this.cfg.text, key, vars);
  }

  /** 돈 표시 (₩, 언어별 자릿수 구분) */
  private money(n: number): string {
    return this.tx('hud.money', { money: n.toLocaleString(this.cfg.text['meta.locale'] ?? 'ko-KR') });
  }

  setMinimap(c: HTMLCanvasElement): void {
    this.minimap = c;
  }

  toggleMap(): void {
    this.mapOpen = !this.mapOpen;
  }

  get isMapOpen(): boolean {
    return this.mapOpen;
  }

  get optionsOpen(): boolean {
    return this.optionsEl.style.display === 'flex';
  }

  toggleOptions(): void {
    show(this.optionsEl, !this.optionsOpen, 'flex');
  }

  toast(key: string, vars?: Record<string, string | number>): void {
    setText(this.toastEl, this.tx(key, vars));
    this.toastEl.style.opacity = '1';
    this.toastTimer = 2.6;
  }

  // ───────────────────────── 타이틀 ─────────────────────────

  showTitle(continueDay: string | null): void {
    show(this.root, false);
    show(this.screen, true, 'flex');
    this.screen.dataset['kind'] = 'title';
    setHtml(
      this.screen,
      `<div class="screen__box">
        <h1 class="screen__title">${escapeHtml(this.tx('screen.title'))}</h1>
        <p class="screen__body">${escapeHtml(this.tx('screen.subtitle'))}</p>
        <p class="screen__cta">${escapeHtml(continueDay ? this.tx('screen.continue', { day: continueDay }) : this.tx('screen.start'))}</p>
        ${continueDay ? `<p class="screen__hint">${escapeHtml(this.tx('screen.newGame'))}</p>` : ''}
        <p class="screen__warn">${escapeHtml(this.tx('screen.photosensitive'))}</p>
      </div>`,
    );
  }

  // ───────────────────────── 매 프레임 ─────────────────────────

  update(dt: number, s: GameSession, ps: PresentationState, cam: Camera2D): void {
    show(this.root, true);
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toastEl.style.opacity = '0';

    const mode = s.mode;
    const playing = !['dayIntro', 'night', 'final', 'burnout', 'collapse'].includes(mode.kind);
    this.updateScreen(s, ps);
    show(this.memo, playing);
    show(this.skills, playing);
    this.updateMemo(s);
    this.updateArrow(s, cam, playing);
    this.updateSkills(s);
    this.updatePrompt(s, cam, playing);
    this.updateMonologue(s, ps, cam, playing);
    this.updateTags(s, cam, playing);
    this.updatePhone(s, ps, playing);
    this.updatePanel(s, ps);
    this.updateQte(s);
    this.updateStatus(s);
    this.updateStress(dt, s, playing);
    this.updateSymptoms(dt, s, playing);
    show(this.hint, playing && this.settings.controlsHint);
    this.updateMap(s);
  }

  /** 에너지: 가득(초록) → 지침(노랑) → 위험(주황) → 바닥(빨강, 떨림). 옆의 ▼는 지금 심리 상태 때문에 닳는 속도 */
  private updateStress(dt: number, s: GameSession, playing: boolean): void {
    const visible = playing && this.settings.stressGauge;
    show(this.gauges, playing && (this.settings.stressGauge || this.settings.symptomGauge));
    show(this.energyRow, visible, 'flex');
    show(this.moodGroup, visible);
    if (!visible) return;
    const snap = s.snapshot;
    const e = Math.min(1, snap.battery / 100);
    this.energyShown += (e - this.energyShown) * Math.min(1, dt * 6);
    const tiers = this.cfg.balance.battery.tiers;
    const pct = this.energyShown * 100;
    const color = pct > tiers.tired ? '#7fbf7a' : pct > tiers.danger ? '#e0c25a' : pct > tiers.critical ? '#e0904a' : '#e05a5a';
    this.energyFill.style.width = `${(this.energyShown * 100).toFixed(1)}%`;
    this.energyFill.style.background = color;
    this.energyRow.classList.toggle('gauge--alert', pct <= tiers.critical);
    // 혼자만의 틈으로 차는 중이면 ▲ (누가 보고 있어 멈췄으면 ‖)
    const b = s.itemBreak;
    const d = snap.drainPerSec;
    const eating = !!b && (this.cfg.items.consumables.find((c) => c.id === b.id)?.effects.battery ?? 0) > 0;
    setText(this.drainEl, eating ? (b.paused ? '‖' : '▲') : d >= 1.2 ? '▼▼▼' : d >= 0.6 ? '▼▼' : d >= 0.2 ? '▼' : '');
    this.drainEl.classList.toggle('gauge__drain--up', eating && !b.paused);
  }

  /** 하루 시작 화면: 연차 (쓸 수 있으면 [L], 썼으면 쉬는 날, 못 쓰는 날이면 이유) */
  private leaveHtml(s: GameSession): string {
    const leave = s.day.leave;
    if (!leave) return '';
    if (s.onLeave) return `<p class="screen__leave screen__leave--on">${escapeHtml(this.tx('leave.on'))}</p>`;
    if (!leave.allowed) return `<p class="screen__leave">${escapeHtml(this.tx(leave.noteKey))}</p>`;
    const left = s.cfg.balance.leave.perWeek - s.leaveUsed;
    if (left <= 0) return `<p class="screen__leave">${escapeHtml(this.tx('leave.none'))}</p>`;
    return `<p class="screen__leave">${escapeHtml(this.tx('leave.offer', { n: left }))}</p>`;
  }

  /** 하루 시작 화면: 오늘만의 작은 사건 */
  private happeningsHtml(s: GameSession): string {
    // 지난 날의 선택이 남긴 이야기 한 줄이 먼저, 그다음 오늘만의 작은 사건
    const keys = [...(s.day.notes ?? []).map((n) => n.textKey), ...s.happenings.flatMap((h) => (h.introKey ? [h.introKey] : []))];
    const lines = keys.map((k) => `<li>${escapeHtml(this.tx(k))}</li>`);
    return lines.length ? `<ul class="screen__today">${lines.join('')}</ul>` : '';
  }

  /** 심리 상태·증상 막대: 숫자 없이 길이로. 0이면 흐리게 */
  private updateSymptoms(dt: number, s: GameSession, playing: boolean): void {
    show(this.symptomGroup, playing && this.settings.symptomGauge);
    if (!playing) return;
    for (const r of this.bars) {
      r.shown += (Math.min(1, r.get(s)) - r.shown) * Math.min(1, dt * 6);
      r.fill.style.width = `${(r.shown * 100).toFixed(1)}%`;
      r.row.classList.toggle('gauge--on', r.shown > 0.05);
      r.row.classList.toggle('gauge--alert', r.shown >= 0.6 && (r.key === 'meltdown' || r.key === 'panic'));
    }
  }

  /** [H] 단축키 안내 켜기·끄기 (설정에 저장) */
  toggleHints(): void {
    this.settings.controlsHint = !this.settings.controlsHint;
    const box = this.optionInputs.get('controlsHint');
    if (box) box.checked = this.settings.controlsHint;
    this.onSettings(this.settings);
    this.toast(this.settings.controlsHint ? 'hud.hintsShown' : 'hud.hintsHidden');
  }

  private updateMemo(s: GameSession): void {
    const day = s.day;
    setText(this.memoHead, `${this.tx(day.weekdayKey)}  ${s.clock.label}`);
    const items = s.objectives.visible().map((o) => {
      const tags: string[] = [];
      if (o.def.mandatory) tags.push(`<span class="memo__tag memo__tag--must">${escapeHtml(this.tx('obj.mandatory'))}</span>`);
      if (o.def.deadline && !o.late) tags.push(`<span class="memo__tag">${escapeHtml(this.tx('obj.deadline', { time: o.def.deadline }))}</span>`);
      const count = o.def.count && o.def.count > 1 ? ` (${o.progress}/${o.def.count})` : '';
      return `<li class="${o.late ? 'memo__late' : ''}">${escapeHtml(this.tx(o.def.textKey))}${count} ${tags.join(' ')}</li>`;
    });
    const done = s.objectives.list.filter((o) => o.done && !o.def.endsDay).map((o) => `<li class="memo__done">${escapeHtml(this.tx(o.def.textKey))}</li>`);
    setHtml(this.memoList, [...done, ...items].join(''));
    const inv = s.player.inventory;
    // 오늘 밤 생활비도 못 낼 만큼이면 붉게
    const poor = s.sim.life.money < this.cfg.life.settlement.dailyCost.money;
    const parts = [`<span class="${poor ? 'memo__money--low' : ''}">${escapeHtml(this.money(s.sim.life.money))}</span>`];
    // 가방 칸 순서 = 단축키 1~8
    s.bagSlots().forEach((id, i) => {
      const d = this.cfg.items.consumables.find((c) => c.id === id);
      // 위안 물건은 오늘 남은 횟수, 소모품은 개수
      const count = d?.usesPerDay ? `${s.usesLeft(id)}/${d.usesPerDay}` : `×${inv.consumables[id] ?? 0}`;
      if (d) parts.push(`<span class="memo__item" data-code="Digit${i + 1}" title="${escapeHtml(this.tx(d.nameKey))}"><kbd>${i + 1}</kbd>${itemIcon(d.icon, 16)}${count}</span>`);
    });
    const bag = s.bagCount();
    if (bag > 0) parts.push(`<span class="memo__bag${bag >= this.cfg.items.bagMax ? ' memo__bag--full' : ''}">🎒${bag}/${this.cfg.items.bagMax}</span>`);
    for (const g of this.cfg.items.gear) if (inv.gear.includes(g.id)) parts.push(`<span class="memo__item" title="${escapeHtml(this.tx(g.nameKey))}">${itemIcon(g.icon, 16)}</span>`);
    setHtml(this.memoFoot, parts.join(' ') + this.pendingHtml(s));
  }

  /** 폰 상태 표시줄의 생활 지표: 숫자 없이 아이콘 아래 막대 (낮으면 붉게) */
  private lifeIconsHtml(s: GameSession): string {
    const icons: Record<string, string> = { income: '💼', housing: '🏠', essentials: '🛒', bond: '💛' };
    return `<span class="lifeicons">${lifeStatIds
      .map((id) => {
        const v = s.sim.life.get(id) / 100;
        return `<span class="lifeicon${v < 0.3 ? ' lifeicon--low' : ''}" title="${escapeHtml(this.tx(`life.${id}`))}">${icons[id] ?? ''}<i style="width:${(v * 100).toFixed(0)}%"></i></span>`;
      })
      .join('')}</span>`;
  }

  /** 미뤄 둔 연락: 피할수록 쌓이는 점(●). 다 차면 직접 찾아온다. 읽지 않은 메시지 수 */
  private pendingHtml(s: GameSession): string {
    const life = s.sim.life;
    const rows: string[] = [];
    const max = this.cfg.life.stats.escalateAfter;
    for (const [id, c] of Object.entries(this.cfg.life.contacts)) {
      const n = life.avoidCount(id);
      if (n <= 0 || id === 'unknownNumber') continue;
      const k = c.escalation ? n % max || max : Math.min(n, max);
      const dots = c.escalation ? `${'●'.repeat(k)}${'○'.repeat(max - k)}` : '●'.repeat(k);
      rows.push(`<li class="${c.escalation && k >= max - 1 ? 'memo__pending--hot' : ''}">${escapeHtml(this.tx(c.nameKey))} <span class="memo__dots">${dots}</span></li>`);
    }
    // 낮은 생활 지표: 무엇을 하면 오르는지 바로 보이게
    for (const id of lifeStatIds) {
      if (life.get(id) < this.cfg.life.stats.lowTipBelow) rows.push(`<li class="memo__tip">${escapeHtml(this.tx(`tip.${id}`))}</li>`);
    }
    const unread = s.loudUnread();
    if (unread > 0) rows.push(`<li>${escapeHtml(this.tx('memo.unread', { n: unread }))}</li>`);
    return rows.length ? `<div class="memo__pending"><b>${escapeHtml(this.tx('memo.pending'))}</b><ul>${rows.join('')}</ul></div>` : '';
  }

  /** 화면 가장자리 화살표: 지금 할 일 쪽 */
  private updateArrow(s: GameSession, cam: Camera2D, playing: boolean): void {
    const target = this.markerTarget(s);
    if (!target || !playing || s.mode.kind !== 'free') {
      show(this.arrow, false);
      return;
    }
    const sp = cam.toScreen(target);
    const margin = 48;
    const inside = sp.x > margin && sp.y > margin && sp.x < cam.viewW - margin && sp.y < cam.viewH - margin;
    show(this.arrow, !inside);
    if (inside) return;
    const cx = cam.viewW / 2;
    const cy = cam.viewH / 2;
    const ang = Math.atan2(sp.y - cy, sp.x - cx);
    const r = Math.min(cx, cy) - margin;
    this.arrow.style.transform = `translate(${cx + Math.cos(ang) * r}px, ${cy + Math.sin(ang) * r}px) rotate(${ang}rad)`;
  }

  /** 지금 할 일이 있는 곳. 다른 층이면 그 층으로 가는 계단·엘리베이터·지하철 출구를 가리킨다 */
  markerTarget(s: GameSession): { x: number; y: number } | null {
    const obj = s.objectives.visible().find((o) => o.def.marker);
    if (!obj?.def.marker) return null;
    const m = obj.def.marker;
    const it = this.cfg.world.interactables.find((i) => i.id === m);
    const area = s.world.map.area(m);
    const goal = it ? { x: it.at[0], y: it.at[1] } : area ? { x: area.rect[0] + area.rect[2] / 2, y: area.rect[1] + area.rect[3] / 2 } : null;
    if (!goal) return null;
    const here = layerOf(s.world, s.player.pos);
    if (layerOf(s.world, goal) === here) return goal;
    // 층을 잇는 출입구: 포털과 엘리베이터
    const links: { from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    for (const p of this.cfg.world.portals) {
      const target = this.cfg.world.portals.find((q) => q.id === p.to);
      if (target) links.push({ from: { x: p.at[0], y: p.at[1] }, to: { x: target.arrive[0], y: target.arrive[1] } });
    }
    for (const e of this.cfg.world.interactables) {
      const front = e.kind === 'elevator' && e.target ? this.cfg.world.elevator.fronts[e.target] : undefined;
      if (front) links.push({ from: { x: e.at[0], y: e.at[1] }, to: { x: front[0], y: front[1] } });
    }
    const d = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
    let best: { x: number; y: number } | null = null;
    let bestCost = Infinity;
    for (const l of links) {
      if (layerOf(s.world, l.from) !== here) continue;
      const toLayer = layerOf(s.world, l.to);
      // 목표 층으로 바로 가거나, 지상을 거쳐 가는 출입구
      if (toLayer !== layerOf(s.world, goal) && toLayer !== 'ground') continue;
      const cost = d(s.player.pos, l.from) + (toLayer === layerOf(s.world, goal) ? d(l.to, goal) : 60);
      if (cost < bestCost) {
        bestCost = cost;
        best = l.from;
      }
    }
    return best ?? goal;
  }

  private updateSkills(s: GameSession): void {
    const p = s.player;
    const parts: string[] = [];
    if (p.earphones) parts.push(this.tx('hud.skill.earphones'));
    if (p.phonePretend) parts.push(this.tx('hud.skill.phone'));
    if (p.cover) parts.push(this.tx('hud.skill.cover'));
    if (p.eyesClosed) parts.push(this.tx('hud.skill.eyes'));
    if (p.mask) parts.push(this.tx('hud.skill.mask'));
    if (p.hidden) parts.push(this.tx('hud.hiding'));
    if (p.lockedSafe) parts.push(this.tx('hud.safe'));
    if (s.sanctuary) parts.push(this.tx('hud.sanctuary'));
    if (s.mode.kind === 'seated') parts.push(this.tx('dinner.focusBuff'));
    setText(this.skills, parts.join('   '));
  }

  private updatePrompt(s: GameSession, cam: Camera2D, playing: boolean): void {
    const pr = s.prompt;
    const visible = playing && (s.mode.kind === 'free' || s.mode.kind === 'peephole') && pr !== null && !s.phoneOpen;
    show(this.prompt, visible);
    if (!visible || !pr) return;
    setText(this.prompt, `[F] ${this.tx(pr.labelKey)}`);
    const sp = cam.toScreen(pr.at);
    this.prompt.style.transform = `translate(${Math.round(sp.x)}px, ${Math.round(sp.y - 34)}px) translate(-50%, -100%)`;
  }

  private updateMonologue(s: GameSession, ps: PresentationState, cam: Camera2D, playing: boolean): void {
    const line = s.monologue.current;
    const visible = playing && line !== null && s.mode.kind !== 'speech';
    show(this.mono, visible);
    if (!visible || !line) return;
    setText(this.mono, line.text);
    // 시야 앞쪽에 떠다니는 생각 (월드 좌표 → 화면 좌표)
    const p = s.player;
    const ahead = { x: p.pos.x + Math.cos(p.facing) * 0.8, y: p.pos.y + Math.min(0, Math.sin(p.facing)) * 0.8 - 2.2 };
    const sp = cam.toScreen(ahead);
    const float = Math.sin(ps.time * 1.6) * 4;
    const k = line.age / line.duration;
    const fade = Math.min(1, line.age / 0.3, (line.duration - line.age) / 0.5);
    const jitter = ps.migraine > 0.2 ? (Math.random() - 0.5) * ps.migraine * 4 : 0;
    this.mono.style.opacity = String(Math.max(0, fade) * (1 - ps.eyes * 0.5));
    this.mono.style.transform = `translate(${Math.round(sp.x + jitter)}px, ${Math.round(sp.y + float - k * 10)}px) translate(-50%, -100%)`;
  }

  /** 머리 위 인식표: 이름 대신 위협 태그 */
  private updateTags(s: GameSession, cam: Camera2D, playing: boolean): void {
    const seen = new Set<string>();
    if (playing) {
      const p = s.player.pos;
      for (const n of s.activeNpcs()) {
        const d = Math.hypot(n.pos.x - p.x, n.pos.y - p.y);
        if (d > 11 || n.state === 'dialogue' || (n.type === 'passerby' && d > 5)) continue;
        if (!s.world.map.lineOfSight(p, n.pos) && d > 3) continue;
        seen.add(n.id);
        let tag = this.tags.get(n.id);
        if (!tag) {
          tag = el('div', 'tag', this.tagLayer);
          this.tags.set(n.id, tag);
        }
        setText(tag, this.tx(n.profile.displayTagKey));
        tag.dataset['state'] = n.pursuing ? 'hot' : n.type === 'ally' ? 'ally' : n.notice > 0.4 ? 'warm' : '';
        const sp = cam.toScreen({ x: n.pos.x, y: n.pos.y - 0.9 });
        tag.style.transform = `translate(${Math.round(sp.x)}px, ${Math.round(sp.y)}px) translate(-50%, -100%)`;
        tag.style.opacity = String(Math.max(0.25, 1 - d / 12));
      }
    }
    for (const [id, tag] of this.tags) {
      if (!seen.has(id)) {
        tag.remove();
        this.tags.delete(id);
      }
    }
  }

  // ───────────────────────── 폰 ─────────────────────────

  private updatePhone(s: GameSession, ps: PresentationState, playing: boolean): void {
    const phone = s.phone;
    const contactName = (id: string) => this.tx(this.cfg.life.contacts[id]?.nameKey ?? id);
    // 안 읽은 알림이 화면 오른쪽 아래를 가린다
    const unread = phone.messages.filter((m) => !m.read && !m.resolved && !this.cfg.life.contacts[m.contactId]?.muted);
    show(this.notifs, playing && !s.phoneOpen && unread.length > 0);
    setHtml(
      this.notifs,
      unread
        .slice(-4)
        .map((m) => `<div class="notif"><b>${escapeHtml(contactName(m.contactId))}</b><span>${escapeHtml(this.tx(m.textKey))}</span></div>`)
        .join('') + (unread.length > 4 ? `<div class="notif notif--more">+${unread.length - 4}</div>` : ''),
    );

    const c = phone.call;
    show(this.call, playing && c !== null);
    if (c) {
      const mandatory = s.objectives.list.some((o) => o.def.on === `answered:${c.contactId}` && o.def.mandatory && !o.done);
      const shake = (Math.random() - 0.5) * 6 * (1 - c.ringElapsed / 12);
      this.call.style.transform = `translate(-50%, 0) translate(${shake}px, 0)`;
      setHtml(
        this.call,
        `<div class="call__who">📞 ${escapeHtml(contactName(c.contactId))}</div>
         <div class="call__label">${escapeHtml(this.tx('phone.call.incoming'))}</div>
         <div class="call__hint">${escapeHtml(this.tx(mandatory ? 'phone.call.hintMandatory' : 'phone.call.hint'))}</div>`,
      );
    }

    show(this.phonePanel, playing && s.phoneOpen);
    if (!s.phoneOpen) return;
    const msgs = phone.messages.filter((m) => !m.resolved);
    const snap = s.snapshot;
    // 폰 상태 표시줄: 사회적 배터리를 숫자 없이 아이콘으로만
    const level = snap.battery / 100;
    const batt = `<span class="batt"><span class="batt__fill" style="width:${Math.round(level * 100)}%;background:${level > 0.69 ? '#9fd38a' : level > 0.39 ? '#e7cf6b' : level > 0.14 ? '#e79a5b' : '#e05a5a'}"></span></span>`;
    const list = msgs.length
      ? msgs
          .map(
            (m, i) =>
              `<li class="${i === Math.min(s.phoneCursor, msgs.length - 1) ? 'sel' : ''} ${m.read ? '' : 'unread'}"><b>${escapeHtml(contactName(m.contactId))}</b><span>${escapeHtml(this.tx(m.textKey))}</span></li>`,
          )
          .join('')
      : `<li class="empty">${escapeHtml(this.tx('phone.empty'))}</li>`;
    setHtml(
      this.phonePanel,
      `<div class="phone__bar"><span>${s.clock.label}</span>${this.lifeIconsHtml(s)}${batt}</div>
       <div class="phone__title">${escapeHtml(this.tx('phone.title'))}</div>
       <ul class="phone__list">${list}</ul>
       ${phone.waitingReply ? `<div class="phone__wait">${escapeHtml(this.tx('phone.waiting'))}</div>` : ''}
       <div class="phone__hint">${escapeHtml(this.tx('phone.msg.hint'))}</div>`,
    );
    this.phonePanel.style.filter = ps.sweat > 0.5 ? `blur(${(ps.sweat * 0.6).toFixed(2)}px)` : '';
  }

  // ───────────────────────── 모드 패널 ─────────────────────────

  private updatePanel(s: GameSession, ps: PresentationState): void {
    const m = s.mode;
    let html = '';
    switch (m.kind) {
      case 'dialogue':
        html = this.dialogueHtml(s, ps, m);
        break;
      case 'speech':
        html = this.speechHtml(s, m);
        break;
      case 'work':
        html = this.workHtml(m);
        break;
      case 'piano':
        html = this.pianoHtml(m);
        break;
      case 'seated':
        html = this.seatedHtml(m);
        break;
      case 'shop':
        html = this.shopHtml(s, m);
        break;
      default:
        break;
    }
    show(this.panel, html !== '');
    this.panel.dataset['kind'] = m.kind;
    setHtml(this.panel, html);
    // 하단 패널이 떠 있으면 전화 수신 창·알림을 그 위로 올린다 (업무 중 전화 안내가 가려지지 않게)
    const panelH = html !== '' ? this.panel.offsetHeight + 28 : 0;
    if (panelH !== this.panelH) {
      this.panelH = panelH;
      this.root.style.setProperty('--panel-h', `${panelH}px`);
    }
    if (m.kind === 'dialogue') {
      // 미소 유지 중: 화면 가장자리 떨림 / 편두통: 선택지 진동
      const choices = this.panel.querySelector<HTMLElement>('.dlg__choices');
      if (choices && ps.migraine > 0.2) choices.style.transform = `translate(${(Math.random() - 0.5) * ps.migraine * 5}px, ${(Math.random() - 0.5) * ps.migraine * 3}px)`;
    }
  }

  private dialogueHtml(s: GameSession, ps: PresentationState, m: Extract<Mode, { kind: 'dialogue' }>): string {
    const b = m.battle;
    const npc = m.npc;
    const line = b.currentLine;
    const typed = Math.min(line.text.length, Math.ceil(line.text.length * Math.min(1, b.lineProgress * 1.25)));
    const npcText = b.ended ? (m.closer ?? '') : line.text.slice(0, typed);
    // 홍조: 상대 목소리가 작게 들린다 (글자가 흐려짐)
    const volume = Math.max(0.45, 1 - ps.flush * 0.5);
    const mood = b.satisfaction >= 80 ? '😊' : b.satisfaction >= 45 ? '🙂' : b.satisfaction >= 15 ? '😐' : '🫤';
    const ally = npc.type === 'ally';
    const windowW = (b.windowSec / line.durationSec) * 100;
    const myLine = m.myLine && m.myLineTime < 1.6 ? this.tx(m.myLine) : '';
    const shownMy = myLine && s.sim.somatic.active('stutter') ? stutterText(myLine) : myLine;
    const choices = replies
      .map((r, i) => `<li class="${b.inWindow && (r === 'exit' ? line.kind === 'opening' : true) ? 'hot' : ''}"><kbd>${i + 1}</kbd>${escapeHtml(this.tx(`dialogue.reply.${r}`))}</li>`)
      .join('');
    const smile = ally ? '' : `<span class="dlg__smile">${escapeHtml(this.tx('dialogue.smile'))}</span>`;
    const sos = !ally && !s.sosUsed && s.sim.life.get('bond') >= this.cfg.balance.sos.bondMin ? `<span>${escapeHtml(this.tx('dialogue.sos'))}</span>` : '';
    const sosPending = b.sosPending ? `<span class="dlg__sos">${escapeHtml(this.tx('dialogue.sosPending'))} ${Math.ceil(b.sosRemaining)}</span>` : '';
    const boss = !b.canExitNow ? `<span class="dlg__boss">${escapeHtml(this.tx('dialogue.waitBoss'))}</span>` : '';
    return `<div class="dlg ${ally ? 'dlg--ally' : ''}">
      ${m.practice && !b.ended ? `<div class="dlg__coach">💡 ${escapeHtml(this.tx(this.coachKey(m)))}</div>` : ''}
      <div class="dlg__who"><span class="dlg__face" style="background:${npc.profile.color}">${mood}</span>${escapeHtml(this.tx(npc.profile.displayTagKey))}</div>
      <div class="dlg__bubble" style="opacity:${volume.toFixed(2)};font-size:${(15 + volume * 4).toFixed(1)}px">${escapeHtml(npcText)}</div>
      ${shownMy ? `<div class="dlg__me">${escapeHtml(shownMy)}</div>` : ''}
      ${
        b.ended
          ? ''
          : `<div class="dlg__timing"><div class="dlg__bar" style="width:${(b.lineProgress * 100).toFixed(1)}%"></div><div class="dlg__window ${line.kind === 'opening' ? 'dlg__window--gap' : ''}" style="left:${(100 - windowW).toFixed(1)}%;width:${(windowW * 2).toFixed(1)}%"></div></div>
             <ul class="dlg__choices">${choices}</ul>
             <div class="dlg__foot">${smile}${sos}${sosPending}${boss}</div>`
      }
    </div>`;
  }

  /** 연습 대화: 지금 무엇을 하면 되는지 한 줄씩 */
  private coachKey(m: Extract<Mode, { kind: 'dialogue' }>): string {
    const b = m.battle;
    if (m.wrongAge < 2.5) return 'coach.wrong';
    if (!m.smiling) return 'coach.smile';
    const kind = b.currentLine.kind;
    if (kind === 'opening') return b.inWindow ? 'coach.parryNow' : 'coach.opening';
    return `coach.${kind}`;
  }

  private shopHtml(s: GameSession, m: Extract<Mode, { kind: 'shop' }>): string {
    const shop = this.cfg.items.shops[m.shopId]!;
    const inv = s.player.inventory.consumables;
    const rows = shop.stock
      .map((e, i) => {
        const def = this.cfg.items.consumables.find((d) => d.id === e.item) ?? this.cfg.items.gear.find((g) => g.id === e.item)!;
        const have = s.player.inventory.gear.includes(e.item) ? '✓' : inv[e.item] ? `×${inv[e.item]}` : '';
        // 값: 돈, 생활 지표(집 찬장), 무료(탕비실, 남은 개수)
        const left = s.shopLeft(m.shopId, e.item);
        const lifeCost = Object.entries(e.life ?? {})
          .map(([k, v]) => `${({ income: '💼', housing: '🏠', essentials: '🛒', bond: '💛' } as Record<string, string>)[k] ?? k}${v}`)
          .join(' ');
        const price = e.price > 0 ? this.money(e.price) : lifeCost || this.tx('shop.free');
        const note = Number.isFinite(left) ? `<span class="shop__left">${escapeHtml(left > 0 ? this.tx('shop.left', { n: left }) : this.tx('shop.soldOut'))}</span>` : '';
        return `<li class="${i === m.cursor ? 'sel' : ''}${left <= 0 ? ' shop__out' : ''}"><span class="shop__name">${itemIcon(def.icon, 22)}${escapeHtml(this.tx(def.nameKey))}</span><span class="shop__desc">${escapeHtml(this.tx(`${def.nameKey}.desc`))}${note}</span><span class="shop__have">${have}</span><span class="shop__price">${escapeHtml(price)}</span></li>`;
      })
      .join('');
    return `<div class="shop">
      <div class="shop__title">${escapeHtml(this.tx(shop.titleKey))}<span>🎒${s.bagCount()}/${this.cfg.items.bagMax} · ${escapeHtml(this.money(s.sim.life.money))}</span></div>
      <ul class="shop__list">${rows}</ul>
      <div class="shop__hint">${escapeHtml(this.tx('shop.hint'))}</div>
    </div>`;
  }

  private speechHtml(s: GameSession, m: Extract<Mode, { kind: 'speech' }>): string {
    const ch = m.challenge;
    const sp = this.cfg.speeches[m.speechId]!;
    const spoken = ch.spoken.map((w) => `<span class="${w.clean ? 'ok' : 'miss'}">${escapeHtml(w.clean ? w.text : stutterText(w.text))}</span>`).join(' ');
    const next = ch.chunks.slice(ch.index).map((w) => `<span class="todo">${escapeHtml(w)}</span>`).join(' ');
    const z = ch.zone;
    void s;
    return `<div class="speech">
      <div class="speech__intro">${escapeHtml(this.tx(sp.introKey))}</div>
      <div class="speech__line">${spoken} ${next}</div>
      ${
        ch.done
          ? ''
          : `<div class="speech__beat"><div class="speech__zone" style="left:${(z.from * 100).toFixed(1)}%;width:${((z.to - z.from) * 100).toFixed(1)}%"></div><div class="speech__marker" style="left:${(ch.marker * 100).toFixed(1)}%"></div></div>
             <div class="speech__hint">${escapeHtml(this.tx('speech.hint'))}</div>`
      }
    </div>`;
  }

  private workHtml(m: Extract<Mode, { kind: 'work' }>): string {
    const g = m.game;
    const pings = g.pings
      .map((p) => `<div class="ping" style="--age:${(p.age / 4).toFixed(2)}"><b>${escapeHtml(this.tx('work.ping'))}</b> ${escapeHtml(this.tx(`work.ping.${p.from}`))}</div>`)
      .join('');
    return `<div class="work">
      <div class="work__title">${escapeHtml(this.tx('work.title'))} · ${g.tasksDone}/${g.tasks}</div>
      <div class="work__bar"><div style="width:${g.progress.toFixed(1)}%"></div></div>
      <div class="work__pings">${pings}</div>
      <div class="work__hint">${escapeHtml(this.tx('work.hint'))}</div>
    </div>`;
  }

  private pianoHtml(m: Extract<Mode, { kind: 'piano' }>): string {
    const g = m.game;
    const keys = ['A', 'S', 'D', 'F', 'G', 'H', 'J'];
    const names = [1, 2, 3, 4, 5, 6, 7].map((i) => this.tx(`touch.note${i}`));
    const k = keys.map((key, i) => `<div class="key ${g.expected === i ? 'next' : ''} ${g.lastNote === i ? (g.lastCorrect ? 'ok' : 'miss') : ''}"><span>${names[i]}</span><kbd>${key}</kbd></div>`).join('');
    return `<div class="piano">
      <div class="piano__title">${escapeHtml(this.tx('piano.title'))} · ${g.index}/${g.melody.length}</div>
      <div class="piano__keys">${k}</div>
      <div class="piano__hint">${escapeHtml(g.done ? this.tx('piano.done') : this.tx('piano.hint'))}</div>
    </div>`;
  }

  private seatedHtml(m: Extract<Mode, { kind: 'seated' }>): string {
    const g = m.grill;
    const slots = [0, 1, 2]
      .map((i) => {
        const st = g.state(i);
        const k = Math.min(1, g.slots[i]!.t / (g.cookSec + g.burnSec));
        return `<div class="meat meat--${st}" style="--k:${k.toFixed(2)}"><kbd>${i + 1}</kbd></div>`;
      })
      .join('');
    const leave = m.toastDone ? `<div class="grill__leave ${m.distractedFor > 0 ? 'now' : ''}">[F] ${escapeHtml(this.tx(m.distractedFor > 0 ? 'dinner.leaveNow' : 'dinner.leave'))}</div>` : '';
    return `<div class="grill">
      <div class="grill__slots">${slots}</div>
      <div class="grill__hint">${escapeHtml(this.tx('dinner.grill.hint'))}</div>
      ${leave}
    </div>`;
  }

  private updateQte(s: GameSession): void {
    const q = s.qte;
    show(this.qte, q !== null);
    if (!q) return;
    const left = Math.max(0, 1 - q.timer / q.window);
    const bar = `<div class="qte__bar"><div style="width:${(left * 100).toFixed(1)}%"></div></div>`;
    const key = q.kind === 'laugh' ? 'qte.laugh' : 'knock.prompt';
    setHtml(this.qte, `<div class="qte__text">${escapeHtml(this.tx(key))}</div>${bar}`);
  }

  /** 엘리베이터·셀프 계산대·외시경·가격 택 등 진행 상태 한 줄 */
  private updateStatus(s: GameSession): void {
    const m = s.mode;
    let text = '';
    if (m.kind === 'elevator') text = m.phase === 'waiting' ? this.tx('elevator.waiting') : m.phase === 'closing' ? this.tx('elevator.ride') : `▼ ▲  ${m.companion ? '…' : ''}`;
    else if (m.kind === 'bus') {
      const dest = this.tx(s.cfg.world.bus?.stops[m.to]?.nameKey ?? m.to);
      text = m.phase === 'waiting' ? this.tx('bus.waiting', { dest, min: Math.ceil(s.busWaitMin()) }) : this.tx(m.awkward ? 'bus.ridingAwkward' : 'bus.riding', { dest });
    }
    else if (m.kind === 'selfCheckout') text = `${this.tx('checkout.self.waiting')} ${Math.round((m.timer / m.total) * 100)}%`;
    else if (m.kind === 'priceTag') text = `${this.tx('priceTag.hint')}  ${'▮'.repeat(Math.round(m.progress * 10))}${'▯'.repeat(10 - Math.round(m.progress * 10))}`;
    else if (m.kind === 'peephole') text = this.tx('peephole.view');
    else if (m.kind === 'rest') text = this.tx(m.what === 'bench' ? 'bench.done' : m.what === 'books' ? 'browse.start' : 'window.done');
    else if (m.kind === 'laundry') {
      const k = Math.min(1, m.time / this.cfg.balance.laundry.waitSec);
      text = `${this.tx('laundry.waiting')}  ${'▮'.repeat(Math.round(k * 10))}${'▯'.repeat(10 - Math.round(k * 10))}`;
    }
    else if (s.player.lockedSafe) text = this.tx('safe.locked');
    show(this.status, text !== '');
    setText(this.status, text);
  }

  private updateMap(s: GameSession): void {
    show(this.mapEl, this.mapOpen, 'flex');
    if (!this.mapOpen || !this.minimap) return;
    const c = this.mapCanvas;
    const scale = 4;
    if (c.width !== this.minimap.width) {
      c.width = this.minimap.width;
      c.height = this.minimap.height;
    }
    const g = c.getContext('2d')!;
    g.drawImage(this.minimap, 0, 0);
    const dot = (x: number, y: number, color: string, r: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(x * scale, y * scale, r, 0, Math.PI * 2);
      g.fill();
    };
    const target = this.markerTarget(s);
    if (target) dot(target.x, target.y, '#ffd166', 9);
    for (const n of s.activeNpcs()) if (n.type !== 'passerby' && n.type !== 'pet' && n.pos.y < 140) dot(n.pos.x, n.pos.y, n.type === 'ally' ? '#f2c94c' : '#e0645a', 5);
    const p = s.player.pos;
    // 지하·3층(섬 영역)에 있으면 입구 위치로 표시
    const shown = p.y < 140 ? p : s.area?.id === 'subway' ? { x: p.x < 60 ? 31.5 : 177.5, y: 61 } : { x: 22, y: 44 };
    dot(shown.x, shown.y, '#fff7d6', 8);
    dot(shown.x, shown.y, '#3f78c9', 5);
  }

  // ───────────────────────── 화면 ─────────────────────────

  private updateScreen(s: GameSession, ps: PresentationState): void {
    const m = s.mode;
    let html = '';
    let kind = m.kind as string;
    switch (m.kind) {
      case 'dayIntro':
        html = `<div class="screen__box">
          <p class="screen__kicker">${escapeHtml(this.tx(s.day.weekdayKey))} · ${escapeHtml(formatTime(s.clock.minutes))}</p>
          <h1 class="screen__title">${escapeHtml(this.tx(s.day.titleKey))}</h1>
          <p class="screen__body">${escapeHtml(this.tx(s.day.introKey))}</p>
          ${this.happeningsHtml(s)}
          ${this.leaveHtml(s)}
          ${s.dayIndex === 0 ? `<p class="screen__gauges">${escapeHtml(this.tx('intro.gauges'))}</p>` : ''}
          <p class="screen__cta">${escapeHtml(this.tx('screen.dayIntro.hint'))}</p>
          <p class="screen__hint">${escapeHtml(this.tx('hud.controls'))}</p>
        </div>`;
        break;
      case 'burnout':
        if (ps.burnoutTime < this.cfg.presentation.fx.burnoutFadeSec * 0.8) kind = '';
        else
          html = `<div class="screen__box"><h1 class="screen__title">${escapeHtml(this.tx('result.burnout.title'))}</h1>
            <p class="screen__body">${escapeHtml(this.tx('result.burnout.body'))}</p>
            <p class="screen__cta">${escapeHtml(this.tx('result.wakeHome'))}</p></div>`;
        break;
      case 'collapse':
        html = `<div class="screen__box"><h1 class="screen__title">${escapeHtml(this.tx('result.collapse.title'))}</h1>
          <p class="screen__body">${escapeHtml(this.tx(`result.collapse.${m.stat}`))}</p>
          <p class="screen__cta">${escapeHtml(this.tx('result.retry'))}</p></div>`;
        break;
      case 'night':
        html = this.nightHtml(s, m);
        break;
      case 'final':
        html = this.finalHtml(s, m);
        break;
      default:
        kind = '';
    }
    show(this.screen, html !== '', 'flex');
    this.screen.dataset['kind'] = kind;
    setHtml(this.screen, html);
  }

  private reportRows(r: ReturnType<typeof mergeReports>): string {
    const row = (label: string, value: string) => `<tr><th>${escapeHtml(this.tx(label))}</th><td>${escapeHtml(value)}</td></tr>`;
    const n = (v: number) => this.tx('report.unit.count', { n: v });
    return [
      row('report.smalltalkAvoided', n(r.smalltalkAvoided)),
      row('report.smalltalkEndured', n(r.smalltalkEndured)),
      row('report.parried', n(r.parried)),
      row('report.silence', this.tx('report.unit.sec', { n: Math.round(r.silenceSec) })),
      row('report.mandatory', n(r.mandatoryDone.length)),
      row('report.calls', `${r.callsAnswered} / ${r.callsAvoided}`),
      row('report.messages', `${r.messagesReplied} / ${r.messagesIgnored}`),
      row('report.recovered', n(Math.round(r.recoveredBattery))),
    ].join('');
  }

  private lifeBars(values: Record<string, number>, before?: Record<string, number>): string {
    return lifeStatIds
      .map((id) => {
        const v = Math.round(values[id] ?? 0);
        const d = before ? v - Math.round(before[id] ?? 0) : 0;
        const delta = d ? `<em class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</em>` : '';
        return `<div class="life"><span>${escapeHtml(this.tx(`life.${id}`))}</span><div class="life__bar"><div style="width:${v}%"></div></div>${delta}</div>`;
      })
      .join('');
  }

  private nightHtml(s: GameSession, m: Extract<Mode, { kind: 'night' }>): string {
    const r = m.report;
    const settle = m.settlement
      .map((l) => {
        const v = l.money !== undefined ? `${l.money > 0 ? '+' : l.money < 0 ? '−' : ''}${this.money(Math.abs(l.money))}` : `${(l.delta ?? 0) > 0 ? '+' : ''}${l.delta}`;
        return `<li>${escapeHtml(this.tx(l.key))} <b>${escapeHtml(v)}</b></li>`;
      })
      .join('');
    const night = m.breakdown.map((b) => `<li>${escapeHtml(this.tx(b.key))} <b>${b.delta > 0 ? '+' : ''}${b.delta}</b></li>`).join('');
    const comfort = this.tx(`report.comfort.${s.dayIndex % 4}`);
    return `<div class="screen__box screen__box--report">
      <p class="screen__kicker">${escapeHtml(this.tx('night.title', { weekday: this.tx(s.day.weekdayKey) }))}</p>
      <p class="screen__body">${escapeHtml(this.tx('night.body'))}</p>
      <table class="report">${this.reportRows(r)}</table>
      <h3>${escapeHtml(this.tx('report.life'))}</h3>
      ${this.lifeBars(m.lifeEnd, r.lifeStart)}
      ${this.whyHtml(s)}
      ${settle ? `<ul class="settle">${settle}</ul>` : ''}
      <ul class="settle">${night}<li><span>${escapeHtml(this.tx('night.nextMax'))}</span> <b class="nextmax"><span style="width:${m.nextMax}%"></span></b></li></ul>
      <p class="screen__comfort">${escapeHtml(comfort)}</p>
      <p class="screen__cta">${escapeHtml(this.tx('night.next'))}</p>
    </div>`;
  }

  /** 오늘 생활 지표가 바뀐 이유: 지표마다 이유별로 모아서 (밤 정산의 하루 소모는 아래 정산 목록에) */
  private whyHtml(s: GameSession): string {
    const icons: Record<string, string> = { income: '💼', housing: '🏠', essentials: '🛒', bond: '💛' };
    const groups = new Map<string, { stat: string; delta: number; text: string }>();
    for (const c of s.sim.life.ledger) {
      if (c.why.startsWith('settle.')) continue;
      const k = `${c.stat}|${c.why}|${c.who ?? ''}`;
      const g = groups.get(k) ?? { stat: c.stat, delta: 0, text: s.lifeWhyText(c) };
      g.delta += c.delta;
      groups.set(k, g);
    }
    const rows = lifeStatIds.flatMap((id) =>
      [...groups.values()]
        .filter((g) => g.stat === id && g.delta !== 0)
        .sort((a, b) => a.delta - b.delta)
        .map((g) => `<li class="${g.delta < 0 ? 'why--down' : 'why--up'}">${icons[id] ?? ''} ${escapeHtml(g.text)} <b>${g.delta > 0 ? '+' : '−'}${Math.abs(g.delta)}</b></li>`),
    );
    if (!rows.length) return '';
    return `<h3>${escapeHtml(this.tx('night.why'))}</h3><ul class="settle why">${rows.join('')}</ul>`;
  }

  private finalHtml(s: GameSession, m: Extract<Mode, { kind: 'final' }>): string {
    const total = mergeReports(m.reports);
    return `<div class="screen__box screen__box--report">
      <h1 class="screen__title">${escapeHtml(this.tx('final.title'))}</h1>
      <p class="screen__body">${escapeHtml(this.tx('final.body'))}</p>
      <table class="report">${this.reportRows(total)}</table>
      <h3>${escapeHtml(this.tx('report.life'))}</h3>
      ${this.lifeBars(s.sim.life.all())}
      ${this.epilogueHtml(s)}
      <p class="screen__comfort">${escapeHtml(this.tx('report.comfort.2'))}</p>
      <p class="screen__cta">${escapeHtml(this.tx('final.restart'))}</p>
    </div>`;
  }

  /** 한 주의 이야기 줄기마다 결말 한 줄, 그리고 일요일 아침의 맺음말 */
  private epilogueHtml(s: GameSession): string {
    const lines = epilogueKeys(s.cfg.story, s.story).map((k) => `<li>${escapeHtml(this.tx(k))}</li>`);
    if (!lines.length) return '';
    return `<h3>${escapeHtml(this.tx('final.epilogue'))}</h3>
      <ul class="screen__epilogue">${lines.join('')}</ul>
      <p class="screen__closing">${escapeHtml(this.tx(s.cfg.story.closingKey))}</p>`;
  }

  // ───────────────────────── 설정 ─────────────────────────

  private buildOptions(): void {
    const s = this.settings;
    const box = el('div', 'options__box', this.optionsEl);
    el('h2', 'options__title', box, this.tx('options.title'));
    const slider = (key: 'distortion' | 'master' | 'heartbeat' | 'tinnitus', label: string) => {
      const row = el('label', 'options__row', box);
      el('span', '', row, this.tx(label));
      const input = el('input', '', row);
      input.type = 'range';
      input.min = '0';
      input.max = '1';
      input.step = '0.05';
      input.value = String(s[key]);
      input.addEventListener('input', () => {
        s[key] = Number(input.value);
        this.onSettings(s);
      });
    };
    const toggle = (key: 'shake' | 'chromatic' | 'flash' | 'visualCues' | 'stressGauge' | 'symptomGauge' | 'controlsHint', label: string) => {
      const row = el('label', 'options__row', box);
      el('span', '', row, this.tx(label));
      const input = el('input', '', row);
      input.type = 'checkbox';
      input.checked = s[key];
      this.optionInputs.set(key, input);
      input.addEventListener('change', () => {
        s[key] = input.checked;
        this.onSettings(s);
      });
    };
    slider('distortion', 'options.distortion');
    toggle('shake', 'options.shake');
    toggle('chromatic', 'options.chromatic');
    toggle('flash', 'options.flash');
    slider('master', 'options.master');
    slider('heartbeat', 'options.heartbeat');
    slider('tinnitus', 'options.tinnitus');
    toggle('visualCues', 'options.visualCues');
    toggle('stressGauge', 'options.stressGauge');
    toggle('symptomGauge', 'options.symptomGauge');
    toggle('controlsHint', 'options.controlsHint');
    // 언어: 바꾸면 저장하고 다시 불러온다 (주소의 ?lang=은 지운다)
    const langRow = el('label', 'options__row', box);
    el('span', '', langRow, this.tx('options.language'));
    const select = el('select', 'options__select', langRow);
    for (const [code, name] of [['ko', '한국어'], ['en', 'English']] as const) {
      const opt = el('option', '', select, name);
      opt.value = code;
      opt.selected = s.lang === code;
    }
    select.addEventListener('change', () => {
      s.lang = select.value === 'en' ? 'en' : 'ko';
      this.onSettings(s);
      const url = new URL(location.href);
      url.searchParams.delete('lang');
      location.replace(url.toString());
    });
    el('p', 'options__warn', box, this.tx('screen.photosensitive'));
    el('p', 'options__close', box, this.tx('options.close'));
  }
}
