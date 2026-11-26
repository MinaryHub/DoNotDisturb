class_name Roofs
extends RefCounted

## 지붕: 붙어 있는 실내 영역을 한 건물로 묶는다. 바깥에서는 건물 안이 보이지 않고,
## 플레이어가 들어간 건물(문간 포함)만 지붕이 걷힌다 (웹 판 draw/ambient.ts Roofs의 논리 부분).
## building = { rects: Array[rect], outer: Array[rect] (벽까지 1칸 넓힘), color: Color, alpha: float }
## rect = [x, y, w, h]

const ROOF_COLORS := ["#8f7465", "#6f7f8c", "#7b866c", "#958570", "#7a7488", "#8c6e68"]

var buildings: Array = []
var _fade_sec: float


func _init(areas: Array, layer_rect: Array, fade_sec: float) -> void:
	_fade_sec = fade_sec
	var rooms: Array = []
	for a in areas:
		if a["kind"] != "outdoor" and in_rect(layer_rect, a["rect"][0], a["rect"][1]):
			rooms.append(a["rect"])
	var parent: Array = []
	for i in rooms.size():
		parent.append(i)
	var find := func(i: int, f: Callable) -> int:
		if parent[i] == i:
			return i
		parent[i] = f.call(parent[i], f)
		return parent[i]
	for i in rooms.size():
		for j in range(i + 1, rooms.size()):
			if touches(grow(rooms[i], 1), grow(rooms[j], 1)):
				parent[find.call(i, find)] = find.call(j, find)
	var groups := {}
	for i in rooms.size():
		var root: int = find.call(i, find)
		if not groups.has(root):
			groups[root] = []
		groups[root].append(rooms[i])
	for rects in groups.values():
		var keys := []
		for r in rects:
			keys.append("%s,%s,%s,%s" % [r[0], r[1], r[2], r[3]])
		var h := hash_of("|".join(keys))
		var outer := []
		for r in rects:
			outer.append(grow(r, 1))
		buildings.append({"rects": rects, "outer": outer, "color": Color(ROOF_COLORS[h % ROOF_COLORS.size()]), "alpha": 1.0})


## 플레이어가 서 있는 건물(문간 포함)은 지붕을 걷는다
func update(dt: float, player: Vector2) -> void:
	var k := minf(1.0, dt / maxf(0.01, _fade_sec))
	for b in buildings:
		var inside := false
		for r in b["outer"]:
			if in_rect(r, player.x, player.y):
				inside = true
				break
		b["alpha"] += ((0.0 if inside else 1.0) - b["alpha"]) * k


## 이 지점이 지금 지붕에 가려져 있는지
func covers(p: Vector2) -> bool:
	for b in buildings:
		if b["alpha"] > 0.5:
			for r in b["outer"]:
				if in_rect(r, p.x, p.y):
					return true
	return false


static func in_rect(r: Array, x: float, y: float) -> bool:
	return x >= r[0] and y >= r[1] and x < r[0] + r[2] and y < r[1] + r[3]


static func grow(r: Array, by: float) -> Array:
	return [r[0] - by, r[1] - by, r[2] + by * 2, r[3] + by * 2]


static func touches(a: Array, b: Array) -> bool:
	return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


## FNV-1a 32비트 (웹 판 hashOf와 같은 값: 같은 건물이 같은 색)
static func hash_of(seed: String) -> int:
	var h := 2166136261
	for i in seed.length():
		h = h ^ seed.unicode_at(i)
		h = (h * 16777619) & 0xFFFFFFFF
	return h
