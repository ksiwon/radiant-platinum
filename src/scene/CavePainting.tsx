// 천관산 2층 벽화와 그 조각 — 원작 입체 모델 그대로 세운다 (3D_GAP_AUDIT §3.1 · FIRST_PERSON_VISUAL_IMPROVEMENT_PLAN §9.1)
//
// 맵 208 `D05R0102`(천관산 2F). 벽화 `LOCALID_CAVE_PAINTING`(그림 203 · (7,23) · `FLAG_HIDE_MT_CORONET_2F_CAVE_PAINTING`)이 북쪽
// 벽에 붙어 있고, 갤럭시단이 부순 뒤에는 그 앞 칸에 조각 둘(그림 250 · 251 · (6,24) (8,24) · `…_CAVE_PAINTING_SHARDS`)이 놓인다.
// 셋 다 말을 걸면 글만 나온다(`scripts_mt_coronet_2f.s`의 `MtCoronet2F_CavePainting` · `…Shards`). 벽화 자리 뒤 BDSP 벽에는 구멍이
// 뚫려 있다(x 7.5 · y 2~3.5에서 수평으로 쏘면 벽을 지나 z 8.8까지 간다) — 원작은 그 구멍을 벽화가 막는다(핸섬의 「저 구멍을 보게」).
//
// ⚠️ **원작도 판때기가 아니다.** 렌더러 표(`ov5_021FAF40.c` 1559 · 1605 · 1606줄)가 셋을 사람 판(`generic_32x32`)이 아닌 제 모델로
// 보낸다 — 벽화는 `celestic_ruins_wall.nsbmd`, 조각은 `painting_shards_left` · `_right.nsbmd`다. 그 모델을 풀어 잰 값(단위 칸 · 원점은
// 객체 칸 한가운데 바닥 · `.audit/planks-20261016`):
//
// | 모델 | 꼴 |
// | --- | --- |
// | 벽 (`t5_o01_c` · 46삼각형) | 폭 4칸(x −2~2) · 높이 2칸의 **뒤로 누운 쐐기** — 앞면이 계단꼴로 z 0 → −2까지 물러나고(`WALL_PROFILE`) 양 끝을 막았다 |
// | 그림 (`t5_o01_c_` · 2삼각형) | 앞면에서 0.2칸 띄운 판 한 장 — (y 0.25, z −0.125) → (y 2, z −1.625) |
// | 조각 (`t5_o02_c` · 2삼각형) | **바닥에 누운 판** 2×1.875칸(y 0.02) — 왼쪽이 그림의 왼쪽 반(u 0~0.5), 오른쪽이 오른쪽 반 |
//
// 그래서 벽은 원작 기하를 그대로 짓고(뒷면 하나만 더한다 — 원작 쐐기는 뒤가 뚫려 있어 구멍 쪽에서 보면 속이 빈다), 그림은 원작
// 자리에 붙인다. 조각만 원작이 바닥 그림(판)이라, **그 그림의 불투명한 텍셀을 기둥으로 세워** 두께를 준다(`shardRelief` — 높이는
// 텍셀 밝기에서, ⚠️ **우리 값**이다). 그림은 다 롬 그림(`data/npc/203.png` 벽 · 그림 두 장 · `250.png` · `251.png`)이다.
//
// ⚠️ **벽 그림은 제 팔레트로 풀어야 한다** (`import/platinum/npcSprites`의 `paletteOf`). 첫 팔레트로 풀던 옛 설치본은 벽이 흰
// 바탕 붉은 무늬로 선다 — 기하는 같다
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, DoubleSide, FrontSide, Group, Mesh, MeshLambertMaterial, type Texture,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { world } from '../engine/map/world'
import { groundYAt } from './distortion'
import { npcTexture } from './npcTexture'
import { readPixels } from './NpcSprites'

/** `OBJ_EVENT_GFX_CAVE_PAINTING` */
export const CAVE_PAINTING_GFX = 203
/** `OBJ_EVENT_GFX_CAVE_PAINTING_SHARDS_LEFT` · `_RIGHT` */
export const SHARDS_LEFT_GFX = 250
export const SHARDS_RIGHT_GFX = 251

/**
 * 벽 앞면의 꺾인 자리 `[y, z]` (칸) — `celestic_ruins_wall.nsbmd` 실측. 아래에서 위로 일곱 점, 여섯 띠다.
 * 그림의 세로(v)는 높이를 그대로 따른다 — 롬 v = (2 − y) / 2 (0.063 · 0.438 · 0.5 · 0.563 · 0.938이 다 맞는다)
 */
