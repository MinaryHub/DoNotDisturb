class_name CityGen
extends RefCounted

## 넓은 도시 자동 생성 (웹 판 src/world/CityGen.ts, data/world/districts.json). 씨앗이 같으면 늘 같은 도시가 나온다.
## 구역마다 양식(도심·번화가·시장·주택가·캠퍼스·강변)에 맞춰 길·블록·건물(안쪽 가구까지)·간판·가로등·군중 동선·동네 사람을 깐다.
## 손으로 만든 해오름동(city.json)과 랜드마크(landmarks.json)는 그대로 두고, 그 사이를 채운다.
## 결과는 city.json과 같은 모양의 조각(Dictionary)이라 나머지 코드는 손으로 만든 월드와 구별하지 않는다.
##
## 웹 판과 같은 도시가 나오도록 난수(mulberry32)·해시(FNV-1a)·호출 순서를 그대로 옮겼다.
## 숫자는 모두 float(JSON과 같다)로 계산한다 — GDScript의 정수 나눗셈이 끼어들지 않게.
## 사각형은 Array [x, y, w, h], 점은 Array [x, y] (JSON 모양 그대로).

const PART_ARRAYS := ["ops", "areas", "hides", "interactables", "crowdLanes", "props", "labels", "ambient"]
const PART_MAPS := ["spawns", "paths"]
const MASK32 := 0xFFFFFFFF

# ───────────────────────── 건물 종류 ─────────────────────────
## floor: 바닥 타일, enter: 들어갈 수 있는지 (집·기숙사는 문이 없다), stimulus: 영역 자극,
## sign: 간판 색 (없으면 간판 없음), names: 이름 후보 수 gen.<종류>.1 … N (data/text)
## 가구 놓기는 _furnish의 종류별 분기
const TYPES := {
	"office": {"floor": "floorOffice", "enter": true, "stimulus": "officeHum", "names": 8},
	"tower": {"floor": "floorTile", "enter": true, "stimulus": "officeHum", "names": 8},
	"cafe": {"floor": "floorWood", "enter": true, "stimulus": "cafeChatter", "sign": "#5b7d63", "names": 10},
	"restaurant": {"floor": "floorRestaurant", "enter": true, "stimulus": "restaurantNoise", "sign": "#a8432f", "names": 10},
	"bar": {"floor": "floorRestaurant", "enter": true, "stimulus": "restaurantNoise", "sign": "#6c3a5c", "names": 10},
	"convenience": {"floor": "floorStore", "enter": true, "stimulus": "storeMusic", "sign": "#3b6fb6", "names": 4},
	"pharmacy": {"floor": "floorBath", "enter": true, "sign": "#2e8b57", "names": 6},
	"bakery": {"floor": "floorWood", "enter": true, "sign": "#b07a3a", "names": 6},
	"clothing": {"floor": "floorStore", "enter": true, "stimulus": "storeMusic", "sign": "#2f2f35", "names": 8},
	"bookshop": {"floor": "floorWood", "enter": true, "sign": "#8a5a3c", "names": 6},
	"karaoke": {"floor": "floorCarpet", "enter": true, "stimulus": "buskingMusic", "sign": "#8a3fb5", "names": 6},
	"marketShop": {"floor": "floorStore", "enter": true, "stimulus": "marketChatter", "sign": "#c0392b", "names": 12},
	"laundromat": {"floor": "floorTile", "enter": true, "stimulus": "laundryHum", "sign": "#3b6fb6", "names": 4},
	"lecture": {"floor": "floorOffice", "enter": true, "names": 8},
	"studentHall": {"floor": "floorTile", "enter": true, "stimulus": "cafeChatter", "names": 4},
	"house": {"floor": "floorWood", "enter": false, "names": 6},
	"villa": {"floor": "floorWood", "enter": false, "names": 6},
	"dorm": {"floor": "floorWood", "enter": false, "names": 4},
}

