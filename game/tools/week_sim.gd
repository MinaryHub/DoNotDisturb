class_name WeekSim
extends RefCounted

## 한 주 밸런스 시뮬레이션 (sim 계층만). 실제 data로 세 가지 플레이 방식을 돌려 본다. 웹 판 tools/lib/weekSim.ts
##   avoid    전부 회피: 전화·문자 무시, 대화 피함, 선택 목표 건너뜀 → 생활 지표가 무너져야 한다
##   accept   전부 수용: 모든 전화·문자·대화를 끝까지 → 배터리가 바닥나야 한다
##   balanced 적당히: 중요한 연락만 받고 나머지는 문자로, 대화 2번(짧게), 커피 1잔·집밥 → 한 주를 버텨야 한다
## skilled를 켜면 게임을 아는 플레이: 근무일엔 회사 화장실 칸에서 한 번 쉰다 (자리 비움으로 찾기 전까지만, 노크 전까지만).
##   (폰 보는 척은 같은 길을 걸으면 느려진 만큼 비용이 비슷해 따로 다루지 않는다: 실제 GameSession 측정)
## extras를 켜면 게임성 요소까지 쓴다: 밤마다 기술 하나(EXTRA_PERKS 순서), 하루 한 번 조용한 곳에서 60초, 부탁 하나
## 필수 상호작용은 세 방식 모두 수행한다. 이동·대화 시간은 대략값이다.
## 이야기 표지(data/story.json)도 게임처럼 남겨, 다음 날의 전화·목표가 플레이 방식에 따라 달라진다.
##
## opts = { commuteSec (하루 바깥 이동 시간, 출퇴근 합), crowd? (출퇴근 중 평균 군중 밀도, 기본 0.5), extras?, skilled? }
## → { failed: "" | "burnout" | "collapse", day, stat?, rows: [{ day, maxBattery, batteryEnd, talks, life, money }] }

const IMPORTANT := ["boss", "landlord", "mgmtOffice", "delivery"]
## 해오름동(손으로 만든 동네) 바깥에 표식이 있는 목표 = 도심 볼일
const HOME_DISTRICT := Vector2(340, 140)
## 도심 볼일(필수가 아닌 발화 목표, 예: 수요일 선물 포장)을 다녀오는 시간 (초, 지하철 인파 속)
const DOWNTOWN_TRIP_SEC := 60.0
const DOWNTOWN_CROWD := 0.5
## extras: 주간 시뮬레이션이 다룰 수 있는 기술을 이 순서로 밤마다 하나씩
const EXTRA_PERKS := ["deepSleep", "shortAnswers", "crowdIsland", "restMaster", "helper"]

var game: Dictionary
var opts: Dictionary
var sim: Simulation
var perks: Array = []


static func play_week(config: Dictionary, policy: String, options: Dictionary = {"commuteSec": 120.0}) -> Dictionary:
	var w := WeekSim.new()
	w.game = config
	w.opts = options
	return w._play(policy)


func _mul(key: String) -> float:
	var v := 1.0
	for e in perks:
		v *= float(e.get(key, 1.0))
	return v


func _add(key: String) -> float:
	var v := 0.0
	for e in perks:
		v += float(e.get(key, 0.0))
	return v


static func _steps(sec: float) -> int:
	return int(floor(sec * 60.0 + 0.5))


func _run(sec: float, outdoor: bool) -> void:
	var ctx := {"outdoor": outdoor, "inSafe": false, "modifiers": EnergyModel.NO_MODIFIERS}
	for i in _steps(sec):
		sim.step(1.0 / 60.0, ctx)


## 출퇴근: 거리 군중 속을 걷는다 (밀도만큼 군중 자극 + 긴장, 게임과 같은 규칙)
func _commute(sec: float, crowd: float) -> void:
	var cd: Dictionary = game["balance"]["crowdDensity"]
	var density := crowd * _mul("crowdScale")
	sim.bus.set_continuous("crowd", "crowd", density)
	var ctx := {"outdoor": true, "inSafe": false, "modifiers": EnergyModel.NO_MODIFIERS}
	for i in _steps(sec):
		sim.energy.add_mood("tension", (density * float(cd["stressPerSec"])) / 60.0, density >= float(cd["sustainFrom"]))
		sim.step(1.0 / 60.0, ctx)
	sim.bus.set_continuous("crowd", "crowd", 0.0)


func _encounter(stimulus: String, talk_sec: float) -> void:
	sim.bus.emit(stimulus)
	sim.bus.set_continuous("dialogue", "dialogue", _mul("dialogueDrainScale"))
	_run(talk_sec, true)
	sim.bus.set_continuous("dialogue", "dialogue", 0.0)
	_run(5, true)


