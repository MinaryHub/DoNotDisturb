extends TestCase

## npc 계층 시험: 지각·상태 머신·군중 (웹 판에는 따로 된 시험이 없어 GameSession 없이 돌아가는 동작을 직접 확인한다).
## 작은 격자: 24×14, 바깥 벽 + x=10 세로 벽(y < 9, 아래쪽에 틈). 오른쪽 방은 'shop' 영역.
## 기대값은 웹 판(TS)을 같은 장면·같은 난수로 돌린 결과에 맞췄다 (차이는 Vector2 32비트 오차 정도).

var cfg := DataLoader.load_config("ko")
var P: Dictionary = cfg["npcProfiles"]
var map := _make_map()
const DT := 1.0 / 60.0


static func _make_map() -> CityGrid:
	var w := 24
	var h := 14
	var defs := [{"id": "floor", "color": "#fff", "walk": true, "sight": false}, {"id": "wall", "color": "#000", "walk": false, "sight": true}]
	var tiles := PackedInt32Array()
	tiles.resize(w * h)
	for y in h:
		for x in w:
			if x == 0 or y == 0 or x == w - 1 or y == h - 1 or (x == 10 and y < 9):
				tiles[y * w + x] = 1
	return CityGrid.new(w, h, defs, tiles, [{"id": "shop", "rect": [11, 1, 12, 12], "kind": "indoor", "labelKey": "x"}])


func lcg(seed: int) -> Callable:
	var s := [seed & 0xFFFFFFFF]
	return func() -> float:
		s[0] = (s[0] * 1664525 + 1013904223) & 0xFFFFFFFF
		return float(s[0]) / 4294967296.0


func player(extra: Dictionary) -> Dictionary:
	var d := {"pos": Vector2.ZERO, "facing": 0.0, "moving": false, "noise": 1.0, "phonePretend": false, "eyesClosed": false, "hidden": false, "unreachable": false}
	d.merge(extra, true)
	return d


func ctx(pl: Dictionary, rng: Callable, area: Variant = null, blocked := false) -> Dictionary:
	return {"map": map, "player": pl, "playerAreaId": area, "talkBlocked": blocked, "rng": rng}


## seconds 동안 돌리며 이벤트를 모은다. 매 스텝 each(i)를 부른다(선택)
func run(npc: Npc, c: Dictionary, seconds: float, each: Callable = Callable()) -> Array:
	var events := []
	for i in roundi(seconds / DT):
		if each.is_valid():
			each.call(i)
		npc.update(DT, c)
		for e in npc.drain_events():
			events.append(e)
	return events


func spawn(id: String, profile: Dictionary, pos: Vector2, extra: Dictionary = {}) -> Npc:
	var s := {"id": id, "profileId": id, "profile": profile, "pos": pos, "areaId": null}
	s.merge(extra, true)
	return Npc.new(s)


# ── 지각

func test_angles() -> bool:
	near(Perception.angle_diff(0.1, -0.1), 0.2, 6)
	near(Perception.angle_diff(PI - 0.1, -PI + 0.1), 0.2, 6, "±π를 넘어 감싼다")
	near(Perception.angle_diff(7 * PI, 0), PI, 6)
	near(Perception.angle_to(Vector2(0, 0), Vector2(0, 1)), PI / 2, 6)
	return true