## 양식마다 건물 종류의 비중 (순서가 난수 결과를 정하므로 웹 판과 같은 순서)
const MIX := {
	"downtown": {"office": 5, "tower": 3, "cafe": 2, "restaurant": 2, "convenience": 1, "clothing": 1, "pharmacy": 1, "bakery": 1, "bookshop": 1},
	"nightlife": {"bar": 4, "cafe": 3, "restaurant": 3, "karaoke": 2, "convenience": 1, "clothing": 1, "bookshop": 1},
	"market": {"marketShop": 5, "restaurant": 2, "house": 3, "pharmacy": 1, "bakery": 1, "convenience": 1},
	"residential": {"house": 6, "villa": 4, "convenience": 1, "cafe": 1, "laundromat": 1, "bakery": 1},
	"campus": {"lecture": 4, "dorm": 2, "studentHall": 1, "cafe": 1, "bookshop": 1},
}

const DEFAULTS := {
	"downtown": {"block": [40.0, 26.0], "street": 6.0, "streetTile": "sidewalk", "crowd": 6.0, "lamp": 12.0},
	"nightlife": {"block": [30.0, 22.0], "street": 6.0, "streetTile": "plaza", "crowd": 6.0, "lamp": 10.0},
	"market": {"block": [24.0, 16.0], "street": 4.0, "streetTile": "alley", "crowd": 4.0, "lamp": 14.0},
	"residential": {"block": [30.0, 22.0], "street": 5.0, "streetTile": "alley", "crowd": 1.0, "lamp": 16.0},
	"campus": {"block": [56.0, 40.0], "street": 6.0, "streetTile": "sidewalk", "crowd": 2.0, "lamp": 18.0},
	"riverside": {"block": [0.0, 0.0], "street": 0.0, "streetTile": "sidewalk", "crowd": 3.0, "lamp": 20.0},
}


static func empty_part() -> Dictionary:
	return {"ops": [], "areas": [], "hides": [], "interactables": [], "spawns": {}, "paths": {}, "crowdLanes": [], "props": [], "labels": [], "ambient": []}


## 조각들을 차례로 덧붙인다 (칠하기·영역은 뒤에 온 것이 앞을 덮는다). 웹 판 mergeWorld(base, ...parts)
static func merge_world(base: Dictionary, parts: Array) -> Dictionary:
	var out: Dictionary = base.duplicate()
	for k in PART_ARRAYS:
		out[k] = (base.get(k, []) as Array).duplicate()
	for k in PART_MAPS:
		out[k] = (base.get(k, {}) as Dictionary).duplicate()
	for p in parts:
		_append_part(out, p)
	return out


static func _append_part(out: Dictionary, p: Dictionary) -> void:
	for k in PART_ARRAYS:
		(out[k] as Array).append_array(p.get(k, []))
	for k in PART_MAPS:
		(out[k] as Dictionary).merge(p.get(k, {}), true)


## 모든 구역을 생성해 한 조각으로
static func generate_city(cfg: Dictionary) -> Dictionary:
	var out := empty_part()
	_append_part(out, cfg.get("macro", {}))
	var seed_val := int(cfg["seed"])
	for d in cfg["districts"]:
		var g := Gen.new(mulberry32(seed_val ^ hash_str(d["id"])))
		if d["style"] == "riverside":
			_riverside(d, g)
		else:
			_blocks(d, g)
		_ambient(d, g)
		_append_part(out, g.part)
	return out


# ───────────────────────── 난수 ─────────────────────────

## Math.imul: 32비트 곱의 아래 32비트 (부호 없는 값으로)
static func imul(a: int, b: int) -> int:
	a &= MASK32
	b &= MASK32
	var lo := (a & 0xFFFF) * b
	var hi := ((a >> 16) * b) & 0xFFFF
	return (lo + (hi << 16)) & MASK32


## 웹 판과 같은 mulberry32. 부르면 [0, 1) 실수를 돌려주는 Callable
static func mulberry32(seed_val: int) -> Callable:
	var state := [seed_val & MASK32]
	return func() -> float:
		state[0] = (state[0] + 0x6d2b79f5) & MASK32
		var t: int = state[0]
		t = imul(t ^ (t >> 15), t | 1)
		t ^= (t + imul(t ^ (t >> 7), t | 61)) & MASK32
		return float((t ^ (t >> 14)) & MASK32) / 4294967296.0


