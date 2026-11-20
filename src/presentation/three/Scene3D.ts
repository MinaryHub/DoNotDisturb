import * as THREE from 'three';
import type { GameConfig } from '../../core/config';
import { inRect, type Rect, type TileMap, type Vec2 } from '../../world/TileMap';
import type { RoofBuilding } from '../draw/ambient';
import { BUS_BODY, BUS_LENGTH, BUS_WIDTH } from '../draw/bus';
import type { Look } from '../draw/people';

// 3D 시점: 위에서 비스듬히 내려다보는 Three.js 장면.
// 게임 판정(충돌·시야·길찾기)은 2D 타일 그대로이고, 이 장면은 그리기만 한다.
// 바닥은 2D 렌더러의 바닥 청크 그림을 텍스처로 쓰고, 벽·가구는 높이만큼 세운 상자, 사람은 도형을 조합한다.
// 시야 콘·시선 선·소리 파동 같은 바닥 표시는 2D 렌더러가 그린 캔버스를 바닥 바로 위 평면에 덮는다.
// 넓은 도시(1100×450칸)는 한 번에 만들 수 없어 카메라 둘레의 16×16 청크만 만들고, 멀어진 청크는 버린다.
// 좌표: 월드 (x, y) → Three (x, 0, y). 높이는 Three y.

export interface Person3D {
  id: string;
  x: number;
  y: number;
  facing: number;
  look: Look;
  walking: boolean;
  walkPhase: number;
  height: number;
  kind: 'person' | 'cat';
  /** 0~1: 홍조 (얼굴이 붉어짐) */
  blush?: number;
  /** 0~1: 번아웃으로 주저앉음 */
  sink?: number;
  /** 폰을 들여다봄 */
  phone?: boolean;
  seated?: boolean;
  /** 내 사람: 노란 빛 */
  ally?: boolean;
  /** 이름 없는 행인 (그림자를 드리우지 않아 가볍게) */
  crowd?: boolean;
  /** 지쳐서 얼굴이 보이지 않음 */
  faceless?: boolean;
  /** 공유 자전거를 타고 있음 */
  bike?: boolean;
}

export interface Bus3D {
  key: string;
  x: number;
  y: number;
  dir: number;
  stopped: boolean;
}

export interface Label3D {
  x: number;
  y: number;
  text: string;
  color?: string;
}

export interface Frame3D {
  /** 카메라가 바라보는 바닥 점 */
  target: Vec2;
  /** 1 = 기본. 작을수록 멀어진다 (Danger 줌 아웃) */
  zoom: number;
  /** 0~1: 벽이 솟고 어두워지는 정도 */
  closeIn: number;
  people: Person3D[];
  /** 앞을 가리는 벽을 낮출 기준점 (플레이어) */
  focus: Vec2 | null;
  time: number;
  /** 0(낮) ~ 1(밤). 실내 층이면 0 */
  night: number;
  /** 플레이어가 실내에 있는지 (밤에도 불이 켜져 있다) */
  indoor: boolean;
  buses: Bus3D[];
  /** 목표 지점: 떠 있는 화살표 (지붕 아래면 지붕 위에) */
  beacons: Vec2[];
  dt: number;
}

export interface Scene3DExtras {
  /** 이 층의 건물 지붕 (지상만) */
  roofs: readonly RoofBuilding[];
  labels: Label3D[];
  /** 가로등 자리 */
  lamps: Vec2[];
}

interface Tile3D {
  x: number;
  y: number;
  h: number;
  tall: boolean;
}

interface BlockGroup {
  mesh: THREE.InstancedMesh;
  tiles: Tile3D[];
}

interface TreeGroup {
  trunk: THREE.InstancedMesh;
  canopy: THREE.InstancedMesh;
  tiles: Vec2[];
}

interface Chunk3D {
  cx: number;
  cy: number;
  floor: THREE.Mesh | null;
  blocks: BlockGroup[];
  trees: TreeGroup | null;
  extra: THREE.InstancedMesh[];
}

interface Roof3D {
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  /** 플레이어를 가리는 정도 (부드럽게 바뀐다) */
  occl: number;
}

const OVERLAY_TILES = { w: 64, h: 40 };
/** 층 높이 배율을 받는 구조물 (벽·창·닫힌 문). 가구는 그대로 */
const STRUCTURE = new Set(['wall', 'window', 'doorClosed']);
const PERSON_TTL = 4;

