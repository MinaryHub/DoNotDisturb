/**
 * 스테이지 1 (아파트 3층 복도 → 엘리베이터/계단 → 1층 로비) 레벨을 Kreate에서 만들기 위한 스크립트 생성기.
 * 출력된 줄을 Kreate의 run_script로 실행하면 레벨이 만들어진다. 결과물의 원본은 Kreate 문서
 * (assets/kreate-src/stage01.kreate)이며, 이후 수정은 Kreate에서 직접 해도 된다.
 *
 * 좌표는 Kreate 기준: X 오른쪽, Y 앞(게임 정면), Z 위. 1 = 1m.
 *
 *   npx tsx tools/kreate-scripts/stage01.ts materials        재질을 만드는 줄 (첫 사용 오브젝트 포함)
 *   npx tsx tools/kreate-scripts/stage01.ts objects '<uid맵 JSON>' [청크번호]
 */

type V3 = [number, number, number];

interface MeshObj {
  type: 'mesh';
  name: string;
  center: V3;
  size: V3;
  rotX?: number; // 라디안
  mat?: MatId;
}
interface EmptyObj {
  type: 'empty';
  name: string;
  at: V3;
  rotZ?: number; // 라디안
}
type Obj = MeshObj | EmptyObj;

const MATERIALS = {
  floor: { color: [0.42, 0.4, 0.37], roughness: 0.8, metallic: 0 },
  wall: { color: [0.82, 0.8, 0.76], roughness: 0.9, metallic: 0 },
  ceiling: { color: [0.9, 0.9, 0.88], roughness: 0.95, metallic: 0 },
  door: { color: [0.42, 0.3, 0.22], roughness: 0.6, metallic: 0 },
  metal: { color: [0.62, 0.64, 0.67], roughness: 0.35, metallic: 0.8 },
  stair: { color: [0.55, 0.55, 0.53], roughness: 0.85, metallic: 0 },
  bed: { color: [0.55, 0.65, 0.8], roughness: 0.9, metallic: 0 },
  plant: { color: [0.3, 0.52, 0.3], roughness: 0.8, metallic: 0 },
  button: { color: [0.95, 0.82, 0.35], roughness: 0.4, metallic: 0 },
} as const;
type MatId = keyof typeof MATERIALS;

const objs: Obj[] = [];

/** 최소·최대 좌표로 박스 정의 */
function box(name: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat?: MatId): void {
  objs.push({ type: 'mesh', name, center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], size: [x1 - x0, y1 - y0, z1 - z0], mat });
}

/** 보이는 메시 + 같은 모양의 박스 충돌체. suffix는 두 이름 뒤에 공통으로 붙는 속성 */
function solid(id: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: MatId, suffix = ''): void {
  box(`VIS_${id}${suffix}`, x0, x1, y0, y1, z0, z1, mat);
  box(`COL_${id}__shape=box${suffix}`, x0, x1, y0, y1, z0, z1);
}

/** 바닥판: 보이는 메시 + 충돌체 + 내비 */
function floorSlab(id: string, x0: number, x1: number, y0: number, y1: number, top: number, nav = true): void {
  solid(id, x0, x1, y0, y1, top - 0.2, top, 'floor');
  if (nav) box(`NAV_${id}`, x0, x1, y0, y1, top - 0.2, top);
}

/** 계단 경사로: (y0,z0)에서 (y1,z1)까지 윗면이 지나가는 판 */
function ramp(id: string, x0: number, x1: number, y0: number, z0: number, y1: number, z1: number): void {
  const t = 0.15;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const theta = Math.atan(dz / dy);
  const len = Math.hypot(dy, dz);
  const normal: V3 = [0, -Math.sin(theta), Math.cos(theta)];
  const center: V3 = [(x0 + x1) / 2, (y0 + y1) / 2 - (t / 2) * normal[1], (z0 + z1) / 2 - (t / 2) * normal[2]];
  for (const name of [`VIS_${id}`, `COL_${id}__shape=box`]) {
    objs.push({ type: 'mesh', name, center, size: [x1 - x0, len, t], rotX: theta, mat: name.startsWith('VIS') ? 'stair' : undefined });
  }
}

function empty(name: string, x: number, y: number, z: number, rotZ?: number): void {
  objs.push({ type: 'empty', name, at: [x, y, z], rotZ });
}

// ───────────── 치수 ─────────────
const F1 = 0; // 1층 바닥
const F3 = 6; // 3층 바닥
const H = 3; // 층고(바닥~천장)
const WT = 0.2; // 벽 두께
const DOOR_H = 2.2;

