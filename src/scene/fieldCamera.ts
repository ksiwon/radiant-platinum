// 필드 카메라 **하나**. `Stage`가 `<Canvas camera={…}>`에 그대로 넘긴다.
//
// ⚠️ **왜 우리가 쥐는가.** R3F에게 맡기면 첫 화면이 통째로 안 나온다.
// R3F 9의 `configure`는 카메라를 `new PerspectiveCamera(75, 0, …)` — **aspect 0**
// 으로 만들고, 올바른 값은 나중에 스토어 구독이 크기 변화를 보고 `updateCamera()`로
// 넣는다. 그런데 `configure`는 맨 위에서 `store.getState()`를 **한 번 떠서** 그
// 사본의 `state.camera`를 본다. 우리 `gl` 팩토리는 비동기라 그것을 기다리는 동안
// `configure`가 한 번 더 들어오고, **그 사본에도 카메라가 아직 없다.**
//
// 실측(2026-09-07, `tools/e2e/_appshape41.mjs`의 `real` 변형 — 제품을 안 바꾸고
// 카메라만 들여다본다):
//
//     27214ms  configure가 카메라 85438d19를 만든다          aspect 0
//     27215ms  구독의 updateCamera가 **그것을** 고친다        aspect 1.5
//     27215ms  configure가 **둘째** 카메라 e40f26cc를 만든다  aspect 0
//     27236ms  three가 그리는 것은 e40f26cc다                 aspect 0
//
// 둘째가 스토어에 앉는 순간 크기는 이미 최종값이라 구독이 다시 안 울리고,
// `updateCamera`가 **영영 안 닿는다.** aspect가 0이면 `updateProjectionMatrix`의
// `width = height * aspect`가 0이 되어 `2·near/(right−left)`가 무한대가 되고,
// 모든 정점의 clip **x**가 무한대·NaN이 된다 — 드로우는 나가는데 래스터에 한
// 픽셀도 안 남는다. 창을 한 번 흔들면 그때 구독이 울려 고쳐지고, 그때부터
// 계속 정상이다. 이것이 §41에서 「크기가 한 번 바뀌기 전까지 안 나오던」 것이다.
//
// 카메라 **객체**를 주면 `configure`는 그것을 스토어에 넣기만 한다 — 두 번
// 들어와도 같은 객체다. 게다가 aspect가 처음부터 1이라 **퇴화한 투영이 아예
// 만들어질 수 없다** (REPAIR §41).
import {
  AdditiveBlending, BackSide, Box3, DoubleSide, Matrix4, PerspectiveCamera, Ray, Sphere, Vector3,
  type BufferAttribute, type BufferGeometry, type InstancedMesh, type InterleavedBufferAttribute, type Material,
  type Mesh, type Object3D,
} from 'three'
import { cameraSystem, FIELD_FOV, FIELD_NEAR } from '../engine/actor/camera'
import { sceneRefs } from './sceneRefs'

/**
 * 필드 카메라 하나를 만든다.
 *
 * ⚠️ **aspect를 0으로 두지 않는다.** 크기를 아직 모르는 순간에도 투영은
 * 유한해야 한다 — 실제 비율은 R3F가 창을 재서 넣어 준다
 */
export function makeFieldCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(FIELD_FOV, 1, FIELD_NEAR, 200)
  camera.position.set(0, 6, 9)
  return camera
}

/** 이 앱의 필드 카메라. **세대가 올라도 같은 것을 쓴다** */
export const fieldCamera = makeFieldCamera()

/**
 * 눈을 가리는 재질인가 — 깊이를 쓰고 색을 쓰는 것만.
 *
 * ⚠️ **입구 빛 · 조명 줄기는 빼야 한다.** BDSP 문 앞에는 더해지는 빛 판이 서 있는데(`BdspField`의 `isLightShaft`)
 * 그것까지 막는 것으로 세면 문 앞에서 늘 눈이 머리 속으로 들어간다
 */
function blocksEye(m: Material): boolean {
  return m.visible && m.depthWrite && m.colorWrite && m.blending !== AdditiveBlending
}

