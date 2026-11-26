class_name Settings
extends RefCounted

## 접근성·환경 설정 (CLAUDE.md 7 접근성). user://settings.json에 저장 (그 기기에만)
## Godot 판은 3D 시점 하나라 웹 판의 view25d·view3d는 없다.

const PATH := "user://settings.json"

## 왜곡 강도 배율 0~1
var distortion := 1.0
var shake := true
var chromatic := true
var flash := true
var master := 0.8
var heartbeat := 1.0
var tinnitus := 1.0
## 소리 큐의 시각 대체 표시 (파동·자막)
var visual_cues := true
## 숫자 없는 기운·긴장 게이지
var stress_gauge := true
## 증상별 게이지
var symptom_gauge := true
## 화면 아래 단축키 안내
var controls_hint := true
## 부드러운 빛 (화면 전체에 번지는 빛)
var soft_glow := true
var lang := "ko"

const FIELDS := ["distortion", "shake", "chromatic", "flash", "master", "heartbeat", "tinnitus", "visual_cues", "stress_gauge", "symptom_gauge", "controls_hint", "soft_glow", "lang"]


static func load_settings() -> Settings:
	var s := Settings.new()
	s.lang = "ko" if OS.get_locale_language() == "ko" else "en"
	if FileAccess.file_exists(PATH):
		var f := FileAccess.open(PATH, FileAccess.READ)
		var data = JSON.parse_string(f.get_as_text()) if f else null
		if data is Dictionary:
			for k in FIELDS:
				if data.has(k):
					s.set(k, data[k])
	return s


func save() -> void:
	var data := {}
	for k in FIELDS:
		data[k] = get(k)
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data, "  "))
