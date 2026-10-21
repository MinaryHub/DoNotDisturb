import { mat4, vec3 } from './math';
import type { Document, Node, Primitive } from '@gltf-transform/core';
import type { AssetBudget, AssetCategory } from '../../src/core/configSchemas';
import { isRenderedPrefix, isVolumePrefix, type Prefix } from '../../src/world/levelSchema';
import { parseNodeName, parsePathId, stripDuplicateSuffix } from '../../src/world/parseNodeName';

export interface ReportItem {
  level: 'error' | 'warning';
  node: string;
  message: string;
}

export interface AssetReport {
  file: string;
  category: AssetCategory;
  items: ReportItem[];
  stats: {
    nodes: number;
    renderedTriangles: number;
    prefixCounts: Partial<Record<Prefix, number>>;
    bounds: { min: [number, number, number]; max: [number, number, number] } | null;
  };
}

/** 파일 경로(assets/kreate 기준 상대 경로)로 에셋 종류를 정한다 */
export function categorize(relPath: string, budget: AssetBudget): AssetCategory {
  const normalized = relPath.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop()!.replace(/\.glb$/i, '');
  for (const rule of budget.categories) {
    if (!normalized.startsWith(rule.pathPrefix)) continue;
    if (rule.nameSuffix && !baseName.endsWith(rule.nameSuffix)) continue;
    return rule.category;
  }
  return 'level';
}

const GL_TRIANGLES = 4;
const GL_TRIANGLE_STRIP = 5;
const GL_TRIANGLE_FAN = 6;

function triangleCount(prim: Primitive): number {
  const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
  switch (prim.getMode()) {
    case GL_TRIANGLES:
      return Math.floor(count / 3);
    case GL_TRIANGLE_STRIP:
    case GL_TRIANGLE_FAN:
      return Math.max(0, count - 2);
    default:
      return 0;
  }
}

type Box = { min: [number, number, number]; max: [number, number, number] };

function emptyBox(): Box {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

function expand(box: Box, p: [number, number, number]): void {
  for (let i = 0; i < 3; i++) {
    box.min[i] = Math.min(box.min[i]!, p[i]!);
    box.max[i] = Math.max(box.max[i]!, p[i]!);
  }
}

function isEmpty(box: Box): boolean {
  return box.min[0] > box.max[0];
}

function size(box: Box): [number, number, number] {
  return [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
}

/** 노드 메시의 월드 바운딩 박스 (accessor min/max의 8개 모서리를 변환) */
function nodeWorldBox(node: Node): Box | null {
  const mesh = node.getMesh();
  if (!mesh) return null;
  const world = node.getWorldMatrix() as unknown as number[];
  const box = emptyBox();
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const min = pos.getMin([]) as number[];
    const max = pos.getMax([]) as number[];
    for (let c = 0; c < 8; c++) {
      const corner: [number, number, number] = [c & 1 ? max[0]! : min[0]!, c & 2 ? max[1]! : min[1]!, c & 4 ? max[2]! : min[2]!];
      expand(box, mat4.transformPoint(world, corner));
    }
  }
  return isEmpty(box) ? null : box;
}

/** NAV_ 메시의 면적 가중 평균 법선 (Z-up으로 잘못 내보냈는지 판별용) */
function areaWeightedNormal(node: Node): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  const mesh = node.getMesh();
  if (!mesh) return sum;
  const world = node.getWorldMatrix() as unknown as number[];
  for (const prim of mesh.listPrimitives()) {
    if (prim.getMode() !== GL_TRIANGLES) continue;
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const idx = prim.getIndices();
    const n = idx ? idx.getCount() : pos.getCount();
    const vertex = (i: number) => mat4.transformPoint(world, pos.getElement(idx ? idx.getScalar(i) : i, [0, 0, 0]));
    for (let i = 0; i + 2 < n; i += 3) {
      const a = vertex(i);
      const cross = vec3.cross(vec3.sub(vertex(i + 1), a), vec3.sub(vertex(i + 2), a));
      // 위를 향하는 면과 아래를 향하는 면이 상쇄되지 않도록 절댓값으로 누적
      for (let k = 0; k < 3; k++) sum[k]! += Math.abs(cross[k]!);
    }
  }
  return sum;
}

