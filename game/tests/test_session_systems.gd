extends SessionCase

## 회복·관계·생활 시스템의 GameSession 시험
## 웹 판 tests/items.test.ts · lifeWhy.test.ts · perks.test.ts · quietFavors.test.ts · rapport.test.ts
## · reputation.test.ts · restSpots.test.ts · talkStyle.test.ts


# ── 먹는 아이템 (items.test.ts)

func _outside(items: Array) -> GameSession:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.clock.minutes = DayCycle.parse_time("11:00")
	put(s, 150, 58)
	for id in items:
		s.player.inventory["consumables"][id] = 1
	step(s, 0.1)
	return s


func _use(s: GameSession, id: String) -> void:
	press(s, {"useItem": s.bag_slots().find(id)})


func test_items_energy_shot() -> bool:
	var s := _outside(["energyShot"])
	s.sim.energy.debug_set({"battery": 50})
	_use(s, "energyShot")
	gt(s.sim.energy.battery, 65)
	return true


func test_items_calm_jelly() -> bool:
	var plain := _outside([])
	var jelly := _outside(["calmJelly"])
	_use(jelly, "calmJelly")
	step(jelly, 3.2)
	step(plain, 3.2)
	for s in [plain, jelly]:
		s.sim.energy.debug_set({"stress": 50})
		step(s, 2)
	lt(jelly.sim.energy.mood("stress"), plain.sim.energy.mood("stress") - 2.5)
	return true


func test_items_tough_vitamin() -> bool:
	var plain := _outside([])
	var tough := _outside(["toughVitamin"])
	_use(tough, "toughVitamin")
	for s in [plain, tough]:
		s.sim.energy.debug_set({"tension": 0, "stress": 0, "panic": 0})
		s.sim.bus.emit("voiceCall")
		s.step(DT, GameSession.NO_CONTROLS)
	var sum := func(s: GameSession) -> float: return s.sim.energy.mood("tension") + s.sim.energy.mood("stress") + s.sim.energy.mood("panic")
	lt(sum.call(tough), sum.call(plain) * 0.7)
	return true


func test_items_vanish() -> bool:
	var s := _outside(["vanish"])
	var t := s.clock.minutes
	_use(s, "vanish")
	ok(s.at_home(), "집")
	ok(s.sanctuary(), "잠근 집")
	lt(s.clock.minutes - t, 1)
	eq(s.player.inventory["consumables"]["vanish"], 1)
	put(s, 150, 58)
	step(s, 0.1)
	_use(s, "vanish")
	ok(not s.at_home(), "하루 한 번")
	return true


# ── 생활 지표 변화의 이유 (lifeWhy.test.ts)

func test_life_why_late() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.drain_fx()
	s.clock.minutes = DayCycle.parse_time("09:00")
	s.step(DT, GameSession.NO_CONTROLS)
	var late: Variant = null
	for c in s.sim.life.ledger:
		if c["why"] == "late":
			late = c
			break
	ok(late != null, "지각 기록")
	eq(late["stat"], "income")
	lt(late["delta"], 0)
	ok(s.life_why_text(late).contains(cfg["text"]["obj.commute"]))
	ok(toast_keys(s.drain_fx()).has("why.toast.down"), "알림")
	return true


func test_life_why_who() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.phone.receive_message("boss", "phone.boss.meeting")
	s.step(DT, GameSession.NO_CONTROLS)
	s.phone.read_ignore(s.phone.messages[-1]["id"])
	s.step(DT, GameSession.NO_CONTROLS)
	var c: Variant = null
	for x in s.sim.life.ledger:
		if x["why"] == "phone.readIgnored":
			c = x
			break
	ok(c != null)
	eq(c["who"], "boss")
	ok(s.life_why_text(c).contains(cfg["text"]["contact.boss"]))
	return true


func test_life_why_cleared() -> bool:
	var s := GameSession.new(cfg)
	s.sim.life.apply({"income": -5}, "late", "obj.commute")
	s.start_day(1)
	eq(s.sim.life.ledger, [])
	return true


func _at_desk() -> GameSession:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	for id in ["mgmtCall", "commute", "meeting"]:
		s.objectives.get_objective(id)["done"] = true
	var desk := interactable("officeDesk")
	put(s, float(desk["at"][0]), float(desk["at"][1]))
	s.step(DT, GameSession.NO_CONTROLS)
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "work")
	return s


