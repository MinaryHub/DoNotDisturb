// 거리·생활 소품 (city.json props). 충돌 없는 장식이고, 매 프레임 그린다 (밤 불빛·흔들림 때문).

import { shade } from './people';

export type PropKind =
  | 'lamp'
  | 'bin'
  | 'bike'
  | 'aircon'
  | 'pot'
  | 'hydrant'
  | 'manhole'
  | 'recycleGreen'
  | 'recycleBlue'
  | 'recycleYellow'
  | 'catBowl';

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(x + 0.06, y + 0.1, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}

/** night: 0(낮)~1(밤). 가로등 머리가 켜진다 */
export function drawProp(g: CanvasRenderingContext2D, kind: PropKind, x: number, y: number, rot: number, night: number, time: number): void {
  switch (kind) {
    case 'lamp': {
      shadow(g, x, y, 0.16, 0.1);
      g.fillStyle = '#4a4f58';
      circle(g, x, y, 0.11);
      // 팔과 등갓 (위에서 본 모습: 기둥에서 차도 쪽으로 뻗은 팔)
      g.strokeStyle = '#4a4f58';
      g.lineWidth = 0.06;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 0.55);
      g.stroke();
      g.fillStyle = night > 0.2 ? `rgba(255, 230, 160, ${0.6 + night * 0.4})` : '#d8dbe0';
      g.beginPath();
      g.ellipse(x, y - 0.6, 0.18, 0.11, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'bin': {
      shadow(g, x, y, 0.2, 0.12);
      g.fillStyle = '#4f6b5a';
      circle(g, x, y, 0.19);
      g.fillStyle = '#3c5446';
      circle(g, x, y, 0.13);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      circle(g, x - 0.06, y - 0.06, 0.05);
      break;
    }
    case 'bike': {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.strokeStyle = '#2b2f38';
      g.lineWidth = 0.05;
      for (const s of [-0.32, 0.32]) {
        g.beginPath();
        g.ellipse(s, 0, 0.2, 0.05, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.strokeStyle = ['#c0392b', '#3b6fb6', '#f2c94c', '#5b7d63'][Math.floor(x * 7 + y) % 4]!;
      g.lineWidth = 0.06;
      g.beginPath();
      g.moveTo(-0.32, 0);
      g.lineTo(0.05, 0);
      g.lineTo(0.32, 0);
      g.stroke();
      g.strokeStyle = '#2b2f38';
      g.beginPath();
      g.moveTo(0.28, -0.14);
      g.lineTo(0.28, 0.14);
      g.stroke();
      g.restore();
      break;
    }
    case 'aircon': {
      shadow(g, x, y, 0.36, 0.2);
      g.fillStyle = '#d9dcdf';
      g.fillRect(x - 0.34, y - 0.26, 0.68, 0.52);
      g.fillStyle = '#9aa1a8';
      circle(g, x - 0.06, y, 0.19);
      // 돌아가는 팬
      g.strokeStyle = '#6b737b';
      g.lineWidth = 0.035;
      for (let i = 0; i < 3; i++) {
        const a = time * 6 + (i * Math.PI * 2) / 3;
        g.beginPath();
        g.moveTo(x - 0.06, y);
        g.lineTo(x - 0.06 + Math.cos(a) * 0.16, y + Math.sin(a) * 0.16);
        g.stroke();
      }
      break;
    }
    case 'pot': {
      shadow(g, x, y, 0.22, 0.13);
      g.fillStyle = '#b07a52';
      circle(g, x, y, 0.2);
      g.fillStyle = '#5f8b56';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.beginPath();
        g.ellipse(x + Math.cos(a) * 0.12, y - 0.04 + Math.sin(a) * 0.12, 0.12, 0.06, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = ['#f3c1c6', '#f6e7a1', '#e05a5a'][Math.floor(x + y) % 3]!;
      circle(g, x, y - 0.05, 0.05);
      break;
    }
    case 'hydrant': {
      shadow(g, x, y, 0.15, 0.09);
      g.fillStyle = '#c0392b';
      circle(g, x, y, 0.13);
      g.fillStyle = shade('#c0392b', 0.3);
      circle(g, x, y, 0.07);
      break;
    }
    case 'manhole': {
      g.fillStyle = 'rgba(40, 42, 48, 0.55)';
      circle(g, x, y, 0.32);
      g.strokeStyle = 'rgba(120, 124, 132, 0.6)';
      g.lineWidth = 0.03;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(x - 0.25, y + i * 0.09);
        g.lineTo(x + 0.25, y + i * 0.09);
        g.stroke();
      }
      break;
    }
    case 'recycleGreen':
    case 'recycleBlue':
    case 'recycleYellow': {
      const c = kind === 'recycleGreen' ? '#4f8a5b' : kind === 'recycleBlue' ? '#3b6fb6' : '#e0b03c';
      shadow(g, x, y, 0.4, 0.22);
      g.fillStyle = c;
      g.fillRect(x - 0.38, y - 0.3, 0.76, 0.6);
      g.fillStyle = shade(c, -0.25);
      g.fillRect(x - 0.38, y - 0.3, 0.76, 0.14);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      circle(g, x, y + 0.06, 0.08);
      break;
    }
    case 'catBowl': {
      g.fillStyle = '#e8eef2';
      circle(g, x - 0.14, y, 0.13);
      circle(g, x + 0.16, y, 0.13);
      g.fillStyle = '#c49a6c';
      circle(g, x - 0.14, y, 0.08);
      g.fillStyle = '#a3c9d8';
      circle(g, x + 0.16, y, 0.08);
      break;
    }
  }
}