## FNV-1a (UTF-16 코드 단위 기준, 웹 판 hashStr과 같다)
static func hash_str(s: String) -> int:
	var h := 2166136261
	for i in s.length():
		h = ((h ^ s.unicode_at(i)) * 16777619) & MASK32
	return h


## JS Math.round (0.5는 위로)
static func js_round(x: float) -> float:
	var f := floorf(x)
	return f + 1.0 if x - f >= 0.5 else f


static func _overlaps(a: Array, b: Array) -> bool:
	return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


static func _any_overlap(rects: Array, r: Array) -> bool:
	for x in rects:
		if _overlaps(x, r):
			return true
	return false


# ───────────────────────── 생성기 ─────────────────────────

class Gen:
	var part := CityGen.empty_part()
	var _n := 0
	var _rand: Callable

	func _init(rand: Callable) -> void:
		_rand = rand

	func r() -> float:
		return _rand.call()

	func randint(a: float, b: float) -> float:
		return a + floorf(_rand.call() * (b - a + 1.0))

	func pick(items: Array) -> Variant:
		return items[int(floorf(_rand.call() * items.size()))]

	func weighted(mix: Dictionary) -> String:
		var total := 0.0
		for id in mix:
			total += mix[id]
		var k: float = _rand.call() * total
		for id in mix:
			k -= mix[id]
			if k <= 0:
				return id
		return mix.keys()[0]

	func op(o: Dictionary) -> void:
		part["ops"].append(o)

	func uid(prefix: String) -> String:
		_n += 1
		return "%s_%d" % [prefix, _n]

	func interact(i: Dictionary, b: Dictionary) -> void:
		var it := {"id": uid("%s_it" % b["id"])}
		it.merge(i)
		part["interactables"].append(it)


## 안쪽 사각형 (벽 제외)
static func _inner(r: Array) -> Array:
	return [r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2]


## 문에서 곧장 들어가는 통로(두 칸)를 비워 두고 가구를 줄지어 놓는다
static func _rows(b: Dictionary, g: Gen, tile: String, every: float, max_len: float = -1.0, skip_front: float = 2.0, skip_back: float = 1.0) -> void:
	var inn := _inner(b["rect"])
	var ix: float = inn[0]
	var iy: float = inn[1]
	var iw: float = inn[2]
	var ih: float = inn[3]
	var door_x: float = b["doorX"]
	var rows_y: Array = []
	var k := skip_front
	while k < ih - skip_back:
		rows_y.append(iy + k if b["face"] == -1 else iy + ih - 1 - k)
		k += every
	for y in rows_y:
		# 통로 양옆으로 나눠 놓는다
		var left := [ix + 1, y, door_x - ix - 2, 1.0]
		var right := [door_x + 3, y, ix + iw - door_x - 4, 1.0]
		for r in [left, right]:
			if r[2] >= 2:
				g.op({"op": "fill", "rect": [r[0], r[1], minf(r[2], max_len if max_len >= 0 else r[2]), 1.0], "tile": tile})


## 안쪽 맨 뒤 벽을 따라 놓는 카운터와 그 앞(통로 끝) 상호작용 지점
static func _back_counter(b: Dictionary, g: Gen, tile: String = "counter") -> Array:
	var inn := _inner(b["rect"])
	var y: float = inn[1] + inn[3] - 1 if b["face"] == -1 else inn[1]
	g.op({"op": "fill", "rect": [inn[0] + 1, y, inn[2] - 2, 1.0], "tile": tile})
	return [b["doorX"] + 1, y - 0.4 if b["face"] == -1 else y + 1.4]


static func _plants(b: Dictionary, g: Gen) -> void:
	var inn := _inner(b["rect"])
	g.op({"op": "tiles", "tile": "plant", "at": [[inn[0], inn[1]], [inn[0] + inn[2] - 1, inn[1] + inn[3] - 1]]})


