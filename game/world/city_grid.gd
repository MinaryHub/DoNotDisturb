class_name CityGrid
extends RefCounted

## 2D 타일 월드 (웹 판 src/world/TileMap.ts). 노드 없이 돌아간다 — 시야·길찾기·충돌을 headless로 시험할 수 있다.
## Godot에 TileMap 클래스가 있어 이름을 CityGrid로 바꿨다.
## 좌표: 타일 (x, y)는 [x, x+1) × [y, y+1) 영역. 엔티티 위치는 타일 단위 실수.
## 3D 판의 Kreate 접두어 규칙(COL_/LOS_/NAV_/HIDE_/SAFE_/TRG_/SPAWN_/PATH_/ZONE_)을 그대로 옮겼다:
##   COL_  → 타일 walk=false        LOS_ → 타일 sight=true
##   NAV_  → walk=true 타일(A*)      HIDE_/SAFE_/ZONE_ → 사각형 영역
##   TRG_  → interactables/portals   SPAWN_/PATH_ → spawns/paths
##
## 표현 (이식 규칙):
## - 위치(Vec2)는 Vector2. 주의: Vector2는 32비트 실수라 웹 판(64비트)과 아주 작은 차이가 날 수 있다.
##   그래서 계산 안쪽(move_circle 등)은 float(64비트)로 하고 끝에서만 Vector2로 묶는다.
## - 사각형(Rect)은 JSON 그대로 Array [x, y, w, h] (숫자는 float).
## - 타일 정의(TileDef)·영역(AreaDef)은 JSON 그대로의 Dictionary (camelCase 키).
## - move_circle은 Vector2가 값 타입이라 pos를 고치지 못한다: 새 위치를 돌려주고, 막혔는지는 last_move_blocked.

var width: int
var height: int
## 타일 정의 (data/world/tiles.json 배열 그대로)
var defs: Array
## 칸마다 타일 정의 번호 (y * width + x)
var tiles: PackedInt32Array
## 영역 정의 (city.json areas 모양)
var areas: Array
## 마지막 move_circle에서 막혔는지 (웹 판 moveCircle의 반환값)
var last_move_blocked := false

var _area_grid: PackedInt32Array
## 타일 정의 번호 → walk / sight (자주 불리는 판정을 빠르게)
var _walk: PackedByteArray
var _sight: PackedByteArray


func _init(w: int, h: int, tile_defs: Array, tile_data: PackedInt32Array, area_defs: Array) -> void:
	assert(tile_data.size() == w * h, "CityGrid: 타일 수가 크기와 맞지 않습니다")
	width = w
	height = h
	defs = tile_defs
	tiles = tile_data
	areas = area_defs
	_walk = PackedByteArray()
	_sight = PackedByteArray()
	for d in tile_defs:
		_walk.append(1 if d["walk"] else 0)
		_sight.append(1 if d["sight"] else 0)
	# 영역 인덱스 격자 (나중에 정의된 영역이 우선 — 큰 영역 안에 작은 방)
	_area_grid = PackedInt32Array()
	_area_grid.resize(w * h)
	_area_grid.fill(-1)
	for i in area_defs.size():
		var r: Array = area_defs[i]["rect"]
		var ax := int(r[0])
		var ay := int(r[1])
		var aw := int(r[2])
		var ah := int(r[3])
		var x0 := maxi(0, ax)
		var x1 := mini(w, ax + aw)
		for y in range(maxi(0, ay), mini(h, ay + ah)):
			var row := y * w
			for x in range(x0, x1):
				_area_grid[row + x] = i


# ───────────────────────── 도우미 (웹 판 TileMap.ts의 내보낸 함수) ─────────────────────────

static func in_rect(r: Array, x: float, y: float) -> bool:
	return x >= r[0] and x < r[0] + r[2] and y >= r[1] and y < r[1] + r[3]


static func rect_center(r: Array) -> Vector2:
	return Vector2(r[0] + r[2] / 2.0, r[1] + r[3] / 2.0)


static func dist(a: Vector2, b: Vector2) -> float:
	return Vector2(a.x - b.x, a.y - b.y).length()


# ───────────────────────── 조회 ─────────────────────────

func in_bounds(tx: int, ty: int) -> bool:
	return tx >= 0 and ty >= 0 and tx < width and ty < height


func def(tx: int, ty: int) -> Dictionary:
	if not in_bounds(tx, ty):
		return defs[0]
	return defs[tiles[ty * width + tx]]


## 타일 정의 번호 (지도 밖은 0)
func tile_index(tx: int, ty: int) -> int:
	if not in_bounds(tx, ty):
		return 0
	return tiles[ty * width + tx]


func walkable(tx: int, ty: int) -> bool:
	return tx >= 0 and ty >= 0 and tx < width and ty < height and _walk[tiles[ty * width + tx]] == 1


func blocks_sight(tx: int, ty: int) -> bool:
	return not (tx >= 0 and ty >= 0 and tx < width and ty < height) or _sight[tiles[ty * width + tx]] == 1


