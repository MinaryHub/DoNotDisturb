extends SessionCase

## GameSession은 노드 없이 돌아가므로, 입력을 흉내 내 하루를 통째로 진행해 볼 수 있다.
## 웹 판 tests/session.test.ts · regressions.test.ts


# ── GameSession: 월요일 하루 진행

func test_monday_flow() -> bool:
	var s := new_day()
	# 08:02 관리사무소 전화 (피할 수 없음: 거절해도 다시 온다)
	s.clock.minutes = DayCycle.parse_time("08:01")
	step(s, 70)
	ok(s.phone.ringing(), "전화가 울린다")
	press(s, {"decline": true})
	ok(s.phone.ringing(), "필수 전화는 거절되지 않는다")
	press(s, {"accept": true})
	ok(s.objectives.is_done("mgmtCall"), "관리사무소 전화")

	# 침대는 아직
	go_to(s, "bed")
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "free")

	# 출근 (회사 사무실 진입)
	put(s, 150, 25)
	step(s, 0.2)
	ok(s.objectives.is_done("commute"), "출근")

	# 회의 발언: 박자 구간에서 Space
	go_to(s, "meetingSeat")
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "speech")
	speak_through(s, 30)
	ok(s.objectives.is_done("meeting"), "회의")
	ok((s.sim.report["mandatoryDone"] as Array).has("meeting"))

	# 업무: 집중(Space 홀드) + 메신저 답장
	go_to(s, "officeDesk")
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "work")
	var i := 0
	while i < 60 * 120 and s.mode["kind"] == "work":
		s.step(DT, GameSession.controls({"smile": true, "reply": "nod" if i % 30 == 0 else ""}))
		i += 1
	ok(s.objectives.is_done("work"), "업무")
	ok(s.clock.minutes >= DayCycle.parse_time("18:05"), "오후를 건너뛴다")

	# 귀가 → 침대
	go_to(s, "bed")
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "night")
	gt(s.mode["nextMax"], 0)
	press(s, {"confirm": true})
	eq(s.day_index, 1)
	eq(s.mode["kind"], "dayIntro")
	return true


func test_neighbor_notices_and_talks() -> bool:
	var s := new_day()
	put(s, 160, 470)
	var talked := false
	var i := 0
	while i < 60 * 20 and not talked:
		s.step(DT, GameSession.NO_CONTROLS)
		talked = s.mode["kind"] == "dialogue"
		i += 1
	ok(talked, "이웃이 말을 건다")
	return true


func test_hide_notice() -> bool:
	var s := new_day()
	var n := npc(s, "flyer")
	s.clock.minutes = DayCycle.parse_time("10:00")
	# 전단지 배포원 앞 6칸, 숨지 않음
	put(s, n.pos.x - 5, n.pos.y)
	n.facing = PI
	step(s, 0.4)
	gt(n.notice, 0, "알아챈다")
	return true


func test_phase2_flow() -> bool:
	var s := GameSession.new(cfg, {}, {"practiced": true})
	press(s, {"confirm": true})
	var neighbor := npc(s, "neighbor")
	put(s, neighbor.pos.x + 1.5, neighbor.pos.y)
	s.start_dialogue(neighbor, false)
	eq(s.mode["kind"], "dialogue")
	press(s, {"reply": "exit"}) # 틈이 아닌 때 이탈 시도 = 오선택
	gt(s.snapshot()["flush"], 0.05, "홍조")
	var i := 0
	while i < 60 * 60 and s.mode["kind"] == "dialogue":
		s.step(DT, GameSession.controls({"smile": true, "confirm": true}))
		i += 1
	eq(s.mode["kind"], "free")
	gt(s.snapshot()["ruminations"], 0, "이불킥")
	var before: float = s.snapshot()["battery"]
	step(s, 3)
	lt(s.snapshot()["battery"], before, "DoT")
	go_to(s, "homeSink")
	press(s, {"interactPressed": true})
	eq(s.snapshot()["flush"], 0.0, "찬물 세수")
	return true


func test_piano_cancel() -> bool:
	var s := new_day()
	go_to(s, "piano")
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "piano")
	press(s, {"interactPressed": true, "note": 3})
	eq(s.mode["kind"], "piano")
	press(s, {"cancel": true})
	eq(s.mode["kind"], "free")
	return true