## 건물 종류별 가구와 상호작용 (웹 판 TYPES[..].furnish)
static func _furnish(type: String, b: Dictionary, g: Gen) -> void:
	match type:
		"office":
			_rows(b, g, "desk", 3)
			_plants(b, g)
		"tower":
			var at := _back_counter(b, g, "appliance")
			_plants(b, g)
			g.interact({"kind": "flavor", "at": at, "labelKey": "interact.gen.tower", "monologue": "mono.gen.tower"}, b)
		"cafe":
			var at := _back_counter(b, g)
			_rows(b, g, "table", 3, 4)
			g.interact({"kind": "shop", "at": at, "labelKey": "interact.cafeOrder", "shop": "cafe"}, b)
		"restaurant":
			var at := _back_counter(b, g)
			_rows(b, g, "table", 3, 4)
			g.interact({"kind": "soloMeal", "at": at, "labelKey": "interact.gen.soloMeal", "price": 8000.0}, b)
		"bar":
			var at := _back_counter(b, g)
			_rows(b, g, "table", 3, 3)
			g.interact({"kind": "flavor", "at": at, "labelKey": "interact.menu", "monologue": "mono.gen.bar"}, b)
		"convenience":
			var at := _back_counter(b, g)
			_rows(b, g, "shelf", 3)
			g.interact({"kind": "shop", "at": at, "labelKey": "interact.convShop", "shop": "convStore"}, b)
		"pharmacy":
			var at := _back_counter(b, g)
			_rows(b, g, "shelf", 4)
			g.interact({"kind": "shop", "at": at, "labelKey": "interact.gen.pharmacy", "shop": "pharmacy"}, b)
		"bakery":
			var at := _back_counter(b, g)
			_rows(b, g, "shelf", 4, 6)
			g.interact({"kind": "shop", "at": at, "labelKey": "interact.bakery", "shop": "bakery"}, b)
		"clothing":
			var at := _back_counter(b, g)
			_rows(b, g, "rack", 3)
			g.interact({"kind": "flavor", "at": at, "labelKey": "interact.gen.clothing", "monologue": "mono.gen.clothing"}, b)
		"bookshop":
			var at := _back_counter(b, g, "bookshelf")
			_rows(b, g, "bookshelf", 3)
			g.interact({"kind": "browse", "at": at, "labelKey": "interact.gen.browse"}, b)
		"karaoke":
			_rows(b, g, "partition", 3, 5)
			var at := _back_counter(b, g)
			g.interact({"kind": "flavor", "at": at, "labelKey": "interact.gen.karaoke", "monologue": "mono.gen.karaoke"}, b)
		"marketShop":
			var at := _back_counter(b, g)
			_rows(b, g, "shelf", 3, 4)
			g.interact({"kind": "flavor", "at": at, "labelKey": "interact.gen.marketShop", "monologue": "mono.gen.marketShop"}, b)
		"laundromat":
			var at := _back_counter(b, g, "washer")
			_rows(b, g, "washer", 4, 5)
			g.interact({"kind": "flavor", "at": at, "labelKey": "interact.gen.laundromat", "monologue": "mono.gen.laundromat"}, b)
		"lecture":
			_rows(b, g, "desk", 2)
			var at := _back_counter(b, g, "counter")
			g.interact({"kind": "flavor", "at": at, "labelKey": "interact.gen.lecture", "monologue": "mono.gen.lecture"}, b)
		"studentHall":
			var at := _back_counter(b, g, "vending")
			_rows(b, g, "table", 3, 4)
			g.interact({"kind": "shop", "at": at, "labelKey": "interact.gen.vending", "shop": "vending"}, b)
		_:
			pass  # house·villa·dorm: 들어갈 수 없어 가구가 없다


static func _with_stimulus(area: Dictionary, d: Dictionary) -> Dictionary:
	if d.has("stimulus"):
		area["stimulus"] = d["stimulus"]
	return area


