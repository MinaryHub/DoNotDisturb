// 심리 연출: 3D 장면 위에 덮는 화면 효과 하나 (웹 판 Renderer.composite·overlays·finish에서 옮김).
// 강도는 모두 PresentationState(0~1)와 설정에서 온다. 연출은 시뮬레이션을 읽기만 한다.
//   색: 지침 → 채도↓, 집 → 앰버(세피아), 편두통 → 흐림·색수차·번지는 빛, 위험 → 진행 방향으로 늘어남
//   덮개: 시야 반경(지칠수록 좁고 어둡게), 붉은 비네팅(긴장, 심박에 맞춰), 터널(Critical), 홍조 아지랑이(아래),
//         폰 빛, 앰버, 순간 이동 빛, 기습 섬광·아픔, 눈 감기, 번아웃 암전, 외시경, 이동·지하철·엘리베이터, 가장자리 어둠·필름 결
shader_type canvas_item;
render_mode unshaded;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform vec2 player_px = vec2(640.0, 360.0);
uniform float tile_px = 40.0;
uniform float time = 0.0;
uniform float distortion = 1.0;

uniform float stress = 0.0;
uniform float tired = 0.0;
uniform float danger = 0.0;
uniform float critical = 0.0;
uniform float trauma = 0.0;
uniform float hurt = 0.0;
uniform float flush = 0.0;
uniform float migraine = 0.0;
uniform float sanctuary = 0.0;
uniform float phone = 0.0;
uniform float eyes = 0.0;
uniform float warp = 0.0;
uniform float beat = 0.0;
uniform float burnout = -1.0;
uniform float awkward = 0.0;

uniform bool chromatic = true;
uniform bool flash = true;
uniform bool soft = true;
uniform float soft_lift = 0.05;
uniform vec3 soft_lift_color : source_color = vec3(1.0, 0.914, 0.839);
uniform float soft_saturate = 0.92;
uniform float soft_contrast = 0.94;
uniform float soft_glow = 0.26;

uniform float stress_vignette = 0.75;
uniform vec3 red_tint : source_color = vec3(0.588, 0.078, 0.118);
uniform float tired_desat = 0.35;
uniform float critical_tunnel = 0.92;
uniform float light_radius_tiles = 13.0;
uniform float light_radius_critical = 4.5;
uniform float burnout_fade_sec = 2.5;
uniform float chromatic_px = 5.0;
uniform float migraine_blur_px = 1.6;
uniform float flush_height = 0.32;
uniform float home_amber = 0.55;
uniform float vignette = 0.22;
uniform float grain = 0.035;

// 진행 방향으로 늘어남 (Danger): 축과 양
uniform vec2 stretch_axis = vec2(1.0, 0.0);
uniform float stretch = 0.0;

// 모드: 0 없음, 1 외시경, 2 이동(페이드), 3 지하철, 4 엘리베이터
uniform int mode = 0;
uniform float mode_fade = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 sat(vec3 c, float s) {
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	return mix(vec3(l), c, s);
}

vec3 sepia(vec3 c, float k) {
	vec3 s = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
	return mix(c, s, k);
}

// 아래 색 위에 rgba를 덮는다
vec3 over(vec3 base, vec4 top) {
	return mix(base, top.rgb, clamp(top.a, 0.0, 1.0));
}

