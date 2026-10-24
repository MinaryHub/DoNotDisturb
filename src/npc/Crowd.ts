import type { WorldDef } from '../core/configSchemas';
import type { Vec2 } from '../world/TileMap';

// 군중 (CLAUDE.md 5.3 지속형, 6-3 번화가·환승 통로).
// 이름 없는 행인들이 동선(lane)을 따라 흐른다. 개별 AI 대신 가벼운 입자처럼 움직이며
// 플레이어 주변 밀도가 '군중' 지속 자극의 강도가 된다. 정면으로 오는 사람과는 보행 충돌 QTE.

export interface CrowdAgent {
  id: number;
  lane: string;
  zone: string;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  /** 동선 중심에서의 옆 오프셋 */
  offset: number;
  /** 덩치 큰 행인 (뒤에 붙으면 슬립스트림) */
  large: boolean;
  /** 보행 충돌 QTE에서 비켜설 쪽 (-1 왼쪽, 1 오른쪽, 0 아직) */
  /** 다시 QTE 대상이 되기까지 */
  hue: number;
  phase: number;
  /** 화면 표시 여부 (밀도 조절로 숨김) */
  active: boolean;
}

type Lane = WorldDef['crowdLanes'][number];

export class Crowd {
  readonly agents: CrowdAgent[] = [];
  private readonly lanes = new Map<string, Lane>();

  constructor(lanes: readonly Lane[], rng: () => number) {
    let id = 0;
    // 밀도 배율(러시아워)을 위해 최대 1.6배까지 만들어 두고 active로 조절한다
    for (const lane of lanes) {
      this.lanes.set(lane.id, lane);
      const len = Math.hypot(lane.to[0] - lane.from[0], lane.to[1] - lane.from[1]);
      const dir = { x: (lane.to[0] - lane.from[0]) / len, y: (lane.to[1] - lane.from[1]) / len };
      const max = Math.ceil(lane.count * 1.6);
      for (let i = 0; i < max; i++) {
        const t = rng();
        const offset = (rng() - 0.5) * lane.width;
        this.agents.push({
          id: id++,
          lane: lane.id,
          zone: lane.zone,
          pos: { x: lane.from[0] + dir.x * len * t - dir.y * offset, y: lane.from[1] + dir.y * len * t + dir.x * offset },
          dir,
          speed: lane.speed * (0.8 + rng() * 0.4),
          offset,
          large: rng() < 0.15,
          hue: Math.floor(rng() * 360),
          phase: rng() * Math.PI * 2,
          active: i < lane.count,
        });
      }
    }
  }

  /** 러시아워 등 밀도 배율 적용 */
  setDensity(multiplier: number): void {
    const perLane = new Map<string, number>();
    for (const a of this.agents) {
      const n = perLane.get(a.lane) ?? 0;
      perLane.set(a.lane, n + 1);
      a.active = n < Math.round(this.lanes.get(a.lane)!.count * multiplier);
    }
  }

  update(dt: number, player: Vec2, playerRadius: number): void {
    for (const a of this.agents) {
      if (!a.active) continue;
      a.phase += dt * a.speed * 5;
      const lane = this.lanes.get(a.lane)!;
      // 플레이어를 살짝 피해 간다 (비켜설 쪽이 정해졌으면 그쪽으로)
      const rx = player.x - a.pos.x;
      const ry = player.y - a.pos.y;
      const along = rx * a.dir.x + ry * a.dir.y;
      const side = -rx * a.dir.y + ry * a.dir.x;
      let target = a.offset;
      if (along > 0 && along < 2.5 && Math.abs(side) < playerRadius + 0.6) target = a.offset + (side > 0 ? -0.5 : 0.5);
      const curSide = -(a.pos.x - lane.from[0]) * a.dir.y + (a.pos.y - lane.from[1]) * a.dir.x;
      const lateral = (target - curSide) * Math.min(1, dt * 3);
      a.pos.x += a.dir.x * a.speed * dt - a.dir.y * lateral;
      a.pos.y += a.dir.y * a.speed * dt + a.dir.x * lateral;
      // 동선 끝에 닿으면 처음으로
      const fx = a.pos.x - lane.from[0];
      const fy = a.pos.y - lane.from[1];
      const len = Math.hypot(lane.to[0] - lane.from[0], lane.to[1] - lane.from[1]);
      if (fx * a.dir.x + fy * a.dir.y > len) {
        a.pos.x -= a.dir.x * len;
        a.pos.y -= a.dir.y * len;
      }
    }
  }

  /** 플레이어 주변 반경 안 행인 수 */
  countNear(p: Vec2, radius: number): number {
    let n = 0;
    for (const a of this.agents) if (a.active && (a.pos.x - p.x) ** 2 + (a.pos.y - p.y) ** 2 < radius * radius) n++;
    return n;
  }

  /** 개인 공간(반경) 안으로 들어온 행인 */
  touching(p: Vec2, radius: number): CrowdAgent | null {
    for (const a of this.agents) if (a.active && (a.pos.x - p.x) ** 2 + (a.pos.y - p.y) ** 2 < radius * radius) return a;
    return null;
  }

  /** 같은 방향으로 걷는 덩치 큰 행인 바로 뒤인지 (슬립스트림) */
  slipstream(p: Vec2, moveDir: Vec2 | null, behindDist: number, lateral: number): boolean {
    if (!moveDir) return false;
    for (const a of this.agents) {
      if (!a.active || !a.large) continue;
      if (a.dir.x * moveDir.x + a.dir.y * moveDir.y < 0.7) continue;
      const rx = a.pos.x - p.x;
      const ry = a.pos.y - p.y;
      const along = rx * a.dir.x + ry * a.dir.y;
      const side = Math.abs(-rx * a.dir.y + ry * a.dir.x);
      if (along > 0.3 && along < behindDist && side < lateral) return true;
    }
    return false;
  }
}
