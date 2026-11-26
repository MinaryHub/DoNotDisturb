class_name StimulusBus
extends RefCounted

## 모든 사회적 자극이 거치는 단일 버스 (CLAUDE.md 5.3).
## 자극 정의는 data/stimuli.json, 여기서는 "기본 데미지"까지만 계산한다. 배율·채널 감쇠는 EnergyModel이 한다.
## hit = { stimulusId, kind, channel, amount, source }

var _table: Dictionary
var _instant: Array = []
var _ambushes: Array = []
var _encounters: Array = []
## key → { stimulusId, intensity }
var _continuous := {}
## [{ stimulusId, remainingSec, scale }]
var _ruminations: Array = []


func _init(table: Dictionary) -> void:
	_table = table


func def(stimulus_id: String) -> Dictionary:
	assert(_table.has(stimulus_id), "알 수 없는 자극: \"%s\" (data/stimuli.json 확인)" % stimulus_id)
	return _table[stimulus_id]


func has(stimulus_id: String) -> bool:
	return _table.has(stimulus_id)


## 1회성 자극. 지속형은 set_continuous로 켜고 끈다. scale: 데미지 배율 (예: 리허설 후 0.7)
func emit(stimulus_id: String, source: String = "", scale: float = 1.0) -> void:
	var d := def(stimulus_id)
	match d["kind"]:
		"ambush", "encounter":
			_instant.append({"stimulusId": stimulus_id, "kind": d["kind"], "channel": d["channel"], "amount": float(d.get("damage", 0)) * scale, "source": source})
			(_ambushes if d["kind"] == "ambush" else _encounters).append(stimulus_id)
		"rumination":
			_ruminations.append({"stimulusId": stimulus_id, "remainingSec": float(d.get("durationSec", 0)), "scale": scale})
		"continuous":
			assert(false, "지속형 자극 \"%s\"은 set_continuous로 켜고 꺼야 합니다" % stimulus_id)


## 지속형 자극을 key 단위로 켜거나 강도를 바꾼다. intensity ≤ 0이면 끈다. key 예: "zone:lobby"
func set_continuous(key: String, stimulus_id: String, intensity: float) -> void:
	if intensity <= 0:
		_continuous.erase(key)
		return
	var d := def(stimulus_id)
	assert(d["kind"] == "continuous", "\"%s\"는 지속형 자극이 아닙니다" % stimulus_id)
	_continuous[key] = {"stimulusId": stimulus_id, "intensity": intensity}


func is_active(key: String) -> bool:
	return _continuous.has(key)


func active_ruminations() -> int:
	return _ruminations.size()


func active_continuous_keys() -> Array:
	return _continuous.keys()


## 조건(key → bool)에 맞는 지속형 자극의 초당 기본 데미지 합
func continuous_rate(match_key: Callable) -> float:
	var sum := 0.0
	for key in _continuous:
		if match_key.call(key):
			var e: Dictionary = _continuous[key]
			sum += float(def(e["stimulusId"]).get("ratePerSec", 0)) * e["intensity"]
	return sum


## key가 prefix로 시작하는 지속형 자극을 모두 끈다 (예: 구역을 벗어날 때 "zone:")
func clear_continuous(prefix: String = "") -> void:
	for key in _continuous.keys():
		if String(key).begins_with(prefix):
			_continuous.erase(key)


## 이불킥 DoT 정화 (건반 연주 등)
func clear_ruminations() -> int:
	var n := _ruminations.size()
	_ruminations.clear()
	return n


## → { hits, ambushes, encounters }
func tick(dt: float) -> Dictionary:
	var hits: Array = _instant.duplicate()
	_instant.clear()
	for key in _continuous:
		var e: Dictionary = _continuous[key]
		var d := def(e["stimulusId"])
		hits.append({"stimulusId": e["stimulusId"], "kind": "continuous", "channel": d["channel"], "amount": float(d.get("ratePerSec", 0)) * e["intensity"] * dt, "source": key})
	for i in range(_ruminations.size() - 1, -1, -1):
		var r: Dictionary = _ruminations[i]
		var d := def(r["stimulusId"])
		var step := minf(dt, r["remainingSec"])
		hits.append({"stimulusId": r["stimulusId"], "kind": "rumination", "channel": d["channel"], "amount": float(d.get("ratePerSec", 0)) * step * r["scale"], "source": ""})
		r["remainingSec"] -= dt
		if r["remainingSec"] <= 0:
			_ruminations.remove_at(i)
	var out := {"hits": hits, "ambushes": _ambushes.duplicate(), "encounters": _encounters.duplicate()}
	_ambushes.clear()
	_encounters.clear()
	return out


func clear() -> void:
	_instant.clear()
	_ambushes.clear()
	_encounters.clear()
	_continuous.clear()
	_ruminations.clear()