func test_burnout_respawn() -> bool:
	var s := new_day()
	put(s, 104, 30)
	var minutes := s.clock.minutes
	s.sim.energy.debug_set({"battery": 1, "panic": 80})
	s.sim.bus.emit("voiceCall")
	step(s, 0.1)
	eq(s.mode["kind"], "burnout")
	step(s, 2.2)
	press(s, {"confirm": true})
	eq(s.mode["kind"], "free")
	ok(s.at_home(), "집")
	near(s.snapshot()["battery"], cfg["balance"]["respawn"]["battery"], 0)
	eq(s.snapshot()["load"], 0.0)
	ok(s.clock.minutes >= minutes + float(cfg["balance"]["respawn"]["hours"]) * 60, "시간이 흐른다")
	return true


func test_burnout_too_late() -> bool:
	var s := new_day()
	s.clock.skip_to(22 * 60)
	s.sim.energy.debug_set({"battery": 1})
	s.sim.bus.emit("voiceCall")
	step(s, 2.3)
	press(s, {"confirm": true})
	ok(["night", "collapse"].has(s.mode["kind"]), "오늘은 끝: %s" % s.mode["kind"])
	return true


func test_sanctuary() -> bool:
	var s := new_day()
	s.sim.energy.debug_set({"battery": 50})
	step(s, 0.2)
	ok(s.sanctuary(), "안전지대")
	step(s, 5)
	gt(s.snapshot()["battery"], 51)
	go_to(s, "doorLock")
	press(s, {"interactPressed": true})
	ok(not s.home_locked)
	ok(not s.sanctuary())
	return true


# ── 모든 날이 시작된다

func test_all_days_start() -> bool:
	for i in cfg["days"].size():
		var s := GameSession.new(cfg)
		s.start_day(i)
		press(s, {"confirm": true})
		step(s, 5, {"move": Vector2(1, 0)})
		ok(s.mode["kind"] != "burnout", cfg["days"][i]["id"])
	return true


# ── 조급함

func test_hurry() -> bool:
	var s := new_day()
	# 집 안을 왔다 갔다 달린다 (자극 없는 곳)
	for k in 4:
		step(s, 1.2, {"move": Vector2(1, 0), "sprint": true})
		step(s, 1.2, {"move": Vector2(-1, 0), "sprint": true})
	gt(s.hurry, 0.95)
	gt(s.snapshot()["tension"], 8)
	step(s, 3, {"move": Vector2(1, 0)})
	lt(s.hurry, 0.7)
	gt(s.hurry, 0.4)
	return true


# ── 비 오는 날

func test_rain_umbrella() -> bool:
	var rainy := -1
	for i in cfg["days"].size():
		if cfg["days"][i].get("weather") == "rain":
			rainy = i
			break
	var s := GameSession.new(cfg)
	s.start_day(rainy)
	press(s, {"confirm": true})
	ok(not s.player.inventory["gear"].has("umbrella"))
	# 집 밖 복도로 한 걸음
	var hall := find_by_id(cfg["world"]["areas"], "apt3f")
	put(s, float(hall["rect"][0]) + 2, float(hall["rect"][1]) + 2)
	step(s, 0.2)
	ok(s.player.inventory["gear"].has("umbrella"), "우산을 챙긴다")
	# 저장된 장비는 다음 세션에도
	var saved := s.save_state()
	saved["gear"] = ["umbrella"]
	var s2 := GameSession.new(cfg, saved)
	ok(s2.player.inventory["gear"].has("umbrella"), "저장된 우산")
	return true


# ── 회복 조이기

func test_mask_stress() -> bool:
	var s := new_day()
	s.sim.energy.debug_set({"stress": 30})
	s.player.mask = true
	step(s, 10)
	gt(s.snapshot()["stress"], 30)
	return true


func test_bag_max() -> bool:
	var s := new_day()
	s.sim.life.add_money(100000)
	s.mode = {"kind": "shop", "shopId": "convStore", "cursor": 0}
	for i in int(cfg["items"]["bagMax"]) + 2:
		press(s, {"interactPressed": true})
		step(s, 0.05)
	eq(s.bag_count(), int(cfg["items"]["bagMax"]))
	return true


