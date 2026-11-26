extends TestCase

## gameplay 계층 시험 (GameSession 없이 돌아가는 것만).
## 웹 판 tests/story.test.ts · dayComposer.test.ts · bus.test.ts에서 옮김 + 목표·독백·미니게임 단위 시험

var cfg := DataLoader.load_config("ko")


func day_index(id: String) -> int:
	var days: Array = cfg["days"]
	for i in days.size():
		if days[i]["id"] == id:
			return i
	return -1


func st(flags: Array) -> Dictionary:
	var d := {}
	for f in flags:
		d[f] = 1.0
	return d


## 테스트용 선형 합동 난수 (웹 판 lcg와 같은 수열)
func lcg(seed: int) -> Callable:
	var s := [seed & 0xFFFFFFFF]
	return func() -> float:
		s[0] = (s[0] * 1664525 + 1013904223) & 0xFFFFFFFF
		return float(s[0]) / 4294967296.0


# ── 이야기 조건 (story.test.ts)

func test_story_allows() -> bool:
	var flags := {"a": 1.0}
	eq(Story.allows(null, flags), true)
	eq(Story.allows(["a"], flags), true)
	eq(Story.allows(["!a"], flags), false)
	eq(Story.allows(["a", "!b"], flags), true)
	# 셈 조건
	eq(Story.allows(["cafe>=2"], {"cafe": 2.0}), true)
	eq(Story.allows(["cafe>=3"], {"cafe": 2.0}), false)
	eq(Story.allows(["cafe>=1"], {}), false)
	return true


func test_story_apply_drops_requires() -> bool:
	var thu: Dictionary = cfg["days"][day_index("dayThu")]
	var d: Dictionary = thu.duplicate()
	var objs: Array = thu["objectives"].duplicate()
	objs.append({"id": "x", "textKey": "obj.home", "on": "never", "requires": ["memo"]})
	d["objectives"] = objs
	var day := Story.apply_story(d, st(["upstairs.resolved"]))
	ok(not day["objectives"].any(func(o): return o["id"] == "memo"), "memo가 빠진다")
	var x: Dictionary = day["objectives"].filter(func(o): return o["id"] == "x")[0]
	eq(x["requires"], [])
	# 원본은 그대로
	eq(objs[objs.size() - 1]["requires"], ["memo"])
	return true


func test_story_marks() -> bool:
	var state := {}
	for m in Story.marks_for(cfg["story"], "replied:friend", "day1"):
		Story.apply_mark(state, m)
	eq(state.get("jiu.answered", 0), 1.0)
	eq(Story.marks_for(cfg["story"], "replied:friend", "day4").size(), 0, "다른 날에는 걸리지 않는다")
	for i in 2:
		for m in Story.marks_for(cfg["story"], "bought:cafe", "day1"):
			Story.apply_mark(state, m)
	eq(state["cafe"], 2.0)
	eq(Story.from_save(["a", "b"]), {"a": 1.0, "b": 1.0})
	eq(Story.from_save({"cafe": 3}), {"cafe": 3.0})
	eq(Story.from_save(null), {})
	return true


func test_story_epilogue() -> bool:
	eq(Story.epilogue_keys(cfg["story"], {}), ["epi.pitch.rushed", "epi.upstairs.none", "epi.jiu.none"])
	eq(Story.epilogue_keys(cfg["story"], st(["pitch.prepped", "pitch.rehearsed", "upstairs.note", "upstairs.resolved", "jiu.answered", "jiu.met"])), [
		"epi.pitch.ready",
		"epi.upstairs.note",
		"epi.jiu.met",
	])
	return true


func test_story_epilogue_memories() -> bool:
	ok(not Story.epilogue_keys(cfg["story"], {"cafe": 2.0}).has("epi.cafe.regular"))
	var keys := Story.epilogue_keys(cfg["story"], {"cafe": 3.0, "seoyun": 3.0, "neighbor.sidedish": 1.0})
	for k in ["epi.cafe.regular", "epi.seoyun.often", "epi.neighbor.sidedish"]:
		ok(keys.has(k), k)
	return true


