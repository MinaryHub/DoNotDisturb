// Rapier 충돌 그룹. interactionGroups = (소속 << 16) | 필터

export const Group = {
  WORLD: 1 << 0,
  LOS: 1 << 1,
  SENSOR: 1 << 2,
  PLAYER: 1 << 3,
  NPC: 1 << 4,
} as const;

export function interactionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** COL_: 플레이어·NPC와 충돌 */
export const WORLD_GROUPS = interactionGroups(Group.WORLD, Group.PLAYER | Group.NPC);
/** LOS_: 아무것과도 충돌하지 않고, 시야 레이캐스트에서만 맞는다 */
export const LOS_GROUPS = interactionGroups(Group.LOS, 0);
/** TRG_/SAFE_/HIDE_/ZONE_ 센서: 플레이어·NPC 진입 감지 */
export const SENSOR_GROUPS = interactionGroups(Group.SENSOR, Group.PLAYER | Group.NPC);
/** 플레이어(Phase 0에서는 noclip 탐지용 프로브) */
export const PLAYER_GROUPS = interactionGroups(Group.PLAYER, Group.WORLD | Group.SENSOR);