# ── 연습 대화

func test_practice_dialogue() -> bool:
	var s := new_day()
	var neighbor := npc(s, "neighbor")
	s.start_dialogue(neighbor, false)
	ok(s.mode["kind"] == "dialogue" and s.mode["practice"], "연습")
	press(s, {"reply": "exit"})
	lt(s.snapshot()["flush"], 0.05)
	var i := 0
	while i < 60 * 60 and s.mode["kind"] == "dialogue":
		s.step(DT, GameSession.controls({"smile": true, "confirm": true}))
		i += 1
	eq(s.snapshot()["ruminations"], 0)
	eq(s.save_state()["practiced"], true)
	var manager := npc(s, "manager")
	s.start_dialogue(manager, false)
	ok(s.mode["kind"] == "dialogue" and not s.mode["practice"], "두 번째부터는 진짜")
	return true


# ── 군중 밀도

func test_crowd_density() -> bool:
	var s := new_day()
	var lane: Dictionary = {}
	for l in cfg["world"]["crowdLanes"]:
		if l["zone"] == "boulevard":
			lane = l
			break
	put(s, (float(lane["from"][0]) + float(lane["to"][0])) / 2.0, float(lane["from"][1]))
	var stress_at := func(n: int) -> float:
		s.sim.energy.debug_set({"tension": 0})
		var agents: Array = s.crowd.agents.filter(func(a): return a["active"]).slice(0, n)
		for k in 60:
			for a in agents:
				a["pos"] = Vector2(s.player.pos.x + 1.2, s.player.pos.y + 1.2)
			step(s, 1.0 / 30)
			ok(s.qte == null, "QTE 없음")
		return s.snapshot()["tension"]
	var few: float = stress_at.call(1)
	var many: float = stress_at.call(6)
	gt(many, few + 2)
	return true


# ── 에너지 보충 음식

func test_home_pantry() -> bool:
	var s := new_day()
	var money := s.sim.life.money
	var ess := s.sim.life.get_stat("essentials")
	open_shop(s, "homePantry", "lunchbox")
	press(s, {"interactPressed": true})
	eq(s.player.inventory["consumables"].get("lunchbox"), 1)
	eq(s.sim.life.money, money)
	lt(s.sim.life.get_stat("essentials"), ess)
	return true


func test_office_pantry() -> bool:
	var s := new_day()
	open_shop(s, "officePantry", "snack")
	press(s, {"interactPressed": true})
	step(s, 0.05)
	press(s, {"interactPressed": true})
	eq(s.player.inventory["consumables"].get("snack"), 1)
	eq(s.shop_left("officePantry", "snack"), 0.0)
	return true


func test_bag_slot_hotkeys() -> bool:
	var s := new_day()
	s.sim.life.add_money(100000)
	open_shop(s, "convStore", "water")
	press(s, {"interactPressed": true})
	step(s, 0.05)
	open_shop(s, "convStore", "gimbap")
	press(s, {"interactPressed": true})
	s.mode = {"kind": "free"}
	eq(s.bag_slots(), ["water", "gimbap"])
	s.sim.energy.debug_set({"battery": 40})
	press(s, {"useItem": 1})
	eq(s.player.inventory["consumables"].get("gimbap", 0), 0)
	# 혼자만의 틈: 바로 차지 않고 먹는 동안 천천히
	lt(s.snapshot()["battery"], 42)
	ok(s.item_break != null and s.item_break["id"] == "gimbap", "먹는 중")
	step(s, 13)
	ok(s.item_break == null, "다 먹음")
	gt(s.snapshot()["battery"], 47)
	return true


func test_break_interrupted() -> bool:
	# 집은 저절로도 회복되니, 아무것도 안 먹은 날과 견준다
	var base := new_day()
	base.sim.energy.debug_set({"battery": 40})
	step(base, 3.1)
	var s := new_day()
	s.player.inventory["consumables"]["lunchbox"] = 1
	s.sim.energy.debug_set({"battery": 40})
	press(s, {"useItem": 0})
	step(s, 3)
	press(s, {"move": Vector2(1, 0)})
	ok(s.item_break == null)
	eq(s.player.inventory["consumables"]["lunchbox"], 0)
	var gained: float = s.snapshot()["battery"] - base.snapshot()["battery"]
	gt(gained, 2)
	lt(gained, 18.0 / 2)
	return true


