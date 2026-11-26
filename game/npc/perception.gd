class_name Perception
extends RefCounted

## NPC 지각 (CLAUDE.md 5.9): 시야 콘(각도·거리, 시선 차단 레이캐스트), 청각 반경, 아이컨택. 웹 판 src/npc/perception.ts
## PlayerPercept (NPC가 지각하는 플레이어 정보, 연출 계층과 무관한 순수 데이터) = {
##   pos: Vector2,
##   facing: float      바라보는 방향 (라디안, +x = 0, +y = π/2)
##   moving: bool,
##   noise: float       발소리 크기 배율 (달리기 > 1)
##   phonePretend: bool, eyesClosed: bool, hidden: bool,
##   unreachable: bool  잠근 칸·집·엘리베이터 안 등 NPC가 닿을 수 없는 상태
## }
## 결과(Perception) = { dist: float, inView: bool, heard: bool, eyeContact: bool }


static func angle_diff(a: float, b: float) -> float:
	var d := fmod(a - b, PI * 2.0)
	if d > PI:
		d -= PI * 2.0
	if d < -PI:
		d += PI * 2.0
	return absf(d)


static func angle_to(from: Vector2, to: Vector2) -> float:
	return atan2(float(to.y) - float(from.y), float(to.x) - float(from.x))


## p: NPC 프로필 (npcProfiles.json 한 항목), player: PlayerPercept
static func perceive(map: CityGrid, npc_pos: Vector2, npc_facing: float, p: Dictionary, player: Dictionary) -> Dictionary:
	var ppos: Vector2 = player["pos"]
	var dist := CityGrid.dist(ppos, npc_pos)
	var view_dist := float(p["viewDistance"]) * (0.45 if player["hidden"] else 1.0)
	var in_view := false
	if dist <= view_dist:
		var ang := angle_diff(angle_to(npc_pos, ppos), npc_facing)
		in_view = ang <= float(p["viewHalfAngleDeg"]) * PI / 180.0 and map.line_of_sight(npc_pos, ppos)
	var heard: bool = player["moving"] and dist <= float(p["hearingRadius"]) * float(player["noise"]) and not player["hidden"]
	# 아이컨택: 서로 마주 보는 상태. 폰 보는 척·눈 감기는 아이컨택 판정을 차단한다
	var eye_rad := float(p["eyeContactAngleDeg"]) * PI / 180.0
	var eye_contact: bool = in_view \
		and not player["phonePretend"] \
		and not player["eyesClosed"] \
		and angle_diff(angle_to(ppos, npc_pos), float(player["facing"])) <= eye_rad * 1.8 \
		and angle_diff(angle_to(npc_pos, ppos), npc_facing) <= eye_rad * 2.5
	return {"dist": dist, "inView": in_view, "heard": heard, "eyeContact": eye_contact}
