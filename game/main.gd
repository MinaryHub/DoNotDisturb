extends Node

## 진입점 (임시: 내보내기 확인용. 게임 화면은 이어서 붙인다)


func _ready() -> void:
	var t0 := Time.get_ticks_msec()
	var cfg := DataLoader.load_config("ko")
	var world := World.build_world(cfg["world"], cfg["tiles"])
	print("DND_BOOT ok days=%d map=%dx%d ms=%d" % [cfg["days"].size(), world.map.width, world.map.height, Time.get_ticks_msec() - t0])
	var l := Label.new()
	l.text = DataLoader.t(cfg["text"], "title.subtitle") if cfg["text"].has("title.subtitle") else "방해 금지 모드"
	l.add_theme_font_override("font", load("res://game/assets/fonts/NotoSansKR-subset.ttf"))
	l.add_theme_font_size_override("font_size", 40)
	l.position = Vector2(80, 300)
	add_child(l)
