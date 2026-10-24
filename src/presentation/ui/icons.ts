// 소모품 아이콘 (인라인 SVG, 도형 조합). items.json의 icon 이름으로 고른다.

export type ItemIcon = 'cup' | 'snack' | 'tumbler' | 'can' | 'bottle' | 'pill';

const SVG: Record<ItemIcon, string> = {
  // 찬 음료: 얼음 든 플라스틱 컵 + 빨대
  cup: '<path d="M6 7h12l-1.5 13h-9z" fill="#cfe8f3"/><path d="M7 11h10l-1 8H8z" fill="#8cc7e0"/><rect x="9" y="12" width="3" height="3" rx=".6" fill="#fff" opacity=".8"/><rect x="13" y="14" width="2.6" height="2.6" rx=".6" fill="#fff" opacity=".7"/><path d="M13 7l3-5" stroke="#e05a5a" stroke-width="1.6" stroke-linecap="round"/><rect x="5" y="6" width="14" height="2" rx="1" fill="#eef6fa"/>',
  // 간식: 과자 봉지
  snack: '<path d="M6 4h12l-1 2 1 2v10l1 2-1 2H6l-1-2 1-2V8L5 6z" fill="#f29e4c"/><rect x="7" y="9" width="10" height="7" rx="2" fill="#fff3d6"/><circle cx="12" cy="12.5" r="2.2" fill="#e05a5a"/>',
  // 텀블러 커피
  tumbler: '<rect x="7" y="5" width="10" height="16" rx="2.5" fill="#6b8f71"/><rect x="6.5" y="3" width="11" height="3.2" rx="1.2" fill="#3f4a44"/><rect x="7" y="10" width="10" height="3" fill="#e8dfc8"/><path d="M10 1.5c0 1 1 1 1 2M13 1.5c0 1 1 1 1 2" stroke="#c9c2b4" stroke-width=".8" fill="none"/>',
  // 에너지 드링크: 캔
  can: '<rect x="7" y="4" width="10" height="17" rx="2" fill="#2f3e46"/><rect x="7.6" y="3" width="8.8" height="2" rx="1" fill="#c9cdd2"/><path d="M13 7l-3.5 6H12l-1.5 5 4-7h-2.5z" fill="#f2c94c"/><rect x="7" y="19" width="10" height="2" rx="1" fill="#c9cdd2"/>',
  // 생수: 페트병
  bottle: '<rect x="10" y="2" width="4" height="2.5" rx=".8" fill="#6fb3ff"/><path d="M9.5 4.5h5l1.5 3v12.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V7.5z" fill="#d8eefa"/><rect x="8" y="11" width="8" height="4" fill="#6fb3ff"/><path d="M10 8v2M10 16v3" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
  // 두통약: 알약 + 포장
  pill: '<rect x="4" y="6" width="16" height="12" rx="2" fill="#eef0f3"/><rect x="4" y="6" width="16" height="3.5" rx="1.5" fill="#6fb3ff"/><g transform="rotate(-35 12 13.5)"><rect x="7.5" y="11.5" width="9" height="4" rx="2" fill="#fff" stroke="#c9cdd2" stroke-width=".6"/><rect x="12" y="11.5" width="4.5" height="4" rx="2" fill="#e05a5a"/></g>',
};

export function itemIcon(name: ItemIcon | undefined, size = 18): string {
  if (!name) return '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>`;
}
