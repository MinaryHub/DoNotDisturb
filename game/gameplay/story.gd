class_name Story
extends RefCounted

## 한 주를 꿰는 이야기 줄기 (data/story.json).
## 게임 이벤트가 이야기 표지를 남기고, 다음 날들의 전화·목표·사람·독백이 표지를 보고 달라진다.
## 표지는 이름 → 수: 한 번 생긴 표지는 1, 셈(add)은 그때마다 +1 (카페에 들른 날 수 등).
## 표지는 하루 시작 때 함께 저장돼, 그날을 다시 하면 아침의 표지로 돌아간다.
## 웹 판 src/gameplay/Story.ts. StoryState = Dictionary { 표지 이름: 수 }

static var _ge_re: RegEx = null


static func _ge() -> RegEx:
	if _ge_re == null:
		_ge_re = RegEx.create_from_string("^([\\w.]+)>=(\\d+)$")
	return _ge_re


## 표지 값 (없으면 0)
static func _val(state: Dictionary, name: String) -> float:
	return float(state.get(name, 0))


## 조건(if) 확인: "flag"는 있어야, "!flag"는 없어야, "count>=N"은 N 이상. 조건이 없으면 늘 참
## cond: Array(문자열) 또는 null
static func allows(cond: Variant, state: Dictionary) -> bool:
	if cond == null:
		return true
	for c in cond:
		var s := String(c)
		var ge := _ge().search(s)
		if ge != null:
			if not (_val(state, ge.get_string(1)) >= float(ge.get_string(2))):
				return false
			continue
		if s.begins_with("!"):
			if _val(state, s.substr(1)) != 0:
				return false
		elif _val(state, s) == 0:
			return false
	return true


## 이 이벤트에 걸리는 표지 규칙 (그날 하루로 한정된 규칙은 그날만)
static func marks_for(story: Dictionary, event: String, day_id: String) -> Array:
	return story["marks"].filter(func(m): return m["on"] == event and (not m.has("day") or m["day"] == day_id))


## 규칙을 표지에 적용한다 (state를 직접 바꾼다)
static func apply_mark(state: Dictionary, mark: Dictionary) -> void:
	for f in mark.get("flags", []):
		state[f] = maxf(1.0, _val(state, f))
	for c in mark.get("add", []):
		state[c] = _val(state, c) + 1.0


## 표지에 맞지 않는 전화·목표·사람·소음·안내를 뺀 하루. 빠진 목표를 기다리는 requires도 지운다
static func apply_story(day: Dictionary, state: Dictionary) -> Dictionary:
	var ok := func(x: Dictionary) -> bool: return allows(x.get("if"), state)
	var objectives: Array = day["objectives"].filter(ok)
	var ids := {}
	for o in objectives:
		ids[o["id"]] = true
	var out: Dictionary = day.duplicate()
	var objs := []
	for o in objectives:
		if o.has("requires"):
			var copy: Dictionary = o.duplicate()
			copy["requires"] = o["requires"].filter(func(r): return ids.has(r))
			objs.append(copy)
		else:
			objs.append(o)
	out["objectives"] = objs
	out["phone"] = day["phone"].filter(ok)
	out["npcs"] = day["npcs"].filter(ok)
	if day.has("areaStimuli") and day["areaStimuli"] != null:
		out["areaStimuli"] = day["areaStimuli"].filter(ok)
	if day.has("notes") and day["notes"] != null:
		out["notes"] = day["notes"].filter(ok)
	return out


## 주간 리포트 끝 줄: 줄기마다 조건이 맞는 첫 결말 (맞는 줄이 없는 줄기는 건너뛴다)
static func epilogue_keys(story: Dictionary, state: Dictionary) -> Array:
	var out := []
	for t in story["threads"]:
		for e in story["epilogue"]:
			if e["thread"] == t["id"] and allows(e.get("if"), state):
				out.append(e["textKey"])
				break
	return out


## 데이터에 쓰인 조건 중 어떤 이벤트도 남기지 않는 표지 (오타 찾기). conds: Array(조건 배열 또는 null)
static func unknown_story_flags(story: Dictionary, conds: Array) -> Array:
	var known := {}
	for m in story["marks"]:
		for f in m.get("flags", []):
			known[f] = true
		for f in m.get("add", []):
			known[f] = true
	var out := {}
	var tail := RegEx.create_from_string(">=\\d+$")
	for c in conds:
		if c == null:
			continue
		for f in c:
			var name := tail.sub(String(f).trim_prefix("!"), "")
			if not known.has(name):
				out[name] = true
	return out.keys()


## 저장된 표지 (예전 저장은 이름 목록)
static func from_save(saved: Variant) -> Dictionary:
	if saved == null:
		return {}
	if saved is Array:
		var out := {}
		for f in saved:
			out[f] = 1.0
		return out
	var d := {}
	for k in saved:
		d[k] = float(saved[k])
	return d
