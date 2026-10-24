import type { PresentationConfig, SkillsConfig } from '../core/configSchemas';
import type { GameSession } from '../gameplay/GameSession';
import type { PresentationState } from './PresentationState';
import type { Settings } from './Settings';

/**
 * Web Audio 노드 그래프 (CLAUDE.md 7 오디오). 사운드 파일이 없는 단계라 오실레이터·노이즈로 임시음을 만든다.
 *   worldBus → lowpass(이어폰) → master : 웅성거림, 발소리, 환경음
 *   innerBus → master                  : 심박, 혈류, 이명, 두통 (몸 안의 소리라 이어폰 영향 없음)
 *   alertBus → master                  : 전화 벨·진동 (점프 스케어처럼 크게), 노크, 초인종
 *   musicBus → master                  : 안전지대 음악 (도어락 "철컥" 후 크로스페이드)
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private worldBus!: GainNode;
  private worldFilter!: BiquadFilterNode;
  private innerBus!: GainNode;
  private alertBus!: GainNode;
  private musicBus!: GainNode;
  private murmurGain!: GainNode;
  private trafficGain!: GainNode;
  private tinnitusGain!: GainNode;
  private whineGain!: GainNode;
  private bloodGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private nextBeat = 0;
  private bpm = 60;
  private nextRing = 0;
  private nextChord = 0;
  private chordIndex = 0;
  private footTimer = 0;
  onBeat: (() => void) | null = null;

  constructor(
    private readonly cfg: PresentationConfig['audio'],
    private readonly earphoneCfg: SkillsConfig['earphones'],
  ) {}

  /** 브라우저 정책상 사용자 입력 후에만 시작할 수 있다 */
  resume(): void {
    if (!this.ctx) this.build();
    void this.ctx!.resume();
  }

  private build(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.cfg.masterVolume;
    this.master.connect(ctx.destination);
    this.worldFilter = ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = 20000;
    this.worldFilter.connect(this.master);
    this.worldBus = ctx.createGain();
    this.worldBus.connect(this.worldFilter);
    this.innerBus = ctx.createGain();
    this.innerBus.connect(this.master);
    this.alertBus = ctx.createGain();
    this.alertBus.gain.value = this.cfg.ringGain;
    this.alertBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    const length = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.15;
    }
    this.murmurGain = this.loopNoise('bandpass', 650, 0.9, this.worldBus);
    this.trafficGain = this.loopNoise('lowpass', 220, 0.7, this.worldBus);
    this.bloodGain = this.loopNoise('lowpass', 120, 1, this.innerBus);
    this.tinnitusGain = this.tone(this.cfg.tinnitusHz, this.innerBus);
    this.whineGain = this.tone(3200, this.innerBus);
    this.nextBeat = ctx.currentTime + 0.2;
  }

  private loopNoise(type: BiquadFilterType, freq: number, q: number, out: AudioNode): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(out);
    src.start();
    return g;
  }

  private tone(freq: number, out: AudioNode): GainNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(out);
    o.start();
    return g;
  }

  update(s: GameSession, ps: PresentationState, st: Settings): void {
    const c = this.cfg;
    this.bpm = c.heartbeatMinBpm + (c.heartbeatMaxBpm - c.heartbeatMinBpm) * Math.min(1, ps.stress * 0.7 + ps.critical * 0.5 + ps.danger * 0.2);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const muted = s.mode.kind === 'night' || s.mode.kind === 'final' || s.mode.kind === 'dayIntro';
    this.master.gain.setTargetAtTime(st.master, now, 0.1);

    // 이어폰: 바깥 소리 로우패스 + 감쇠
    this.worldFilter.frequency.setTargetAtTime(s.player.earphones ? this.earphoneCfg.lowpassHz : 20000, now, 0.08);
    const outside = muted || ps.burnoutTime >= 0 ? 0 : (s.player.earphones ? 0.55 : 1) * (1 - ps.sanctuary * 0.85);
    this.worldBus.gain.setTargetAtTime(outside, now, muted ? 0.6 : 0.12);

    // 웅성거림: 주변 사람 수 + 지친 정도. 목소리처럼 출렁인다
    const p = s.player.pos;
    const people = s.crowd.countNear(p, 5) + s.activeNpcs().filter((n) => Math.hypot(n.pos.x - p.x, n.pos.y - p.y) < 7 && n.type !== 'pet').length;
    const zone = s.area?.stimulus ? Math.min(1, s.area.stimulus.intensity) : 0;
    const wobble = 0.75 + 0.25 * Math.sin(ps.time * 2.3) * Math.sin(ps.time * 0.9 + 1);
    const murmur = (Math.min(1.5, people * 0.12 + zone * 0.5) * c.murmurGain + ps.tired * c.murmurTiredBonus) * wobble;
    this.murmurGain.gain.setTargetAtTime(murmur, now, 0.2);
    this.trafficGain.gain.setTargetAtTime(s.area?.kind === 'outdoor' ? 0.25 : 0.04, now, 0.5);

    // 몸 안의 소리
    const inner = ps.burnoutTime >= 0 ? 0.4 : 1;
    this.tinnitusGain.gain.setTargetAtTime(ps.critical * ps.critical * c.tinnitusGain * st.tinnitus * inner, now, 0.3);
    this.whineGain.gain.setTargetAtTime(ps.migraine * c.migraineWhineGain * st.tinnitus, now, 0.4);
    const bloodPulse = 0.6 + 0.4 * Math.sin(ps.time * (this.bpm / 60) * Math.PI * 2);
    this.bloodGain.gain.setTargetAtTime(ps.flush * c.bloodGain * bloodPulse, now, 0.05);

    // 심박
    const beatGain = c.heartbeatGain * st.heartbeat * Math.min(1, ps.stress * 0.8 + ps.critical * 0.7 + ps.danger * 0.25) * (1 - ps.sanctuary * 0.8);
    while (this.nextBeat < now + 0.15) {
      if (beatGain > 0.03 && !muted) {
        this.thump(this.nextBeat, beatGain);
        this.thump(this.nextBeat + 0.2, beatGain * 0.6);
        const delay = Math.max(0, (this.nextBeat - now) * 1000);
        setTimeout(() => this.onBeat?.(), delay);
      }
      this.nextBeat += 60 / this.bpm;
    }
    if (this.nextBeat < now) this.nextBeat = now + 0.05;

    // 전화 벨 (울리는 동안 반복, 크게)
    if (s.phone.ringing && now >= this.nextRing) {
      this.nextRing = now + 2.2;
      this.ring(now);
      this.buzz(now, 0.8);
    }
    for (const id of ps.ambushes) {
      if (id === 'textMessage' || id === 'workPing') this.ping(now);
      else if (id === 'shoulderTap' || id === 'bump' || id === 'personalSpace') this.thud(now);
    }
    for (const e of ps.sounds) this.sfx(e.id, now, e.note);

    // 안전지대 음악: 2초 크로스페이드
    this.musicBus.gain.setTargetAtTime(ps.sanctuary * c.sanctuaryMusicGain, now, c.crossfadeSec / 3);
    if (ps.sanctuary > 0.05 && now >= this.nextChord) this.chord(now);

    // 내 발소리 (이어폰이면 작게)
    this.footTimer -= 1 / 60;
    if (s.player.moving && this.footTimer <= 0 && !muted) {
      this.footTimer = s.player.running ? 0.28 : 0.42;
      this.step(now, c.footstepGain * (s.player.earphones ? 0.3 : 1) * 0.4);
    }
  }

  private env(at: number, peak: number, attack: number, decay: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return g;
  }

  private osc(type: OscillatorType, freq: number, at: number, dur: number, gain: GainNode, out: AudioNode): OscillatorNode {
    const o = this.ctx!.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.connect(gain).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  private thump(at: number, gain: number): void {
    const o = this.osc('sine', 70, at, 0.2, this.env(at, gain, 0.015, 0.17), this.innerBus);
    o.frequency.exponentialRampToValueAtTime(38, at + 0.14);
  }

  private ring(at: number): void {
    for (let i = 0; i < 8; i++) {
      const t = at + i * 0.09;
      this.osc('square', i % 2 === 0 ? 1320 : 990, t, 0.08, this.env(t, 0.45, 0.005, 0.07), this.alertBus);
    }
  }

  private buzz(at: number, dur: number): void {
    const g = this.env(at, 0.5, 0.01, dur);
    this.osc('sawtooth', 160, at, dur, g, this.alertBus);
  }

  private ping(at: number): void {
    this.osc('sine', 1568, at, 0.12, this.env(at, 0.35, 0.005, 0.1), this.alertBus);
    this.osc('sine', 2093, at + 0.1, 0.15, this.env(at + 0.1, 0.3, 0.005, 0.13), this.alertBus);
  }

  private thud(at: number): void {
    const o = this.osc('triangle', 180, at, 0.15, this.env(at, 0.5, 0.005, 0.12), this.alertBus);
    o.frequency.exponentialRampToValueAtTime(60, at + 0.12);
  }

  private step(at: number, gain: number): void {
    if (gain <= 0.001) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 300;
    src.connect(f).connect(this.env(at, gain, 0.005, 0.07)).connect(this.worldBus);
    src.start(at, Math.random() * 1.5, 0.1);
  }

  private chord(at: number): void {
    // 느린 따뜻한 화음 (Cmaj7 → Am7 → Fmaj7 → G6)
    const chords = [
      [261.6, 329.6, 392, 493.9],
      [220, 261.6, 329.6, 392],
      [174.6, 220, 261.6, 329.6],
      [196, 246.9, 293.7, 329.6],
    ];
    const notes = chords[this.chordIndex++ % chords.length]!;
    for (const [i, f] of notes.entries()) {
      const g = this.env(at + i * 0.08, 0.18, 0.6, 3.2);
      this.osc('sine', f, at + i * 0.08, 4, g, this.musicBus);
    }
    this.nextChord = at + 3.6;
  }

  private sfx(id: string, at: number, note?: number): void {
    switch (id) {
      case 'doorLock':
        // 철컥
        this.thud(at);
        this.osc('square', 2400, at + 0.05, 0.03, this.env(at + 0.05, 0.25, 0.002, 0.03), this.alertBus);
        this.osc('square', 1800, at + 0.12, 0.03, this.env(at + 0.12, 0.25, 0.002, 0.03), this.alertBus);
        break;
      case 'doorUnlock':
        this.osc('square', 1600, at, 0.03, this.env(at, 0.2, 0.002, 0.03), this.alertBus);
        break;
      case 'knock':
        for (let i = 0; i < 3; i++) this.thud(at + i * 0.18);
        break;
      case 'doorbell':
        this.osc('sine', 659, at, 0.5, this.env(at, 0.5, 0.01, 0.6), this.alertBus);
        this.osc('sine', 523, at + 0.5, 0.8, this.env(at + 0.5, 0.5, 0.01, 0.9), this.alertBus);
        break;
      case 'elevatorDing':
        this.osc('sine', 1046, at, 0.6, this.env(at, 0.3, 0.005, 0.8), this.alertBus);
        break;
      case 'piano': {
        const scale = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9];
        const n = note ?? 0;
        const f = (scale[Math.floor(n)] ?? 261.6) * (n % 1 ? 1.06 : 1);
        this.osc('triangle', f, at, 1.2, this.env(at, 0.35, 0.005, 1.1), this.master);
        this.osc('sine', f * 2, at, 0.8, this.env(at, 0.08, 0.005, 0.7), this.master);
        break;
      }
      case 'chime':
        [784, 988, 1175].forEach((f, i) => this.osc('sine', f, at + i * 0.12, 0.8, this.env(at + i * 0.12, 0.2, 0.01, 0.8), this.master));
        break;
      case 'sigh': {
        const ctx = this.ctx!;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(900, at);
        f.frequency.exponentialRampToValueAtTime(250, at + 0.9);
        src.connect(f).connect(this.env(at, 0.5, 0.15, 0.8)).connect(this.innerBus);
        src.start(at, 0, 1.1);
        break;
      }
      case 'laugh':
        for (let i = 0; i < 6; i++) this.osc('sawtooth', 220 + Math.random() * 180, at + i * 0.11, 0.09, this.env(at + i * 0.11, 0.12, 0.01, 0.08), this.worldBus);
        break;
      case 'sizzle': {
        const ctx = this.ctx!;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 3000;
        src.connect(f).connect(this.env(at, 0.25, 0.02, 0.5)).connect(this.worldBus);
        src.start(at, Math.random(), 0.6);
        break;
      }
      case 'beep':
        this.osc('square', 1900, at, 0.06, this.env(at, 0.12, 0.003, 0.05), this.worldBus);
        break;
      case 'vibrate':
        this.buzz(at, 0.35);
        break;
      case 'fakeCall':
        this.ring(at);
        break;
      case 'stairs':
        for (let i = 0; i < 6; i++) this.step(at + i * 0.3, 0.35);
        break;
      default:
        break;
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