func test_work_pings_by_sender() -> bool:
	var s := _at_desk()
	for i in 60 * 40:
		s.step(DT, GameSession.controls({"smile": true}))
	var missed: Array = s.sim.life.ledger.filter(func(c): return c["why"] == "workPingIgnored")
	gt(missed.size(), 0, "놓친 메신저")
	for c in missed:
		ok(["boss", "work.from.hr"].has(c["who"]), "단톡 잡담은 괜찮다: %s" % c["who"])
	for c in missed:
		if c["who"] == "boss":
			ok(s.life_why_text(c).contains(cfg["text"]["contact.boss"]))
			break
	return true


func test_work_idle_hint() -> bool:
	var s := _at_desk()
	for i in 60 * 3:
		s.step(DT, GameSession.NO_CONTROLS)
	ok(s.mode["kind"] == "work" and s.mode["idle"] > 2.5, "일이 멈춰 있다")
	return true


# ── 내향인의 기술 (perks.test.ts)

func _to_night(s: GameSession) -> void:
	press(s, {"confirm": true})
	var bed := interactable_kind("bed")
	put(s, float(bed["at"][0]), float(bed["at"][1]))
	s.step(DT, GameSession.NO_CONTROLS)
	press(s, {"interactPressed": true})


func test_perks_choose() -> bool:
	var s := GameSession.new(cfg, {}, {"vacation": true})
	_to_night(s)
	eq(s.mode["kind"], "night")
	var choices: Array = s.mode["perkChoices"]
	eq(choices.size(), int(cfg["perks"]["offer"]))
	press(s, {"useItem": 1})
	ok(s.perks.has(choices[1]), "익힘")
	# 한 밤에 하나만
	press(s, {"useItem": 0})
	eq(s.perks.size(), 1)
	press(s, {"confirm": true})
	ok(GameSession.new(cfg, s.save_state()).perks.has(choices[1]), "저장")
	return true


func test_perks_effects() -> bool:
	var s := GameSession.new(cfg)
	s.perks["stealthStep"] = true
	s.perks["graceExit"] = true
	near(s.perk_mul("noticeScale"), 0.85)
	near(s.perk_add("parryBonusSec"), 0.15)
	eq(s.perk_mul("walkScale"), 1.0)
	s.start_day(0)
	near(npc(s, "neighbor").warmth, s.reputation.warmth("neighbor") * 0.85)
	var v := GameSession.new(cfg, {}, {"vacation": true})
	v.perks["stealthStep"] = true
	_to_night(v)
	ok(not (v.mode["perkChoices"] as Array).has("stealthStep"), "이미 가진 기술은 다시 나오지 않는다")
	return true


# ── 조용한 곳 도감·부탁 (quietFavors.test.ts)

func _stay(s: GameSession, id: String, seconds: float) -> void:
	var q := find_by_id(cfg["quietSpots"]["spots"], id)
	for i in int(floor(seconds / DT + 0.5)):
		put(s, float(q["at"][0]), float(q["at"][1]))
		s.step(DT, GameSession.NO_CONTROLS)


func test_quiet_found_and_calm() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.clock.minutes = DayCycle.parse_time("11:00")
	_stay(s, "farBank", 1)
	ok(not s.quiet_found.has("farBank"))
	_stay(s, "farBank", float(cfg["quietSpots"]["discoverSec"]) + 0.5)
	ok(s.quiet_found.has("farBank"), "도감에 오른다")
	# 같은 조건에서 조용한 곳 밖에 있던 사람과 비교
	var other := GameSession.new(cfg)
	press(other, {"confirm": true})
	other.clock.minutes = s.clock.minutes
	for g in [s, other]:
		g.sim.energy.debug_set({"stress": 40})
	_stay(s, "farBank", 2)
	for i in 120:
		put(other, 1080, 440)
		other.step(DT, GameSession.NO_CONTROLS)
	ok(s.quiet_here != null and s.quiet_here["id"] == "farBank")
	lt(s.sim.energy.mood("stress"), other.sim.energy.mood("stress") - 1)
	return true


func test_quiet_time_window_and_save() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.clock.minutes = DayCycle.parse_time("11:00")
	_stay(s, "nightBridge", float(cfg["quietSpots"]["discoverSec"]) + 1)
	ok(not s.quiet_found.has("nightBridge"), "낮에는 아니다")
	s.clock.minutes = DayCycle.parse_time("20:00")
	_stay(s, "nightBridge", float(cfg["quietSpots"]["discoverSec"]) + 1)
	ok(s.quiet_found.has("nightBridge"), "밤에")
	ok(GameSession.new(cfg, s.save_state()).quiet_found.has("nightBridge"), "저장")
	return true


