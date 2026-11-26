extends TestCase

## sim 계층 시험 (웹 판 tests/sim.test.ts에서 옮김). 규칙 검증은 고정 설정, 데이터 검증은 실제 /data

var game := DataLoader.load_config("ko")

## 테스트용 고정 설정 (데이터 수치가 바뀌어도 규칙 검증은 유지)
var energy := {
	"battery": {"max": 100, "start": 100, "outdoorDrainPerSec": 0.05, "safeRecoverPerSec": 1, "tiers": {"tired": 69, "danger": 39, "critical": 14}},
	"psyche": {
		"max": 100,
		"gain": {"ambush": 2, "encounter": 2, "continuous": 2, "rumination": 2},
		"hitEnergy": 0.5,
		"drain": {"tension": 1, "stress": 1, "panic": 1, "meltdown": 2},
		"decay": {"tension": 2, "stress": 2, "panic": 2},
		"decayDelaySec": {"tension": 0.5, "stress": 0.5, "panic": 0.5},
		"meltdown": {"threshold": 60, "risePerSec": 5, "decayPerSec": 1},
		"symptomFrom": 60,
	},
}
var table := {
	"call": {"kind": "ambush", "channel": "auditory", "damage": 30},
	"talk": {"kind": "encounter", "channel": "social", "damage": 10},
	"crowd": {"kind": "continuous", "channel": "auditory", "ratePerSec": 0.3},
	"kick": {"kind": "rumination", "channel": "social", "ratePerSec": 0.5, "durationSec": 20},
	"awkwardSilence": {"kind": "continuous", "channel": "social", "ratePerSec": 1},
}
var quiet := {"outdoor": false, "inSafe": false, "modifiers": EnergyModel.NO_MODIFIERS}


func sim_cfg() -> Dictionary:
	var c := DataLoader.sim_config_of(game)
	c["energy"] = energy
	return c


func run(sim: Simulation, seconds: float, input: Dictionary = quiet) -> void:
	var dt := 1.0 / 60.0
	for i in roundi(seconds / dt):
		sim.step(dt, input)


func with(base: Dictionary, extra: Dictionary) -> Dictionary:
	var d := base.duplicate()
	d.merge(extra, true)
	return d


# ── StimulusBus

func test_bus_ambush_once() -> bool:
	var bus := StimulusBus.new(table)
	bus.emit("call")
	var r := bus.tick(1.0 / 60.0)
	eq(r["hits"].size(), 1)
	eq(r["hits"][0]["amount"], 30.0)
	eq(r["ambushes"], ["call"])
	eq(bus.tick(1.0 / 60.0)["hits"].size(), 0)
	return true


func test_bus_scale_continuous_rumination() -> bool:
	var bus := StimulusBus.new(table)
	bus.emit("talk", "x", 0.7)
	near(bus.tick(1)["hits"][0]["amount"], 7)
	bus.set_continuous("zone:lobby", "crowd", 2)
	near(bus.tick(1)["hits"][0]["amount"], 0.6)
	near(bus.continuous_rate(func(k): return k.begins_with("zone:")), 0.6)
	bus.clear_continuous("zone:")
	eq(bus.tick(1)["hits"].size(), 0)
	bus.emit("kick")
	var total := 0.0
	for i in 30:
		for h in bus.tick(1)["hits"]:
			total += h["amount"]
	near(total, 10)
	bus.emit("kick")
	eq(bus.clear_ruminations(), 1)
	eq(bus.active_ruminations(), 0)
	return true


# ── EnergyModel

func test_energy_tiers() -> bool:
	var t: Dictionary = energy["battery"]["tiers"]
	var got := []
	for b in [100, 70, 69, 40, 39, 15, 14, 1, 0]:
		got.append(EnergyModel.tier_of(b, t))
	eq(got, ["stable", "stable", "tired", "tired", "danger", "danger", "critical", "critical", "burnout"])
	return true


