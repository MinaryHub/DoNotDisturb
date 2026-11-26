class_name SessionCase
extends TestCase

## GameSession 시험의 바탕: 입력을 흉내 내 하루를 진행하는 도우미 (웹 판 tests의 step·press·goTo)

const DT := 1.0 / 60.0

var cfg := DataLoader.load_config("ko")


## seconds초 동안 같은 입력으로 진행 (웹 판 Math.round(seconds / dt) 스텝)
func step(s: GameSession, seconds: float, c: Dictionary = {}) -> void:
	var ctl := GameSession.controls(c)
	for i in int(floor(seconds / DT + 0.5)):
		s.step(DT, ctl)


func press(s: GameSession, c: Dictionary) -> void:
	s.step(DT, GameSession.controls(c))


func interactable(id: String) -> Dictionary:
	for i in cfg["world"]["interactables"]:
		if i["id"] == id:
			return i
	return {}


func interactable_kind(kind: String) -> Dictionary:
	for i in cfg["world"]["interactables"]:
		if i["kind"] == kind:
			return i
	return {}


func go_to(s: GameSession, id: String) -> void:
	var it := interactable(id)
	s.player.pos = Vector2(float(it["at"][0]), float(it["at"][1]))
	step(s, 0.1)


func put(s: GameSession, x: float, y: float) -> void:
	s.player.pos = Vector2(x, y)


func npc(s: GameSession, id: String) -> Npc:
	for n in s.npcs:
		if n.id == id:
			return n
	return null


func day_index(id: String) -> int:
	var days: Array = cfg["days"]
	for i in days.size():
		if days[i]["id"] == id:
			return i
	return -1


## 확인 화면을 넘긴 새 하루 (월요일)
func new_day(options: Dictionary = {}) -> GameSession:
	var s := GameSession.new(cfg, {}, options)
	press(s, {"confirm": true})
	eq(s.mode["kind"], "free", "하루 시작")
	return s


func toast_keys(fxs: Array) -> Array:
	return fxs.filter(func(f): return f["type"] == "toast").map(func(f): return f["key"])


func find_by_id(list: Array, id: String) -> Dictionary:
	for x in list:
		if x["id"] == id:
			return x
	return {}


func open_shop(s: GameSession, shop_id: String, item: String) -> void:
	var stock: Array = cfg["items"]["shops"][shop_id]["stock"]
	var cursor := -1
	for i in stock.size():
		if stock[i]["item"] == item:
			cursor = i
			break
	s.mode = {"kind": "shop", "shopId": shop_id, "cursor": cursor}


## 박자 구간에서 Space (발화가 끝날 때까지). 지나간 발화 id 목록
func speak_through(s: GameSession, max_sec: float) -> Array:
	var speeches := []
	var i := 0
	while i < int(60 * max_sec) and s.mode["kind"] == "speech":
		var m := s.mode
		if speeches.is_empty() or speeches[-1] != m["speechId"]:
			speeches.append(m["speechId"])
		var ch: SpeechChallenge = m["challenge"]
		var z := ch.zone()
		var hit: bool = ch.marker > float(z["from"]) + 0.02 and ch.marker < float(z["to"]) - 0.02
		s.step(DT, GameSession.controls({"spacePressed": hit}))
		i += 1
	return speeches
