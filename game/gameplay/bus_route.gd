class_name BusRoute
extends RefCounted

## 마을버스 시간표 (city.json의 bus + balance.json의 bus). 시각(분)만으로 버스 위치가 정해진다.
## 동쪽 방면은 서쪽 끝에서, 서쪽 방면은 동쪽 끝에서 intervalMin마다 출발해 정류장마다 dwellMin씩 선다.
## 화면의 버스와 플레이어가 기다리는 버스가 같은 시간표를 따른다. 웹 판 src/gameplay/Bus.ts
## dir: 1(동쪽 방면) | -1(서쪽 방면)
## BusTiming = { intervalMin, tilesPerMin, dwellMin } (balance.json bus를 그대로 넘겨도 된다)
## BusOnRoad = { x, y, dir, depart(출발 시각, 같은 버스를 알아보는 데 쓴다), stopped(정류장에 서 있는지) }

var _route: Dictionary
var _interval: float
var _tiles_per_min: float
var _dwell: float


func _init(route: Dictionary, timing: Dictionary) -> void:
	_route = route
	_interval = float(timing["intervalMin"])
	_tiles_per_min = float(timing["tilesPerMin"])
	_dwell = float(timing["dwellMin"])


func _start(dir: int) -> float:
	return float(_route["fromX"]) if dir == 1 else float(_route["toX"])


## 이 방향으로 지나는 정류장 x (지나는 순서대로)
func _stops_along(dir: int) -> Array:
	var xs: Array = []
	for id in _route["stops"]:
		xs.append(float(_route["stops"][id]["x"]))
	xs.sort()
	if dir == -1:
		xs.reverse()
	return xs


## 출발 뒤 이 정류장에 닿기까지 걸리는 분 (정류장에 서는 시간 포함)
func _reach_min(dir: int, x: float) -> float:
	var before := 0
	for s in _stops_along(dir):
		if (s - x) * dir < 0:
			before += 1
	return absf(x - _start(dir)) / _tiles_per_min + before * _dwell


## 출발 뒤 elapsed분이 지났을 때 버스의 x와 정류장에 서 있는지 → { x, stopped }. 노선을 벗어났으면 null
func _position_after(dir: int, elapsed: float) -> Variant:
	if elapsed < 0:
		return null
	var x := _start(dir)
	var left := elapsed
	for s in _stops_along(dir):
		var run := absf(s - x) / _tiles_per_min
		if left < run:
			return {"x": x + dir * left * _tiles_per_min, "stopped": false}
		left -= run
		x = s
		if left < _dwell:
			return {"x": x, "stopped": true}
		left -= _dwell
	var end := float(_route["toX"]) if dir == 1 else float(_route["fromX"])
	var nx := x + dir * left * _tiles_per_min
	return null if (nx - end) * dir > 0 else {"x": nx, "stopped": false}


## 지금 도로 위의 버스들 → Array[BusOnRoad]
func buses_at(now: float) -> Array:
	var out := []
	for dir in [1, -1]:
		var offset := 0.0 if dir == 1 else _interval / 2.0
		var span := absf(float(_route["toX"]) - float(_route["fromX"])) / _tiles_per_min + _stops_along(dir).size() * _dwell
		var latest := floorf((now - offset) / _interval) * _interval + offset
		var depart := latest
		while depart > now - span - _interval:
			var p: Variant = _position_after(dir, now - depart)
			if p != null:
				out.append({"x": p["x"], "y": lane_y(dir), "dir": dir, "depart": depart, "stopped": p["stopped"]})
			depart -= _interval
	return out


## 정류장(x)에 now 이후 처음 서는 버스의 출발 시각과 도착 시각 → { depart, arrive }
func next_at(dir: int, x: float, now: float) -> Dictionary:
	var offset := 0.0 if dir == 1 else _interval / 2.0
	var reach := _reach_min(dir, x)
	# 정류장에 서 있는 동안 왔으면 그 버스를 탄다
	var depart := ceilf((now - reach - _dwell - offset) / _interval) * _interval + offset
	if depart + reach + _dwell <= now:
		depart += _interval
	return {"depart": depart, "arrive": depart + reach}


## 이 출발 버스가 now에 있는 곳 (정류장을 지나 목적지까지). 없으면 null
func bus_at(dir: int, depart: float, now: float) -> Variant:
	var p: Variant = _position_after(dir, now - depart)
	if p == null:
		return null
	return {"x": p["x"], "y": lane_y(dir), "dir": dir, "depart": depart, "stopped": p["stopped"]}


## 이 출발 버스가 정류장(x)을 떠나는 시각
func leaves_at(dir: int, depart: float, x: float) -> float:
	return depart + _reach_min(dir, x) + _dwell


## 이 출발 버스가 정류장(x)에 닿는 시각
func reaches_at(dir: int, depart: float, x: float) -> float:
	return depart + _reach_min(dir, x)


func lane_y(dir: int) -> float:
	return float(_route["laneEastY"]) if dir == 1 else float(_route["laneWestY"])


## 정류장에서 내리는 자리: 동쪽 방면은 남쪽 보도, 서쪽 방면은 북쪽 보도
func alight_at(dir: int, x: float) -> Vector2:
	return Vector2(x, float(_route["curbSouthY"]) if dir == 1 else float(_route["curbNorthY"]))


func stop_x(id: String) -> float:
	return float(_route["stops"][id]["x"])
