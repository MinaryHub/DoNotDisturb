class_name LifeStats
extends RefCounted

## 생활 지표 — 회피의 대가 (CLAUDE.md 5.4). 회피는 지표를 깎고, 감수한 상호작용은 지표와 소득을 준다.
## 모든 변화는 이유(why)·대상(who)과 함께 ledger에 쌓인다 (밤 정산·알림에 보여 준다).

const IDS := ["income", "housing", "essentials", "bond"]

var _cfg: Dictionary
var _values: Dictionary
var _money: float
var _avoid_counts := {}
## 오늘 바뀐 기록 [{ stat, delta, why, who }]
var ledger: Array = []


func _init(cfg: Dictionary) -> void:
	_cfg = cfg
	_values = cfg["start"].duplicate()
	for id in IDS:
		_values[id] = float(_values[id])
	_money = float(cfg["startMoney"])


func get_stat(id: String) -> float:
	return _values[id]


var money: float:
	get:
		return _money


func all() -> Dictionary:
	return _values


## delta = { income?, housing?, essentials?, bond? }
func apply(delta: Dictionary, why: String = "other", who: String = "") -> void:
	for id in IDS:
		if not delta.has(id):
			continue
		var d := float(delta[id])
		if d == 0:
			continue
		var before: float = _values[id]
		_values[id] = minf(float(_cfg["max"]), maxf(0.0, before + (_softened(before, d) if d > 0 else d)))
		var real: float = _values[id] - before
		if real != 0:
			ledger.append({"stat": id, "delta": real, "why": why, "who": who})


## 높을수록 덜 오른다 (softCap.from 위에서 max에 가까울수록 keep배까지)
func _softened(value: float, gain: float) -> float:
	if not _cfg.has("softCap"):
		return gain
	var sc: Dictionary = _cfg["softCap"]
	var from := float(sc["from"])
	if value + gain <= from:
		return gain
	var below := maxf(0.0, from - value)
	var span := float(_cfg["max"]) - from
	var mid := minf(1.0, (maxf(value, from) - from + (gain - below) / 2.0) / span)
	# 지표는 정수로 둔다 (오르는 일이면 적어도 1)
	return maxf(1.0, roundf(below + (gain - below) * (1.0 - (1.0 - float(sc["keep"])) * mid)))


func clear_ledger() -> void:
	ledger.clear()


func add_money(amount: float) -> void:
	_money += amount


## 지불. 모자라면 false (지불하지 않음)
func spend(amount: float) -> bool:
	if amount > _money:
		return false
	_money -= amount
	return true


## 대상 회피 기록 → { count, escalate }
func record_avoid(target_id: String) -> Dictionary:
	var count: int = int(_avoid_counts.get(target_id, 0)) + 1
	_avoid_counts[target_id] = count
	return {"count": count, "escalate": count % int(_cfg["escalateAfter"]) == 0}


func record_accept(target_id: String) -> void:
	_avoid_counts.erase(target_id)


func avoid_count(target_id: String) -> int:
	return int(_avoid_counts.get(target_id, 0))


## 0이 된 지표 (생활 붕괴). 없으면 ""
func collapsed() -> String:
	for id in IDS:
		if _values[id] <= 0:
			return id
	return ""


func snapshot() -> Dictionary:
	return {"values": _values.duplicate(), "money": _money, "avoidCounts": _avoid_counts.duplicate()}


func restore(s: Dictionary) -> void:
	_values = s["values"].duplicate()
	_money = float(s["money"])
	_avoid_counts = s.get("avoidCounts", {}).duplicate()