func test_energy_moods_from_hits() -> bool:
	var e := EnergyModel.new(energy)
	var jolt := e.apply_hits([{"stimulusId": "call", "kind": "ambush", "channel": "auditory", "amount": 20.0}], {"auditory": 0.5, "visual": 1, "social": 1})
	near(jolt, 5)
	near(e.mood("panic"), 20)
	e.apply_hits([{"stimulusId": "talk", "kind": "encounter", "channel": "social", "amount": 10.0}])
	near(e.mood("tension"), 20)
	e.apply_hits([{"stimulusId": "noise", "kind": "continuous", "channel": "auditory", "amount": 5.0}])
	near(e.mood("stress"), 10)
	return true


func test_energy_drain_and_meltdown() -> bool:
	var e := EnergyModel.new(energy)
	e.debug_set({"tension": 50})
	near(e.drain_per_sec, 0.5)
	var before := e.battery
	e.tick(0.1, {"outdoor": false, "inSafe": false})
	near(before - e.battery, 0.05, 2)
	var m := EnergyModel.new(energy)
	m.debug_set({"tension": 90, "stress": 90})
	m.add_mood("tension", 0, true)
	m.add_mood("stress", 0, true)
	m.tick(1, {"outdoor": false, "inSafe": false})
	gt(m.mood("meltdown"), 4)
	var one := EnergyModel.new(energy)
	one.debug_set({"tension": 90})
	one.tick(1, {"outdoor": false, "inSafe": false})
	eq(one.mood("meltdown"), 0.0)
	return true


func test_energy_revive_outdoor_safe_burnout() -> bool:
	var e := EnergyModel.new(energy)
	e.debug_set({"battery": 0, "panic": 80})
	ok(e.burned_out)
	e.revive(35)
	eq(e.battery, 35.0)
	eq(e.psyche_load, 0.0)
	var o := EnergyModel.new(energy)
	o.tick(100, {"outdoor": true, "inSafe": false})
	near(o.battery, 95)
	o.tick(3, {"outdoor": true, "inSafe": true})
	near(o.battery, 98)
	o.start_day(80)
	eq(o.battery, 80.0)
	o.tick(100, {"outdoor": false, "inSafe": false, "extraRecoverPerSec": 1})
	eq(o.battery, 80.0)
	var b := EnergyModel.new(energy)
	b.apply_hits([{"stimulusId": "x", "kind": "ambush", "channel": "social", "amount": 500.0}])
	ok(b.burned_out)
	b.tick(10, {"outdoor": false, "inSafe": true})
	eq(b.recover(50), 0.0)
	eq(b.battery, 0.0)
	return true


# ── Simulation

func test_simulation_events() -> bool:
	var sim := Simulation.new(sim_cfg(), table)
	for i in 3:
		sim.bus.emit("call")
		run(sim, 0.1)
	var types := []
	for e in sim.drain_events():
		types.append("%s->%s" % [e["from"], e["to"]] if e["type"] == "tierChanged" else e["type"])
	ok(types.has("stable->tired"), "stable->tired")
	ok(types.has("ambush"), "ambush")
	sim.bus.set_continuous("npc", "crowd", 100)
	run(sim, 90)
	eq(sim.drain_events().filter(func(e): return e["type"] == "burnout").size(), 1)
	return true


func test_simulation_awkward_silence() -> bool:
	var sim := Simulation.new(sim_cfg(), table)
	run(sim, 10, with(quiet, {"awkwardPair": true}))
	near(sim.snapshot()["awkwardness"], 10, 0)
	near(sim.report["silenceSec"], 10, 0)
	gt(sim.snapshot()["tension"], 15)
	lt(sim.snapshot()["battery"], 99.5)
	return true


