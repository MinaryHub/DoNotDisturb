class_name GrillGame
extends RefCounted

## 고기 굽기 (회식): 익으면 뒤집고, 타면 모두가 쳐다본다. 굽는 동안은 [집중 노동 중]. 웹 판 src/gameplay/minigames.ts
## GrillSlot = { t: float }
## 이벤트: { type: "served" | "burnt" | "tooEarly", slot: int }

var slots: Array = []
var served := 0
var burnt := 0
var cook_sec: float
var burn_sec: float
var _events: Array = []


func _init(cook: float, burn: float, rng: Callable) -> void:
	cook_sec = cook
	burn_sec = burn
	for i in 3:
		slots.append({"t": rng.call() * cook * 0.6})


## "raw" | "cooked" | "burnt"
func state(i: int) -> String:
	var t: float = slots[i]["t"]
	if t < cook_sec:
		return "raw"
	if t < cook_sec + burn_sec:
		return "cooked"
	return "burnt"


func update(dt: float) -> void:
	for i in slots.size():
		var s: Dictionary = slots[i]
		s["t"] += dt
		if state(i) == "burnt":
			burnt += 1
			s["t"] = 0.0
			_events.append({"type": "burnt", "slot": i})


func flip(i: int) -> void:
	if i < 0 or i >= slots.size():
		return
	var s: Dictionary = slots[i]
	if state(i) == "cooked":
		served += 1
		s["t"] = 0.0
		_events.append({"type": "served", "slot": i})
	else:
		_events.append({"type": "tooEarly", "slot": i})


func drain_events() -> Array:
	var out := _events
	_events = []
	return out
