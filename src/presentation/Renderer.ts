import { t } from '../core/config';
import type { GameConfig } from '../core/config';
import type { GameSession } from '../gameplay/GameSession';
import type { Npc } from '../npc/Npc';
import { inRect, type Rect, type TileMap, type Vec2 } from '../world/TileMap';
import { Camera2D } from './Camera2D';
import { parseTime } from '../sim/DayCycle';
import { drawProp } from './draw/props';
import { isSolid, paintDeco, paintFloor, paintFloorLight } from './draw/tiles';
import { Pigeons, Roofs, drawCloudShadows, timeTint } from './draw/ambient';
import { drawPerson, drawUmbrella, hashOf, hslHex, lookFor, type Accessory, type Look } from './draw/people';
import type { PresentationState } from './PresentationState';
import type { Settings } from './Settings';

// 2D 탑다운 렌더러. 그래픽의 세밀함 대신, 플레이어의 심리 상태가 화면 전체를 어떻게 바꾸는지에 집중한다.
//   월드 → 오프스크린 캔버스 → (채도·블러·앰버·색수차·늘림) 합성 → 심리 오버레이(비네팅·터널·홍조·암전)

const PLAYER_LOOK_BASE = (top: string): Look => ({ skin: '#f0dac4', hair: '#3a2c25', hairStyle: 'short', top, accessory: 'none', accent: '#4b5563', pattern: 'plain', shoes: '#f4f1ea' });

const UMBRELLAS = ['#3b6fb6', '#2f3e46', '#c0392b', '#f2c94c', '#5b7d63', '#e8e2d6', '#6c5b7b'];

const CHUNK = 16;
const CHUNK_PX = 48;
const MAX_CHUNKS = 48;
/** 청크 사이에 비치는 가는 선을 없애기 위한 겹침 (칸) */
const SEAM = 0.04;

interface SoundRing {
  x: number;
  y: number;
  age: number;
  life: number;
  radius: number;
  color: string;
}

