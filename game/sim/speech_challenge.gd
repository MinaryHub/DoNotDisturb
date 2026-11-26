class_name SpeechChallenge
extends RefCounted

## 필수 상호작용의 '한마디' (회의 발언, 건배사, "다음에 올게요" 등).
## 문장을 마디로 나눠, 박자 표시가 목표 구간에 있을 때 입력하면 매끄럽게 말한다.
## 놓치면 그 마디는 더듬고 다음으로 넘어간다. 말더듬 중에는 구간이 절반.

var _cfg: Dictionary
var chunks: Array
var index := 0
var marker := 0.0
var hits := 0
var misses := 0
## [{ text, clean }]
var spoken: Array = []
var _stutter := false
var _events: Array = []


func _init(cfg: Dictionary, chunk_list: Array) -> void:
	_cfg = cfg
	chunks = chunk_list


func done() -> bool:
	return index >= chunks.size()


## → { from, to }
func zone() -> Dictionary:
	var w := float(_cfg["zoneWidth"]) * (0.5 if _stutter else 1.0)
	var c := float(_cfg["zoneCenter"])
	return {"from": c - w / 2.0, "to": c + w / 2.0}


func update(dt: float, stutter: bool) -> void:
	if done():
		return
	_stutter = stutter
	marker += dt / float(_cfg["beatSec"])
	if marker >= 1:
		_resolve(false)


func press() -> void:
	if done():
		return
	var z := zone()
	_resolve(marker >= z["from"] and marker <= z["to"])


## → [{ type: "chunk", index, clean } | { type: "done", hits, misses }]
func drain_events() -> Array:
	var out := _events.duplicate()
	_events.clear()
	return out


func _resolve(clean: bool) -> void:
	spoken.append({"text": chunks[index], "clean": clean})
	if clean:
		hits += 1
	else:
		misses += 1
	_events.append({"type": "chunk", "index": index, "clean": clean})
	index += 1
	marker = 0.0
	if done():
		_events.append({"type": "done", "hits": hits, "misses": misses})


## 더듬는 말투: "회의" → "회, 회… 회의"
static func stutter_text(text: String) -> String:
	var t := text.strip_edges()
	if t.is_empty():
		return text
	var first := t[0]
	return "%s, %s… %s" % [first, first, text]