func test_favor_flow() -> bool:
	# 씨앗이 있을 때만 부탁이 온다: 부탁이 오는 씨앗을 찾는다
	var s: GameSession = null
	var seed := 1
	while seed < 60 and s == null:
		var t := GameSession.new(cfg, {}, {"seed": seed, "vacation": true})
		if t.day["phone"].any(func(p): return p.get("textKey") == "favor.jiuIceCream.offer"):
			s = t
		seed += 1
	ok(s != null, "부탁이 오는 씨앗")
	if s == null:
		return true
	press(s, {"confirm": true})
	s.phone.receive_message("friend", "favor.jiuIceCream.offer")
	s.step(DT, GameSession.NO_CONTROLS)
	s.phone.reply(s.phone.messages[-1]["id"])
	s.step(DT, GameSession.NO_CONTROLS)
	ok(s.objectives.get_objective("favor_jiuIceCream") != null, "목표가 생긴다")
	var jiu := s.reputation.get_value("jiu")
	s.game_event("enter:riverKiosk")
	s.step(DT, GameSession.NO_CONTROLS)
	ok(s.objectives.is_done("favor_jiuIceCream"), "해냈다")
	gt(s.reputation.get_value("jiu"), jiu)
	eq(s.sim.report["favorsDone"], 1.0)
	return true


# ── 편한 사이·돈을 쓸 곳 (rapport.test.ts)

func _dialogue_with(person: float) -> DialogueBattle:
	var s := GameSession.new(cfg, {}, {"practiced": true})
	press(s, {"confirm": true})
	s.reputation.change("neighbor", person - s.reputation.get_value("neighbor"))
	s.start_dialogue(npc(s, "neighbor"), false)
	eq(s.mode["kind"], "dialogue")
	return s.mode["battle"]


func test_rapport_ease() -> bool:
	var warm := _dialogue_with(100)
	var mid := _dialogue_with(50)
	var hurt := _dialogue_with(0)
	gt(warm.window_sec(), mid.window_sec())
	lt(hurt.window_sec(), mid.window_sec())
	lt(warm.remaining_sec(), mid.remaining_sec())
	gt(hurt.remaining_sec(), mid.remaining_sec())
	return true


func test_rapport_warm_nod() -> bool:
	var always: Dictionary = cfg.duplicate()
	var rep: Dictionary = cfg["reputation"].duplicate()
	var talk: Dictionary = rep["talk"].duplicate()
	talk["nodChance"] = 1.0
	rep["talk"] = talk
	always["reputation"] = rep
	var s := GameSession.new(always)
	press(s, {"confirm": true})
	var neighbor := npc(s, "neighbor")
	ok(not s._warm_nod(neighbor), "아직 편한 사이가 아니다")
	s.reputation.change("neighbor", 100)
	s.sim.energy.add_mood("tension", 30, false)
	var tension := s.sim.energy.psyche_load
	s.drain_fx()
	ok(s._warm_nod(neighbor), "눈인사")
	lt(s.sim.energy.psyche_load, tension)
	ok(toast_keys(s.drain_fx()).has("toast.warmNod"))
	ok(not s._warm_nod(neighbor), "하루 한 번")
	eq(s.sim.report["smalltalkAvoided"], 0.0)
	return true


func test_money_expense() -> bool:
	var s := GameSession.new(cfg, {}, {"seed": 1})
	var vet := find_by_id(cfg["happenings"]["list"], "catVet")
	s.happenings = [vet]
	var money := s.sim.life.money
	s.drain_fx()
	press(s, {"confirm": true})
	# 첫날은 월급날: 급여가 먼저 들어온 뒤 지출이 나간다
	var salary := DayCycle.salary_of(cfg["life"]["settlement"], s.sim.life) if s.day["flags"].get("payday", false) else 0.0
	eq(s.sim.life.money, money + salary - float(vet["expense"]["money"]))
	ok(toast_keys(s.drain_fx()).has(vet["expense"]["toastKey"]))
	return true


func test_money_payday() -> bool:
	ok(cfg["days"][0]["flags"].get("payday", false))
	ok(cfg["days"][-1]["flags"].get("monthEnd", false))
	var s := GameSession.new(cfg)
	var money := s.sim.life.money
	press(s, {"confirm": true})
	eq(s.sim.life.money, money + DayCycle.salary_of(cfg["life"]["settlement"], s.sim.life))
	gt(s.sim.life.money, cfg["life"]["settlement"]["monthEnd"]["rent"])
	# 다시 해도 두 번 받지 않는다 (아침 기록으로 돌아간 뒤 다시 받음)
	s.retry_day()
	press(s, {"confirm": true})
	eq(s.sim.life.money, money + DayCycle.salary_of(cfg["life"]["settlement"], s.sim.life))
	return true


