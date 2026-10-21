import * as THREE from 'three';

const _inv = new THREE.Quaternion();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

/**
 * 광선과 회전된 박스(OBB)의 교차 거리. 맞지 않으면 null.
 * @param direction 정규화된 방향
 */
export function rayObb(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  center: THREE.Vector3,
  rotation: THREE.Quaternion,
  halfExtents: THREE.Vector3,
): number | null {
  _inv.copy(rotation).invert();
  _o.subVectors(origin, center).applyQuaternion(_inv);
  _d.copy(direction).applyQuaternion(_inv);
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const axis of ['x', 'y', 'z'] as const) {
    const o = _o[axis];
    const d = _d[axis];
    const h = halfExtents[axis];
    if (Math.abs(d) < 1e-9) {
      if (o < -h || o > h) return null;
      continue;
    }
    let t1 = (-h - o) / d;
    let t2 = (h - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }
  if (tMax < 0) return null;
  return Math.max(tMin, 0);
}

/** 점이 OBB 안에 있는지 */
export function pointInObb(
  point: THREE.Vector3,
  center: THREE.Vector3,
  rotation: THREE.Quaternion,
  halfExtents: THREE.Vector3,
): boolean {
  _inv.copy(rotation).invert();
  _o.subVectors(point, center).applyQuaternion(_inv);
  return Math.abs(_o.x) <= halfExtents.x && Math.abs(_o.y) <= halfExtents.y && Math.abs(_o.z) <= halfExtents.z;
}
