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
  | 'bench';

export interface TileNeighbors {
  up: TileDef;
  down: TileDef;
  left: TileDef;
  right: TileDef;
}

const PRODUCT = ['#e05a5a', '#f2c94c', '#6fb3ff', '#9fd38a', '#f29e4c', '#c49bd8', '#f7f2e8', '#5bc0be'];
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
      // 윗면 + (아래가 트였으면) 앞면. 탑다운에 살짝 기울인 시점
      g.fillStyle = shade(d.color, 0.12);
      g.fillRect(x, y, 1, 0.08);
      if (!n.down.tall) {
        g.fillStyle = shade(d.color, -0.28);
        g.fillRect(x, y + 0.68, 1, 0.32);
        g.fillStyle = 'rgba(255,255,255,0.08)';
        g.fillRect(x, y + 0.68, 1, 0.04);
        if (d.deco === 'wall' && h % 3 === 0) {
          // 벽돌 줄눈
          g.fillStyle = 'rgba(0,0,0,0.12)';
          g.fillRect(x + (h % 2 ? 0.25 : 0.7), y + 0.72, 0.03, 0.24);
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
      // 모니터 + 키보드 (+ 머그컵)
      g.fillStyle = shade(d.color, 0.1);
      g.fillRect(x + 0.04, y + 0.04, 0.92, 0.92);
      if (h % 4 !== 3) {
        g.fillStyle = '#2b2f38';
        g.fillRect(x + 0.18, y + 0.12, 0.64, 0.12);
        g.fillStyle = 'rgba(140, 190, 240, 0.55)';
        g.fillRect(x + 0.22, y + 0.14, 0.56, 0.07);
        g.fillStyle = '#e4e6ea';
        g.fillRect(x + 0.24, y + 0.42, 0.5, 0.16);
        g.fillStyle = 'rgba(0,0,0,0.15)';
        for (let i = 0; i < 4; i++) g.fillRect(x + 0.27 + i * 0.12, y + 0.46, 0.08, 0.03);
      } else {
        // 서류 더미
        g.fillStyle = '#f7f4ec';
        g.fillRect(x + 0.2, y + 0.2, 0.4, 0.5);
        g.fillStyle = '#e9e3d6';
        g.fillRect(x + 0.25, y + 0.25, 0.4, 0.5);
      }
      if (h % 5 === 0) {
        g.fillStyle = PRODUCT[h % PRODUCT.length]!;
        circle(g, x + 0.82, y + 0.72, 0.08);
        g.fillStyle = '#5a3d2b';
        circle(g, x + 0.82, y + 0.72, 0.045);
      }
      break;
    }
    case 'shelf': {
      // 진열대: 칸마다 색색 상품
      g.fillStyle = shade(d.color, 0.15);
      g.fillRect(x + 0.06, y + 0.06, 0.88, 0.88);
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          const k = hash2(tx, ty, row * 3 + col);
          if (k % 7 === 0) continue;
          g.fillStyle = PRODUCT[k % PRODUCT.length]!;
          g.fillRect(x + 0.12 + col * 0.27, y + 0.12 + row * 0.27, 0.22, 0.22);
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
      g.fillStyle = shade(d.color, 0.12);
      g.fillRect(x + 0.03, y + 0.03, 0.94, 0.94);
      if (h % 3 !== 0) {
        g.fillStyle = '#f4f1ea';
        circle(g, x + 0.35, y + 0.5, 0.16);
        g.fillStyle = h % 2 ? '#d98c5f' : '#9fd38a';
        circle(g, x + 0.35, y + 0.5, 0.08);
      }
      if (h % 4 === 1) {
        g.fillStyle = '#a3c9d8';
        circle(g, x + 0.75, y + 0.3, 0.08);
      }
      break;
    }
    case 'counter': {
      g.fillStyle = shade(d.color, 0.18);
      g.fillRect(x, y + 0.05, 1, 0.3);
      if (h % 6 === 0) {
        // 계산대 단말기
        g.fillStyle = '#2b2f38';
        g.fillRect(x + 0.3, y + 0.45, 0.4, 0.3);
        g.fillStyle = 'rgba(160, 230, 160, 0.7)';
        g.fillRect(x + 0.35, y + 0.5, 0.3, 0.1);
      }
      break;
    }
    case 'bed': {
      // 이웃한 침대 칸과 이어지게: 가장자리만 안쪽으로
      const l = n.left.deco === 'bed' ? 0 : 0.06;
      const r = n.right.deco === 'bed' ? 0 : 0.06;
      const top = n.up.deco !== 'bed';
      const bottom = n.down.deco !== 'bed';
      g.fillStyle = '#f7f2e8';
      g.fillRect(x + l, y + (top ? 0.06 : 0), 1 - l - r, 1 - (top ? 0.06 : 0) - (bottom ? 0.06 : 0));
      if (top) {
        // 베개
        g.fillStyle = '#ffffff';
        g.fillRect(x + l + 0.1, y + 0.14, 0.8 - l - r, 0.32);
      } else {
        // 이불
        g.fillStyle = '#9db4c8';
        g.fillRect(x + l, y, 1 - l - r, 1 - (bottom ? 0.06 : 0));
      }
      break;
    }
    case 'sofa': {
      g.fillStyle = shade(d.color, -0.15);
      g.fillRect(x, y, 1, 0.25);
      g.fillStyle = shade(d.color, 0.12);
      g.fillRect(x + 0.08, y + 0.3, 0.84, 0.6);
      g.fillStyle = 'rgba(0,0,0,0.1)';
      g.fillRect(x + 0.48, y + 0.3, 0.04, 0.6);
      break;
    }
    case 'tree': {
      // 겹친 수관: 그림자 → 잎 덩어리 → 하이라이트
      g.fillStyle = 'rgba(0,0,0,0.18)';
      circle(g, x + 0.58, y + 0.62, 0.5);
      g.fillStyle = shade(d.color, -0.1);
      circle(g, x + 0.5, y + 0.5, 0.5);
      g.fillStyle = d.color;
      circle(g, x + 0.38, y + 0.4, 0.3);
      circle(g, x + 0.64, y + 0.48, 0.28);
      g.fillStyle = shade(d.color, 0.18);
      circle(g, x + 0.36, y + 0.32, 0.12);
      break;
    }
    case 'plant': {
      g.fillStyle = '#b07a52';
      circle(g, x + 0.5, y + 0.55, 0.3);
      g.fillStyle = d.color;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + (h % 10) * 0.1;
        g.beginPath();
        g.ellipse(x + 0.5 + Math.cos(a) * 0.2, y + 0.48 + Math.sin(a) * 0.2, 0.18, 0.09, a, 0, Math.PI * 2);
        g.fill();
      }
      break;
    }
    case 'appliance': {
      // 냉장고·자판기: 문 경계 + 손잡이
      g.fillStyle = shade(d.color, 0.12);
      g.fillRect(x + 0.05, y + 0.05, 0.9, 0.9);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + 0.05, y + 0.4, 0.9, 0.04);
      g.fillStyle = '#8b9099';
      g.fillRect(x + 0.78, y + 0.15, 0.05, 0.18);
      g.fillRect(x + 0.78, y + 0.52, 0.05, 0.3);
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
      g.fillStyle = '#5a5f66';
      g.fillRect(x + 0.08, y + 0.1, 0.08, 0.8);
      g.fillRect(x + 0.84, y + 0.1, 0.08, 0.8);
      break;
    }
    default:
      break;
  }
}