export const WALL_PROFILE: readonly (readonly [number, number])[] = [
  [0, 0], [0.125, -0.25], [0.875, -0.75], [1, -1], [1.125, -1.25], [1.875, -1.75], [2, -2],
]
/** 벽 반폭 (칸) */
const HALF = 2
/** 쐐기가 물러나는 끝 — 양 끝 막이와 뒷면이 여기 선다 */
const BACK = -2
/**
 * 벽 그림의 가로 이음 — 왼쪽 반(x −2~0)이 u 0~0.515, 오른쪽 반(0~2)이 0.515~1이다(롬 그대로 · 33/64).
 * 한 장을 두 칸 폭에 반씩 나눠 붙인 것이다
 */
const WALL_SEAM_U = 0.515
/** 그림 판의 아래 · 위 `[y, z]` — 롬 실측 */
const FACE_LOW: readonly [number, number] = [0.25, -0.125]
const FACE_HIGH: readonly [number, number] = [2, -1.625]

/**
 * BDSP 벽 앞에 다는 거리 (칸, +z). ⚠️ **우리 값이다.** 원작 쐐기는 원작 벽에 맞춘 것이라 BDSP 절벽(`M_D_00_001_Cliff_01_02` 등)
 * 안에 묻힌다 — 수평으로 쏴 잰 BDSP 앞면(x 5.6 · 6.5 · 8.5 · 9.4)이 바닥 위 0.05칸에서 z 23.90~24.18, 2칸 위에서 21.94~22.00인데
 * 원작 쐐기는 23.5 → 21.5다. 그림 판 자리(x 5.5~9.5 · y 2.3~4)에서 BDSP 정점이 원작 그림 판보다 앞으로 나온 것이 가장 크게
 * 0.613칸(y 2.25~2.5 · x 8.65 절벽 혹) · 0.49칸(y 2.5~2.75) · 0.46칸(y 3)이다. 그 넷만 보고 0.75칸으로 두었더니 쐐기 아랫단(y 2.12~2.22)에서
 * 절벽 혹이 x 6.45 · 8.55 둘레로 최대 0.125칸 뚫고 나왔다 — 그림 앞면 전체를 0.05칸 격자로 수평으로 쏘아 다시 쟀다(REPAIR §171). 0.9칸이면
 * 뚫는 칸이 0이다. 쐐기 밑은 (7,24) 칸 안으로 0.4칸 들어오지만 높이 0.125칸 턱이라 그 칸에 선 주인공 발과 안 겹친다. 원작 땅으로 그릴 때는 안 당긴다
 */
const BDSP_MOUNT_Z = 0.9

/** 아틀라스(`203.png`) 안의 장 — 벽이 0번, 그림이 1번이다. 두 장이 가로로 붙어 있다 */
function atlasU(frame: 0 | 1, u: number): number {
  return (frame + u) / 2
}

/** 롬 v(위가 0) → three v(위가 1 · 그림이 뒤집혀 올라간다) */
function threeV(romV: number): number {
  return 1 - romV
}

/** 정점 묶음 — 위치 · UV를 모아 비인덱스 모양으로 만든다 */
class Builder {
  readonly pos: number[] = []
  readonly uv: number[] = []

  /** 삼각형 하나. UV는 three 기준 */
  tri(a: readonly number[], b: readonly number[], c: readonly number[], ua: readonly number[], ub: readonly number[], uc: readonly number[]): void {
    this.pos.push(...a, ...b, ...c)
    this.uv.push(...ua, ...ub, ...uc)
  }

  /** 네모 하나 (a → b → c → d 차례로 둘레) */
  quad(a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[],
    ua: readonly number[], ub: readonly number[], uc: readonly number[], ud: readonly number[]): void {
    this.tri(a, b, c, ua, ub, uc)
    this.tri(a, c, d, ua, uc, ud)
  }

  build(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3))
    g.setAttribute('uv', new BufferAttribute(new Float32Array(this.uv), 2))
    g.computeVertexNormals()
    g.computeBoundingSphere()
    return g
  }
}

/** 벽 앞면 u — x에서 (이음 `WALL_SEAM_U`) */
function wallU(x: number): number {
  return x <= 0 ? WALL_SEAM_U * (x + HALF) / HALF : WALL_SEAM_U + (1 - WALL_SEAM_U) * x / HALF
}

/**
 * 벽 쐐기 (`celestic_ruins_wall`의 `t5_o01c` 재질 몫). 앞면 여섯 띠를 두 반폭으로, 양 끝 막이를 띠마다, 그리고 뒷면(우리 것) 하나.
 * 원점이 객체 칸 한가운데 바닥이다
 */
