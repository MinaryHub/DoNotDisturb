import * as THREE from 'three';
import type { NpcProfile } from '../core/configSchemas';

export interface PerceptionInput {
  npcEye: THREE.Vector3;
  /** NPC 머리가 향한 방향 (수평, 정규화) */
  npcForward: THREE.Vector3;
  playerEye: THREE.Vector3;
  /** 플레이어 시선 방향 (정규화) */
  playerForward: THREE.Vector3;
  playerSpeed: number;
  eyeContactBlocked: boolean;
}

export interface PerceptionResult {
  distance: number;
  sees: boolean;
  hears: boolean;
  /** NPC가 플레이어를 보고 있고, 플레이어도 NPC 얼굴을 보고 있음 */
  eyeContact: boolean;
}

/** 시선 차단 판정: from→to 사이에 COL_/LOS_가 없으면 true */
export type LineOfSight = (from: THREE.Vector3, to: THREE.Vector3) => boolean;

const _toPlayer = new THREE.Vector3();
const _toNpc = new THREE.Vector3();

/** NPC 지각: 시야 콘(각도·거리) + 시선 차단, 청각 반경, 눈 맞춤 */
export function perceive(input: PerceptionInput, profile: NpcProfile, los: LineOfSight): PerceptionResult {
  _toPlayer.subVectors(input.playerEye, input.npcEye);
  const distance = _toPlayer.length();
  const result: PerceptionResult = { distance, sees: false, hears: false, eyeContact: false };
  if (distance < 1e-4) return { ...result, sees: true, hears: true };

  const flat = _toPlayer.clone().setY(0).normalize();
  const angle = THREE.MathUtils.radToDeg(flat.angleTo(input.npcForward));
  const inCone = distance <= profile.viewDistance && angle <= profile.viewHalfAngleDeg;
  const clear = inCone || distance <= profile.hearingRadius ? los(input.npcEye, input.playerEye) : false;

  result.sees = inCone && clear;
  // 움직이는 발소리는 시야 밖(등 뒤)에서도 들린다. 벽 너머는 들리지 않는 것으로 단순화
  result.hears = clear && input.playerSpeed > 0.3 && distance <= profile.hearingRadius;

  if (result.sees && !input.eyeContactBlocked) {
    _toNpc.copy(_toPlayer).negate().normalize();
    const playerLookAngle = THREE.MathUtils.radToDeg(_toNpc.angleTo(input.playerForward));
    result.eyeContact = playerLookAngle <= profile.eyeContactAngleDeg;
  }
  return result;
}
