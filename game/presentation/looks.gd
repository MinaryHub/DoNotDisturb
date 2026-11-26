class_name Looks
extends RefCounted

## 사람의 생김새: id 해시로 정해져 같은 사람은 매번 같은 모습 (웹 판 draw/people.ts lookFor와 같은 값)
## look = { skin, hair, hairStyle, top, accessory, accent, pattern, shoes, bottom, build }

const SKINS := ["#f3dcc6", "#ecd0b4", "#e2bf9e", "#d6ae8b", "#c49a76"]
const HAIRS := ["#2b2523", "#3a2c25", "#4d3a2e", "#6b4f3a", "#24242a", "#8a7f78", "#b98e5c"]
const STYLES := ["short", "short", "long", "long", "bun", "cap", "bald", "ponytail", "curly", "short"]
const CROWD_ACCESSORIES := ["none", "none", "bag", "backpack", "phone", "phone", "glasses"]
const NAMED_ACCESSORIES := ["none", "none", "bag", "glasses", "phone", "backpack"]
const ACCENTS := ["#4b5563", "#7c5c3e", "#2f4858", "#8b3a3a", "#355e3b", "#d9cbb4"]
const PATTERNS := ["plain", "plain", "plain", "stripe", "collar", "jacket", "jacket", "hoodie"]
const SHOES := ["#2b2523", "#f4f1ea", "#5b4636", "#3d5a80", "#2b2523"]
const BOTTOMS := ["#2f3542", "#3d5a80", "#4a4a4a", "#6b5b4b", "#283044", "#8c8577", "#1f2329"]
const BUILDS := [0.9, 0.96, 1.0, 1.0, 1.04, 1.1]
const UMBRELLAS := ["#3b6fb6", "#2f3e46", "#c0392b", "#f2c94c", "#5b7d63", "#e8e2d6", "#6c5b7b"]


static func _pick(list: Array, h: int, salt: int):
	var a := h >> (salt * 3)
	var b := (h * (salt * 2 + 1)) & 0xFFFFFFFF
	return list[((a ^ b) & 0xFFFFFFFF) % list.size()]


static func look_for(seed: String, top: String, override: Dictionary = {}, accessories: Array = CROWD_ACCESSORIES) -> Dictionary:
	var h := Roofs.hash_of(seed)
	return {
		"skin": override.get("skin", _pick(SKINS, h, 1)),
		"hair": override.get("hair", _pick(HAIRS, h, 2)),
		"hairStyle": override.get("hairStyle", _pick(STYLES, h, 3)),
		"top": top,
		"accessory": override.get("accessory", _pick(accessories, h, 4)),
		"accent": override.get("accent", _pick(ACCENTS, h, 5)),
		"pattern": _pick(PATTERNS, h, 6),
		"shoes": _pick(SHOES, h, 7),
		"bottom": _pick(BOTTOMS, h, 8),
		"build": _pick(BUILDS, h, 9),
	}


## hsl(도, %, %) → "#rrggbb"
static func hsl_hex(h: float, s: float, l: float) -> String:
	return _hsl(h, s, l)


static func _hsl(h: float, s: float, l: float) -> String:
	var sf := s / 100.0
	var lf := l / 100.0
	var c := (1.0 - absf(2.0 * lf - 1.0)) * sf
	var hp := fposmod(h, 360.0) / 60.0
	var x := c * (1.0 - absf(fmod(hp, 2.0) - 1.0))
	var rgb := Vector3.ZERO
	if hp < 1: rgb = Vector3(c, x, 0)
	elif hp < 2: rgb = Vector3(x, c, 0)
	elif hp < 3: rgb = Vector3(0, c, x)
	elif hp < 4: rgb = Vector3(0, x, c)
	elif hp < 5: rgb = Vector3(x, 0, c)
	else: rgb = Vector3(c, 0, x)
	var m := lf - c / 2.0
	return Color(rgb.x + m, rgb.y + m, rgb.z + m).to_html(false)
