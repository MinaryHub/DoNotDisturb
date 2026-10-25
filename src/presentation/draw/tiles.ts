// 타일 장식 (tiles.json의 deco). 청크 캐시에 한 번만 그려지므로 조금 공들여도 된다.
// 같은 칸은 항상 같은 모양: 칸 좌표 해시로 상품 색·소품 유무를 정한다.

import type { TileDef } from '../../world/TileMap';
import { shade } from './people';

export type TileDeco =
  | 'wall'
  | 'window'
  | 'door'
  | 'doorClosed'
  | 'desk'
  | 'shelf'
  | 'rack'
  | 'table'
  | 'counter'
  | 'bed'
  | 'sofa'
  | 'tree'
  | 'plant'
  | 'appliance'
  | 'grill'
  | 'partition'
  | 'grass'
  | 'bench'
  | 'books'
  | 'washer'
  | 'vending';

export interface TileNeighbors {
  up: TileDef;
  down: TileDef;
  left: TileDef;
  right: TileDef;
  upLeft: TileDef;
  upRight: TileDef;
}

const PRODUCT = ['#e05a5a', '#f2c94c', '#6fb3ff', '#9fd38a', '#f29e4c', '#c49bd8', '#f7f2e8', '#5bc0be'];
const BOOKS = ['#8b3a3a', '#2f4858', '#d9cbb4', '#355e3b', '#c9824a', '#4b5563', '#e8d5c4', '#6c5b7b'];
const CLOTHES = ['#e8d5c4', '#6c8fb2', '#b56576', '#2f3e46', '#e0a26a', '#84a98c', '#f2e8cf'];