// ───────────── 1층 로비 x[-4,1.5] y[6,22] ─────────────
floorSlab('lobby_floor', -4, 1.5, 6, 22, F1);
box('VIS_lobby_ceiling', -4, 1.5, 6, 22, F1 + H, F1 + H + 0.2, 'ceiling');
solid('lobby_wall_W', -4 - WT, -4, 6, 22, F1, F1 + H, 'wall');
solid('lobby_wall_S', -4 - WT, 1.5 + WT, 6 - WT, 6, F1, F1 + H, 'wall');
// 북쪽 벽: 엘리베이터 문 x[-0.8,0.8]
solid('lobby_wall_N_a', -4, -0.8, 22, 22 + WT, F1, F1 + H, 'wall');
solid('lobby_wall_N_b', 0.8, 1.5 + WT, 22, 22 + WT, F1, F1 + H, 'wall');
solid('lobby_wall_N_lintel', -0.8, 0.8, 22, 22 + WT, F1 + DOOR_H, F1 + H, 'wall');
// 동쪽 벽 x[1.5,1.7]: 계단실 출입구 y[14.2,15.2]
solid('lobby_wall_E_a', 1.5, 1.5 + WT, 6, 14.2, F1, F1 + H, 'wall');
solid('lobby_wall_E_b', 1.5, 1.5 + WT, 15.2, 22, F1, F1 + H, 'wall');
solid('lobby_wall_E_lintel', 1.5, 1.5 + WT, 14.2, 15.2, F1 + DOOR_H, F1 + H, 'wall');
// 현관 유리문 (장식)과 우편함
box('VIS_lobby_entrance', -3, 0.5, 6 - 0.05, 6.02, F1, 2.4, 'metal');
solid('lobby_mailbox', -4, -3.6, 10, 13, F1, 1.6, 'metal');
// 엘리베이터 문턱
floorSlab('elev_sill_1F', -0.8, 0.8, 22, 22.3, F1, false);
// 호출 버튼
box('VIS_elevCall1F_button', 1.0, 1.2, 21.94, 22, 1.1, 1.35, 'button');
box('TRG_elevCall1F__eventId=elevCall1F__interact=true', 0.9, 1.3, 21.7, 22, 0.95, 1.5);
// 목표 지점: 현관 앞
box('TRG_lobbyExit__eventId=reachLobby__once=true', -3, 0.5, 6, 7.5, F1, 2.5);
// 로비 소음 구역
box('ZONE_lobby__stimulus=lobbyNoise__intensity=1', -4, 1.5, 6, 22, F1, F1 + H);

// ───────────── 3층 복도 x[-1.5,1.5] y[2,22] ─────────────
floorSlab('corridor3F_floor', -1.5, 1.5, 2, 22, F3);
box('VIS_corridor3F_ceiling', -1.5, 1.5, 2, 22, F3 + H, F3 + H + 0.2, 'ceiling');
solid('corridor3F_wall_W', -1.5 - WT, -1.5, 2 + WT, 22, F3, F3 + H, 'wall');
solid('corridor3F_wall_E_a', 1.5, 1.5 + WT, 2 + WT, 14.2, F3, F3 + H, 'wall');
solid('corridor3F_wall_E_b', 1.5, 1.5 + WT, 15.2, 22, F3, F3 + H, 'wall');
solid('corridor3F_wall_E_lintel', 1.5, 1.5 + WT, 14.2, 15.2, F3 + DOOR_H, F3 + H, 'wall');
solid('corridor3F_wall_N_a', -1.5 - WT, -0.8, 22, 22 + WT, F3, F3 + H, 'wall');
solid('corridor3F_wall_N_b', 0.8, 1.5 + WT, 22, 22 + WT, F3, F3 + H, 'wall');
solid('corridor3F_wall_N_lintel', -0.8, 0.8, 22, 22 + WT, F3 + DOOR_H, F3 + H, 'wall');
floorSlab('elev_sill_3F', -0.8, 0.8, 22, 22.3, F3, false);
// 이웃집 현관문 (장식)
box('VIS_door_301', -1.5, -1.44, 7.5, 8.5, F3, F3 + 2.1, 'door');
box('VIS_door_302', 1.44, 1.5, 11, 12, F3, F3 + 2.1, 'door');
box('VIS_door_304', -1.5, -1.44, 16, 17, F3, F3 + 2.1, 'door');
// 화분: 시선만 가림
box('VIS_corridor3F_plant', -1.4, -0.9, 19.5, 20, F3, F3 + 1.3, 'plant');
box('LOS_corridor3F_plant', -1.4, -0.9, 19.5, 20, F3, F3 + 1.3);
box('COL_corridor3F_plant__shape=box', -1.4, -0.9, 19.5, 20, F3, F3 + 1.3);
box('VIS_elevCall3F_button', 1.0, 1.2, 21.94, 22, F3 + 1.1, F3 + 1.35, 'button');
box('TRG_elevCall3F__eventId=elevCall3F__interact=true', 0.9, 1.3, 21.7, 22, F3 + 0.95, F3 + 1.5);
// 복도 중간: 문자 알림 트리거
box('TRG_hallwayPhone__eventId=hallwayPhone__once=true', -1.5, 1.5, 10, 10.6, F3, F3 + 2.5);

