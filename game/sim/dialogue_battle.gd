class_name DialogueBattle
extends RefCounted

## 대화 배틀 (CLAUDE.md 5.6). 목표는 최소 비용 이탈.
##   패링: NPC 대사 끝 ±윈도우에 '이탈' → 즉시 종료 (틈이 있는 대사에서만)
##   리액션: 대사 종류에 맞는 반응으로 만족도 100 → 이탈
##   미소 유지: 홀드하지 않으면 만족도 하락
##   오선택: 대화 +10초, 종료 후 이불킥
## 순수 상태 머신. 시간은 update(dt)로만 흐른다.

const REPLIES := ["nod", "agree", "answer", "exit"]
## 대사 종류별로 자연스러운 반응
const FITTING := {
	"question": ["answer"],
	"story": ["nod", "agree"],
	"opening": ["nod", "agree"],
	"remark": ["answer", "nod"],
}

var _cfg: Dictionary
var _pool: Dictionary
## { minDurationSec, baseDurationSec, ally, rng: Callable, practice? }
var _opts: Dictionary

var satisfaction := 0.0
var elapsed := 0.0
var wrong_count := 0
var smile_dropped_sec := 0.0
## "", "satisfied", "parried", "endured", "sos"
var outcome := ""

var _phase := "speaking"
var _line: Dictionary
var _line_elapsed := 0.0
var _replied := false
var _gap_left := 0.0
var _extra_sec := 0.0
var _remarked := false
var _sos_left := -1.0
var _stutter_now := false
var _bag: Array = []
var _events: Array = []


func _init(cfg: Dictionary, pool: Dictionary, opts: Dictionary) -> void:
	_cfg = cfg
	_pool = pool
	_opts = opts
	_line = pool["greeting"]
	_events.append({"type": "line", "line": _line})


func current_line() -> Dictionary:
	return _line


func ended() -> bool:
	return _phase == "ended"


## 현재 대사 진행률 0~1
func line_progress() -> float:
	return minf(1.0, _line_elapsed / float(_line["durationSec"]))


func line_elapsed_sec() -> float:
	return _line_elapsed


func window_sec() -> float:
	return float(_cfg["parryWindowSec"]) * (0.5 if _stutter_now else 1.0)


## 지금이 대사 끝 ±윈도우 안인지
func in_window() -> bool:
	if _phase == "ended":
		return false
	var t := _line_elapsed - float(_line["durationSec"]) if _phase == "speaking" else float(_cfg["gapSec"]) - _gap_left
	return absf(t) <= window_sec()


func can_exit_now() -> bool:
	return elapsed >= float(_opts["minDurationSec"])


func sos_pending() -> bool:
	return _sos_left >= 0


func sos_remaining() -> float:
	return _sos_left


func remaining_sec() -> float:
	return maxf(0.0, float(_opts["baseDurationSec"]) + _extra_sec - elapsed)


## SOS: 일정 시간 후 가짜 긴급 전화로 페널티 없이 이탈
func request_sos() -> void:
	if _phase != "ended" and _sos_left < 0:
		_sos_left = float(_cfg["sosDelaySec"])


func respond(reply: String) -> void:
	if _phase == "ended" or _replied:
		return
	var perfect := in_window()
	_replied = true
	if reply == "exit":
		if _line["kind"] == "opening" and perfect and can_exit_now():
			_events.append({"type": "parry"})
			_finish("parried")
		else:
			_wrong(reply)
		return
	var fitting: bool = FITTING[_line["kind"]].has(reply)
	if not fitting and not _opts.get("ally", false):
		_wrong(reply)
		return
	var gain := float(_cfg["satisfactionPerReply"]) * (float(_cfg["perfectMultiplier"]) if perfect else 1.0)
	satisfaction = minf(100.0, satisfaction + gain)
	_events.append({"type": "reply", "reply": reply, "fitting": fitting, "perfect": perfect})
	if satisfaction >= 100 and can_exit_now():
		_finish("satisfied")


## input = { smiling, stutter, flushRemarkable }
func update(dt: float, input: Dictionary) -> void:
	if _phase == "ended":
		return
	_stutter_now = input["stutter"]
	elapsed += dt
	var ally: bool = _opts.get("ally", false)
	if not ally and not input["smiling"]:
		smile_dropped_sec += dt
		satisfaction = maxf(0.0, satisfaction - float(_cfg["smileDropPerSec"]) * (0.5 if _opts.get("practice", false) else 1.0) * dt)
	if _sos_left >= 0:
		_sos_left -= dt
		if _sos_left <= 0:
			_finish("sos")
			return
	if _phase == "speaking":
		_line_elapsed += dt
		if _line_elapsed >= float(_line["durationSec"]):
			_phase = "gap"
			_gap_left = float(_cfg["gapSec"])
		return
	# 대사 사이
	_gap_left -= dt
	if _gap_left > 0:
		return
	if not _replied and not ally:
		satisfaction = maxf(0.0, satisfaction - float(_cfg["ignoredLoss"]))
	if satisfaction >= 100 and can_exit_now():
		_finish("satisfied")
		return
	if elapsed >= float(_opts["baseDurationSec"]) + _extra_sec and can_exit_now():
		_finish("endured")
		return
	_next_line(input["flushRemarkable"])


func drain_events() -> Array:
	var out := _events.duplicate()
	_events.clear()
	return out


func _next_line(flush_remarkable: bool) -> void:
	var rng: Callable = _opts["rng"]
	if flush_remarkable and not _remarked and not _opts.get("ally", false) and rng.call() < float(_cfg["flushRemarkChance"]):
		_remarked = true
		_line = _pool["flushRemark"]
		_events.append({"type": "flushRemark"})
	else:
		if _bag.is_empty():
			_bag.append_array(_pool["lines"])
			# Fisher–Yates
			for i in range(_bag.size() - 1, 0, -1):
				var j := int(floor(rng.call() * (i + 1)))
				var tmp = _bag[i]
				_bag[i] = _bag[j]
				_bag[j] = tmp
		_line = _bag.pop_back()
	_phase = "speaking"
	_line_elapsed = 0.0
	_replied = false
	_events.append({"type": "line", "line": _line})


func _wrong(reply: String) -> void:
	_events.append({"type": "wrong", "reply": reply})
	if _opts.get("practice", false):
		return
	wrong_count += 1
	_extra_sec += float(_cfg["wrongExtraSec"])
	satisfaction = maxf(0.0, satisfaction - float(_cfg["wrongSatisfactionLoss"]))


func _finish(result: String) -> void:
	_phase = "ended"
	outcome = result
	var closers: Dictionary = _pool["closers"]
	var closer: String = closers["awkward"] if (result == "endured" and wrong_count > 0) else closers[result]
	_events.append({"type": "end", "outcome": result, "closer": closer})
