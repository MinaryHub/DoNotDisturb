extends SessionCase

## 하루 구성과 한 주: 매번 다른 하루(DayComposer)·이야기 줄기·연차·휴가·난이도·이번 주의 조건·작은 승리
## 웹 판 tests/dayComposer.test.ts · story.test.ts · leave.test.ts · vacation.test.ts · meta.test.ts의 GameSession 시험
## (GameSession 없이 도는 DayComposer·Story 시험은 test_gameplay.gd)


func _day_with(id: String, flags: Array) -> GameSession:
	var s := GameSession.new(cfg)
	for f in flags:
		s.story[f] = 1.0
	s.start_day(day_index(id))
	press(s, {"confirm": true})
	return s


# ── DayComposer (dayComposer.test.ts)

func test_composer_all_days_seeds_run() -> bool:
	for seed in range(1, 13):
		var s := GameSession.new(cfg, {}, {"seed": seed})
		for i in cfg["days"].size():
			s.start_day(i)
			press(s, {"confirm": true})
			for k in 120:
				s.step(DT, GameSession.NO_CONTROLS)
			ok(s.mode["kind"] != "dayIntro", "seed %d day %d" % [seed, i])
	return true


func test_composer_force_every_happening() -> bool:
	for h in cfg["happenings"]["list"]:
		var only: Dictionary = cfg.duplicate()
		var hh: Dictionary = h.duplicate()
		hh["chance"] = 1.0
		only["happenings"] = {"maxPerDay": 1, "list": [hh]}
		var s := GameSession.new(only, {}, {"seed": 1})
		for i in cfg["days"].size():
			var d: Dictionary = cfg["days"][i]
			if h.has("days") and not h["days"].has(d["id"]):
				continue
			if h.has("weather") and h["weather"] != d.get("weather", "clear"):
				continue
			s.start_day(i)
			eq(s.happenings.map(func(x): return x["id"]), [h["id"]], "%s @ %s" % [h["id"], d["id"]])
			press(s, {"confirm": true})
			for k in 60:
				s.step(DT, GameSession.NO_CONTROLS)
			ok(s.mode["kind"] != "dayIntro", "%s @ %s" % [h["id"], d["id"]])
	return true


func test_composer_retry_varies() -> bool:
	var s := GameSession.new(cfg, {}, {"seed": 42})
	var seen := {}
	for k in 8:
		s.retry_day()
		seen[JSON.stringify([s.happenings.map(func(h): return h["id"]), s.day["npcs"].map(func(n): return "%s@%s" % [n["id"], n.get("at")])])] = true
	gt(seen.size(), 3)
	return true


# ── 발표 줄기 (story.test.ts)

func test_story_pitch_prep_and_retry() -> bool:
	var s := _day_with("day2", [])
	s.clock.minutes = DayCycle.parse_time("09:19")
	step(s, 70)
	var msg: Variant = null
	for m in s.phone.messages:
		if m["contactId"] == "boss" and not m["resolved"]:
			msg = m
			break
	ok(msg != null, "팀장님 메시지")
	eq(msg["textKey"], "phone.boss.pitchPrep")
	s.phone.reply(msg["id"])
	step(s, 0.1)
	ok(s.story.has("pitch.prepped"), "표지")
	ok(not (s.save_state()["story"] as Dictionary).has("pitch.prepped"), "저장은 아침 기준")
	s.retry_day()
	ok(not s.story.has("pitch.prepped"), "다시 하면 아침으로")
	return true


func test_story_thursday_variants() -> bool:
	var ready := _day_with("dayThu", ["pitch.prepped"])
	eq(ready.objectives.get_objective("work")["def"]["textKey"], "obj.workPitchCheck")
	ok(not ready.day["phone"].any(func(p): return p.get("textKey") == "phone.boss.pitchWhere"))
	ok(ready.day["notes"].map(func(n): return n["textKey"]).has("note.thu.prepped"))

	var rushed := _day_with("dayThu", [])
	eq(rushed.objectives.get_objective("work")["def"]["textKey"], "obj.workPitchRush")
	eq(rushed.objectives.get_objective("work")["def"]["deadline"], "10:30")
	ok(rushed.day["phone"].any(func(p): return p.get("textKey") == "phone.boss.pitchWhere"))
	return true


func test_story_pitch_then_qna() -> bool:
	var s := _day_with("dayThu", ["pitch.prepped"])
	put(s, 150, 25)
	step(s, 0.2)
	s.objectives.get_objective("work")["done"] = true
	go_to(s, "meetingSeat")
	press(s, {"interactPressed": true})
	var speeches := speak_through(s, 60)
	eq(speeches, ["pitch", "pitchQna"])
	ok(s.objectives.is_done("pitch"), "발표")
	ok(s.story.has("pitch.done"), "표지")
	gt(s.sim.bus.active_ruminations(), 0, "이불킥")
	return true


