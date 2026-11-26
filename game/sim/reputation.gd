class_name Reputation
extends RefCounted

## 사람들이 나를 어떻게 보는지 (data/reputation.json). 사람마다 0~100의 인상, 평균이 사회적 평판.
## 대화가 끝난 방식·연락·중요한 순간이 인상을 움직인다. 인상이 좋을수록 나를 더 잘 알아보고 말을 건다.

var _cfg: Dictionary
var _values := {}
## 오늘 바뀐 양 (밤 정산)
var _today := {}
## 오늘 이미 반영한 이벤트 (되풀이로 인상을 쌓지 못하게)
var _events_today := {}


func _init(cfg: Dictionary) -> void:
	_cfg = cfg
	reset()


func reset() -> void:
	_values = {}
	var people: Dictionary = _cfg["people"]
	for id in people:
		_values[id] = float(people[id].get("start", _cfg["start"]))
	_today = {}


func get_value(person: String) -> float:
	return float(_values.get(person, _cfg["start"]))


func all() -> Dictionary:
	return _values


func changed_today() -> Dictionary:
	return _today


## 사회적 평판: 모든 사람 인상의 평균
func overall() -> float:
	if _values.is_empty():
		return float(_cfg["start"])
	var s := 0.0
	for v in _values.values():
		s += v
	return s / _values.size()


func change(person: String, delta: float) -> void:
	if person == "" or delta == 0 or not _values.has(person):
		return
	var before: float = _values[person]
	_values[person] = clampf(before + delta, 0.0, 100.0)
	var real: float = _values[person] - before
	if real != 0:
		_today[person] = float(_today.get(person, 0.0)) + real


## NPC id → 사람 (등록되지 않은 행인은 "")
func person_of_npc(npc_id: String) -> String:
	var people: Dictionary = _cfg["people"]
	for id in people:
		if people[id].get("npcs", []).has(npc_id):
			return id
	return ""


func person_of_contact(contact_id: String) -> String:
	var people: Dictionary = _cfg["people"]
	for id in people:
		if people[id].get("contacts", []).has(contact_id):
			return id
	return ""


## 게임 이벤트가 움직이는 인상 (같은 이벤트는 하루 한 번)
func on_event(event: String) -> void:
	var evs: Dictionary = _cfg["events"]
	if not evs.has(event) or _events_today.has(event):
		return
	_events_today[event] = true
	var d: Dictionary = evs[event]
	for person in d:
		change(person, float(d[person]))


## 인상 → 알아챔 배율
func warmth(person: String) -> float:
	if person == "":
		return 1.0
	var w: Dictionary = _cfg["warmth"]
	return float(w["min"]) + (float(w["max"]) - float(w["min"])) * (get_value(person) / 100.0)


## 얼마나 편한 사이인지 (−1~1, 인상 50에서 0)
func ease(person: String) -> float:
	if person == "":
		return 0.0
	return clampf((get_value(person) - 50.0) / 50.0, -1.0, 1.0)


func can_nod_instead(person: String) -> bool:
	return person != "" and get_value(person) >= float(_cfg["talk"]["nodFrom"])


## 인상을 말로 (숫자 없이)
func tier_key(value: float) -> String:
	var tiers: Array = _cfg["tiers"]
	for t in tiers:
		if value >= float(t["min"]):
			return t["key"]
	return tiers[-1]["key"]


func new_day() -> void:
	_today = {}
	_events_today = {}


func snapshot() -> Dictionary:
	return _values.duplicate()


func restore(values) -> void:
	reset()
	_events_today = {}
	if values is Dictionary:
		for k in values:
			if _values.has(k):
				_values[k] = float(values[k])