export class Scene3D {
  readonly canvas: HTMLCanvasElement;
  /** 바닥 표시를 그릴 캔버스 (2D 렌더러가 매 프레임 채운다). overlayRect가 덮는 월드 영역 */
  readonly overlay: HTMLCanvasElement;
  overlayRect: Rect = [0, 0, OVERLAY_TILES.w, OVERLAY_TILES.h];
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly glow: THREE.PointLight;
  private readonly chunks = new Map<string, Chunk3D>();
  private readonly people = new Map<string, { g: THREE.Group; seen: number }>();
  private readonly roofs = new Map<RoofBuilding, Roof3D>();
  private readonly labels = new Map<Label3D, THREE.Sprite>();
  private readonly buses = new Map<string, THREE.Group>();
  private readonly beacons: THREE.Group[] = [];
  private lampPosts: THREE.InstancedMesh | null = null;
  private lampHeads: THREE.InstancedMesh | null = null;
  private readonly overlayTex: THREE.CanvasTexture;
  private readonly overlayMesh: THREE.Mesh;
  private readonly tmp = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();
  private w = 1;
  private h = 1;
  private readonly lite: boolean;
  private readonly cfg3: NonNullable<GameConfig['presentation']['view3d']>;
  /** 공유 자원 (청크마다 만들지 않는다) */
  private readonly box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly floorGeo: THREE.PlaneGeometry;
  private readonly mats = new Map<string, { mat: THREE.MeshStandardMaterial; base: THREE.Color; tall: boolean; glass: boolean }>();
  private readonly potGeo = new THREE.CylinderGeometry(0.22, 0.16, 0.38, 10).translate(0, 0.19, 0);
  private readonly potMat = new THREE.MeshStandardMaterial({ color: '#b5764f', roughness: 0.9 });
  private readonly leafGeo = new THREE.IcosahedronGeometry(0.42, 1);
  private readonly trunkGeo: THREE.CylinderGeometry;
  private readonly canopyGeo: THREE.IcosahedronGeometry;
  private readonly trunkMat = new THREE.MeshStandardMaterial({ color: '#6b4f3a', roughness: 0.95 });
  private readonly canopyMat: THREE.MeshStandardMaterial;
  /** 벽 높이를 다시 계산해야 하는지 알아보는 열쇠 */
  private blockKey = '';
  private readonly wallScale: number;
  /** 지상 건물 벽 높이 = 지붕 높이 */
  readonly roofHeight: number;

  constructor(
    private readonly cfg: GameConfig,
    private readonly map: TileMap,
    readonly layer: { id: string; rect: Rect },
    private readonly floorChunk: (cx: number, cy: number) => HTMLCanvasElement | null,
    private readonly chunkSize: number,
    private readonly extras: Scene3DExtras,
  ) {
    this.cfg3 = cfg.presentation.view3d!;
    this.wallScale = this.cfg3.wallScale[layer.id] ?? 1;
    this.roofHeight = (cfg.presentation.view25d?.heights['wall'] ?? 1.35) * this.wallScale;
    this.canvas = document.createElement('canvas');
    // 휴대폰·태블릿: 해상도·그림자를 낮춰 가볍게
    this.lite = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: !this.lite, alpha: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = this.cfg3.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(cfg.tiles[0]!.color);
    this.camera = new THREE.PerspectiveCamera(this.cfg3.fov, 1, 0.5, 400);

    // 빛: 하늘·바닥 반사 + 비스듬한 해 (그림자). 밤에는 플레이어 둘레에 작은 빛
    this.hemi = new THREE.HemisphereLight('#fff6e6', '#5a5048', 1.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff1dc', 1.6);
    this.sun.castShadow = this.cfg3.shadows;
    this.sun.shadow.mapSize.setScalar(this.lite ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.far = 140;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);
    this.glow = new THREE.PointLight('#ffd9a0', 0, 7, 1.6);
    this.scene.add(this.glow);

    this.floorGeo = new THREE.PlaneGeometry(chunkSize, chunkSize);
    const tr = this.cfg3.tree;
    this.trunkGeo = new THREE.CylinderGeometry(0.1, 0.14, tr.trunk, 6).translate(0, tr.trunk / 2, 0);
    this.canopyGeo = new THREE.IcosahedronGeometry(tr.canopy, 1);
    this.canopyMat = new THREE.MeshStandardMaterial({ color: cfg.tiles.find((t) => t.id === 'tree')?.color ?? '#4f7a4b', roughness: 0.85, flatShading: true });
    this.buildLamps();

    this.overlay = document.createElement('canvas');
    this.overlay.width = OVERLAY_TILES.w * 24;
    this.overlay.height = OVERLAY_TILES.h * 24;
    this.overlayTex = new THREE.CanvasTexture(this.overlay);
    this.overlayTex.colorSpace = THREE.SRGBColorSpace;
    this.overlayMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(OVERLAY_TILES.w, OVERLAY_TILES.h),
      new THREE.MeshBasicMaterial({ map: this.overlayTex, transparent: true, depthWrite: false }),
    );
    this.overlayMesh.rotation.x = -Math.PI / 2;
    this.overlayMesh.renderOrder = 1;
    this.scene.add(this.overlayMesh);
  }

  get overlayScale(): number {
    return this.overlay.width / OVERLAY_TILES.w;
  }