/**
 * 지오메트리 하나의 삼각형을 **로컬 xz 칸**으로 나눈 표. 처음 맞춰 볼 때 한 번 만들어 지오메트리마다 쥔다.
 *
 * ⚠️ **three의 `raycast`로 쏘면 안 된다.** 그쪽은 경계 구가 레이 시작점을 품으면 메시의 삼각형을 **전부** 훑는데,
 * 지역 바닥 · 절벽 메시는 구가 마을 하나를 품는다. 실측(영원시티 · area002+003 씬 · 168만 삼각형 · 머리 셋 × 방향
 * 서른여섯): 한 번 쏘는 데 가운데 2.5ms · 최대 9.4ms였고, 그 대부분이 늘 걸리는 판 메시(7,556 · 6,516 · 4,518
 * 삼각형)를 다 훑는 값이었다. 칸으로 나누면 레이 토막이 지나는 칸의 삼각형만 본다 — 같은 씬에서 가운데 0.23ms ·
 * 최대 1.5ms다. 표를 만드는 값은 처음 걸리는 메시마다 한 번이다(그 자리 첫 레이 18.7ms).
 *
 * ⚠️ **꼭짓점을 CPU에서 고쳐 쓰는 지오메트리는 표가 낡는다.** 지금 씬에서 움직이는 것은 노드 행렬(문 클립)과
 * GPU 셰이더(물)뿐이라 안 걸린다 — 행렬은 쏠 때마다 새로 읽는다
 */
interface TriGrid {
  minX: number
  minZ: number
  cell: number
  nx: number
  nz: number
  /** 칸 k의 삼각형은 `tris[start[k]] .. tris[start[k + 1] - 1]` */
  start: Uint32Array
  tris: Uint32Array
}
/** 칸 한 변(로컬 단위). 칸이 너무 많아지면 두 배씩 키운다 */
const GRID_CELL = 2
const GRID_MAX_CELLS = 1 << 16
const grids = new WeakMap<BufferGeometry, TriGrid | null>()

/** 삼각형 `tri`의 `k`번째 꼭짓점 번호 */
const corner = (geo: BufferGeometry, tri: number, k: number): number =>
  geo.index === null ? tri * 3 + k : geo.index.getX(tri * 3 + k)

function triGrid(geo: BufferGeometry): TriGrid | null {
  const had = grids.get(geo)
  if (had !== undefined) return had
  const pos = geo.getAttribute('position') as BufferAttribute | InterleavedBufferAttribute | undefined
  const count = pos === undefined ? 0 : Math.floor((geo.index === null ? pos.count : geo.index.count) / 3)
  if (pos === undefined || count === 0) { grids.set(geo, null); return null }
  // 꼭짓점 x · z를 한 번 풀어 둔다 — 삼각형마다 `getX`를 세 번씩 부르면 첫 레이가 그만큼 더 선다
  const xs = new Float32Array(pos.count)
  const zs = new Float32Array(pos.count)
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
  for (let i = 0; i < pos.count; i++) {
    const x = (xs[i] = pos.getX(i)), z = (zs[i] = pos.getZ(i))
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  const across = (c: number): number => Math.max(1, Math.ceil((maxX - minX) / c))
  const down = (c: number): number => Math.max(1, Math.ceil((maxZ - minZ) / c))
  let cell = GRID_CELL
  while (across(cell) * down(cell) > GRID_MAX_CELLS) cell *= 2
  const nx = across(cell), nz = down(cell)
  const at = (v: number, lo: number, n: number): number => Math.min(n - 1, Math.max(0, Math.floor((v - lo) / cell)))
  // 삼각형마다 걸치는 칸 범위 [x0, x1, z0, z1]. 한 번 재어 두고 두 번 돈다 — 세고, 자리를 잡아 채운다
  const index = geo.index?.array ?? null
  const ranges = new Int32Array(count * 4)
  const start = new Uint32Array(nx * nz + 1)
  for (let t = 0; t < count; t++) {
    const a = index === null ? t * 3 : index[t * 3]!
    const b = index === null ? t * 3 + 1 : index[t * 3 + 1]!
    const c = index === null ? t * 3 + 2 : index[t * 3 + 2]!
    const x0 = at(Math.min(xs[a]!, xs[b]!, xs[c]!), minX, nx), x1 = at(Math.max(xs[a]!, xs[b]!, xs[c]!), minX, nx)
    const z0 = at(Math.min(zs[a]!, zs[b]!, zs[c]!), minZ, nz), z1 = at(Math.max(zs[a]!, zs[b]!, zs[c]!), minZ, nz)
    ranges[t * 4] = x0
    ranges[t * 4 + 1] = x1
    ranges[t * 4 + 2] = z0
    ranges[t * 4 + 3] = z1
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) start[cz * nx + cx + 1]!++
  }
  for (let k = 0; k < nx * nz; k++) start[k + 1]! += start[k]!
  const fill = start.slice(0, nx * nz)
  const tris = new Uint32Array(start[nx * nz]!)
  for (let t = 0; t < count; t++) {
    for (let cz = ranges[t * 4 + 2]!; cz <= ranges[t * 4 + 3]!; cz++) {
      for (let cx = ranges[t * 4]!; cx <= ranges[t * 4 + 1]!; cx++) tris[fill[cz * nx + cx]!++] = t
    }
  }
  const grid: TriGrid = { minX, minZ, cell, nx, nz, start, tris }
  grids.set(geo, grid)
  return grid
}

