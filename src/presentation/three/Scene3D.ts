import * as THREE from 'three';
import type { GameConfig } from '../../core/config';
import type { Rect, TileMap, Vec2 } from '../../world/TileMap';
import type { Look } from '../draw/people';

// 3D 시점 시제품: 위에서 비스듬히 내려다보는 Three.js 장면.
// 게임 판정(충돌·시야·길찾기)은 2D 타일 그대로이고, 이 장면은 그리기만 한다.
// 바닥은 2D 렌더러의 바닥 청크 그림을 텍스처로 쓰고, 벽·가구는 높이만큼 세운 상자, 사람은 도형을 조합한다.
// 시야 콘·시선 선·소리 파동 같은 바닥 표시는 2D 렌더러가 그린 캔버스를 바닥 바로 위 평면에 덮는다.
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
}

interface BlockGroup {
  mesh: THREE.InstancedMesh;
  tiles: { x: number; y: number; h: number; tall: boolean }[];
  base: THREE.Color;
  tall: boolean;
}

const OVERLAY_TILES = { w: 64, h: 40 };

export class Scene3D {
  readonly canvas: HTMLCanvasElement;
  /** 바닥 표시를 그릴 캔버스 (2D 렌더러가 매 프레임 채운다). overlayRect가 덮는 월드 영역 */
  readonly overlay: HTMLCanvasElement;
  overlayRect: Rect = [0, 0, OVERLAY_TILES.w, OVERLAY_TILES.h];
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly blocks: BlockGroup[] = [];
  private readonly people = new Map<string, THREE.Group>();
  private readonly overlayTex: THREE.CanvasTexture;
  private readonly overlayMesh: THREE.Mesh;
  private readonly tmp = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();
  private w = 1;
  private h = 1;
  private readonly cfg3: NonNullable<GameConfig['presentation']['view3d']>;

  constructor(
    private readonly cfg: GameConfig,
    private readonly map: TileMap,
    readonly layer: { id: string; rect: Rect },
    floorChunk: (cx: number, cy: number) => HTMLCanvasElement | null,
    chunkSize: number,
  ) {
    this.cfg3 = cfg.presentation.view3d!;
    this.canvas = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
    this.renderer.shadowMap.enabled = this.cfg3.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(cfg.tiles[0]!.color);
    this.camera = new THREE.PerspectiveCamera(this.cfg3.fov, 1, 0.5, 400);

    // 빛: 하늘·바닥 반사 + 비스듬한 해 (그림자)
    this.scene.add(new THREE.HemisphereLight('#fff6e6', '#5a5048', 1.9));
    this.sun = new THREE.DirectionalLight('#fff1dc', 1.6);
    this.sun.castShadow = this.cfg3.shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 24;
    sc.bottom = -24;
    sc.far = 120;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun, this.sun.target);

    this.buildFloor(floorChunk, chunkSize);
    this.buildBlocks();

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

  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(dpr);
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
    const dist = (c.distance * (1 + (c.dangerDistance - 1) * f.closeIn)) / Math.max(0.4, f.zoom);
    const t = f.target;
    this.camera.position.set(t.x, Math.sin(pitch) * dist, t.y + Math.cos(pitch) * dist);
    this.camera.lookAt(t.x, 0, t.y);
    this.camera.updateMatrixWorld();
    this.sun.position.set(t.x - 10, 22, t.y - 6);
    this.sun.target.position.set(t.x, 0, t.y);
    this.sun.target.updateMatrixWorld();

