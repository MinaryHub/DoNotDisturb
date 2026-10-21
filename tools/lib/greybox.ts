import type { Document } from '@gltf-transform/core';
import { GltfBuilder, yawQuat, type Vec3 } from './gltfBuilder';

/**
 * Kreate 맵이 없을 때 쓰는 테스트 레벨: 아파트 복도 그레이박스.
 * Kreate에서 만들 맵과 똑같은 접두어 규칙을 따른다 (CLAUDE.md 4.3, 4.4).
 * 좌표: Y-up, 정면 −Z, 1 = 1m. 플레이어는 집 앞(+Z 끝)에서 출발해 −Z 방향 엘리베이터 홀로 간다.
 */
export function createGreyboxLevel(): Document {
  const b = new GltfBuilder();
  const floor = b.material('M_floor', [0.42, 0.42, 0.45]);
  const wall = b.material('M_wall', [0.78, 0.76, 0.72]);
  const accent = b.material('M_accent', [0.55, 0.38, 0.3]);
  const plant = b.material('M_plant', [0.3, 0.55, 0.32]);

  const W = 6; // 복도 폭
  const L = 26; // 복도 길이
  const H = 3; // 천장 높이
  const zc = -L / 2 + 3; // 복도 중심 z

  /** 보이는 메시 + 같은 모양의 충돌체(+선택적으로 내비) 한 쌍 */
  const solid = (id: string, size: Vec3, position: Vec3, mat = wall, opts: { nav?: boolean; boxCollider?: boolean } = {}) => {
    b.box({ name: `VIS_${id}`, size, position, material: mat });
    b.box({ name: opts.boxCollider === false ? `COL_${id}` : `COL_${id}__shape=box`, size, position });
    if (opts.nav) b.box({ name: `NAV_${id}`, size, position });
  };

  // 바닥 (윗면이 y=0)
  solid('floor', [W, 0.2, L], [0, -0.1, zc], floor, { nav: true, boxCollider: false });
  // 양쪽 벽과 끝 벽
  solid('wall_L', [0.2, H, L], [-W / 2 - 0.1, H / 2, zc]);
  solid('wall_R', [0.2, H, L], [W / 2 + 0.1, H / 2, zc]);
  solid('wall_home', [W, H, 0.2], [0, H / 2, 3.1]);
  solid('wall_elevator', [W, H, 0.2], [0, H / 2, -L + 2.9]);
  // 기둥 (이동과 시야 모두 차단)
  solid('pillar', [0.6, H, 0.6], [1.6, H / 2, -7], accent);
  b.box({ name: 'LOS_pillar', size: [0.6, H, 0.6], position: [1.6, H / 2, -7] });
  // 화분: 시야만 가리고 통과 불가 판정은 없음 (LOS_ 전용 예시)
  b.box({ name: 'VIS_planter', size: [0.8, 1.6, 0.8], position: [-2.2, 0.8, -4], material: plant });
  b.box({ name: 'LOS_planter', size: [0.8, 1.6, 0.8], position: [-2.2, 0.8, -4] });
  // 낮은 단 (내비메시가 오를 수 있는 높이)
  solid('step', [2, 0.3, 2], [-1.5, 0.15, -16], floor, { nav: true });

  // 게임플레이 볼륨
  b.box({ name: 'TRG_phone__eventId=landlordCall__once=true', size: [W, 2, 1], position: [0, 1, -3] });
  b.box({ name: 'HIDE_alcove__detectScale=0.5', size: [1, 2, 2], position: [-2.4, 1, -10] });
  b.box({ name: 'SAFE_trashroom__capacity=1__noiseAfterSec=45', size: [1.6, 2.2, 1.6], position: [2.1, 1.1, -13] });
  b.box({ name: 'ZONE_elevatorHall__stimulus=crowd__intensity=0.6', size: [W, H, 5], position: [0, H / 2, -20] });

  // 시작 위치와 순찰 경로
  b.empty('SPAWN_player', [0, 0, 1.5]);
  b.empty('SPAWN_npc_neighbor', [1.5, 0, -18], yawQuat(Math.PI));
  b.empty('PATH_neighbor_01', [1.5, 0, -18]);
  b.empty('PATH_neighbor_02', [1.5, 0, -9]);
  b.empty('PATH_neighbor_03', [-1.2, 0, -9]);
  b.empty('PATH_neighbor_04', [-1.2, 0, -18]);

  return b.doc;
}