## 길 사이 블록에 건물을 채운다 (도심·번화가·시장·주택가·캠퍼스)
static func _blocks(d: Dictionary, g: Gen) -> void:
	var def: Dictionary = DEFAULTS[d["style"]]
	var blk: Array = d.get("block", def["block"])
	var bw: float = blk[0]
	var bh: float = blk[1]
	var sw: float = d.get("street", def["street"])
	var rect: Array = d["rect"]
	var x0: float = rect[0]
	var y0: float = rect[1]
	var w: float = rect[2]
	var h: float = rect[3]
	var reserve: Array = d.get("reserve", [])
	g.part["areas"].append(_with_stimulus({"id": d["id"], "rect": rect, "kind": "outdoor", "labelKey": d["nameKey"]}, d))
	g.op({"op": "fill", "rect": rect, "tile": def["streetTile"]})
	var campus: bool = d["style"] == "campus"
	var streets_y: Array = []
	var by := y0 + sw
	while by + minf(bh, 10) <= y0 + h:
		streets_y.append(by - sw / 2.0)
		var bx := x0 + sw
		while bx + minf(bw, 10) <= x0 + w:
			var block := [bx, by, minf(bw, x0 + w - bx - 1), minf(bh, y0 + h - by - 1)]
			if not (block[2] < 10 or block[3] < 9) and not _any_overlap(reserve, block):
				if campus:
					_campus_block(d, g, block)
				else:
					_city_block(d, g, block)
			bx += bw + sw
		by += bh + sw
	streets_y.append(y0 + h - sw / 2.0)
	# 가로등·군중: 가로 길마다
	var crowd: float = def["crowd"]
	var lamp: float = def["lamp"]
	for i in streets_y.size():
		var sy: float = streets_y[i]
		if sy < y0 or sy > y0 + h:
			continue
		var x := x0 + 4
		while x < x0 + w - 2:
			g.part["props"].append({"kind": "lamp", "at": [x, js_round(sy * 10) / 10]})
			x += lamp
		if crowd > 0 and i % 2 == 0:
			var dir := i % 4 == 0
			g.part["crowdLanes"].append({
				"id": g.uid("%s_lane" % d["id"]),
				"from": [x0 + 1 if dir else x0 + w - 1, sy],
				"to": [x0 + w - 1 if dir else x0 + 1, sy],
				"width": maxf(1, sw / 3.0),
				# crowd = 길 60칸마다 몇 명 (도심·번화가는 붐빈다)
				"count": maxf(1, js_round((crowd * w) / 60.0)),
				"speed": 1.2 + g.r() * 0.3,
				"zone": d["id"],
			})


## 도시 블록: 한두 줄로 필지를 나눠 건물을 세운다 (블록 가장자리 한 칸은 길)
static func _city_block(d: Dictionary, g: Gen, block: Array) -> void:
	var bx: float = block[0]
	var by: float = block[1]
	var bw: float = block[2]
	var bh: float = block[3]
	var mix: Dictionary = MIX[d["style"]]
	var rows_def: Array
	if bh >= 18:
		var top_h := floorf((bh - 3) / 2.0)
		rows_def = [
			{"y": by + 1, "h": top_h, "face": -1},
			{"y": by + 2 + top_h, "h": bh - 3 - top_h, "face": 1},
		]
	else:
		rows_def = [{"y": by + 1, "h": bh - 2, "face": -1 if g.r() < 0.5 else 1}]
	for row in rows_def:
		var x := bx + 1
		var end := bx + bw - 1
		while end - x >= 8:
			var left := end - x
			var lw := left if left < 20 else minf(left - 9, g.randint(9, 16))
			var type := g.weighted(mix)
			_building(d, g, type, [x, row["y"], lw, row["h"]], row["face"])
			x += lw + 1
	# 블록 모서리 나무 (문 앞은 피한다)
	g.op({"op": "tiles", "tile": "tree", "at": [[bx, by], [bx + bw - 1, by + bh - 1]]})