## 위치가 속한 영역 (없으면 null)
func area_at(x: float, y: float) -> Variant:
	var tx := floori(x)
	var ty := floori(y)
	if not in_bounds(tx, ty):
		return null
	var i := _area_grid[ty * width + tx]
	return areas[i] if i >= 0 else null


## 영역 번호 (없으면 -1)
func area_index_at(x: float, y: float) -> int:
	var tx := floori(x)
	var ty := floori(y)
	if not in_bounds(tx, ty):
		return -1
	return _area_grid[ty * width + tx]


## id로 영역 찾기 (없으면 null)
func area(id: String) -> Variant:
	for a in areas:
		if a["id"] == id:
			return a
	return null


# ───────────────────────── 시야 ─────────────────────────

## 두 점 사이 시선이 통하는지 (격자 DDA). 시작·끝 타일 자체는 검사하지 않는다
func line_of_sight(a: Vector2, b: Vector2) -> bool:
	var ax := float(a.x)
	var ay := float(a.y)
	var dx := float(b.x) - ax
	var dy := float(b.y) - ay
	var tx := floori(ax)
	var ty := floori(ay)
	var end_x := floori(b.x)
	var end_y := floori(b.y)
	var step_x := 1 if dx > 0 else -1
	var step_y := 1 if dy > 0 else -1
	var t_delta_x := absf(1.0 / dx) if dx != 0 else INF
	var t_delta_y := absf(1.0 / dy) if dy != 0 else INF
	var t_max_x := ((tx + 1 - ax) if dx > 0 else (ax - tx)) * t_delta_x if dx != 0 else INF
	var t_max_y := ((ty + 1 - ay) if dy > 0 else (ay - ty)) * t_delta_y if dy != 0 else INF
	var guard := 0
	while not (tx == end_x and ty == end_y):
		if guard >= 4096:
			break
		guard += 1
		if t_max_x < t_max_y:
			t_max_x += t_delta_x
			tx += step_x
		else:
			t_max_y += t_delta_y
			ty += step_y
		if tx == end_x and ty == end_y:
			break
		if blocks_sight(tx, ty):
			return false
	return true


# ───────────────────────── 충돌 ─────────────────────────