func _speech_for(event: String) -> Variant:
	for s in game["speeches"].values():
		if s["objectiveEvent"] == event:
			return s
	return null


func _play(policy: String) -> Dictionary:
	sim = Simulation.new(DataLoader.sim_config_of(game), game["stimuli"])
	var crowd_default := float(opts.get("crowd", 0.5))
	var commute_sec := float(opts.get("commuteSec", 120.0))
	var extras: bool = opts.get("extras", false)
	var skilled: bool = opts.get("skilled", false)
	var rows: Array = []
	var next_max := float(game["balance"]["battery"]["start"])
	var story := {}
	for def in game["days"]:
		var day := Story.apply_story(def, story)
		var mark := func(event: String) -> void:
			for m in Story.marks_for(game["story"], event, day["id"]):
				Story.apply_mark(story, m)
		sim.start_day(next_max)
		if day.get("flags", {}).get("payday", false):
			sim.life.add_money(DayCycle.salary_of(game["life"]["settlement"], sim.life))
		var talks := 0
		_commute(commute_sec / 2.0, crowd_default)
		# 필수 상호작용
		var mandatory_calls := []
		for o in day["objectives"]:
			if o.get("mandatory", false) and String(o["on"]).begins_with("answered:"):
				mandatory_calls.append(String(o["on"]).split(":")[1])
		for o in day["objectives"]:
			var speech: Variant = _speech_for(o["on"])
			if o.get("mandatory", false) and speech != null:
				talks += 1
				_encounter(speech["stimulus"], 0.1)
				mark.call(o["on"])
				var nxt: Variant = game["speeches"].get(speech.get("next", "")) if speech.get("next", "") != "" else null
				if nxt != null:
					talks += 1
					_encounter(nxt["stimulus"], 0.1)
				if speech.get("rumination", false) or (nxt != null and nxt.get("rumination", false)):
					sim.bus.emit("rumination")
		# 도심 볼일 (해오름동 바깥의 필수 아닌 발화 목표): 피하면 놓친 대가, 아니면 다녀와서 말하고 값을 치른다
		for o in day["objectives"]:
			var speech: Variant = _speech_for(o["on"])
			var at: Variant = null
			for i in game["world"]["interactables"]:
				if i["id"] == o.get("marker"):
					at = i["at"]
					break
			var downtown: bool = at != null and (float(at[0]) >= HOME_DISTRICT.x or float(at[1]) >= HOME_DISTRICT.y)
			if speech == null or o.get("mandatory", false) or not downtown:
				continue
			if policy == "avoid":
				if o.get("missed") != null:
					sim.life.apply(o["missed"])
				continue
			_commute(DOWNTOWN_TRIP_SEC, DOWNTOWN_CROWD)
			talks += 1
			_encounter(speech["stimulus"], 0.1)
			if speech.get("grant") != null:
				sim.life.spend(float(speech["grant"]["price"]))
			mark.call(o["on"])
		# 전화·문자
		for ev in day["phone"]:
			var contact: Dictionary = game["life"]["contacts"][ev["contact"]]
			if contact.get("muted", false):
				continue
			var must: bool = mandatory_calls.has(ev["contact"])
			var important: bool = IMPORTANT.has(ev["contact"]) or contact.get("ally", false)
			var how := ""
			var call: bool = ev["kind"] == "call"
			if policy == "accept" or must:
				how = "answered" if call else "replied"
			elif policy == "avoid":
				how = "missed" if call else "unread"
			else:
				how = ("answered" if important else "texted") if call else ("replied" if important else "readIgnored")
			var out := Phone.apply_contact_outcome(ev["contact"], contact, how, sim.life)
			if how == "answered" or how == "replied":
				mark.call("%s:%s" % [how, ev["contact"]])
			if out["stimulus"] != "":
				sim.bus.emit(out["stimulus"])
			if how == "replied":
				sim.bus.emit("textMessage")
			if out["escalation"] != "":
				sim.bus.emit(out["escalation"])
			_run(2, true)
		# 말을 걸어오는 사람들
		var approachers: Array = day["npcs"].filter(func(n): return game["npcProfiles"][n["profile"]].get("approaches", false))
		if policy == "accept":
			for n in approachers:
				var p: Dictionary = game["npcProfiles"][n["profile"]]
				talks += 1
				_encounter(p["encounterStimulus"], float(p["baseDurationSec"]))
		if policy == "balanced":
			for n in approachers.slice(0, 2):
				talks += 1
				_encounter(game["npcProfiles"][n["profile"]]["encounterStimulus"], 12)
			var coffee := 0.0
			for c in game["items"]["consumables"]:
				if c["id"] == "coffee":
					coffee = float(c["effects"].get("battery", 0))
					break
			sim.energy.recover(coffee * _mul("restScale"))
		# 근무일 화장실 칸: 노크 전까지, 자리 비움으로 찾기 전까지만 (방금 쓴 칸은 다시 쉬어지지 않으니 하루 한 번)
		if skilled and day.get("work") != null:
			var stall_after := 0.0
			for sf in game["world"]["safes"]:
				if sf["kind"] == "stall":
					stall_after = float(sf["noiseAfterSec"])
					break
			var sec := minf(stall_after, float(game["balance"]["deskAway"]["everyMin"]) / float(game["balance"]["clock"]["minutesPerSecond"]) - 1)
			var ctx := {"outdoor": false, "inSafe": true, "modifiers": EnergyModel.NO_MODIFIERS}
			for i in _steps(sec):
				sim.step(1.0 / 60.0, ctx)
		# 업무: 일하는 동안 업무 스트레스, 끝나면 오후를 건너뛰고 지쳐서 퇴근
		if day.get("work") != null:
			var w: Dictionary = game["balance"]["work"]
			for i in 40:
				sim.energy.add_mood("stress", float(w["pressureStressPerSec"]) + (float(w["pendingPingStressPerSec"]) if i % 6 < 2 else 0.0), true)
				if i % 6 == 0:
					sim.bus.emit("workPing")
				_run(1, false)
			sim.life.apply(game["life"]["rewards"]["workDone"])
			sim.life.add_money(float(game["life"]["rewards"]["workPerTask"]) * float(day["work"]["tasks"]))
			sim.energy.recover(float(game["balance"]["recovery"]["workAfternoon"]))
			sim.energy.add_mood("stress", float(w["afternoonStress"]))
		_commute(commute_sec / 2.0, crowd_default)
		if extras:
			# 조용한 곳에서 60초 (아무도 보지 않는 자리), 부탁 하나
			var q: Dictionary = game["quietSpots"]["recovery"]
			var ctx := {"outdoor": true, "inSafe": false, "modifiers": EnergyModel.NO_MODIFIERS}
			for i in 60 * 60:
				sim.energy.calm((float(q["calmPerSec"]) * _mul("restScale")) / 60.0)
				sim.energy.recover((float(q["batteryPerSec"]) * _mul("restScale")) / 60.0)
				sim.step(1.0 / 60.0, ctx)
			var favors: Array = game["favors"]["list"]
			var favor: Dictionary = favors[rows.size() % favors.size()]
			if favor.get("life") != null:
				var delta := {}
				for k in favor["life"]:
					delta[k] = floor(float(favor["life"][k]) * _mul("favorScale") + 0.5)
				sim.life.apply(delta)
		# 선택 목표·장보기·집밥
		for o in day["objectives"]:
			if o.get("optional", false) and policy == "avoid" and o.get("skip") != null:
				sim.life.apply(o["skip"])
		if day["objectives"].any(func(o): return o.get("on") == "done:checkout") and policy != "avoid":
			sim.life.apply(game["life"]["rewards"]["groceries"])
		if policy != "accept":
			sim.energy.recover(float(game["balance"]["recovery"]["homeMeal"]) * _mul("restScale"))
			sim.life.apply({"essentials": game["life"]["rewards"]["homeMealEssentials"]})
		var battery_end := sim.energy.battery
		if sim.energy.burned_out:
			return {"failed": "burnout", "day": day["id"], "rows": rows}
		DayCycle.settle_day(game["life"]["settlement"], sim.life, day.get("flags", {}))
		rows.append({"day": day["id"], "maxBattery": next_max, "batteryEnd": battery_end, "talks": talks, "life": sim.life.all().duplicate(), "money": sim.life.money})
		var collapsed := sim.life.collapsed()
		if collapsed != "":
			return {"failed": "collapse", "day": day["id"], "stat": collapsed, "rows": rows}
		next_max = DayCycle.night_recovery(game["life"]["night"], {
			"stressAtBed": sim.energy.psyche_load,
			"ruminations": sim.bus.active_ruminations(),
			"hobbyDone": false,
			"bedMinutes": DayCycle.parse_time("22:00"),
			"housing": sim.life.get_stat("housing"),
			"essentials": sim.life.get_stat("essentials"),
			"daysLived": rows.size(),
		})["nextMax"]
		if extras:
			for k in game["perks"]["list"]:
				if perks.size() < EXTRA_PERKS.size() and k["id"] == EXTRA_PERKS[perks.size()]:
					perks.append(k["effects"])
					break
			next_max = minf(float(game["balance"]["battery"]["max"]), next_max + _add("nightMaxBonus"))
	return {"failed": "", "day": "all", "rows": rows}


## 행 찾기 (없으면 빈 Dictionary)
static func row(result: Dictionary, day_id: String) -> Dictionary:
	for r in result["rows"]:
		if r["day"] == day_id:
			return r
	return {}
