// 몰입을 위한 배경 연출: 지붕(바깥에선 건물 안이 안 보이고, 들어서면 걷힌다), 구름 그림자, 비둘기, 시간대 빛깔.
// 모두 연출 계층 전용 상태다. 시뮬레이션은 읽기만 한다.

import type { PresentationConfig, WorldDef } from '../../core/configSchemas';
import { parseTime } from '../../sim/DayCycle';
import { inRect, type Rect, type Vec2 } from '../../world/TileMap';
import { hashOf, shade } from './people';

type AmbientConfig = PresentationConfig['ambient'];

const ROOF_COLORS = ['#8f7465', '#6f7f8c', '#7b866c', '#958570', '#7a7488', '#8c6e68'];

interface Building {
  rects: Rect[];
  /** 벽까지 덮도록 1칸 넓힌 범위 */
  outer: Rect[];
  color: string;
  alpha: number;
  details: { kind: RoofDetail; x: number; y: number }[];
}

/** 지붕: 붙어 있는 실내 영역을 한 건물로 묶는다. 플레이어가 들어간 건물만 지붕이 걷힌다 */
type RoofDetail = 'ac' | 'vent' | 'tank' | 'solar' | 'hatch' | 'stain';

export class Roofs {
  private readonly buildings: Building[] = [];

  constructor(
    world: WorldDef,
    layerRect: Rect,
    private readonly cfg: AmbientConfig,
  ) {
    const rooms = world.areas.filter((a) => a.kind !== 'outdoor' && inRect(layerRect, a.rect[0], a.rect[1])).map((a) => a.rect);
    const groupOf = rooms.map((_, i) => i);
    const find = (i: number): number => (groupOf[i] === i ? i : (groupOf[i] = find(groupOf[i]!)));
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) if (touches(grow(rooms[i]!, 1), grow(rooms[j]!, 1))) groupOf[find(i)] = find(j);
    }
    const groups = new Map<number, Rect[]>();
    rooms.forEach((r, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), r]));
    for (const rects of groups.values()) {
      const h = hashOf(rects.map((r) => r.join(',')).join('|'));
      const details: Building['details'] = [];
      for (const r of rects) {
        const n = Math.floor((r[2] * r[3]) / 70);
        for (let k = 0; k < n; k++) {
          const hk = hashOf(`${h}:${r.join(',')}:${k}`);
          details.push({
            kind: k === 0 && r[2] * r[3] > 100 ? 'hatch' : (['ac', 'ac', 'vent', 'tank', 'solar', 'stain', 'stain'] as const)[hk % 7]!,
            x: r[0] + 1.2 + ((hk >>> 4) % 1000) / 1000 * Math.max(0, r[2] - 2.4),
            y: r[1] + 1.2 + ((hk >>> 14) % 1000) / 1000 * Math.max(0, r[3] - 2.4),
          });
        }
      }
      this.buildings.push({ rects, outer: rects.map((r) => grow(r, 1)), color: ROOF_COLORS[h % ROOF_COLORS.length]!, alpha: 1, details });
    }
  }

  /** 플레이어가 서 있는 건물(문간 포함)은 지붕을 걷는다 */
  update(dt: number, player: Vec2): void {
    const k = Math.min(1, dt / Math.max(0.01, this.cfg.roofFadeSec));
    for (const b of this.buildings) {
      const inside = b.outer.some((r) => inRect(r, player.x, player.y));
      b.alpha += ((inside ? 0 : 1) - b.alpha) * k;
    }
  }

  /** 이 지점이 지금 지붕에 가려져 있는지 */
  covers(p: Vec2): boolean {
    return this.buildings.some((b) => b.alpha > 0.5 && b.outer.some((r) => inRect(r, p.x, p.y)));
  }

  draw(g: CanvasRenderingContext2D, view: Rect, night: number): void {
    for (const b of this.buildings) {
      if (b.alpha < 0.02 || !b.outer.some((r) => touches(r, view))) continue;
      g.save();
      g.globalAlpha = b.alpha;
      const path = new Path2D();
      for (const r of b.outer) path.rect(r[0], r[1], r[2], r[3]);
      // 건물 높이: 남동쪽으로 떨어지는 그림자
      g.save();
      g.translate(0.35, 0.5);
      g.fillStyle = 'rgba(10, 10, 20, 0.28)';
      g.fill(path);
      g.restore();
      g.fillStyle = b.color;
      g.fill(path);
      // 지붕 이음새 (2칸마다)
      g.save();
      g.clip(path);
      g.strokeStyle = shade(b.color, -0.12);
      g.lineWidth = 0.05;
      g.beginPath();
      for (const r of b.outer) {
        for (let y = r[1] + 2; y < r[1] + r[3]; y += 2) {
          g.moveTo(r[0], y);
          g.lineTo(r[0] + r[2], y);
        }
      }
      g.stroke();
      // 햇빛 방향 명암: 왼쪽 위는 밝게, 오른쪽 아래는 어둡게
      for (const r of b.outer) {
        const grad = g.createLinearGradient(r[0], r[1], r[0] + r[2], r[1] + r[3]);
        grad.addColorStop(0, 'rgba(255, 250, 235, 0.10)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
        g.fillStyle = grad;
        g.fillRect(r[0], r[1], r[2], r[3]);
      }
      g.restore();
      // 난간: 바깥 테두리 어둡게, 안쪽 한 줄 밝게
      g.lineWidth = 0.16;
      g.strokeStyle = shade(b.color, -0.3);
      g.stroke(path);
      g.lineWidth = 0.05;
      g.strokeStyle = shade(b.color, 0.22);
      for (const r of b.outer) g.strokeRect(r[0] + 0.25, r[1] + 0.25, r[2] - 0.5, r[3] - 0.5);
      // 얼룩은 바닥에 깔고, 설비는 그 위에
      for (const d of b.details) if (d.kind === 'stain') drawRoofDetail(g, d.kind, d.x, d.y);
      for (const d of b.details) if (d.kind !== 'stain') drawRoofDetail(g, d.kind, d.x, d.y);
      if (night > 0.01) {
        g.fillStyle = `rgba(12, 16, 42, ${night * 0.55})`;
        g.fill(path);
      }
      g.restore();
    }
  }
}

