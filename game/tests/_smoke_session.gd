extends SceneTree

func _init() -> void:
	var t0 := Time.get_ticks_msec()
	var cfg := DataLoader.load_config()
	print("cfg ", Time.get_ticks_msec() - t0)
	t0 = Time.get_ticks_msec()
	var s := GameSession.new(cfg)
	print("new ", Time.get_ticks_msec() - t0)
	s.step(1.0 / 60, GameSession.controls({"confirm": true}))
	print(s.mode["kind"])
	t0 = Time.get_ticks_usec()
	for i in 600:
		s.step(1.0 / 60, GameSession.controls({"move": Vector2(1, 0)}))
	print("600 steps us/step ", (Time.get_ticks_usec() - t0) / 600.0)
	s.player.pos = Vector2(150, 58)
	t0 = Time.get_ticks_usec()
	for i in 600:
		s.step(1.0 / 60, GameSession.NO_CONTROLS)
	print("outdoor us/step ", (Time.get_ticks_usec() - t0) / 600.0, " ", s.mode["kind"], " ", s.clock.label())
	quit()
