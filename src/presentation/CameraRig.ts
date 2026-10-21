import * as THREE from 'three';
import type { PresentationConfig } from '../core/configSchemas';
import type { PresentationState } from './PresentationState';

export interface CameraPose {
  eye: THREE.Vector3;
  yaw: number;
  pitch: number;
  /** 수평 이동 속도 (머리 흔들림) */
  speed: number;
}

/**
 * 플레이어 시점에 연출을 더해 카메라에 적용한다.
 * Danger 이하 FOV 확장, 기습형 자극 셰이크, 걸음 머리 흔들림, 번아웃 시 주저앉기.
 */
export class CameraRig {
  private bobPhase = 0;

  constructor(
    private readonly cfg: PresentationConfig['camera'],
    private readonly baseFov: number,
  ) {}

  apply(camera: THREE.PerspectiveCamera, pose: CameraPose, state: PresentationState, dt: number, shakeEnabled = true): void {
    const c = this.cfg;
    const pos = pose.eye.clone();
    let pitch = pose.pitch;
    let roll = 0;

    // 걸음 흔들림
    const moving = Math.min(1, pose.speed / 2.5);
    this.bobPhase += dt * c.headBobFrequency * Math.PI * 2 * (0.6 + 0.4 * moving);
    pos.y += Math.sin(this.bobPhase * 2) * c.headBobAmplitude * moving;

    // 기습 셰이크 (trauma² 비례, 결정적 노이즈)
    if (shakeEnabled && state.trauma > 0) {
      const s = state.trauma * state.trauma;
      const t = state.time * c.shakeFrequency;
      const right = new THREE.Vector3(Math.cos(pose.yaw), 0, -Math.sin(pose.yaw));
      pos.addScaledVector(right, noise(t, 1) * c.shakeAmplitude * s);
      pos.y += noise(t, 2) * c.shakeAmplitude * s;
      roll += THREE.MathUtils.degToRad(c.shakeRollDeg) * noise(t, 3) * s;
    }

    // 번아웃: 천천히 주저앉으며 옆으로 기울고 시선이 바닥으로
    if (state.burnoutTime >= 0) {
      const k = easeInOut(Math.min(1, state.burnoutTime / c.burnoutSinkSec));
      pos.y -= c.burnoutSinkHeight * k;
      roll += THREE.MathUtils.degToRad(c.burnoutRollDeg) * k;
      pitch = THREE.MathUtils.lerp(pitch, -0.6, k);
    }

    camera.position.copy(pos);
    camera.rotation.set(pitch, pose.yaw, roll, 'YXZ');
    const fov = this.baseFov + c.dangerFovExtraDeg * state.danger;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}

function noise(t: number, seed: number): number {
  return Math.sin(t * 1.0 + seed * 12.9898) * 0.6 + Math.sin(t * 2.37 + seed * 78.233) * 0.4;
}

function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}