  /** 디버그: 마지막 프레임의 그리기 호출 수, 삼각형 수, 올라 있는 청크 수 */
  stats(): { calls: number; triangles: number; chunks: number } {
    const r = this.renderer.info.render;
    return { calls: r.calls, triangles: r.triangles, chunks: this.chunks.size };
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(this.lite ? Math.min(dpr, 1.5) : dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 바닥 표시 캔버스가 덮을 영역을 카메라 주변으로 옮긴다 (2D 렌더러가 그리기 전에) */
  placeOverlay(target: Vec2): void {
    const x0 = Math.floor(target.x - OVERLAY_TILES.w / 2);
    const y0 = Math.floor(target.y - OVERLAY_TILES.h / 2 + 4);
    this.overlayRect = [x0, y0, OVERLAY_TILES.w, OVERLAY_TILES.h];
    this.overlayMesh.position.set(x0 + OVERLAY_TILES.w / 2, 0.02, y0 + OVERLAY_TILES.h / 2);
  }

  /** 월드 점(높이 h칸) → 화면 CSS px */
  project(x: number, y: number, h: number): Vec2 {
    this.v.set(x, h, y).project(this.camera);
    return { x: (this.v.x * 0.5 + 0.5) * this.w, y: (-this.v.y * 0.5 + 0.5) * this.h };
  }

  render(f: Frame3D): void {
    const c = this.cfg3;
    const pitch = (c.pitchDeg * Math.PI) / 180;
    const dist = (c.distance * (1 + (c.dangerDistance - 1) * f.closeIn)) / Math.max(0.3, f.zoom);
    const t = f.target;
    this.camera.position.set(t.x, Math.sin(pitch) * dist, t.y + Math.cos(pitch) * dist);
    this.camera.lookAt(t.x, 0, t.y);
    this.camera.updateMatrixWorld();
    this.sun.position.set(t.x - 12, 26, t.y - 7);
    this.sun.target.position.set(t.x, 0, t.y);
    this.sun.target.updateMatrixWorld();
    this.light(f);

    const built = this.stream(t);
    this.updateBlocks(f, built);
    this.updateRoofs(f);
    this.updateLabels(t);
    this.updateBuses(f);
    this.updateBeacons(f);
    this.updatePeople(f);
    this.overlayTex.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const k of [...this.chunks.keys()]) this.unload(k);
    for (const r of this.roofs.values()) this.disposeObject(r.group);
    for (const s of this.labels.values()) this.disposeObject(s);
    for (const p of this.people.values()) this.disposeObject(p.g);
    for (const b of this.buses.values()) this.disposeObject(b);
    for (const b of this.beacons) this.disposeObject(b);
    for (const m of [this.lampPosts, this.lampHeads]) if (m) this.disposeObject(m);
    this.renderer.dispose();
  }

  // ───────────────────────── 빛 ─────────────────────────

  /** 밤: 해와 하늘빛이 줄고 창에 불이 켜진다. 실내에 들어서면 불 켜진 방이라 덜 어둡다 */
  private light(f: Frame3D): void {
    const dim = this.cfg3.night.dim * f.night * (f.indoor ? 0.35 : 1);
    this.hemi.intensity = 1.9 * (1 - dim);
    this.hemi.color.set('#fff6e6').lerp(new THREE.Color('#9fb0e8'), f.night * 0.7);
    this.sun.intensity = 1.6 * Math.max(0, 1 - dim * 1.3);
    this.glow.intensity = this.cfg3.night.playerLight * f.night * (f.indoor ? 0.3 : 1) * 4;
    if (f.focus) this.glow.position.set(f.focus.x, 1.3, f.focus.y);
    const win = this.mats.get('window');
    if (win) win.mat.emissive.set('#ffd99a').multiplyScalar(f.night * 0.55);
    if (this.lampHeads) (this.lampHeads.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + f.night * 1.6;
  }

  private buildLamps(): void {
    const lamps = this.extras.lamps.filter((p) => inRect(this.layer.rect, p.x, p.y));
    if (!lamps.length) return;
    const H = 3.2;
    this.lampPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, H, 6).translate(0, H / 2, 0), new THREE.MeshStandardMaterial({ color: '#4a4f57', roughness: 0.6 }), lamps.length);
    this.lampHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 10, 8).translate(0, H + 0.05, 0), new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffcf8a', emissiveIntensity: 0.15 }), lamps.length);
    lamps.forEach((p, i) => {
      this.tmp.makeTranslation(p.x, 0, p.y - 0.6);
      this.lampPosts!.setMatrixAt(i, this.tmp);
      this.lampHeads!.setMatrixAt(i, this.tmp);
    });
    this.lampPosts.castShadow = true;
    this.scene.add(this.lampPosts, this.lampHeads);
  }

  // ───────────────────────── 청크 (가까운 곳만 만든다) ─────────────────────────

  /** 카메라 둘레 청크를 만들고 먼 청크를 버린다. 새로 만든 게 있으면 true */
  private stream(t: Vec2): boolean {
    const S = this.chunkSize;
    const R = this.cfg3.streamRadius;
    const [lx, ly, lw, lh] = this.layer.rect;
    const cx0 = Math.max(Math.floor(lx / S), Math.floor((t.x - R) / S));
    const cx1 = Math.min(Math.floor((lx + lw - 1) / S), Math.floor((t.x + R) / S));
    const cy0 = Math.max(Math.floor(ly / S), Math.floor((t.y - R) / S));
    const cy1 = Math.min(Math.floor((ly + lh - 1) / S), Math.floor((t.y + R) / S));
    const distTo = (cx: number, cy: number) => {
      const dx = Math.max(cx * S - t.x, 0, t.x - (cx + 1) * S);
      const dy = Math.max(cy * S - t.y, 0, t.y - (cy + 1) * S);
      return Math.hypot(dx, dy);
    };
    const missing: { cx: number; cy: number; d: number }[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const d = distTo(cx, cy);
        if (d <= R && !this.chunks.has(`${cx},${cy}`)) missing.push({ cx, cy, d });
      }
    }
    // 처음에는 보이는 곳을 한꺼번에, 이후에는 프레임마다 조금씩 (가까운 것부터)
    missing.sort((a, b) => a.d - b.d);
    const first = this.chunks.size === 0;
    let budget = this.cfg3.buildPerFrame;
    for (const m of missing) {
      if (!(first && m.d < R * 0.6) && budget-- <= 0) break;
      this.load(m.cx, m.cy);
    }
    for (const [k, ch] of this.chunks) if (distTo(ch.cx, ch.cy) > R + S) this.unload(k);
    return missing.length > 0;
  }

  private load(cx: number, cy: number): void {
    const S = this.chunkSize;
    const ch: Chunk3D = { cx, cy, floor: null, blocks: [], trees: null, extra: [] };
    const img = this.floorChunk(cx, cy);
    if (img) {
      // 청크 캔버스는 LRU로 버려질 수 있어 (줄여서) 복사해 둔다
      const px = Math.min(img.width, S * this.cfg3.floorPx);
      const copy = document.createElement('canvas');
      copy.width = copy.height = px;
      copy.getContext('2d')!.drawImage(img, 0, 0, px, px);
      const tex = new THREE.CanvasTexture(copy);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const plane = new THREE.Mesh(this.floorGeo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(cx * S + S / 2, 0, cy * S + S / 2);
      plane.receiveShadow = true;
      this.scene.add(plane);
      ch.floor = plane;
    }

    const heights = this.cfg.presentation.view25d?.heights ?? {};
    const byTile = new Map<string, Tile3D[]>();
    const trees: Vec2[] = [];
    for (let y = cy * S; y < (cy + 1) * S; y++) {
      for (let x = cx * S; x < (cx + 1) * S; x++) {
        if (!inRect(this.layer.rect, x, y) || !this.map.inBounds(x, y)) continue;
        const d = this.map.def(x, y);
        if (d.id === 'tree') {
          trees.push({ x, y });
          continue;
        }
        let h = heights[d.id] ?? 0;
        if (h <= 0) continue;
        if (STRUCTURE.has(d.id)) h *= this.wallScale;
        const list = byTile.get(d.id) ?? [];
        list.push({ x, y, h, tall: !!d.tall });
        byTile.set(d.id, list);
      }
    }
    for (const [id, tiles] of byTile) {
      if (id === 'plant') {
        ch.extra.push(...this.plants(tiles));
        continue;
      }
      const m = this.matFor(id);
      const mesh = new THREE.InstancedMesh(this.box, m.mat, tiles.length);
      mesh.castShadow = !m.glass;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      ch.blocks.push({ mesh, tiles });
    }
    if (trees.length) ch.trees = this.treesFor(trees);
    this.chunks.set(`${cx},${cy}`, ch);
  }

  private unload(key: string): void {
    const ch = this.chunks.get(key);
    if (!ch) return;
    if (ch.floor) {
      const m = ch.floor.material as THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.dispose();
      this.scene.remove(ch.floor);
    }
    // 공유 도형·재질은 남기고 인스턴스 버퍼만 버린다
    for (const b of ch.blocks) this.dropInstanced(b.mesh);
    for (const m of ch.extra) this.dropInstanced(m);
    if (ch.trees) {
      this.dropInstanced(ch.trees.trunk);
      this.dropInstanced(ch.trees.canopy);
    }
    this.chunks.delete(key);
  }

  private dropInstanced(m: THREE.InstancedMesh): void {
    this.scene.remove(m);
    m.dispose();
  }

  private matFor(id: string): { mat: THREE.MeshStandardMaterial; base: THREE.Color; tall: boolean; glass: boolean } {
    let m = this.mats.get(id);
    if (m) return m;
    const def = this.cfg.tiles.find((t) => t.id === id)!;
    const glass = id === 'window';
    const mat = new THREE.MeshStandardMaterial({
      color: glass ? '#a9cbd8' : def.color,
      roughness: glass ? 0.15 : 0.85,
      transparent: glass,
      opacity: glass ? 0.45 : 1,
    });
    m = { mat, base: mat.color.clone(), tall: !!def.tall && !glass, glass };
    this.mats.set(id, m);
    return m;
  }

  private plants(tiles: Tile3D[]): THREE.InstancedMesh[] {
    const color = this.cfg.tiles.find((t) => t.id === 'plant')?.color ?? '#6a9a5b';
    const leafMat = this.matFor('plant').mat;
    leafMat.color.set(color);
    leafMat.flatShading = true;
    const pot = new THREE.InstancedMesh(this.potGeo, this.potMat, tiles.length);
    const leaf = new THREE.InstancedMesh(this.leafGeo, leafMat, tiles.length);
    tiles.forEach((t, i) => {
      this.tmp.makeTranslation(t.x + 0.5, 0, t.y + 0.5);
      pot.setMatrixAt(i, this.tmp);
      this.tmp.makeTranslation(t.x + 0.5, 0.38 + t.h * 0.45, t.y + 0.5);
      leaf.setMatrixAt(i, this.tmp);
    });
    for (const m of [pot, leaf]) {
      m.castShadow = true;
      this.scene.add(m);
    }
    return [pot, leaf];
  }

  /** 나무: 줄기 + 둥근 수관. 칸마다 조금씩 크기·색이 다르다 */
  private treesFor(tiles: Vec2[]): TreeGroup {
    const trunk = new THREE.InstancedMesh(this.trunkGeo, this.trunkMat, tiles.length);
    const canopy = new THREE.InstancedMesh(this.canopyGeo, this.canopyMat, tiles.length);
    const col = new THREE.Color();
    tiles.forEach((t, i) => {
      const hsh = ((t.x * 73856093) ^ (t.y * 19349663)) >>> 0;
      col.setHSL(0, 0, 0.8 + (hsh % 6) * 0.04);
      canopy.setColorAt(i, col);
    });
    trunk.castShadow = canopy.castShadow = true;
    canopy.receiveShadow = true;
    this.scene.add(trunk, canopy);
    return { trunk, canopy, tiles };
  }

  /** 벽 높이: Danger 이하에서 솟고, 플레이어 앞(카메라 쪽)을 가리는 벽·나무는 낮춘다 (컷어웨이) */
  private updateBlocks(f: Frame3D, built: boolean): void {
    const grow = 1 + (this.cfg3.dangerGrow ?? 0) * f.closeIn * (1 + 0.05 * Math.sin(f.time * 2));
    const p = f.focus;
    const key = `${grow.toFixed(3)}|${p ? `${Math.round(p.x * 4)},${Math.round(p.y * 4)}` : '-'}|${this.chunks.size}`;
    // 솟은 벽은 어두워진다 (짓눌리는 느낌)
    for (const m of this.mats.values()) if (m.tall) m.mat.color.copy(m.base).multiplyScalar(1 - 0.4 * f.closeIn);
    if (key === this.blockKey && !built) return;
    this.blockKey = key;
    const c = this.cfg3;
    const inFront = (x: number, y: number, depth: number) => !!p && y + 1 > p.y && y < p.y + depth && Math.abs(x + 0.5 - p.x) < c.cutawayWidth;
    const tr = c.tree;
    for (const ch of this.chunks.values()) {
      for (const b of ch.blocks) {
        b.tiles.forEach((t, i) => {
          let h = t.tall ? t.h * grow : t.h;
          if (t.tall && inFront(t.x, t.y, c.cutawayDepth + Math.max(0, t.h - 1.35) * 0.7)) h = Math.min(h, c.cutawayHeight);
          this.tmp.makeScale(1, h, 1).setPosition(t.x + 0.5, 0, t.y + 0.5);
          b.mesh.setMatrixAt(i, this.tmp);
        });
        b.mesh.instanceMatrix.needsUpdate = true;
      }
      if (ch.trees) {
        const { trunk, canopy, tiles } = ch.trees;
        tiles.forEach((t, i) => {
          const hsh = ((t.x * 73856093) ^ (t.y * 19349663)) >>> 0;
          const s = 0.85 + (hsh % 5) * 0.08;
          // 플레이어를 가리는 나무는 수관을 작게 (밑을 지나면 보이게)
          const cut = inFront(t.x, t.y, (tr.trunk + tr.canopy * 2) * 0.75);
          const k = cut ? 0.35 : s;
          this.tmp.makeScale(1, cut ? 0.5 : s, 1).setPosition(t.x + 0.5, 0, t.y + 0.5);
          trunk.setMatrixAt(i, this.tmp);
          this.tmp.makeScale(k, k * 0.85, k).setPosition(t.x + 0.5 + ((hsh >>> 4) % 5) * 0.06 - 0.12, (cut ? tr.trunk * 0.5 : tr.trunk * s) + tr.canopy * 0.55 * k, t.y + 0.5);
          canopy.setMatrixAt(i, this.tmp);
        });
        trunk.instanceMatrix.needsUpdate = true;
        canopy.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ───────────────────────── 지붕 ─────────────────────────

  /** 바깥에선 건물 안이 보이지 않게 지붕을 덮는다. 들어서면 걷히고, 플레이어를 가리면 비친다 */
  private updateRoofs(f: Frame3D): void {
    if (!this.extras.roofs.length) return;
    const t = f.target;
    const R = this.cfg3.streamRadius;
    const grow = 1 + (this.cfg3.dangerGrow ?? 0) * f.closeIn;
    const H = this.roofHeight;
    const p = f.focus;
    const reach = H * 0.8 + 1.5;
    const k = Math.min(1, f.dt * 5);
    for (const b of this.extras.roofs) {
      const near = b.outer.some((r) => r[0] - R < t.x && r[0] + r[2] + R > t.x && r[1] - R < t.y && r[1] + r[3] + R > t.y);
      let roof = this.roofs.get(b);
      if (!near) {
        if (roof) {
          this.disposeObject(roof.group);
          this.roofs.delete(b);
        }
        continue;
      }
      if (!roof) roof = this.makeRoof(b);
      const occludes = !!p && b.outer.some((r) => p.x > r[0] - 0.5 && p.x < r[0] + r[2] + 0.5 && r[1] > p.y - 1 && r[1] < p.y + reach);
      roof.occl += ((occludes ? 1 : 0) - roof.occl) * k;
      const a = b.alpha * (1 - roof.occl * (1 - this.cfg3.roof.occludedAlpha));
      roof.group.visible = a > 0.02;
      roof.mat.opacity = a;
      roof.mat.transparent = a < 0.98;
      roof.mat.depthWrite = a >= 0.98;
      for (const m of roof.group.children) m.castShadow = a > 0.9;
      roof.group.position.y = H * (grow - 1);
    }
  }

  private makeRoof(b: RoofBuilding): Roof3D {
    const th = this.cfg3.roof.thickness;
    const mat = new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.9 });
    const group = new THREE.Group();
    for (const r of b.outer) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(r[2] + 0.2, th, r[3] + 0.2), mat);
      m.position.set(r[0] + r[2] / 2, this.roofHeight + th / 2, r[1] + r[3] / 2);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
    }
    this.scene.add(group);
    const roof = { group, mat, occl: 0 };
    this.roofs.set(b, roof);
    return roof;
  }

  /** 간판: 지붕 위(건물 안이면) 또는 눈높이에 세운 판. 늘 카메라를 본다 */
  private updateLabels(t: Vec2): void {
    const R = this.cfg3.streamRadius;
    for (const l of this.extras.labels) {
      const near = Math.abs(l.x - t.x) < R && Math.abs(l.y - t.y) < R;
      let s = this.labels.get(l);
      if (!near) {
        if (s) {
          this.disposeObject(s);
          this.labels.delete(l);
        }
        continue;
      }
      if (s) continue;
      s = makeLabel(l);
      const onRoof = this.extras.roofs.some((b) => b.outer.some((r) => inRect(r, l.x, l.y)));
      s.position.set(l.x, onRoof ? this.roofHeight + 0.7 : 2.3, l.y);
      this.scene.add(s);
      this.labels.set(l, s);
    }
  }

  // ───────────────────────── 버스·목표 표식 ─────────────────────────

  private updateBuses(f: Frame3D): void {
    const seen = new Set<string>();
    for (const b of f.buses) {
      seen.add(b.key);
      let g = this.buses.get(b.key);
      if (!g) {
        g = makeBus();
        this.buses.set(b.key, g);
        this.scene.add(g);
      }
      g.position.set(b.x, 0, b.y);
      g.rotation.y = b.dir === -1 ? Math.PI : 0;
      const brake = g.getObjectByName('brake');
      if (brake) brake.visible = b.stopped;
      const glass = g.getObjectByName('glass') as THREE.Mesh | undefined;
      if (glass) (glass.material as THREE.MeshStandardMaterial).emissive.set('#ffe7a8').multiplyScalar(f.night * 0.6);
    }
    for (const [k, g] of this.buses) {
      if (seen.has(k)) continue;
      this.disposeObject(g);
      this.buses.delete(k);
    }
  }

  private updateBeacons(f: Frame3D): void {
    while (this.beacons.length < f.beacons.length) {
      const g = makeBeacon();
      this.beacons.push(g);
      this.scene.add(g);
    }
    const grow = 1 + (this.cfg3.dangerGrow ?? 0) * f.closeIn;
    this.beacons.forEach((g, i) => {
      const b = f.beacons[i];
      g.visible = !!b;
      if (!b) return;
      const covered = this.extras.roofs.some((r) => r.alpha > 0.5 && r.outer.some((o) => inRect(o, b.x, b.y)));
      const base = covered ? this.roofHeight * grow + 0.9 : 2.4;
      g.position.set(b.x, base + Math.abs(Math.sin(f.time * 3)) * 0.3, b.y);
      g.rotation.y = f.time * 1.2;
    });
  }

  // ───────────────────────── 사람 ─────────────────────────

  private updatePeople(f: Frame3D): void {
    for (const p of f.people) {
      let e = this.people.get(p.id);
      if (!e) {
        e = { g: p.kind === 'cat' ? makeCat(p.look.top) : makePerson(p.look, p.height, !p.crowd), seen: f.time };
        this.people.set(p.id, e);
        this.scene.add(e.g);
      }
      e.seen = f.time;
      const g = e.g;
      g.visible = true;
      g.position.set(p.x, 0, p.y);
      // 모형의 정면은 +x. 월드 방향 (cos f, sin f) → Three (x, z)
      g.rotation.y = -p.facing;
      const sink = p.sink ?? 0;
      g.scale.set(1 + sink * 0.3, 1 - sink * 0.45, 1 + sink * 0.3);
      if (p.kind === 'person') posePerson(g, p, f.time);
    }
    // 안 보이는 사람은 숨기고, 한동안 안 보이면 버린다 (행인은 계속 바뀐다)
    for (const [id, e] of this.people) {
      if (e.seen === f.time) continue;
      e.g.visible = false;
      if (f.time - e.seen > PERSON_TTL) {
        this.disposeObject(e.g);
        this.people.delete(id);
      }
    }
  }

  private disposeObject(o: THREE.Object3D): void {
    this.scene.remove(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      for (const x of mats) {
        (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      }
    });
  }
}

