extends TestCase

## 월드 시험 (웹 판 tests/world.test.ts에서 옮김) + 웹 판과 같은 월드가 나오는지 지문 비교
## 지문은 npx tsx tools/world-fingerprint.ts가 game/tests/fixtures/world_fingerprint.json에 쓴다

const FINGERPRINT := "res://game/tests/fixtures/world_fingerprint.json"
const MASK32 := 0xFFFFFFFF

var cfg := DataLoader.load_config("ko")
var world := World.build_world(cfg["world"], cfg["tiles"])
var map: CityGrid = world.map


func _walk(x: float, y: float) -> bool:
	return map.walkable(floori(x), floori(y))


func _at(set: PackedByteArray, x: float, y: float) -> bool:
	return set[floori(y) * map.width + floori(x)] == 1


func _interactable(id: String) -> Dictionary:
	for it in world.interactables:
		if it["id"] == id:
			return it
	return {}


# ── 월드 타일맵

func test_spawns_walkable() -> bool:
	for id in world.spawns:
		var p: Vector2 = world.spawns[id]
		ok(_walk(p.x, p.y), "spawn %s" % id)
	return true


func test_interactables_portals_elevator_walkable() -> bool:
	for it in world.interactables:
		ok(_walk(it["at"][0], it["at"][1]), "interactable %s" % it["id"])
	for p in world.portals:
		ok(_walk(p["at"][0], p["at"][1]), "portal %s" % p["id"])
		ok(_walk(p["arrive"][0], p["arrive"][1]), "portal %s arrive" % p["id"])
	var fronts: Dictionary = cfg["world"]["elevator"]["fronts"]
	for id in fronts:
		ok(_walk(fronts[id][0], fronts[id][1]), id)
	return true


## 집 → 1층 → 거리 → 회사·마트·고깃집·옷 매장까지 걸어서 이어진다 (계단 포털 경유)
func test_home_to_town_reachable() -> bool:
	# 3층(섬)은 계단 포털로 1층과 연결되므로, 1층 도착 지점에서 지상 전체 도달성을 본다
	var home := map.reachable_from(world.spawns["player"])
	var ground := map.reachable_from(Vector2(17.5, 33.5))
	ok(_at(home, 184, 470.5), "집 → 3층 계단")
	ok(_at(home, 177, 469.6), "집 → 3층 엘리베이터 앞")
	for id in ["officeDesk", "meetingSeat", "item_tofu", "item_egg", "item_onion", "item_ramen", "checkoutNormal", "checkoutSelf", "seatCorner", "returnCounter", "clothesPick", "soloSeat", "convShop", "parkBench"]:
		var it := _interactable(id)
		ok(not it.is_empty() and _at(ground, it["at"][0], it["at"][1]), id)
	for s in world.safes:
		ok(_at(ground, s["rect"][0] + 0.5, s["rect"][1] + 0.5), s["id"])
	ok(_at(ground, 31.5, 61), "지하철 서쪽 입구")
	ok(_at(ground, 177.5, 61), "지하철 동쪽 입구")
	var subway := map.reachable_from(Vector2(6, 470))
	ok(_at(subway, 118, 470), "환승 통로 관통")
	return true


## 벽은 시선을 막고 유리창은 막지 않는다
func test_walls_block_sight_windows_dont() -> bool:
	# 관리사무소: 유리창 너머로 로비가 보인다
	ok(map.line_of_sight(Vector2(30, 37.5), Vector2(30, 44)), "유리창 너머")
	# 사무실 벽 너머 로비는 보이지 않는다
	ok(not map.line_of_sight(Vector2(140, 40), Vector2(140, 50)), "벽 너머")
	return true