function hash2(x: number, y: number, salt = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 1274126177);
  h ^= h >>> 13;
  h = Math.imul(h, 1103515245);
  return (h ^ (h >>> 16)) >>> 0;
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** (x, y): 청크 안 칸 좌표, (tx, ty): 월드 칸 좌표 */
export function paintDeco(g: CanvasRenderingContext2D, d: TileDef, n: TileNeighbors, x: number, y: number, tx: number, ty: number): void {
  const h = hash2(tx, ty);
  switch (d.deco) {
    case 'wall':
    case 'partition': {
      // 윗면(갓) + (아래가 트였으면) 앞면. 탑다운에 살짝 기울인 시점
      const cap = d.deco === 'partition' ? 0.62 : 0.68;
      g.fillStyle = shade(d.color, 0.06);
      g.fillRect(x, y, 1.02, n.down.tall ? 1.02 : cap);
      g.fillStyle = shade(d.color, 0.16);
      g.fillRect(x, y, 1.02, 0.06);
      // 갓 테두리: 바닥과 맞닿은 옆면은 어둡게 끊어 준다
      g.fillStyle = 'rgba(0,0,0,0.22)';
      if (!n.left.tall) g.fillRect(x, y, 0.05, n.down.tall ? 1.02 : cap);
      if (!n.right.tall) g.fillRect(x + 0.95, y, 0.05, n.down.tall ? 1.02 : cap);
      if (!n.up.tall) g.fillRect(x, y, 1.02, 0.04);
      if (!n.down.tall) {
        const face = g.createLinearGradient(0, y + cap, 0, y + 1);
        face.addColorStop(0, shade(d.color, -0.18));
        face.addColorStop(1, shade(d.color, -0.36));
        g.fillStyle = face;
        g.fillRect(x, y + cap, 1.02, 1 - cap);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x, y + cap, 1.02, 0.025);
        // 걸레받이
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(x, y + 0.95, 1.02, 0.05);
        if (d.deco === 'wall') {
          // 벽돌 줄눈
          g.fillStyle = 'rgba(0,0,0,0.10)';
          g.fillRect(x, y + cap + (1 - cap) / 2, 1.02, 0.015);
          g.fillRect(x + (h % 2 ? 0.25 : 0.7), y + cap + 0.02, 0.02, (1 - cap) / 2 - 0.02);
          g.fillRect(x + (h % 2 ? 0.7 : 0.25) - 0.25, y + cap + (1 - cap) / 2, 0.02, (1 - cap) / 2 - 0.05);
        } else {
          // 칸막이: 천 질감 줄
          g.fillStyle = 'rgba(255,255,255,0.06)';
          for (let i = 0; i < 4; i++) g.fillRect(x + 0.1 + i * 0.25, y + cap + 0.03, 0.02, 0.28);
        }
      }
      break;
    }
    case 'window': {
      g.strokeStyle = '#5d6b78';
      g.lineWidth = 0.08;
      g.strokeRect(x + 0.04, y + 0.04, 0.92, 0.92);
      g.fillStyle = 'rgba(255,255,255,0.28)';
      g.beginPath();
      g.moveTo(x + 0.15, y + 0.85);
      g.lineTo(x + 0.45, y + 0.15);
      g.lineTo(x + 0.6, y + 0.15);
      g.lineTo(x + 0.3, y + 0.85);
      g.closePath();
      g.fill();
      g.fillStyle = '#5d6b78';
      if (n.left.deco === 'window' || n.right.deco === 'window') g.fillRect(x + 0.47, y, 0.06, 1);
      else g.fillRect(x, y + 0.47, 1, 0.06);
      break;
    }
    case 'door': {
      // 문턱 + 매트
      g.fillStyle = shade(d.color, -0.25);
      const vertical = n.up.tall && n.down.tall;
      if (vertical) g.fillRect(x + 0.42, y, 0.16, 1);
      else g.fillRect(x, y + 0.42, 1, 0.16);
      g.fillStyle = 'rgba(70, 60, 50, 0.25)';
      if (vertical) g.fillRect(x + 0.1, y + 0.15, 0.25, 0.7);
      else g.fillRect(x + 0.15, y + 0.62, 0.7, 0.25);
      break;
    }
    case 'doorClosed': {
      g.strokeStyle = shade(d.color, -0.3);
      g.lineWidth = 0.05;
      g.strokeRect(x + 0.1, y + 0.1, 0.8, 0.8);
      g.fillStyle = '#d8c39a';
      circle(g, x + 0.75, y + 0.5, 0.07);
      break;
    }
    case 'desk': {
      // 이웃 책상과 이어지는 상판 + 모니터·키보드·마우스·소품
      const l = n.left.deco === 'desk' ? 0 : 0.04;
      const r = n.right.deco === 'desk' ? 0 : 0.04;
      g.fillStyle = shade(d.color, 0.14);
      g.fillRect(x + l, y + 0.04, 1.02 - l - r, 0.88);
      g.fillStyle = 'rgba(70, 45, 25, 0.10)';
      for (let i = 0; i < 3; i++) g.fillRect(x + l, y + 0.2 + i * 0.27 + (h % 3) * 0.02, 1.02 - l - r, 0.012);
      g.fillStyle = shade(d.color, -0.2);
      g.fillRect(x + l, y + 0.88, 1.02 - l - r, 0.06);
      if ((n.up.deco === 'desk' || n.down.deco === 'desk') && n.left.deco !== 'desk' && n.right.deco !== 'desk') {
        // 세로로 이어진 창가 바 자리: 노트북이나 컵 한 잔
        if (h % 4 === 0) {
          g.fillStyle = '#c9ccd2';
          g.fillRect(x + 0.22, y + 0.25, 0.5, 0.4);
          g.fillStyle = '#2b2f38';
          g.fillRect(x + 0.22, y + 0.2, 0.5, 0.06);
          g.fillStyle = 'rgba(0,0,0,0.15)';
          for (let row = 0; row < 3; row++) g.fillRect(x + 0.27, y + 0.32 + row * 0.07, 0.4, 0.035);
        } else if (h % 4 !== 3) {
          g.fillStyle = '#f4f1ea';
          circle(g, x + 0.45, y + 0.48, 0.15);
          g.fillStyle = '#fafafa';
          circle(g, x + 0.45, y + 0.48, 0.09);
          g.fillStyle = '#6b4a33';
          circle(g, x + 0.45, y + 0.48, 0.065);
        }
        break;
      }
      if (h % 4 !== 3) {
        // 모니터: 받침 → 화면 (빛이 살짝 번진다)
        g.fillStyle = '#3a3e47';
        g.fillRect(x + 0.44, y + 0.2, 0.12, 0.1);
        g.beginPath();
        g.ellipse(x + 0.5, y + 0.3, 0.12, 0.05, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(160, 200, 240, 0.18)';
        g.fillRect(x + 0.12, y + 0.18, 0.76, 0.12);
        g.fillStyle = '#23262d';
        g.fillRect(x + 0.16, y + 0.08, 0.68, 0.12);
        g.fillStyle = h % 3 === 0 ? '#3d5f80' : 'rgba(140, 190, 240, 0.75)';
        g.fillRect(x + 0.19, y + 0.1, 0.62, 0.07);
        g.fillStyle = 'rgba(255,255,255,0.35)';
        g.fillRect(x + 0.22, y + 0.115, 0.2, 0.012);
        g.fillRect(x + 0.22, y + 0.14, 0.32, 0.012);
        // 키보드 + 마우스
        g.fillStyle = '#e4e6ea';
        g.fillRect(x + 0.22, y + 0.46, 0.5, 0.17);
        g.fillStyle = 'rgba(0,0,0,0.16)';
        for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) g.fillRect(x + 0.245 + i * 0.065, y + 0.48 + row * 0.05, 0.045, 0.03);
        g.fillStyle = '#d7d9de';
        g.beginPath();
        g.ellipse(x + 0.82, y + 0.56, 0.05, 0.07, 0, 0, Math.PI * 2);
        g.fill();
      } else {
        // 서류 더미 + 펜
        g.fillStyle = '#f7f4ec';
        g.fillRect(x + 0.2, y + 0.18, 0.4, 0.5);
        g.fillStyle = '#e9e3d6';
        g.fillRect(x + 0.25, y + 0.23, 0.4, 0.5);
        g.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 5; i++) g.fillRect(x + 0.3, y + 0.3 + i * 0.07, 0.28 - (i % 2) * 0.08, 0.015);
        g.fillStyle = '#3b6fb6';
        g.fillRect(x + 0.7, y + 0.3, 0.03, 0.3);
      }
      if (h % 5 === 0) {
        // 머그컵
        g.fillStyle = PRODUCT[h % PRODUCT.length]!;
        circle(g, x + 0.84, y + 0.3, 0.08);
        g.fillStyle = '#5a3d2b';
        circle(g, x + 0.84, y + 0.3, 0.05);
      } else if (h % 5 === 1) {
        // 포스트잇
        g.fillStyle = '#f6e27a';
        g.fillRect(x + 0.08, y + 0.6, 0.12, 0.12);
      } else if (h % 7 === 2) {
        // 작은 화분
        g.fillStyle = '#c9805a';
        circle(g, x + 0.86, y + 0.32, 0.07);
        g.fillStyle = '#6fa060';
        circle(g, x + 0.84, y + 0.29, 0.06);
        circle(g, x + 0.89, y + 0.33, 0.05);
      }
      break;
    }
    case 'shelf': {
      // 진열대: 세 단 선반, 상자·병이 섞인 상품, 앞쪽 가격표 띠
      g.fillStyle = shade(d.color, 0.15);
      g.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
      for (let row = 0; row < 3; row++) {
        const sy = y + 0.08 + row * 0.29;
        g.fillStyle = shade(d.color, -0.18);
        g.fillRect(x + 0.04, sy + 0.25, 0.92, 0.035);
        g.fillStyle = 'rgba(255,255,255,0.7)';
        g.fillRect(x + 0.1 + (hash2(tx, ty, row) % 5) * 0.15, sy + 0.252, 0.08, 0.03);
        for (let col = 0; col < 4; col++) {
          const k = hash2(tx, ty, row * 4 + col);
          if (k % 7 === 0) continue;
          const c = PRODUCT[k % PRODUCT.length]!;
          const px = x + 0.08 + col * 0.215;
          g.fillStyle = shade(c, -0.15);
          if (k % 3 === 0) {
            circle(g, px + 0.09, sy + 0.13, 0.085);
            g.fillStyle = c;
            circle(g, px + 0.085, sy + 0.12, 0.065);
            g.fillStyle = 'rgba(255,255,255,0.45)';
            circle(g, px + 0.065, sy + 0.1, 0.02);
          } else {
            g.fillRect(px, sy + 0.02, 0.18, 0.22);
            g.fillStyle = c;
            g.fillRect(px, sy + 0.02, 0.18, 0.16);
            g.fillStyle = 'rgba(255,255,255,0.3)';
            g.fillRect(px + 0.03, sy + 0.06, 0.12, 0.03);
          }
        }
      }
      break;
    }
    case 'rack': {
      // 옷걸이 봉 + 걸린 옷
      g.fillStyle = '#c9c9cf';
      g.fillRect(x, y + 0.47, 1, 0.06);
      for (let i = 0; i < 3; i++) {
        const k = hash2(tx, ty, i);
        g.fillStyle = CLOTHES[k % CLOTHES.length]!;
        g.beginPath();
        g.ellipse(x + 0.18 + i * 0.32, y + 0.5, 0.13, 0.36, 0, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'table': {
      // 이어 붙인 탁자는 한 상판처럼, 접시·컵·수저
      const l = n.left.deco === 'table' ? 0 : 0.05;
      const r = n.right.deco === 'table' ? 0 : 0.05;
      const t = n.up.deco === 'table' ? 0 : 0.05;
      const b = n.down.deco === 'table' ? 0 : 0.05;
      g.fillStyle = shade(d.color, -0.18);
      g.fillRect(x + l, y + t + 0.04, 1.02 - l - r, 1.02 - t - b);
      g.fillStyle = shade(d.color, 0.12);
      g.fillRect(x + l, y + t, 1.02 - l - r, 1.02 - t - b - 0.04);
      g.fillStyle = 'rgba(70, 45, 25, 0.10)';
      for (let i = 0; i < 3; i++) g.fillRect(x + l, y + 0.22 + i * 0.25, 1.02 - l - r, 0.012);
      if (h % 3 !== 0) {
        g.fillStyle = 'rgba(0,0,0,0.10)';
        circle(g, x + 0.37, y + 0.53, 0.17);
        g.fillStyle = '#f4f1ea';
        circle(g, x + 0.35, y + 0.5, 0.17);
        g.fillStyle = '#e4e0d6';
        circle(g, x + 0.35, y + 0.5, 0.12);
        g.fillStyle = h % 2 ? '#d98c5f' : '#9fd38a';
        circle(g, x + 0.35, y + 0.5, 0.07);
        g.fillStyle = '#c9c9cf';
        g.fillRect(x + 0.56, y + 0.36, 0.025, 0.3);
        g.fillRect(x + 0.6, y + 0.36, 0.025, 0.3);
      }
      if (h % 4 === 1) {
        g.fillStyle = 'rgba(255,255,255,0.8)';
        circle(g, x + 0.78, y + 0.28, 0.09);
        g.fillStyle = '#a3c9d8';
        circle(g, x + 0.78, y + 0.28, 0.065);
      }
      break;
    }
    case 'counter': {
      // 상판(밝게) + 앞면(어둡게), 가끔 단말기·컵 더미·냅킨
      g.fillStyle = shade(d.color, 0.22);
      g.fillRect(x, y + 0.05, 1.02, 0.45);
      g.fillStyle = 'rgba(255,255,255,0.15)';
      g.fillRect(x, y + 0.05, 1.02, 0.03);
      g.fillStyle = shade(d.color, -0.12);
      g.fillRect(x, y + 0.5, 1.02, 0.5);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      if (h % 2) g.fillRect(x + 0.5, y + 0.55, 0.02, 0.4);
      if (h % 6 === 0) {
        g.fillStyle = '#2b2f38';
        g.fillRect(x + 0.3, y + 0.12, 0.4, 0.3);
        g.fillStyle = 'rgba(160, 230, 160, 0.7)';
        g.fillRect(x + 0.35, y + 0.16, 0.3, 0.1);
      } else if (h % 6 === 3) {
        g.fillStyle = '#f4f1ea';
        for (let i = 0; i < 3; i++) circle(g, x + 0.25 + i * 0.13, y + 0.27, 0.06);
      } else if (h % 6 === 5) {
        g.fillStyle = '#fafafa';
        g.fillRect(x + 0.6, y + 0.15, 0.2, 0.2);
      }
      break;
    }
    case 'bed': {
      // 나무 틀 → 매트리스 → 베개(주름) / 이불(접힌 단과 체크무늬)
      const l = n.left.deco === 'bed' ? 0 : 0.05;
      const r = n.right.deco === 'bed' ? 0 : 0.05;
      const top = n.up.deco !== 'bed';
      const bottom = n.down.deco !== 'bed';
      const t = top ? 0.04 : 0;
      const b = bottom ? 0.04 : 0;
      g.fillStyle = '#8a6a4c';
      g.fillRect(x + l, y + t, 1.02 - l - r, 1.02 - t - b);
      if (top) g.fillRect(x + l, y + t, 1.02 - l - r, 0.12);
      const il = l ? l + 0.05 : 0;
      const ir = r ? r + 0.05 : 0;
      const it = top ? 0.16 : 0;
      const ib = bottom ? b + 0.05 : 0;
      g.fillStyle = '#f7f2e8';
      g.fillRect(x + il, y + it, 1.02 - il - ir, 1.02 - it - ib);
      if (top) {
        g.fillStyle = 'rgba(0,0,0,0.08)';
        roundRect(g, x + il + 0.1, y + 0.24, 0.82 - il - ir, 0.34, 0.1);
        g.fillStyle = '#ffffff';
        roundRect(g, x + il + 0.08, y + 0.21, 0.82 - il - ir, 0.32, 0.1);
        g.fillStyle = 'rgba(150, 140, 120, 0.15)';
        g.fillRect(x + il + 0.2, y + 0.36, 0.55 - il - ir, 0.02);
        // 이불 윗단
        g.fillStyle = '#c4d3df';
        g.fillRect(x + il, y + 0.66, 1.02 - il - ir, 0.12);
        g.fillStyle = '#9db4c8';
        g.fillRect(x + il, y + 0.78, 1.02 - il - ir, 0.24);
      } else {
        g.fillStyle = '#9db4c8';
        g.fillRect(x + il, y, 1.02 - il - ir, 1.02 - ib);
        g.fillStyle = 'rgba(255,255,255,0.10)';
        for (let i = 0; i < 2; i++) g.fillRect(x + il, y + 0.25 + i * 0.5, 1.02 - il - ir, 0.06);
        g.fillStyle = 'rgba(40, 60, 90, 0.10)';
        if (!r) g.fillRect(x + 0.95, y, 0.07, 1.02);
        // 구김
        if (h % 3 === 0) {
          g.strokeStyle = 'rgba(40, 60, 90, 0.18)';
          g.lineWidth = 0.02;
          g.beginPath();
          g.moveTo(x + 0.2 + (h % 4) * 0.1, y + 0.1);
          g.quadraticCurveTo(x + 0.45, y + 0.4, x + 0.3 + (h % 3) * 0.1, y + 0.75);
          g.stroke();
        }
      }
      break;
    }
    case 'sofa': {
      // 등받이 → 방석(칸마다 하나) → 팔걸이(끝 칸만), 가끔 쿠션
      const endL = n.left.deco !== 'sofa';
      const endR = n.right.deco !== 'sofa';
      g.fillStyle = 'rgba(0,0,0,0.15)';
      g.fillRect(x, y + 0.9, 1.02, 0.08);
      g.fillStyle = shade(d.color, -0.18);
      g.fillRect(x, y + 0.02, 1.02, 0.3);
      g.fillStyle = shade(d.color, -0.08);
      g.fillRect(x, y + 0.04, 1.02, 0.08);
      const a0 = endL ? 0.18 : 0.02;
      const a1 = endR ? 0.18 : 0.02;
      g.fillStyle = shade(d.color, 0.1);
      roundRect(g, x + a0, y + 0.3, 1 - a0 - a1, 0.62, 0.08);
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + a0 + 0.05, y + 0.34, 1 - a0 - a1 - 0.1, 0.05);
      g.fillStyle = shade(d.color, -0.12);
      if (endL) roundRect(g, x + 0.02, y + 0.06, 0.18, 0.88, 0.07);
      if (endR) roundRect(g, x + 0.82, y + 0.06, 0.18, 0.88, 0.07);
      if (h % 3 === 0) {
        g.fillStyle = h % 2 ? '#e0a26a' : '#84a98c';
        g.save();
        g.translate(x + 0.5, y + 0.38);
        g.rotate(((h % 5) - 2) * 0.12);
        roundRect(g, -0.17, -0.1, 0.34, 0.2, 0.07);
        g.restore();
      }
      break;
    }
    case 'tree': {
      // 줄기와 뿌리 그늘만. 수관은 렌더러가 사람 위에 따로 그린다 (draw/trees.ts)
      g.fillStyle = 'rgba(0,0,0,0.18)';
      circle(g, x + 0.55, y + 0.6, 0.22);
      g.fillStyle = '#6b4f3a';
      circle(g, x + 0.5, y + 0.55, 0.14);
      g.fillStyle = '#7d5d45';
      circle(g, x + 0.47, y + 0.52, 0.08);
      break;
    }
    case 'plant': {
      // 화분(테두리·흙) + 잎맥이 있는 잎
      g.fillStyle = 'rgba(0,0,0,0.18)';
      circle(g, x + 0.56, y + 0.62, 0.32);
      g.fillStyle = '#9c6844';
      circle(g, x + 0.5, y + 0.55, 0.3);
      g.fillStyle = '#b97f57';
      circle(g, x + 0.5, y + 0.55, 0.26);
      g.fillStyle = '#5a4030';
      circle(g, x + 0.5, y + 0.55, 0.21);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + (h % 10) * 0.1;
        const lx = x + 0.5 + Math.cos(a) * 0.2;
        const ly = y + 0.46 + Math.sin(a) * 0.2;
        g.fillStyle = i % 2 ? d.color : shade(d.color, 0.15);
        g.beginPath();
        g.ellipse(lx, ly, 0.2, 0.09, a, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = shade(d.color, -0.25);
        g.lineWidth = 0.015;
        g.beginPath();
        g.moveTo(lx - Math.cos(a) * 0.16, ly - Math.sin(a) * 0.16);
        g.lineTo(lx + Math.cos(a) * 0.16, ly + Math.sin(a) * 0.16);
        g.stroke();
      }
      break;
    }
    case 'appliance': {
      // 냉장고: 금속 광택 + 문 경계 + 손잡이 + 자석
      const grad = g.createLinearGradient(x, y, x + 1, y);
      grad.addColorStop(0, shade(d.color, 0.2));
      grad.addColorStop(1, shade(d.color, 0.02));
      g.fillStyle = grad;
      g.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 0.05, y + 0.4, 0.9, 0.035);
      g.fillStyle = '#8b9099';
      g.fillRect(x + 0.78, y + 0.12, 0.05, 0.2);
      g.fillRect(x + 0.78, y + 0.5, 0.05, 0.32);
      if (h % 2 === 0) {
        g.fillStyle = PRODUCT[h % PRODUCT.length]!;
        circle(g, x + 0.25, y + 0.6, 0.045);
        g.fillStyle = '#f7f4ec';
        g.fillRect(x + 0.32, y + 0.55, 0.16, 0.2);
      }
      break;
    }
    case 'grill': {
      // 고깃집 테이블: 세 칸마다 불판, 나머지는 반찬 접시
      if (tx % 3 === 1) {
        g.fillStyle = '#2a2420';
        circle(g, x + 0.5, y + 0.5, 0.4);
        g.fillStyle = 'rgba(255, 120, 60, 0.55)';
        circle(g, x + 0.5, y + 0.5, 0.3);
        g.strokeStyle = 'rgba(40, 30, 25, 0.8)';
        g.lineWidth = 0.04;
        for (let i = -2; i <= 2; i++) {
          g.beginPath();
          g.moveTo(x + 0.5 + i * 0.1, y + 0.22);
          g.lineTo(x + 0.5 + i * 0.1, y + 0.78);
          g.stroke();
        }
      } else {
        const dishes = ['#e05a5a', '#9fd38a', '#f2c94c', '#f7f2e8'];
        for (let i = 0; i < 3; i++) {
          const k = hash2(tx, ty, i);
          const px = x + 0.22 + (i % 2) * 0.5;
          const py = y + 0.25 + Math.floor(i / 2) * 0.48 + (k % 10) * 0.005;
          g.fillStyle = '#f4f1ea';
          circle(g, px, py, 0.14);
          g.fillStyle = dishes[k % dishes.length]!;
          circle(g, px, py, 0.08);
        }
      }
      break;
    }
    case 'grass': {
      if (h % 23 === 0) {
        g.fillStyle = h % 2 ? '#f6e7a1' : '#f3c1c6';
        for (let i = 0; i < 4; i++) circle(g, x + 0.4 + Math.cos(i * 1.57) * 0.08, y + 0.4 + Math.sin(i * 1.57) * 0.08, 0.06);
        g.fillStyle = '#f2c94c';
        circle(g, x + 0.4, y + 0.4, 0.04);
      } else if (h % 11 === 0) {
        g.fillStyle = shade(d.color, -0.12);
        for (let i = 0; i < 3; i++) g.fillRect(x + 0.6 + i * 0.07, y + 0.55 - i * 0.04, 0.03, 0.18);
      }
      break;
    }
    case 'bench': {
      // 나무 살 + 금속 다리
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 4; i++) g.fillRect(x, y + 0.2 + i * 0.18 + 0.12, 1.02, 0.03);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 4; i++) g.fillRect(x, y + 0.2 + i * 0.18, 1.02, 0.03);
      g.fillStyle = '#4a4f58';
      if (n.left.deco !== 'bench') g.fillRect(x + 0.08, y + 0.1, 0.08, 0.8);
      if (n.right.deco !== 'bench') g.fillRect(x + 0.84, y + 0.1, 0.08, 0.8);
      break;
    }
    case 'books': {
      // 책장: 세 단, 책등 색과 높이가 제각각
      g.fillStyle = shade(d.color, 0.12);
      g.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
      for (let row = 0; row < 3; row++) {
        let bx = x + 0.08;
        let i = 0;
        while (bx < x + 0.9) {
          const k = hash2(tx, ty, row * 16 + i++);
          const bw = 0.06 + (k % 4) * 0.02;
          if (bx + bw > x + 0.92) break;
          const bh = 0.2 - (k % 3) * 0.03;
          g.fillStyle = BOOKS[k % BOOKS.length]!;
          g.fillRect(bx, y + 0.08 + row * 0.29 + (0.22 - bh), bw, bh);
          bx += bw + 0.012;
        }
      }
      break;
    }
    case 'washer': {
      // 세탁기: 몸체 + 동그란 유리문 + 조작부
      g.fillStyle = shade(d.color, 0.1);
      g.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
      g.fillStyle = '#9aa3ad';
      g.fillRect(x + 0.05, y + 0.05, 0.9, 0.16);
      g.fillStyle = h % 3 === 0 ? '#9fd38a' : '#e05a5a';
      circle(g, x + 0.8, y + 0.13, 0.035);
      g.fillStyle = '#5d6b78';
      circle(g, x + 0.5, y + 0.58, 0.3);
      g.fillStyle = h % 2 ? '#a3c9d8' : '#c9dbe6';
      circle(g, x + 0.5, y + 0.58, 0.22);
      if (h % 2) {
        // 돌아가는 빨래
        g.fillStyle = CLOTHES[h % CLOTHES.length]!;
        circle(g, x + 0.44, y + 0.62, 0.08);
        g.fillStyle = CLOTHES[(h >> 3) % CLOTHES.length]!;
        circle(g, x + 0.56, y + 0.55, 0.07);
      }
      break;
    }
    case 'vending': {
      // 자판기: 위쪽 유리 진열창에 음료 두 줄, 아래 버튼·배출구
      g.fillStyle = shade(d.color, 0.08);
      g.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
      g.fillStyle = '#e8f1f5';
      g.fillRect(x + 0.12, y + 0.1, 0.76, 0.45);
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 4; i++) {
          g.fillStyle = PRODUCT[hash2(tx, ty, row * 4 + i) % PRODUCT.length]!;
          g.fillRect(x + 0.16 + i * 0.18, y + 0.14 + row * 0.2, 0.11, 0.15);
        }
      }
      g.fillStyle = '#2b2f38';
      g.fillRect(x + 0.2, y + 0.72, 0.6, 0.12);
      g.fillStyle = '#9fd38a';
      circle(g, x + 0.78, y + 0.63, 0.04);
      break;
    }
    default:
      break;
  }
}