func test_simulation_earphones_with_real_data() -> bool:
	var plain := Simulation.new(DataLoader.sim_config_of(game), game["stimuli"])
	var ear := Simulation.new(DataLoader.sim_config_of(game), game["stimuli"])
	for s in [plain, ear]:
		s.bus.set_continuous("crowd", "crowd", 2)
	run(plain, 30)
	run(ear, 30, with(quiet, {"modifiers": {"auditory": 0.5, "visual": 1.0, "social": 1.0}}))
	lt(100 - ear.snapshot()["battery"], (100 - plain.snapshot()["battery"]) * 0.6)
	return true


# ── SomaticController

func somatic_base(extra: Dictionary) -> Dictionary:
	return with({"tension": 0.0, "stress": 0.0, "panic": 0.0, "gazeCount": 0, "continuousExposure": false, "coveringCheeks": false, "eyesClosed": false, "flushRiseScale": 1.0, "sanctuary": false}, extra)


func test_somatic_flush() -> bool:
	var s := SomaticController.new(DataLoader.sim_config_of(game)["somatic"])
	var base := somatic_base({"tension": 80.0, "gazeCount": 4})
	for i in 60 * 8:
		s.step(1.0 / 60.0, base)
	gt(s.intensity("flush"), 0.5)
	var high := s.intensity("flush")
	for i in 60 * 3:
		s.step(1.0 / 60.0, with(base, {"gazeCount": 0, "coveringCheeks": true}))
	lt(s.intensity("flush"), high - 0.3)
	return true


func test_somatic_migraine() -> bool:
	var cfg: Dictionary = DataLoader.sim_config_of(game)["somatic"]
	var calm := SomaticController.new(cfg)
	for i in 120:
		calm.step(1, somatic_base({"stress": 20.0, "continuousExposure": true}))
	ok(not calm.active("migraine"), "스트레스가 낮으면 두통 없음")
	var s := SomaticController.new(cfg)
	var base := somatic_base({"stress": 65.0, "continuousExposure": true})
	for i in 59:
		s.step(1, base)
	ok(not s.active("migraine"), "59초엔 아직")
	for i in 20:
		s.step(1, base)
	ok(s.active("migraine"), "60초 넘으면 두통")
	s.relieve("migraine", 0.5)
	lt(s.intensity("migraine"), 0.1)
	return true


func test_somatic_stutter_sweat_clear() -> bool:
	var s := SomaticController.new(DataLoader.sim_config_of(game)["somatic"])
	var base := somatic_base({"stress": 85.0, "panic": 85.0})
	s.step(0.1, base)
	ok(s.active("stutter"))
	for i in 400:
		s.step(0.1, base)
	gt(s.intensity("sweat"), 0.5)
	ok(s.slips(0.01))
	s.clear_all()
	ok(not (s.active("sweat") or s.active("stutter") or s.active("flush")))
	return true


# ── DialogueBattle

var pool := {
	"greeting": {"text": "안녕", "kind": "opening", "durationSec": 2},
	"lines": [{"text": "질문?", "kind": "question", "durationSec": 2}],
	"flushRemark": {"text": "얼굴 빨개요", "kind": "remark", "durationSec": 2},
	"closers": {"satisfied": "s", "parried": "p", "endured": "e", "sos": "sos", "awkward": "a"},
}
var frame := {"smiling": true, "stutter": false, "flushRemarkable": false}


func opts(extra: Dictionary = {}) -> Dictionary:
	return with({"minDurationSec": 0, "baseDurationSec": 30, "ally": false, "rng": func(): return 0.5}, extra)


func test_dialogue_parry_and_wrong() -> bool:
	var rules: Dictionary = game["dialogueRules"]
	var b := DialogueBattle.new(rules, pool, opts())
	b.update(1.75, frame)
	ok(b.in_window(), "윈도우 안")
	b.respond("exit")
	eq(b.outcome, "parried")
	var w := DialogueBattle.new(rules, pool, opts())
	w.update(0.5, frame)
	w.respond("exit")
	ok(not w.ended())
	eq(w.wrong_count, 1)
	near(w.remaining_sec(), 30 + 10 - 0.5)
	var st := DialogueBattle.new(rules, pool, opts())
	st.update(1.7, with(frame, {"stutter": true}))
	ok(not st.in_window(), "말더듬이면 윈도우 절반")
	return true