    this.updateBlocks(f);
    this.updatePeople(f);
    this.overlayTex.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }

  // ───────────────────────── 정적 장면 ─────────────────────────

  private buildFloor(floorChunk: (cx: number, cy: number) => HTMLCanvasElement | null, size: number): void {
    const [lx, ly, lw, lh] = this.layer.rect;
    for (let cy = Math.floor(ly / size); cy * size < ly + lh; cy++) {
      for (let cx = Math.floor(lx / size); cx * size < lx + lw; cx++) {
        const img = floorChunk(cx, cy);
        if (!img) continue;
        // 청크 캔버스는 LRU로 버려질 수 있어 복사해 둔다
        const copy = document.createElement('canvas');
        copy.width = img.width;
        copy.height = img.height;
        copy.getContext('2d')!.drawImage(img, 0, 0);
        const tex = new THREE.CanvasTexture(copy);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
        plane.rotation.x = -Math.PI / 2;
        plane.position.set(cx * size + size / 2, 0, cy * size + size / 2);
        plane.receiveShadow = true;
        this.scene.add(plane);
      }
    }
  }

  private buildBlocks(): void {
    const heights = this.cfg.presentation.view25d?.heights ?? {};
    const [lx, ly, lw, lh] = this.layer.rect;
    const byTile = new Map<string, { x: number; y: number; h: number; tall: boolean }[]>();
    for (let y = ly; y < ly + lh; y++) {
      for (let x = lx; x < lx + lw; x++) {
        const d = this.map.def(x, y);
        const h = heights[d.id] ?? 0;
        if (h <= 0) continue;
        const list = byTile.get(d.id) ?? [];
        list.push({ x, y, h, tall: !!d.tall });
        byTile.set(d.id, list);
      }
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.translate(0, 0.5, 0);
    for (const [id, tiles] of byTile) {
      const def = this.cfg.tiles.find((t) => t.id === id)!;
      if (id === 'plant') {
        this.buildPlants(tiles, def.color);
        continue;
      }
      const glass = id === 'window';
      const mat = new THREE.MeshStandardMaterial({
        color: glass ? '#a9cbd8' : def.color,
        roughness: glass ? 0.15 : 0.85,
        transparent: glass,
        opacity: glass ? 0.45 : 1,
      });
      const mesh = new THREE.InstancedMesh(box, mat, tiles.length);
      mesh.castShadow = !glass;
      mesh.receiveShadow = true;
      this.blocks.push({ mesh, tiles, base: mat.color.clone(), tall: !!def.tall && !glass });
      this.scene.add(mesh);
    }
  }

  private buildPlants(tiles: { x: number; y: number; h: number }[], color: string): void {
    const pot = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.16, 0.38, 10).translate(0, 0.19, 0), new THREE.MeshStandardMaterial({ color: '#b5764f', roughness: 0.9 }), tiles.length);
    const leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true }), tiles.length);
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
  }

  /** 벽 높이: Danger 이하에서 솟고, 플레이어 앞(카메라 쪽)을 가리는 벽은 낮춘다 (컷어웨이) */
  private updateBlocks(f: Frame3D): void {
    const grow = 1 + (this.cfg3.dangerGrow ?? 0) * f.closeIn * (1 + 0.05 * Math.sin(f.time * 2));
    const p = f.focus;
    for (const b of this.blocks) {
      b.tiles.forEach((t, i) => {
        let h = t.tall ? t.h * grow : t.h;
        if (p && t.tall && t.y + 1 > p.y && t.y < p.y + this.cfg3.cutawayDepth && Math.abs(t.x + 0.5 - p.x) < this.cfg3.cutawayWidth) h = Math.min(h, this.cfg3.cutawayHeight);
        this.tmp.makeScale(1, h, 1).setPosition(t.x + 0.5, 0, t.y + 0.5);
        b.mesh.setMatrixAt(i, this.tmp);
      });
      b.mesh.instanceMatrix.needsUpdate = true;
      // 솟은 벽은 어두워진다 (짓눌리는 느낌)
      if (b.tall) (b.mesh.material as THREE.MeshStandardMaterial).color.copy(b.base).multiplyScalar(1 - 0.4 * f.closeIn);
    }
  }

  // ───────────────────────── 사람 ─────────────────────────

  private updatePeople(f: Frame3D): void {
    const seen = new Set<string>();
    for (const p of f.people) {
      seen.add(p.id);
      let g = this.people.get(p.id);
      if (!g) {
        g = p.kind === 'cat' ? makeCat(p.look.top) : makePerson(p.look, p.height);
        this.people.set(p.id, g);
        this.scene.add(g);
      }
      g.visible = true;
      g.position.set(p.x, 0, p.y);
      // 모형의 정면은 +x. 월드 방향 (cos f, sin f) → Three (x, z)
      g.rotation.y = -p.facing;
      const sink = p.sink ?? 0;
      g.scale.set(1 + sink * 0.3, 1 - sink * 0.45, 1 + sink * 0.3);
      if (p.kind === 'person') posePerson(g, p, f.time);
    }
    for (const [id, g] of this.people) if (!seen.has(id)) g.visible = false;
  }
}

