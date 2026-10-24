import type { Vec2 } from '../world/TileMap';

/** 2D 카메라. 월드(타일 단위) ↔ 화면(CSS px) 변환. 왜곡(늘림)·흔들림은 렌더러가 따로 곱한다. */
export class Camera2D {
  x = 0;
  y = 0;
  /** 타일 1칸의 화면 크기 (CSS px) */
  scale = 30;
  viewW = 1;
  viewH = 1;
  shakeX = 0;
  shakeY = 0;

  follow(target: Vec2, dt: number, lerp: number, snap = false): void {
    if (snap || Math.hypot(target.x - this.x, target.y - this.y) > 30) {
      this.x = target.x;
      this.y = target.y;
      return;
    }
    const k = 1 - Math.exp(-lerp * dt);
    this.x += (target.x - this.x) * k;
    this.y += (target.y - this.y) * k;
  }

  toScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.x) * this.scale + this.viewW / 2 + this.shakeX, y: (p.y - this.y) * this.scale + this.viewH / 2 + this.shakeY };
  }

  toWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.viewW / 2 - this.shakeX) / this.scale + this.x, y: (sy - this.viewH / 2 - this.shakeY) / this.scale + this.y };
  }

  /** 화면에 보이는 타일 범위 (여유 포함) */
  visibleTiles(margin = 2): { x0: number; y0: number; x1: number; y1: number } {
    const hw = this.viewW / 2 / this.scale + margin;
    const hh = this.viewH / 2 / this.scale + margin;
    return { x0: Math.floor(this.x - hw), y0: Math.floor(this.y - hh), x1: Math.ceil(this.x + hw), y1: Math.ceil(this.y + hh) };
  }
}
