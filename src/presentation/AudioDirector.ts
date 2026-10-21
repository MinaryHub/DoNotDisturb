import * as THREE from 'three';
import type { PresentationConfig, SkillsConfig } from '../core/configSchemas';
import type { PresentationState } from './PresentationState';

export interface AudioFrame {
  state: PresentationState;
  earphones: boolean;
  /** 플레이어가 있는 소음 구역 강도 합 */
  zoneMurmur: number;
  listener: { position: THREE.Vector3; forward: THREE.Vector3 };
  npcs: readonly { id: string; position: THREE.Vector3; speed: number }[];
  /** 결과 화면 등에서 바깥 소리를 줄임 */
  worldMuted: boolean;
}

/**
 * Web Audio 노드 그래프 (CLAUDE.md 7 오디오). 사운드 파일이 없는 단계라 오실레이터·노이즈로 임시음을 만든다.
 *   worldBus → lowpass(이어폰) → master   : 웅성거림, NPC 발소리
 *   innerBus → master                    : 심박, 이명 (몸 안의 소리라 이어폰 영향 없음)
 *   alertBus → master                    : 전화·문자 (점프 스케어처럼 크게)
 */
export class AudioDirector {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private worldBus!: GainNode;
  private worldFilter!: BiquadFilterNode;
  private innerBus!: GainNode;
  private alertBus!: GainNode;
  private murmurGain!: GainNode;
  private tinnitusGain!: GainNode;
  private noiseBuffer!: AudioBuffer;
  private nextBeat = 0;
  private bpm = 60;
  private readonly footsteps = new Map<string, { panner: PannerNode; timer: number }>();

  constructor(
    private readonly cfg: PresentationConfig['audio'],
    private readonly earphoneCfg: SkillsConfig['earphones'],
  ) {}

  get heartbeatBpm(): number {
    return this.bpm;
  }

  /** 브라우저 정책상 사용자 입력(클릭) 후에만 시작할 수 있다 */
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

    // 2초 분량의 핑크 노이즈 (웅성거림·발소리 재료)
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

    // 웅성거림: 사람 목소리 대역 노이즈
    const murmur = ctx.createBufferSource();
    murmur.buffer = this.noiseBuffer;
    murmur.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 650;
    band.Q.value = 0.9;
    this.murmurGain = ctx.createGain();
    this.murmurGain.gain.value = 0;
    murmur.connect(band).connect(this.murmurGain).connect(this.worldBus);
    murmur.start();

    // 이명
    const tone = ctx.createOscillator();
    tone.frequency.value = this.cfg.tinnitusHz;
    this.tinnitusGain = ctx.createGain();
    this.tinnitusGain.gain.value = 0;
    tone.connect(this.tinnitusGain).connect(this.innerBus);
    tone.start();

    this.nextBeat = ctx.currentTime + 0.2;
  }

  update(dt: number, frame: AudioFrame): void {
    const { state } = frame;
    const c = this.cfg;
    this.bpm = c.heartbeatMinBpm + (c.heartbeatMaxBpm - c.heartbeatMinBpm) * Math.min(1, state.stress * 0.7 + state.critical * 0.5 + state.danger * 0.2);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    // 이어폰: 바깥 소리 로우패스 + 감쇠
    this.worldFilter.frequency.setTargetAtTime(frame.earphones ? this.earphoneCfg.lowpassHz : 20000, now, 0.08);
    this.worldBus.gain.setTargetAtTime(frame.worldMuted ? 0 : frame.earphones ? 0.6 : 1, now, frame.worldMuted ? 0.8 : 0.1);

    // 웅성거림: 구역 + 지친 정도. 목소리처럼 들리게 느리게 출렁임
    const wobble = 0.75 + 0.25 * Math.sin(state.time * 2.3) * Math.sin(state.time * 0.9 + 1);
    const murmurLevel = (frame.zoneMurmur * c.murmurZoneGain + state.tired * c.murmurTiredBonus) * wobble;
    this.murmurGain.gain.setTargetAtTime(murmurLevel, now, 0.15);

    // 이명: Critical에서
    this.tinnitusGain.gain.setTargetAtTime(state.critical * state.critical * c.tinnitusGain, now, 0.3);

    // 심박
    const beatGain = c.heartbeatGain * Math.min(1, state.stress * 0.8 + state.critical * 0.7 + state.danger * 0.25);
    while (this.nextBeat < now + 0.15) {
      if (beatGain > 0.03) {
        this.thump(this.nextBeat, beatGain);
        this.thump(this.nextBeat + 0.2, beatGain * 0.6);
      }
      this.nextBeat += 60 / this.bpm;
    }
    if (this.nextBeat < now) this.nextBeat = now + 0.05;

    for (const id of state.ambushes) this.alert(id, now);

    this.updateListener(frame.listener);
    this.updateFootsteps(dt, frame, now);
  }

  private thump(at: number, gain: number): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(70, at);
    osc.frequency.exponentialRampToValueAtTime(38, at + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    osc.connect(g).connect(this.innerBus);
    osc.start(at);
    osc.stop(at + 0.2);
  }

  /** 기습형 자극음: 전화 벨(길게) / 문자·톡톡(짧게 두 번) */
  private alert(stimulusId: string, at: number): void {
    const ctx = this.ctx!;
    const long = stimulusId === 'voiceCall';
    const beeps = long ? 6 : 2;
    for (let i = 0; i < beeps; i++) {
      const t = at + i * (long ? 0.2 : 0.14);
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = i % 2 === 0 ? 1180 : 880;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
      osc.connect(g).connect(this.alertBus);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  private updateListener(l: AudioFrame['listener']): void {
    const listener = this.ctx!.listener;
    if (listener.positionX) {
      listener.positionX.value = l.position.x;
      listener.positionY.value = l.position.y;
      listener.positionZ.value = l.position.z;
      listener.forwardX.value = l.forward.x;
      listener.forwardY.value = l.forward.y;
      listener.forwardZ.value = l.forward.z;
      listener.upX.value = 0;
      listener.upY.value = 1;
      listener.upZ.value = 0;
    }
  }

  private updateFootsteps(dt: number, frame: AudioFrame, now: number): void {
    const ctx = this.ctx!;
    const gain = this.cfg.footstepGain * (frame.earphones ? this.earphoneCfg.npcFootstepGain : 1);
    for (const npc of frame.npcs) {
      let entry = this.footsteps.get(npc.id);
      if (!entry) {
        const panner = ctx.createPanner();
        panner.panningModel = 'HRTF';
        panner.distanceModel = 'inverse';
        panner.refDistance = 1.5;
        panner.rolloffFactor = 1.2;
        panner.connect(this.worldBus);
        entry = { panner, timer: 0 };
        this.footsteps.set(npc.id, entry);
      }
      entry.panner.positionX.value = npc.position.x;
      entry.panner.positionY.value = npc.position.y + 0.05;
      entry.panner.positionZ.value = npc.position.z;
      if (npc.speed < 0.2 || gain <= 0) continue;
      entry.timer -= dt;
      if (entry.timer <= 0) {
        entry.timer = 0.62 / Math.max(0.6, npc.speed);
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 260 + Math.random() * 80;
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, now);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        src.connect(f).connect(g).connect(entry.panner);
        src.start(now, Math.random() * 1.5, 0.1);
      }
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
    this.footsteps.clear();
  }
}
