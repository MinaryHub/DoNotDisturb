class_name DataLoader
extends RefCounted

## /data의 JSON·CSV를 읽어 게임 설정(GameConfig, Dictionary)으로 묶는다.
## 키 이름은 데이터 파일 그대로(camelCase). 값은 JSON 그대로라 숫자는 float다.
## 웹(TypeScript) 판의 src/core/config.ts parseGameConfig에 대응한다.

const DATA := "res://data/"

const JSON_FILES := {
	"input": "input.json",
	"balance": "balance.json",
	"items": "items.json",
	"chores": "chores.json",
	"happenings": "happenings.json",
	"story": "story.json",
	"reputation": "reputation.json",
	"quietSpots": "quietSpots.json",
	"favors": "favors.json",
	"perks": "perks.json",
	"achievements": "achievements.json",
	"weekConditions": "weekConditions.json",
	"stimuli": "stimuli.json",
	"somatic": "somatic.json",
	"life": "life.json",
	"skills": "skills.json",
	"player": "player.json",
	"presentation": "presentation.json",
	"npcProfiles": "npcProfiles.json",
	"dialogueRules": "dialogueRules.json",
	"speeches": "speeches.json",
	"splash": "splash.json",
}

static var _cache := {}


## 언어별로 한 번만 읽는다 (월드 생성까지 포함하면 무겁다)
static func load_config(lang: String = "ko") -> Dictionary:
	if _cache.has(lang):
		return _cache[lang]
	var cfg := {}
	for key in JSON_FILES:
		cfg[key] = read_json(DATA + JSON_FILES[key])
	var campaign: Dictionary = read_json(DATA + "campaign.json")
	var days: Array = []
	for id in campaign["days"]:
		days.append(read_json(DATA + "days/%s.json" % id))
	cfg["days"] = days
	cfg["vacationDay"] = read_json(DATA + "days/%s.json" % campaign["vacation"]) if campaign.has("vacation") else null
	var tiles = read_json(DATA + "world/tiles.json")
	cfg["tiles"] = tiles["tiles"] if tiles is Dictionary else tiles
	# 월드: 손으로 만든 해오름동 + 규칙으로 만든 넓은 도시 + 손으로 만든 랜드마크 (CityGen이 합친다)
	cfg["worldParts"] = {
		"city": read_json(DATA + "world/city.json"),
		"districts": read_json(DATA + "world/districts.json"),
		"landmarks": read_json(DATA + "world/landmarks.json"),
	}
	cfg["dialoguePools"] = _dialogue_pools(lang)
	cfg["monologueTriggers"] = read_json(DATA + "monologue/triggers.json")
	var mono := parse_key_text_csv(read_text(DATA + "monologue/ko.csv"))
	if lang == "en":
		mono.merge(parse_key_text_csv(read_text(DATA + "monologue/en.csv")), true)
	cfg["monologue"] = mono
	var text: Dictionary = read_json(DATA + "text/ko.json")
	if lang == "en":
		text.merge(read_json(DATA + "text/en.json"), true)
	cfg["text"] = text
	cfg["lang"] = lang
	_cache[lang] = cfg
	return cfg


static func _dialogue_pools(lang: String) -> Dictionary:
	var pools := {}
	for f in DirAccess.get_files_at(DATA + "dialogue"):
		if not f.ends_with(".json"):
			continue
		var id := f.get_basename()
		var data = read_json(DATA + "dialogue/" + f)
		var en_path := DATA + "dialogue/en/" + f
		if lang == "en" and FileAccess.file_exists(en_path):
			data = overlay(data, read_json(en_path))
		pools[id] = data
	return pools


static func read_json(path: String) -> Variant:
	var text := read_text(path)
	var json := JSON.new()
	var err := json.parse(text)
	assert(err == OK, "JSON 오류: %s (%d줄) %s" % [path, json.get_error_line(), json.get_error_message()])
	return json.data


static func read_text(path: String) -> String:
	var f := FileAccess.open(path, FileAccess.READ)
	assert(f != null, "파일을 열 수 없습니다: %s" % path)
	return f.get_as_text()


## 번역본을 원본 위에 덮는다. 객체는 키별, 배열은 칸별로 겹치고 번역에 없는 값은 원본을 쓴다
static func overlay(base: Variant, top: Variant) -> Variant:
	if base is Array and top is Array:
		var out := []
		for i in base.size():
			out.append(overlay(base[i], top[i]) if i < top.size() else base[i])
		return out
	if base is Dictionary and top is Dictionary:
		var out: Dictionary = base.duplicate()
		for k in top:
			out[k] = overlay(base[k], top[k]) if base.has(k) else top[k]
		return out
	return base if top == null else top


## 아주 작은 CSV 파서 (따옴표·쉼표·"" 이스케이프)
static func parse_csv(text: String) -> Array:
	var rows := []
	var row := PackedStringArray()
	var field := ""
	var quoted := false
	var i := 0
	var n := text.length()
	while i < n:
		var c := text[i]
		if quoted:
			if c == "\"":
				if i + 1 < n and text[i + 1] == "\"":
					field += "\""
					i += 1
				else:
					quoted = false
			else:
				field += c
		elif c == "\"":
			quoted = true
		elif c == ",":
			row.append(field)
			field = ""
		elif c == "\n" or c == "\r":
			if c == "\r" and i + 1 < n and text[i + 1] == "\n":
				i += 1
			row.append(field)
			field = ""
			if _row_has_content(row):
				rows.append(row)
			row = PackedStringArray()
		else:
			field += c
		i += 1
	row.append(field)
	if _row_has_content(row):
		rows.append(row)
	return rows


static func _row_has_content(row: PackedStringArray) -> bool:
	for f in row:
		if f != "":
			return true
	return false


## key,text 형식 CSV → { key: text } (첫 줄은 헤더)
static func parse_key_text_csv(text: String) -> Dictionary:
	var out := {}
	var rows := parse_csv(text)
	for r in range(1, rows.size()):
		var row: PackedStringArray = rows[r]
		if row.size() > 0 and row[0] != "":
			out[row[0]] = row[1] if row.size() > 1 else ""
	return out


## 로컬라이제이션 키 조회. 없으면 키를 그대로 보여 누락을 드러낸다. {name} 치환
static func t(text: Dictionary, key: String, vars: Dictionary = {}) -> String:
	var s: String = text.get(key, key)
	for k in vars:
		s = s.replace("{%s}" % k, str(vars[k]))
	return s


## sim 계층 설정 묶음 (src/core/config.ts simConfigOf)
static func sim_config_of(cfg: Dictionary) -> Dictionary:
	var somatic: Dictionary = cfg["somatic"].duplicate()
	somatic["symptomFrom"] = cfg["balance"]["psyche"]["symptomFrom"]
	return {"energy": cfg["balance"], "somatic": somatic, "life": cfg["life"]["stats"]}
