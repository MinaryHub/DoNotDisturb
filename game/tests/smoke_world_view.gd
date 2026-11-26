extends SceneTree

## 3D 장면 눈으로 확인: 집·거리·공원·비 오는 밤·위험·도심을 그려 PNG로 남긴다
## xvfb-run -a -s "-screen 0 1280x720x24" godot --rendering-driver opengl3 --script res://game/tests/smoke_world_view.gd -- /경로/wv.png
## (wv.png → wv_home.png, wv_street.png …). GameSession 대신 약속(PORTING.md)의 이름만 가진 가짜 세션으로 그린다.


class FakePlayer:
	var pos := Vector2.ZERO
	var facing := PI / 2.0
	var moving := false
	var running := false
	var move_dir: Variant = null
	var earphones := false
	var phone_pretend := false
	var cover := false
	var eyes_closed := false
	var mask := false
	var hidden := false
	var locked_safe: Variant = null
	var walk_phase := 0.0
	var biking := false


class FakePhone:
	var ring := false

	func ringing() -> bool:
		return ring


class FakeClock:
	var minutes := 480.0


class FakeSession:
	var player := FakePlayer.new()
	var view_target: Variant = null
	var mode := {"kind": "free"}
	var clock := FakeClock.new()
	var phone := FakePhone.new()
	var crowd: Crowd
	var objectives: Objectives
	var npcs: Array = []
	var day: Dictionary
	var quiet_found := {}
	var item_break: Variant = null
	var rain := false
	var bus: BusRoute
	var world: World

	func active_npcs() -> Array:
		return npcs

	func raining() -> bool:
		return rain

	func buses_on_road() -> Array:
		return bus.buses_at(clock.minutes)


var cfg: Dictionary
var world: World
var view: WorldView3D
var s: FakeSession
var ps: PresentationState
var st: Settings
var out := ""
## 두 번째 인자: 이 이름이 들어간 장면만 (예: home)
var only := ""
var time := 0.0


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	out = args[0] if args.size() > 0 else "user://wv.png"
	only = args[1] if args.size() > 1 else ""
	var t0 := Time.get_ticks_msec()
	cfg = DataLoader.load_config("ko")
	world = World.build_world(cfg["world"], cfg["tiles"])
	print("config+world ms ", Time.get_ticks_msec() - t0)
	s = FakeSession.new()
	s.world = world
	s.day = cfg["days"][0]
	s.objectives = Objectives.new(s.day)
	var seed := [12345]
	var rng := func() -> float:
		seed[0] = (seed[0] * 1103515245 + 12345) & 0x7FFFFFFF
		return float(seed[0]) / float(0x7FFFFFFF)
	s.crowd = Crowd.new(world.def["crowdLanes"], rng)
	s.bus = BusRoute.new(world.def["bus"], cfg["balance"]["bus"])
	ps = PresentationState.new(cfg["balance"])
	st = Settings.new()
	t0 = Time.get_ticks_msec()
	view = WorldView3D.new()
	get_root().add_child(view)
	view.setup(cfg, world)
	print("view setup ms ", Time.get_ticks_msec() - t0)
	_run.call_deferred()


func _npc(id: String, profile: String, at: Vector2, facing: float) -> Npc:
	var n := Npc.new({"id": id, "profileId": profile, "profile": cfg["npcProfiles"][profile], "pos": at})
	n.facing = facing
	return n


func _frames(n: int, move: bool = false) -> void:
	for i in n:
		var dt := 1.0 / 60.0
		time += dt
		ps.time = time
		if move:
			s.player.walk_phase += dt * 9.0
		s.crowd.update(dt, s.player.pos, 0.3)
		var t0 := Time.get_ticks_usec()
		view.update_view(s, ps, st, dt)
		if i == n - 1 or i < 2:
			print("  update_view us ", Time.get_ticks_usec() - t0, "  ", view.stats())
		await process_frame


func _shot(tag: String) -> void:
	await process_frame
	var img := get_root().get_texture().get_image()
	var path := out.get_basename() + "_" + tag + ".png"
	img.save_png(path)
	print("saved ", path)


func _scene(tag: String, pos: Vector2, minutes: float, facing: float = PI / 2.0) -> void:
	if only != "" and not tag.contains(only):
		return
	s.player.pos = pos
	s.player.facing = facing
	s.clock.minutes = minutes
	await _frames(30, s.player.moving)
	await _shot(tag)


func _run() -> void:
	var t0 := Time.get_ticks_msec()
	# 1. 집 (아침): 고양이와 함께
	var cat := _npc("cat", "cat", Vector2(137, 472.5), 0.0)
	s.npcs = [cat]
	await _scene("home", world.spawns["player"], 472.0)
	print("home total ms ", Time.get_ticks_msec() - t0)
	# 2. 출근길 대로 (러시아워): 전단지·행인·버스
	var flyer := _npc("flyer", "flyer", Vector2(141, 70.6), PI * 0.75)
	flyer.notice = 0.6
	flyer.state = "notice"
	flyer.percept = {"dist": 3.0, "inView": true, "heard": false, "eyeContact": true}
	flyer.gazing = true
	var walker := _npc("acq", "acquaintance", Vector2(132, 72), 0.0)
	walker.speed = 1.0
	s.npcs = [flyer, walker]
	s.player.moving = true
	ps.stress = 0.3
	await _scene("street", Vector2(138, 72.5), 516.0, -PI / 2.0)
	print("  flyer at ", view.project(flyer.pos), "  player at ", view.project(s.player.pos))
	s.player.moving = false
	# 3. 공원 (노을)
	var friend := _npc("friend", "friend", Vector2(73.5, 29.4), PI / 2.0)
	s.npcs = [friend]
	ps.stress = 0.0
	await _scene("park", Vector2(73.5, 32.0), 1111.0)
	# 4. 비 오는 밤 거리
	s.rain = true
	s.npcs = []
	await _scene("rain_night", Vector2(110, 60), 1260.0)
	s.rain = false
	# 5. 위험 구간: 세상이 멀어지고 벽이 솟는다
	ps.danger = 0.9
	ps.tired = 1.0
	ps.stress = 0.8
	await _scene("danger", Vector2(150, 30), 600.0)
	ps.danger = 0.0
	ps.tired = 0.0
	ps.stress = 0.0
	# 6. 도심 (자동 생성 구역)
	await _scene("downtown", Vector2(560, 66), 780.0)
	# 7. 회사 안 (지붕이 걷힌 건물)
	await _scene("office", Vector2(150, 15), 560.0)
	# 화면 좌표 변환 확인
	var sp := view.project(s.player.pos, 1.8)
	print("project(player, 1.8) = ", sp)
	print("total ms ", Time.get_ticks_msec() - t0)
	quit()