func test_money_gear_effects() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	var before := s.perk_mul("earphoneScale")
	s._owned_gear["ncEarbuds"] = true
	near(s.perk_mul("earphoneScale"), before * 0.75)
	ok(cfg["world"]["interactables"].any(func(i): return i["kind"] == "shop" and i.get("shop") == "deptLiving"))
	for g in cfg["items"]["gear"]:
		if g.get("effects") == null:
			continue
		var sold := false
		for sh in cfg["items"]["shops"].values():
			for e in sh["stock"]:
				if e["item"] == g["id"] and float(e["price"]) > 0:
					sold = true
		ok(sold, g["id"])
	return true


func test_money_delivery() -> bool:
	var shop: Dictionary = cfg["items"]["shops"]["homeDelivery"]
	ok(cfg["world"]["interactables"].any(func(i): return i["kind"] == "shop" and i.get("shop") == "homeDelivery"))
	for st in shop["stock"]:
		gt(st["price"], 5000)
		gt(find_by_id(cfg["items"]["consumables"], st["item"])["effects"]["battery"], 0)
	return true


func _in_home_district(at: Array) -> bool:
	return float(at[0]) < 340 and float(at[1]) < 140


func test_city_wednesday_gift() -> bool:
	var idx := day_index("dayWed")
	var gift := find_by_id(cfg["days"][idx]["objectives"], "gift")
	ok(not _in_home_district(interactable(gift["marker"])["at"]), "도심")
	ok(gift.has("closes"))
	lt(gift["missed"]["bond"], 0)

	var s := GameSession.new(cfg)
	s.start_day(idx)
	press(s, {"confirm": true})
	for o in s.objectives.list:
		if o["def"]["id"] == "commute" or o["def"]["id"] == "work":
			o["done"] = true
	var at: Array = interactable("deptGift")["at"]
	put(s, float(at[0]), float(at[1]))
	for i in 6:
		s.step(DT, GameSession.NO_CONTROLS)
	var money := s.sim.life.money
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "speech")
	speak_through(s, 40)
	ok(s.objectives.is_done("gift"), "선물")
	eq(s.sim.life.money, money - float(cfg["speeches"]["giftWrap"]["grant"]["price"]))
	return true


func test_city_saturday_river() -> bool:
	var day4: Dictionary = find_by_id(cfg["days"], "day4")
	var friend := find_by_id(day4["npcs"], "friend")
	var spawn: Array = cfg["world"]["spawns"][friend["at"]]
	ok(not _in_home_district(spawn))
	var area := find_by_id(cfg["world"]["areas"], find_by_id(day4["objectives"], "friend")["marker"])
	var r: Array = area["rect"]
	lt(Vector2(float(r[0]) + float(r[2]) / 2 - float(spawn[0]), float(r[1]) + float(r[3]) / 2 - float(spawn[1])).length(), 20)
	return true


# ── 사람들의 인상 (reputation.test.ts)

func test_reputation_phone() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	var boss := s.reputation.get_value("boss")
	s.phone.receive_message("boss", "phone.boss.meeting")
	s.step(DT, GameSession.NO_CONTROLS)
	s.phone.read_ignore(s.phone.messages[-1]["id"])
	s.step(DT, GameSession.NO_CONTROLS)
	var d := float(cfg["reputation"]["phone"]["readIgnored"])
	eq(s.reputation.get_value("boss"), boss + d)
	eq(s.reputation.changed_today()["boss"], d)
	return true


func test_reputation_moments() -> bool:
	var s := GameSession.new(cfg)
	s.game_event("done:meeting")
	gt(s.reputation.get_value("boss"), cfg["reputation"]["start"])
	s.game_event("leave")
	var ev: Dictionary = cfg["reputation"]["events"]
	eq(s.reputation.changed_today()["team"], float(ev["done:meeting"]["team"]) + float(ev["leave"]["team"]))
	return true


func test_reputation_warmth_retry() -> bool:
	var s := GameSession.new(cfg)
	s.reputation.change("neighbor", 20)
	s.retry_day()
	eq(s.reputation.get_value("neighbor"), float(cfg["reputation"]["start"]))
	near(npc(s, "neighbor").warmth, s.reputation.warmth("neighbor"))
	return true


# ── 쉼터와 시간의 값 (restSpots.test.ts)

