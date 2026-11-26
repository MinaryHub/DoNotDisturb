extends SceneTree

## 한 주 밸런스 표 (웹 판 npm run balance = tools/balance-week.ts):
##   godot --headless --script res://game/tools/balance.gd [-- 출퇴근초] < /dev/null
## 세 가지 플레이 방식으로 한 주를 돌려 날마다 배터리·생활 지표·돈을 표로 보여 준다.
## 밸런스 수치를 바꾼 뒤 '적당히'가 버티고, '전부 회피'·'전부 수용'이 각각 실패하는지 바로 확인한다.

const RUNS := [
	{"policy": "avoid", "extras": false},
	{"policy": "accept", "extras": false},
	{"policy": "balanced", "extras": false},
	{"policy": "balanced", "extras": false, "skilled": true},
	{"policy": "balanced", "extras": true},
	{"policy": "balanced", "extras": true, "skilled": true},
]


func _init() -> void:
	var game := DataLoader.load_config("ko")
	var args := OS.get_cmdline_user_args()
	var commute_sec := float(args[0]) if args.size() > 0 else 120.0
	for run in RUNS:
		var skilled: bool = run.get("skilled", false)
		var r := WeekSim.play_week(game, run["policy"], {"commuteSec": commute_sec, "extras": run["extras"], "skilled": skilled})
		print("\n■ %s%s%s  (출퇴근 %s초)" % [run["policy"], " + 기술·조용한 곳·부탁" if run["extras"] else "", " + 능숙(화장실 칸)" if skilled else "", _num(commute_sec)])
		for d in r["rows"]:
			var l: Dictionary = d["life"]
			print("  %s 상한 %3d  밤 배터리 %3d  대화 %d  소득 %s 주거 %s 필수 %s 관계 %s  돈 %s" % [
				String(d["day"]).rpad(7), int(round(d["maxBattery"])), int(round(d["batteryEnd"])), d["talks"],
				_num(l["income"]), _num(l["housing"]), _num(l["essentials"]), _num(l["bond"]), GameSession.fmt_num(d["money"])])
		if r["failed"] != "":
			print("  → %s에 실패: %s%s" % [r["day"], r["failed"], " (%s)" % r["stat"] if r.has("stat") else ""])
		else:
			print("  → 한 주를 버팀")
	quit()


## JS 숫자 출력처럼 (정수면 소수점 없이)
static func _num(v: float) -> String:
	return str(int(v)) if v == floor(v) else str(v)
