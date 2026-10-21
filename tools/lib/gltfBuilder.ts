import { Document, type Material, type Node } from '@gltf-transform/core';

// gltf-transform으로 박스 기반 그레이박스 노드를 만드는 도우미

export type Vec3 = [number, number, number];

export interface BoxSpec {
  name: string;
  size: Vec3;
  /** 박스 중심 위치 */
  position: Vec3;
  /** 쿼터니언 [x, y, z, w] */
  rotation?: [number, number, number, number];
  material?: Material;
}

export class GltfBuilder {
  readonly doc = new Document();
  private readonly buffer = this.doc.createBuffer();
  readonly scene = this.doc.createScene('Scene');

  material(name: string, rgb: Vec3, roughness = 0.8): Material {
    return this.doc
      .createMaterial(name)
      .setBaseColorFactor([rgb[0], rgb[1], rgb[2], 1])
      .setRoughnessFactor(roughness)
      .setMetallicFactor(0);
  }

  box(spec: BoxSpec): Node {
    const [sx, sy, sz] = spec.size.map((v) => v / 2) as Vec3;
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    // 면마다 (법선, u축, v축) — 바깥에서 볼 때 반시계 방향
    const faces: [Vec3, Vec3, Vec3][] = [
      [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
      [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
      [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
      [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
    ];
    for (const [n, u, v] of faces) {
      const base = positions.length / 3;
      for (const [a, b] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        positions.push(
          (n[0] + u[0] * a + v[0] * b) * sx,
          (n[1] + u[1] * a + v[1] * b) * sy,
          (n[2] + u[2] * a + v[2] * b) * sz,
        );
        normals.push(...n);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const prim = this.doc
      .createPrimitive()
      .setAttribute('POSITION', this.doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(this.buffer))
      .setAttribute('NORMAL', this.doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(this.buffer))
      .setIndices(this.doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(this.buffer));
    if (spec.material) prim.setMaterial(spec.material);
    const mesh = this.doc.createMesh(spec.name).addPrimitive(prim);
    const node = this.doc.createNode(spec.name).setMesh(mesh).setTranslation(spec.position);
    if (spec.rotation) node.setRotation(spec.rotation);
    this.scene.addChild(node);
    return node;
  }

  /** 메시 없는 빈 노드 (SPAWN_, PATH_ 등 위치 표시용) */
  empty(name: string, position: Vec3, rotation?: [number, number, number, number]): Node {
    const node = this.doc.createNode(name).setTranslation(position);
    if (rotation) node.setRotation(rotation);
    this.scene.addChild(node);
    return node;
  }
}

/** Y축 회전 쿼터니언 */
export function yawQuat(radians: number): [number, number, number, number] {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}
