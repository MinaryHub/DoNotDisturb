class_name MonologueDirector
extends RefCounted

## 내면 독백 (CLAUDE.md 5.11). 상황·거리 조건에 맞는 문구를 고른다. 문구는 data/monologue/<lang>.csv.
## 웹 판 src/gameplay/Monologue.ts
## MonologueContext = { areaId: String|null, npcs: Array[MonologueNpcInfo], returning: bool }
##   MonologueNpcInfo = { profileId, type, dist, visible, noticed }
##   returning: 오늘 할 일을 마치고 귀가 중
## MonologueLine = { key, text, duration(표시 시간), age }

## 지금 띄운 줄 (없으면 null)
var current: Variant = null
var _queue: Array = []
var _cooldown := {}
var _fired := {}
var _last_area: Variant = null
var _check_timer := 0.0
var _day_id := ""
var _flags := {}
var _triggers: Array
var _texts: Dictionary
var _rng: Callable


func _init(triggers: Array, texts: Dictionary, rng: Callable = func(): return randf()) -> void:
	_triggers = triggers
	_texts = texts
	_rng = rng


## 이벤트 기반 독백 ("phone:ring", "onset:flush" …)
func on_event(event: String) -> void:
	for i in _triggers.size():
		var tr: Dictionary = _triggers[i]
		if tr["when"].get("event") == event and _today(tr):
			_try_fire(i)


## 직접 키로 띄우기 (상호작용 flavor 등)
func say(key: String) -> void:
	var text: String = _texts.get(key, "")
	if text != "":
		_push(key, text)


func update(dt: float, ctx: Dictionary) -> void:
	for i in _cooldown:
		_cooldown[i] -= dt
	if current != null:
		current["age"] += dt
		if current["age"] >= current["duration"]:
			current = null
	if current == null and not _queue.is_empty():
		current = _queue.pop_front()

	var area: Variant = ctx.get("areaId")
	var entered_area: Variant = area if not _same(area, _last_area) else null
	_last_area = area
	_check_timer -= dt
	if _check_timer > 0 and entered_area == null:
		return
	_check_timer = 0.5

	for i in _triggers.size():
		var tr: Dictionary = _triggers[i]
		var w: Dictionary = tr["when"]
		if w.has("event") or not _today(tr):
			continue
		if w.has("area"):
			if not _same(entered_area, w["area"]):
				continue
			if w.has("returning") and w["returning"] != ctx.get("returning", false):
				continue
			_try_fire(i)
			continue
		if not w.has("npcProfile") and not w.has("npcType"):
			continue
		var matched := false
		for n in ctx.get("npcs", []):
			if (not w.has("npcProfile") or n["profileId"] == w["npcProfile"]) \
					and (not w.has("npcType") or n["type"] == w["npcType"]) \
					and n["dist"] >= float(w.get("distMin", 0)) \
					and n["dist"] <= float(w.get("distMax", INF)) \
					and (not w.get("visible", false) or n["visible"]) \
					and (not w.get("noticed", false) or n["noticed"]):
				matched = true
				break
		if matched:
			_try_fire(i)


func clear() -> void:
	current = null
	_queue.clear()


## 새 하루: 1회성 기록과 쿨다운 초기화. 이야기 표지에 맞지 않는 독백은 오늘 쉰다
func reset(day_id: String, flags: Dictionary = {}) -> void:
	_day_id = day_id
	_flags = flags
	clear()
	_cooldown.clear()
	_fired.clear()
	_last_area = null


## null과 문자열을 섞어 비교 (TS ===)
static func _same(a: Variant, b: Variant) -> bool:
	if a == null or b == null:
		return a == null and b == null
	return a == b


## 같은 상황도 매번 같은 말만 하지 않도록: "key", "key~2", "key~3" … 중 하나. 없으면 ""
func _variant(key: String) -> String:
	var options: Array = []
	var n := 1
	while true:
		var k := key if n == 1 else "%s~%d" % [key, n]
		if not _texts.has(k):
			break
		options.append(_texts[k])
		n += 1
	return options[int(floor(_rng.call() * options.size()))] if options.size() > 0 else ""


func _today(tr: Dictionary) -> bool:
	return (not tr["when"].has("day") or tr["when"]["day"] == _day_id) and Story.allows(tr.get("if"), _flags)


func _try_fire(i: int) -> void:
	var tr: Dictionary = _triggers[i]
	if tr.get("once", false) and _fired.has(i):
		return
	if float(_cooldown.get(i, 0.0)) > 0:
		return
	var text := _variant(tr["key"])
	if text == "":
		return
	_fired[i] = true
	_cooldown[i] = float(tr.get("cooldownSec", 30))
	_push(tr["key"], text)


func _push(key: String, text: String) -> void:
	if current != null and current["key"] == key:
		return
	for q in _queue:
		if q["key"] == key:
			return
	var line := {"key": key, "text": text, "duration": 2.2 + text.length() * 0.07, "age": 0.0}
	if _queue.size() >= 2:
		_queue.pop_front()
	if current == null:
		current = line
	else:
		_queue.append(line)
