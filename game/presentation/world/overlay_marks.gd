class_name OverlayMarks
extends Node2D

## 바닥 표시: 구역(은신·세이프)·상호작용 고리·목표 고리·조용한 곳·NPC 시야 콘·시선 선·소리 파동·개인 공간·좌판·소품·혼자만의 틈
## (웹 판 Renderer.ts drawWorld3d가 2D 함수로 바닥 표시 캔버스에 그리던 것). 월드 좌표(칸)로 그리고,
## WorldView3D가 이 노드를 SubViewport에 넣어 그 그림을 바닥 바로 위 평면에 덮는다.
## 연출은 시뮬레이션을 읽기만 한다.

## 덮는 영역 (칸)
const TILES_W := 64
const TILES_H := 40
## 칸당 픽셀
const PX := 24

var cfg: Dictionary
var world: World
var font: Font
## 덮는 영역 [x, y, w, h]
var area := [0, 0, TILES_W, TILES_H]
var layer_rect: Array = [0, 0, 1, 1]
var night := 0.0

var _s = null
var _ps: PresentationState = null
var _st: Settings = null
var _dt := 0.0
var _rings: Array = []
var _ring_timer := 0.0


func setup(config: Dictionary, w: World, f: Font) -> void:
	cfg = config
	world = w
	font = f


## 매 프레임: 덮을 영역을 옮기고 다시 그린다
func refresh(s, ps: PresentationState, st: Settings, dt: float, origin: Vector2, layer: Array, night_level: float) -> void:
	_s = s
	_ps = ps
	_st = st
	_dt = dt
	area = [origin.x, origin.y, TILES_W, TILES_H]
	layer_rect = layer
	night = night_level
	transform = Transform2D(0.0, Vector2(PX, PX), 0.0, -origin * PX)
	_update_rings(dt)
	queue_redraw()


func _visible_at(x: float, y: float) -> bool:
	return CityGrid.in_rect(layer_rect, x, y)


func _near(x: float, y: float, margin: float = 2.0) -> bool:
	return x > area[0] - margin and y > area[1] - margin and x < area[0] + area[2] + margin and y < area[1] + area[3] + margin


func _draw() -> void:
	if _s == null:
		return
	_draw_stalls()
	_draw_props()
	_draw_zones()
	_draw_interact_hints()
	_draw_quiet_spots()
	_draw_view_cones()
	_draw_gaze()
	_draw_rings()
	# 개인 공간 (점선 원)
	var p: Vector2 = _s.player.pos
	_dashed_circle(p, float(cfg["balance"]["personalSpace"]["radius"]), Color(1, 1, 1, 0.12 + _ps.stress * 0.15), 0.05, 0.14, 0.12)
	_draw_item_break()


# ───────────────────────── 도형 도우미 ─────────────────────────

func _ring(c: Vector2, r: float, col: Color, width: float) -> void:
	draw_arc(c, r, 0.0, TAU, maxi(16, int(r * 24)), col, width, true)


func _dashed_circle(c: Vector2, r: float, col: Color, width: float, dash: float, gap: float, offset: float = 0.0) -> void:
	var circ := TAU * r
	var n := maxi(4, int(circ / (dash + gap)))
	var step := TAU / n
	var on := step * dash / (dash + gap)
	var a0 := offset / maxf(0.001, r)
	for i in n:
		var a := a0 + i * step
		draw_arc(c, r, a, a + on, 4, col, width, true)


func _dashed_poly(pts: PackedVector2Array, col: Color, width: float, dash: float, gap: float, offset: float) -> void:
	# 둘레를 따라 일정한 점선 (선분마다 끊기지 않게 남은 길이를 이어 간다)
	var period := dash + gap
	var t := fposmod(offset, period)
	for i in pts.size():
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		var seg := a.distance_to(b)
		if seg < 0.0001:
			continue
		var dir := (b - a) / seg
		var d := 0.0
		while d < seg:
			var phase := fposmod(t + d, period)
			if phase < dash:
				var len := minf(dash - phase, seg - d)
				draw_line(a + dir * d, a + dir * (d + len), col, width, true)
				d += len
			else:
				d += period - phase
		t += seg