func test_dialogue_satisfy_smile_boss_sos_remark() -> bool:
	var rules: Dictionary = game["dialogueRules"]
	var b := DialogueBattle.new(rules, pool, opts())
	for i in 30:
		if b.ended():
			break
		b.update(float(b.current_line()["durationSec"]) - 0.1, frame)
		b.respond("answer" if b.current_line()["kind"] == "question" else "nod")
		b.update(0.2 + float(rules["gapSec"]), frame)
	eq(b.outcome, "satisfied")
	var c := DialogueBattle.new(rules, pool, opts())
	c.respond("nod")
	var before := c.satisfaction
	c.update(1, with(frame, {"smiling": false}))
	lt(c.satisfaction, before)
	var boss := DialogueBattle.new(rules, pool, opts({"minDurationSec": 60}))
	boss.update(1.75, frame)
	boss.respond("exit")
	ok(not boss.ended(), "보스는 최소 시간 전엔 못 끝냄")
	var sos := DialogueBattle.new(rules, pool, opts())
	sos.request_sos()
	for i in 11:
		sos.update(1, frame)
	eq(sos.outcome, "sos")
	eq(sos.wrong_count, 0)
	var r := DialogueBattle.new(rules, pool, opts({"rng": func(): return 0.0}))
	r.update(2.01, with(frame, {"flushRemarkable": true}))
	r.update(float(rules["gapSec"]) + 0.01, with(frame, {"flushRemarkable": true}))
	ok(r.drain_events().any(func(e): return e["type"] == "flushRemark"), "홍조 지적")
	return true


# ── SpeechChallenge · LifeStats · Phone · DayCycle

func test_speech() -> bool:
	var s := SpeechChallenge.new({"beatSec": 1, "zoneCenter": 0.7, "zoneWidth": 0.2}, ["하나", "둘"])
	s.update(0.7, false)
	s.press()
	s.update(1.01, false)
	ok(s.done())
	eq(s.hits, 1)
	eq(s.misses, 1)
	eq(SpeechChallenge.stutter_text("회의"), "회, 회… 회의")
	return true


func test_escalation_and_settlement() -> bool:
	var life := LifeStats.new(game["life"]["stats"])
	var landlord: Dictionary = game["life"]["contacts"]["landlord"]
	eq(Phone.apply_contact_outcome("landlord", landlord, "declined", life)["escalation"], "")
	Phone.apply_contact_outcome("landlord", landlord, "missed", life)
	eq(Phone.apply_contact_outcome("landlord", landlord, "declined", life)["escalation"], "doorbell")
	Phone.apply_contact_outcome("landlord", landlord, "answered", life)
	eq(life.avoid_count("landlord"), 0)
	var st: Dictionary = game["life"]["settlement"]
	var l2 := LifeStats.new(game["life"]["stats"])
	var money := l2.money
	DayCycle.settle_day(st, l2, {})
	eq(l2.money, money - float(st["dailyCost"]["money"]))
	l2.add_money(-l2.money)
	var before := l2.get_stat("essentials")
	var lines := DayCycle.settle_day(st, l2, {})
	ok(lines.any(func(x): return x["key"] == "settle.daily.unpaid"))
	lt(l2.get_stat("essentials"), before + float(st["dailyDecay"].get("essentials", 0)) + 1)
	return true


