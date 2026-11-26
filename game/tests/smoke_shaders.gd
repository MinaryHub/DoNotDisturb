extends SceneTree

## 셰이더가 컴파일되고 그려지는지 (xvfb-run godot --rendering-driver opengl3 --script ...)
func _init() -> void:
	var root3d := Node3D.new()
	get_root().add_child(root3d)
	var cam := Camera3D.new()
	root3d.add_child(cam)
	cam.look_at_from_position(Vector3(8, 3, 11), Vector3(8, 0.8, 8))
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-50, -30, 0)
	root3d.add_child(light)
	# 바닥: 4종 타일을 줄마다
	var img := Image.create(16, 16, false, Image.FORMAT_R8)
	for y in 16:
		for x in 16:
			img.set_pixel(x, y, Color8(y / 4, 0, 0))
	var ids := ImageTexture.create_from_image(img)
	var pal := Image.create(4, 2, false, Image.FORMAT_RGBA8)
	var cols := [Color("#cfa97f"), Color("#bdb6aa"), Color("#86a873"), Color("#67666f")]
	var pats := [2, 1, 4, 0]
	var specials := [0, 1, 0, 3]
	for i in 4:
		var c0: Color = cols[i]
		c0.a8 = pats[i]
		pal.set_pixel(i, 0, c0)
		var c1: Color = cols[i].darkened(0.2)
		c1.a8 = specials[i]
		pal.set_pixel(i, 1, c1)
	var m := ShaderMaterial.new()
	m.shader = load("res://game/presentation/shaders/tile_floor.gdshader")
	m.set_shader_parameter("tile_ids", ids)
	m.set_shader_parameter("palette", ImageTexture.create_from_image(pal))
	var plane := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(16, 16)
	plane.mesh = pm
	plane.position = Vector3(8, 0, 8)
	plane.material_override = m
	root3d.add_child(plane)
	var rig := PersonRig.new()
	root3d.add_child(rig)
	rig.build_person(Looks.look_for("player", "#6c8fb2"), 1.6, true)
	rig.position = Vector3(8, 0, 8)
	# 화면 효과
	var layer := CanvasLayer.new()
	get_root().add_child(layer)
	var rect := ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	var pm2 := ShaderMaterial.new()
	pm2.shader = load("res://game/presentation/shaders/psych_screen.gdshader")
	pm2.set_shader_parameter("stress", 0.8)
	pm2.set_shader_parameter("tired", 0.5)
	pm2.set_shader_parameter("flush", 0.6)
	rect.material = pm2
	layer.add_child(rect)
	for i in 8:
		await process_frame
		rig.pose({"look": Looks.look_for("player", "#6c8fb2"), "walking": true, "walkPhase": i * 0.4, "tension": 0.5}, i / 60.0)
	var shot := get_root().get_texture().get_image()
	shot.save_png(OS.get_cmdline_user_args()[0] if OS.get_cmdline_user_args().size() > 0 else "user://smoke.png")
	print("ok ", shot.get_size())
	quit()