// ───────────────────────── 사람 모형 (도형 조합) ─────────────────────────

function mat(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
}

function makePerson(look: Look, height: number): THREE.Group {
  const H = height;
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, color: string, name: string, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat(color));
    m.name = name;
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  const W = 0.36 * look.build;
  // 다리 (엉덩이에서 매달려 앞뒤로 흔든다)
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'legL' : 'legR';
    leg.position.set(0, H * 0.46, side * 0.09);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.13, H * 0.44, 0.12).translate(0, -H * 0.22, 0), mat(look.bottom));
    l.castShadow = true;
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.12).translate(0.04, -H * 0.44 + 0.03, 0), mat(look.shoes));
    leg.add(l, shoe);
    g.add(leg);
  }
  add(new THREE.BoxGeometry(0.24, H * 0.36, W), look.top, 'torso', 0, H * 0.64);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(0, H * 0.8, side * (W / 2 + 0.05));
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.09, H * 0.34, 0.09).translate(0, -H * 0.17, 0), mat(look.top));
    a.castShadow = true;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6).translate(0, -H * 0.35, 0), mat(look.skin));
    arm.add(a, hand);
    g.add(arm);
  }
  const head = add(new THREE.SphereGeometry(0.15, 14, 10), look.skin, 'head', 0.01, H * 0.9);
  if (look.hairStyle !== 'bald') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.158, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(look.hairStyle === 'cap' ? look.accent : look.hair));
    hair.rotation.z = 0.35;
    hair.position.x = -0.02;
    head.add(hair);
  }
  // 눈 (정면 +x 쪽)
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), mat('#2e2a30'));
    eye.position.set(0.14, 0.02, side * 0.055);
    head.add(eye);
  }
  const phone = add(new THREE.BoxGeometry(0.03, 0.14, 0.09), '#20232b', 'phone', 0.22, H * 0.68);
  (phone.material as THREE.MeshStandardMaterial).emissive.set('#5a8fc8');
  phone.visible = false;
  const aura = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), new THREE.MeshBasicMaterial({ color: '#ffd65a', transparent: true, opacity: 0.25, depthWrite: false }));
  aura.name = 'aura';
  aura.rotation.x = -Math.PI / 2;
  aura.position.y = 0.03;
  aura.visible = false;
  g.add(aura);
  g.userData['skin'] = new THREE.Color(look.skin);
  return g;
}

function posePerson(g: THREE.Group, p: Person3D, time: number): void {
  const s = p.walking ? Math.sin(p.walkPhase) : 0;
  const swing = s * 0.55;
  g.getObjectByName('legL')!.rotation.z = p.seated ? 1.4 : swing;
  g.getObjectByName('legR')!.rotation.z = p.seated ? 1.4 : -swing;
  const phone = !!p.phone;
  const armL = g.getObjectByName('armL')!;
  const armR = g.getObjectByName('armR')!;
  armL.rotation.z = phone ? 1.0 : -swing * 0.8;
  armR.rotation.z = phone ? 1.0 : swing * 0.8;
  g.getObjectByName('phone')!.visible = phone;
  const head = g.getObjectByName('head') as THREE.Mesh;
  head.rotation.z = phone ? -0.45 : Math.sin(time * 2 + p.x) * 0.02;
  // 홍조: 얼굴이 붉어진다
  const skin = g.userData['skin'] as THREE.Color;
  (head.material as THREE.MeshStandardMaterial).color.copy(skin).lerp(new THREE.Color('#e8604f'), Math.min(0.6, (p.blush ?? 0) * 0.6));
  g.getObjectByName('aura')!.visible = !!p.ally;
  g.position.y = p.seated ? -0.25 : p.walking ? Math.abs(Math.sin(p.walkPhase)) * 0.025 : 0;
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