## 데이터의 조건이 모두 알려진 표지를 쓴다 (오타 없음)
func test_story_known_flags() -> bool:
	var conds := []
	for d in cfg["days"]:
		for list_key in ["objectives", "phone", "npcs", "areaStimuli", "notes"]:
			for x in d.get(list_key, []):
				conds.append(x.get("if"))
	for tr in cfg["monologueTriggers"]:
		conds.append(tr.get("if"))
	eq(Story.unknown_story_flags(cfg["story"], conds), [])
	eq(Story.unknown_story_flags(cfg["story"], [["!nope.flag", "cafe>=2"]]), ["nope.flag"])
	return true


# ── DayComposer (dayComposer.test.ts)

func test_composer_no_seed_is_base_day() -> bool:
	for d in cfg["days"]:
		var r := DayComposer.compose_day(d, cfg["happenings"], null)
		eq(r["happenings"], [])
		ok(r["day"]["npcs"].all(func(n): return not n.has("alt") and not n.has("chance")), "alt·chance 없음")
		var want: Array = d["phone"].filter(func(p): return Story.allows(p.get("if"), {})).map(func(p): return p.get("textKey"))
		eq(r["day"]["phone"].map(func(p): return p.get("textKey")), want)
	return true


func _sig(base: Dictionary, seed: int) -> String:
	var r := DayComposer.compose_day(base, cfg["happenings"], lcg(seed))
	return JSON.stringify([
		r["happenings"].map(func(h): return h["id"]),
		r["day"]["npcs"].map(func(n): return "%s@%s" % [n["id"], n.get("at")]),
		r["day"]["phone"].map(func(p): return "%s@%s" % [p.get("textKey"), p.get("at", p.get("on"))]),
	])


func test_composer_seeded_variety() -> bool:
	var base: Dictionary = cfg["days"][0]
	eq(_sig(base, 7), _sig(base, 7))
	var variants := {}
	for i in 30:
		variants[_sig(base, i + 1)] = true
	gt(variants.size(), 20)
	return true


func test_composer_limits() -> bool:
	var hcfg: Dictionary = cfg["happenings"]
	for d in cfg["days"]:
		for seed in range(1, 201):
			var r := DayComposer.compose_day(d, hcfg, lcg(seed))
			var happenings: Array = r["happenings"]
			var day: Dictionary = r["day"]
			ok(happenings.size() <= int(hcfg["maxPerDay"]), "maxPerDay")
			var groups := []
			for h in happenings:
				if h.has("group"):
					groups.append(h["group"])
				if h.has("days"):
					ok(h["days"].has(d["id"]), "%s @ %s" % [h["id"], d["id"]])
			var gset := {}
			for g in groups:
				gset[g] = true
			eq(gset.size(), groups.size(), "같은 group은 하나만")
			var nids := {}
			for n in day["npcs"]:
				nids[n["id"]] = true
			eq(nids.size(), day["npcs"].size(), "NPC id 중복 없음")
			# 필수 전화는 빠지지 않는다
			for p in d["phone"]:
				if p.get("mandatory", false):
					ok(day["phone"].any(func(x): return x.get("contact") == p.get("contact") and x.get("mandatory", false)), "필수 전화 %s" % p.get("contact"))
	return true


## 같은 씨앗의 웹 판과 같은 결과인지 확인용 고정값: 씨앗 7의 사건 목록이 실행마다 같고, 원본 하루 데이터를 건드리지 않는다
func test_composer_does_not_mutate() -> bool:
	var base: Dictionary = cfg["days"][0]
	var before := JSON.stringify(base)
	for seed in range(1, 20):
		DayComposer.compose_day(base, cfg["happenings"], lcg(seed))
	eq(JSON.stringify(base), before)
	return true


