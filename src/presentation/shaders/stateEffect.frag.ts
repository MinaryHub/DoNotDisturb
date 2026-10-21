// 상태 후처리 셰이더: 원근 왜곡(Danger), 채도 감소(Tired), 붉은 테두리(stress), 터널 비네팅(Critical), 암전(Burnout)
export default /* glsl */ `
uniform float uStress;
uniform float uDesat;
uniform float uDistort;
uniform float uTunnel;
uniform float uFade;
uniform float uHurt;
uniform float uTime;
uniform float uAspect;
uniform float uPulseRate;
uniform vec3 uRedTint;
uniform float uStressVignette;

void mainUv(inout vec2 uv) {
  if (uDistort <= 0.0) return;
  vec2 c = uv - 0.5;
  float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
  // 가장자리를 바깥으로 늘려 복도가 길어 보이게, 위아래를 살짝 눌러 천장이 낮아진 느낌
  float breathe = 1.0 + 0.15 * sin(uTime * 0.7);
  c *= 1.0 + uDistort * 0.22 * r2 * breathe;
  c.y *= 1.0 - uDistort * 0.06;
  uv = c + 0.5;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 color = inputColor.rgb;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(color, vec3(luma), uDesat);

  vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);
  float d = length(c);

  // 스트레스: 심박에 맞춰 맥동하는 붉은 테두리
  float pulse = 0.75 + 0.25 * sin(uTime * uPulseRate * 6.2831853);
  float border = smoothstep(0.35, 0.95, d);
  color = mix(color, uRedTint, border * uStressVignette * clamp(uStress + uHurt * 0.5, 0.0, 1.0) * pulse);

  // Critical: 시야가 좁아지는 터널
  float inner = mix(0.95, 0.22, uTunnel);
  float tunnel = smoothstep(inner, inner + 0.35, d) * uTunnel;
  color *= 1.0 - tunnel * 0.96;

  color *= 1.0 - uFade;
  outputColor = vec4(color, inputColor.a);
}
`;
