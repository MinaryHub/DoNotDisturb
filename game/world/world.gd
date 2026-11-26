class_name World
extends RefCounted

## data/world/city.json(+ 자동 생성 + 랜드마크) → 실행용 월드 (웹 판 src/world/World.ts).
## 연산(fill/room/tiles)을 순서대로 타일에 칠하고, 영역·은신·세이프·상호작용·포털·스폰·경로·군중 동선을 그대로 넘긴다.
## Godot 4에는 World 클래스가 없다(World2D·World3D뿐)라 이름을 그대로 쓴다.
##
## 표현: spawns는 { id: Vector2 }, paths는 { id: { "points": Array[Vector2], "loop": bool } }.
## interactables·portals·safes·hides·def는 JSON 그대로의 Dictionary/Array (at·rect는 Array).
## 웹 판의 자유 함수 layerOf(world, p)·safeAt·inHide는 인스턴스 메서드 layer_of(p)·safe_at(p)·in_hide(p)다.

var map: CityGrid
var def: Dictionary
var interactables: Array
var portals: Array
var safes: Array
var hides: Array
var spawns: Dictionary
var paths: Dictionary

## 같은 설정이면 한 번만 칠한다 (넓은 도시는 칠하는 데 시간이 든다. 월드는 읽기만 한다)
## 웹 판은 WeakMap(설정 객체 → 월드). Dictionary는 약한 참조를 못 하니 같은 객체(is_same)인지로 찾고, 최근 몇 개만 둔다
const CACHE_MAX := 4
static var _cache: Array = []


static func build_world(world_def: Dictionary, tiles: Array) -> World:
	for e in _cache:
		if is_same(e[0], world_def) and is_same(e[1], tiles):
			return e[2]
	var world := _paint(world_def, tiles)
	_cache.push_front([world_def, tiles, world])
	if _cache.size() > CACHE_MAX:
		_cache.resize(CACHE_MAX)
	return world


static func _v(p: Array) -> Vector2:
	return Vector2(p[0], p[1])


static func _paint(world_def: Dictionary, tiles: Array) -> World:
	var size: Array = world_def["size"]
	var w := int(size[0])
	var h := int(size[1])
	var index := {}
	for i in tiles.size():
		index[tiles[i]["id"]] = i
	var id_of := func(name: String) -> int:
		assert(index.has(name), "월드: 알 수 없는 타일 \"%s\" (data/world/tiles.json)" % name)
		return index[name]
	var grid := PackedInt32Array()
	grid.resize(w * h)
	grid.fill(id_of.call(world_def["base"]))
	for op in world_def["ops"]:
		match op["op"]:
			"fill":
				_fill(grid, w, h, op["rect"], id_of.call(op["tile"]))
			"room":
				var r: Array = op["rect"]
				_fill(grid, w, h, r, id_of.call(op["wall"]))
				if r[2] > 2 and r[3] > 2:
					_fill(grid, w, h, [r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2], id_of.call(op["floor"]))
			"tiles":
				var t: int = id_of.call(op["tile"])
				for p in op["at"]:
					var x := int(p[0])
					var y := int(p[1])
					if x >= 0 and y >= 0 and x < w and y < h:
						grid[y * w + x] = t
	var world := World.new()
	world.map = CityGrid.new(w, h, tiles, grid, world_def["areas"])
	world.def = world_def
	world.interactables = world_def["interactables"]
	world.portals = world_def["portals"]
	world.safes = world_def["safes"]
	world.hides = world_def["hides"]
	var sp := {}
	for k in world_def["spawns"]:
		sp[k] = _v(world_def["spawns"][k])
	world.spawns = sp
	var ps := {}
	for k in world_def["paths"]:
		var p: Dictionary = world_def["paths"][k]
		var pts: Array = []
		for q in p["points"]:
			pts.append(_v(q))
		ps[k] = {"points": pts, "loop": p["loop"]}
	world.paths = ps
	return world


## 사각형 칠하기 (좌표는 정수 칸. 지도 밖은 잘라낸다)
static func _fill(grid: PackedInt32Array, w: int, h: int, r: Array, tile: int) -> void:
	var x0 := maxi(0, int(r[0]))
	var x1 := mini(w, int(r[0] + r[2]))
	for y in range(maxi(0, int(r[1])), mini(h, int(r[1] + r[3]))):
		var row := y * w
		for x in range(x0, x1):
			grid[row + x] = tile


## 위치가 속한 층 id (지상·지하·3층)
func layer_of(p: Vector2) -> String:
	for l in def["layers"]:
		if CityGrid.in_rect(l["rect"], p.x, p.y):
			return l["id"]
	return def["layers"][0]["id"]


## 위치가 들어 있는 세이프(화장실 칸·피팅룸). 없으면 null
func safe_at(p: Vector2) -> Variant:
	for s in safes:
		if CityGrid.in_rect(s["rect"], p.x, p.y):
			return s
	return null


func in_hide(p: Vector2) -> bool:
	for hd in hides:
		if CityGrid.in_rect(hd["rect"], p.x, p.y):
			return true
	return false
