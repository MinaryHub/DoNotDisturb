extends SessionCase

## 이동 수단: 공유 자전거·마을버스·지하철 (웹 판 tests/bike.test.ts · bus.test.ts '마을버스 타기'·'지하철')
## 버스 시간표 시험은 test_gameplay.gd에 있다.


func _at_dock(id: String) -> GameSession:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.clock.minutes = DayCycle.parse_time("11:00")
	go_to(s, id)
	return s


# ── 공유 자전거

func test_bike_rent_fast_return() -> bool:
	var s := _at_dock("bikeOffice")
	var money := s.sim.life.money
	press(s, {"interactPressed": true})
	ok(s.player.biking, "탄다")
	eq(s.sim.life.money, money - float(cfg["balance"]["bike"]["fare"]))
	# 같은 시각·같은 자리에서 걸어간 사람과 비교
	var walker := _at_dock("bikeOffice")
	var x0 := s.player.pos.x
	step(s, 1.5, {"move": Vector2(-1, 0)})
	step(walker, 1.5 + DT, {"move": Vector2(-1, 0)})
	gt(x0 - s.player.pos.x, (x0 - walker.player.pos.x) * 1.8, "걷기보다 빠르다")
	step(s, 0.2, {"move": Vector2(1, 0)})
	s.player.pos.x = float(interactable("bikeOffice")["at"][0])
	step(s, 0.1)
	press(s, {"interactPressed": true})
	ok(not s.player.biking, "반납")
	return true


func test_bike_no_phone_parks_at_door() -> bool:
	var s := _at_dock("bikeOffice")
	press(s, {"interactPressed": true})
	press(s, {"phoneToggle": true})
	ok(not s.phone_open, "폰을 열 수 없다")
	put(s, 150, 25)
	step(s, 0.1)
	ok(not s.player.biking, "건물 앞에 세운다")
	return true


func test_bike_off_anywhere() -> bool:
	var s := _at_dock("bikeOffice")
	press(s, {"interactPressed": true})
	ok(s.player.biking)
	step(s, 1, {"move": Vector2(-1, 0)})
	ok(s.prompt != null and s.prompt["labelKey"] == "interact.bikeOff", "내리기 안내")
	press(s, {"interactPressed": true})
	ok(not s.player.biking, "그 자리에서 내린다")
	return true


# ── 마을버스 타기

func test_bus_ride() -> bool:
	var route := BusRoute.new(cfg["world"]["bus"], cfg["balance"]["bus"])
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.clock.minutes = DayCycle.parse_time("11:00")
	go_to(s, "busW_east")
	var money := s.sim.life.money
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "bus")
	var i := 0
	while i < 60 * (int(cfg["balance"]["bus"]["intervalMin"]) + 1) and not (s.mode["kind"] == "bus" and s.mode["phase"] == "riding"):
		s.step(DT, GameSession.NO_CONTROLS)
		i += 1
	ok(s.mode["kind"] == "bus" and s.mode["phase"] == "riding", "탔다")
	eq(s.sim.life.money, money - float(cfg["balance"]["bus"]["fare"]))
	var x0 := s.player.pos.x
	step(s, 2)
	# 타고 가는 동안 시간이 빨리 흐른다
	gt(s.player.pos.x, x0 + 20)
	gt(s.crowd_level, 0)
	step(s, 60)
	eq(s.mode["kind"], "free")
	near(s.player.pos.x, route.stop_x("east"), 1)
	near(s.player.pos.y, float(cfg["world"]["bus"]["curbSouthY"]), 4, "보도 (float32)")
	return true


func test_bus_wait_cancel() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	go_to(s, "busM_west")
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "bus")
	press(s, {"move": Vector2(1, 0)})
	eq(s.mode["kind"], "free")
	return true


# ── 지하철

func test_metro() -> bool:
	var s := GameSession.new(cfg)
	press(s, {"confirm": true})
	s.clock.minutes = DayCycle.parse_time("11:00")
	go_to(s, "metroHaeoreum")
	press(s, {"interactPressed": true})
	eq(s.mode["kind"], "metroMenu")
	var dests := s.metro_destinations("haeoreum")
	var central := -1
	for i in dests.size():
		if dests[i]["id"] == "central":
			central = i
	for i in central:
		press(s, {"menuNav": 1})
	var money := s.sim.life.money
	var t0 := s.clock.minutes
	press(s, {"phoneReply": true})
	eq(s.mode["kind"], "metro")
	eq(s.sim.life.money, money - float(cfg["balance"]["metro"]["fare"]))
	step(s, 30)
	eq(s.mode["kind"], "free")
	var st: Dictionary = cfg["world"]["metro"]["stations"]["central"]
	near(s.player.pos.x, float(st["at"][0]), 1)
	ok(s.clock.minutes - t0 >= float(dests[central]["stops"]) * float(cfg["balance"]["metro"]["minutesPerStop"]) - 1, "시간이 빨리 흐른다")
	return true
