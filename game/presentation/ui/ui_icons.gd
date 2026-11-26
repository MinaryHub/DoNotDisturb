class_name UiIcons
extends RefCounted

## 소모품·장비 아이콘 (도형 조합 SVG, 웹 판 src/presentation/ui/icons.ts 그대로). items.json의 icon 이름으로 고른다.
## 그림 문자 대신 쓰는 UI 아이콘(생활 지표·전화·가방·도장·표정)도 여기서 그린다: 웹 내보내기에는 그림 문자 글꼴이 없다.

const SVG := {
	# 찬 음료: 얼음 든 플라스틱 컵 + 빨대
	"cup": '<path d="M6 7h12l-1.5 13h-9z" fill="#cfe8f3"/><path d="M7 11h10l-1 8H8z" fill="#8cc7e0"/><rect x="9" y="12" width="3" height="3" rx=".6" fill="#fff" opacity=".8"/><rect x="13" y="14" width="2.6" height="2.6" rx=".6" fill="#fff" opacity=".7"/><path d="M13 7l3-5" stroke="#e05a5a" stroke-width="1.6" stroke-linecap="round"/><rect x="5" y="6" width="14" height="2" rx="1" fill="#eef6fa"/>',
	# 간식: 과자 봉지
	"snack": '<path d="M6 4h12l-1 2 1 2v10l1 2-1 2H6l-1-2 1-2V8L5 6z" fill="#f29e4c"/><rect x="7" y="9" width="10" height="7" rx="2" fill="#fff3d6"/><circle cx="12" cy="12.5" r="2.2" fill="#e05a5a"/>',
	# 텀블러 커피
	"tumbler": '<rect x="7" y="5" width="10" height="16" rx="2.5" fill="#6b8f71"/><rect x="6.5" y="3" width="11" height="3.2" rx="1.2" fill="#3f4a44"/><rect x="7" y="10" width="10" height="3" fill="#e8dfc8"/><path d="M10 1.5c0 1 1 1 1 2M13 1.5c0 1 1 1 1 2" stroke="#c9c2b4" stroke-width=".8" fill="none"/>',
	# 에너지 드링크: 캔
	"can": '<rect x="7" y="4" width="10" height="17" rx="2" fill="#2f3e46"/><rect x="7.6" y="3" width="8.8" height="2" rx="1" fill="#c9cdd2"/><path d="M13 7l-3.5 6H12l-1.5 5 4-7h-2.5z" fill="#f2c94c"/><rect x="7" y="19" width="10" height="2" rx="1" fill="#c9cdd2"/>',
	# 생수: 페트병
	"bottle": '<rect x="10" y="2" width="4" height="2.5" rx=".8" fill="#6fb3ff"/><path d="M9.5 4.5h5l1.5 3v12.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 20V7.5z" fill="#d8eefa"/><rect x="8" y="11" width="8" height="4" fill="#6fb3ff"/><path d="M10 8v2M10 16v3" stroke="#fff" stroke-width="1" stroke-linecap="round"/>',
	# 캐모마일 차: 티백이 든 머그
	"tea": '<path d="M5 8h11v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" fill="#f2e8cf"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" stroke="#f2e8cf" stroke-width="1.6" fill="none"/><rect x="6" y="10" width="9" height="2" fill="#e0b85a"/><path d="M11 3v7" stroke="#b9b2a4" stroke-width=".7"/><rect x="9.5" y="2" width="3" height="3" fill="#9fd38a"/>',
	# 쿨링 시트
	"patch": '<rect x="3" y="7" width="18" height="10" rx="3" fill="#cfe8f3"/><rect x="6" y="9" width="12" height="6" rx="2" fill="#8cc7e0"/><path d="M9 12h6M12 10v4" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/>',
	# 우산
	"umbrella": '<path d="M2 12a10 9 0 0 1 20 0z" fill="#3b6fb6"/><path d="M7 12a5 9 0 0 1 10 0" fill="#5b8fd6"/><path d="M12 12v7a2 2 0 0 1-4 0" stroke="#4b4f58" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M12 3v1" stroke="#4b4f58" stroke-width="1.6" stroke-linecap="round"/>',
	# 삼각김밥: 밥 + 김 띠
	"rice": '<path d="M12 3L21 19a1.5 1.5 0 0 1-1.3 2H4.3A1.5 1.5 0 0 1 3 19z" fill="#f6f2e8"/><path d="M8.2 21h7.6l-1-6.5h-5.6z" fill="#2f3e33"/><circle cx="12" cy="10" r="1.6" fill="#e05a5a" opacity=".8"/>',
	# 샌드위치: 삼각 단면
	"sandwich": '<path d="M3 18L19 5l2 13z" fill="#e8c88a"/><path d="M5 16.5L18.6 6.3l.5 3.2L6.8 17z" fill="#7fbf6a"/><path d="M6.8 17L19.1 9.5l.4 2.6L8.6 17.6z" fill="#f2d16b"/><path d="M8.6 17.6l11-5.5.4 2.6L10.5 18z" fill="#e06a6a"/>',
	# 빵: 식빵 한 덩이
	"bread": '<path d="M4 11a8 5 0 0 1 16 0v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="#d9a35a"/><path d="M6 12a6 3.5 0 0 1 12 0v7H6z" fill="#f3d9a4"/><path d="M8 9.5q4-2 8 0" stroke="#b07a3a" stroke-width="1" fill="none"/>',
	# 바나나
	"banana": '<path d="M4 8c2 8 9 12 16 9-1 2-4 4-8 4-5 0-9-5-9-12z" fill="#f2d24c"/><path d="M4 8l-.5-2.5L5 6z" fill="#6b5a2a"/><path d="M6 11c2 4 6 6 10 6" stroke="#d9b23a" stroke-width="1" fill="none"/>',
	# 도시락: 칸 나뉜 상자
	"box": '<rect x="3" y="6" width="18" height="13" rx="2" fill="#4a6b8a"/><rect x="4.5" y="7.5" width="9" height="10" rx="1" fill="#f6f2e8"/><rect x="14.5" y="7.5" width="5" height="4.5" rx="1" fill="#e06a6a"/><rect x="14.5" y="13" width="5" height="4.5" rx="1" fill="#7fbf6a"/><circle cx="9" cy="12.5" r="1" fill="#2f3e33"/>',
	# 읽던 책: 펼친 책 + 책갈피
	"book": '<path d="M2 6c3-1.5 7-1.5 10 .5V20c-3-2-7-2-10-.5z" fill="#f6f2e8"/><path d="M22 6c-3-1.5-7-1.5-10 .5V20c3-2 7-2 10-.5z" fill="#ece4d2"/><path d="M12 6.5V20" stroke="#b9ad96" stroke-width=".8"/><path d="M4 9.5c2-.6 4-.6 6 .2M4 12.5c2-.6 4-.6 6 .2M14 9.7c2-.8 4-.8 6-.2M14 12.7c2-.8 4-.8 6-.2" stroke="#b9ad96" stroke-width=".7" fill="none"/><path d="M17 5.6V11l1.3-1 1.3 1V5.4" fill="#e05a5a"/>',
	# 말랑이: 손에 쥐는 동그란 장난감
	"fidget": '<circle cx="12" cy="12.5" r="8.5" fill="#9fd3c7"/><circle cx="9" cy="10" r="1.8" fill="#7cbcae"/><circle cx="14.5" cy="9.5" r="1.8" fill="#7cbcae"/><circle cx="8.5" cy="15" r="1.8" fill="#7cbcae"/><circle cx="14" cy="15.5" r="1.8" fill="#7cbcae"/><circle cx="11.5" cy="12.5" r="1.8" fill="#7cbcae"/><ellipse cx="9" cy="7" rx="2.5" ry="1.2" fill="#fff" opacity=".5"/>',
	# 핸드크림: 짜는 튜브
	"cream": '<path d="M7 3h10l-1.5 15h-7z" fill="#f3c1c6"/><rect x="9" y="18" width="6" height="3.5" rx="1" fill="#f6f2e8"/><rect x="8.2" y="7" width="7.6" height="5" rx="1" fill="#fff" opacity=".7"/><path d="M10 9.5h4" stroke="#d98c96" stroke-width="1" stroke-linecap="round"/><rect x="7" y="3" width="10" height="1.6" fill="#e3a3ab"/>',
	"flower": '<path d="M12 13v8" stroke="#5d8a4f" stroke-width="1.6" stroke-linecap="round"/><path d="M12 18c-2-2-4-2-5-1 1 2 3 2 5 1zM12 17c2-2 4-2 5-1-1 2-3 2-5 1z" fill="#7fbf6a"/><circle cx="12" cy="6" r="2.6" fill="#f3c1c6"/><circle cx="9" cy="9" r="2.6" fill="#f3c1c6"/><circle cx="15" cy="9" r="2.6" fill="#f3c1c6"/><circle cx="10" cy="12" r="2.6" fill="#e8a3ad"/><circle cx="14" cy="12" r="2.6" fill="#e8a3ad"/><circle cx="12" cy="9.5" r="2" fill="#f2c94c"/>',
	"candy": '<path d="M3 9l3 3-3 3zM21 9l-3 3 3 3z" fill="#f3c1c6"/><circle cx="12" cy="12" r="6" fill="#f29eb0"/><path d="M8 9.5q4 3 8 0M8 14.5q4-3 8 0" stroke="#fff" stroke-width="1.2" fill="none" opacity=".8"/>',
	"jelly": '<path d="M5 18c0-6 2.5-11 7-11s7 5 7 11z" fill="#c9e4a6"/><path d="M5 18h14v2H5z" fill="#9fc27a"/><path d="M9 11q1.5-2 3-2" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="12" cy="14" r="1.6" fill="#f2e8cf"/>',
	"vitamin": '<rect x="6" y="5" width="12" height="16" rx="2.5" fill="#f29e4c"/><rect x="7.5" y="2.5" width="9" height="3.5" rx="1" fill="#f6f2e8"/><rect x="6" y="10" width="12" height="5" fill="#fff3d6"/><path d="M12 11v3M10.5 12.5h3" stroke="#e05a5a" stroke-width="1.4" stroke-linecap="round"/>',
	"star": '<path d="M12 2.5l2.6 6.2 6.7.6-5.1 4.4 1.6 6.6L12 16.8l-5.8 3.5 1.6-6.6-5.1-4.4 6.7-.6z" fill="#c49bd8"/><path d="M12 6l1.4 3.4 3.6.3-2.7 2.4.8 3.5L12 13.7l-3.1 1.9.8-3.5-2.7-2.4 3.6-.3z" fill="#f6e7ff"/><circle cx="19" cy="4" r="1.2" fill="#f2c94c"/><circle cx="4.5" cy="18.5" r="1" fill="#f2c94c"/>',
	# 좋은 노이즈 캔슬링 이어폰: 케이스와 이어폰 두 쪽
	"earbuds": '<rect x="4" y="11" width="16" height="9" rx="4.5" fill="#e8ecf0"/><path d="M4 15h16" stroke="#c9cdd2" stroke-width="1"/><circle cx="12" cy="17.5" r=".8" fill="#9fd38a"/><path d="M7 4a3 3 0 0 1 3 3v3H8V7.5a1.5 1.5 0 0 0-1-1.4z" fill="#f6f6f6"/><path d="M17 4a3 3 0 0 0-3 3v3h2V7.5a1.5 1.5 0 0 1 1-1.4z" fill="#f6f6f6"/>',
	# 암막 커튼: 봉에 걸린 두 폭
	"curtain": '<rect x="3" y="3" width="18" height="2" rx="1" fill="#6b5b4b"/><path d="M4 5h7.5v15c-2 .8-5 .8-7.5 0z" fill="#3d4f6b"/><path d="M12.5 5H20v15c-2.5.8-5.5.8-7.5 0z" fill="#33445d"/><path d="M7 6v13M10 6v13M15 6v13M18 6v13" stroke="#2a3850" stroke-width=".8"/>',
	# 자전거 정기권: 카드
	"card": '<rect x="2.5" y="6" width="19" height="12.5" rx="2" fill="#5b9a6b"/><rect x="2.5" y="9" width="19" height="2" fill="#3f6f4c"/><circle cx="8" cy="15" r="2" fill="none" stroke="#f6f2e8" stroke-width="1"/><circle cx="15" cy="15" r="2" fill="none" stroke="#f6f2e8" stroke-width="1"/><path d="M8 15l2.5-3h3l1.5 3" stroke="#f6f2e8" stroke-width="1" fill="none"/>',
	# 두통약: 알약 + 포장
	"pill": '<rect x="4" y="6" width="16" height="12" rx="2" fill="#eef0f3"/><rect x="4" y="6" width="16" height="3.5" rx="1.5" fill="#6fb3ff"/><g transform="rotate(-35 12 13.5)"><rect x="7.5" y="11.5" width="9" height="4" rx="2" fill="#fff" stroke="#c9cdd2" stroke-width=".6"/><rect x="12" y="11.5" width="4.5" height="4" rx="2" fill="#e05a5a"/></g>',
	# ── UI 아이콘 (그림 문자 대신) ──
	# 업무 평판: 서류 가방
	"ui.income": '<rect x="3" y="8" width="18" height="12" rx="2.5" fill="#c99a6b"/><path d="M9 8V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2" stroke="#8a6440" stroke-width="1.6" fill="none"/><rect x="3" y="12" width="18" height="2" fill="#8a6440" opacity=".55"/><rect x="10.5" y="11.5" width="3" height="3" rx=".8" fill="#f2d98a"/>',
	# 주거 안정: 집
	"ui.housing": '<path d="M3 11.5L12 4l9 7.5" stroke="#e07a5a" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10.5V20h13v-9.5L12 5.5z" fill="#f3d9a4"/><rect x="10" y="14" width="4" height="6" rx="1" fill="#a86a4a"/><rect x="6" y="5" width="2.4" height="4" fill="#a86a4a"/>',
	# 생활 필수: 장바구니
	"ui.essentials": '<path d="M2.5 5h3l2.2 10h10.6l2-7.5H7" stroke="#8fb7e8" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="7.6" y="8.5" width="11" height="5" rx="1" fill="#8fb7e8" opacity=".55"/><circle cx="9.5" cy="19" r="1.7" fill="#8fb7e8"/><circle cx="16.5" cy="19" r="1.7" fill="#8fb7e8"/>',
	# 관계 유지: 노란 마음
	"ui.bond": '<path d="M12 20.5s-8-4.9-8-10.6A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8 2.6c0 5.7-8 10.6-8 10.6z" fill="#f2c94c"/><ellipse cx="8.3" cy="9.6" rx="1.6" ry="1" fill="#fff" opacity=".5"/>',
	# 전화 수화기
	"ui.call": '<path d="M6.6 3.5l2.6 3.2a1.4 1.4 0 0 1-.1 1.9l-1.4 1.3a12 12 0 0 0 6.4 6.4l1.3-1.4a1.4 1.4 0 0 1 1.9-.1l3.2 2.6a1.4 1.4 0 0 1 .2 2l-1.5 1.7a3 3 0 0 1-3 .9C10.4 20.6 3.4 13.6 2 7.8a3 3 0 0 1 .9-3l1.7-1.5a1.4 1.4 0 0 1 2 .2z" fill="#9fd38a"/>',
	# 가방
	"ui.bag": '<path d="M8 8V6.5a4 4 0 0 1 8 0V8" stroke="#a8825a" stroke-width="1.8" fill="none"/><rect x="4" y="8" width="16" height="13" rx="4" fill="#d9a86a"/><rect x="7" y="13" width="10" height="5" rx="1.5" fill="#b9864f"/><rect x="11" y="12" width="2" height="3" rx=".6" fill="#f2d98a"/>',
	# 작은 승리: 메달
	"ui.medal": '<path d="M8 2h3l2 6h-3zM16 2h-3l-2 6h3z" fill="#e06a6a"/><circle cx="12" cy="15" r="6.5" fill="#f2c94c"/><circle cx="12" cy="15" r="4.5" fill="#ffe08a"/><path d="M12 12.2l.9 1.9 2 .2-1.5 1.4.4 2-1.8-1-1.8 1 .4-2-1.5-1.4 2-.2z" fill="#d9a23a"/>',
	# 아직 얻지 못한 도장
	"ui.ring": '<circle cx="12" cy="13" r="7" fill="none" stroke="#cfc6b4" stroke-width="1.6" stroke-dasharray="2.5 2"/>',
	# 상대 표정 (만족도): 웃음 → 미소 → 무표정 → 곤란
	"ui.face3": '<circle cx="12" cy="12" r="9" fill="#ffd98a"/><path d="M8 10.5q1.2-1.6 2.4 0M13.6 10.5q1.2-1.6 2.4 0" stroke="#5a4630" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M7.8 13.5q4.2 4.6 8.4 0z" fill="#b5523e"/><circle cx="7" cy="14" r="1.4" fill="#f29e8a" opacity=".6"/><circle cx="17" cy="14" r="1.4" fill="#f29e8a" opacity=".6"/>',
	"ui.face2": '<circle cx="12" cy="12" r="9" fill="#ffd98a"/><circle cx="9.2" cy="10.2" r="1.1" fill="#5a4630"/><circle cx="14.8" cy="10.2" r="1.1" fill="#5a4630"/><path d="M8.6 14q3.4 2.8 6.8 0" stroke="#5a4630" stroke-width="1.3" fill="none" stroke-linecap="round"/>',
	"ui.face1": '<circle cx="12" cy="12" r="9" fill="#ffd98a"/><circle cx="9.2" cy="10.2" r="1.1" fill="#5a4630"/><circle cx="14.8" cy="10.2" r="1.1" fill="#5a4630"/><path d="M9 15h6" stroke="#5a4630" stroke-width="1.3" stroke-linecap="round"/>',
	"ui.face0": '<circle cx="12" cy="12" r="9" fill="#ffd98a"/><circle cx="9.2" cy="10.4" r="1.1" fill="#5a4630"/><circle cx="14.8" cy="10.4" r="1.1" fill="#5a4630"/><path d="M8.8 15.8q3.2-1.6 6.4.4" stroke="#5a4630" stroke-width="1.3" fill="none" stroke-linecap="round"/><path d="M7.5 8.2l2.4-.8M16.5 8.2l-2.4-.8" stroke="#5a4630" stroke-width="1" stroke-linecap="round"/>',
	# 지하철
	"ui.metro": '<rect x="5" y="3" width="14" height="15" rx="3.5" fill="#6fb3e0"/><rect x="7" y="5.5" width="10" height="5" rx="1.2" fill="#e8f4fa"/><circle cx="8.5" cy="14" r="1.3" fill="#fff3d6"/><circle cx="15.5" cy="14" r="1.3" fill="#fff3d6"/><path d="M8 18l-2 3M16 18l2 3" stroke="#6fb3e0" stroke-width="1.6" stroke-linecap="round"/>',
	# 연습 대화 코치: 전구
	"ui.bulb": '<path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z" fill="#ffd98a"/><rect x="9" y="17" width="6" height="1.6" rx=".8" fill="#cfc6b4"/><rect x="9.8" y="19.4" width="4.4" height="1.6" rx=".8" fill="#cfc6b4"/><path d="M10.5 11.5l1.5 1.5 1.5-1.5" stroke="#d9a23a" stroke-width="1" fill="none"/>',
}

static var _cache := {}


## 아이콘 텍스처 (size px 정사각형). 없는 이름이면 null
static func tex(name: String, size: int = 24) -> Texture2D:
	if name == "" or not SVG.has(name):
		return null
	var key := "%s@%d" % [name, size]
	if _cache.has(key):
		return _cache[key]
	var svg := '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 24 24">%s</svg>' % [size, size, SVG[name]]
	var img := Image.new()
	var err := img.load_svg_from_string(svg, 1.0)
	if err != OK:
		return null
	var t := ImageTexture.create_from_image(img)
	_cache[key] = t
	return t


## 생활 지표 아이콘 이름
static func life(id: String) -> String:
	return "ui." + id