function drawRoofDetail(g: CanvasRenderingContext2D, kind: RoofDetail, x: number, y: number): void {
  if (kind === 'stain') {
    // 빗물 얼룩
    g.fillStyle = 'rgba(30, 30, 40, 0.07)';
    g.beginPath();
    g.ellipse(x, y, 1.1, 0.6, (x * 7) % 3, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(x + 0.5, y + 0.3, 0.6, 0.35, 0, 0, Math.PI * 2);
    g.fill();
    return;
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  if (kind === 'solar') {
    // 태양광 패널 2×3
    g.fillRect(x - 0.9 + 0.15, y - 0.6 + 0.2, 1.8, 1.2);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = '#2f4a6b';
        g.fillRect(x - 0.9 + i * 0.6, y - 0.6 + j * 0.6, 0.56, 0.56);
        g.fillStyle = 'rgba(160, 200, 255, 0.25)';
        g.fillRect(x - 0.9 + i * 0.6, y - 0.6 + j * 0.6, 0.56, 0.12);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x - 0.9 + i * 0.6 + 0.27, y - 0.6 + j * 0.6, 0.02, 0.56);
      }
    }
    return;
  }
  if (kind === 'hatch') {
    // 옥상 계단실: 작은 상자 + 문
    g.fillRect(x - 0.8 + 0.25, y - 0.6 + 0.35, 1.6, 1.2);
    g.fillStyle = '#c9c3b8';
    g.fillRect(x - 0.8, y - 0.6, 1.6, 1.2);
    g.fillStyle = '#ddd8ce';
    g.fillRect(x - 0.8, y - 0.6, 1.6, 0.12);
    g.fillStyle = '#7a6a5a';
    g.fillRect(x - 0.25, y + 0.45, 0.5, 0.15);
    return;
  }
  if (kind === 'ac') {
    g.fillRect(x - 0.4 + 0.12, y - 0.3 + 0.16, 0.8, 0.6);
    g.fillStyle = '#d5d8dc';
    g.fillRect(x - 0.4, y - 0.3, 0.8, 0.6);
    g.fillStyle = '#9aa1a8';
    g.beginPath();
    g.arc(x - 0.08, y, 0.2, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'vent') {
    g.fillRect(x - 0.22 + 0.1, y - 0.22 + 0.12, 0.44, 0.44);
    g.fillStyle = '#4a4f58';
    g.fillRect(x - 0.22, y - 0.22, 0.44, 0.44);
    g.fillStyle = '#6b737b';
    g.fillRect(x - 0.14, y - 0.14, 0.28, 0.28);
  } else {
    g.beginPath();
    g.arc(x + 0.12, y + 0.15, 0.55, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b9c2c9';
    g.beginPath();
    g.arc(x, y, 0.55, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#8d969d';
    g.lineWidth = 0.05;
    g.beginPath();
    g.arc(x, y, 0.36, 0, Math.PI * 2);
    g.stroke();
  }
}

/** 맑은 날 바닥 위로 천천히 지나가는 구름 그림자 */
export function drawCloudShadows(g: CanvasRenderingContext2D, view: Rect, world: { w: number; h: number }, time: number, alpha: number, speed: number): void {
  if (alpha <= 0.002) return;
  const span = world.w + 60;
  for (let i = 0; i < 9; i++) {
    const h = hashOf(`cloud${i}`);
    const r = 7 + (h % 7);
    const x = ((((h >>> 3) % 1000) / 1000) * span + time * speed * (0.7 + (i % 3) * 0.2)) % span - 30;
    const y = (((h >>> 13) % 1000) / 1000) * world.h;
    if (x + r * 1.6 < view[0] || x - r * 1.6 > view[0] + view[2] || y + r < view[1] || y - r > view[1] + view[3]) continue;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(20, 30, 50, ${alpha})`);
    grad.addColorStop(0.6, `rgba(20, 30, 50, ${alpha * 0.7})`);
    grad.addColorStop(1, 'rgba(20, 30, 50, 0)');
    g.save();
    g.translate(x, y);
    g.scale(1.6, 1);
    g.translate(-x, -y);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
  }
}

interface Bird {
  x: number;
  y: number;
  hx: number;
  hy: number;
  facing: number;
  peck: number;
  /** 날아가는 중: 속도와 남은 시간 */
  vx: number;
  vy: number;
  fly: number;
}

/** 비둘기 무리: 다가가면(뛰면 더 멀리서) 한꺼번에 날아오르고, 한참 뒤 돌아온다 */
export class Pigeons {
  private readonly flocks: { at: Vec2; birds: Bird[]; away: number }[];

  constructor(private readonly cfg: AmbientConfig) {
    this.flocks = cfg.pigeonFlocks.map((f, fi) => ({ at: { x: f.at[0], y: f.at[1] }, birds: this.spawn(f.at[0], f.at[1], f.count, fi), away: 0 }));
  }

  private spawn(x: number, y: number, count: number, seed: number): Bird[] {
    return Array.from({ length: count }, (_, i) => {
      const h = hashOf(`pigeon${seed}:${i}`);
      const bx = x + (((h % 1000) / 1000) * 2 - 1) * 1.8;
      const by = y + ((((h >>> 10) % 1000) / 1000) * 2 - 1) * 1.2;
      return { x: bx, y: by, hx: bx, hy: by, facing: ((h >>> 20) % 628) / 100, peck: (h % 97) / 10, vx: 0, vy: 0, fly: 0 };
    });
  }

  update(dt: number, player: Vec2, running: boolean, others: readonly Vec2[]): void {
    const scare = running ? this.cfg.pigeonRunScareRadius : this.cfg.pigeonScareRadius;
    for (const f of this.flocks) {
      if (f.away > 0) {
        f.away -= dt;
        if (f.away <= 0 && Math.hypot(player.x - f.at.x, player.y - f.at.y) > 12) {
          f.birds = this.spawn(f.at.x, f.at.y, f.birds.length, hashOf(`${f.at.x}`));
        } else if (f.away <= 0) f.away = 3;
      }
      const near = (b: Bird, r: number) => Math.hypot(player.x - b.x, player.y - b.y) < r || others.some((o) => Math.hypot(o.x - b.x, o.y - b.y) < r * 0.4);
      if (f.away <= 0 && f.birds.some((b) => b.fly <= 0 && near(b, scare))) {
        // 한 마리가 놀라면 무리가 같이 뜬다
        for (const b of f.birds) {
          const a = Math.atan2(b.y - player.y, b.x - player.x) + (hashOf(`${b.hx}`) % 100) / 100 - 0.5;
          b.vx = Math.cos(a) * 7;
          b.vy = Math.sin(a) * 7 - 2;
          b.fly = 2.4;
        }
        f.away = this.cfg.pigeonReturnSec;
      }
      for (const b of f.birds) {
        if (b.fly > 0) {
          b.fly -= dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          continue;
        }
        if (f.away > 0) continue;
        // 땅에서: 콕콕 쪼고, 가끔 한두 걸음
        b.peck += dt;
        const wander = Math.sin(b.peck * 0.7 + b.hx) * 0.4;
        b.x = b.hx + wander;
        b.y = b.hy + Math.cos(b.peck * 0.5 + b.hy) * 0.25;
        b.facing = Math.atan2(Math.cos(b.peck * 0.7 + b.hx), 1);
      }
    }
  }

  /** flying: false면 땅 위의 새, true면 날아가는 새 (지붕 위에 그린다) */
  draw(g: CanvasRenderingContext2D, view: Rect, time: number, flying: boolean): void {
    for (const f of this.flocks) {
      for (const b of f.birds) {
        if ((b.fly > 0) !== flying) continue;
        if (!flying && f.away > 0) continue;
        if (b.x < view[0] - 2 || b.x > view[0] + view[2] + 2 || b.y < view[1] - 2 || b.y > view[1] + view[3] + 2) continue;
        if (flying) {
          const a = Math.min(1, b.fly / 0.8);
          const flap = Math.sin(time * 30 + b.hx) * 0.22;
          const ang = Math.atan2(b.vy, b.vx);
          g.save();
          g.globalAlpha = a;
          // 땅에 떨어지는 그림자 (높이 오를수록 멀어진다)
          g.fillStyle = 'rgba(0,0,0,0.13)';
          g.beginPath();
          g.ellipse(b.x + 0.3, b.y + 0.4 + (2.4 - b.fly) * 0.5, 0.2, 0.1, 0, 0, Math.PI * 2);
          g.fill();
          g.translate(b.x, b.y);
          g.rotate(ang);
          g.fillStyle = '#8b8f9a';
          g.beginPath();
          g.ellipse(0, 0, 0.2, 0.1, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#a6abb5';
          for (const s of [-1, 1]) {
            g.beginPath();
            g.ellipse(-0.02, s * (0.16 + flap), 0.12, 0.2, s * 0.4, 0, Math.PI * 2);
            g.fill();
          }
          g.restore();
          continue;
        }
        const bob = Math.max(0, Math.sin(b.peck * 6)) * 0.05;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b.facing);
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.beginPath();
        g.ellipse(0.03, 0.06, 0.18, 0.1, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#8b8f9a';
        g.beginPath();
        g.ellipse(0, 0, 0.17, 0.11, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#6d7f7a';
        g.beginPath();
        g.arc(0.13 + bob, 0, 0.07, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#e8b45a';
        g.fillRect(0.19 + bob, -0.015, 0.05, 0.03);
        g.restore();
      }
    }
  }
}

/** 시간대 빛깔: 아침은 푸르스름, 오후 늦게는 노을빛. presentation.json의 timeTint를 시각 사이로 보간 */
export function timeTint(cfg: AmbientConfig, minutes: number): { r: number; g: number; b: number; a: number } {
  const keys = cfg.timeTint.map((k) => ({ t: parseTime(k.at), c: hex(k.color), a: k.alpha }));
  if (!keys.length) return { r: 0, g: 0, b: 0, a: 0 };
  if (minutes <= keys[0]!.t) return { ...keys[0]!.c, a: keys[0]!.a };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (minutes <= b.t) {
      const k = (minutes - a.t) / Math.max(1, b.t - a.t);
      return { r: a.c.r + (b.c.r - a.c.r) * k, g: a.c.g + (b.c.g - a.c.g) * k, b: a.c.b + (b.c.b - a.c.b) * k, a: a.a + (b.a - a.a) * k };
    }
  }
  const last = keys[keys.length - 1]!;
  return { ...last.c, a: last.a };
}

function hex(c: string): { r: number; g: number; b: number } {
  const n = parseInt(c.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function grow(r: Rect, by: number): Rect {
  return [r[0] - by, r[1] - by, r[2] + by * 2, r[3] + by * 2];
}

function touches(a: Rect, b: Rect): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}