## A* 경로는 벽을 통과하지 않는다
func test_astar_avoids_walls() -> bool:
	var path: Variant = map.find_path(Vector2(30, 45), Vector2(33, 34))
	ok(path != null, "경로 있음")
	if path == null:
		return true
	var pts: Array = path
	for i in range(1, pts.size()):
		var a: Vector2 = pts[i - 1]
		var b: Vector2 = pts[i]
		var n := ceili(CityGrid.dist(a, b) / 0.2)
		for k in n + 1:
			var x := a.x + ((b.x - a.x) * k) / n
			var y := a.y + ((b.y - a.y) * k) / n
			ok(map.walkable(floori(x), floori(y)), "경로 칸 (%s, %s)" % [x, y])
	return true


## 충돌 이동은 벽을 넘지 않는다
func test_move_circle_stops_at_wall() -> bool:
	var p := Vector2(130.6, 466.5)
	for i in 200:
		p = map.move_circle(p, 0, -0.1, 0.32)
	gt(p.y, 463)
	ok(map.last_move_blocked, "막힘")
	return true


# ── 넓은 도시 (자동 생성 + 랜드마크)

## 씨앗이 같으면 같은 도시가 나온다
func test_same_seed_same_city() -> bool:
	var parts: Dictionary = cfg["worldParts"]
	var a := CityGen.merge_world(parts["city"], [CityGen.generate_city(parts["districts"]), parts["landmarks"]])
	var b := CityGen.merge_world(parts["city"], [CityGen.generate_city(parts["districts"]), parts["landmarks"]])
	eq(a["areas"].size(), b["areas"].size())
	var at_a: Array = a["interactables"].map(func(i): return i["at"])
	var at_b: Array = b["interactables"].map(func(i): return i["at"])
	eq(JSON.stringify(at_a), JSON.stringify(at_b))
	return true


## 해오름동에서 도심·시장·대학·강변·남쪽 둔치까지 걸어서 이어진다 (다리 경유)
func test_districts_reachable() -> bool:
	var ground := map.reachable_from(Vector2(17.5, 33.5))
	for id in ["metroCentral", "stationConv", "deptCafe", "mkGukbap", "univRead1", "riverKioskShop", "metroUniv", "metroRiver", "metroMarket", "busD_east", "busC_west"]:
		var it := _interactable(id)
		ok(not it.is_empty() and _at(ground, it["at"][0], it["at"][1]), id)
	ok(_at(ground, 352, 440), "중앙로 다리 건너 남쪽 둔치")
	ok(_at(ground, 900, 440), "보행 다리 건너 남쪽 둔치")
	return true


## 생성된 건물의 상호작용은 모두 걸어서 닿는다
func test_generated_interactables_reachable() -> bool:
	var ground := map.reachable_from(Vector2(17.5, 33.5))
	var re := RegEx.create_from_string("_(b|bench|it)_?\\d+")
	var gen: Array = world.interactables.filter(func(i): return re.search(i["id"]) != null)
	gt(gen.size(), 200)
	var unreachable: Array = []
	for i in gen:
		if not _at(ground, i["at"][0], i["at"][1]):
			unreachable.append(i["id"])
	eq(unreachable, [])
	return true


# ── 웹 판과 같은 월드인지 (tools/world-fingerprint.ts와 같은 규칙)

## 숫자는 round(v * 1000), 객체는 키를 정렬
func _canon(v: Variant) -> String:
	match typeof(v):
		TYPE_NIL:
			return "null"
		TYPE_INT, TYPE_FLOAT:
			return str(int(CityGen.js_round(float(v) * 1000.0)))
		TYPE_STRING, TYPE_STRING_NAME:
			return String(v)
		TYPE_BOOL:
			return "true" if v else "false"
		TYPE_VECTOR2:
			return _canon([v.x, v.y])
		TYPE_ARRAY:
			var parts := PackedStringArray()
			for x in v:
				parts.append(_canon(x))
			return "[" + ",".join(parts) + "]"
		TYPE_DICTIONARY:
			var keys: Array = (v as Dictionary).keys()
			keys.sort()
			var parts := PackedStringArray()
			for k in keys:
				parts.append("%s:%s" % [k, _canon(v[k])])
			return "{" + ",".join(parts) + "}"
	assert(false, "canon: 다룰 수 없는 값 %s" % str(v))
	return ""