func _office(time: String) -> GameSession:
	var s := GameSession.new(cfg, {}, {"practiced": true})
	press(s, {"confirm": true})
	s.day["phone"].clear()
	s.phone.call = null
	s.home_locked = false
	s.clock.minutes = DayCycle.parse_time(time)
	return s


func _stall() -> Dictionary:
	return find_by_id(cfg["world"]["safes"], "officeStall1")


func _lock_stall(s: GameSession) -> void:
	var r: Array = _stall()["rect"]
	put(s, float(r[0]) + float(r[2]) / 2, float(r[1]) + float(r[3]) / 2)
	step(s, 0.2)
	press(s, {"interactPressed": true})
	ok(s.player.locked_safe != null and s.player.locked_safe["id"] == "officeStall1", "칸을 잠갔다")


func test_rest_stall_until_knock() -> bool:
	var s := _office("12:00")
	var after := float(_stall()["noiseAfterSec"])
	s.sim.energy.debug_set({"battery": 40})
	_lock_stall(s)
	step(s, after - 1)
	var at_knock: float = s.snapshot()["battery"]
	gt(at_knock - 40, float(cfg["balance"]["battery"]["safeRecoverPerSec"]) * (after - 1) * 0.8)
	step(s, 30, {"spacePressed": false})
	ok(s.snapshot()["battery"] <= at_knock + 0.5, "노크 뒤로는 차지 않는다")
	return true


func test_rest_stall_reuse() -> bool:
	var s := _office("12:00")
	s.sim.energy.debug_set({"battery": 40})
	_lock_stall(s)
	step(s, 10)
	press(s, {"interactPressed": true})
	ok(s.player.locked_safe == null)
	var b: float = s.snapshot()["battery"]
	_lock_stall(s)
	step(s, 10)
	ok(s.snapshot()["battery"] <= b + 0.1, "방금 쉰 칸")
	press(s, {"interactPressed": true})
	s.clock.minutes += float(cfg["balance"]["safe"]["reuseMin"])
	var b2: float = s.snapshot()["battery"]
	_lock_stall(s)
	step(s, 10)
	gt(s.snapshot()["battery"], b2 + 2, "reuseMin 뒤에는 다시")
	return true


func test_desk_away() -> bool:
	var s := _office("11:00")
	s.objectives.get_objective("commute")["done"] = true
	var income := s.sim.life.get_stat("income")
	var every := float(cfg["balance"]["deskAway"]["everyMin"])
	# 사무실 안
	var desk := interactable("officeDesk")
	put(s, float(desk["at"][0]), float(desk["at"][1]) + 1)
	step(s, every + 5)
	eq(s.sim.life.get_stat("income"), income, "사무실 안")
	# 공원 (사무실 밖)
	put(s, 73.5, 32)
	step(s, every + 2)
	eq(s.sim.life.get_stat("income"), income + float(cfg["life"]["rewards"]["deskAway"].get("income", 0)), "자리 비움")
	eq(s.sim.life.ledger[-1]["why"], "deskAway")
	return true


func test_desk_away_outside_hours() -> bool:
	var s := _office("08:10")
	var income := s.sim.life.get_stat("income")
	put(s, 73.5, 32)
	step(s, float(cfg["balance"]["deskAway"]["everyMin"]) + 2)
	eq(s.sim.life.get_stat("income"), income)
	return true


# ── 말하는 방식 (talkStyle.test.ts)

func _talk_to(id: String) -> GameSession:
	var s := GameSession.new(cfg, {}, {"practiced": true})
	press(s, {"confirm": true})
	s.start_dialogue(npc(s, id), false)
	return s


func test_talk_style() -> bool:
	var rules: Dictionary = cfg["dialogueRules"]
	var boss := _talk_to("boss")
	var flyer := _talk_to("flyer")
	eq(boss.mode["kind"], "dialogue")
	near(boss.mode["battle"].window_sec(), float(rules["parryWindowSec"]) * 0.7)
	near(flyer.mode["battle"].window_sec(), float(rules["parryWindowSec"]) * 1.5)
	var greet := float(cfg["dialoguePools"]["boss"]["greeting"]["durationSec"])
	near(boss.mode["battle"].current_line()["durationSec"], greet / 0.8)
	return true


func test_talk_style_hints() -> bool:
	for p in cfg["npcProfiles"].values():
		var ts: Variant = p.get("talkStyle")
		if ts != null and ts.get("hintKey", "") != "":
			ok(cfg["text"].has(ts["hintKey"]), ts["hintKey"])
	return true
