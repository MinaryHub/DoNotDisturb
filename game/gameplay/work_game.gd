class_name WorkGame
extends RefCounted

## 미니게임 로직 (DOM 없음). 화면은 presentation/ui가 이 상태를 읽어 그린다. 웹 판 src/gameplay/minigames.ts
## 업무 미니게임: 집중해서 일을 쳐내는 동안 메신저 알림이 쏟아진다 (스테이지 2 '알림 폭탄')
## WorkPing = { id: int, from: "boss"|"team"|"hr", age: float }
## 이벤트: { type: "ping", ping } | { type: "pingIgnored", ping } | { type: "task" } | { type: "done" }

var progress := 0.0
var tasks_done := 0
var pings: Array = []
var tasks: int
var _focus_per_sec: float
var _ping_every: Array
var _ping_timeout: float
var _rng: Callable
var _next_ping: float
var _seq := 0
var _events: Array = []


## ping_every = [최소, 최대] 초
func _init(task_count: int, focus_per_sec: float, ping_every: Array, ping_timeout: float, rng: Callable) -> void:
	tasks = task_count
	_focus_per_sec = focus_per_sec
	_ping_every = ping_every
	_ping_timeout = ping_timeout
	_rng = rng
	_next_ping = float(ping_every[0])


var done: bool:
	get:
		return tasks_done >= tasks


func update(dt: float, focusing: bool) -> void:
	if done:
		return
	# 답하지 않은 알림이 있으면 집중이 반으로 줄어든다
	if focusing:
		progress += _focus_per_sec * dt * (0.5 if pings.size() > 0 else 1.0)
	if progress >= 100:
		progress = 0.0
		tasks_done += 1
		_events.append({"type": "task"})
		if done:
			_events.append({"type": "done"})
			return
	_next_ping -= dt
	if _next_ping <= 0:
		_next_ping = float(_ping_every[0]) + _rng.call() * (float(_ping_every[1]) - float(_ping_every[0]))
		var r: float = _rng.call()
		_seq += 1
		var ping := {"id": _seq, "from": "boss" if r < 0.3 else ("team" if r < 0.8 else "hr"), "age": 0.0}
		pings.append(ping)
		_events.append({"type": "ping", "ping": ping})
	for i in range(pings.size() - 1, -1, -1):
		var p: Dictionary = pings[i]
		p["age"] += dt
		if p["age"] >= _ping_timeout:
			pings.remove_at(i)
			_events.append({"type": "pingIgnored", "ping": p})


## 가장 오래된 알림에 답장 (없으면 null)
func reply() -> Variant:
	return pings.pop_front() if pings.size() > 0 else null


func drain_events() -> Array:
	var out := _events
	_events = []
	return out