// ───────────────────────── 사람 모형 (도형 조합) ─────────────────────────

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
}

interface PersonParts {
  top: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial | null;
  skin: THREE.Color;
  look: string;
}

function makePerson(look: Look, height: number, shadow: boolean): THREE.Group {
  const H = height;
  const g = new THREE.Group();
  const top = mat(look.top);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, name: string, x: number, y: number, z = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = name;
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    g.add(mesh);
    return mesh;
  };
  const W = 0.36 * look.build;
  // 다리 (엉덩이에서 매달려 앞뒤로 흔든다)
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'legL' : 'legR';
    leg.position.set(0, H * 0.46, side * 0.09);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.13, H * 0.44, 0.12).translate(0, -H * 0.22, 0), mat(look.bottom));
    l.castShadow = shadow;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.12).translate(0.04, -H * 0.44 + 0.03, 0), mat(look.shoes));
    leg.add(l, shoe);
    g.add(leg);
  }
  add(new THREE.BoxGeometry(0.24, H * 0.36, W), top, 'torso', 0, H * 0.64);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(0, H * 0.8, side * (W / 2 + 0.05));
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.09, H * 0.34, 0.09).translate(0, -H * 0.17, 0), top);
    a.castShadow = shadow;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).translate(0, -H * 0.35, 0), mat(look.skin));
    arm.add(a, hand);
    g.add(arm);
  }
  const head = add(new THREE.SphereGeometry(0.15, 14, 10), mat(look.skin), 'head', 0.01, H * 0.9);
  let hairMat: THREE.MeshStandardMaterial | null = null;
  if (look.hairStyle !== 'bald') {
    hairMat = mat(look.hairStyle === 'cap' ? look.accent : look.hair);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.158, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.rotation.z = 0.35;
    hair.position.x = -0.02;
    head.add(hair);
  }
  // 눈 (정면 +x 쪽)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), mat('#2e2a30'));
    eye.name = 'eye';
    eye.position.set(0.14, 0.02, side * 0.055);
    head.add(eye);
  }
  const phone = add(new THREE.BoxGeometry(0.03, 0.14, 0.09), mat('#20232b'), 'phone', 0.22, H * 0.68);
  (phone.material as THREE.MeshStandardMaterial).emissive.set('#5a8fc8');
  phone.visible = false;
  // 우산 (비 오는 날 바깥)
  const umbrella = new THREE.Group();
  umbrella.name = 'umbrella';
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.28, 10, 1, true), new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.6, side: THREE.DoubleSide }));
  canopy.name = 'umbrellaTop';
  canopy.position.set(0.05, H * 1.12, 0);
  canopy.castShadow = shadow;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, H * 0.42, 4), mat('#3a3a3a'));
  stick.position.set(0.12, H * 0.92, 0.12);
  umbrella.add(canopy, stick);
  umbrella.visible = false;
  g.add(umbrella);
  // 공유 자전거 (앞이 +x): 두 바퀴와 틀
  const bike = new THREE.Group();
  bike.name = 'bike';
  const wheelGeo = new THREE.TorusGeometry(0.3, 0.035, 6, 16);
  for (const x of [-0.5, 0.5]) {
    const w = new THREE.Mesh(wheelGeo, mat('#26282c'));
    w.position.set(x, 0.3, 0);
    w.castShadow = shadow;
    bike.add(w);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), mat('#7fbf6a'));
  frame.position.set(0, 0.55, 0);
  frame.rotation.z = 0.12;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.5), mat('#3a3a3a'));
  bar.position.set(0.45, 0.85, 0);
  bike.add(frame, bar);
  bike.visible = false;
  g.add(bike);
  const aura = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: '#ffd65a', transparent: true, opacity: 0.25, depthWrite: false }));
  aura.name = 'aura';
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  aura.visible = false;
  g.add(aura);
  const parts: PersonParts = { top, hair: hairMat, skin: new THREE.Color(look.skin), look: lookKey(look) };
  g.userData['parts'] = parts;
  return g;
}

