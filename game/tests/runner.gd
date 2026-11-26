extends SceneTree

## GDScript 테스트 실행기: godot --headless --script res://game/tests/runner.gd [-- 이름 일부]
## res://game/tests의 test_*.gd 파일마다 test_로 시작하는 메서드를 돌린다.


func _init() -> void:
	var filter := ""
	var args := OS.get_cmdline_user_args()
	if args.size() > 0:
		filter = args[0]
	var total := 0
	var failed: Array = []
	var dir := "res://game/tests/"
	var files := DirAccess.get_files_at(dir)
	files.sort()
	for f in files:
		if not (f.begins_with("test_") and f.ends_with(".gd")) or f == "test_case.gd":
			continue
		var script: GDScript = load(dir + f)
		var suite = script.new()
		var methods: Array = []
		for m in script.get_script_method_list():
			if String(m["name"]).begins_with("test_"):
				methods.append(m["name"])
		for name in methods:
			var full := "%s::%s" % [f.get_basename(), name]
			if filter != "" and not full.contains(filter):
				continue
			total += 1
			suite.current = full
			var before: int = suite.failures.size()
			var finished = suite.call(name)
			if finished != true:
				suite.failures.append("%s: 끝까지 돌지 못함 (스크립트 오류)" % full)
			if suite.failures.size() > before:
				failed.append(full)
				print("✗ ", full)
				for i in range(before, suite.failures.size()):
					print("    ", suite.failures[i])
			else:
				print("✓ ", full)
	print("\n%d개 중 %d개 통과" % [total, total - failed.size()])
	quit(1 if failed.size() > 0 else 0)