export function paintingWallGeometry(): BufferGeometry {
  const b = new Builder()
  const v = (y: number): number => threeV((2 - y) / 2)
  for (let i = 0; i + 1 < WALL_PROFILE.length; i++) {
    const [y0, z0] = WALL_PROFILE[i]!
    const [y1, z1] = WALL_PROFILE[i + 1]!
    // 앞면 — 왼쪽 반 · 오른쪽 반
    for (const [xa, xb] of [[-HALF, 0], [0, HALF]] as const) {
      b.quad([xa, y0, z0], [xb, y0, z0], [xb, y1, z1], [xa, y1, z1],
        [atlasU(0, wallU(xa)), v(y0)], [atlasU(0, wallU(xb)), v(y0)], [atlasU(0, wallU(xb)), v(y1)], [atlasU(0, wallU(xa)), v(y1)])
    }
    // 양 끝 막이 — 롬은 띠마다 그림 한 장을 통째로 붙인다(u: 띠 아래 → 위 · v: 앞 1 → 뒤 0). 오른쪽은 u가 거울이다
    for (const side of [-1, 1] as const) {
      const x = side * HALF
      const u0 = side < 0 ? 0 : 1, u1 = 1 - u0
      if (z1 <= BACK) {
        // 맨 위 띠는 앞면이 뒷선에 닿아 세모다 (롬의 세모 · u 0.8 · v 0.6)
        b.tri([x, y0, z0], [x, y1, z1], [x, y0, BACK],
          [atlasU(0, u0), threeV(1)], [atlasU(0, u1), threeV(1)], [atlasU(0, side < 0 ? 0.8 : 0.2), threeV(0.6)])
        continue
      }
      b.quad([x, y0, z0], [x, y1, z1], [x, y1, BACK], [x, y0, BACK],
        [atlasU(0, u0), threeV(1)], [atlasU(0, u1), threeV(1)], [atlasU(0, u1), threeV(0)], [atlasU(0, u0), threeV(0)])
    }
  }
  // 뒷면 (우리 것) — 앞면과 같은 그림 · 같은 이음
  for (const [xa, xb] of [[-HALF, 0], [0, HALF]] as const) {
    b.quad([xa, 0, BACK], [xb, 0, BACK], [xb, 2, BACK], [xa, 2, BACK],
      [atlasU(0, wallU(xa)), v(0)], [atlasU(0, wallU(xb)), v(0)], [atlasU(0, wallU(xb)), v(2)], [atlasU(0, wallU(xa)), v(2)])
  }
  return b.build()
}

/** 벽화 그림 판 (`t5_o01c_` 재질 몫) — 앞면에서 띄운 한 장 */
export function paintingFaceGeometry(): BufferGeometry {
  const b = new Builder()
  const [y0, z0] = FACE_LOW
  const [y1, z1] = FACE_HIGH
  b.quad([-HALF, y0, z0], [HALF, y0, z0], [HALF, y1, z1], [-HALF, y1, z1],
    [atlasU(1, 0), threeV(1)], [atlasU(1, 1), threeV(1)], [atlasU(1, 1), threeV(0)], [atlasU(1, 0), threeV(0)])
  return b.build()
}

/** 조각 판의 반폭 (x · z, 칸) — `painting_shards_*.nsbmd` 실측 */
const SHARD_HALF_X = 1
const SHARD_HALF_Z = 0.937
/** 조각 판이 바닥에서 뜬 높이 — 롬 0.02 */
const SHARD_LIFT = 0.02
/**
 * 조각 기둥 높이 (칸) — 가장 어두운 텍셀이 아래, 가장 밝은 텍셀이 위다. ⚠️ **우리 값이다** — 원작은 두께 0인 바닥 그림이다.
 * 그림 속 덩이가 8~12텍셀(0.5~0.75칸)이라 그 1/3쯤 높이로 둔다. 윤곽선(가장 어두운 색)이 낮아 덩이 사이가 골이 된다
 */
const SHARD_MIN_H = 0.03
const SHARD_MAX_H = 0.22

/**
 * 조각 그림(64×32 RGBA)의 반 쪽(`half` 0 왼쪽 · 1 오른쪽 — 32×32)을 기둥으로 세운다. 원점은 객체 칸 한가운데 바닥.
 * 롬 판과 같은 자리를 덮는다 — 그림 맨 윗줄이 북(−z), 맨 아랫줄이 남(+z)이다. 불투명한 텍셀이 없으면 null
 */