function lookKey(l: Look): string {
  return `${l.top}|${l.skin}|${l.hair}|${l.accent}`;
}

const BLUSH = new THREE.Color('#e8604f');

function posePerson(g: THREE.Group, p: Person3D, time: number): void {
  const parts = g.userData['parts'] as PersonParts;
  // 행인은 지칠수록 회색 덩어리로: 색이 바뀌면 재질 색만 갈아 끼운다
  const key = lookKey(p.look);
  if (key !== parts.look) {
    parts.look = key;
    parts.top.color.set(p.look.top);
    parts.skin.set(p.look.skin);
    parts.hair?.color.set(p.look.hairStyle === 'cap' ? p.look.accent : p.look.hair);
    ((g.getObjectByName('umbrellaTop') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(p.look.accent);
  }
  const s = p.walking ? Math.sin(p.walkPhase) : 0;
  const swing = s * 0.55;
  const bike = !!p.bike;
  // 자전거: 페달을 밟는 다리
  const legL = p.seated ? 1.4 : bike ? 0.7 + s * 0.35 : swing;
  const legR = p.seated ? 1.4 : bike ? 0.7 - s * 0.35 : -swing;
  g.getObjectByName('legL')!.rotation.z = legL;
  g.getObjectByName('legR')!.rotation.z = legR;
  g.getObjectByName('bike')!.visible = bike;
  const phone = !!p.phone;
  const umbrella = p.look.accessory === 'umbrella';
  const armL = g.getObjectByName('armL')!;
  const armR = g.getObjectByName('armR')!;
  armL.rotation.z = phone ? 1.0 : -swing * 0.8;
  armR.rotation.z = phone ? 1.0 : umbrella ? 1.2 : bike ? 0.9 : swing * 0.8;
  if (bike) armL.rotation.z = 0.9;
  g.getObjectByName('phone')!.visible = phone;
  g.getObjectByName('umbrella')!.visible = umbrella;
  const head = g.getObjectByName('head') as THREE.Mesh;
  head.rotation.z = phone ? -0.45 : Math.sin(time * 2 + p.x) * 0.02;
  for (const c of head.children) if (c.name === 'eye') c.visible = !p.faceless;
  // 홍조: 얼굴이 붉어진다
  (head.material as THREE.MeshStandardMaterial).color.copy(parts.skin).lerp(BLUSH, Math.min(0.6, (p.blush ?? 0) * 0.6));
  g.getObjectByName('aura')!.visible = !!p.ally;
  g.position.y = p.seated ? -0.25 : bike ? 0.12 : p.walking ? Math.abs(Math.sin(p.walkPhase)) * 0.025 : 0;
  const bk = g.getObjectByName('bike')!;
  bk.position.y = bike ? -0.12 : 0;
}

function makeCat(color: string): THREE.Group {
  const g = new THREE.Group();
  const m = mat(color);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8).rotateZ(Math.PI / 2).translate(0, 0.17, 0), m);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8).translate(0.24, 0.27, 0), m);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.32, 6).rotateZ(-0.8).translate(-0.27, 0.3, 0), m);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4).translate(0.24, 0.38, side * 0.05), m);
    g.add(ear);
  }
  for (const part of [body, head, tail]) {
    part.castShadow = true;
    g.add(part);
  }
  return g;
}