func _fnv_bytes(bytes: PackedByteArray) -> int:
	var h := 2166136261
	for b in bytes:
		h = ((h ^ b) * 16777619) & MASK32
	return h


func _hash_of(v: Variant) -> int:
	return _fnv_bytes(_canon(v).to_utf8_buffer())


## 정수 배열 해시 (값마다 4바이트 리틀 엔디언)
func _fnv_ints(values: PackedInt32Array) -> int:
	var h := 2166136261
	for x in values:
		var v := x & MASK32
		h = ((h ^ (v & 0xff)) * 16777619) & MASK32
		h = ((h ^ ((v >> 8) & 0xff)) * 16777619) & MASK32
		h = ((h ^ ((v >> 16) & 0xff)) * 16777619) & MASK32
		h = ((h ^ ((v >> 24) & 0xff)) * 16777619) & MASK32
	return h


func test_fingerprint_matches_typescript() -> bool:
	var fp: Dictionary = DataLoader.read_json(FINGERPRINT)
	var w := map.width
	var h := map.height
	eq(w, fp["width"], "width")
	eq(h, fp["height"], "height")
	# 타일 종류별 칸 수
	var counts := {}
	for d in cfg["tiles"]:
		counts[d["id"]] = 0
	var tiles: Array = cfg["tiles"]
	for t in map.tiles:
		counts[tiles[t]["id"]] += 1
	for id in fp["tileCounts"]:
		eq(counts.get(id, -1), fp["tileCounts"][id], "tile %s" % id)
	# 데이터 개수
	var def: Dictionary = world.def
	for k in fp["counts"]:
		var v: Variant = def.get(k, [])
		eq(v.size(), fp["counts"][k], "count %s" % k)
	# 격자 해시
	eq(_fnv_ints(map.tiles), fp["gridHash"], "gridHash")
	for y in fp["rowHashes"]:
		var row := int(y)
		eq(_fnv_ints(map.tiles.slice(row * w, (row + 1) * w)), fp["rowHashes"][y], "row %d" % row)
	var area_idx := PackedInt32Array()
	area_idx.resize(w * h)
	for y in h:
		for x in w:
			area_idx[y * w + x] = map.area_index_at(x + 0.5, y + 0.5)
	eq(_fnv_ints(area_idx), fp["areaGridHash"], "areaGridHash")
	# 데이터 내용 해시 (생성된 건물·상호작용·동선까지)
	for k in fp["hashes"]:
		eq(_hash_of(def.get(k, [])), fp["hashes"][k], "hash %s" % k)
	# 도달·길찾기·시선
	var reach := 0
	for b in map.reachable_from(Vector2(17.5, 33.5)):
		reach += b
	eq(reach, fp["reachableFromHome"], "reachableFromHome")
	var cases := [[30, 45, 33, 34], [17.5, 33.5, 120.5, 60.5], [200.5, 100.5, 260.5, 140.5], [130.5, 466.5, 180.5, 470.5]]
	var results: Array = []
	var lengths: Array = []
	for c in cases:
		var p: Variant = map.find_path(Vector2(c[0], c[1]), Vector2(c[2], c[3]))
		results.append(p)
		lengths.append(p.size() if p != null else -1)
	eq(lengths, (fp["pathLengths"] as Array).map(func(x): return int(x)), "pathLengths")
	eq(_hash_of(results), fp["pathHash"], "pathHash")
	var los: Array = []
	for k in 400:
		var ax := 10 + ((k * 53) % 1080) + 0.25
		var ay := 5 + ((k * 37) % 440) + 0.75
		var bx := ax + ((k * 7) % 23) - 11.5
		var by := ay + ((k * 11) % 19) - 9.25
		los.append(1 if map.line_of_sight(Vector2(ax, ay), Vector2(bx, by)) else 0)
	eq(_hash_of(los), fp["losHash"], "losHash")
	eq(los.reduce(func(a, b): return a + b, 0), fp["losOpen"], "losOpen")
	return true
