extends SceneTree

## 합성음이 오류 없이 만들어지는지, 얼마나 걸리는지 (headless: 소리는 나지 않는다)
func _init() -> void:
	var cfg := DataLoader.load_config("ko")
	var a := AudioDirector.new()
	root.add_child(a)
	var t0 := Time.get_ticks_msec()
	a.setup(cfg["presentation"]["audio"], cfg["skills"]["earphones"])
	print("loops ready ms=", Time.get_ticks_msec() - t0)
	WorkerThreadPool.wait_for_task_completion(a._task)
	a._task = -1
	print("all sounds ms=", Time.get_ticks_msec() - t0, " count=", a.ready_count())
	quit()