export function shardRelief(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number, half: 0 | 1): BufferGeometry | null {
  const cols = width / 2
  const x0 = half * cols
  const lum = (i: number): number => 0.299 * pixels[i]! + 0.587 * pixels[i + 1]! + 0.114 * pixels[i + 2]!
  const solid = (c: number, r: number): boolean =>
    c >= 0 && c < cols && r >= 0 && r < height && pixels[(r * width + x0 + c) * 4 + 3]! >= 128
  let lo = Infinity, hi = -Infinity
  for (let r = 0; r < height; r++) for (let c = 0; c < cols; c++) {
    if (!solid(c, r)) continue
    const l = lum((r * width + x0 + c) * 4)
    lo = Math.min(lo, l); hi = Math.max(hi, l)
  }
  if (lo > hi) return null
  const span = hi - lo || 1
  const tall = (c: number, r: number): number =>
    solid(c, r) ? SHARD_MIN_H + (SHARD_MAX_H - SHARD_MIN_H) * (lum((r * width + x0 + c) * 4) - lo) / span : 0
  const dx = (2 * SHARD_HALF_X) / cols, dz = (2 * SHARD_HALF_Z) / height
  const b = new Builder()
  for (let r = 0; r < height; r++) for (let c = 0; c < cols; c++) {
    if (!solid(c, r)) continue
    const h = SHARD_LIFT + tall(c, r)
    const xa = -SHARD_HALF_X + c * dx, xb = xa + dx
    const za = -SHARD_HALF_Z + r * dz, zb = za + dz
    // 텍셀 하나를 한 색으로 칠한다 — 윗면 · 옆면 다 그 텍셀 한가운데를 본다
    const t = [(x0 + c + 0.5) / width, 1 - (r + 0.5) / height]
    b.quad([xa, h, za], [xa, h, zb], [xb, h, zb], [xb, h, za], t, t, t, t)
    // 옆면 — 이웃 윗면이 낮은 쪽만, 그 높이부터 (투명한 이웃은 바닥 0부터)
    const top = (nc: number, nr: number): number => (solid(nc, nr) ? SHARD_LIFT + tall(nc, nr) : 0)
    const west = top(c - 1, r), east = top(c + 1, r), north = top(c, r - 1), south = top(c, r + 1)
    if (west < h) b.quad([xa, west, za], [xa, west, zb], [xa, h, zb], [xa, h, za], t, t, t, t)
    if (east < h) b.quad([xb, east, zb], [xb, east, za], [xb, h, za], [xb, h, zb], t, t, t, t)
    if (north < h) b.quad([xb, north, za], [xa, north, za], [xa, h, za], [xb, h, za], t, t, t, t)
    if (south < h) b.quad([xa, south, zb], [xb, south, zb], [xb, h, zb], [xa, h, zb], t, t, t, t)
  }
  return b.build()
}

/** 그림 번호 → 다 지어 선 것. `NpcSprites`가 이 그림의 판때기를 거르는 근거다 (`ObjectProps`의 `bakedVentActors`) */
const standing = new Set<number>()

/** 이 그림을 입체로 세울 준비가 됐는가 — 그림이 와서 모양을 지었다 */
export function cavePaintingStands(gfx: number): boolean {
  return standing.has(gfx)
}

/** 그림이 왔는가 (`npcTexture`는 빈 텍스처를 먼저 돌려주고 나중에 채운다) */
function loaded(tex: Texture): { image: CanvasImageSource, width: number, height: number } | null {
  const image = tex.image as (CanvasImageSource & { width?: number, height?: number }) | null
  const width = image?.width ?? 0, height = image?.height ?? 0
  return image === null || width <= 0 || height <= 0 ? null : { image, width, height }
}

/** 그림 하나의 재질 둘 */
interface Kit { solid: MeshLambertMaterial, cut: MeshLambertMaterial }

/** 세운 것 하나 — 배우 하나에 메시 하나 둘. `seen`은 마지막으로 목록에 있던 프레임 */
interface Placed { meshes: Mesh[], seen: number }

const KINDS: ReadonlySet<number> = new Set([CAVE_PAINTING_GFX, SHARDS_LEFT_GFX, SHARDS_RIGHT_GFX])

/**
 * 벽화 · 조각을 세운다. 숨김 · 지움은 배우의 `visible` · 목록이 한다 — 판때기와 같은 조건이다. 목록은 프레임마다 다시 본다 —
 * 맵 도중에도 `AddObject` · `RemoveObject`로 사람이 들고 난다(한 맵에 많아야 수십이다)
 *
 * @param bdsp BDSP 층이 섰는가 — 벽을 BDSP 앞면까지 당긴다 (`BDSP_MOUNT_Z`)
 */
