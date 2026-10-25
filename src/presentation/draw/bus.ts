// 마을버스 (위에서 본 모습). 도형만으로: 초록 차체, 흰 띠, 지붕 에어컨·환기창, 노선 번호, 앞 유리, 밤에는 전조등.

import type { BusOnRoad } from '../../gameplay/Bus';
import { shade } from './people';

const LENGTH = 10.5;
const WIDTH = 2.4;
const BODY = '#3f9a5c';

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}

/** ride: 플레이어가 타고 있는 버스면 창가 자리에 표시 */
export function drawBus(g: CanvasRenderingContext2D, b: BusOnRoad, route: string, night: number, ride: boolean): void {
  g.save();
  g.translate(b.x, b.y);
  // 앞이 +x가 되도록 (서쪽 방면은 뒤집는다)
  if (b.dir === -1) g.rotate(Math.PI);
  const x0 = -LENGTH / 2;
  const y0 = -WIDTH / 2;
  // 전조등 빛 (밤)
  if (night > 0.15) {
    const grad = g.createRadialGradient(LENGTH / 2 + 0.2, 0, 0.2, LENGTH / 2 + 2.5, 0, 4);
    grad.addColorStop(0, `rgba(255, 240, 200, ${0.45 * night})`);
    grad.addColorStop(1, 'rgba(255, 240, 200, 0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(LENGTH / 2, -0.9);
    g.lineTo(LENGTH / 2 + 5, -2.4);
    g.lineTo(LENGTH / 2 + 5, 2.4);
    g.lineTo(LENGTH / 2, 0.9);
    g.fill();
  }
  // 그림자
  g.fillStyle = 'rgba(0,0,0,0.22)';
  roundRect(g, x0 + 0.15, y0 + 0.25, LENGTH, WIDTH, 0.45);
  g.fill();
  // 차체
  g.fillStyle = shade(BODY, -0.18);
  roundRect(g, x0, y0, LENGTH, WIDTH, 0.45);
  g.fill();
  g.fillStyle = BODY;
  roundRect(g, x0 + 0.08, y0 + 0.08, LENGTH - 0.16, WIDTH - 0.16, 0.4);
  g.fill();
  // 옆 창 (지붕 가장자리에 살짝 보이는 유리)
  g.fillStyle = 'rgba(30, 45, 60, 0.75)';
  for (let i = 0; i < 6; i++) {
    const wx = x0 + 1.4 + i * 1.32;
    g.fillRect(wx, y0 + 0.08, 1.1, 0.2);
    g.fillRect(wx, -y0 - 0.28, 1.1, 0.2);
  }
  // 흰 띠
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(x0 + 0.5, y0 + 0.34, LENGTH - 1.6, 0.08);
  g.fillRect(x0 + 0.5, -y0 - 0.42, LENGTH - 1.6, 0.08);
  // 지붕: 에어컨, 환기창
  g.fillStyle = shade(BODY, 0.18);
  roundRect(g, x0 + 1.2, -0.55, 2.4, 1.1, 0.2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.lineWidth = 0.04;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(x0 + 1.5 + i * 0.55, -0.4);
    g.lineTo(x0 + 1.5 + i * 0.55, 0.4);
    g.stroke();
  }
  g.fillStyle = 'rgba(200, 220, 230, 0.6)';
  g.fillRect(x0 + 5.2, -0.35, 0.8, 0.7);
  // 앞 유리
  g.fillStyle = night > 0.3 ? 'rgba(255, 236, 170, 0.75)' : 'rgba(40, 60, 80, 0.85)';
  roundRect(g, LENGTH / 2 - 0.55, y0 + 0.2, 0.42, WIDTH - 0.4, 0.15);
  g.fill();
  // 노선 번호
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(x0 + 7.4, 0, 0.42, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(x0 + 7.4, 0);
  if (b.dir === -1) g.rotate(Math.PI);
  g.fillStyle = BODY;
  g.font = '700 0.6px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(route, 0, 0.03);
  g.restore();
  // 브레이크등 (정류장에 서 있을 때)
  if (b.stopped) {
    g.fillStyle = 'rgba(240, 70, 60, 0.9)';
    g.fillRect(x0 - 0.02, y0 + 0.25, 0.12, 0.35);
    g.fillRect(x0 - 0.02, -y0 - 0.6, 0.12, 0.35);
  }
  // 내가 탄 자리 (창가)
  if (ride) {
    g.fillStyle = '#fff7d6';
    g.beginPath();
    g.arc(x0 + 4.3, WIDTH / 2 - 0.55, 0.32, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3f78c9';
    g.beginPath();
    g.arc(x0 + 4.3, WIDTH / 2 - 0.55, 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}
