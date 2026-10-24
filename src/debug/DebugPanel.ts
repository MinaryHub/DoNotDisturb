import GUI from 'lil-gui';
import Stats from 'stats.js';
import { formatTime } from '../sim/DayCycle';
import type { GameSession } from '../gameplay/GameSession';

// 개발용 디버그 패널 (F1). 배터리·스트레스 등 수치는 여기서만 보인다 (CLAUDE.md 2-2).

export interface DebugActions {
  getSession(): GameSession;
  jumpToDay(index: number): void;
  teleportToMarker(): void;
}

export class DebugPanel {
  readonly gui = new GUI({ title: '디버그 (F1)' });
  private readonly stats = new Stats();
  private readonly info = {
    battery: 0,
    max: 0,
    stress: 0,
    tier: '',
    flush: 0,
    migraine: 0,
    sweat: 0,
    stutter: 0,
    income: 0,
    housing: 0,
    essentials: 0,
    bond: 0,
    money: 0,
    clock: '',
    mode: '',
    area: '',
    gazes: 0,
    pos: '',
  };

  constructor(actions: DebugActions, dayCount: number) {
    this.stats.showPanel(0);
    this.stats.dom.style.cssText = 'position:fixed;left:0;bottom:0;z-index:40;';
    document.body.appendChild(this.stats.dom);
    const f = this.gui.addFolder('상태');
    f.add(this.info, 'battery', 0, 100).name('배터리').disable().listen();
    f.add(this.info, 'max', 0, 100).name('오늘 상한').disable().listen();
    f.add(this.info, 'stress', 0, 100).name('스트레스').disable().listen();
    f.add(this.info, 'tier').name('구간').disable().listen();
    f.add(this.info, 'flush', 0, 1).name('홍조').disable().listen();
    f.add(this.info, 'migraine', 0, 1).name('편두통').disable().listen();
    f.add(this.info, 'sweat', 0, 1).name('진땀').disable().listen();
    f.add(this.info, 'stutter', 0, 1).name('말더듬').disable().listen();
    f.add(this.info, 'gazes').name('나를 보는 시선').disable().listen();
    const l = this.gui.addFolder('생활 지표');
    l.add(this.info, 'income', 0, 100).name('소득').disable().listen();
    l.add(this.info, 'housing', 0, 100).name('주거').disable().listen();
    l.add(this.info, 'essentials', 0, 100).name('생활 필수').disable().listen();
    l.add(this.info, 'bond', 0, 100).name('관계').disable().listen();
    l.add(this.info, 'money').name('돈').disable().listen();
    const w = this.gui.addFolder('월드');
    w.add(this.info, 'clock').name('시각').disable().listen();
    w.add(this.info, 'mode').name('모드').disable().listen();
    w.add(this.info, 'area').name('영역').disable().listen();
    w.add(this.info, 'pos').name('위치').disable().listen();
    const s = () => actions.getSession();
    const tools = {
      battery60: () => s().sim.energy.debugSet({ battery: 60 }),
      battery30: () => s().sim.energy.debugSet({ battery: 30 }),
      battery10: () => s().sim.energy.debugSet({ battery: 10 }),
      stress90: () => s().sim.energy.debugSet({ stress: 90 }),
      flush: () => s().sim.somatic.maxOut('flush'),
      migraine: () => s().sim.somatic.trigger('migraine', 0.8),
      voiceCall: () => s().phone.receiveCall('boss', 'phone.boss.meeting'),
      message: () => s().phone.receiveMessage('teamChat', 'phone.team.morning'),
      plus30: () => s().clock.advance(30, 1),
      teleport: () => actions.teleportToMarker(),
      day: 0,
    };
    const d = this.gui.addFolder('조작');
    d.add(tools, 'battery60').name('배터리 60 (Tired)');
    d.add(tools, 'battery30').name('배터리 30 (Danger)');
    d.add(tools, 'battery10').name('배터리 10 (Critical)');
    d.add(tools, 'stress90').name('스트레스 90');
    d.add(tools, 'flush').name('홍조 1.0');
    d.add(tools, 'migraine').name('편두통');
    d.add(tools, 'voiceCall').name('전화 걸려옴');
    d.add(tools, 'message').name('문자 옴');
    d.add(tools, 'plus30').name('+30분');
    d.add(tools, 'teleport').name('목표 위치로 이동');
    d.add(tools, 'day', 0, dayCount - 1, 1).name('하루로 이동').onFinishChange((v: number) => actions.jumpToDay(v));
    this.gui.close();
    this.toggle();
  }

  update(s: GameSession): void {
    const snap = s.snapshot;
    const life = s.sim.life;
    Object.assign(this.info, {
      battery: +snap.battery.toFixed(1),
      max: +snap.batteryMax.toFixed(0),
      stress: +snap.stress.toFixed(1),
      tier: snap.tier,
      flush: +snap.flush.toFixed(2),
      migraine: +snap.migraine.toFixed(2),
      sweat: +snap.sweat.toFixed(2),
      stutter: +snap.stutter.toFixed(2),
      income: Math.round(life.get('income')),
      housing: Math.round(life.get('housing')),
      essentials: Math.round(life.get('essentials')),
      bond: Math.round(life.get('bond')),
      money: life.money,
      clock: formatTime(s.clock.minutes),
      mode: s.mode.kind,
      area: s.area?.id ?? '-',
      gazes: s.gazeCount(),
      pos: `${s.player.pos.x.toFixed(1)}, ${s.player.pos.y.toFixed(1)}`,
    });
  }

  beginFrame(): void {
    this.stats.begin();
  }

  endFrame(): void {
    this.stats.end();
  }

  toggle(): void {
    const hidden = this.gui._hidden;
    this.gui.show(hidden);
    this.stats.dom.style.display = hidden ? '' : 'none';
  }
}
