class_name SomaticController
extends RefCounted

## 신체화 디버프 (CLAUDE.md 5.7). 증상마다 강도 0~1.
## 홍조 ← 긴장·당황(+시선), 말더듬 ← 당황, 진땀·편두통 ← 스트레스.

const SYMPTOMS := ["flush", "migraine", "stutter", "sweat"]

var _cfg: Dictionary
var _level := {"flush": 0.0, "migraine": 0.0, "stutter": 0.0, "sweat": 0.0}
var _exposure_sec := 0.0
var _high_stress_sec := 0.0
var _events: Array = []


func _init(cfg: Dictionary) -> void:
	_cfg = cfg


func intensity(s: String) -> float:
	return _level[s]


func active(s: String) -> bool:
	return _level[s] > 0.05


## 유발 (거절, 말실수 등)
func trigger(s: String, amount: float, scale: float = 1.0) -> void:
	_set_level(s, _level[s] + amount * scale)


## NPC가 홍조를 지적하면 강도 1.0
func max_out(s: String) -> void:
	_set_level(s, 1.0)


func flush_remarkable() -> bool:
	return _level["flush"] >= float(_cfg["flush"]["remarkThreshold"])


func relieve(s: String, amount: float) -> void:
	_set_level(s, _level[s] - amount)


## 찬물 세수·반려동물: 전 증상 초기화
func clear_all() -> void:
	for s in SYMPTOMS:
		_set_level(s, 0.0)
	_exposure_sec = 0.0
	_high_stress_sec = 0.0


## 진땀이면 상호작용이 미끄러질지 (rng: 0~1)
func slips(rng: float) -> bool:
	return _level["sweat"] > 0.5 and rng < float(_cfg["sweat"]["slipChance"])


## input = { tension, stress, panic, gazeCount, continuousExposure, coveringCheeks, eyesClosed, flushRiseScale, sanctuary }
func step(dt: float, input: Dictionary) -> void:
	var c := _cfg
	var from := float(c["symptomFrom"])
	var sanctuary: bool = input["sanctuary"]
	var gaze := float(input["gazeCount"])
	var fc: Dictionary = c["flush"]
	var somatic := maxf(input["tension"], input["panic"]) >= from
	var flush: float = _level["flush"]
	if not sanctuary and somatic and gaze >= float(fc["gazeCount"]):
		flush += float(fc["gazeRisePerSec"]) * (gaze - float(fc["gazeCount"]) + 1) * float(input["flushRiseScale"]) * dt
	else:
		flush -= float(fc["decayPerSec"]) * dt
	if input["coveringCheeks"]:
		flush -= float(fc["coverDecayPerSec"]) * dt
	if sanctuary:
		flush -= float(fc["decayPerSec"]) * 4 * dt
	_set_level("flush", flush)

	# 편두통: 지속형 자극 노출이 길어지고 스트레스도 문턱을 넘었을 때
	var mc: Dictionary = c["migraine"]
	_exposure_sec = _exposure_sec + dt if (input["continuousExposure"] and not sanctuary) else maxf(0.0, _exposure_sec - dt * 2)
	var migraine: float = _level["migraine"]
	if input["stress"] >= from and _exposure_sec >= float(mc["onsetSec"]):
		migraine += float(mc["risePerSec"]) * dt
	else:
		migraine -= float(mc["decayPerSec"]) * dt
	if input["eyesClosed"]:
		migraine -= float(mc["eyesClosedDecayPerSec"]) * dt
	if sanctuary:
		migraine -= float(mc["decayPerSec"]) * 4 * dt
	_set_level("migraine", migraine)

	# 말더듬: 당황이 문턱 이상이면 즉시
	var sp := float(c["stutter"]["panic"])
	_set_level("stutter", minf(1.0, (input["panic"] - sp) / 20.0 + 0.5) if input["panic"] >= sp else 0.0)

	# 진땀: 높은 스트레스가 일정 시간 지속
	var sw: Dictionary = c["sweat"]
	_high_stress_sec = _high_stress_sec + dt if input["stress"] >= float(sw["stress"]) else 0.0
	var target := 1.0 if _high_stress_sec >= float(sw["sustainSec"]) else 0.0
	_set_level("sweat", _level["sweat"] + (target - _level["sweat"]) * minf(1.0, dt * 0.5))


## → [{ type: "onset"|"cleared", symptom }]
func drain_events() -> Array:
	var out := _events.duplicate()
	_events.clear()
	return out


func _set_level(s: String, value: float) -> void:
	var before: float = _level[s]
	var v := clampf(value, 0.0, 1.0)
	_level[s] = v
	if before <= 0.05 and v > 0.05:
		_events.append({"type": "onset", "symptom": s})
	if before > 0.05 and v <= 0.05:
		_events.append({"type": "cleared", "symptom": s})
