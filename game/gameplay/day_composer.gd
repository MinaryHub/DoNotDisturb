class_name DayComposer
extends RefCounted

## 같은 요일이어도 매번 조금 다른 하루 (식상하지 않게).
## 하루 데이터(기본) + 작은 사건 몇 개를 섞어 '오늘의' DayDef를 만든다. 결과는 평범한 DayDef라 나머지 코드는 그대로 읽는다.
## rng가 없으면(테스트 기본값) 변화 없이 기본 하루: 확률 NPC는 빼고, 대안은 기본값, 사건 없음.
## 이야기 표지(flags)는 씨앗과 상관없이 늘 적용한다: 지난 날의 선택이 오늘을 바꾼다.
## 웹 판 src/gameplay/DayComposer.ts


## → { day: DayDef, happenings: Array[HappeningDef] }. rng: Callable(→ float) 또는 null(Callable() 빈 값도 null로 본다)
static func compose_day(def: Dictionary, cfg: Dictionary, rng: Variant, flags: Dictionary = {}) -> Dictionary:
	var base := Story.apply_story(def, flags)
	if rng == null or (rng is Callable and not (rng as Callable).is_valid()):
		var day0: Dictionary = base.duplicate()
		var npcs0 := []
		for n in base["npcs"]:
			if not n.has("chance") or float(n["chance"]) >= 1:
				npcs0.append(_strip(n))
		day0["npcs"] = npcs0
		return {"day": day0, "happenings": []}
	var r: Callable = rng
	var happenings := _pick_happenings(base, cfg, r)
	var day: Dictionary = base.duplicate()
	var weather: Variant = base.get("weather")
	for h in happenings:
		if h.has("setWeather"):
			weather = h["setWeather"]
	_assign(day, "weather", weather)
	day["npcs"] = []
	day["phone"] = []
	day["crowdLanes"] = base.get("crowdLanes", []).duplicate()
	day["areaStimuli"] = _arr(base, "areaStimuli").duplicate()
	day["stalls"] = base.get("stalls", []).duplicate()
	day["blocked"] = base.get("blocked", []).duplicate()
	var ids := {}
	for h in happenings:
		for id in h.get("removeNpcs", []):
			ids[id] = true
	var all_npcs: Array = base["npcs"].duplicate()
	for h in happenings:
		all_npcs.append_array(h.get("npcs", []))
	for n in all_npcs:
		if ids.has(n["id"]) or not Story.allows(n.get("if"), flags):
			continue
		if n.has("chance") and r.call() >= float(n["chance"]):
			continue
		ids[n["id"]] = true
		day["npcs"].append(_variant_of(n, r))
	var all_phone: Array = base["phone"].duplicate()
	for h in happenings:
		all_phone.append_array(h.get("phone", []))
	for p in all_phone:
		if not Story.allows(p.get("if"), flags):
			continue
		var text_key: Variant = p.get("textKey")
		var keys: Array = p.get("textKeys", [])
		if keys.size() > 0:
			text_key = keys[int(floor(r.call() * keys.size()))]
		var at: Variant = p.get("at")
		if at != null and float(p.get("jitterMin", 0)) != 0:
			at = DayCycle.format_time(maxf(0.0, DayCycle.parse_time(at) + _js_round((r.call() * 2.0 - 1.0) * float(p["jitterMin"]))))
		var q: Dictionary = p.duplicate()
		_assign(q, "textKey", text_key)
		_assign(q, "at", at)
		day["phone"].append(q)
	for h in happenings:
		day["crowdLanes"].append_array(h.get("crowdLanes", []))
		# 같은 영역의 소음은 사건 쪽이 덮어쓴다
		for a in h.get("areaStimuli", []):
			day["areaStimuli"] = day["areaStimuli"].filter(func(x): return x["area"] != a["area"])
			day["areaStimuli"].append(a)
		day["stalls"].append_array(h.get("stalls", []))
		day["blocked"].append_array(h.get("blocked", []))
	return {"day": day, "happenings": happenings}


## 오늘 일어날 작은 사건: 조건에 맞는 것 중 확률로, 같은 group은 하나만, 최대 maxPerDay개
static func _pick_happenings(base: Dictionary, cfg: Dictionary, rng: Callable) -> Array:
	var order := []
	var idx := 0
	for h in cfg["list"]:
		order.append({"h": h, "k": rng.call(), "i": idx})
		idx += 1
	# JS sort는 안정 정렬: 같은 k면 원래 순서
	order.sort_custom(func(a, b): return a["k"] < b["k"] or (a["k"] == b["k"] and a["i"] < b["i"]))
	var picked := []
	var groups := {}
	var weather: Variant = base.get("weather")
	if weather == null:
		weather = "clear"
	for item in order:
		var h: Dictionary = item["h"]
		if float(picked.size()) >= float(cfg["maxPerDay"]):
			break
		if h.has("days") and not h["days"].has(base["id"]):
			continue
		if h.has("weather") and h["weather"] != weather:
			continue
		if h.has("group") and groups.has(h["group"]):
			continue
		if rng.call() >= float(h["chance"]):
			continue
		picked.append(h)
		if h.has("group"):
			groups[h["group"]] = true
		if h.has("setWeather"):
			weather = h["setWeather"]
	return picked


static func _variant_of(n: Dictionary, rng: Callable) -> Dictionary:
	var options := [{"at": n.get("at"), "path": n.get("path"), "from": n.get("from"), "to": n.get("to")}]
	options.append_array(n.get("alt", []))
	var o: Dictionary = options[int(floor(rng.call() * options.size()))]
	var out: Dictionary = n.duplicate()
	for k in ["at", "path", "from", "to"]:
		_assign(out, k, o.get(k))
	return _strip(out)


static func _strip(n: Dictionary) -> Dictionary:
	var rest: Dictionary = n.duplicate()
	rest.erase("alt")
	rest.erase("chance")
	return rest


## TS의 { ...x, key: undefined }: 값이 없으면 키를 지운다
static func _assign(d: Dictionary, key: String, value: Variant) -> void:
	if value == null:
		d.erase(key)
	else:
		d[key] = value


static func _arr(d: Dictionary, key: String) -> Array:
	var v: Variant = d.get(key)
	return v if v is Array else []


## JS Math.round (0.5는 +무한대 쪽으로)
static func _js_round(x: float) -> float:
	return floor(x + 0.5)