// ───────────────────────── 버스·표식·간판 ─────────────────────────

/** 마을버스: 초록 차체, 흰 띠, 창 띠, 바퀴. 앞이 +x */
function makeBus(): THREE.Group {
  const g = new THREE.Group();
  const L = BUS_LENGTH;
  const W = BUS_WIDTH;
  const body = new THREE.Mesh(new THREE.BoxGeometry(L, 2.3, W).translate(0, 0.35 + 1.15, 0), mat(BUS_BODY));
  body.castShadow = body.receiveShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, 0.18, W + 0.02).translate(0, 1.05, 0), mat('#f4f1ea'));
  const glassMat = new THREE.MeshStandardMaterial({ color: '#2c3c4c', roughness: 0.2, metalness: 0.1 });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(L - 0.6, 0.8, W + 0.03).translate(-0.1, 1.75, 0), glassMat);
  glass.name = 'glass';
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.2, W - 0.3).translate(L / 2 + 0.01, 1.6, 0), glassMat);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 1.4).translate(-1.5, 2.77, 0), mat('#d9ddd6'));
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.25, W - 0.4).translate(-L / 2 - 0.02, 0.85, 0), new THREE.MeshStandardMaterial({ color: '#f0463c', emissive: '#f0463c', emissiveIntensity: 1 }));
  brake.name = 'brake';
  g.add(body, stripe, glass, front, top, brake);
  const wheel = new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12).rotateX(Math.PI / 2);
  for (const x of [-L / 2 + 1.8, L / 2 - 1.8]) {
    for (const z of [-W / 2, W / 2]) {
      const w = new THREE.Mesh(wheel, mat('#22252a'));
      w.position.set(x, 0.45, z);
      g.add(w);
    }
  }
  return g;
}

/** 목표 표식: 아래를 가리키는 금빛 화살표 (어두운 테두리) */
function makeBeacon(): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.6, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: '#ffcf4a', emissive: '#ffb020', emissiveIntensity: 0.55, roughness: 0.4 }));
  const rim = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.68, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: '#19161e', side: THREE.BackSide }));
  g.add(cone, rim);
  return g;
}

function makeLabel(l: Label3D): THREE.Sprite {
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = '600 44px system-ui, "Malgun Gothic", sans-serif';
  g.font = font;
  const w = Math.ceil(g.measureText(l.text).width) + 40;
  c.width = w;
  c.height = 72;
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = l.color ?? 'rgba(40,38,44,0.82)';
  g.beginPath();
  g.roundRect(2, 2, w - 4, 68, l.color ? 12 : 30);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.4)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = l.color ? '#fffaf0' : '#f3ead8';
  g.fillText(l.text, w / 2, 38);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const hgt = 0.85;
  s.scale.set((hgt * w) / 72, hgt, 1);
  return s;
}