/** 그 삼각형이 쓰는 재질. 여러 재질 메시는 지오메트리 묶음(`groups`)이 정한다 */
function materialOf(mesh: Mesh, tri: number): Material | undefined {
  if (!Array.isArray(mesh.material)) return mesh.material
  const at = tri * 3
  for (const g of mesh.geometry.groups) {
    if (at >= g.start && at < g.start + g.count) return mesh.material[g.materialIndex ?? 0]
  }
  return undefined
}

const span = new Box3()
const tip = new Vector3()
const sphere = new Sphere()
const world = new Matrix4()
const instance = new Matrix4()
const inverse = new Matrix4()
const local = new Ray()
const from = new Vector3()
const to = new Vector3()
const va = new Vector3()
const vb = new Vector3()
const vc = new Vector3()
const hitAt = new Vector3()

/** 머리 · 길이 · 지금까지 제일 가까운 것. 한 번 쏘는 동안만 쓴다 */
const shot = { head: new Vector3(), reach: 0, best: Infinity, out: new Vector3() }

/** 메시 하나(인스턴스면 그 하나)를 `matrix` 자리에 놓고 레이 토막이 지나는 칸의 삼각형만 맞춰 본다 */
function castInto(mesh: Mesh, matrix: Matrix4): void {
  const grid = triGrid(mesh.geometry)
  if (grid === null) return
  const pos = mesh.geometry.getAttribute('position') as BufferAttribute | InterleavedBufferAttribute
  inverse.copy(matrix).invert()
  from.copy(shot.head).applyMatrix4(inverse)
  to.copy(tip).applyMatrix4(inverse)
  local.origin.copy(from)
  local.direction.copy(to).sub(from).normalize()
  const cx0 = Math.max(0, Math.floor((Math.min(from.x, to.x) - grid.minX) / grid.cell))
  const cx1 = Math.min(grid.nx - 1, Math.floor((Math.max(from.x, to.x) - grid.minX) / grid.cell))
  const cz0 = Math.max(0, Math.floor((Math.min(from.z, to.z) - grid.minZ) / grid.cell))
  const cz1 = Math.min(grid.nz - 1, Math.floor((Math.max(from.z, to.z) - grid.minZ) / grid.cell))
  for (let cz = cz0; cz <= cz1; cz++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const k = cz * grid.nx + cx
      for (let i = grid.start[k]!; i < grid.start[k + 1]!; i++) {
        const tri = grid.tris[i]!
        const m = materialOf(mesh, tri)
        if (m === undefined || !blocksEye(m)) continue
        va.fromBufferAttribute(pos, corner(mesh.geometry, tri, 0))
        vb.fromBufferAttribute(pos, corner(mesh.geometry, tri, 1))
        vc.fromBufferAttribute(pos, corner(mesh.geometry, tri, 2))
        // 면의 어느 쪽을 맞힐지는 three의 `raycast`와 같다 — 앞면 재질은 뒷면을 그냥 지나간다
        const p = m.side === BackSide
          ? local.intersectTriangle(vc, vb, va, true, hitAt)
          : local.intersectTriangle(va, vb, vc, m.side !== DoubleSide, hitAt)
        if (p === null) continue
        hitAt.applyMatrix4(matrix)
        const d = hitAt.distanceTo(shot.head)
        if (d > shot.reach || d >= shot.best) continue
        shot.best = d
        shot.out.copy(hitAt)
      }
    }
  }
}