export class Renderer {
  readonly camera = new Camera2D();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly world: HTMLCanvasElement;
  private readonly wctx: CanvasRenderingContext2D;
  /** 밤 조명: 어둠을 칠하고 불빛 자리를 지워 낸 뒤 월드 위에 덮는다 */
  private readonly light: HTMLCanvasElement;
  private readonly lctx: CanvasRenderingContext2D;
  private readonly chunks = new Map<string, HTMLCanvasElement>();
  private dpr = 1;
  private rings: SoundRing[] = [];
  private ringTimer = 0;
  private stretchAxis = 0;
  private firstFrame = true;
  private readonly looks = new Map<string, Look>();
  /** 지금 그리는 층 (플레이어가 있는 층만 보인다) */
  private layer: { id: string; rect: Rect } | null = null;
  private readonly roofs: Roofs;
  private readonly pigeons: Pigeons;
  /** 바깥에 있는 정도 (시간대 빛깔을 실내에서는 약하게) */
  private outdoorness = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly cfg: GameConfig,
    private readonly map: TileMap,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.world = document.createElement('canvas');
    this.wctx = this.world.getContext('2d')!;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
    const ground = cfg.world.layers.find((l) => l.id === 'ground') ?? cfg.world.layers[0]!;
    this.roofs = new Roofs(cfg.world, ground.rect, cfg.presentation.ambient);
    this.pigeons = new Pigeons(cfg.presentation.ambient);
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const c of [this.canvas, this.world, this.light]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.viewW = w;
    this.camera.viewH = h;
  }

  render(dt: number, s: GameSession, ps: PresentationState, st: Settings): void {
    const cam = this.camera;
    const pc = this.cfg.presentation;
    const dist = st.distortion;
    const p = s.player;

    // 카메라: 플레이어 (외시경이면 복도). Danger 이하에서는 세상이 멀어진다(줌 아웃)
    const target = s.viewTarget ?? p.pos;
    this.layer = this.cfg.world.layers.find((l) => inRect(l.rect, target.x, target.y)) ?? this.cfg.world.layers[0]!;
    cam.follow(target, dt, pc.camera.followLerp, this.firstFrame || s.mode.kind === 'travel');
    this.firstFrame = false;
    const peep = s.mode.kind === 'peephole' ? -0.35 : 0;
    const zoom = 1 + peep - pc.camera.dangerZoomOut * (ps.danger * 0.7 + ps.critical * 0.3) * dist + ps.phone * 0.12 + ps.sanctuary * 0.05;
    // 휴대폰처럼 작은 화면은 칸을 줄여 주변이 충분히 보이게
    const small = Math.min(1, Math.max(0.55, Math.min(cam.viewW / 1280, cam.viewH / 720)));
    cam.scale = pc.camera.tilePx * small * Math.min(1.3, Math.max(0.6, zoom)) * (1 + ps.beat * pc.camera.heartbeatPulse * (ps.stress + ps.critical) * dist);
    const shake = st.shake ? ps.trauma * ps.trauma * pc.camera.shakePx : 0;
    cam.shakeX = (Math.random() * 2 - 1) * shake + (st.shake ? Math.sin(ps.time * 40) * ps.sweat * 0.6 : 0);
    cam.shakeY = (Math.random() * 2 - 1) * shake;

    this.drawWorld(s, ps, st, dt);
    this.composite(s, ps, st);
    this.overlays(s, ps, st);
  }

  // ───────────────────────── 월드 ─────────────────────────

  private drawWorld(s: GameSession, ps: PresentationState, st: Settings, dt: number): void {
    const ctx = this.wctx;
    const cam = this.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.cfg.tiles[0]!.color;
    ctx.fillRect(0, 0, this.world.width, this.world.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.translate(cam.viewW / 2 + cam.shakeX, cam.viewH / 2 + cam.shakeY);
    ctx.scale(cam.scale, cam.scale);
    ctx.translate(-cam.x, -cam.y);

    const v = cam.visibleTiles();
    const cx0 = Math.floor(v.x0 / CHUNK);
    const cy0 = Math.floor(v.y0 / CHUNK);
    const cx1 = Math.floor(v.x1 / CHUNK);
    const cy1 = Math.floor(v.y1 / CHUNK);
    ctx.imageSmoothingEnabled = true;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunk(cx, cy);
        if (chunk) ctx.drawImage(chunk, cx * CHUNK, cy * CHUNK, CHUNK + SEAM, CHUNK + SEAM);
      }
    }

    // Danger: 벽이 조여 온다 (천장이 낮아지는 감각의 2D 번역)
    const closeIn = this.cfg.presentation.fx.wallCloseIn * (ps.danger + ps.critical * 0.6) * st.distortion;
    if (closeIn > 0.01) {
      ctx.fillStyle = `rgba(30, 30, 38, ${Math.min(0.85, 0.35 + closeIn)})`;
      const pulse = closeIn * (1 + 0.15 * Math.sin(ps.time * 2));
      for (let y = Math.max(0, v.y0); y <= Math.min(this.map.height - 1, v.y1); y++) {
        for (let x = Math.max(0, v.x0); x <= Math.min(this.map.width - 1, v.x1); x++) {
          const d = this.map.def(x, y);
          if (!d.tall || d.id === 'window' || !inRect(this.layer!.rect, x, y)) continue;
          ctx.fillRect(x - pulse, y - pulse, 1 + pulse * 2, 1 + pulse * 2);
        }
      }
    }

    // 밤 어둠은 바닥·소품까지만 덮는다. 시야 콘·표식·간판·사람은 그 위에 그려 밤에도 잘 보이게
    const onGround = this.layer!.id === 'ground';
    const viewRect: Rect = [v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0];
    this.drawStalls(s);
    const night = this.nightLevel(s);
    this.drawProps(night, ps.time);
    const rainHere = s.raining && onGround;
    if (rainHere) this.drawPuddles(ps.time);
    if (night > 0.01 && onGround) this.drawNight(s, night);
    this.drawZones(s, ps);
    this.drawInteractHints(s, ps);
    this.drawViewCones(s, ps);
    const others = s.crowd.agents.filter((a) => a.active).map((a) => a.pos);
    this.pigeons.update(dt, s.player.pos, s.player.running, others);
    if (onGround) this.pigeons.draw(ctx, viewRect, ps.time, false);
    this.drawCrowd(s, ps);
    for (const n of s.activeNpcs()) if (this.visible(n.pos)) this.drawNpc(s, n, ps);
    this.drawPlayer(s, ps);
    // 지붕: 바깥에서는 건물 안이 보이지 않는다. 들어서는 순간 그 건물만 걷힌다
    this.roofs.update(dt, s.player.pos);
    if (onGround) {
      this.roofs.draw(ctx, viewRect, night);
      this.drawCoveredMarkers(s, ps);
    }
    this.drawTimeTint(s, dt, viewRect);
    this.drawLabels(s);
    this.drawGaze(s, ps);
    if (onGround) {
      this.pigeons.draw(ctx, viewRect, ps.time, true);
      drawCloudShadows(ctx, viewRect, { w: this.map.width, h: this.map.height }, ps.time, s.raining ? 0 : this.cfg.presentation.ambient.cloudAlpha * (1 - night), this.cfg.presentation.ambient.cloudSpeed);
    }
    if (rainHere) this.drawRain(ps.time);
    this.updateRings(s, ps, st, dt);
    ctx.restore();
  }

  /** 지붕 아래 목표 지점: 지붕 위에 표식만 올려 둔다 */
  private drawCoveredMarkers(s: GameSession, ps: PresentationState): void {
    const markers = new Set(s.objectives.visible().map((o) => o.def.marker).filter((m): m is string => !!m));
    for (const it of this.cfg.world.interactables) {
      if (!markers.has(it.id)) continue;
      const p = { x: it.at[0], y: it.at[1] };
      if (this.roofs.covers(p)) this.drawBeacon(p.x, p.y, ps.time);
    }
  }

  /** 시간대 빛깔 (아침 푸르스름, 노을빛). 실내에서는 약하게 */
  private drawTimeTint(s: GameSession, dt: number, view: Rect): void {
    const target = this.layer!.id === 'ground' && this.outdoorAt(s.player.pos) ? 1 : 0.35;
    this.outdoorness += (target - this.outdoorness) * Math.min(1, dt * 3);
    const c = timeTint(this.cfg.presentation.ambient, s.clock.minutes);
    const a = c.a * this.outdoorness;
    if (a < 0.005) return;
    const ctx = this.wctx;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(${c.r.toFixed(0)}, ${c.g.toFixed(0)}, ${c.b.toFixed(0)}, ${(a * 2.2).toFixed(3)})`;
    ctx.fillRect(view[0], view[1], view[2], view[3]);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(${c.r.toFixed(0)}, ${c.g.toFixed(0)}, ${c.b.toFixed(0)}, ${(a * 0.35).toFixed(3)})`;
    ctx.fillRect(view[0], view[1], view[2], view[3]);
    ctx.restore();
  }

  /** 0(낮) ~ 1(밤) */
  private nightLevel(s: GameSession): number {
    const n = this.cfg.presentation.night;
    const a = parseTime(n.duskStart);
    const b = parseTime(n.duskEnd);
    const dusk = Math.min(1, Math.max(0, (s.clock.minutes - a) / (b - a)));
    return Math.max(dusk, s.raining ? n.rainOvercast : 0);
  }

  private outdoorAt(p: Vec2): boolean {
    return this.map.areaAt(p.x, p.y)?.kind === 'outdoor';
  }

  /** 비 오는 날 물웅덩이: 바깥 바닥 몇 칸에 고인 물과 퍼지는 파문 */
  private drawPuddles(time: number): void {
    const ctx = this.wctx;
    const v = this.camera.visibleTiles(1);
    for (let y = Math.max(0, v.y0); y <= Math.min(this.map.height - 1, v.y1); y++) {
      for (let x = Math.max(0, v.x0); x <= Math.min(this.map.width - 1, v.x1); x++) {
        let h = Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0;
        if (h % 17 !== 0) continue;
        const d = this.map.def(x, y);
        if (!d.walk || d.id === 'door' || !this.outdoorAt({ x: x + 0.5, y: y + 0.5 }) || !this.visible({ x, y })) continue;
        h >>>= 5;
        const px = x + 0.3 + (h % 5) * 0.1;
        const py = y + 0.3 + ((h >> 3) % 5) * 0.1;
        ctx.fillStyle = 'rgba(150, 175, 205, 0.32)';
        ctx.beginPath();
        ctx.ellipse(px, py, 0.42, 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        for (let i = 0; i < 2; i++) {
          const k = (time * 0.9 + (h % 10) / 10 + i * 0.5) % 1;
          ctx.strokeStyle = `rgba(230, 240, 255, ${(1 - k) * 0.5})`;
          ctx.lineWidth = 0.025;
          ctx.beginPath();
          ctx.ellipse(px + ((i * 0.2) % 0.3) - 0.1, py, 0.05 + k * 0.25, 0.03 + k * 0.15, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  /** 빗줄기: 화면 공간에 그리고, 실내 영역은 지워 낸다 */
  private drawRain(time: number): void {
    const cam = this.camera;
    const l = this.lctx;
    const W = this.light.width;
    const H = this.light.height;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, W, H);
    l.strokeStyle = 'rgba(205, 220, 245, 0.42)';
    l.lineWidth = this.dpr;
    l.beginPath();
    const len = 16 * this.dpr;
    for (let i = 0; i < 260; i++) {
      const a = ((i * 2654435761) >>> 0) / 4294967296;
      const b = ((i * 40503 + 7) % 997) / 997;
      const speed = 900 + b * 500;
      const x = (a * W + time * 120 * this.dpr) % W;
      const y = (b * H + time * speed * this.dpr) % H;
      l.moveTo(x, y);
      l.lineTo(x - len * 0.25, y + len);
    }
    l.stroke();
    l.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    l.translate(cam.viewW / 2 + cam.shakeX, cam.viewH / 2 + cam.shakeY);
    l.scale(cam.scale, cam.scale);
    l.translate(-cam.x, -cam.y);
    l.globalCompositeOperation = 'destination-out';
    l.fillStyle = '#000';
    for (const a of this.cfg.world.areas) if (a.kind !== 'outdoor') l.fillRect(a.rect[0], a.rect[1], a.rect[2], a.rect[3]);
    const ctx = this.wctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0);
    ctx.restore();
  }

  private drawProps(night: number, time: number): void {
    const ctx = this.wctx;
    for (const p of this.cfg.world.props ?? []) {
      const [x, y] = p.at;
      if (Math.abs(x - this.camera.x) > 40 || Math.abs(y - this.camera.y) > 28 || !this.visible({ x, y })) continue;
      drawProp(ctx, p.kind, x, y, p.rot ?? 0, night, time);
    }
  }

  private drawNight(s: GameSession, night: number): void {
    const cam = this.camera;
    const n = this.cfg.presentation.night;
    const l = this.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, this.light.width, this.light.height);
    l.fillStyle = `rgba(12, 16, 42, ${night * n.darkness})`;
    l.fillRect(0, 0, this.light.width, this.light.height);
    l.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    l.translate(cam.viewW / 2 + cam.shakeX, cam.viewH / 2 + cam.shakeY);
    l.scale(cam.scale, cam.scale);
    l.translate(-cam.x, -cam.y);
    l.globalCompositeOperation = 'destination-out';
    // 불 켜진 실내
    l.fillStyle = 'rgba(0,0,0,0.88)';
    for (const a of this.cfg.world.areas) if (a.kind !== 'outdoor') l.fillRect(a.rect[0], a.rect[1], a.rect[2], a.rect[3]);
    const hole = (x: number, y: number, r: number, a: number) => {
      const g = l.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = g;
      l.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const lamps = (this.cfg.world.props ?? []).filter((p) => p.kind === 'lamp' && Math.abs(p.at[0] - cam.x) < 45 && Math.abs(p.at[1] - cam.y) < 32);
    for (const p of lamps) hole(p.at[0], p.at[1] - 0.6, n.lampRadius, 0.95);
    // 창문 불빛이 바깥으로 새어 나온다
    const v = cam.visibleTiles(2);
    for (let y = Math.max(0, v.y0); y <= Math.min(this.map.height - 1, v.y1); y++) {
      for (let x = Math.max(0, v.x0); x <= Math.min(this.map.width - 1, v.x1); x++) {
        if (this.map.def(x, y).id === 'window') hole(x + 0.5, y + 0.5, 1.8, 0.55);
      }
    }
    hole(s.player.pos.x, s.player.pos.y, 2.4, 0.5);
    const ctx = this.wctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.light, 0, 0);
    ctx.restore();
    // 가로등의 따뜻한 빛 번짐
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of lamps) {
      const g = ctx.createRadialGradient(p.at[0], p.at[1] - 0.6, 0, p.at[0], p.at[1] - 0.6, n.lampRadius * 0.6);
      g.addColorStop(0, `rgba(255, 190, 110, ${0.22 * night})`);
      g.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.at[0] - n.lampRadius, p.at[1] - 0.6 - n.lampRadius, n.lampRadius * 2, n.lampRadius * 2);
    }
    ctx.restore();
  }

  private visible(p: Vec2): boolean {
    return !this.layer || inRect(this.layer.rect, p.x, p.y);
  }

  private chunk(cx: number, cy: number): HTMLCanvasElement | null {
    if (cx < 0 || cy < 0 || cx * CHUNK >= this.map.width || cy * CHUNK >= this.map.height) return null;
    const layer = this.layer!;
    const key = `${layer.id}:${cx},${cy}`;
    let c = this.chunks.get(key);
    if (c) {
      // LRU: 최근 사용으로 이동
      this.chunks.delete(key);
      this.chunks.set(key, c);
      return c;
    }
    c = document.createElement('canvas');
    c.width = c.height = CHUNK * CHUNK_PX;
    const g = c.getContext('2d')!;
    g.scale(CHUNK_PX, CHUNK_PX);
    // 바닥을 다 깐 뒤에 장식을 올린다 (나무 그림자처럼 칸 밖으로 번지는 것이 이웃 바닥에 덮이지 않게)
    for (const pass of ['floor', 'deco'] as const) {
      for (let y = 0; y < CHUNK; y++) {
        for (let x = 0; x < CHUNK; x++) {
          const tx = cx * CHUNK + x;
          const ty = cy * CHUNK + y;
          if (inRect(layer.rect, tx, ty)) this.paintTile(g, tx, ty, x, y, pass);
          else if (pass === 'floor') {
            g.fillStyle = this.cfg.tiles[0]!.color;
            g.fillRect(x, y, 1.02, 1.02);
          }
        }
      }
    }
    this.chunks.set(key, c);
    if (this.chunks.size > MAX_CHUNKS) this.chunks.delete(this.chunks.keys().next().value!);
    return c;
  }

  private paintTile(g: CanvasRenderingContext2D, tx: number, ty: number, x: number, y: number, pass: 'floor' | 'deco'): void {
    const m = this.map;
    const d = m.def(tx, ty);
    const n = { up: m.def(tx, ty - 1), down: m.def(tx, ty + 1), left: m.def(tx - 1, ty), right: m.def(tx + 1, ty), upLeft: m.def(tx - 1, ty - 1), upRight: m.def(tx + 1, ty - 1) };
    if (pass === 'deco') {
      if (d.deco) paintDeco(g, d, n, x, y, tx, ty);
      return;
    }
    paintFloor(g, d, n, x, y, tx, ty);
    if (isSolid(d)) {
      // 위쪽은 밝게, 아래쪽은 어둡게 → 살짝 서 있는 느낌
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x, y, 1, 0.18);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x, y + 0.82, 1, 0.18);
    }
    const area = m.areaAt(tx + 0.5, ty + 0.5);
    paintFloorLight(g, d, n, x, y, tx, ty, !!area && area.kind !== 'outdoor');
    if (d.id === 'road' && ty % 6 === 2 && tx % 4 < 2) {
      g.fillStyle = 'rgba(240,230,190,0.5)';
      g.fillRect(x, y + 0.45, 1, 0.08);
    }
  }

  /** 그날만 서는 노점: 줄무늬 천막 + 앞쪽 좌판 */
  private drawStalls(s: GameSession): void {
    const ctx = this.wctx;
    for (const st of s.day.stalls ?? []) {
      const [x, y, w, h] = st.rect;
      if (Math.abs(x - this.camera.x) > 45 || Math.abs(y - this.camera.y) > 35 || !this.visible({ x, y })) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + 0.15, y + 0.25, w, h);
      // 좌판 (천막 아래로 살짝 보이는 앞단)
      ctx.fillStyle = '#c9a27e';
      ctx.fillRect(x + 0.1, y + h - 0.35, w - 0.2, 0.35);
      for (let i = 0; i < w * 2 - 1; i++) {
        ctx.fillStyle = ['#e05a5a', '#f2c94c', '#9fd38a', '#6fb3ff', '#f7f2e8'][(i * 7 + x) % 5]!;
        ctx.fillRect(x + 0.25 + i * 0.5, y + h - 0.28, 0.3, 0.2);
      }
      // 천막: 흰 줄과 색 줄이 번갈아
      const stripes = Math.max(2, Math.round(w * 2));
      for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 ? '#fbf5e6' : st.color;
        ctx.fillRect(x + (i * w) / stripes, y, w / stripes + 0.01, h - 0.4);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x, y + h - 0.55, w, 0.15);
    }
  }

  private drawLabels(s: GameSession): void {
    const ctx = this.wctx;
    ctx.save();
    ctx.font = '600 0.55px system-ui, "Malgun Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const l of this.cfg.world.labels) {
      const [x, y] = l.at;
      if (Math.abs(x - this.camera.x) > 40 || Math.abs(y - this.camera.y) > 30 || !this.visible({ x, y })) continue;
      const text = t(this.cfg.text, l.textKey);
      const w = ctx.measureText(text).width + 0.5;
      if (l.color) {
        // 가게 간판: 색 바탕 + 아랫단 그림자 + 테두리
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        roundRect(ctx, x - w / 2 - 0.15, y - 0.36, w + 0.3, 0.86, 0.12);
        ctx.fill();
        ctx.fillStyle = l.color;
        roundRect(ctx, x - w / 2 - 0.15, y - 0.44, w + 0.3, 0.86, 0.12);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 0.04;
        ctx.stroke();
        ctx.fillStyle = '#fffaf0';
        ctx.fillText(text, x, y - 0.01);
        continue;
      }
      ctx.fillStyle = 'rgba(40,38,44,0.75)';
      roundRect(ctx, x - w / 2, y - 0.38, w, 0.76, 0.2);
      ctx.fill();
      ctx.fillStyle = '#f3ead8';
      ctx.fillText(text, x, y + 0.02);
    }
    void s;
    ctx.restore();
  }

  private drawInteractHints(s: GameSession, ps: PresentationState): void {
    const ctx = this.wctx;
    const p = s.player.pos;
    const range = this.cfg.presentation.fx.markerRange;
    const markers = new Set(s.objectives.visible().map((o) => o.def.marker).filter((m): m is string => !!m));
    for (const it of this.cfg.world.interactables) {
      const [x, y] = it.at;
      if (!this.visible({ x, y })) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (markers.has(it.id)) {
        this.drawBeacon(x, y, ps.time);
        continue;
      }
      if (d > range) continue;
      // 일반 상호작용: 어두운 테두리 + 밝은 고리. 가까울수록 진하다
      const a = 0.35 + Math.max(0, 1 - d / range) * 0.6;
      ctx.lineWidth = 0.1;
      ctx.strokeStyle = `rgba(25, 22, 30, ${a * 0.6})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = `rgba(255, 250, 230, ${a})`;
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 250, 230, ${a})`;
      ctx.beginPath();
      ctx.arc(x, y, 0.08, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const portal of this.cfg.world.portals) {
      const [x, y] = portal.at;
      if (Math.hypot(x - p.x, y - p.y) > range + 2 || !this.visible({ x, y })) continue;
      const k = 0.4 + 0.06 * Math.sin(ps.time * 3);
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = 'rgba(25, 22, 30, 0.45)';
      ctx.beginPath();
      ctx.arc(x, y, k, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = 'rgba(160, 210, 255, 0.9)';
      ctx.stroke();
    }
  }

  /** 목표 지점: 퍼지는 고리 + 위에서 통통 튀는 화살표 (어두운 테두리로 밝은 바닥에서도 보이게) */
  private drawBeacon(x: number, y: number, time: number): void {
    const ctx = this.wctx;
    for (let i = 0; i < 2; i++) {
      const k = (time * 0.8 + i * 0.5) % 1;
      ctx.strokeStyle = `rgba(255, 200, 60, ${(1 - k) * 0.85})`;
      ctx.lineWidth = 0.08;
      ctx.beginPath();
      ctx.arc(x, y, 0.3 + k * 0.9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(25, 22, 30, 0.55)';
    ctx.beginPath();
    ctx.arc(x, y, 0.26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffcf4a';
    ctx.beginPath();
    ctx.arc(x, y, 0.18, 0, Math.PI * 2);
    ctx.fill();
    const by = y - 1.05 - Math.abs(Math.sin(time * 3)) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x - 0.32, by - 0.32);
    ctx.lineTo(x + 0.32, by - 0.32);
    ctx.lineTo(x, by + 0.12);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 0.12;
    ctx.strokeStyle = 'rgba(25, 22, 30, 0.7)';
    ctx.stroke();
    ctx.fillStyle = '#ffcf4a';
    ctx.fill();
  }

  /** NPC 시야: 벽에 가려지는 만큼 잘라 그린다. 평소 노랑 → 알아챔 주황 → 추적 빨강 */
  private drawViewCones(s: GameSession, ps: PresentationState): void {
    const ctx = this.wctx;
    const fx = this.cfg.presentation.fx;
    const p = s.player.pos;
    for (const n of s.activeNpcs()) {
      const prof = n.profile;
      if (!prof.approaches || n.state === 'dialogue' || n.state === 'seated') continue;
      if (Math.hypot(n.pos.x - p.x, n.pos.y - p.y) > prof.viewDistance + 8 || !this.visible(n.pos)) continue;
      const half = (prof.viewHalfAngleDeg * Math.PI) / 180;
      const r = prof.viewDistance;
      const poly = this.sightPolygon(n.pos, n.facing, half, r);
      const heat = n.pursuing ? 1 : Math.min(1, n.notice);
      const rgb = heat >= 1 ? '235, 70, 60' : heat > 0.15 ? '245, 140, 50' : '250, 200, 70';
      const seen = n.percept.inView;
      const a = fx.viewConeAlpha * (0.7 + heat * 0.6) * (seen ? 1 + 0.25 * Math.sin(ps.time * 8) : 1);
      const g = ctx.createRadialGradient(n.pos.x, n.pos.y, 0.3, n.pos.x, n.pos.y, r);
      g.addColorStop(0, `rgba(${rgb}, ${Math.min(0.6, a)})`);
      g.addColorStop(0.7, `rgba(${rgb}, ${Math.min(0.6, a * 0.75)})`);
      g.addColorStop(1, `rgba(${rgb}, ${Math.min(0.6, a * 0.45)})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(n.pos.x, n.pos.y);
      for (const q of poly) ctx.lineTo(q.x, q.y);
      ctx.closePath();
      ctx.fill();
      // 테두리: 어두운 바탕선 + 색 점선 → 밝은 바닥에서도 보인다
      ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(30, 20, 20, ${fx.viewConeEdgeAlpha * 0.45})`;
      ctx.lineWidth = 0.09;
      ctx.stroke();
      ctx.strokeStyle = `rgba(${rgb}, ${fx.viewConeEdgeAlpha})`;
      ctx.lineWidth = 0.05;
      ctx.setLineDash([0.25, 0.15]);
      ctx.lineDashOffset = -ps.time * (0.4 + heat);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** 시선 레이를 부채꼴로 쏘아 벽(sight 타일)에서 멈춘 끝점들 */
  private sightPolygon(o: Vec2, facing: number, half: number, range: number): Vec2[] {
    const rays = Math.max(12, Math.round((half * 2 * range) / 0.6));
    const pts: Vec2[] = [];
    for (let i = 0; i <= rays; i++) {
      const ang = facing - half + (i / rays) * half * 2;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      let d = 0;
      while (d < range) {
        const nd = Math.min(range, d + 0.2);
        if (this.map.blocksSight(Math.floor(o.x + dx * nd), Math.floor(o.y + dy * nd))) break;
        d = nd;
      }
      pts.push({ x: o.x + dx * d, y: o.y + dy * d });
    }
    return pts;
  }

  /** 은신 지점(파랑)·세이프 존(초록): 가까이 가면 테두리와 이름표 */
  private drawZones(s: GameSession, ps: PresentationState): void {
    const ctx = this.wctx;
    const range = this.cfg.presentation.fx.zoneRange;
    const p = s.player.pos;
    const draw = (rect: Rect, rgb: string, label: string, active: boolean) => {
      const [x, y, w, h] = rect;
      const d = Math.hypot(x + w / 2 - p.x, y + h / 2 - p.y);
      if (d > range || !this.visible({ x: x + w / 2, y: y + h / 2 })) return;
      const near = Math.max(0, 1 - d / range);
      ctx.fillStyle = `rgba(${rgb}, ${active ? 0.28 : 0.1 + near * 0.12})`;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = `rgba(${rgb}, ${0.45 + near * 0.45})`;
      ctx.lineWidth = 0.07;
      ctx.setLineDash([0.3, 0.2]);
      ctx.lineDashOffset = -ps.time * 0.3;
      ctx.strokeRect(x + 0.05, y + 0.05, w - 0.1, h - 0.1);
      ctx.setLineDash([]);
      if (near > 0.3) {
        ctx.font = '700 0.42px system-ui, "Malgun Gothic", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(label).width + 0.3;
        ctx.fillStyle = `rgba(20, 24, 32, ${0.7 * near})`;
        roundRect(ctx, x + w / 2 - tw / 2, y - 0.5, tw, 0.5, 0.15);
        ctx.fill();
        ctx.fillStyle = `rgba(${rgb}, ${Math.min(1, near * 1.4)})`;
        ctx.fillText(label, x + w / 2, y - 0.24);
      }
    };
    const hideLabel = t(this.cfg.text, 'hud.hideSpot');
    const safeLabel = t(this.cfg.text, 'hud.safe');
    for (const h of this.cfg.world.hides) draw(h.rect, '110, 170, 255', hideLabel, s.player.hidden && inRect(h.rect, p.x, p.y));
    for (const sf of this.cfg.world.safes) draw(sf.rect, '120, 210, 140', safeLabel, s.player.lockedSafe !== null && inRect(sf.rect, p.x, p.y));
  }

  private drawCrowd(s: GameSession, ps: PresentationState): void {
    const ctx = this.wctx;
    const v = this.camera.visibleTiles(3);
    for (const a of s.crowd.agents) {
      if (!a.active || a.pos.x < v.x0 || a.pos.x > v.x1 || a.pos.y < v.y0 || a.pos.y > v.y1 || !this.visible(a.pos)) continue;
      const r = a.large ? 0.42 : 0.3;
      const bob = Math.sin(a.phase) * 0.03;
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.beginPath();
      ctx.ellipse(a.pos.x, a.pos.y + 0.18, r, r * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // 피곤할수록 군중은 얼굴 없는 회색 덩어리처럼 보인다
      const grey = Math.min(1, ps.tired * 0.6 + ps.danger * 0.4);
      const sat = Math.round(30 * (1 - grey));
      let base = lookFor(`crowd${a.id}`, '#000000');
      // 비 오는 날 바깥 행인은 대부분 우산을 쓴다
      if (s.raining && a.id % 5 !== 0 && this.outdoorAt(a.pos)) base = { ...base, accessory: 'umbrella', accent: UMBRELLAS[a.id % UMBRELLAS.length]! };
      const look: Look =
        grey > 0.5
          ? { ...base, top: hslHex(a.hue, sat, 52 - ps.danger * 12), skin: hslHex(a.hue, 6, 70 - ps.danger * 10), hair: hslHex(a.hue, 6, 34), accessory: base.accessory === 'umbrella' ? 'umbrella' : 'none' }
          : { ...base, top: hslHex(a.hue, sat, 52 - ps.danger * 12) };
      drawPerson(ctx, a.pos.x, a.pos.y, look, { r, facing: Math.atan2(a.dir.y, a.dir.x), walkPhase: a.phase, walking: true, bob, faceless: ps.danger > 0.3 });
    }
  }

  private drawNpc(s: GameSession, n: Npc, ps: PresentationState): void {
    const ctx = this.wctx;
    const { x, y } = n.pos;
    const r = n.radius;
    if (n.type === 'pet') {
      this.drawCat(n, ps);
      return;
    }
    if (n.type === 'ally') {
      // 내 사람: 노란 오라
      const g = ctx.createRadialGradient(x, y, 0.2, x, y, 2.4);
      g.addColorStop(0, `rgba(255, 214, 90, ${0.35 + 0.08 * Math.sin(ps.time * 2)})`);
      g.addColorStop(1, 'rgba(255, 214, 90, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    const walking = n.speed > 0.1;
    const phase = ps.time * 9 + (hashOf(n.id) % 100);
    const bob = walking ? Math.sin(phase * 2) * 0.03 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(x, y + 0.2, r * 1.05, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    const fx = Math.cos(n.facing);
    const fy = Math.sin(n.facing);
    // 손 내밀기(전단지·시식)·손 흔들기
    const reach = n.gesture === 'reach' ? 0.45 : n.gesture === 'wave' ? 0.25 + 0.1 * Math.sin(ps.time * 10) : 0;
    let look = this.lookOf(n);
    if (s.raining && this.outdoorAt(n.pos)) look = { ...look, accessory: 'umbrella', accent: UMBRELLAS[hashOf(n.id) % UMBRELLAS.length]! };
    drawPerson(ctx, x, y, look, { r, facing: n.facing, walkPhase: phase, walking, bob, reach });
    if (n.gesture === 'reach') {
      const hx = x - fy * r * 0.98 + fx * (reach + r * 0.28 + 0.12);
      const hy = y + fx * r * 0.98 + fy * (reach + r * 0.28 + 0.12) + bob;
      ctx.fillStyle = '#fffbe8';
      ctx.fillRect(hx - 0.12, hy - 0.16, 0.24, 0.32);
    }
    // 알아챔 표시 (물음표 → 느낌표). 수치 대신 모양으로
    if (n.notice > 0.15 && n.type !== 'ally' && n.state !== 'dialogue' && n.state !== 'seated') {
      const full = n.pursuing;
      ctx.save();
      ctx.font = `700 ${full ? 0.62 : 0.5}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = full ? '#ff8a6a' : `rgba(255, 240, 210, ${0.4 + n.notice * 0.6})`;
      ctx.fillText(full ? '!' : '?', x, y - r - 0.35 + bob);
      ctx.restore();
    }
    void s;
  }

  private lookOf(n: Npc): Look {
    let look = this.looks.get(n.id);
    if (!look) {
      const named: Accessory[] = ['none', 'none', 'bag', 'glasses', 'phone', 'backpack'];
      look = lookFor(n.id, n.profile.color, n.profile.look, named);
      this.looks.set(n.id, look);
    }
    return look;
  }

  private drawCat(n: Npc, ps: PresentationState): void {
    const ctx = this.wctx;
    const { x, y } = n.pos;
    const fx = Math.cos(n.facing);
    const fy = Math.sin(n.facing);
    ctx.fillStyle = n.profile.color;
    ctx.beginPath();
    ctx.ellipse(x, y, 0.3, 0.2, n.facing, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + fx * 0.27, y + fy * 0.27, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = n.profile.color;
    ctx.lineWidth = 0.07;
    ctx.beginPath();
    ctx.moveTo(x - fx * 0.28, y - fy * 0.28);
    ctx.quadraticCurveTo(x - fx * 0.5 + Math.sin(ps.time * 3) * 0.15, y - fy * 0.5, x - fx * 0.55, y - fy * 0.55 - 0.15);
    ctx.stroke();
  }

  private drawPlayer(s: GameSession, ps: PresentationState): void {
    const ctx = this.wctx;
    const p = s.player;
    if (s.mode.kind === 'travel') return;
    const { x, y } = p.pos;
    const r = this.cfg.player.radius;
    // 번아웃: 주저앉는다
    const sink = ps.burnoutTime >= 0 ? Math.min(1, ps.burnoutTime / 1.5) : 0;
    const bob = p.moving ? Math.sin(p.walkPhase) * 0.035 : 0;
    // 개인 공간 버블
    ctx.strokeStyle = `rgba(255,255,255,${0.08 + ps.stress * 0.12})`;
    ctx.lineWidth = 0.04;
    ctx.setLineDash([0.12, 0.12]);
    ctx.beginPath();
    ctx.arc(x, y, this.cfg.balance.personalSpace.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, y + 0.2, r * 1.1 * (1 + sink * 0.4), r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const scale = 1 - sink * 0.25;
    ctx.save();
    ctx.translate(x, y + bob + sink * 0.12);
    // 흐물흐물: 옆으로 퍼지며 꺼지고, 잠깐 출렁인다
    const wobble = sink * (1 - sink * 0.6) * 0.08 * Math.sin(ps.burnoutTime * 9);
    ctx.scale(scale * (1 + sink * 0.35 + wobble), scale * (1 - sink * 0.35 - wobble));
    // 후드티 (모자 부분은 등 뒤 반원)
    const hoodie = s.player.hidden ? '#567a8f' : '#6c8fb2';
    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    ctx.fillStyle = '#58799b';
    ctx.beginPath();
    ctx.ellipse(-fx * r * 0.55, -fy * r * 0.55, r * 0.42, r * 0.62, p.facing, 0, Math.PI * 2);
    ctx.fill();
    drawPerson(ctx, 0, 0, PLAYER_LOOK_BASE(hoodie), { r, facing: p.facing, walkPhase: p.walkPhase, walking: p.moving && ps.cover < 0.3, noHead: true });
    // 얼굴: 홍조만큼 붉어진다
    const fl = ps.flush;
    ctx.fillStyle = `rgb(${240 + fl * 10}, ${218 - fl * 90}, ${196 - fl * 90})`;
    const look = ps.phone > 0.5 ? 0.12 : 0.3;
    ctx.beginPath();
    ctx.arc(fx * r * look, fy * r * look, r * 0.56, 0, Math.PI * 2);
    ctx.fill();
    // 머리카락 (뒤통수)
    ctx.fillStyle = '#3a2c25';
    ctx.beginPath();
    ctx.arc(fx * r * (look - 0.08), fy * r * (look - 0.08), r * 0.58, p.facing + Math.PI * 0.45, p.facing + Math.PI * 1.55);
    ctx.closePath();
    ctx.fill();
    if (!p.mask) {
      ctx.fillStyle = '#2e2a30';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        if (ps.eyes > 0.5) ctx.rect(fx * r * 0.62 - fy * side * 0.1 - 0.05, fy * r * 0.62 + fx * side * 0.1 - 0.012, 0.1, 0.024);
        else ctx.arc(fx * r * 0.62 - fy * side * 0.1, fy * r * 0.62 + fx * side * 0.1, 0.045, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#e8edf0';
      ctx.beginPath();
      ctx.arc(fx * r * 0.5, fy * r * 0.5, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3d4250';
      ctx.beginPath();
      ctx.arc(-fx * r * 0.1, -fy * r * 0.1, r * 0.62, p.facing + Math.PI * 0.6, p.facing + Math.PI * 1.4);
      ctx.fill();
    }
    if (p.earphones) {
      ctx.fillStyle = '#f5f5f5';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(-fy * side * r * 0.62, fx * side * r * 0.62, 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (ps.cover > 0.3) {
      ctx.fillStyle = '#f0d4bb';
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(fx * r * 0.5 - fy * side * r * 0.55, fy * r * 0.5 + fx * side * r * 0.55, 0.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (ps.phone > 0.3) {
      ctx.fillStyle = '#20232b';
      ctx.fillRect(fx * r * 0.95 - 0.1, fy * r * 0.95 - 0.13, 0.2, 0.26);
      ctx.fillStyle = `rgba(160, 210, 255, ${0.8 * ps.phone})`;
      ctx.fillRect(fx * r * 0.95 - 0.07, fy * r * 0.95 - 0.1, 0.14, 0.2);
    }
    // 우산 (내 표정이 보이도록 반투명)
    if (s.raining && p.inventory.gear.includes('umbrella') && this.outdoorAt(p.pos)) drawUmbrella(ctx, 0, 0, r, p.facing, '#3b6fb6', 0.78);
    // 진땀
    if (ps.sweat > 0.3) {
      ctx.fillStyle = 'rgba(170, 215, 255, 0.85)';
      const k = (ps.time * 1.5) % 1;
      ctx.beginPath();
      ctx.arc(r * 0.7, -r * 0.5 + k * 0.4, 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** 나를 보는 시선: 가늘고 따가운 선 */
  private drawGaze(s: GameSession, ps: PresentationState): void {
    const ctx = this.wctx;
    const p = s.player.pos;
    const alpha = this.cfg.presentation.fx.gazeLineAlpha;
    for (const n of s.activeNpcs()) {
      if (!n.gazing || n.type === 'ally' || n.type === 'pet') continue;
      const d = Math.hypot(n.pos.x - p.x, n.pos.y - p.y);
      if (d > this.cfg.balance.gaze.range) continue;
      const a = alpha * Math.min(1, n.notice) * (0.6 + 0.4 * ps.stress);
      ctx.strokeStyle = n.percept.eyeContact ? `rgba(255, 120, 100, ${a})` : `rgba(255, 230, 200, ${a * 0.6})`;
      ctx.lineWidth = 0.035 + ps.flush * 0.03;
      ctx.beginPath();
      const steps = Math.ceil(d * 3);
      for (let i = 0; i <= steps; i++) {
        const k = i / steps;
        const jitter = (i % 2 === 0 ? 1 : -1) * 0.06 * (0.3 + ps.stress) * (i > 0 && i < steps ? 1 : 0);
        const nx = -(p.y - n.pos.y) / d;
        const ny = (p.x - n.pos.x) / d;
        const px = n.pos.x + (p.x - n.pos.x) * k + nx * jitter;
        const py = n.pos.y + (p.y - n.pos.y) * k + ny * jitter;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }

  /** 소리의 시각 대체 표시: 발소리·말소리 파동. 이어폰을 끼면 보이지 않는다 (후방 접근 감지 불가) */
  private updateRings(s: GameSession, ps: PresentationState, st: Settings, dt: number): void {
    const ctx = this.wctx;
    const p = s.player.pos;
    this.ringTimer -= dt;
    if (this.ringTimer <= 0 && st.visualCues && this.cfg.presentation.fx.soundRings) {
      this.ringTimer = 0.45;
      for (const n of s.activeNpcs()) {
        if (Math.hypot(n.pos.x - p.x, n.pos.y - p.y) > 14) continue;
        if (n.speed > 0.1 && ps.earphones < 0.5) this.rings.push({ x: n.pos.x, y: n.pos.y, age: 0, life: 0.9, radius: n.pursuing ? 1.6 : 1, color: n.pursuing ? '255,150,120' : '230,230,240' });
        if (n.state === 'dialogue' && s.mode.kind !== 'dialogue') this.rings.push({ x: n.pos.x, y: n.pos.y, age: 0, life: 1, radius: 1.3, color: '255,220,160' });
      }
      if (s.phone.ringing) this.rings.push({ x: p.x, y: p.y, age: 0, life: 0.6, radius: 1.2, color: '160,210,255' });
    }
    for (const e of ps.sounds) if (e.id === 'knock' || e.id === 'doorbell') this.rings.push({ x: p.x, y: p.y, age: 0, life: 1, radius: 3, color: '255,190,120' });
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    ctx.lineWidth = 0.05;
    for (const r of this.rings) {
      const k = r.age / r.life;
      ctx.strokeStyle = `rgba(${r.color}, ${(1 - k) * 0.5})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 0.3 + k * r.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // ───────────────────────── 합성 ─────────────────────────

  private composite(s: GameSession, ps: PresentationState, st: Settings): void {
    const ctx = this.ctx;
    const fx = this.cfg.presentation.fx;
    const dist = st.distortion;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    const sat = Math.max(0.15, 1 - ps.tired * fx.tiredDesaturation - ps.danger * 0.2 - ps.critical * 0.25 + ps.sanctuary * 0.1);
    const blur = st.chromatic ? ps.migraine * fx.migraineBlurPx * dist : 0;
    const sepia = ps.sanctuary * fx.homeAmber;
    const bright = 1 + ps.migraine * 0.15 * dist - ps.critical * 0.12 + ps.sanctuary * 0.03;
    const filter = `saturate(${sat.toFixed(3)}) sepia(${sepia.toFixed(3)}) brightness(${bright.toFixed(3)})${blur > 0.05 ? ` blur(${(blur * this.dpr).toFixed(2)}px)` : ''}`;

    // Danger: 진행 방향으로 공간이 늘어난다 (복도가 길어 보이는 원근 왜곡)
    const stretch = this.cfg.presentation.camera.dangerStretch * (ps.danger + ps.critical * 0.5) * dist;
    const md = s.player.moveDir;
    if (md) this.stretchAxis = lerpAngle(this.stretchAxis, Math.atan2(md.y, md.x), 0.05);
    const pp = this.camera.toScreen(s.player.pos);
    ctx.save();
    if (stretch > 0.002) {
      ctx.translate(pp.x * this.dpr, pp.y * this.dpr);
      ctx.rotate(this.stretchAxis);
      ctx.scale(1 + stretch, 1 - stretch * 0.3);
      ctx.rotate(-this.stretchAxis);
      ctx.translate(-pp.x * this.dpr, -pp.y * this.dpr);
    }
    ctx.filter = filter;
    ctx.drawImage(this.world, 0, 0);
    ctx.filter = 'none';
    // 편두통: 색수차(겹쳐 보임)와 번지는 빛
    if (st.chromatic && ps.migraine > 0.04) {
      const off = fx.chromaticPx * ps.migraine * dist * this.dpr * (1 + 0.3 * Math.sin(ps.time * 5));
      ctx.globalAlpha = 0.22 * ps.migraine;
      ctx.filter = `${filter} hue-rotate(110deg)`;
      ctx.drawImage(this.world, off, 0);
      ctx.filter = `${filter} hue-rotate(-110deg)`;
      ctx.drawImage(this.world, -off, off * 0.3);
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `blur(${(6 * this.dpr).toFixed(1)}px)`;
      ctx.globalAlpha = 0.1 * ps.migraine;
      ctx.drawImage(this.world, 0, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // ───────────────────────── 심리 오버레이 ─────────────────────────

  private overlays(s: GameSession, ps: PresentationState, st: Settings): void {
    const ctx = this.ctx;
    const fx = this.cfg.presentation.fx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const d = this.dpr;
    const pp = this.camera.toScreen(s.player.pos);
    const cx = pp.x * d;
    const cy = pp.y * d;
    const tile = this.camera.scale * d;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // 시야 반경: 지칠수록 주변이 어두워지고 좁아진다 (터널)
    const lightT = Math.min(1, ps.tired * 0.25 + ps.danger * 0.45 + ps.critical * 0.6);
    const radius = (fx.lightRadiusTiles + (fx.lightRadiusCritical - fx.lightRadiusTiles) * lightT) * tile * (1 - ps.phone * fx.lightRadiusTiles * 0.04);
    const dark = Math.min(0.94, 0.12 + ps.tired * 0.15 + ps.danger * 0.3 + ps.critical * fx.criticalTunnel * 0.5 + ps.phone * 0.35) * (1 - ps.sanctuary * 0.85);
    if (dark > 0.02) {
      const g = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius * 1.15);
      g.addColorStop(0, 'rgba(8,8,12,0)');
      g.addColorStop(1, `rgba(8,8,12,${dark})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 스트레스: 붉은 테두리 비네팅 (심박에 맞춰 조여 든다)
    const v = ps.stress * fx.stressVignette * (1 - ps.sanctuary);
    if (v > 0.02) {
      const inner = Math.min(W, H) * (0.42 - 0.08 * ps.beat * ps.stress);
      const g = ctx.createRadialGradient(W / 2, H / 2, inner, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, 'rgba(120, 10, 20, 0)');
      g.addColorStop(1, fx.redTint.replace(/[\d.]+\)$/, `${Math.min(0.75, v)})`));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Critical: 검은 터널 + 박동
    if (ps.critical > 0.02) {
      const inner = Math.min(W, H) * (0.3 - ps.critical * 0.12 - ps.beat * 0.03);
      const g = ctx.createRadialGradient(cx, cy, Math.max(10, inner), cx, cy, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${ps.critical * fx.criticalTunnel})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 홍조: 화면 아래에서 올라오는 붉은 열 아지랑이
    if (ps.flush > 0.03) {
      const h = H * fx.flushHeight * (0.5 + ps.flush * 0.5);
      for (let i = 0; i < 6; i++) {
        const yy = H - (h * i) / 6;
        const wave = Math.sin(ps.time * 3 + i * 1.3) * 8 * d * st.distortion;
        const g = ctx.createLinearGradient(0, yy - h / 6, 0, yy);
        const a = ps.flush * 0.22 * (1 - i / 6);
        g.addColorStop(0, 'rgba(220, 50, 50, 0)');
        g.addColorStop(1, `rgba(225, 60, 55, ${a})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        for (let x = 0; x <= W; x += W / 12) ctx.lineTo(x, yy - h / 6 + Math.sin(x / (80 * d) + ps.time * 2 + i) * wave);
        ctx.lineTo(W, yy);
        ctx.closePath();
        ctx.fill();
      }
    }

    // 폰 화면만 보는 중: 아래쪽에서 올라오는 차가운 빛
    if (ps.phone > 0.05) {
      const g = ctx.createRadialGradient(cx, cy + 40 * d, 5, cx, cy + 40 * d, 160 * d);
      g.addColorStop(0, `rgba(150, 200, 255, ${0.18 * ps.phone})`);
      g.addColorStop(1, 'rgba(150, 200, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 안전지대: 앰버 톤
    if (ps.sanctuary > 0.02) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.7);
      g.addColorStop(0, `rgba(255, 190, 110, ${0.1 * ps.sanctuary})`);
      g.addColorStop(1, `rgba(120, 60, 20, ${0.28 * ps.sanctuary})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 기습: 짧은 섬광 (깜빡임 끄기 지원)
    if (st.flash && ps.trauma > 0.5) {
      ctx.fillStyle = `rgba(255, 245, 235, ${(ps.trauma - 0.5) * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (st.flash && ps.hurt > 0.05) {
      ctx.fillStyle = `rgba(160, 20, 30, ${ps.hurt * 0.12})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 눈 감기: 암전. 소리 파동만 희미하게 남는다
    if (ps.eyes > 0.01) {
      ctx.fillStyle = `rgba(4, 4, 8, ${ps.eyes * 0.96})`;
      ctx.fillRect(0, 0, W, H);
    }

    // 번아웃: 시야 암전
    if (ps.burnoutTime >= 0) {
      const k = Math.min(1, ps.burnoutTime / fx.burnoutFadeSec);
      const g = ctx.createRadialGradient(cx, cy, Math.max(1, (1 - k) * Math.max(W, H) * 0.5), cx, cy, Math.max(W, H));
      g.addColorStop(0, `rgba(0,0,0,${k * k})`);
      g.addColorStop(1, `rgba(0,0,0,${Math.min(1, k * 1.5)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // 외시경: 둥근 렌즈 너머로만 보인다
    if (s.mode.kind === 'peephole') {
      const r = Math.min(W, H) * 0.32;
      const g = ctx.createRadialGradient(W / 2, H / 2, r * 0.85, W / 2, H / 2, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2, true);
      ctx.fill();
    }

    // 이동 중 페이드 (계단·지하철)
    if (s.mode.kind === 'travel') {
      const m = s.mode;
      const k = Math.min(1, Math.min(m.timer, m.total - m.timer) / 0.4);
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, Math.min(1, k))})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (s.mode.kind === 'elevator' && s.mode.phase === 'riding') {
      ctx.fillStyle = `rgba(20,20,26,${0.25 + ps.awkward * 0.25})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /** 전체 지도 (폰 지도 앱) 용 미니맵 이미지 */
  buildMinimap(scale: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.map.width * scale;
    c.height = 140 * scale;
    const g = c.getContext('2d')!;
    for (let y = 0; y < 140; y++) {
      for (let x = 0; x < this.map.width; x++) {
        g.fillStyle = this.map.def(x, y).color;
        g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    g.font = `600 ${scale * 2.6}px system-ui, "Malgun Gothic", sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const l of this.cfg.world.labels) {
      if (l.at[1] >= 140) continue;
      const text = t(this.cfg.text, l.textKey);
      const w = g.measureText(text).width + scale * 2;
      g.fillStyle = 'rgba(30,28,34,0.8)';
      g.fillRect(l.at[0] * scale - w / 2, l.at[1] * scale - scale * 1.8, w, scale * 3.6);
      g.fillStyle = '#f3ead8';
      g.fillText(text, l.at[0] * scale, l.at[1] * scale);
    }
    return c;
  }
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export type { Vec2 };