export function validateAsset(doc: Document, relPath: string, budget: AssetBudget): AssetReport {
  const category = categorize(relPath, budget);
  const items: ReportItem[] = [];
  const add = (level: ReportItem['level'], node: string, message: string) => items.push({ level, node, message });

  const prefixCounts: Partial<Record<Prefix, number>> = {};
  const spawnIds = new Map<string, number>();
  const pathIndices = new Map<string, number[]>();
  const levelBox = emptyBox();
  let renderedTriangles = 0;
  let nodeCount = 0;
  const navNormal: [number, number, number] = [0, 0, 0];

  const scenes = doc.getRoot().listScenes();
  if (scenes.length === 0) add('error', '(file)', '씬이 없습니다');

  const visit = (node: Node) => {
    nodeCount++;
    const rawName = node.getName();
    const parsed = parseNodeName(rawName, node.getExtras());
    const label = rawName || '(이름 없음)';
    for (const issue of parsed.issues) add(issue.level, label, issue.message);
    prefixCounts[parsed.prefix] = (prefixCounts[parsed.prefix] ?? 0) + 1;

    if (parsed.prefix !== 'VIS' && stripDuplicateSuffix(rawName) !== rawName) {
      add('warning', label, `이름 끝에 중복 번호가 붙었습니다. 같은 이름의 오브젝트가 있는지 확인하세요`);
    }

    const mesh = node.getMesh();
    const box = nodeWorldBox(node);
    if (box) {
      expand(levelBox, box.min);
      expand(levelBox, box.max);
      const s = size(box);
      const largest = Math.max(...s);
      if (largest < budget.units.minObjectSize) {
        add('warning', label, `크기가 ${(largest * 100).toFixed(2)}cm로 너무 작습니다 — 단위가 m가 아닌 cm/mm로 내보내졌을 수 있습니다`);
      } else if (largest > budget.units.maxObjectSize) {
        add('warning', label, `크기가 ${largest.toFixed(1)}m로 너무 큽니다 — 단위를 확인하세요`);
      }
    }

    if (mesh && isRenderedPrefix(parsed.prefix)) {
      const tris = mesh.listPrimitives().reduce((sum, p) => sum + triangleCount(p), 0);
      renderedTriangles += tris;
      if (category === 'level' && tris > budget.triangles.environmentModule) {
        add('warning', label, `삼각형 ${tris.toLocaleString()}개 — 환경 모듈 예산 ${budget.triangles.environmentModule.toLocaleString()}개 초과`);
      }
    }

    if (isVolumePrefix(parsed.prefix) && !mesh) {
      add('error', label, `${parsed.prefix}_ 볼륨은 영역을 나타내는 메시(박스)가 필요합니다`);
    }
    if (parsed.prefix === 'NAV' && mesh) {
      const n = areaWeightedNormal(node);
      for (let k = 0; k < 3; k++) navNormal[k]! += n[k]!;
    }
    if (parsed.prefix === 'SPAWN') spawnIds.set(parsed.id, (spawnIds.get(parsed.id) ?? 0) + 1);
    if (parsed.prefix === 'PATH') {
      const p = parsePathId(parsed.id);
      if (p) pathIndices.set(p.npcId, [...(pathIndices.get(p.npcId) ?? []), p.index]);
    }

    for (const child of node.listChildren()) visit(child);
  };
  for (const scene of scenes) for (const node of scene.listChildren()) visit(node);

  // 레벨 전용 검사
  if (category === 'level') {
    if (!spawnIds.has('player')) add('error', '(level)', '필수 노드 SPAWN_player가 없습니다');
    if (!prefixCounts.NAV) add('warning', '(level)', 'NAV_ 메시가 없어 NPC 내비메시를 만들 수 없습니다');
    if (!prefixCounts.COL) add('warning', '(level)', 'COL_ 충돌체가 하나도 없습니다');
    if (!isEmpty(levelBox)) {
      const extent = Math.max(...size(levelBox));
      if (extent > budget.units.maxLevelExtent) {
        add('error', '(level)', `레벨 크기가 ${extent.toFixed(0)}m입니다 — 단위가 잘못되었을 가능성이 큽니다 (상한 ${budget.units.maxLevelExtent}m)`);
      }
    }
    const [nx, ny, nz] = navNormal;
    if (ny + nx + nz > 0 && (nz > ny * 2 || nx > ny * 2)) {
      add('error', '(level)', 'NAV_ 바닥이 Y축(위)을 향하지 않습니다 — Kreate에서 Y-up으로 내보냈는지 확인하세요');
    }
  } else {
    // 단일 에셋 예산
    const limit = budget.triangles[category];
    if (renderedTriangles > limit) {
      add('warning', '(file)', `삼각형 ${renderedTriangles.toLocaleString()}개 — ${category} 예산 ${limit.toLocaleString()}개 초과`);
    }
    if ((category === 'npc' || category === 'crowdNpc') && !isEmpty(levelBox)) {
      const height = size(levelBox)[1];
      if (height < budget.units.minCharacterHeight || height > budget.units.maxCharacterHeight) {
        add('warning', '(file)', `캐릭터 키가 ${height.toFixed(2)}m입니다 — 단위나 축 방향을 확인하세요`);
      }
      const footY = levelBox.min[1];
      if (Math.abs(footY) > 0.05) add('warning', '(file)', `원점이 바닥 중앙이 아닙니다 (발 높이 y=${footY.toFixed(2)})`);
    }
  }

  for (const [id, count] of spawnIds) {
    if (count > 1) add('error', `SPAWN_${id}`, `SPAWN_${id}가 ${count}개 있습니다`);
  }
  for (const [npcId, indices] of pathIndices) {
    const sorted = [...indices].sort((a, b) => a - b);
    if (sorted.length < 2) add('warning', `PATH_${npcId}`, '순찰 경로 점이 1개뿐입니다');
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) add('error', `PATH_${npcId}`, `번호 ${sorted[i]}가 중복됩니다`);
      else if (sorted[i]! - sorted[i - 1]! > 1) add('warning', `PATH_${npcId}`, `번호 ${sorted[i - 1]} 다음에 ${sorted[i]}로 건너뜁니다`);
    }
  }

  // 텍스처 크기
  const maxTex = category === 'prop' ? budget.textures.propMaxSize : budget.textures.maxSize;
  for (const texture of doc.getRoot().listTextures()) {
    const s = texture.getSize();
    if (!s) continue;
    const largest = Math.max(s[0], s[1]);
    if (largest > budget.textures.maxSize) {
      add('error', `texture:${texture.getName() || texture.getURI()}`, `${s[0]}×${s[1]} — 최대 ${budget.textures.maxSize}px`);
    } else if (largest > maxTex) {
      add('warning', `texture:${texture.getName() || texture.getURI()}`, `${s[0]}×${s[1]} — 소품 권장 ${maxTex}px 이하`);
    }
  }

  return {
    file: relPath,
    category,
    items,
    stats: {
      nodes: nodeCount,
      renderedTriangles,
      prefixCounts,
      bounds: isEmpty(levelBox) ? null : levelBox,
    },
  };
}