## 원(반지름 r)이 막힌 타일과 겹치는지
func circle_blocked(x: float, y: float, r: float) -> bool:
	var x0 := floori(x - r)
	var x1 := floori(x + r)
	var y0 := floori(y - r)
	var y1 := floori(y + r)
	for ty in range(y0, y1 + 1):
		for tx in range(x0, x1 + 1):
			if walkable(tx, ty):
				continue
			var cx := maxf(tx, minf(x, tx + 1))
			var cy := maxf(ty, minf(y, ty + 1))
			if (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r:
				return true
	return false


## 축 분리 이동 (벽을 따라 미끄러진다). 새 위치를 돌려주고, 막혔는지는 last_move_blocked에 남긴다
## 쓰는 법: pos = map.move_circle(pos, dx, dy, r)
func move_circle(pos: Vector2, dx: float, dy: float, r: float) -> Vector2:
	var blocked := false
	var px := float(pos.x)
	var py := float(pos.y)
	var steps := maxi(1, ceili(maxf(absf(dx), absf(dy)) / (r * 0.5)))
	for i in steps:
		var sx := dx / steps
		var sy := dy / steps
		if sx != 0:
			if not circle_blocked(px + sx, py, r):
				px += sx
			else:
				blocked = true
		if sy != 0:
			if not circle_blocked(px, py + sy, r):
				py += sy
			else:
				blocked = true
	last_move_blocked = blocked
	return Vector2(px, py)


# ───────────────────────── 길찾기 ─────────────────────────

## A* 길찾기 (8방향, 모서리 끼어들기 금지). 타일 중심 좌표 경로(Array of Vector2)를 돌려준다. 없으면 null.
## 목적지가 막혀 있으면 가장 가까운 열린 타일까지.
func find_path(from: Vector2, to: Vector2, max_nodes: int = 20000) -> Variant:
	var w := width
	var sx := floori(from.x)
	var sy := floori(from.y)
	var gx := floori(to.x)
	var gy := floori(to.y)
	if not walkable(sx, sy):
		return null
	if not walkable(gx, gy):
		var near: Variant = nearest_walkable(gx, gy, 3)
		if near == null:
			return null
		gx = int(near.x)
		gy = int(near.y)
	var start := sy * w + sx
	var goal := gy * w + gx
	var g := {start: 0.0}
	var came := {}
	var open := _MinHeap.new()
	open.push(start, _heuristic(start, gx, gy))
	var closed := {}
	var expanded := 0
	while open.size() > 0:
		var cur: int = open.pop()
		if cur == goal:
			return _reconstruct(came, cur)
		if closed.has(cur):
			continue
		closed[cur] = true
		expanded += 1
		if expanded > max_nodes:
			return null
		var cx := cur % w
		var cy := (cur - cx) / w
		var gcur: float = g[cur]
		for oy in range(-1, 2):
			for ox in range(-1, 2):
				if ox == 0 and oy == 0:
					continue
				var nx := cx + ox
				var ny := cy + oy
				if not walkable(nx, ny):
					continue
				if ox != 0 and oy != 0 and (not walkable(cx + ox, cy) or not walkable(cx, cy + oy)):
					continue
				var ni := ny * w + nx
				if closed.has(ni):
					continue
				var cost := gcur + (1.414 if ox != 0 and oy != 0 else 1.0)
				if cost < g.get(ni, INF):
					g[ni] = cost
					came[ni] = cur
					open.push(ni, cost + _heuristic(ni, gx, gy))
	return null


func _heuristic(i: int, gx: int, gy: int) -> float:
	var x := i % width
	var y := (i - x) / width
	var ddx := absi(x - gx)
	var ddy := absi(y - gy)
	return maxi(ddx, ddy) + 0.414 * mini(ddx, ddy)


## (tx, ty)에서 가장 가까운 걸을 수 있는 칸 (Vector2, 정수 칸 좌표). 없으면 null
func nearest_walkable(tx: int, ty: int, radius: int) -> Variant:
	for r in radius + 1:
		for oy in range(-r, r + 1):
			for ox in range(-r, r + 1):
				if maxi(absi(ox), absi(oy)) != r:
					continue
				if walkable(tx + ox, ty + oy):
					return Vector2(tx + ox, ty + oy)
	return null


## 시작 타일에서 걸어서 닿을 수 있는 타일 집합 (검증·테스트용). 칸 번호(y * width + x)마다 1
func reachable_from(p: Vector2) -> PackedByteArray:
	var w := width
	var seen := PackedByteArray()
	seen.resize(w * height)
	seen.fill(0)
	var sx := floori(p.x)
	var sy := floori(p.y)
	if not walkable(sx, sy):
		return seen
	var stack := PackedInt32Array([sy * w + sx])
	seen[sy * w + sx] = 1
	var n := 1
	while n > 0:
		n -= 1
		var i := stack[n]
		stack.resize(n)
		var x := i % w
		var y := (i - x) / w
		# 오른쪽·왼쪽·아래·위 (웹 판과 같은 순서)
		for k in 4:
			var nx := x + (1 if k == 0 else (-1 if k == 1 else 0))
			var ny := y + (1 if k == 2 else (-1 if k == 3 else 0))
			if not walkable(nx, ny):
				continue
			var ni := ny * w + nx
			if seen[ni] == 1:
				continue
			seen[ni] = 1
			stack.append(ni)
			n += 1
	return seen


func _reconstruct(came: Dictionary, end: int) -> Array:
	var w := width
	var out: Array = []
	var cur: Variant = end
	while cur != null:
		var c: int = cur
		var x := c % w
		out.append(Vector2(x + 0.5, (c - x) / w + 0.5))
		cur = came.get(c, null)
	out.reverse()
	return _smooth(out)


## 시야가 통하고 몸이 지나갈 수 있는 중간 점은 건너뛴다
func _smooth(path: Array) -> Array:
	if path.size() <= 2:
		return path
	var out: Array = [path[0]]
	var anchor: Vector2 = path[0]
	for i in range(2, path.size()):
		if not _walk_line(anchor, path[i]):
			anchor = path[i - 1]
			out.append(anchor)
	out.append(path[path.size() - 1])
	return out


func _walk_line(a: Vector2, b: Vector2) -> bool:
	var d := dist(a, b)
	var n := ceili(d / 0.25)
	for i in range(1, n):
		var t := float(i) / n
		if circle_blocked(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 0.3):
			return false
	return true


## A*용 이진 힙
class _MinHeap:
	var _items := PackedInt32Array()
	var _prio := PackedFloat64Array()

	func size() -> int:
		return _items.size()

	func push(item: int, p: float) -> void:
		_items.append(item)
		_prio.append(p)
		var i := _items.size() - 1
		while i > 0:
			var parent := (i - 1) >> 1
			if _prio[parent] <= _prio[i]:
				break
			_swap(i, parent)
			i = parent

	func pop() -> int:
		var top := _items[0]
		var last := _items.size() - 1
		var last_item := _items[last]
		var last_prio := _prio[last]
		_items.resize(last)
		_prio.resize(last)
		if last > 0:
			_items[0] = last_item
			_prio[0] = last_prio
			var i := 0
			while true:
				var l := i * 2 + 1
				var r := l + 1
				var m := i
				if l < last and _prio[l] < _prio[m]:
					m = l
				if r < last and _prio[r] < _prio[m]:
					m = r
				if m == i:
					break
				_swap(i, m)
				i = m
		return top

	func _swap(a: int, b: int) -> void:
		var ti := _items[a]
		_items[a] = _items[b]
		_items[b] = ti
		var tp := _prio[a]
		_prio[a] = _prio[b]
		_prio[b] = tp
