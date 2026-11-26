extends TestCase

## Phase 3 완료 기준: "전부 회피하는 플레이와 전부 수용하는 플레이가 각각 다른 이유로 실패한다"
## + 밸런스 기준: "적당히 하는 플레이는 한 주를 버틴다" (game/tools/week_sim.gd, game/tools/balance.gd)
## 웹 판 tests/sim.test.ts '정책 시뮬레이션: 회피 vs 수용 vs 적당히'

var game := DataLoader.load_config("ko")


func _end(r: Dictionary, id: String) -> float:
	return WeekSim.row(r, id)["batteryEnd"]


func test_accept_burns_out() -> bool:
	eq(WeekSim.play_week(game, "accept")["failed"], "burnout")
	return true


func test_avoid_collapses() -> bool:
	var r := WeekSim.play_week(game, "avoid")
	eq(r["failed"], "collapse")
	ok(r.has("stat"), "무너진 지표")
	return true


func test_balanced_survives() -> bool:
	var r := WeekSim.play_week(game, "balanced")
	eq(r["failed"], "")
	for d in r["rows"]:
		for v in d["life"].values():
			gt(v, 20, d["day"])
	return true


func test_balanced_not_capped() -> bool:
	var r := WeekSim.play_week(game, "balanced")
	for d in r["rows"].slice(3):
		for v in d["life"].values():
			lt(v, 95, d["day"])
	return true


func test_week_fatigue() -> bool:
	for extras in [false, true]:
		var r := WeekSim.play_week(game, "balanced", {"commuteSec": 120.0, "extras": extras})
		var early := (_end(r, "day1") + _end(r, "day2")) / 2.0
		# 기술·조용한 곳을 찾아 쓴 만큼은 편해지되, 그 차이가 크지 않게
		lt(_end(r, "day3"), early + 15)
		lt(_end(r, "day4"), early + 15)
		if not extras:
			for d in ["day3", "day4"]:
				lt(_end(r, d), early, d)
	return true


func test_extras_thursday_still_tight() -> bool:
	var plain := WeekSim.play_week(game, "balanced")
	var r := WeekSim.play_week(game, "balanced", {"commuteSec": 120.0, "extras": true})
	eq(r["failed"], "")
	# 회복 수단을 찾아 쓴 만큼은 편해지지만, 반 넘게 남지는 않는다
	gt(_end(r, "dayThu"), _end(plain, "dayThu"))
	lt(_end(r, "dayThu"), 50)
	return true


func test_skilled_thursday_still_tight() -> bool:
	var plain := WeekSim.play_week(game, "balanced")
	var r := WeekSim.play_week(game, "balanced", {"commuteSec": 120.0, "skilled": true})
	eq(r["failed"], "")
	gt(_end(r, "dayThu"), _end(plain, "dayThu"))
	lt(_end(r, "dayThu"), 50)
	return true