## 캠퍼스 블록: 잔디 가운데 큰 건물 하나, 문에서 길까지 보도, 둘레에 나무·벤치
static func _campus_block(d: Dictionary, g: Gen, block: Array) -> void:
	var bx: float = block[0]
	var by: float = block[1]
	var bw: float = block[2]
	var bh: float = block[3]
	g.op({"op": "fill", "rect": block, "tile": "grass"})
	var w := floorf(bw * (0.45 + g.r() * 0.2))
	var h := floorf(bh * (0.4 + g.r() * 0.15))
	var rx := bx + floorf((bw - w) / 2.0)
	var ry := by + floorf((bh - h) / 2.0)
	var face := -1 if g.r() < 0.5 else 1
	var type := g.weighted(MIX["campus"])
	var b: Variant = _building(d, g, type, [rx, ry, w, h], face)
	# 문에서 길까지 보도
	if b != null and TYPES[type]["enter"]:
		var py := by if face == -1 else ry + h
		var ph := ry - by if face == -1 else by + bh - (ry + h)
		g.op({"op": "fill", "rect": [b["doorX"], py, 2.0, ph], "tile": "sidewalk"})
	var trees: Array = []
	for k in 8:
		var tx := g.randint(bx + 1, bx + bw - 2)
		var ty := g.randint(by + 1, by + bh - 2)
		if tx >= rx - 1 and tx <= rx + w and ty >= ry - 2 and ty <= ry + h + 1:
			continue
		if b != null and absf(tx - b["doorX"]) < 3:
			continue
		trees.append([tx, ty])
	if trees.size() > 0:
		g.op({"op": "tiles", "tile": "tree", "at": trees})
	var bench_y := by + 2
	var bench_x := bx + 3
	if not (b != null and absf(bench_x - b["doorX"]) < 4):
		g.op({"op": "fill", "rect": [bench_x, bench_y, 3.0, 1.0], "tile": "bench"})
		g.part["interactables"].append({"id": g.uid("%s_bench" % d["id"]), "kind": "bench", "at": [bench_x + 1.5, bench_y + 1.6], "labelKey": "interact.bench"})


## 건물 하나: 벽·바닥·문·창, 안쪽 가구와 상호작용, 영역, 간판. 너무 작으면 null
static func _building(d: Dictionary, g: Gen, type: String, rect: Array, face: int) -> Variant:
	var t: Dictionary = TYPES[type]
	var x: float = rect[0]
	var y: float = rect[1]
	var w: float = rect[2]
	var h: float = rect[3]
	if w < 8 or h < 7:
		return null
	var id := g.uid("%s_b" % d["id"])
	g.op({"op": "room", "rect": rect, "floor": t["floor"], "wall": "wall"})
	var wall_y := y if face == -1 else y + h - 1
	var door_x := x + floorf(w / 2.0) - 1
	# 창 (문 양옆으로 띄엄띄엄)
	var wx := x + 2
	while wx < x + w - 2:
		if wx + 1 < door_x or wx > door_x + 2:
			g.op({"op": "fill", "rect": [wx, wall_y, 2.0, 1.0], "tile": "window"})
		wx += 3
	var b := {"id": id, "type": type, "rect": rect, "face": face, "doorX": door_x}
	var name_key := "gen.%s.%d" % [type, int(g.randint(1, t["names"]))]
	var area := {"id": id, "rect": rect, "kind": "indoor", "labelKey": name_key}
	if t.has("stimulus"):
		area["stimulus"] = {"id": t["stimulus"], "intensity": 1.0}
	g.part["areas"].append(area)
	if t["enter"]:
		g.op({"op": "fill", "rect": [door_x, wall_y, 2.0, 1.0], "tile": "door"})
		_furnish(type, b, g)
		if t.has("sign"):
			g.part["labels"].append({"at": [door_x + 1, y - 0.6 if face == -1 else y + h + 0.6], "textKey": name_key, "color": t["sign"]})
	return b


