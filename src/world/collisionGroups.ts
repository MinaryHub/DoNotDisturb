// Rapier 충돌 그룹. interactionGroups = (소속 << 16) | 필터
// 쿼리(레이캐스트)도 같은 규칙으로 걸러지므로, 시야·상호작용 레이는 SIGHT 소속으로 쏜다.

export const Group = {
  WORLD: 1 << 0,
  LOS: 1 << 1,
  SENSOR: 1 << 2,
  PLAYER: 1 << 3,
  NPC: 1 << 4,
  /** 시야·상호작용 레이캐스트 전용 소속 (어떤 물체도 이 그룹에 속하지 않음) */
  SIGHT: 1 << 5,
} as const;

export function interactionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** COL_: 플레이어·NPC와 충돌, 시야를 가림 */
export const WORLD_GROUPS = interactionGroups(Group.WORLD, Group.PLAYER | Group.NPC | Group.SIGHT);
/** LOS_: 아무것과도 충돌하지 않고, 시야 레이캐스트에서만 맞는다 */
export const LOS_GROUPS = interactionGroups(Group.LOS, Group.SIGHT);
/** TRG_/SAFE_/HIDE_/ZONE_ 센서: 플레이어·NPC 진입 감지 */
export const SENSOR_GROUPS = interactionGroups(Group.SENSOR, Group.PLAYER | Group.NPC);
/** 플레이어 캡슐 */
export const PLAYER_GROUPS = interactionGroups(Group.PLAYER, Group.WORLD | Group.SENSOR);
/** 캐릭터 컨트롤러가 이동 계산에 쓰는 필터 (벽·바닥만) */
export const PLAYER_MOVE_FILTER = interactionGroups(Group.PLAYER, Group.WORLD);
/** NPC 시야 판정 레이: COL_ + LOS_ */
export const SIGHT_RAY_GROUPS = interactionGroups(Group.SIGHT, Group.WORLD | Group.LOS);
/** 상호작용 가림 판정 레이: COL_만 */
export const INTERACT_RAY_GROUPS = interactionGroups(Group.SIGHT, Group.WORLD);