func test_comfort_items() -> bool:
	var s := new_day()
	open_shop(s, "homeDrawer", "fidget")
	press(s, {"interactPressed": true})
	s.mode = {"kind": "free"}
	var def := find_by_id(cfg["items"]["consumables"], "fidget")
	for i in int(def["usesPerDay"]):
		s.sim.energy.debug_set({"tension": 50})
		press(s, {"useItem": 0})
		step(s, float(def["breakSec"]) + 0.5)
		lt(s.snapshot()["tension"], 50 - float(def["effects"]["stress"]) * 0.8)
	eq(s.player.inventory["consumables"]["fidget"], 1)
	eq(s.uses_left("fidget"), 0.0)
	press(s, {"useItem": 0})
	ok(s.item_break == null)
	return true


# ── 목표가 닫히는 시각

func test_objectives_close() -> bool:
	var s := new_day()
	s.objectives.fire("answered:mgmtOffice")
	var income := s.sim.life.get_stat("income")
	s.clock.skip_to(18 * 60 + 31)
	step(s, 0.1)
	for id in ["commute", "meeting", "work"]:
		eq(s.objectives.get_objective(id)["missed"], true, id)
	eq(s.objectives.visible().map(func(o): return o["def"]["id"]), ["home"])
	lt(s.sim.life.get_stat("income"), income)
	return true


# ── 회귀 (regressions.test.ts)

func _free() -> GameSession:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.clock.minutes = DayCycle.parse_time("11:00")
	return s


func test_regression_reputation_once_per_day() -> bool:
	var s := _free()
	var before := s.reputation.get_value("upstairs")
	var d := float(cfg["reputation"]["events"]["interact:homeMemo"]["upstairs"])
	for i in 8:
		s.game_event("interact:homeMemo")
	eq(s.reputation.get_value("upstairs"), before + d)
	s.start_day(1)
	s.game_event("interact:homeMemo")
	eq(s.reputation.get_value("upstairs"), before + 2 * d)
	return true


func test_regression_vanish_during_knock() -> bool:
	var s := _free()
	s.qte = {"kind": "knock", "timer": 0.0, "window": 3.0}
	s.player.inventory["consumables"]["vanish"] = 1
	press(s, {"useItem": s.bag_slots().find("vanish")})
	ok(s.qte == null, "노크는 두고 온다")
	s.step(DT, GameSession.NO_CONTROLS)
	ok(s.at_home(), "집")
	for i in 300:
		s.step(DT, GameSession.NO_CONTROLS)
	ok(s.mode["kind"] != "dialogue")
	return true


func test_regression_respawn_clears_buffs() -> bool:
	var s := _free()
	s.buffs["resist"] = {"scale": 0.5, "left": 100.0}
	s.respawn_home()
	eq(s.buffs["resist"]["left"], 0.0)
	return true


func test_regression_grabbed_while_waiting_bus() -> bool:
	var s := _free()
	var stop := interactable("busM_west")
	var at := Vector2(float(stop["at"][0]), float(stop["at"][1]))
	s.player.pos = at
	s.step(DT, GameSession.NO_CONTROLS)
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "bus")
	var co: Npc = null
	for n in s.npcs:
		if n.profile_id == "coworker":
			co = n
			break
	co.pos = Vector2(s.player.pos.x + 1, s.player.pos.y)
	var talked := false
	var i := 0
	while i < 60 * 15 and not talked:
		s.player.pos = at
		s.step(DT, GameSession.NO_CONTROLS)
		talked = s.mode["kind"] == "dialogue"
		i += 1
	# 가까이 있던 동료가 말을 걸 수 있었다면 기다림은 대화로 바뀐다 (바쁜 사람만 아니면)
	if talked:
		eq(s.mode["kind"], "dialogue")
	eq(s.sim.report["smalltalkAvoided"], 0.0)
	return true
