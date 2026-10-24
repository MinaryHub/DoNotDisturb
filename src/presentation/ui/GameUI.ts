import { t, type GameConfig } from '../../core/config';
import type { GameSession, Mode } from '../../gameplay/GameSession';
import { replies } from '../../sim/DialogueBattle';
import { formatTime } from '../../sim/DayCycle';
import { mergeReports } from '../../sim/DayReport';
import { lifeStatIds } from '../../sim/LifeStats';
import { symptoms, type Symptom } from '../../sim/SomaticController';
import { stutterText } from '../../sim/SpeechChallenge';
import type { Camera2D } from '../Camera2D';
import type { PresentationState } from '../PresentationState';
import type { Settings } from '../Settings';
import { layerOf } from '../../world/World';
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
  private readonly stressGauge = el('div', 'stress', this.root);
  private readonly symptomGauge = el('div', 'symptoms', this.root);
  private readonly symptomRows: { key: Symptom; row: HTMLElement; fill: HTMLElement; shown: number }[] = [];
  private readonly optionInputs = new Map<string, HTMLInputElement>();
  private readonly stressFill: HTMLDivElement;
  private stressShown = 0;
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
    el('span', 'stress__label', this.stressGauge, this.tx('hud.stress'));
    this.stressFill = el('div', 'stress__fill', el('div', 'stress__bar', this.stressGauge));
    for (const key of symptoms) {
      const row = el('div', `symptoms__row symptoms__row--${key}`, this.symptomGauge);
      el('span', 'symptoms__label', row, this.tx(`hud.symptom.${key}`));
      const fill = el('div', 'symptoms__fill', el('div', 'symptoms__bar', row));
      this.symptomRows.push({ key, row, fill, shown: 0 });
    }
    this.buildOptions();
    el('div', 'map__title', this.mapEl, this.tx('map.title'));
    el('div', 'map__hint', this.mapEl, this.tx('map.hint'));
  }

  private tx(key: string, vars?: Record<string, string | number>): string {
    return t(this.cfg.text, key, vars);
  }

  setMinimap(c: HTMLCanvasElement): void {
    this.minimap = c;
  }

  toggleMap(): void {
    this.mapOpen = !this.mapOpen;
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

  /** 스트레스 게이지: 숫자 없이 길이·색·떨림으로만 */
  private updateStress(dt: number, s: GameSession, playing: boolean): void {
    const visible = playing && this.settings.stressGauge;
    show(this.stressGauge, visible, 'flex');
    if (!visible) return;
    const snap = s.snapshot;
    const target = Math.min(1, snap.stress / snap.stressMax);
    this.stressShown += (target - this.stressShown) * Math.min(1, dt * 6);
    const v = this.stressShown;
    // 초록빛 회색(차분) → 노랑 → 빨강
    const hue = 140 - v * 140;
    this.stressFill.style.width = `${(v * 100).toFixed(1)}%`;
    this.stressFill.style.background = `hsl(${hue.toFixed(0)}, ${(35 + v * 45).toFixed(0)}%, ${(52 - v * 8).toFixed(0)}%)`;
    this.stressGauge.classList.toggle('stress--high', v >= 0.6);
  }

  /** 증상별 게이지: 숫자 없이 길이로. 0이면 흐리게 */
  private updateSymptoms(dt: number, s: GameSession, playing: boolean): void {
    const visible = playing && this.settings.symptomGauge;
    show(this.symptomGauge, visible);
    if (!visible) return;
    const snap = s.snapshot;
    for (const r of this.symptomRows) {
      r.shown += (snap[r.key] - r.shown) * Math.min(1, dt * 6);
      r.fill.style.width = `${(r.shown * 100).toFixed(1)}%`;
      r.row.classList.toggle('symptoms__row--on', r.shown > 0.05);
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
    const parts = [escapeHtml(this.tx('hud.money', { money: s.sim.life.money.toLocaleString('ko-KR') }))];
    this.cfg.items.consumables.forEach((d, i) => {
      const n = inv.consumables[d.id] ?? 0;
      if (n > 0) parts.push(`<span class="memo__item" title="${escapeHtml(this.tx(d.nameKey))}"><kbd>${i + 1}</kbd>${itemIcon(d.icon, 16)}×${n}</span>`);
    });
    for (const g of this.cfg.items.gear) if (inv.gear.includes(g.id)) parts.push(`<span class="memo__item" title="${escapeHtml(this.tx(g.nameKey))}">${itemIcon(g.icon, 16)}</span>`);
    setHtml(this.memoFoot, parts.join(' '));
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
    const unread = phone.messages.filter((m) => !m.read && !m.resolved);
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
      `<div class="phone__bar"><span>${s.clock.label}</span>${batt}</div>
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

  private shopHtml(s: GameSession, m: Extract<Mode, { kind: 'shop' }>): string {
    const shop = this.cfg.items.shops[m.shopId]!;
    const inv = s.player.inventory.consumables;
    const rows = shop.stock
      .map((e, i) => {
        const def = this.cfg.items.consumables.find((d) => d.id === e.item) ?? this.cfg.items.gear.find((g) => g.id === e.item)!;
        const have = s.player.inventory.gear.includes(e.item) ? '✓' : inv[e.item] ? `×${inv[e.item]}` : '';
        return `<li class="${i === m.cursor ? 'sel' : ''}"><span class="shop__name">${itemIcon(def.icon, 22)}${escapeHtml(this.tx(def.nameKey))}</span><span class="shop__desc">${escapeHtml(this.tx(`${def.nameKey}.desc`))}</span><span class="shop__have">${have}</span><span class="shop__price">${e.price.toLocaleString('ko-KR')}원</span></li>`;
      })
      .join('');
    return `<div class="shop">
      <div class="shop__title">${escapeHtml(this.tx(shop.titleKey))}<span>${escapeHtml(this.tx('hud.money', { money: s.sim.life.money.toLocaleString('ko-KR') }))}</span></div>
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
    const names = ['도', '레', '미', '파', '솔', '라', '시'];
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
    const key = q.kind === 'dodge' ? 'qte.dodge' : q.kind === 'laugh' ? 'qte.laugh' : 'knock.prompt';
    const left = Math.max(0, 1 - q.timer / q.window);
    setHtml(this.qte, `<div class="qte__text">${escapeHtml(this.tx(key))}</div><div class="qte__bar"><div style="width:${(left * 100).toFixed(1)}%"></div></div>`);
  }

  /** 엘리베이터·셀프 계산대·외시경·가격 택 등 진행 상태 한 줄 */
  private updateStatus(s: GameSession): void {
    const m = s.mode;
    let text = '';
    if (m.kind === 'elevator') text = m.phase === 'waiting' ? this.tx('elevator.waiting') : m.phase === 'closing' ? this.tx('elevator.ride') : `▼ ▲  ${m.companion ? '…' : ''}`;
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
          <p class="screen__cta">${escapeHtml(this.tx('screen.dayIntro.hint'))}</p>
          <p class="screen__hint">${escapeHtml(this.tx('hud.controls'))}</p>
        </div>`;
        break;
      case 'burnout':
        if (ps.burnoutTime < this.cfg.presentation.fx.burnoutFadeSec * 0.8) kind = '';
        else
          html = `<div class="screen__box"><h1 class="screen__title">${escapeHtml(this.tx('result.burnout.title'))}</h1>
            <p class="screen__body">${escapeHtml(this.tx('result.burnout.body'))}</p>
            <p class="screen__cta">${escapeHtml(this.tx('result.retry'))}</p></div>`;
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
        const v = l.money !== undefined ? `${l.money > 0 ? '+' : ''}${l.money.toLocaleString('ko-KR')}원` : `${(l.delta ?? 0) > 0 ? '+' : ''}${l.delta}`;
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
      ${settle ? `<ul class="settle">${settle}</ul>` : ''}
      <ul class="settle">${night}<li><span>${escapeHtml(this.tx('night.nextMax'))}</span> <b class="nextmax"><span style="width:${m.nextMax}%"></span></b></li></ul>
      <p class="screen__comfort">${escapeHtml(comfort)}</p>
      <p class="screen__cta">${escapeHtml(this.tx('night.next'))}</p>
    </div>`;
  }

  private finalHtml(s: GameSession, m: Extract<Mode, { kind: 'final' }>): string {
    const total = mergeReports(m.reports);
    return `<div class="screen__box screen__box--report">
      <h1 class="screen__title">${escapeHtml(this.tx('final.title'))}</h1>
      <p class="screen__body">${escapeHtml(this.tx('final.body'))}</p>
      <table class="report">${this.reportRows(total)}</table>
      <h3>${escapeHtml(this.tx('report.life'))}</h3>
      ${this.lifeBars(s.sim.life.all())}
      <p class="screen__comfort">${escapeHtml(this.tx('report.comfort.2'))}</p>
      <p class="screen__cta">${escapeHtml(this.tx('final.restart'))}</p>
    </div>`;
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
    el('p', 'options__warn', box, this.tx('screen.photosensitive'));
    el('p', 'options__close', box, this.tx('options.close'));
  }
}
