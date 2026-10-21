import * as THREE from 'three';
import type { SkillsConfig } from '../core/configSchemas';
import { NO_MODIFIERS, type ChannelModifiers } from '../sim/EnergyModel';

/**
 * 회피 스킬 상태 (CLAUDE.md 5.5): 노이즈 캔슬링 이어폰(토글), 스마트폰 보는 척(홀드).
 * 상태만 들고 있고, 효과는 다른 시스템이 아래 getter로 읽는다.
 */
export class Skills {
  earphones = false;
  phonePretend = false;

  constructor(private readonly cfg: SkillsConfig) {}

  toggleEarphones(): void {
    this.earphones = !this.earphones;
  }

  /** 자극 채널 감쇠 */
  get modifiers(): ChannelModifiers {
    return { ...NO_MODIFIERS, auditory: this.earphones ? this.cfg.earphones.auditoryMultiplier : 1 };
  }

  /** NPC와 눈이 마주칠 수 있는지 */
  get eyeContactBlocked(): boolean {
    return this.phonePretend && this.cfg.phonePretend.blocksEyeContact;
  }

  get moveMultiplier(): number {
    return this.phonePretend ? this.cfg.phonePretend.moveMultiplier : 1;
  }

  /** 폰을 보는 동안 시선 고정 각도 (라디안), 아니면 null */
  get pitchLock(): number | null {
    return this.phonePretend ? THREE.MathUtils.degToRad(this.cfg.phonePretend.pitchDeg) : null;
  }

  get pitchLerpPerSec(): number {
    return this.cfg.phonePretend.pitchLerpPerSec;
  }

  reset(): void {
    this.earphones = false;
    this.phonePretend = false;
  }
}