# ── 윗집·지우 줄기

func test_story_upstairs_memo() -> bool:
	var s := _day_with("dayThu", [])
	ok(s.objectives.get_objective("memo") != null, "쪽지 목표")
	ok(s.day["npcs"].any(func(n): return n["id"] == "upstairs"), "윗집 사람")
	s.game_event("interact:homeMemo")
	ok(s.story.has("upstairs.resolved"))

	var calm := _day_with("dayThu", ["upstairs.resolved"])
	ok(calm.objectives.get_objective("memo") == null)
	eq(calm.day.get("areaStimuli", []), [])
	return true


func test_story_jiu() -> bool:
	var none := _day_with("day4", [])
	ok(none.objectives.get_objective("friend") == null)
	ok(not none.day["npcs"].any(func(n): return n["id"] == "friend"))
	ok(none.day["phone"].any(func(p): return p.get("textKey") == "phone.friend.nextTime"))

	var met := _day_with("day4", ["jiu.answered"])
	eq(met.objectives.get_objective("friend")["def"]["textKey"], "obj.friendMoving")
	ok(met.day["npcs"].any(func(n): return n["id"] == "friend"))
	return true


# ── 인물의 기억

func test_story_neighbor_sidedish() -> bool:
	var mon := _day_with("day1", [])
	eq(npc(mon, "neighbor").profile["dialogue"], "neighborSidedish")
	mon.game_event("talked:neighbor")
	eq(mon.story.get("neighbor.sidedish"), 1.0)
	eq(mon.player.inventory["consumables"].get("sidedish"), 1)

	var wed := _day_with("dayWed", ["neighbor.sidedish"])
	eq(npc(wed, "neighbor").profile["dialogue"], "neighborFollowup")
	ok(npc(_day_with("dayWed", []), "neighbor") == null)

	var warm := _day_with("day4", ["neighbor.sidedish", "neighbor.thanked"])
	eq(npc(warm, "neighbor").profile["dialogue"], "neighborWarm")
	eq(warm.player.inventory["consumables"].get("sidedish"), 1)
	eq(npc(_day_with("day4", ["neighbor.sidedish"]), "neighbor").profile["dialogue"], "neighborWistful")
	eq(npc(_day_with("day4", []), "neighbor").profile["dialogue"], "neighbor")
	return true


func _buy_cafe(s: GameSession) -> Array:
	var counter := interactable("cafeCounter")
	put(s, float(counter["at"][0]), float(counter["at"][1]) + 0.4)
	s.player.inventory["consumables"] = {}
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "shop")
	press(s, {"interactPressed": true})
	press(s, {"cancel": true})
	return toast_keys(s.drain_fx())


func test_story_cafe_regular() -> bool:
	var first := _day_with("day1", [])
	first.sim.life.add_money(100000)
	var tension := first.sim.energy.mood("tension")
	ok(not _buy_cafe(first).has("cafe.usual"))
	gt(first.sim.energy.mood("tension"), tension, "주문이 자극")
	_buy_cafe(first)
	eq(first.story.get("cafe"), 1.0, "하루 한 번 센다")

	var regular := _day_with("dayThu", ["cafe"])
	regular.story["cafe"] = 2.0
	regular.sim.life.add_money(100000)
	var before := regular.sim.energy.mood("tension")
	ok(_buy_cafe(regular).has("cafe.usual"), "늘 드시던 걸로요?")
	ok(regular.sim.energy.mood("tension") <= before)
	eq(regular.story.get("cafe"), 3.0)
	return true


func test_story_seoyun_nod() -> bool:
	var s := _day_with("day1", [])
	s.clock.minutes = DayCycle.parse_time("10:00")
	var seo := npc(s, "seoyun")
	s.sim.energy.add_mood("tension", 40)
	var i := 0
	while i < 60 * 6 and not s.story.get("seoyun", 0):
		put(s, seo.pos.x + 2.5, seo.pos.y)
		seo.facing = 0.0
		s.step(DT, GameSession.controls({"aim": PI}))
		i += 1
	eq(s.story.get("seoyun"), 1.0, "눈인사")
	eq(s.gaze_count(), 0)
	lt(s.sim.energy.mood("tension"), 40)
	step(s, 2, {"aim": PI})
	eq(s.story.get("seoyun"), 1.0, "하루 한 번")
	return true


# ── 연차 (leave.test.ts)

