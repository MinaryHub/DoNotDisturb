// 3D 시점의 벽·가구·나무 재질 (웹 판 three/Scene3D.ts의 MeshStandardMaterial + shadeByHeight + windy).
// 상자 도형은 바닥(0)~위(1) 단위 높이라, 인스턴스 변환의 y 배율이 곧 높이다.
//   grow: Danger 이하에서 벽이 솟는다 (키 큰 칸만 1보다 크다). 그림자 패스도 같은 정점 셰이더라 그림자도 솟는다
//   dim: 솟은 벽은 어두워진다 (짓눌리는 느낌)
//   COLOR: 정점색 (바닥 쪽 은은한 그늘) × 인스턴스 색 (나무마다 조금씩 다른 톤)
// GHOST: 플레이어를 가리는 것을 비쳐 보이게 그리는 짝 (같은 색, 반투명, 뒤를 가리지 않음)
// WIND: 바람에 일렁인다 (높이에 비례해 좌우로, 인스턴스 자리로 박자를 달리해 함께 흔들리지 않게)
render_mode diffuse_burley, specular_schlick_ggx;

uniform vec3 albedo : source_color = vec3(1.0);
uniform float grow = 1.0;
uniform float dim = 0.0;
uniform float opacity = 1.0;
uniform float roughness_v = 0.9;
uniform vec3 emission_color : source_color = vec3(0.0);
uniform float emission_energy = 0.0;
#ifdef WIND
uniform float wind_time = 0.0;
uniform float wind_amp = 0.05;
#endif

void vertex() {
	VERTEX.y *= grow;
#ifdef WIND
	vec3 wp = MODEL_MATRIX[3].xyz;
	float hk = max(0.0, VERTEX.y + 0.6);
	VERTEX.x += (sin(wind_time * 1.25 + wp.x * 0.6 + wp.z * 0.35) * 0.65 + sin(wind_time * 2.9 + wp.x * 1.7 + wp.z) * 0.25) * wind_amp * hk;
	VERTEX.z += cos(wind_time * 1.05 + wp.z * 0.7 + wp.x * 0.2) * wind_amp * 0.6 * hk;
#endif
}

void fragment() {
	ALBEDO = albedo * COLOR.rgb * (1.0 - dim);
	ROUGHNESS = roughness_v;
	SPECULAR = 0.25;
	EMISSION = emission_color * emission_energy;
#ifdef GHOST
	ALPHA = opacity;
#endif
}