func test_perceive() -> bool:
	var p: Dictionary = P["neighbor"]
	# 서로 마주 봄: 시야 + 아이컨택
	var r := Perception.perceive(map, Vector2(18, 5), PI, p, player({"pos": Vector2(13, 5), "facing": 0.0}))
	near(r["dist"], 5, 4)
	ok(r["inView"], "시야 안")
	ok(r["eyeContact"], "아이컨택")
	ok(not r["heard"], "멈춰 있으면 들리지 않는다")
	# 폰 보는 척·눈 감기는 아이컨택만 막는다
	r = Perception.perceive(map, Vector2(18, 5), PI, p, player({"pos": Vector2(13, 5), "phonePretend": true}))
	ok(r["inView"] and not r["eyeContact"], "폰 보는 척")
	r = Perception.perceive(map, Vector2(18, 5), PI, p, player({"pos": Vector2(13, 5), "eyesClosed": true}))
	ok(r["inView"] and not r["eyeContact"], "눈 감기")
	# 등을 돌리고 있으면 아이컨택이 없다
	r = Perception.perceive(map, Vector2(18, 5), PI, p, player({"pos": Vector2(13, 5), "facing": PI}))
	ok(r["inView"] and not r["eyeContact"], "등 돌림")
	# NPC가 반대쪽을 보면 시야 밖
	r = Perception.perceive(map, Vector2(18, 5), 0.0, p, player({"pos": Vector2(13, 5)}))
	ok(not r["inView"], "시야 콘 밖")
	# 벽 너머는 보이지 않지만 움직이면 들린다
	var loud: Dictionary = p.duplicate()
	loud["hearingRadius"] = 20
	r = Perception.perceive(map, Vector2(14, 3), PI, loud, player({"pos": Vector2(7, 3), "moving": true}))
	ok(not r["inView"], "벽이 시선을 막는다")
	ok(r["heard"], "발소리")
	# 숨으면 시야 거리가 줄고 들리지 않는다
	r = Perception.perceive(map, Vector2(18, 5), PI, p, player({"pos": Vector2(12, 5), "hidden": true, "moving": true}))
	ok(not r["inView"] and not r["heard"], "숨음")
	return true


# ── 상태 머신

func test_npc_notices_and_talks() -> bool:
	var n := spawn("neighbor", P["neighbor"], Vector2(18, 5))
	n.facing = PI
	eq(n.state, "idle")
	var events := run(n, ctx(player({"pos": Vector2(13, 5)}), lcg(1)), 6)
	eq(events.map(func(e): return e["type"]), ["noticed", "talk"])
	eq(events[1]["fromBehind"], false)
	ok(events[1]["npc"] == n)
	eq(n.state, "dialogue")
	ok(n.pos.x > 14.5 and n.pos.x < 16, "말 거리까지 다가왔다 %s" % n.pos)
	# 대화가 끝나면 쿨다운 뒤 제자리로
	n.end_dialogue(5)
	eq(n.state, "giveUp")
	eq(n.cooldown, 5.0)
	run(n, ctx(player({"pos": Vector2(13, 5), "unreachable": true}), lcg(1)), 8)
	eq(n.state, "idle")
	ok(n.pos.distance_to(Vector2(18, 5)) < 0.5, "제자리 %s" % n.pos)
	return true


func test_npc_tap_from_behind() -> bool:
	var n := spawn("neighbor", P["neighbor"], Vector2(18, 5))
	n.facing = PI
	var events := run(n, ctx(player({"pos": Vector2(13, 5), "facing": PI}), lcg(1)), 8)
	var talks := events.filter(func(e): return e["type"] == "talk")
	eq(talks.size(), 1)
	eq(talks[0]["fromBehind"], true, "등 뒤에서 어깨 톡톡")
	return true


func test_npc_hears_and_goes_around_wall() -> bool:
	var prof: Dictionary = P["neighbor"].duplicate()
	prof["hearingRadius"] = 20
	var n := spawn("neighbor", prof, Vector2(14, 3))
	var pl := player({"pos": Vector2(5, 3), "moving": true, "facing": PI})
	var max_y := [0.0]
	var events := run(n, ctx(pl, lcg(2)), 12, func(i):
		pl["pos"] = Vector2(5, 3 + sin(i * DT) * 0.5)
		max_y[0] = maxf(max_y[0], n.pos.y))
	eq(events[0]["type"], "noticed")
	gt(max_y[0], 9, "벽 아래 틈으로 돌아온다")
	ok(n.pos.x < 10, "벽을 넘어왔다 %s" % n.pos)
	ok(n.state == "attemptTalk" or n.state == "dialogue", n.state)
	return true


