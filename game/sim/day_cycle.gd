class_name DayCycle
extends RefCounted

## 하루 사이클: 시각, 밤 회복(다음 날 배터리 상한), 정산 (CLAUDE.md 5.1, 5.4, 6)


## "08:10" → 490 (분)
static func parse_time(hhmm: String) -> float:
	var parts := hhmm.split(":")
	assert(parts.size() == 2, "시간 형식 오류: \"%s\" (HH:MM)" % hhmm)
	return float(int(parts[0]) * 60 + int(parts[1]))


static func format_time(minutes: float) -> String:
	var total := int(floor(minutes))
	return "%02d:%02d" % [(total / 60) % 24, total % 60]


## 밤 회복 결과로 다음 날 배터리 상한 → { nextMax, breakdown: [{ key, delta }] }
## input = { stressAtBed, ruminations, hobbyDone, bedMinutes, housing, essentials, daysLived? }
static func night_recovery(cfg: Dictionary, input: Dictionary) -> Dictionary:
	var breakdown := []
	var add := func(key: String, delta: float) -> void:
		if absf(delta) >= 0.5:
			breakdown.append({"key": key, "delta": roundf(delta)})
	add.call("night.stress", -float(input["stressAtBed"]) * float(cfg["stressPenaltyPerPoint"]))
	add.call("night.rumination", -float(input["ruminations"]) * float(cfg["ruminationPenalty"]))
	if input["hobbyDone"]:
		add.call("night.hobby", float(cfg["hobbyBonus"]))
	var late_hours := (float(input["bedMinutes"]) - parse_time(cfg["lateFrom"])) / 60.0
	if late_hours > 0:
		add.call("night.late", -late_hours * float(cfg["latePenaltyPerHour"]))
	if input["housing"] < cfg["housingLow"]:
		add.call("night.housing", -float(cfg["housingLowPenalty"]))
	if input["essentials"] < cfg["essentialsLow"]:
		add.call("night.essentials", -float(cfg["essentialsLowPenalty"]))
	if cfg.has("weekFatigue") and input.has("daysLived") and input["daysLived"] != null:
		var wf: Dictionary = cfg["weekFatigue"]
		add.call("night.weekFatigue", -maxf(0.0, float(input["daysLived"]) - float(wf["startAfterDay"])) * float(wf["perDay"]))
	var total := 0.0
	for b in breakdown:
		total += b["delta"]
	var base := float(cfg["baseMax"])
	return {"nextMax": maxf(float(cfg["minMax"]), minf(base, base + total)), "breakdown": breakdown}


## 월급날 아침에 들어오는 급여 (소득·업무 평판이 높을수록 많다)
static func salary_of(cfg: Dictionary, life: LifeStats) -> float:
	return roundf(float(cfg["payday"]["salaryBase"]) + life.get_stat("income") * float(cfg["payday"]["salaryPerIncome"]))


## 하루 끝 정산 → [{ key, stat?, delta?, money? }]. flags = { weeklyEval?, monthEnd? }
static func settle_day(cfg: Dictionary, life: LifeStats, flags: Dictionary) -> Array:
	var lines := []
	var decay: Dictionary = cfg["dailyDecay"]
	for stat in decay:
		var delta := float(decay[stat])
		if delta == 0:
			continue
		life.apply({stat: delta}, "settle.decay")
		lines.append({"key": "settle.decay.%s" % stat, "stat": stat, "delta": delta})
	var dc: Dictionary = cfg["dailyCost"]
	if float(dc["money"]) > 0:
		if life.spend(float(dc["money"])):
			lines.append({"key": "settle.daily.cost", "money": -float(dc["money"])})
		else:
			life.apply({"essentials": dc["unpaidEssentials"]}, "settle.unpaid")
			lines.append({"key": "settle.daily.unpaid", "stat": "essentials", "delta": float(dc["unpaidEssentials"])})
	if flags.get("weeklyEval", false):
		var w: Dictionary = cfg["weekly"]
		if life.get_stat("income") >= float(w["goodIncome"]):
			life.add_money(float(w["goodBonusMoney"]))
			lines.append({"key": "settle.weekly.good", "money": float(w["goodBonusMoney"])})
		else:
			life.apply({"income": w["badIncomeDelta"]}, "settle.weeklyBad")
			lines.append({"key": "settle.weekly.bad", "stat": "income", "delta": float(w["badIncomeDelta"])})
	if flags.get("monthEnd", false):
		var me: Dictionary = cfg["monthEnd"]
		if life.spend(float(me["rent"])):
			lines.append({"key": "settle.month.rent", "money": -float(me["rent"])})
		else:
			life.apply({"housing": me["unpaidHousingDelta"]}, "settle.unpaidRent")
			lines.append({"key": "settle.month.unpaid", "stat": "housing", "delta": float(me["unpaidHousingDelta"])})
	return lines