/** 경계 구로 거른 뒤 `castInto`. 인스턴스 메시는 통째로 한 번, 인스턴스마다 한 번 더 거른다 */
function castMesh(mesh: Mesh): void {
  const geo = mesh.geometry
  if (geo.boundingSphere === null) geo.computeBoundingSphere()
  if (geo.boundingSphere === null) return
  const many = mesh as Mesh & { isInstancedMesh?: boolean }
  if (many.isInstancedMesh === true) {
    const all = mesh as InstancedMesh
    if (all.boundingSphere === null) all.computeBoundingSphere()
    if (all.boundingSphere !== null
      && !span.intersectsSphere(sphere.copy(all.boundingSphere).applyMatrix4(mesh.matrixWorld))) return
    for (let i = 0; i < all.count; i++) {
      all.getMatrixAt(i, instance)
      world.multiplyMatrices(mesh.matrixWorld, instance)
      if (span.intersectsSphere(sphere.copy(geo.boundingSphere).applyMatrix4(world))) castInto(mesh, world)
    }
    return
  }
  if (span.intersectsSphere(sphere.copy(geo.boundingSphere).applyMatrix4(mesh.matrixWorld))) {
    castInto(mesh, mesh.matrixWorld)
  }
}

/**
 * 1인칭 머리에서 시선으로 `reach`만큼 쏴 **처음 맞은 자리**를 `out`에 넣어 낸다 (`cameraSystem.eyeProbe`).
 *
 * 보이는 메시를 다 본다 — BDSP 지역 · 방 · 던전과 원작 청크 · 소품이 다 문틀이 된다(배틀프런티어 입구는 원작
 * 소품 298이다). 값은 두 겹으로 묶는다: 경계 구가 레이 토막의 상자에 안 걸치는 메시(인스턴스면 인스턴스)는
 * 건너뛰고, 걸치는 것도 토막이 지나는 칸의 삼각형만 본다(`TriGrid`). 경계 구는 렌더러가 화면 밖 거르기에 이미
 * 굽는 값이다.
 *
 * ⚠️ **빼는 것** — 주인공(`skip`: 몸 · 탄 것 · 든 것이 다 그 그룹이다), 뼈 메시(사람 · 포켓몬. 뼈를 풀어 가며
 * 맞추므로 비싸고 서 있는 자리도 칸 단위가 아니다), 여러 지오메트리를 묶은 메시, 눈을 안 가리는 재질(`blocksEye`)
 */
export function probeEye(
  scene: Object3D | null, skip: Object3D | null, head: Vector3, dir: Vector3, reach: number, out: Vector3,
): Vector3 | null {
  if (scene === null) return null
  shot.head.copy(head)
  shot.reach = reach
  shot.best = Infinity
  tip.copy(dir).multiplyScalar(reach).add(head)
  span.makeEmpty().expandByPoint(head).expandByPoint(tip)
  const visit = (o: Object3D): void => {
    if (!o.visible || o === skip) return
    const mesh = o as Mesh & { isSkinnedMesh?: boolean, isBatchedMesh?: boolean }
    if (mesh.isMesh === true && mesh.isSkinnedMesh !== true && mesh.isBatchedMesh !== true) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (mats.some(blocksEye)) castMesh(mesh)
    }
    for (const c of o.children) visit(c)
  }
  visit(scene)
  if (shot.best === Infinity) return null
  return out.copy(shot.out)
}

const eyeHitPoint = new Vector3()
cameraSystem.eyeProbe = (head, dir, reach) =>
  probeEye(sceneRefs.stage.scene, sceneRefs.player, head, dir, reach, eyeHitPoint)