func test_phone() -> bool:
	var phone := Phone.new({"ringSec": 5, "replyWaitSec": 10, "maxVisible": 4})
	phone.receive_call("boss", "k")
	phone.update(6)
	var kinds := []
	for e in phone.drain_events():
		kinds.append(e["how"] if e["type"] == "callResolved" else e["type"])
	eq(kinds, ["ring", "missed"])
	phone.receive_call("mom", "k")
	phone.text_instead()
	ok(phone.waiting_reply())
	phone.update(11)
	ok(not phone.waiting_reply())
	var p2 := Phone.new({"ringSec": 5, "replyWaitSec": 10, "maxVisible": 4})
	p2.receive_message("friend", "k")
	p2.drain_events()
	p2.end_day()
	var ev: Dictionary = p2.drain_events()[0]
	eq(ev["type"], "messageResolved")
	eq(ev["how"], "unread")
	return true


func test_day_cycle() -> bool:
	var c := GameClock.new(DayCycle.parse_time("08:59"))
	c.advance(1, 1)
	eq(c.label(), "09:00")
	var night: Dictionary = game["life"]["night"]
	var good := DayCycle.night_recovery(night, {"stressAtBed": 0, "ruminations": 0, "hobbyDone": true, "bedMinutes": DayCycle.parse_time("22:00"), "housing": 60, "essentials": 60})
	var bad := DayCycle.night_recovery(night, {"stressAtBed": 80, "ruminations": 3, "hobbyDone": false, "bedMinutes": DayCycle.parse_time("25:00"), "housing": 10, "essentials": 10})
	eq(good["nextMax"], float(night["baseMax"]))
	lt(bad["nextMax"], 80)
	ok(bad["nextMax"] >= float(night["minMax"]))
	var calm := {"stressAtBed": 0, "ruminations": 0, "hobbyDone": false, "bedMinutes": DayCycle.parse_time("22:00"), "housing": 60, "essentials": 60}
	var wf: Dictionary = night["weekFatigue"]
	eq(DayCycle.night_recovery(night, with(calm, {"daysLived": wf["startAfterDay"]}))["nextMax"], float(night["baseMax"]))
	eq(DayCycle.night_recovery(night, with(calm, {"daysLived": float(wf["startAfterDay"]) + 2}))["nextMax"], float(night["baseMax"]) - float(wf["perDay"]) * 2)
	eq(DayCycle.night_recovery(night, calm)["nextMax"], float(night["baseMax"]))
	var life := LifeStats.new(game["life"]["stats"])
	var lines := DayCycle.settle_day(game["life"]["settlement"], life, {"weeklyEval": true, "monthEnd": true})
	ok(lines.any(func(x): return x["key"] == "settle.month.unpaid"))
	var pay: Dictionary = game["life"]["settlement"]["payday"]
	eq(DayCycle.salary_of(game["life"]["settlement"], life), roundf(float(pay["salaryBase"]) + life.get_stat("income") * float(pay["salaryPerIncome"])))
	return true


# ── Reputation

func test_reputation() -> bool:
	var r := Reputation.new(game["reputation"])
	var person := r.person_of_npc("neighbor")
	ok(person != "", "옆집 NPC가 사람에 연결됨")
	var before := r.get_value(person)
	r.change(person, 10)
	eq(r.get_value(person), minf(100.0, before + 10))
	eq(r.changed_today()[person], r.get_value(person) - before)
	ok(r.ease(person) > r.ease("") - 1)
	r.new_day()
	eq(r.changed_today().size(), 0)
	return true


# ── 데이터: 한·영 텍스트 키가 같다 (웹 판 테스트에서 옮김)

func test_text_tables_match() -> bool:
	var ko: Dictionary = DataLoader.read_json("res://data/text/ko.json")
	var en: Dictionary = DataLoader.read_json("res://data/text/en.json")
	var missing := ko.keys().filter(func(k): return not en.has(k))
	var extra := en.keys().filter(func(k): return not ko.has(k))
	eq(missing, [], "영어 표에 없는 키")
	eq(extra, [], "한국어 표에 없는 키")
	return true