func _text(at: Vector2, text: String, size_tiles: float, col: Color, bg: Color = Color(0, 0, 0, 0), pad: float = 0.15) -> void:
	if font == null:
		return
	var fs := maxi(6, int(size_tiles * PX))
	var sz := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs) / PX
	if bg.a > 0:
		draw_rect(Rect2(at.x - sz.x / 2.0 - pad, at.y - sz.y / 2.0 - pad * 0.4, sz.x + pad * 2.0, sz.y + pad * 0.8), bg)
	draw_set_transform(at, 0.0, Vector2(1.0 / PX, 1.0 / PX))
	var asc := font.get_ascent(fs)
	draw_string(font, Vector2(-sz.x * PX / 2.0, asc - sz.y * PX / 2.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _rgba(rgb: Array, a: float) -> Color:
	return Color8(rgb[0], rgb[1], rgb[2], clampi(int(a * 255.0), 0, 255))


# ───────────────────────── 좌판·소품 ─────────────────────────

## 그날만 서는 노점: 줄무늬 천막 + 앞쪽 좌판
func _draw_stalls() -> void:
	var day: Variant = _s.day
	if not (day is Dictionary):
		return
	for stall in day.get("stalls", []):
		var r: Array = stall["rect"]
		var x := float(r[0])
		var y := float(r[1])
		var w := float(r[2])
		var h := float(r[3])
		if not _near(x, y, 4) or not _visible_at(x, y):
			continue
		draw_rect(Rect2(x + 0.15, y + 0.25, w, h), Color(0, 0, 0, 0.18))
		draw_rect(Rect2(x + 0.1, y + h - 0.35, w - 0.2, 0.35), Color("#c9a27e"))
		var goods := ["#e05a5a", "#f2c94c", "#9fd38a", "#6fb3ff", "#f7f2e8"]
		for i in int(w * 2 - 1):
			draw_rect(Rect2(x + 0.25 + i * 0.5, y + h - 0.28, 0.3, 0.2), Color(goods[(i * 7 + int(x)) % 5]))
		var stripes := maxi(2, roundi(w * 2))
		for i in stripes:
			draw_rect(Rect2(x + i * w / stripes, y, w / stripes + 0.01, h - 0.4), Color("#fbf5e6") if i % 2 else Color(stall.get("color", "#e07a5f")))
		draw_rect(Rect2(x, y + h - 0.55, w, 0.15), Color(0, 0, 0, 0.12))


## 거리·생활 소품 (가로등은 3D 장면이 세운다)
func _draw_props() -> void:
	for p in world.def.get("props", []):
		var at: Array = p["at"]
		var x := float(at[0])
		var y := float(at[1])
		var kind: String = p["kind"]
		if kind == "lamp" or not _near(x, y) or not _visible_at(x, y):
			continue
		_draw_prop(kind, Vector2(x, y), float(p.get("rot", 0.0)))


func _shadow(c: Vector2, rx: float, ry: float) -> void:
	draw_set_transform(c + Vector2(0.06, 0.1), 0.0, Vector2(1.0, ry / rx))
	draw_circle(Vector2.ZERO, rx, Color(0, 0, 0, 0.18))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_prop(kind: String, c: Vector2, rot: float) -> void:
	var t: float = _ps.time
	match kind:
		"bin":
			_shadow(c, 0.2, 0.12)
			draw_circle(c, 0.19, Color("#4f6b5a"))
			draw_circle(c, 0.13, Color("#3c5446"))
			draw_circle(c + Vector2(-0.06, -0.06), 0.05, Color(1, 1, 1, 0.18))
		"bike":
			draw_set_transform(c, rot, Vector2.ONE)
			for sx in [-0.32, 0.32]:
				draw_arc(Vector2(sx, 0), 0.2, 0, TAU, 16, Color("#2b2f38"), 0.05)
			var frame_c: String = ["#c0392b", "#3b6fb6", "#f2c94c", "#5b7d63"][int(c.x * 7 + c.y) % 4]
			draw_line(Vector2(-0.32, 0), Vector2(0.32, 0), Color(frame_c), 0.06)
			draw_line(Vector2(0.28, -0.14), Vector2(0.28, 0.14), Color("#2b2f38"), 0.05)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		"aircon":
			_shadow(c, 0.36, 0.2)
			draw_rect(Rect2(c.x - 0.34, c.y - 0.26, 0.68, 0.52), Color("#d9dcdf"))
			draw_circle(c + Vector2(-0.06, 0), 0.19, Color("#9aa1a8"))
			for i in 3:
				var a := t * 6.0 + i * TAU / 3.0
				draw_line(c + Vector2(-0.06, 0), c + Vector2(-0.06 + cos(a) * 0.16, sin(a) * 0.16), Color("#6b737b"), 0.035)
		"pot":
			_shadow(c, 0.22, 0.13)
			draw_circle(c, 0.2, Color("#b07a52"))
			for i in 6:
				var a := i / 6.0 * TAU
				draw_circle(c + Vector2(cos(a) * 0.12, -0.04 + sin(a) * 0.12), 0.08, Color("#5f8b56"))
			draw_circle(c + Vector2(0, -0.05), 0.05, Color(["#f3c1c6", "#f6e7a1", "#e05a5a"][int(c.x + c.y) % 3]))
		"hydrant":
			_shadow(c, 0.15, 0.09)
			draw_circle(c, 0.13, Color("#c0392b"))
			draw_circle(c, 0.07, Color("#d4706a"))
		"manhole":
			draw_circle(c, 0.32, Color(0.157, 0.165, 0.188, 0.55))
			for i in range(-2, 3):
				draw_line(c + Vector2(-0.25, i * 0.09), c + Vector2(0.25, i * 0.09), Color(0.47, 0.486, 0.517, 0.6), 0.03)
		"recycleGreen", "recycleBlue", "recycleYellow":
			var col := Color("#4f8a5b") if kind == "recycleGreen" else (Color("#3b6fb6") if kind == "recycleBlue" else Color("#e0b03c"))
			_shadow(c, 0.4, 0.22)
			draw_rect(Rect2(c.x - 0.38, c.y - 0.3, 0.76, 0.6), col)
			draw_rect(Rect2(c.x - 0.38, c.y - 0.3, 0.76, 0.14), col.darkened(0.25))
			draw_circle(c + Vector2(0, 0.06), 0.08, Color(1, 1, 1, 0.85))
		"busStop":
			# 버스 정류장: 유리 지붕 쉼터 + 긴 의자 + 노선 표지판 (rot = π면 길 건너편을 향한다)
			draw_set_transform(c, rot, Vector2.ONE)
			draw_rect(Rect2(-1.55, -0.38, 3.2, 0.9), Color(0, 0, 0, 0.16))
			draw_rect(Rect2(-1.6, 0.28, 3.2, 0.08), Color("#5a6270"))
			draw_rect(Rect2(-1.1, 0.02, 2.2, 0.22), Color("#9b7a55"))
			draw_rect(Rect2(-1.6, -0.5, 3.2, 0.86), Color(0.745, 0.843, 0.9, 0.42))
			draw_rect(Rect2(-1.6, -0.5, 3.2, 0.86), Color(0.275, 0.314, 0.373, 0.8), false, 0.05)
			draw_rect(Rect2(-1.5, 0.3, 0.8, 0.06), Color("#3f9a5c"))
			draw_circle(Vector2(1.95, -0.3), 0.07, Color("#4a4f58"))
			draw_circle(Vector2(1.95, -0.62), 0.24, Color("#3f9a5c"))
			draw_circle(Vector2(1.95, -0.62), 0.13, Color.WHITE)
			draw_rect(Rect2(1.92, -0.69, 0.06, 0.15), Color("#3f9a5c"))
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			if night > 0.2:
				draw_set_transform(c, 0.0, Vector2(1.0, 1.0 / 2.2))
				draw_circle(Vector2.ZERO, 2.2, Color(1.0, 0.925, 0.745, night * 0.18))
				draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		"catBowl":
			draw_circle(c + Vector2(-0.14, 0), 0.13, Color("#e8eef2"))
			draw_circle(c + Vector2(0.16, 0), 0.13, Color("#e8eef2"))
			draw_circle(c + Vector2(-0.14, 0), 0.08, Color("#c49a6c"))
			draw_circle(c + Vector2(0.16, 0), 0.08, Color("#a3c9d8"))


# ───────────────────────── 구역·상호작용·목표 ─────────────────────────

## 은신 지점(파랑)·세이프 존(초록): 가까이 가면 테두리와 이름표
func _draw_zones() -> void:
	var range_v := float(cfg["presentation"]["fx"]["zoneRange"])
	var p: Vector2 = _s.player.pos
	var hide_label := DataLoader.t(cfg["text"], "hud.hideSpot")
	var safe_label := DataLoader.t(cfg["text"], "hud.safe")
	for h in world.hides:
		_zone(h["rect"], [110, 170, 255], hide_label, _s.player.hidden and CityGrid.in_rect(h["rect"], p.x, p.y), p, range_v)
	for sf in world.safes:
		_zone(sf["rect"], [120, 210, 140], safe_label, _s.player.locked_safe != null and CityGrid.in_rect(sf["rect"], p.x, p.y), p, range_v)


func _zone(r: Array, rgb: Array, label: String, active: bool, p: Vector2, range_v: float) -> void:
	var x := float(r[0])
	var y := float(r[1])
	var w := float(r[2])
	var h := float(r[3])
	var d := Vector2(x + w / 2.0, y + h / 2.0).distance_to(p)
	if d > range_v or not _visible_at(x + w / 2.0, y + h / 2.0):
		return
	var near := maxf(0.0, 1.0 - d / range_v)
	draw_rect(Rect2(x, y, w, h), _rgba(rgb, 0.28 if active else 0.1 + near * 0.12))
	var pts := PackedVector2Array([Vector2(x + 0.05, y + 0.05), Vector2(x + w - 0.05, y + 0.05), Vector2(x + w - 0.05, y + h - 0.05), Vector2(x + 0.05, y + h - 0.05)])
	_dashed_poly(pts, _rgba(rgb, 0.45 + near * 0.45), 0.07, 0.3, 0.2, -_ps.time * 0.3)
	if near > 0.3:
		_text(Vector2(x + w / 2.0, y - 0.26), label, 0.42, _rgba(rgb, minf(1.0, near * 1.4)), Color(0.078, 0.094, 0.125, 0.7 * near))


func _markers() -> Dictionary:
	var out := {}
	for o in _s.objectives.visible():
		var m: String = o["def"].get("marker", "")
		if m != "":
			out[m] = true
	return out


func _draw_interact_hints() -> void:
	var p: Vector2 = _s.player.pos
	var range_v := float(cfg["presentation"]["fx"]["markerRange"])
	var markers := _markers()
	for it in world.interactables:
		var x := float(it["at"][0])
		var y := float(it["at"][1])
		if not _near(x, y) or not _visible_at(x, y):
			continue
		if markers.has(it["id"]):
			_draw_beacon(Vector2(x, y))
			continue
		var d := Vector2(x, y).distance_to(p)
		if d > range_v:
			continue
		# 일반 상호작용: 어두운 테두리 + 밝은 고리. 가까울수록 진하다
		var a := 0.35 + maxf(0.0, 1.0 - d / range_v) * 0.6
		_ring(Vector2(x, y), 0.24, Color(0.098, 0.086, 0.118, a * 0.6), 0.1)
		_ring(Vector2(x, y), 0.24, Color(1.0, 0.98, 0.9, a), 0.05)
		draw_circle(Vector2(x, y), 0.08, Color(1.0, 0.98, 0.9, a))
	for portal in world.portals:
		var x := float(portal["at"][0])
		var y := float(portal["at"][1])
		if Vector2(x, y).distance_to(p) > range_v + 2 or not _visible_at(x, y):
			continue
		var k := 0.4 + 0.06 * sin(_ps.time * 3.0)
		_ring(Vector2(x, y), k, Color(0.098, 0.086, 0.118, 0.45), 0.12)
		_ring(Vector2(x, y), k, Color(0.627, 0.824, 1.0, 0.9), 0.06)


## 목표 지점: 바닥에 퍼지는 고리 (떠 있는 화살표는 3D 장면이 세운다)
func _draw_beacon(c: Vector2) -> void:
	for i in 2:
		var k := fmod(_ps.time * 0.8 + i * 0.5, 1.0)
		_ring(c, 0.3 + k * 0.9, Color(1.0, 0.784, 0.235, (1.0 - k) * 0.85), 0.08)
	draw_circle(c, 0.26, Color(0.098, 0.086, 0.118, 0.55))
	draw_circle(c, 0.18, Color("#ffcf4a"))


## 찾은 조용한 곳: 바닥에 은은한 잎 모양 표시 (아직 못 찾은 곳은 보이지 않는다)
func _draw_quiet_spots() -> void:
	var found: Dictionary = _s.quiet_found
	for q in cfg["quietSpots"]["spots"]:
		if not found.has(q["id"]):
			continue
		var x := float(q["at"][0])
		var y := float(q["at"][1])
		if not _near(x, y):
			continue
		var a := 0.25 + 0.1 * sin(_ps.time * 1.5 + x)
		_ring(Vector2(x, y), float(q["radius"]) * 0.8, Color(0.498, 0.749, 0.416, a), 0.06)
		draw_set_transform(Vector2(x, y), -0.6, Vector2(1.0, 0.12 / 0.22))
		draw_circle(Vector2.ZERO, 0.22, Color(0.498, 0.749, 0.416, a + 0.2))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


# ───────────────────────── 시야·시선·소리 ─────────────────────────

## NPC 시야: 벽에 가려지는 만큼 잘라 그린다. 평소 노랑 → 알아챔 주황 → 추적 빨강
func _draw_view_cones() -> void:
	var fx: Dictionary = cfg["presentation"]["fx"]
	var p: Vector2 = _s.player.pos
	for n in _s.active_npcs():
		var prof: Dictionary = n.profile
		if not prof.get("approaches", false) or n.state == "dialogue" or n.state == "seated":
			continue
		var r := float(prof["viewDistance"])
		if n.pos.distance_to(p) > r + 8 or not _visible_at(n.pos.x, n.pos.y):
			continue
		var half := deg_to_rad(float(prof["viewHalfAngleDeg"]))
		var poly := _sight_polygon(n.pos, n.facing, half, r)
		var heat := 1.0 if n.pursuing else minf(1.0, n.notice)
		var rgb := [235, 70, 60] if heat >= 1.0 else ([245, 140, 50] if heat > 0.15 else [250, 200, 70])
		var seen: bool = n.percept.get("inView", false)
		var a := float(fx["viewConeAlpha"]) * (0.7 + heat * 0.6) * ((1.0 + 0.25 * sin(_ps.time * 8.0)) if seen else 1.0)
		# 둥근 그러데이션 대신 정점색: 가운데 진하고 끝으로 갈수록 옅게
		var pts := PackedVector2Array([n.pos])
		var cols := PackedColorArray([_rgba(rgb, minf(0.6, a))])
		for q in poly:
			pts.append(q)
			var k := clampf(q.distance_to(n.pos) / r, 0.0, 1.0)
			cols.append(_rgba(rgb, minf(0.6, a * lerpf(0.9, 0.45, k))))
		draw_polygon(pts, cols)
		# 테두리: 어두운 바탕선 + 색 점선 → 밝은 바닥에서도 보인다
		var edge := float(fx["viewConeEdgeAlpha"])
		var closed := pts.duplicate()
		closed.append(n.pos)
		draw_polyline(closed, Color(0.118, 0.078, 0.078, edge * 0.45), 0.09, true)
		_dashed_poly(pts, _rgba(rgb, edge), 0.05, 0.25, 0.15, _ps.time * (0.4 + heat))


## 시선 레이를 부채꼴로 쏘아 벽(sight 타일)에서 멈춘 끝점들
func _sight_polygon(o: Vector2, facing: float, half: float, range_v: float) -> Array:
	var rays := maxi(12, roundi(half * 2.0 * range_v / 0.6))
	var pts: Array = []
	var map: CityGrid = world.map
	for i in rays + 1:
		var ang := facing - half + float(i) / rays * half * 2.0
		var dx := cos(ang)
		var dy := sin(ang)
		var d := 0.0
		while d < range_v:
			var nd := minf(range_v, d + 0.2)
			if map.blocks_sight(floori(o.x + dx * nd), floori(o.y + dy * nd)):
				break
			d = nd
		pts.append(Vector2(o.x + dx * d, o.y + dy * d))
	return pts


## 나를 보는 시선: 가늘고 따가운 선
func _draw_gaze() -> void:
	var p: Vector2 = _s.player.pos
	var alpha := float(cfg["presentation"]["fx"]["gazeLineAlpha"])
	var range_v := float(cfg["balance"]["gaze"]["range"])
	for n in _s.active_npcs():
		if not n.gazing or n.npc_type == "ally" or n.npc_type == "pet":
			continue
		var d: float = n.pos.distance_to(p)
		if d > range_v or d < 0.01:
			continue
		var a := alpha * minf(1.0, n.notice) * (0.6 + 0.4 * _ps.stress)
		var col := Color(1.0, 0.47, 0.39, a) if n.percept.get("eyeContact", false) else Color(1.0, 0.9, 0.784, a * 0.6)
		var steps := ceili(d * 3.0)
		var line := PackedVector2Array()
		var nrm := Vector2(-(p.y - n.pos.y) / d, (p.x - n.pos.x) / d)
		for i in steps + 1:
			var k := float(i) / steps
			var jitter := (1.0 if i % 2 == 0 else -1.0) * 0.06 * (0.3 + _ps.stress) * (1.0 if i > 0 and i < steps else 0.0)
			line.append(n.pos + (p - n.pos) * k + nrm * jitter)
		draw_polyline(line, col, 0.035 + _ps.flush * 0.03, true)


## 소리의 시각 대체 표시: 발소리·말소리 파동. 이어폰을 끼면 보이지 않는다 (후방 접근 감지 불가)
func _update_rings(dt: float) -> void:
	var p: Vector2 = _s.player.pos
	_ring_timer -= dt
	if _ring_timer <= 0 and _st.visual_cues and cfg["presentation"]["fx"].get("soundRings", true):
		_ring_timer = 0.45
		for n in _s.active_npcs():
			if n.pos.distance_to(p) > 14:
				continue
			if n.speed > 0.1 and _ps.earphones < 0.5:
				_rings.append({"c": n.pos, "age": 0.0, "life": 0.9, "radius": 1.6 if n.pursuing else 1.0, "rgb": [255, 150, 120] if n.pursuing else [230, 230, 240]})
			if n.state == "dialogue" and _s.mode["kind"] != "dialogue":
				_rings.append({"c": n.pos, "age": 0.0, "life": 1.0, "radius": 1.3, "rgb": [255, 220, 160]})
		if _s.phone.ringing():
			_rings.append({"c": p, "age": 0.0, "life": 0.6, "radius": 1.2, "rgb": [160, 210, 255]})
	for e in _ps.sounds:
		if e.get("id", "") == "knock" or e.get("id", "") == "doorbell":
			_rings.append({"c": p, "age": 0.0, "life": 1.0, "radius": 3.0, "rgb": [255, 190, 120]})
	for r in _rings:
		r["age"] += dt
	_rings = _rings.filter(func(r): return r["age"] < r["life"])


func _draw_rings() -> void:
	for r in _rings:
		var k: float = r["age"] / r["life"]
		_ring(r["c"], 0.3 + k * r["radius"], _rgba(r["rgb"], (1.0 - k) * 0.5), 0.05)


## 혼자만의 틈: 플레이어를 감싸는 따뜻한 진행 고리. 누가 보고 있으면 회색으로 멈춘다
func _draw_item_break() -> void:
	var b: Variant = _s.item_break
	if not (b is Dictionary):
		return
	var c: Vector2 = _s.player.pos
	var k := minf(1.0, float(b["time"]) / maxf(0.01, float(b["dur"])))
	var paused: bool = b.get("paused", false)
	var r := 0.62 + (0.0 if paused else sin(_ps.time * 2.0) * 0.02)
	_ring(c, r, Color(1, 1, 1, 0.12), 0.07)
	draw_arc(c, r, -PI / 2.0, -PI / 2.0 + k * TAU, 48, Color(0.667, 0.667, 0.706, 0.7) if paused else Color(1.0, 0.768, 0.47, 0.9), 0.07, true)
	if not paused:
		draw_circle(c, 1.1, Color(1.0, 0.784, 0.51, 0.06))
