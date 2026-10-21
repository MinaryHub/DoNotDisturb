import { init as initRecast, NavMeshQuery, getNavMeshPositionsAndIndices, type NavMesh } from 'recast-navigation';
import { generateSoloNavMesh } from 'recast-navigation/generators';
import type { WorldConfig } from '../core/configSchemas';

let initialized: Promise<void> | null = null;

/** recast WASM 초기화 (여러 번 호출해도 한 번만 수행) */
export function initNavigation(): Promise<void> {
  initialized ??= initRecast();
  return initialized;
}

export interface Navigation {
  navMesh: NavMesh;
  query: NavMeshQuery;
  dispose(): void;
}

/** 미터 단위 에이전트 설정을 recast의 복셀 단위 설정으로 변환 */
export function toRecastConfig(cfg: WorldConfig['navmesh']) {
  return {
    cs: cfg.cellSize,
    ch: cfg.cellHeight,
    walkableSlopeAngle: cfg.agentMaxSlopeDeg,
    walkableHeight: Math.ceil(cfg.agentHeight / cfg.cellHeight),
    walkableClimb: Math.floor(cfg.agentMaxClimb / cfg.cellHeight),
    walkableRadius: Math.ceil(cfg.agentRadius / cfg.cellSize),
  };
}

/** NAV_ 메시의 월드 좌표 삼각형으로 내비메시를 만든다 */
export function buildNavigation(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  cfg: WorldConfig['navmesh'],
): { nav: Navigation } | { error: string } {
  const result = generateSoloNavMesh(positions, indices, toRecastConfig(cfg));
  if (!result.success) return { error: result.error };
  const navMesh = result.navMesh;
  const query = new NavMeshQuery(navMesh);
  return {
    nav: {
      navMesh,
      query,
      dispose() {
        query.destroy();
        navMesh.destroy();
      },
    },
  };
}

/** 디버그 표시용 내비메시 삼각형 */
export function navMeshDebugGeometry(navMesh: NavMesh): { positions: number[]; indices: number[] } {
  const [positions, indices] = getNavMeshPositionsAndIndices(navMesh);
  return { positions, indices };
}