// ───────────── 집 (3층 남쪽 끝) x[-2.5,2.5] y[-3,2] ─────────────
solid('home_floor', -2.5, 2.5, -3, 2, F3 - 0.2, F3, 'floor');
box('VIS_home_ceiling', -2.5, 2.5, -3, 2, F3 + H, F3 + H + 0.2, 'ceiling');
solid('home_wall_W', -2.5 - WT, -2.5, -3 - WT, 2 + WT, F3, F3 + H, 'wall');
solid('home_wall_E', 2.5, 2.5 + WT, -3 - WT, 2 + WT, F3, F3 + H, 'wall');
solid('home_wall_S', -2.5, 2.5, -3 - WT, -3, F3, F3 + H, 'wall');
solid('home_wall_N_a', -2.5, -0.5, 2, 2 + WT, F3, F3 + H, 'wall');
solid('home_wall_N_b', 0.5, 2.5, 2, 2 + WT, F3, F3 + H, 'wall');
solid('home_wall_N_lintel', -0.5, 0.5, 2, 2 + WT, F3 + DOOR_H, F3 + H, 'wall');
solid('home_bed', -2.3, -0.7, -2.8, -0.8, F3, F3 + 0.5, 'bed');
box('TRG_bed__eventId=bed__interact=true', -2.4, -0.6, -2.9, -0.7, F3, F3 + 1.0);
solid('home_desk', 1.2, 2.4, -2.9, -2.2, F3, F3 + 0.75, 'door');
box('SAFE_home', -2.5, 2.5, -3, 2, F3, F3 + H);

// ───────────── 계단실 x[1.7,5.5] y[14.2,19.2] ─────────────
const SX0 = 1.5; // 출입구 아래까지 바닥을 이어 붙임
const SX1 = 5.5;
const LANE = 3.6;
for (const [i, z] of [F1, 1.5, 3, 4.5, F3].entries()) {
  const south = i % 2 === 0;
  const y0 = south ? 14.2 : 18.2;
  const y1 = south ? 15.2 : 19.2;
  floorSlab(`stair_landing_${i}`, i === 0 || i === 4 ? SX0 : 1.7, SX1, y0, y1, z, false);
}
ramp('stair_flight_1', 1.7, LANE - 0.05, 15.2, F1, 18.2, 1.5);
ramp('stair_flight_2', LANE + 0.05, SX1, 18.2, 1.5, 15.2, 3);
ramp('stair_flight_3', 1.7, LANE - 0.05, 15.2, 3, 18.2, 4.5);
ramp('stair_flight_4', LANE + 0.05, SX1, 18.2, 4.5, 15.2, F3);
solid('stair_divider', LANE - 0.05, LANE + 0.05, 15.2, 18.2, F1, F3 + 1.0, 'wall');
solid('stair_wall_E', SX1, SX1 + WT, 14.2 - WT, 19.2 + WT, F1, F3 + H, 'wall');
solid('stair_wall_N', 1.5, SX1, 19.2, 19.2 + WT, F1, F3 + H, 'wall');
solid('stair_wall_S', 1.5, SX1, 14.2 - WT, 14.2, F1, F3 + H, 'wall');
solid('stair_wall_W_2F', 1.5, 1.5 + WT, 14.2, 19.2, F1 + H, F3, 'wall');
box('VIS_stair_ceiling', 1.5, SX1 + WT, 14, 19.4, F3 + H, F3 + H + 0.2, 'ceiling');

// ───────────── 엘리베이터 샤프트 x[-1.1,1.1] y[22.3,24.4] ─────────────
solid('shaft_wall_W', -1.3, -1.1, 22, 24.6, F1 - 0.3, F3 + H + 0.4, 'wall');
solid('shaft_wall_E', 1.1, 1.3, 22, 24.6, F1 - 0.3, F3 + H + 0.4, 'wall');
solid('shaft_wall_N', -1.3, 1.3, 24.4, 24.6, F1 - 0.3, F3 + H + 0.4, 'wall');
solid('shaft_wall_S_2F', -1.3, 1.3, 22, 22 + WT, F1 + H, F3, 'wall');
solid('shaft_pit', -1.1, 1.1, 22.3, 24.4, F1 - 0.5, F1 - 0.3, 'wall');