// ───────────── 바닥 ─────────────
// 칸마다 아주 조금씩 다른 톤과 결을 줘서, 같은 색 사각형이 반복되는 느낌을 없앤다.

/** 바닥 위에 놓여 그림자를 드리우는 낮은 가구 (책상·탁자·침대 등) */
function isFurniture(d: TileDef): boolean {
  return !d.walk && !d.tall && !!d.deco && d.deco !== 'grass';
}

/** 칸을 꽉 채운 높은 것 (벽·선반 등). 나무·화분은 둥글어서 제 그림자를 따로 그린다 */
export function isSolid(d: TileDef): boolean {
  return !!d.tall && d.deco !== 'tree' && d.deco !== 'plant';
}

function band(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, a: number, w: number, h: number): void {
  const grad = g.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, `rgba(0,0,0,${a})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, h);
}

export function paintFloor(g: CanvasRenderingContext2D, d: TileDef, n: TileNeighbors, x: number, y: number, tx: number, ty: number): void {
  if (d.deco === 'tree' || d.deco === 'plant') {
    // 둥근 나무·화분 밑에는 둘레 바닥을 깐다
    const under = [n.left, n.up, n.right, n.down].find((t) => t.walk);
    if (under) d = under;
  }
  const h = hash2(tx, ty, 7);
  g.fillStyle = d.color;
  g.fillRect(x, y, 1.02, 1.02);
  const a = d.accent ?? d.color;
  switch (d.pattern) {
    case 'plank': {
      // 마루: 한 칸에 널 네 장, 이음매는 줄마다 엇갈리고 널마다 톤과 결이 다르다
      for (let i = 0; i < 4; i++) {
        const row = ty * 4 + i;
        const k = hash2(row, Math.floor((tx + (row % 3)) / 3), 3);
        const by = y + i * 0.25;
        g.fillStyle = shade(d.color, ((k % 7) - 3) * 0.018);
        g.fillRect(x, by, 1.02, 0.25);
        g.fillStyle = 'rgba(80, 50, 30, 0.07)';
        g.fillRect(x, by + 0.08 + (k % 5) * 0.025, 1.02, 0.012);
        g.fillStyle = a;
        g.fillRect(x, by + 0.235, 1.02, 0.018);
        // 널 끝 이음매
        if ((tx + (row % 3)) % 3 === 0) g.fillRect(x + ((k >>> 4) % 10) * 0.08, by, 0.02, 0.25);
      }
      g.fillStyle = 'rgba(255, 245, 225, 0.05)';
      g.fillRect(x, y, 1, 0.5);
      break;
    }
    case 'grid': {
      if (d.id === 'sidewalk') {
        // 보도블록: 반 칸씩 엇갈려 쌓은 벽돌
        for (let i = 0; i < 2; i++) {
          const off = (ty * 2 + i) % 2 ? 0.25 : 0.75;
          g.fillStyle = shade(d.color, ((hash2(tx, ty, 11 + i) % 5) - 2) * 0.02);
          g.fillRect(x, y + i * 0.5, 1.02, 0.5);
          g.fillStyle = a;
          g.fillRect(x, y + i * 0.5 + 0.47, 1.02, 0.035);
          g.fillRect(x + off, y + i * 0.5, 0.035, 0.5);
        }
        if (h % 31 === 0) {
          // 이 빠진 블록
          g.fillStyle = 'rgba(60, 55, 50, 0.12)';
          g.fillRect(x + 0.3, y + 0.1, 0.4, 0.3);
        }
        break;
      }
      // 타일: 줄눈 + 위·왼쪽 모서리 반사
      const big = d.id === 'plaza';
      if (!big || tx % 2 === 1) {
        g.fillStyle = a;
        g.fillRect(x + 0.965, y, 0.04, 1.02);
      }
      if (!big || ty % 2 === 1) {
        g.fillStyle = a;
        g.fillRect(x, y + 0.965, 1.02, 0.04);
      }
      g.fillStyle = 'rgba(255,255,255,0.10)';
      if (!big || tx % 2 === 0) g.fillRect(x, y, 0.03, 0.96);
      if (!big || ty % 2 === 0) g.fillRect(x, y, 0.96, 0.03);
      if (h % 13 === 0 && !big && d.id !== 'grill' && d.id !== 'platform') {
        // 반짝이는 광택
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.beginPath();
        g.ellipse(x + 0.35, y + 0.35, 0.22, 0.08, -0.6, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'dots': {
      if (d.id === 'alley') {
        // 골목: 갈라진 금, 얼룩
        g.fillStyle = a;
        if (h % 4 === 0) circle(g, x + 0.3 + (h % 5) * 0.1, y + 0.6, 0.12 + (h % 3) * 0.05);
        if (h % 9 === 0) {
          g.strokeStyle = 'rgba(40, 35, 30, 0.25)';
          g.lineWidth = 0.025;
          g.beginPath();
          g.moveTo(x + 0.1, y + 0.3);
          g.lineTo(x + 0.4, y + 0.42);
          g.lineTo(x + 0.55, y + 0.38);
          g.lineTo(x + 0.9, y + 0.6);
          g.stroke();
        }
        break;
      }
      // 잔디·수풀: 칸 경계 없이 이어지는 얼룩(부드러운 잡음). 잘게 나눠 계단이 보이지 않게
      const N = 8;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const v = smoothNoise(tx + (sx + 0.5) / N, ty + (sy + 0.5) / N);
          g.fillStyle = v > 0 ? `rgba(255, 255, 220, ${v * 0.07})` : `rgba(20, 40, 10, ${-v * 0.08})`;
          g.fillRect(x + sx / N, y + sy / N, 1 / N + 0.01, 1 / N + 0.01);
        }
      }
      if (d.id === 'bush') {
        // 수풀: 둥근 잎 덩어리가 겹친다
        for (let i = 0; i < 3; i++) {
          const k = hash2(tx, ty, 40 + i);
          const px = x + 0.2 + (k % 60) / 100;
          const py = y + 0.2 + ((k >>> 7) % 60) / 100;
          g.fillStyle = 'rgba(0, 0, 0, 0.12)';
          circle(g, px + 0.05, py + 0.07, 0.3);
          g.fillStyle = shade(d.color, -0.08 + (k % 3) * 0.06);
          circle(g, px, py, 0.3);
          g.fillStyle = shade(d.color, 0.14);
          circle(g, px - 0.08, py - 0.09, 0.12);
        }
      }
      // 두 톤 풀잎 다발
      for (let i = 0; i < 4; i++) {
        const k = hash2(tx, ty, 20 + i);
        if (k % 3 === 0) continue;
        const px = x + 0.1 + (k % 80) / 100;
        const py = y + 0.15 + ((k >>> 8) % 75) / 100;
        g.fillStyle = i % 2 ? a : shade(d.color, 0.1);
        for (let j = -1; j <= 1; j++) g.fillRect(px + j * 0.05, py - Math.abs(j) * 0.02 - 0.12, 0.025, 0.14 - Math.abs(j) * 0.03);
      }
      break;
    }
    case 'stripe': {
      if (d.id === 'stairs') {
        // 계단: 단마다 앞쪽 그늘과 미끄럼 방지 줄
        for (let i = 0; i < 3; i++) {
          g.fillStyle = 'rgba(0,0,0,0.16)';
          g.fillRect(x, y + i * 0.333 + 0.27, 1.02, 0.06);
          g.fillStyle = 'rgba(255,255,255,0.14)';
          g.fillRect(x, y + i * 0.333, 1.02, 0.03);
          g.fillStyle = '#c9a85c';
          g.fillRect(x + 0.05, y + i * 0.333 + 0.21, 0.9, 0.025);
        }
        break;
      }
      g.fillStyle = a;
      for (let i = 0; i < 3; i++) g.fillRect(x + 0.12 + i * 0.3, y + 0.1, 0.14, 0.8);
      if (d.push) {
        // 무빙워크: 홈이 파인 판
        g.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 8; i++) g.fillRect(x, y + 0.06 + i * 0.12, 1.02, 0.025);
      }
      break;
    }
    default: {
      if (d.id === 'road' || d.id === 'crosswalk') {
        // 아스팔트 알갱이
        for (let i = 0; i < 6; i++) {
          const k = hash2(tx, ty, 40 + i);
          g.fillStyle = k % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
          g.fillRect(x + (k % 97) / 100, y + ((k >>> 8) % 97) / 100, 0.035, 0.035);
        }
        // 연석: 보도와 맞닿은 쪽
        const curb = (t: TileDef) => t.id !== 'road' && t.id !== 'crosswalk';
        g.fillStyle = '#d3cdc2';
        if (curb(n.up)) g.fillRect(x, y, 1.02, 0.1);
        if (curb(n.down)) g.fillRect(x, y + 0.9, 1.02, 0.1);
        if (curb(n.left)) g.fillRect(x, y, 0.1, 1.02);
        if (curb(n.right)) g.fillRect(x + 0.9, y, 0.1, 1.02);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        if (curb(n.up)) g.fillRect(x, y + 0.1, 1.02, 0.05);
        if (curb(n.left)) g.fillRect(x + 0.1, y, 0.05, 1.02);
      } else if (d.id === 'floorCarpet') {
        // 카펫 결
        g.fillStyle = 'rgba(0,0,0,0.05)';
        for (let i = 0; i < 5; i++) g.fillRect(x, y + 0.1 + i * 0.2, 1.02, 0.05);
      }
      break;
    }
  }
}

/**
 * 바닥에 내려앉는 그늘과 빛: 벽 아래·옆 그늘(앰비언트 오클루전), 가구 그림자, 창으로 드는 볕, 책상 앞 의자.
 * indoor: 실내 바닥인지 (창 볕·의자)
 */
export function paintFloorLight(g: CanvasRenderingContext2D, d: TileDef, n: TileNeighbors, x: number, y: number, tx: number, ty: number, indoor: boolean): void {
  if (d.tall) return;
  const wall = (t: TileDef) => isSolid(t) && t.id !== 'window';
  if (isSolid(n.up)) band(g, x, y, x, y + 0.5, 0.24, 1, 0.5);
  if (wall(n.left)) band(g, x, y, x + 0.3, y, 0.16, 0.3, 1);
  if (wall(n.right)) band(g, x + 1, y, x + 0.75, y, 0.1, 0.25, 1);
  if (isSolid(n.upLeft) && !isSolid(n.up) && !isSolid(n.left)) {
    const r = g.createRadialGradient(x, y, 0, x, y, 0.4);
    r.addColorStop(0, 'rgba(0,0,0,0.16)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(x, y, 0.4, 0.4);
  }
  if (!d.walk) return;
  // 낮은 가구: 오른쪽 아래로 짧은 그림자
  if (isFurniture(n.up)) band(g, x, y, x, y + 0.22, 0.2, 1, 0.22);
  if (isFurniture(n.left)) band(g, x, y, x + 0.15, y, 0.14, 0.15, 1);
  if (!indoor) return;
  // 창으로 드는 볕
  const sun = (x0: number, y0: number, x1: number, y1: number, w: number, hh: number) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(255, 244, 214, 0.26)');
    grad.addColorStop(1, 'rgba(255, 244, 214, 0)');
    g.fillStyle = grad;
    g.fillRect(Math.min(x0, x1), Math.min(y0, y1), w, hh);
  };
  if (n.up.id === 'window') sun(x, y, x, y + 1, 1, 1);
  if (n.down.id === 'window') sun(x, y + 1, x, y, 1, 1);
  if (n.left.id === 'window') sun(x, y, x + 1, y, 1, 1);
  if (n.right.id === 'window') sun(x + 1, y, x, y, 1, 1);
  // 책상 앞 의자, 식탁 옆 의자 (밀어 넣은 모습)
  const h = hash2(tx, ty, 5);
  if (n.up.deco === 'desk' && h % 4 !== 0) officeChair(g, x + 0.5 + ((h % 5) - 2) * 0.03, y + 0.32);
  else if (n.left.deco === 'table' && h % 3 !== 0) woodChair(g, x + 0.22, y + 0.5, -Math.PI / 2);
  else if (n.right.deco === 'table' && h % 3 !== 0) woodChair(g, x + 0.78, y + 0.5, Math.PI / 2);
}

function officeChair(g: CanvasRenderingContext2D, cx: number, cy: number): void {
  g.fillStyle = 'rgba(0,0,0,0.15)';
  circle(g, cx + 0.04, cy + 0.06, 0.26);
  // 다리 다섯 개
  g.strokeStyle = '#3a3d44';
  g.lineWidth = 0.04;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * 0.25, cy + Math.sin(a) * 0.25);
    g.stroke();
  }
  g.fillStyle = '#454a54';
  roundRect(g, cx - 0.2, cy - 0.17, 0.4, 0.34, 0.09);
  g.fillStyle = '#565c68';
  roundRect(g, cx - 0.16, cy - 0.12, 0.32, 0.26, 0.07);
  // 등받이 (책상 반대쪽)
  g.fillStyle = '#383c45';
  roundRect(g, cx - 0.2, cy + 0.15, 0.4, 0.09, 0.04);
}

function woodChair(g: CanvasRenderingContext2D, cx: number, cy: number, rot: number): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,0.14)';
  g.fillRect(-0.16, -0.14, 0.36, 0.34);
  g.fillStyle = '#8a6544';
  g.fillRect(-0.18, -0.17, 0.36, 0.32);
  g.fillStyle = '#a07a56';
  g.fillRect(-0.15, -0.14, 0.3, 0.26);
  g.fillStyle = '#6e4f34';
  g.fillRect(-0.18, 0.13, 0.36, 0.06);
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

/** 칸 경계에서 끊기지 않는 낮은 주파수 얼룩 (-1~1) */
function smoothNoise(x: number, y: number): number {
  return (Math.sin(x * 0.37 + Math.sin(y * 0.21) * 2.1) + Math.sin(y * 0.43 + Math.sin(x * 0.17) * 1.7) + Math.sin((x + y) * 0.9) * 0.4) / 2.4;
}