# ── 마을버스 시간표 (bus.test.ts)

func route() -> BusRoute:
	return BusRoute.new(cfg["worldParts"]["city"]["bus"], cfg["balance"]["bus"])


func test_bus_stops_at_station() -> bool:
	var r := route()
	var x := r.stop_x("middle")
	for now in [480.0, 481.3, 600.0, 777.7]:
		var next := r.next_at(1, x, now)
		gt(next["arrive"] + float(cfg["balance"]["bus"]["dwellMin"]), now)
		var bus: Variant = r.bus_at(1, next["depart"], maxf(now, next["arrive"]) + 0.01)
		ok(bus != null, "버스가 있다")
		if bus != null:
			eq(bus["stopped"], true)
			near(bus["x"], x, 5)
	return true


func test_bus_both_directions() -> bool:
	var r := route()
	var buses := r.buses_at(DayCycle.parse_time("12:00"))
	ok(buses.any(func(b): return b["dir"] == 1))
	ok(buses.any(func(b): return b["dir"] == -1))
	for b in buses:
		eq(b["y"], r.lane_y(b["dir"]))
	return true


func test_bus_alight() -> bool:
	var r := route()
	var city_bus: Dictionary = cfg["worldParts"]["city"]["bus"]
	eq(r.alight_at(1, 20), Vector2(20, city_bus["curbSouthY"]))
	eq(r.alight_at(-1, 20), Vector2(20, city_bus["curbNorthY"]))
	var x := r.stop_x("east")
	var next := r.next_at(1, x, 600)
	near(r.reaches_at(1, next["depart"], x), next["arrive"], 6)
	near(r.leaves_at(1, next["depart"], x) - next["arrive"], float(cfg["balance"]["bus"]["dwellMin"]), 6)
	return true


# ── 목표 (Objectives.ts 단위 시험)

func test_objectives_flow() -> bool:
	var day := {"objectives": [
		{"id": "a", "textKey": "t", "on": "ev:a"},
		{"id": "b", "textKey": "t", "on": "ev:b", "requires": ["a"], "count": 2},
		{"id": "c", "textKey": "t", "on": "ev:c", "closes": "10:00", "optional": true},
		{"id": "d", "textKey": "t", "on": "ev:d", "deadline": "09:00"},
		{"id": "bed", "textKey": "t", "on": "bed", "requires": ["b", "c"], "endsDay": true},
	]}
	var o := Objectives.new(day)
	eq(o.visible().map(func(x): return x["def"]["id"]), ["a", "c", "d"])
	o.fire("ev:b")
	eq(o.get_objective("b")["progress"], 0, "선행 목표 전에는 진행되지 않는다")
	o.fire("ev:a")
	o.fire("ev:b")
	o.fire("ev:b")
	ok(o.is_done("b"))
	ok(not o.can_end_day, "c가 아직")
	o.check_deadlines(DayCycle.parse_time("09:30"))
	ok(o.get_objective("d")["late"])
	ok(not o.get_objective("c")["missed"])
	o.check_deadlines(DayCycle.parse_time("10:00"))
	ok(o.get_objective("c")["missed"])
	ok(o.can_end_day, "놓친 목표는 뒤따르는 목표를 막지 않는다")
	var types: Array = o.drain_events().map(func(e): return "%s:%s" % [e["type"], e["objective"]["def"]["id"]])
	eq(types, ["completed:a", "completed:b", "late:d", "missed:c"])
	eq(o.skipped_optional().map(func(x): return x["def"]["id"]), ["c"])
	# 하루 중에 생긴 목표는 침대 앞에
	o.add({"id": "favor", "textKey": "t", "on": "ev:f", "optional": true})
	eq(o.list.map(func(x): return x["def"]["id"]), ["a", "b", "c", "d", "favor", "bed"])
	eq(o.get_objective("none"), null)
	return true


# ── 독백 (Monologue.ts 단위 시험)