// 엘리베이터 칸 (움직이는 부분: mover=elevCar). 시작 위치 1층
const CAR = '__mover=elevCar';
solid('elevCar_floor', -1.0, 1.0, 22.3, 24.3, F1 - 0.1, F1, 'metal', CAR);
solid('elevCar_wall_W', -1.0, -0.95, 22.3, 24.3, F1, F1 + 2.4, 'metal', CAR);
solid('elevCar_wall_E', 0.95, 1.0, 22.3, 24.3, F1, F1 + 2.4, 'metal', CAR);
solid('elevCar_wall_N', -1.0, 1.0, 24.25, 24.3, F1, F1 + 2.4, 'metal', CAR);
solid('elevCar_ceiling', -1.0, 1.0, 22.3, 24.3, F1 + 2.4, F1 + 2.5, 'ceiling', CAR);
box(`VIS_elevCar_panel${CAR}`, 0.9, 0.95, 22.5, 22.75, 1.0, 1.4, 'button');
box(`TRG_elevPanel__eventId=elevPanel__interact=true${CAR}`, 0.65, 0.95, 22.4, 22.85, 0.9, 1.5);

// 승강장 문 (mover). 열리면 +X로 미끄러짐
solid('elevDoor1F', -0.8, 0.8, 22.05, 22.15, F1, F1 + DOOR_H, 'metal', '__mover=elevDoor1F');
solid('elevDoor3F', -0.8, 0.8, 22.05, 22.15, F3, F3 + DOOR_H, 'metal', '__mover=elevDoor3F');

// ───────────── 스폰과 순찰 경로 ─────────────
empty('SPAWN_player', 0.8, -1.5, F3); // 집 안, 현관(+Y) 방향
empty('SPAWN_npc_neighbor', 0.6, 20.5, F3, Math.PI);
empty('PATH_neighbor_01', 0.6, 20.5, F3);
empty('PATH_neighbor_02', 0.6, 8.0, F3);
empty('PATH_neighbor_03', -0.9, 8.0, F3); // 301호 앞에서 잠시 멈춤
empty('PATH_neighbor_04', -0.6, 17.0, F3);

// ───────────── 출력 ─────────────

const fmt = (n: number) => (Math.abs(n) < 1e-9 ? '0.0' : Number(n.toFixed(4)).toString().replace(/^(-?\d+)$/, '$1.0'));
const vec = (v: V3) => `(${v.map(fmt).join(', ')})`;

function objectLines(o: Obj, uids: Record<string, string>): string[] {
  if (o.type === 'empty') {
    const lines = [`kreate.ops.object.add_empty(location=${vec(o.at)})`, `kreate.ops.object.rename(name="${o.name}")`];
    if (o.rotZ) lines.push(`kreate.ops.object.set_transform(rotation=(0.0, 0.0, ${fmt(o.rotZ)}))`);
    return lines;
  }
  const lines = [
    `kreate.ops.object.add_primitive(shape="cube", size=1.0, location=${vec(o.center)})`,
    `kreate.ops.object.set_dimensions(dimensions=${vec(o.size)})`,
  ];
  if (o.rotX) lines.push(`kreate.ops.object.set_transform(rotation=(${fmt(o.rotX)}, 0.0, 0.0))`);
  lines.push(`kreate.ops.object.rename(name="${o.name}")`);
  if (o.mat) {
    const uid = uids[o.mat];
    if (!uid) throw new Error(`재질 uid 없음: ${o.mat}`);
    lines.push(`kreate.ops.material.link(slot=0, uid="${uid}")`);
  }
  return lines;
}

const [mode, arg, chunkArg] = process.argv.slice(2);
if (mode === 'materials') {
  // 재질 팔레트용 임시 큐브에 재질을 만들고, 마지막에 큐브를 지운다
  const lines: string[] = [];
  for (const [id, m] of Object.entries(MATERIALS)) {
    lines.push(
      `kreate.ops.object.add_primitive(shape="cube", size=0.1, location=(0.0, 0.0, -5.0))`,
      `kreate.ops.object.rename(name="palette_${id}")`,
      `kreate.ops.material.new(slot=0)`,
      `kreate.ops.material.set_properties(slot=0, color=(${m.color.join(', ')}), roughness=${m.roughness}, metallic=${m.metallic})`,
      `kreate.ops.material.rename(slot=0, name="M_${id}")`,
    );
  }
  console.log(lines.join('\n'));
} else if (mode === 'objects') {
  const uids = JSON.parse(arg ?? '{}') as Record<string, string>;
  const all = objs.map((o) => objectLines(o, uids));
  const CHUNK = 40; // 오브젝트 40개씩
  const chunks: string[][] = [];
  for (let i = 0; i < all.length; i += CHUNK) chunks.push(all.slice(i, i + CHUNK).flat());
  if (chunkArg === undefined) {
    console.log(`오브젝트 ${objs.length}개, 청크 ${chunks.length}개`);
  } else {
    console.log(chunks[Number(chunkArg)]!.join('\n'));
  }
} else {
  console.log('사용법: stage01.ts materials | objects <uid맵 JSON> [청크번호]');
}