func test_npc_lose_track() -> bool:
	var n := spawn("neighbor", P["neighbor"], Vector2(18, 5))
	n.facing = PI
	var pl := player({"pos": Vector2(13, 5)})
	run(n, ctx(pl, lcg(1)), 2)
	eq(n.state, "approach")
	ok(n.pursuing)
	# 안전지대로 숨으면 추적이 끊긴다
	pl["unreachable"] = true
	run(n, ctx(pl, lcg(1)), DT)
	eq(n.state, "giveUp")
	eq(n.notice, 0.0)
	near(n.cooldown, float(P["neighbor"]["cooldownSec"]) * 0.5, 2)
	# 말을 걸 수 없는 상황(talkBlocked)에서는 다가오지 않는다
	var m := spawn("neighbor", P["neighbor"], Vector2(18, 5))
	m.facing = PI
	var events := run(m, ctx(player({"pos": Vector2(13, 5)}), lcg(1), null, true), 3)
	eq(events.size(), 0)
	eq(m.state, "idle")
	return true


func test_npc_patrol_back_and_forth() -> bool:
	var pts := [Vector2(12, 2), Vector2(20, 2), Vector2(20, 11)]
	var n := spawn("coworker", P["coworker"], Vector2(12, 2), {"path": {"points": pts, "loop": false}})
	eq(n.state, "patrol")
	var reached := {}
	run(n, ctx(player({"pos": Vector2(3, 3), "unreachable": true}), lcg(4)), 40, func(_i):
		for k in pts.size():
			if n.pos.distance_to(pts[k]) < 0.6:
				reached[k] = true)
	eq(reached.size(), 3, "모든 경로점을 지난다")
	eq(n.notice, 0.0, "닿을 수 없는 플레이어는 알아채지 않는다")
	eq(n.state, "patrol")
	return true


func test_pet_wanders_near_home() -> bool:
	var n := spawn("cat", P["cat"], Vector2(5, 10))
	var moved := [false]
	run(n, ctx(player({"pos": Vector2(20, 11)}), lcg(3)), 30, func(_i):
		if n.pos.distance_to(Vector2(5, 10)) > 0.3:
			moved[0] = true
		ok(absf(n.pos.x - 5) <= 3.5 and absf(n.pos.y - 10) <= 2.5, "집 근처 %s" % n.pos))
	ok(moved[0], "어슬렁거린다")
	eq(n.state, "idle")
	return true


func test_stalker_follows_in_area() -> bool:
	var n := spawn("clerk", P["clerk"], Vector2(20, 10), {"areaId": "shop"})
	var pl := player({"pos": Vector2(13, 4), "facing": 0.6})
	var events := run(n, ctx(pl, lcg(5), "shop"), 8)
	eq(events.map(func(e): return e["type"]), ["noticed", "talk"], "응시하면 순간 접근 → 말 걸기")
	eq(n.state, "dialogue")
	# 다른 영역에 있으면 따라오지 않는다
	var m := spawn("clerk", P["clerk"], Vector2(20, 10), {"areaId": "shop"})
	events = run(m, ctx(player({"pos": Vector2(13, 4), "facing": 0.6}), lcg(5), null), 3)
	ok(m.state != "stalk", m.state)
	# 따라오다 영역을 벗어나면 그만둔다
	var k := spawn("clerk", P["clerk"], Vector2(20, 10), {"areaId": "shop"})
	var pl2 := player({"pos": Vector2(13, 4), "facing": PI})
	run(k, ctx(pl2, lcg(5), "shop"), 1)
	eq(k.state, "stalk")
	run(k, ctx(pl2, lcg(5), "street"), DT)
	eq(k.state, "giveUp")
	return true


func test_hunter_gives_up_beyond_leash() -> bool:
	var n := spawn("flyer", P["flyer"], Vector2(19, 11))
	n.facing = PI
	var pl := player({"pos": Vector2(14, 11), "moving": true})
	var states := {}
	var events := run(n, ctx(pl, lcg(6)), 6, func(i):
		pl["pos"] = Vector2(14 - i * DT * 1.2, 11)
		states[n.state] = true)
	eq(events.map(func(e): return e["type"]), ["noticed"])
	ok(states.has("approach") and states.has("giveUp"), str(states.keys()))
	ok(n.cooldown > 0, "다시 다가오기 전 쉬는 시간")
	return true