void fragment() {
	vec2 res = 1.0 / SCREEN_PIXEL_SIZE;
	vec2 px = SCREEN_UV * res;
	vec2 uv = SCREEN_UV;
	float maxwh = max(res.x, res.y);
	float minwh = min(res.x, res.y);

	// ── 색 (합성)
	// Danger: 플레이어를 중심으로 진행 방향으로 공간이 늘어난다
	if (stretch > 0.002) {
		vec2 d = px - player_px;
		float along = dot(d, stretch_axis);
		vec2 perp = d - along * stretch_axis;
		vec2 src = player_px + stretch_axis * along / (1.0 + stretch) + perp / (1.0 - stretch * 0.3);
		uv = src / res;
	}
	vec3 col;
	float blur = chromatic ? migraine * migraine_blur_px * distortion : 0.0;
	if (blur > 0.05) {
		vec2 o = SCREEN_PIXEL_SIZE * blur * 1.5;
		col = (textureLod(screen_tex, uv, 0.0).rgb * 2.0 + textureLod(screen_tex, uv + vec2(o.x, 0.0), 0.0).rgb + textureLod(screen_tex, uv - vec2(o.x, 0.0), 0.0).rgb
			+ textureLod(screen_tex, uv + vec2(0.0, o.y), 0.0).rgb + textureLod(screen_tex, uv - vec2(0.0, o.y), 0.0).rgb) / 6.0;
	} else {
		col = textureLod(screen_tex, uv, 0.0).rgb;
	}
	// 편두통: 겹쳐 보임(색수차)과 번지는 빛
	if (chromatic && migraine > 0.04) {
		float off = chromatic_px * migraine * distortion * (1.0 + 0.3 * sin(time * 5.0));
		vec2 o = SCREEN_PIXEL_SIZE * off;
		vec3 a = textureLod(screen_tex, uv + vec2(o.x, 0.0), 0.0).rgb;
		vec3 b = textureLod(screen_tex, uv - vec2(o.x, -o.y * 0.3), 0.0).rgb;
		col = mix(col, vec3(a.r, col.g, b.b), 0.22 * migraine * 2.0);
		vec3 glow = textureLod(screen_tex, uv, 3.0).rgb;
		col = 1.0 - (1.0 - col) * (1.0 - glow * 0.1 * migraine);
	}
	float s = max(0.15, 1.0 - tired * tired_desat - danger * 0.2 - critical * 0.25 + sanctuary * 0.1);
	col = sat(col, s);
	col = sepia(col, sanctuary * home_amber);
	col *= 1.0 + migraine * 0.15 * distortion - critical * 0.12 + sanctuary * 0.03;
	if (soft) {
		// 부드러운 빛: 흐린 그림을 screen으로 얹어 밝은 곳이 은은하게 번진다
		vec3 bloom = textureLod(screen_tex, uv, 3.5).rgb;
		col = 1.0 - (1.0 - col) * (1.0 - bloom * bloom * soft_glow);
		col = sat(col, soft_saturate);
		col = (col - 0.5) * soft_contrast + 0.5;
		col = 1.0 - (1.0 - col) * (1.0 - soft_lift_color * soft_lift);
	}

	// ── 덮개
	vec2 c = player_px;
	float d = length(px - c);
	// 시야 반경: 지칠수록 주변이 어두워지고 좁아진다
	float light_t = min(1.0, tired * 0.25 + danger * 0.45 + critical * 0.6);
	float radius = (light_radius_tiles + (light_radius_critical - light_radius_tiles) * light_t) * tile_px * (1.0 - phone * light_radius_tiles * 0.04);
	float dark = min(0.94, 0.12 + tired * 0.15 + danger * 0.3 + critical * critical_tunnel * 0.5 + phone * 0.35) * (1.0 - sanctuary * 0.85);
	col = over(col, vec4(0.03, 0.03, 0.047, dark * smoothstep(radius * 0.35, radius * 1.15, d)));
	// 긴장: 붉은 테두리 (심박에 맞춰 조여 든다)
	float v = stress * stress_vignette * (1.0 - sanctuary);
	if (v > 0.02) {
		float inner = minwh * (0.42 - 0.08 * beat * stress);
		float dc = length(px - res * 0.5);
		col = over(col, vec4(red_tint, min(0.75, v) * smoothstep(inner, length(res) * 0.6, dc)));
	}
	// Critical: 검은 터널 + 박동
	if (critical > 0.02) {
		float inner = max(10.0, minwh * (0.3 - critical * 0.12 - beat * 0.03));
		col = over(col, vec4(0.0, 0.0, 0.0, critical * critical_tunnel * smoothstep(inner, length(res) * 0.55, d)));
	}
	// 홍조: 화면 아래에서 올라오는 붉은 열 아지랑이
	if (flush > 0.03) {
		float h = res.y * flush_height * (0.5 + flush * 0.5);
		float from_bottom = res.y - px.y + sin(px.x / 80.0 + time * 2.0) * 8.0 * distortion * flush;
		float k = clamp(1.0 - from_bottom / h, 0.0, 1.0);
		col = over(col, vec4(0.88, 0.24, 0.22, flush * 0.3 * k * k));
	}
	// 폰 화면만 보는 중: 아래쪽에서 올라오는 차가운 빛
	if (phone > 0.05) {
		float dp = length(px - (c + vec2(0.0, 40.0)));
		col = 1.0 - (1.0 - col) * (1.0 - vec3(0.59, 0.78, 1.0) * 0.18 * phone * (1.0 - smoothstep(5.0, 160.0, dp)));
	}
	// 안전지대: 앰버 톤
	if (sanctuary > 0.02) {
		float k = clamp(d / (length(res) * 0.7), 0.0, 1.0);
		col = over(col, mix(vec4(1.0, 0.745, 0.43, 0.1 * sanctuary), vec4(0.47, 0.235, 0.078, 0.28 * sanctuary), k));
	}
	// 순간 이동: 연보랏빛이 번졌다 걷힌다
	if (warp > 0.01) {
		float a = flash ? warp * 0.85 : warp * 0.35;
		float k = clamp(length(px - res * 0.5) / (maxwh * 0.7), 0.0, 1.0);
		col = over(col, mix(vec4(0.98, 0.957, 1.0, a), vec4(0.77, 0.61, 0.85, a * 0.8), k));
	}
	// 기습: 짧은 섬광, 아픔
	if (flash && trauma > 0.5) col = over(col, vec4(1.0, 0.96, 0.92, (trauma - 0.5) * 0.35));
	if (flash && hurt > 0.05) col = over(col, vec4(0.63, 0.078, 0.118, hurt * 0.12));
	// 눈 감기: 암전
	if (eyes > 0.01) col = over(col, vec4(0.016, 0.016, 0.03, eyes * 0.96));
	// 번아웃: 시야 암전
	if (burnout >= 0.0) {
		float k = min(1.0, burnout / burnout_fade_sec);
		float inner = max(1.0, (1.0 - k) * maxwh * 0.5);
		float t = smoothstep(inner, maxwh, d);
		col = over(col, vec4(0.0, 0.0, 0.0, mix(k * k, min(1.0, k * 1.5), t)));
	}
	// 외시경: 둥근 렌즈 너머로만
	if (mode == 1) {
		float r = minwh * 0.32;
		float dc = length(px - res * 0.5);
		col = over(col, vec4(0.0, 0.0, 0.0, smoothstep(r * 0.85, r, dc)));
	} else if (mode == 2) {
		col = over(col, vec4(0.0, 0.0, 0.0, mode_fade));
	} else if (mode == 3) {
		col = over(col, vec4(0.055, 0.063, 0.094, 0.65 + 0.3 * mode_fade));
		float off = mod(time * 900.0, res.x + 200.0);
		for (int i = 0; i < 3; i++) {
			float x0 = res.x - mod(off + float(i) * (res.x / 3.0), res.x + 200.0);
			if (px.x > x0 && px.x < x0 + 120.0 && px.y > res.y * 0.38 && px.y < res.y * 0.62) col = 1.0 - (1.0 - col) * (1.0 - vec3(1.0, 0.9, 0.67) * 0.12);
		}
	} else if (mode == 4) {
		col = over(col, vec4(0.078, 0.078, 0.1, 0.25 + awkward * 0.25));
	}
	// 마무리: 은은한 가장자리 어둠과 필름 결 (깜빡임을 끄면 결이 멈춘다)
	float dv = length(px - res * 0.5);
	col = over(col, vec4(0.04, 0.03, 0.08, vignette * smoothstep(minwh * 0.45, length(res) * 0.55, dv)));
	if (grain > 0.0) {
		float step_t = flash ? floor(time * 12.0) : 0.0;
		float g = hash(floor(px) + step_t * vec2(53.0, 97.0)) - 0.5;
		col += g * grain * 2.0;
	}
	COLOR = vec4(col, 1.0);
}