## 강변: 잔디·자전거길·나무 줄·벤치·수풀 (강물과 다리는 랜드마크)
static func _riverside(d: Dictionary, g: Gen) -> void:
	var rect: Array = d["rect"]
	var x0: float = rect[0]
	var y0: float = rect[1]
	var w: float = rect[2]
	var h: float = rect[3]
	g.part["areas"].append(_with_stimulus({"id": d["id"], "rect": rect, "kind": "outdoor", "labelKey": d["nameKey"]}, d))
	g.op({"op": "fill", "rect": rect, "tile": "grass"})
	var path_y := y0 + floorf(h / 2.0) - 1
	g.op({"op": "fill", "rect": [x0, path_y, w, 3.0], "tile": "sidewalk"})
	var trees: Array = []
	var x := x0 + 3
	while x < x0 + w - 2:
		trees.append([x, path_y - 3])
		trees.append([x + 3, path_y + 5])
		x += 7
	g.op({"op": "tiles", "tile": "tree", "at": trees})
	x = x0 + 12
	while x < x0 + w - 6:
		g.op({"op": "fill", "rect": [x, path_y - 1, 3.0, 1.0], "tile": "bench"})
		g.part["interactables"].append({"id": g.uid("%s_bench" % d["id"]), "kind": "bench", "at": [x + 1.5, path_y + 0.6], "labelKey": "interact.streamBench"})
		g.part["props"].append({"kind": "lamp", "at": [x + 6, path_y - 0.6]})
		x += 34
	x = x0 + 20
	while x < x0 + w - 6:
		var r := [x, y0 + 2, 4.0, 2.0]
		g.op({"op": "fill", "rect": r, "tile": "bush"})
		g.part["hides"].append({"id": g.uid("%s_reed" % d["id"]), "rect": r})
		x += 46
	var cy := path_y + 1
	g.part["crowdLanes"].append({"id": g.uid("%s_jog" % d["id"]), "from": [x0 + 1, cy - 0.6], "to": [x0 + w - 1, cy - 0.6], "width": 1.0, "count": maxf(2, js_round(w / 90.0)), "speed": 2.1, "zone": d["id"]})
	g.part["crowdLanes"].append({"id": g.uid("%s_walk" % d["id"]), "from": [x0 + w - 1, cy + 0.7], "to": [x0 + 1, cy + 0.7], "width": 1.0, "count": maxf(2, js_round(w / 70.0)), "speed": 0.9, "zone": d["id"]})


## 동네 사람: 가로 길을 따라 오가는 순찰 경로를 만들어 준다
static func _ambient(d: Dictionary, g: Gen) -> void:
	var def: Dictionary = DEFAULTS[d["style"]]
	var rect: Array = d["rect"]
	var x0: float = rect[0]
	var y0: float = rect[1]
	var w: float = rect[2]
	var h: float = rect[3]
	var sw: float = d.get("street", def["street"])
	var bh: float = (d.get("block", def["block"]) as Array)[1]
	var reserve: Array = d.get("reserve", [])
	var ys: Array = []
	if d["style"] == "riverside":
		ys.append(y0 + floorf(h / 2.0) + 0.5)
	else:
		var by := y0 + sw
		while by <= y0 + h:
			ys.append(by - sw / 2.0)
			by += bh + sw
	if ys.is_empty():
		return
	for a in d.get("ambient", []):
		for i in int(a["count"]):
			# 랜드마크 자리(reserve)를 지나지 않는 길 구간을 고른다
			var y := 0.0
			var seg_len := 0.0
			var xa := 0.0
			for tries in 20:
				y = g.pick(ys)
				seg_len = g.randint(20, 60)
				xa = g.randint(x0 + 2, maxf(x0 + 2, x0 + w - seg_len - 2))
				var seg := [xa - 1, floorf(y) - 1, seg_len + 2, 3.0]
				if not _any_overlap(reserve, seg):
					break
			var id := g.uid("%s_%s" % [d["id"], a["profile"]])
			g.part["spawns"][id] = [xa, y]
			g.part["paths"][id] = {"points": [[xa, y], [xa + seg_len, y]], "loop": true}
			var amb := {"id": id, "profile": a["profile"], "at": id, "path": id}
			for k in ["from", "to", "chance"]:
				if a.has(k):
					amb[k] = a[k]
			g.part["ambient"].append(amb)
