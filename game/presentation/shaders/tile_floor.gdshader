// 바닥: 맵 전체를 덮는 타일 번호 텍스처(1칸 = 1텍셀)와 색표로, 칸마다 바닥 무늬를 그린다.
// 웹 판 draw/tiles.ts paintFloor의 무늬(마루·타일·보도블록·점·줄무늬)를 셰이더로 옮겼다.
// palette: 가로 = 타일 번호, 0줄 = 색(rgb) + 무늬(a), 1줄 = 줄눈·결 색(rgb) + 특수(a)
//   무늬 a×255: 0 없음, 1 grid, 2 plank, 3 stripe, 4 dots
//   특수 a×255: 0 없음, 1 보도블록(엇갈린 벽돌), 2 광장(2칸 큰 타일), 3 차도(차선), 4 물
shader_type spatial;
render_mode diffuse_burley, specular_disabled;

uniform sampler2D tile_ids : filter_nearest;
uniform sampler2D palette : filter_nearest;
uniform vec2 map_origin = vec2(0.0);
uniform float time = 0.0;
uniform vec3 tint : source_color = vec3(1.0);

varying vec2 wpos;

void vertex() {
	vec4 w = MODEL_MATRIX * vec4(VERTEX, 1.0);
	wpos = w.xz;
}

float hash2(vec2 p, float k) {
	return fract(sin(dot(p, vec2(127.1, 311.7)) + k * 74.7) * 43758.5453);
}

float line(float v, float at, float w) {
	return 1.0 - smoothstep(0.0, w, abs(v - at));
}

void fragment() {
	vec2 cell = floor(wpos);
	vec2 f = wpos - cell;
	ivec2 tc = ivec2(cell - map_origin);
	int id = int(texelFetch(tile_ids, tc, 0).r * 255.0 + 0.5);
	vec4 p0 = texelFetch(palette, ivec2(id, 0), 0);
	vec4 p1 = texelFetch(palette, ivec2(id, 1), 0);
	int pat = int(p0.a * 255.0 + 0.5);
	int special = int(p1.a * 255.0 + 0.5);
	vec3 col = p0.rgb;
	vec3 acc = p1.rgb;
	float h = hash2(cell, 7.0);
	// 칸마다 아주 조금 다른 톤 (같은 바닥이 단조롭지 않게)
	col *= 0.97 + 0.06 * h;

	if (pat == 2) {
		// 마루: 한 칸에 널 네 장, 이음매는 줄마다 엇갈리고 널마다 톤이 다르다
		float row = floor(f.y * 4.0) + cell.y * 4.0;
		float k = hash2(vec2(row, floor((cell.x + mod(row, 3.0)) / 3.0)), 3.0);
		col *= 0.95 + 0.1 * k;
		float fy = fract(f.y * 4.0);
		col = mix(col, acc, line(fy, 0.97, 0.06) * 0.9);
		if (mod(cell.x + mod(row, 3.0), 3.0) < 0.5) col = mix(col, acc, line(f.x, fract(k * 7.0) * 0.8 + 0.1, 0.02));
	} else if (pat == 1) {
		if (special == 1) {
			// 보도블록: 반 칸씩 엇갈린 벽돌
			float hrow = floor(f.y * 2.0);
			float off = mod(cell.y * 2.0 + hrow, 2.0) > 0.5 ? 0.25 : 0.75;
			col *= 0.96 + 0.08 * hash2(cell + hrow, 11.0);
			col = mix(col, acc, max(line(fract(f.y * 2.0), 0.96, 0.05), line(f.x, off, 0.025)));
		} else {
			bool big = special == 2;
			float gx = big ? (mod(cell.x, 2.0) > 0.5 ? line(f.x, 1.0, 0.04) : 0.0) : line(f.x, 1.0, 0.04);
			float gy = big ? (mod(cell.y, 2.0) > 0.5 ? line(f.y, 1.0, 0.04) : 0.0) : line(f.y, 1.0, 0.04);
			col = mix(col, acc, max(gx, gy));
			// 위·왼쪽 모서리 반사
			col += vec3(0.06) * max(line(f.x, 0.0, 0.03), line(f.y, 0.0, 0.03)) * (big ? 0.5 : 1.0);
		}
	} else if (pat == 3) {
		// 줄무늬 (횡단보도·계단·무빙워크)
		col = mix(col, acc, step(0.5, fract(f.x * 2.0)) * 0.85);
	} else if (pat == 4) {
		// 잔디·골목: 흩뿌린 점과 얼룩
		vec2 sub = floor(f * 4.0);
		float d = hash2(cell * 4.0 + sub, 5.0);
		col = mix(col, acc, step(0.82, d) * 0.6);
		col *= 0.94 + 0.12 * hash2(floor(wpos * 0.5), 9.0);
	}
	if (special == 3) {
		// 차도: 6칸마다 차선 점선
		if (mod(cell.y, 6.0) > 1.5 && mod(cell.y, 6.0) < 2.5 && mod(cell.x, 4.0) < 2.0) col = mix(col, vec3(0.94, 0.9, 0.75), line(f.y, 0.49, 0.05) * 0.6);
	} else if (special == 4) {
		// 물: 느린 물결 반짝임
		float w = sin(wpos.x * 1.7 + time * 0.8) * sin(wpos.y * 1.3 - time * 0.6);
		col += vec3(0.05, 0.07, 0.08) * smoothstep(0.6, 1.0, w);
	}
	ALBEDO = col * tint;
	ROUGHNESS = special == 4 ? 0.35 : 0.95;
}