# ── 군중

const LANES := [
	{"id": "l1", "zone": "z", "from": [2, 5], "to": [40, 5], "width": 3, "count": 10, "speed": 1.3},
	{"id": "l2", "zone": "z", "from": [30, 2], "to": [3, 9], "width": 2, "count": 6, "speed": 1.1},
]


func test_crowd_build_and_density() -> bool:
	var c := Crowd.new(LANES, lcg(9))
	eq(c.agents.size(), 16 + 10, "최대 1.6배까지 만들어 둔다")
	var active := func() -> int: return c.agents.filter(func(a): return a["active"]).size()
	eq(active.call(), 16)
	c.set_density(1.6)
	eq(active.call(), 26)
	c.set_density(0.5)
	eq(active.call(), 8, "반올림: 5 + 3")
	var ids := {}
	for a in c.agents:
		ids[a["id"]] = true
		ok(a["speed"] >= 1.1 * 0.8 - 1e-6 and a["speed"] <= 1.3 * 1.2 + 1e-6)
	eq(ids.size(), c.agents.size())
	return true


## 웹 판과 같은 난수로 같은 자리를 지난다 (TS 실행 결과에서 옮긴 값)
func test_crowd_matches_web() -> bool:
	var c := Crowd.new(LANES, lcg(9))
	var pp := Vector2(15, 5.2)
	var rows := []
	for i in 600:
		if i == 200:
			c.set_density(1.6)
		if i == 400:
			c.set_density(0.5)
		c.update(DT, pp, 0.35)
		if i % 100 == 0:
			var t: Variant = c.touching(pp, 1)
			rows.append([c.count_near(pp, 3), t["id"] if t != null else -1, c.slipstream(pp, Vector2(1, 0), 2, 0.6)])
			if i == 500:
				near(c.agents[0]["pos"].x, 24.051, 2)
				near(c.agents[0]["pos"].y, 3.785, 2)
				near(c.agents[3]["pos"].x, 16.626, 2)
				near(c.agents[3]["pos"].y, 5.467, 2)
	eq(rows, [[2, 6, false], [3, 6, false], [4, 22, false], [4, -1, false], [4, -1, false], [3, -1, false]])
	return true


func test_crowd_wraps_and_freezes_far() -> bool:
	var lane := {"id": "l", "zone": "z", "from": [0, 0], "to": [10, 0], "width": 0, "count": 1, "speed": 1}
	var c := Crowd.new([lane], func(): return 0.95)
	var a: Dictionary = c.agents[0]
	near(a["pos"].x, 9.5, 4)
	var far := Vector2(500, 500)
	c.update(1, far, 0.35)
	near(a["pos"].x, 9.5, 4, "멀리 있으면 멈춰 둔다")
	var here := Vector2(5, 3)
	c.update(1, here, 0.35)
	ok(a["pos"].x < 10, "동선 끝에서 처음으로 %s" % a["pos"])
	ok(a["pos"].x < 1.0, "%s" % a["pos"])
	return true


func test_crowd_slipstream() -> bool:
	var lane := {"id": "l", "zone": "z", "from": [0, 5], "to": [30, 5], "width": 0, "count": 1, "speed": 1}
	var c := Crowd.new([lane], func(): return 0.1)
	var a: Dictionary = c.agents[0]
	ok(a["large"], "rng 0.1 < 0.15 → 덩치 큰 행인")
	var behind: Vector2 = a["pos"] - Vector2(1, 0)
	ok(c.slipstream(behind, Vector2(1, 0), 2, 0.6), "바로 뒤")
	ok(not c.slipstream(behind, Vector2(-1, 0), 2, 0.6), "반대 방향")
	ok(not c.slipstream(behind, null, 2, 0.6))
	ok(not c.slipstream(a["pos"] + Vector2(1, 0), Vector2(1, 0), 2, 0.6), "앞")
	return true
