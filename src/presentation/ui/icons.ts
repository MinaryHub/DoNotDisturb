// 소모품 아이콘 (인라인 SVG, 도형 조합). items.json의 icon 이름으로 고른다.

export type ItemIcon = 'cup' | 'snack' | 'tumbler' | 'can' | 'bottle' | 'pill' | 'tea' | 'patch' | 'umbrella' | 'rice' | 'sandwich' | 'bread' | 'banana' | 'box' | 'book' | 'fidget' | 'cream' | 'flower';

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
  // 캐모마일 차: 티백이 든 머그
  tea: '<path d="M5 8h11v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#f2e8cf"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" stroke="#f2e8cf" stroke-width="1.6" fill="none"/><rect x="6" y="10" width="9" height="2" fill="#e0b85a"/><path d="M11 3v7" stroke="#b9b2a4" stroke-width=".7"/><rect x="9.5" y="2" width="3" height="3" fill="#9fd38a"/>',
  // 쿨링 시트
  patch: '<rect x="3" y="7" width="18" height="10" rx="3" fill="#cfe8f3"/><rect x="6" y="9" width="12" height="6" rx="2" fill="#8cc7e0"/><path d="M9 12h6M12 10v4" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>',
  // 우산
  umbrella: '<path d="M2 12a10 9 0 0 1 20 0z" fill="#3b6fb6"/><path d="M7 12a5 9 0 0 1 10 0" fill="#5b8fd6"/><path d="M12 12v7a2 2 0 0 1-4 0" stroke="#4b4f58" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 3v1" stroke="#4b4f58" stroke-width="1.6" stroke-linecap="round"/>',
  // 삼각김밥: 밥 + 김 띠
  rice: '<path d="M12 3L21 19a1.5 1.5 0 0 1-1.3 2H4.3A1.5 1.5 0 0 1 3 19z" fill="#f6f2e8"/><path d="M8.2 21h7.6l-1-6.5h-5.6z" fill="#2f3e33"/><circle cx="12" cy="10" r="1.6" fill="#e05a5a" opacity=".8"/>',
  // 샌드위치: 삼각 단면
  sandwich: '<path d="M3 18L19 5l2 13z" fill="#e8c88a"/><path d="M5 16.5L18.6 6.3l.5 3.2L6.8 17z" fill="#7fbf6a"/><path d="M6.8 17L19.1 9.5l.4 2.6L8.6 17.6z" fill="#f2d16b"/><path d="M8.6 17.6l11-5.5.4 2.6L10.5 18z" fill="#e06a6a"/>',
  // 빵: 식빵 한 덩이
  bread: '<path d="M4 11a8 5 0 0 1 16 0v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#d9a35a"/><path d="M6 12a6 3.5 0 0 1 12 0v7H6z" fill="#f3d9a4"/><path d="M8 9.5q4-2 8 0" stroke="#b07a3a" stroke-width="1" fill="none"/>',
  // 바나나
  banana: '<path d="M4 8c2 8 9 12 16 9-1 2-4 4-8 4-5 0-9-5-9-12z" fill="#f2d24c"/><path d="M4 8l-.5-2.5L5 6z" fill="#6b5a2a"/><path d="M6 11c2 4 6 6 10 6" stroke="#d9b23a" stroke-width="1" fill="none"/>',
  // 도시락: 칸 나뉜 상자
  box: '<rect x="3" y="6" width="18" height="13" rx="2" fill="#4a6b8a"/><rect x="4.5" y="7.5" width="9" height="10" rx="1" fill="#f6f2e8"/><rect x="14.5" y="7.5" width="5" height="4.5" rx="1" fill="#e06a6a"/><rect x="14.5" y="13" width="5" height="4.5" rx="1" fill="#7fbf6a"/><circle cx="9" cy="12.5" r="1" fill="#2f3e33"/>',
  // 읽던 책: 펼친 책 + 책갈피
  book: '<path d="M2 6c3-1.5 7-1.5 10 .5V20c-3-2-7-2-10-.5z" fill="#f6f2e8"/><path d="M22 6c-3-1.5-7-1.5-10 .5V20c3-2 7-2 10-.5z" fill="#ece4d2"/><path d="M12 6.5V20" stroke="#b9ad96" stroke-width=".8"/><path d="M4 9.5c2-.6 4-.6 6 .2M4 12.5c2-.6 4-.6 6 .2M14 9.7c2-.8 4-.8 6-.2M14 12.7c2-.8 4-.8 6-.2" stroke="#b9ad96" stroke-width=".7" fill="none"/><path d="M17 5.6V11l1.3-1 1.3 1V5.4" fill="#e05a5a"/>',
  // 말랑이: 손에 쥐는 동그란 장난감
  fidget: '<circle cx="12" cy="12.5" r="8.5" fill="#9fd3c7"/><circle cx="9" cy="10" r="1.8" fill="#7cbcae"/><circle cx="14.5" cy="9.5" r="1.8" fill="#7cbcae"/><circle cx="8.5" cy="15" r="1.8" fill="#7cbcae"/><circle cx="14" cy="15.5" r="1.8" fill="#7cbcae"/><circle cx="11.5" cy="12.5" r="1.8" fill="#7cbcae"/><ellipse cx="9" cy="7" rx="2.5" ry="1.2" fill="#fff" opacity=".5"/>',
  // 핸드크림: 짜는 튜브
  cream: '<path d="M7 3h10l-1.5 15h-7z" fill="#f3c1c6"/><rect x="9" y="18" width="6" height="3.5" rx="1" fill="#f6f2e8"/><rect x="8.2" y="7" width="7.6" height="5" rx="1" fill="#fff" opacity=".7"/><path d="M10 9.5h4" stroke="#d98c96" stroke-width="1" stroke-linecap="round"/><rect x="7" y="3" width="10" height="1.6" fill="#e3a3ab"/>',
  flower: '<path d="M12 13v8" stroke="#5d8a4f" stroke-width="1.6" stroke-linecap="round"/><path d="M12 18c-2-2-4-2-5-1 1 2 3 2 5 1zM12 17c2-2 4-2 5-1-1 2-3 2-5 1z" fill="#7fbf6a"/><circle cx="12" cy="6" r="2.6" fill="#f3c1c6"/><circle cx="9" cy="9" r="2.6" fill="#f3c1c6"/><circle cx="15" cy="9" r="2.6" fill="#f3c1c6"/><circle cx="10" cy="12" r="2.6" fill="#e8a3ad"/><circle cx="14" cy="12" r="2.6" fill="#e8a3ad"/><circle cx="12" cy="9.5" r="2" fill="#f2c94c"/>',
  // 두통약: 알약 + 포장
  pill: '<rect x="4" y="6" width="16" height="12" rx="2" fill="#eef0f3"/><rect x="4" y="6" width="16" height="3.5" rx="1.5" fill="#6fb3ff"/><g transform="rotate(-35 12 13.5)"><rect x="7.5" y="11.5" width="9" height="4" rx="2" fill="#fff" stroke="#c9cdd2" stroke-width=".6"/><rect x="12" y="11.5" width="4.5" height="4" rx="2" fill="#e05a5a"/></g>',
};

export function itemIcon(name: ItemIcon | undefined, size = 18): string {
  if (!name) return '';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${SVG[name]}</svg>`;
}
