// 검증 도구용 최소 벡터·행렬 연산 (glTF 열 우선 4x4 행렬)

export type V3 = [number, number, number];

export const mat4 = {
  transformPoint(m: ArrayLike<number>, p: ArrayLike<number>): V3 {
    const x = p[0]!;
    const y = p[1]!;
    const z = p[2]!;
    return [
      m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
      m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
      m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
    ];
  },
};

export const vec3 = {
  sub(a: V3, b: V3): V3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  },
  cross(a: V3, b: V3): V3 {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  },
};
