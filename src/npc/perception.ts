import type { NpcProfile } from '../core/configSchemas';
import type { TileMap, Vec2 } from '../world/TileMap';

// NPC 지각 (CLAUDE.md 5.9): 시야 콘(각도·거리, 시선 차단 레이캐스트), 청각 반경, 아이컨택.

/** NPC가 지각하는 플레이어 정보 (연출 계층과 무관한 순수 데이터) */
export interface PlayerPercept {
  pos: Vec2;
  /** 바라보는 방향 (라디안, +x = 0, +y = π/2) */
  facing: number;
  moving: boolean;
  /** 발소리 크기 배율 (달리기 > 1) */
  noise: number;
  phonePretend: boolean;
  eyesClosed: boolean;
  hidden: boolean;
  /** 잠근 칸·집·엘리베이터 안 등 NPC가 닿을 수 없는 상태 */
  unreachable: boolean;
}

export interface Perception {
  dist: number;
  inView: boolean;
  heard: boolean;
  eyeContact: boolean;
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function angleTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function perceive(map: TileMap, npcPos: Vec2, npcFacing: number, p: NpcProfile, player: PlayerPercept): Perception {
  const dist = Math.hypot(player.pos.x - npcPos.x, player.pos.y - npcPos.y);
  const viewDist = p.viewDistance * (player.hidden ? 0.45 : 1);
  let inView = false;
  if (dist <= viewDist) {
    const ang = angleDiff(angleTo(npcPos, player.pos), npcFacing);
    inView = ang <= (p.viewHalfAngleDeg * Math.PI) / 180 && map.lineOfSight(npcPos, player.pos);
  }
  const heard = player.moving && dist <= p.hearingRadius * player.noise && !player.hidden;
  // 아이컨택: 서로 마주 보는 상태. 폰 보는 척·눈 감기는 아이컨택 판정을 차단한다
  const eyeContact =
    inView &&
    !player.phonePretend &&
    !player.eyesClosed &&
    angleDiff(angleTo(player.pos, npcPos), player.facing) <= (p.eyeContactAngleDeg * Math.PI) / 180 * 1.8 &&
    angleDiff(angleTo(npcPos, player.pos), npcFacing) <= (p.eyeContactAngleDeg * Math.PI) / 180 * 2.5;
  return { dist, inView, heard, eyeContact };
}