func test_leave_tuesday() -> bool:
	var s := GameSession.new(cfg)
	s.start_day(day_index("day2"))
	var income := s.sim.life.get_stat("income")
	ok(s.can_take_leave())
	press(s, {"leave": true})
	ok(s.on_leave)
	ok(s.objectives.get_objective("commute") == null)
	ok(s.objectives.get_objective("work") == null)
	ok(s.objectives.available(s.objectives.get_objective("groceries")), "장보기는 바로")
	eq(s.sim.life.get_stat("income"), income - 6)
	press(s, {"confirm": true})
	eq(s.mode["kind"], "free")
	return true


func test_leave_once_per_week() -> bool:
	var s := GameSession.new(cfg)
	s.start_day(day_index("day1"))
	press(s, {"leave": true})
	eq(s.leave_used, 1)
	s.retry_day()
	eq(s.leave_used, 0)
	ok(not s.on_leave)
	press(s, {"leave": true})
	s.start_day(day_index("day3"))
	ok(not s.can_take_leave(), "한 주에 한 번")
	s.start_day(day_index("dayThu"))
	s.leave_used = 0
	ok(not s.can_take_leave(), "발표 날")
	return true


# ── 휴가 모드 (vacation.test.ts)

func test_vacation_day() -> bool:
	var s := GameSession.new(cfg, {}, {"vacation": true})
	eq(s.day["id"], cfg["vacationDay"]["id"])
	ok(not s.objectives.list.any(func(o): return o["def"].get("mandatory", false) or o["def"].get("workday", false)))
	ok(s.objectives.can_end_day)
	return true


func test_vacation_next_day() -> bool:
	var s := GameSession.new(cfg, {}, {"vacation": true})
	press(s, {"confirm": true})
	var money := s.sim.life.money
	var bed := interactable_kind("bed")
	put(s, float(bed["at"][0]), float(bed["at"][1]))
	s.step(DT, GameSession.NO_CONTROLS)
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "night")
	eq(s.mode["settlement"], [])
	eq(s.sim.life.money, money)
	press(s, {"confirm": true})
	eq(s.mode["kind"], "dayIntro")
	eq(s.vacation_day_count, 2)
	eq(s.day_index, 0)
	eq(s.day["id"], cfg["vacationDay"]["id"])
	return true


# ── 난이도·이번 주의 조건·작은 승리 (meta.test.ts)

func _mood_after_call(difficulty: String) -> Array:
	var s := GameSession.new(cfg, {}, {"difficulty": difficulty})
	press(s, {"confirm": true})
	s.sim.energy.debug_set({"tension": 0, "stress": 0, "panic": 0})
	s.sim.bus.emit("voiceCall")
	s.step(DT, GameSession.NO_CONTROLS)
	return [s, s.sim.energy.mood("tension") + s.sim.energy.mood("stress") + s.sim.energy.mood("panic")]


func test_meta_difficulty() -> bool:
	var mild := _mood_after_call("mild")
	var deep := _mood_after_call("deep")
	gt(deep[1], mild[1] * 1.3)
	lt(deep[0].difficulty["batteryStart"], 100)
	eq(GameSession.new(cfg, deep[0].save_state()).difficulty["id"], "deep")
	return true


func test_meta_week_condition() -> bool:
	var s := GameSession.new(cfg, {}, {"seed": 5})
	ok(s.week_condition != null, "조건을 뽑는다")
	s.week_condition = find_by_id(cfg["weekConditions"]["list"], "rainy")
	s.start_day(day_index("day2"))
	eq(s.day.get("weather"), "rain")
	eq(s.day["notes"][0]["textKey"], "week.rainy.note")
	# 테스트 기본(씨앗 없음)은 조건 없음
	ok(GameSession.new(cfg).week_condition == null)
	return true


func test_meta_achievements() -> bool:
	var s := GameSession.new(cfg)
	s.story["cafe"] = 3.0
	s._check_achievements(false)
	ok(s.achieved.has("regular"))
	ok(not s.achieved.has("noWarp"), "max 조건은 주간 리포트에서만")
	s._check_achievements(true)
	ok(s.achieved.has("noWarp"))
	# 다음 날 아침에 저장된다
	s.start_day(1)
	ok(GameSession.new(cfg, s.save_state()).achieved.has("regular"))
	return true


func test_meta_week_events() -> bool:
	var s := GameSession.new(cfg)
	s.game_event("bike:ride")
	s.game_event("bike:ride")
	eq(s.achievement_value("event.bike:ride"), 2.0)
	eq(s.achievement_value("event.unrelated"), 0.0)
	return true