export function CavePainting({ grid, layer, mapId, bdsp }: { grid: MapGrid, layer: number, mapId: number, bdsp: boolean }) {
  const groupRef = useRef<Group>(null)
  const placed = useRef(new Map<NpcActor, Placed>())
  const frameNo = useRef(0)
  const kit = useMemo(() => ({
    wall: paintingWallGeometry(),
    face: paintingFaceGeometry(),
    /** 그림 번호 → 조각 모양 (그림이 와야 짓는다) */
    shards: new Map<number, BufferGeometry | null>(),
    materials: new Map<number, Kit>(),
  }), [])

  useEffect(() => () => {
    kit.wall.dispose(); kit.face.dispose()
    for (const g of kit.shards.values()) g?.dispose()
    for (const m of kit.materials.values()) { m.solid.dispose(); m.cut.dispose() }
    standing.clear()
  }, [kit])

  /** 그림 번호의 재질 — 벽 · 조각은 꽉 찬 것, 그림 판은 잘라내는 것 */
  const materialsOf = (gfx: number): Kit => {
    let m = kit.materials.get(gfx)
    if (m === undefined) {
      const map = npcTexture(gfx)
      m = {
        // 벽 쐐기는 롬 차례 그대로 감아서 면마다 도는 쪽이 다르다 — 양면으로 둔다. 조각 기둥은 다 바깥으로 감았다
        solid: new MeshLambertMaterial({ map, side: gfx === CAVE_PAINTING_GFX ? DoubleSide : FrontSide }),
        // 도트 경계가 뚜렷하다 — 반투명 정렬 대신 잘라낸다 (판때기와 같다)
        cut: new MeshLambertMaterial({ map, side: DoubleSide, alphaTest: 0.5 }),
      }
      kit.materials.set(gfx, m)
    }
    return m
  }

  /** 배우 하나의 메시들 — 그림이 아직 안 왔거나 못 지었으면 null (판때기가 선다) */
  const meshesOf = (gfx: number, group: Group): Mesh[] | null => {
    const image = loaded(npcTexture(gfx))
    if (image === null) return null
    const mats = materialsOf(gfx)
    let meshes: Mesh[]
    if (gfx === CAVE_PAINTING_GFX) meshes = [new Mesh(kit.wall, mats.solid), new Mesh(kit.face, mats.cut)]
    else {
      let shape = kit.shards.get(gfx)
      if (shape === undefined) {
        const pixels = readPixels(image.image, image.width, image.height)
        shape = pixels === null ? null : shardRelief(pixels, image.width, image.height, gfx === SHARDS_LEFT_GFX ? 0 : 1)
        kit.shards.set(gfx, shape)
      }
      if (shape === null) return null
      meshes = [new Mesh(shape, mats.solid)]
    }
    for (const m of meshes) {
      m.name = `벽화 ${String(gfx)}`
      m.castShadow = true
      m.receiveShadow = true
      group.add(m)
    }
    standing.add(gfx)
    return meshes
  }

  useFrame(() => {
    const group = groupRef.current
    if (group === null) return
    const stamp = ++frameNo.current
    // ⚠️ **배우 목록이 아직 앞 맵의 것일 수 있다** (`VentModels`와 같은 경주) — 맞는 목록이 올 때까지 아무것도 안 세운다
    if (npcActors.mapId === mapId) {
      for (const a of npcActors.list) {
        if (!KINDS.has(a.gfx)) continue
        let p = placed.current.get(a)
        if (p === undefined) {
          const meshes = meshesOf(a.gfx, group)
          if (meshes === null) continue
          p = { meshes, seen: 0 }
          placed.current.set(a, p)
        }
        p.seen = stamp
        const x = a.x + 0.5, z = a.z + 0.5
        const y = groundYAt(grid, world.mapId, x, z, layer, a.y, a)
        const mount = a.gfx === CAVE_PAINTING_GFX && bdsp ? BDSP_MOUNT_Z : 0
        for (const m of p.meshes) {
          m.visible = a.visible
          m.position.set(x + (a.offsetX ?? 0), y + (a.offsetY ?? 0), z + mount + (a.offsetZ ?? 0))
        }
      }
    }
    // 목록에서 빠진 배우(지웠다 · 맵을 옮겼다)의 메시는 뗀다 — 모양 · 재질은 `kit`이 들고 있다
    for (const [a, p] of placed.current) {
      if (p.seen === stamp) continue
      for (const m of p.meshes) group.remove(m)
      placed.current.delete(a)
    }
  })

  return <group ref={groupRef} />
}
