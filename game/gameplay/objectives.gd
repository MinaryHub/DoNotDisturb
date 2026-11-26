class_name Objectives
extends RefCounted

## 하루의 목표 진행. 게임 이벤트 문자열("enter:officeFloor", "done:meeting", "pick:martItem" …)로 완료된다.
## 웹 판 src/gameplay/Objectives.ts
## ObjectiveState = { def, progress, done, late, missed }
##   late: 마감을 넘겨 페널티를 이미 받았는지
##   missed: 닫히는 시각(closes)이 지나 못 하고 넘어갔는지. 뒤따르는 목표는 막지 않는다
## 이벤트: { type: "completed" | "late" | "missed", objective: ObjectiveState }

var list: Array = []
var _events: Array = []


func _init(day: Dictionary) -> void:
	for def in day["objectives"]:
		list.append(_state_of(def))


static func _state_of(def: Dictionary) -> Dictionary:
	return {"def": def, "progress": 0, "done": false, "late": false, "missed": false}


## 하루 중에 생기는 목표 (부탁을 받았을 때)
func add(def: Dictionary) -> Dictionary:
	var o := _state_of(def)
	var at := -1
	for i in list.size():
		if list[i]["def"].get("endsDay", false):
			at = i
			break
	list.insert(maxi(0, at), o)
	return o


## 없으면 null
func get_objective(id: String) -> Variant:
	for o in list:
		if o["def"]["id"] == id:
			return o
	return null


func is_done(id: String) -> bool:
	var o: Variant = get_objective(id)
	return o != null and o["done"]


## 끝났거나 놓쳐서 더는 붙잡지 않는 목표
func resolved(id: String) -> bool:
	var o: Variant = get_objective(id)
	return o != null and (o["done"] or o["missed"])


## 선행 목표가 모두 끝나(또는 놓쳐) 지금 진행할 수 있는지
func available(o: Dictionary) -> bool:
	if o["done"] or o["missed"]:
		return false
	for r in o["def"].get("requires", []):
		if not resolved(r):
			return false
	return true


## 화면에 보여줄 목표 (진행 가능 + 미완료, 선택 목표 포함)
func visible() -> Array:
	return list.filter(func(o): return available(o))


## 하루를 끝낼 수 있는 목표(침대)가 진행 가능한지
var can_end_day: bool:
	get:
		for o in list:
			if o["def"].get("endsDay", false) and available(o):
				return true
		return false


## 이벤트 발생. 선행 목표가 끝난 목표만 진행된다
func fire(event: String) -> void:
	for o in list:
		if o["def"].get("on", "") != event or not available(o):
			continue
		o["progress"] += 1
		if float(o["progress"]) >= float(o["def"].get("count", 1)):
			o["done"] = true
			_events.append({"type": "completed", "objective": o})


## 마감 시각 확인 (늦으면 페널티, 닫히면 놓침)
func check_deadlines(minutes: float) -> void:
	for o in list:
		var def: Dictionary = o["def"]
		if not o["done"] and not o["missed"] and def.get("closes", "") != "" and minutes >= DayCycle.parse_time(def["closes"]):
			o["missed"] = true
			_events.append({"type": "missed", "objective": o})
			continue
		if o["done"] or o["late"] or def.get("deadline", "") == "":
			continue
		if minutes >= DayCycle.parse_time(def["deadline"]):
			o["late"] = true
			_events.append({"type": "late", "objective": o})


## 선택 목표 중 하지 않은 것
func skipped_optional() -> Array:
	return list.filter(func(o): return o["def"].get("optional", false) and not o["done"])


func drain_events() -> Array:
	var out := _events
	_events = []
	return out
