class_name DayReport
extends RefCounted

## 엔딩 리포트용 하루 기록 (CLAUDE.md 6 공통 흐름). Dictionary로 다룬다 (저장에 그대로 들어간다)

const COUNTERS := ["smalltalkAvoided", "smalltalkEndured", "parried", "silenceSec", "callsAnswered", "callsAvoided", "messagesReplied", "messagesIgnored", "recoveredBattery", "favorsDone"]


static func empty(life_start: Dictionary, money_start: float) -> Dictionary:
	var r := {
		"mandatoryDone": [],
		"hobbies": [],
		"lifeStart": life_start.duplicate(),
		"moneyStart": money_start,
	}
	for k in COUNTERS:
		r[k] = 0.0
	return r


## 여러 날의 기록을 합친다 (주간 최종 리포트)
static func merge(reports: Array) -> Dictionary:
	var total := {"mandatoryDone": [], "hobbies": []}
	for k in COUNTERS:
		total[k] = 0.0
	for r in reports:
		for k in COUNTERS:
			total[k] += float(r.get(k, 0))
		total["mandatoryDone"].append_array(r.get("mandatoryDone", []))
		total["hobbies"].append_array(r.get("hobbies", []))
	return total