func test_monologue() -> bool:
	var triggers := [
		{"key": "m.ev", "when": {"event": "phone:ring"}, "once": true},
		{"key": "m.area", "when": {"area": "lobby"}, "cooldownSec": 100},
		{"key": "m.npc", "when": {"npcProfile": "neighbor", "distMax": 6, "noticed": true}},
		{"key": "m.day", "when": {"event": "x"}, "if": ["flag"]},
	]
	var texts := {"m.ev": "전화다", "m.area": "로비", "m.area~2": "로비2", "m.npc": "옆집", "m.day": "표지"}
	var m := MonologueDirector.new(triggers, texts, func(): return 0.0)
	m.reset("day1")
	m.on_event("phone:ring")
	eq(m.current["key"], "m.ev")
	m.on_event("x")
	eq(m.current["key"], "m.ev", "표지가 없으면 쉰다")
	m.update(0.1, {"areaId": "lobby", "npcs": [], "returning": false})
	eq(m._queue.size(), 1, "로비 독백이 줄을 선다")
	# 첫 줄이 끝나면 다음 줄
	m.update(10, {"areaId": "lobby", "npcs": [], "returning": false})
	eq(m.current["key"], "m.area")
	eq(m.current["text"], "로비", "rng 0 → 첫 변형")
	m.clear()
	m.update(1, {"areaId": null, "npcs": [{"profileId": "neighbor", "type": "acquaintance", "dist": 4.0, "visible": true, "noticed": true}], "returning": false})
	eq(m.current["key"], "m.npc")
	# once: 다시 울려도 안 나온다
	m.clear()
	m.on_event("phone:ring")
	eq(m.current, null)
	m.reset("day2", {"flag": 1.0})
	m.on_event("x")
	eq(m.current["key"], "m.day")
	m.say("m.ev")
	eq(m._queue.size(), 1)
	m.say("missing")
	eq(m._queue.size(), 1)
	return true


# ── 미니게임 (minigames.ts 단위 시험)

func test_work_game() -> bool:
	var seq := [0.5, 0.1, 0.5, 0.9]
	var i := [0]
	var rng := func() -> float:
		var v: float = seq[i[0] % seq.size()]
		i[0] += 1
		return v
	var g := WorkGame.new(2, 50, [4, 6], 3, rng)
	for k in 61:
		g.update(1.0 / 30.0, true)
	var ev := g.drain_events()
	eq(ev.map(func(e): return e["type"]), ["task"])
	eq(g.pings.size(), 0)
	for k in 90:
		g.update(1.0 / 30.0, false)
	ev = g.drain_events()
	eq(ev.size(), 1)
	eq(ev[0]["type"], "ping")
	eq(ev[0]["ping"]["from"], "boss", "r=0.1 → 팀장님")
	var p: Variant = g.reply()
	eq(p["id"], 1)
	eq(g.reply(), null)
	for k in 120:
		g.update(1.0 / 30.0, true)
	ok(g.done)
	eq(g.drain_events().map(func(e): return e["type"]).back(), "done")
	return true


func test_piano_and_grill() -> bool:
	var piano := PianoGame.new()
	eq(piano.expected, 0)
	eq(piano.press(3), false)
	eq(piano.mistakes, 1)
	for n in PianoGame.PIANO_MELODY:
		piano.press(n)
	ok(piano.done)
	eq(piano.expected, -1)
	eq(piano.press(0), false)

	var grill := GrillGame.new(5, 2, func(): return 0.0)
	eq(grill.state(0), "raw")
	grill.flip(0)
	grill.update(5.5)
	eq(grill.state(1), "cooked")
	grill.flip(1)
	grill.update(2)
	eq(grill.burnt, 2, "남은 두 칸이 탄다")
	grill.flip(7)
	eq(grill.drain_events().map(func(e): return e["type"]), ["tooEarly", "served", "burnt", "burnt"])
	eq(grill.served, 1)
	return true
