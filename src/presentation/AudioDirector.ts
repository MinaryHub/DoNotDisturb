import type { PresentationConfig, SkillsConfig } from '../core/configSchemas';
import type { GameSession } from '../gameplay/GameSession';
import type { PresentationState } from './PresentationState';
import type { Settings } from './Settings';

/**
 * Web Audio 노드 그래프 (CLAUDE.md 7 오디오). 사운드 파일이 없는 단계라 오실레이터·노이즈로 임시음을 만든다.
 *   worldBus → lowpass(이어폰) → master : 웅성거림, 발소리, 환경음, 새소리·풀벌레
 *   innerBus → master                  : 심박, 혈류, 이명, 두통 (몸 안의 소리라 이어폰 영향 없음)
 *   alertBus → master                  : 전화 벨·진동 (점프 스케어처럼 크게), 노크, 초인종
 *   musicBus → master                  : 안전지대 음악 (도어락 "철컥" 후 크로스페이드) + 오르골 선율
 *   padBus   → master                  : 마음이 고요할 때만 들리는 배경 화음 (긴장이 오르면 소음에 묻혀 사라진다)
 *   master → 높은 소리 깎기(warmth) → 부드러운 압축 → 출력, 그리고 world·music·pad·alert 일부가 리버브(공간감)로
 * 부드러운 감성 (2026-11-20): 날카로운 사각파 대신 사인·삼각파와 필터, 공간의 울림. 연출의 역할(벨은 놀라게, 심박은 긴장을 따라)은 그대로
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private worldBus!: GainNode;
  private worldFilter!: BiquadFilterNode;
  private innerBus!: GainNode;
  private alertBus!: GainNode;
  private musicBus!: GainNode;
  private padBus!: GainNode;
  /** 건반·차임: 그대로 크게, 울림을 넉넉히 */
  private keysBus!: GainNode;
  private reverbIn!: GainNode;
  private murmurGain!: GainNode;
  private trafficGain!: GainNode;
  private rainGain!: GainNode;
  private tinnitusGain!: GainNode;
  private whineGain!: GainNode;
  private bloodGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private nextBeat = 0;
  private bpm = 60;
  private nextRing = 0;
  private nextChord = 0;
  private chordIndex = 0;
  private nextMelody = 0;
  private nextPad = 0;
  private padIndex = 0;
  private nextBird = 0;
  private nextCricket = 0;
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
    const soft = this.cfg.soft;
    // 출력: 높은 소리를 살짝 깎고(warmth) 부드럽게 눌러(압축) 귀에 닿는 모서리를 둥글게
    const warmth = ctx.createBiquadFilter();
    warmth.type = 'highshelf';
    warmth.frequency.value = soft.warmthHz;
    warmth.gain.value = soft.warmthDb;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    warmth.connect(comp).connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.cfg.masterVolume;
    this.master.connect(warmth);

    // 공간의 울림 (리버브): 합성한 잔향
    const convolver = ctx.createConvolver();
    convolver.buffer = this.impulse(soft.reverbSec);
    const wet = ctx.createGain();
    wet.gain.value = soft.reverbWet;
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(convolver).connect(wet).connect(this.master);

    this.worldFilter = ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = 20000;
    this.worldFilter.connect(this.master);
    this.worldBus = ctx.createGain();
    this.worldBus.connect(this.worldFilter);
    this.send(this.worldFilter, 0.6);
    this.innerBus = ctx.createGain();
    this.innerBus.connect(this.master);
    this.alertBus = ctx.createGain();
    this.alertBus.gain.value = this.cfg.ringGain;
    this.alertBus.connect(this.master);
    this.send(this.alertBus, 0.35);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);
    this.send(this.musicBus, 1);
    this.keysBus = ctx.createGain();
    this.keysBus.connect(this.master);
    this.send(this.keysBus, 0.8);
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 0;
    const padTone = ctx.createBiquadFilter();
    padTone.type = 'lowpass';
    padTone.frequency.value = 1400;
    this.padBus.connect(padTone).connect(this.master);
    this.send(padTone, 1);

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
    this.murmurGain = this.loopNoise('bandpass', 560, 0.8, this.worldBus);
    this.trafficGain = this.loopNoise('lowpass', 200, 0.7, this.worldBus);
    // 빗소리: 쏴아 하는 높은 소리 대신 둥근 빗소리
    this.rainGain = this.loopNoise('bandpass', 1100, 0.35, this.worldBus);
    this.bloodGain = this.loopNoise('lowpass', 120, 1, this.innerBus);
    this.tinnitusGain = this.tone(this.cfg.tinnitusHz, this.innerBus);
    this.whineGain = this.tone(3200, this.innerBus);
    this.nextBeat = ctx.currentTime + 0.2;
  }

  /** 리버브로 보내는 몫 */
  private send(from: AudioNode, amount: number): void {
    const g = this.ctx!.createGain();
    g.gain.value = amount;
    from.connect(g).connect(this.reverbIn);
  }

  /** 합성 잔향: 양쪽 귀에 다른 노이즈가 지수로 사그라든다 (높은 소리가 먼저 사그라들게 살짝 매끄럽게) */
  private impulse(sec: number): AudioBuffer {
    const ctx = this.ctx!;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let smooth = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const k = 0.35 + t * 0.6;
        smooth = smooth * k + (Math.random() * 2 - 1) * (1 - k);
        d[i] = smooth * Math.pow(1 - t, 2.4) * (i < 30 ? i / 30 : 1);
      }
    }
    return buf;
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
    // 심박 속도는 긴장(게이지)을 따른다. 기운이 바닥(Critical)일 때만 조금 더 빨라진다
    this.bpm = c.heartbeatMinBpm + (c.heartbeatMaxBpm - c.heartbeatMinBpm) * Math.min(1, ps.stress * 0.9 + ps.critical * 0.25);
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
    const crowdNear = s.crowd.countNear(p, 5);
    const people = crowdNear + s.activeNpcs().filter((n) => Math.hypot(n.pos.x - p.x, n.pos.y - p.y) < 7 && n.type !== 'pet').length;
    const zone = s.area?.stimulus ? Math.min(1, s.area.stimulus.intensity) : 0;
    const wobble = 0.75 + 0.25 * Math.sin(ps.time * 2.3) * Math.sin(ps.time * 0.9 + 1);
    const murmur = (Math.min(1.5, people * 0.12 + zone * 0.5) * c.murmurGain + ps.tired * c.murmurTiredBonus) * wobble;
    this.murmurGain.gain.setTargetAtTime(murmur, now, 0.2);
    const outdoor = s.area?.kind === 'outdoor';
    this.trafficGain.gain.setTargetAtTime(outdoor ? 0.22 : 0.04, now, 0.5);
    // 빗소리: 바깥이면 크게, 실내에선 창밖으로 작게
    this.rainGain.gain.setTargetAtTime(s.raining ? c.rainGain * (outdoor ? 1 : 0.25) : 0, now, 0.8);

    // 몸 안의 소리
    const inner = ps.burnoutTime >= 0 ? 0.4 : 1;
    this.tinnitusGain.gain.setTargetAtTime(ps.critical * ps.critical * c.tinnitusGain * st.tinnitus * inner, now, 0.3);
    this.whineGain.gain.setTargetAtTime(ps.migraine * c.migraineWhineGain * st.tinnitus, now, 0.4);
    const bloodPulse = 0.6 + 0.4 * Math.sin(ps.time * (this.bpm / 60) * Math.PI * 2);
    this.bloodGain.gain.setTargetAtTime(ps.flush * c.bloodGain * bloodPulse, now, 0.05);

    // 심박
    const beatGain = c.heartbeatGain * st.heartbeat * Math.min(1, ps.stress * 0.8 + ps.critical * 0.6) * (1 - ps.sanctuary * 0.8);
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
      else if (id === 'shoulderTap' || id === 'personalSpace') this.thud(now);
    }
    for (const e of ps.sounds) this.sfx(e.id, now, e.note);

    // 안전지대 음악: 2초 크로스페이드, 화음 위로 오르골 선율
    this.musicBus.gain.setTargetAtTime(ps.sanctuary * c.sanctuaryMusicGain, now, c.crossfadeSec / 3);
    if (ps.sanctuary > 0.05 && now >= this.nextChord) this.chord(now);
    if (ps.sanctuary > 0.3 && now >= this.nextMelody) this.melody(now);

    // 마음의 배경 화음: 고요할수록 들리고, 긴장·지침이 오르면 소음에 묻혀 사라진다 (집에서는 안전지대 음악이 대신)
    const calm = muted ? 0 : Math.max(0, 1 - ps.stress * 1.6) * (1 - ps.danger) * (1 - ps.critical) * (1 - ps.sanctuary) * (ps.burnoutTime >= 0 ? 0 : 1);
    this.padBus.gain.setTargetAtTime(calm * c.soft.padGain, now, 1.2);
    if (calm > 0.05 && now >= this.nextPad) this.pad(now, s.clock.minutes);

    // 바깥의 작은 생명: 낮엔 새소리, 밤엔 풀벌레 (사람이 적을 때만 들린다)
    const minutes = s.clock.minutes;
    const quietOut = outdoor && !muted && !s.raining && crowdNear < 3;
    if (quietOut && minutes > 6 * 60 && minutes < 18 * 60 + 30 && now >= this.nextBird) {
      this.bird(now, c.soft.birdsGain * (0.6 + 0.4 * calm));
      this.nextBird = now + 2.5 + Math.random() * 5;
    }
    if (quietOut && (minutes >= 19 * 60 + 30 || minutes < 5 * 60) && now >= this.nextCricket) {
      this.cricket(now, c.soft.cricketsGain);
      this.nextCricket = now + 0.9 + Math.random() * 1.4;
    }

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

  /** 둥글게 깎은 소리: 오실레이터 → 로우패스 → 엔벨로프 */
  private softOsc(type: OscillatorType, freq: number, at: number, dur: number, gain: GainNode, out: AudioNode, cutoff: number): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    o.connect(f).connect(gain).connect(out);
    o.start(at);
    o.stop(at + dur + 0.05);
    return o;
  }

  private thump(at: number, gain: number): void {
    // 둥근 심박: 낮고 짧게 (부드럽지만 또렷이)
    const o = this.softOsc('sine', 64, at, 0.22, this.env(at, gain, 0.02, 0.18), this.innerBus, 220);
    o.frequency.exponentialRampToValueAtTime(36, at + 0.16);
  }

  private ring(at: number): void {
    // 벨: 여전히 크고 갑작스럽지만(놀람은 연출의 몫) 날카로운 사각파 대신 둥근 삼각파
    for (let i = 0; i < 8; i++) {
      const t = at + i * 0.09;
      this.softOsc('triangle', i % 2 === 0 ? 1320 : 990, t, 0.08, this.env(t, 0.5, 0.004, 0.07), this.alertBus, 5200);
    }
  }

  private buzz(at: number, dur: number): void {
    const g = this.env(at, 0.45, 0.01, dur);
    this.softOsc('sawtooth', 150, at, dur, g, this.alertBus, 900);
  }

  private ping(at: number): void {
    // 메시지: 맑은 두 음 (실로폰처럼)
    this.osc('sine', 1568, at, 0.25, this.env(at, 0.3, 0.004, 0.22), this.alertBus);
    this.osc('sine', 2093, at + 0.11, 0.35, this.env(at + 0.11, 0.26, 0.004, 0.3), this.alertBus);
  }

  private thud(at: number): void {
    const o = this.softOsc('triangle', 170, at, 0.16, this.env(at, 0.45, 0.006, 0.13), this.alertBus, 700);
    o.frequency.exponentialRampToValueAtTime(60, at + 0.12);
  }

  private step(at: number, gain: number): void {
    if (gain <= 0.001) return;
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 200 + Math.random() * 90;
    f.Q.value = 1.4;
    src.connect(f).connect(this.env(at, gain, 0.008, 0.06)).connect(this.worldBus);
    src.start(at, Math.random() * 1.5, 0.1);
  }

  private chord(at: number): void {
    // 느린 따뜻한 화음 (Cmaj7 → Am7 → Fmaj7 → G6). 살짝 어긋난 두 겹이라 숨 쉬듯 일렁인다
    const chords = [
      [261.6, 329.6, 392, 493.9],
      [220, 261.6, 329.6, 392],
      [174.6, 220, 261.6, 329.6],
      [196, 246.9, 293.7, 329.6],
    ];
    const notes = chords[this.chordIndex++ % chords.length]!;
    for (const [i, f] of notes.entries()) {
      const t = at + i * 0.08;
      this.osc('sine', f, t, 4, this.env(t, 0.14, 0.8, 3.2), this.musicBus);
      this.softOsc('triangle', f * 1.003, t, 4, this.env(t, 0.06, 1.0, 3.0), this.musicBus, 1800);
    }
    this.nextChord = at + 3.6;
  }

  /** 집의 오르골: 지금 화음에 맞는 음을 드문드문 */
  private melody(at: number): void {
    const scale = [523.3, 587.3, 659.3, 784, 880, 1046.5];
    const f = scale[Math.floor(Math.random() * scale.length)]!;
    const g = this.cfg.soft.melodyGain;
    this.osc('sine', f, at, 1.6, this.env(at, g, 0.004, 1.5), this.musicBus);
    this.osc('sine', f * 3, at, 0.6, this.env(at, g * 0.18, 0.003, 0.5), this.musicBus);
    this.nextMelody = at + 0.6 + Math.random() * 1.4;
  }

  /** 마음의 배경 화음: 긴 숨처럼 차오르고 사그라든다. 저녁에는 한 음 낮게 */
  private pad(at: number, minutes: number): void {
    const voicings = [
      [146.8, 220, 277.2, 329.6],
      [123.5, 185, 246.9, 293.7],
      [130.8, 196, 246.9, 329.6],
      [110, 164.8, 220, 277.2],
    ];
    const shift = minutes >= 17 * 60 || minutes < 6 * 60 ? 0.89 : 1;
    const notes = voicings[this.padIndex++ % voicings.length]!;
    for (const f of notes) {
      this.osc('sine', f * shift, at, 7, this.env(at, 0.22, 2.5, 4.5), this.padBus);
      this.osc('triangle', f * shift * 1.004, at, 7, this.env(at, 0.08, 3, 4), this.padBus);
    }
    this.nextPad = at + 6.5;
  }

  /** 새소리: 짧게 올라가는 휘파람 두세 번 */
  private bird(at: number, gain: number): void {
    const base = 2600 + Math.random() * 1400;
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const t = at + i * (0.12 + Math.random() * 0.06);
      const o = this.osc('sine', base, t, 0.1, this.env(t, gain, 0.01, 0.08), this.worldBus);
      o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.2), t + 0.08);
    }
  }

  /** 풀벌레: 아주 작은 떨림 세 번 */
  private cricket(at: number, gain: number): void {
    for (let i = 0; i < 3; i++) {
      const t = at + i * 0.07;
      this.softOsc('sine', 4300, t, 0.05, this.env(t, gain, 0.004, 0.04), this.worldBus, 6000);
    }
  }

  private sfx(id: string, at: number, note?: number): void {
    switch (id) {
      case 'doorLock':
        // 철컥 (둥글게)
        this.thud(at);
        this.softOsc('triangle', 2200, at + 0.05, 0.04, this.env(at + 0.05, 0.22, 0.002, 0.04), this.alertBus, 3500);
        this.softOsc('triangle', 1650, at + 0.12, 0.04, this.env(at + 0.12, 0.22, 0.002, 0.04), this.alertBus, 3500);
        break;
      case 'doorUnlock':
        this.softOsc('triangle', 1500, at, 0.04, this.env(at, 0.18, 0.002, 0.04), this.alertBus, 3500);
        break;
      case 'knock':
        for (let i = 0; i < 3; i++) this.thud(at + i * 0.18);
        break;
      case 'doorbell':
        this.osc('sine', 659, at, 0.7, this.env(at, 0.45, 0.01, 0.7), this.alertBus);
        this.osc('sine', 523, at + 0.5, 1.0, this.env(at + 0.5, 0.45, 0.01, 1.0), this.alertBus);
        break;
      case 'elevatorDing':
        this.osc('sine', 1046, at, 0.9, this.env(at, 0.26, 0.005, 1.0), this.alertBus);
        break;
      case 'piano': {
        const scale = [261.6, 293.7, 329.6, 349.2, 392, 440, 493.9];
        const n = note ?? 0;
        const f = (scale[Math.floor(n)] ?? 261.6) * (n % 1 ? 1.06 : 1);
        this.softOsc('triangle', f, at, 1.6, this.env(at, 0.33, 0.006, 1.5), this.keysBus, 2600);
        this.osc('sine', f * 2, at, 1.0, this.env(at, 0.07, 0.005, 0.9), this.keysBus);
        break;
      }
      case 'chime':
        [784, 988, 1175].forEach((f, i) => this.osc('sine', f, at + i * 0.12, 1.0, this.env(at + i * 0.12, 0.18, 0.01, 1.0), this.keysBus));
        break;
      case 'sigh': {
        const ctx = this.ctx!;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(800, at);
        f.frequency.exponentialRampToValueAtTime(220, at + 1.0);
        src.connect(f).connect(this.env(at, 0.45, 0.2, 0.9)).connect(this.innerBus);
        src.start(at, 0, 1.2);
        break;
      }
      case 'laugh':
        for (let i = 0; i < 6; i++) this.softOsc('triangle', 220 + Math.random() * 160, at + i * 0.11, 0.09, this.env(at + i * 0.11, 0.12, 0.012, 0.08), this.worldBus, 1200);
        break;
      case 'sizzle': {
        const ctx = this.ctx!;
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2600;
        f.Q.value = 0.6;
        src.connect(f).connect(this.env(at, 0.2, 0.03, 0.5)).connect(this.worldBus);
        src.start(at, Math.random(), 0.6);
        break;
      }
      case 'beep':
        this.softOsc('triangle', 1800, at, 0.07, this.env(at, 0.11, 0.004, 0.06), this.worldBus, 3000);
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
