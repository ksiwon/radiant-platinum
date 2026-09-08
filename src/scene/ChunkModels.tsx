// 청크 모델 렌더 (DATA.md §2.2)
//
// 블록아웃(색칠한 상자)을 원작 지오메트리로 바꾼다. 길·계단·물가·나무·건물이
// 전부 여기서 나온다 — 우리가 모양을 지어내지 않는다.
//
// 청크 좌표계: 모델이 −16~+16 타일로 **가운데 정렬**돼 있으므로 행렬 칸의
// 한가운데에 놓는다. 높이는 모델이 스스로 갖고 있어서 따로 안 올린다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ClampToEdgeWrapping, DataTexture, DoubleSide, MeshBasicMaterial, NearestFilter,
  SRGBColorSpace,
  type BufferAttribute, type BufferGeometry, type Material, type Texture,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import {
  loadChunkMesh, loadPropMesh, loadPropSheet, loadTexSheet, makeMaterial, sliceTexture,
  splitShadow,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'
import {
  cachedSplit, canBorrowFloor, cutoutGroups, floorPatch, floorSource, flowerColors, flowerSites,
  grassColors, groundRank, pickGround,
  plateColors, plateLumps, rockSites, shiftFloors, treeSites, trunkNudge, tuftTextures,
  waterColors,
  type FloorSource, type FloorTri, type GroundArea, type LumpSet,
} from './plates'
import { Foliage, type FoliageGroup } from './Foliage'
import { Rocks, plateBands, type RockGroup } from './Rocks'
import { Flowers, type FlowerField } from './Flowers'
import { Grass, grassSpots, type GrassField } from './Grass'
// 어디가 풀숲인지는 그림이 아니라 거동값이 말한다 — `Grass`와 같은 잣대를 쓴다
import { isTuftTile } from '../engine/battle/encounter'
import { Water, waterField, type WaterField } from './Water'
import { shellPaint, shellPlates, wallSource, wallStrip } from './shell'
import { cardShells, type CardShells } from './cards'
import { floorRegions, floorTiles, roomWalls, type RoomWalls } from './roomWalls'
import { isOutdoors, mapById, warpsOf, world } from '../engine/map/world'
import { markTerrain } from './terrainMark'
import { cameraSystem, type RoomBox } from '../engine/actor/camera'
import { PropFade } from './PropFade'
import { mergeByMaterial } from './mergeGroups'
import { isFeaturePlacement } from './movingProps'
import { isDistortionFloor } from './distortionCore'
import { AnimatedProp, hasPropAnim, usePropAnimSet } from './AnimatedProp'
import { loadPropAnimSet } from './propAnim'

/** 한 청크가 몇 타일인가. 모델이 그 절반씩 양쪽으로 뻗는다 */
const CHUNK_TILES = 32

/** 화단 한 칸에 몇 송이. 원작 도트 화단 한 칸에 꽃이 네다섯 개다 */
const FLOWERS_PER_TILE = 4

/** 칸 안에서 송이를 흩는다. 자리가 정하므로 프레임마다 안 흔들린다 */
function flowerJitter(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + salt * 51.3) * 43758.5453
  return 0.15 + (s - Math.floor(s)) * 0.7
}

/** 아직 재질을 못 만든 서브메시. 안 보이는 것보다 눈에 띄는 편이 낫다 */
const MISSING = new MeshBasicMaterial({ name: '(못 찾은 그림)', color: '#ff00ff', side: DoubleSide })

interface Placed {
  key: string
  index: number
  x: number
  z: number
  mesh: ChunkMesh
  /** 판때기 나무를 뺀 지오메트리. 나무는 `Foliage`가 입체로 세운다 */
  geometry: BufferGeometry
  materials: Material[]
}

/**
 * 지형이나 소품 하나. **그림자를 던지는 면과 안 던지는 면을 갈라 그린다.**
 *
 * ⚠️ **섞는 면이 검은 그림자를 지고 있었다.** `castShadow`는 오브젝트마다라
 * 재질 무리별로 못 끄는데, 빛기둥·물·연기는 `alphaTest: 0`이라 깊이 패스에서
 * 꽉 찬 실루엣으로 찍힌다 (`chunkMesh`의 `castsShadow`). 실측으로 천관산에서
 * 화면의 0.15%가 달라졌고 그중 610화소가 그 자국이다.
 *
 * ⚠️ **드로우콜은 안 는다.** three가 재질 무리마다 콜 하나를 내므로, 무리를
 * 두 메시에 나눠 담아도 총 콜 수는 같다. 정점 버퍼도 나눠 쓴다
 */
function TerrainMesh({ geometry, materials, name = '지형' }: {
  geometry: BufferGeometry, materials: Material[], name?: string,
}) {
  const split = useMemo(() => splitShadow(geometry, materials), [geometry, materials])
  return (
    <>
      <mesh name={name} geometry={split.solid} material={materials} castShadow receiveShadow />
      {split.soft && (
        <mesh name={`${name} 반투명`} geometry={split.soft} material={materials} receiveShadow />
      )}
    </>
  )
}

/** 청크 지형. 소품과 달리 숲 바닥을 메울 판을 하나 더 갖는다 */
interface Land extends Placed {
  /**
   * 지형·메운 바닥·판 옆면을 **한 기하로** 합친 것 (`mergeGroups`).
   *
   * 셋이 같은 재질 배열을 쓰는데 메시가 셋이라 드로우콜도 셋 몫이 나갔다.
   * 합치면 재질 하나가 콜 하나다. 배치마다 새로 만드니 **버려야 한다**
   */
  merged: BufferGeometry | null
  /** 원작이 안 만든 실내 앞벽. 출입구만 비우고 세운다 (`roomWalls.ts`) */
  room: RoomWalls | null
}

interface Prop extends Placed {
  y: number
  rot: [number, number, number]
  scale: [number, number, number]
  /** 그림표. BTP0가 그림을 갈아 끼울 때 여기서 다시 자른다 */
  sheet: TexSheet | null
  /** 원작에 없는 면을 메운 판 (`shell.shellPlates`). 없으면 null */
  fill: BufferGeometry | null
}

/**
 * 재질 명세 + 시트 → three 재질. 같은 조합은 한 번만 만든다.
 *
 * `cutout`이 선 서브메시는 양면으로 만든다 — 오려 낸 그림은 판 한 장이라
 * 단면으로 두면 뒤에서 사라진다
 */
export function materialsFor(
  mesh: ChunkMesh, sheet: TexSheet | null, cache: Map<string, Material>,
  cutout: readonly boolean[] = [],
): Material[] {
  return mesh.materials.map((spec, i) => {
    const twoSided = cutout[i] === true
    const key = materialKey(spec, twoSided, i)
    const hit = cache.get(key)
    if (hit) return hit
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    // ⚠️ **그림이 없는 서브메시는 고장이 아니다.** 원작 DS는 텍스처 없이
    // 정점 색만으로 그리는 폴리곤을 쓴다 — 오버월드 소품 서브메시 442개 중
    // 두 개가 `tex: null`이다. 이걸 "못 만든 것"으로 돌리면 무쇠시티 프렌들리숍
    // 문틀에 **자홍색 선**이 그어진다. 실제로 그렇게 나와 있었다
    const made = item && sheet
      ? makeMaterial(spec, sliceTexture(sheet, item, spec.rep), twoSided)
      : spec.tex === null ? makeMaterial(spec, null, twoSided) : MISSING
    /**
     * ⚠️ **이 그림은 이 배치의 것이다.** `sliceTexture`는 부를 때마다 새
     * `DataTexture`를 만든다 — 나눠 쓰는 것은 **묶음 그림**(`TexSheet`)이지
     * 잘라 낸 조각이 아니다. 그런데 `Material.dispose()`는 `map`을 안 버리므로,
     * 버리는 쪽이 「이 그림도 내 것인가」를 알아야 한다.
     *
     * 다른 데서 온 그림을 문 재질도 있어서(소품 띠는 `cachedBack`이 든 것을
     * 나눠 쓴다) **표시가 있는 것만** 버린다
     */
    if (made !== MISSING && (made as { map?: Texture | null }).map != null) {
      made.userData.ownsMap = true
    }
    if (made !== MISSING) depthPriority(made, i)
    cache.set(key, made)
    return made
  })
}

/**
 * 서브메시 차례를 **깊이 우선순위**로 쓴다 (z-파이팅).
 *
 * ⚠️ **원작은 같은 평면에 두 겹을 겹쳐 놓는다.** 연고시티 관문에서 실측했다 —
 * 한 픽셀에 광선을 쏘면 `area4_gate_a`와 `ngrass`가 **거리 8.55로 똑같이**
 * 잡히고 월드 좌표도 (458.5, 5.1, 684)로 같다. 둘 다 z=684 한 평면에 놓인
 * 세로 판이고, 관문 띠가 잔디 벽 위에 덧그려진 것이다. 바로 위(y 78)와
 * 아래(y 108) 픽셀에서는 `ngrass` 하나만 잡히니 겹친 띠가 좁다.
 *
 * DS는 폴리곤을 **목록 차례대로** 그려서 나중 것이 이겼다. 우리는 깊이 버퍼로
 * 그리므로 깊이가 같으면 픽셀마다 승자가 갈려 **가로 줄무늬**가 된다.
 *
 * ⚠️ **자리를 옮겨서 고치지 않는다.** 정점을 법선 방향으로 밀면 그 판이
 * 옆면에서 떠 보이고, 얼마나 밀지도 거리마다 다르다. 깊이 값만 눈금
 * 한 칸씩 당기면 **깊이가 같을 때만** 순서가 갈린다 — 그 밖에는 아무 영향이 없다.
 */
function depthPriority(material: Material, submesh: number): void {
  material.polygonOffset = true
  material.polygonOffsetFactor = 0
  // 음수가 카메라 쪽이다. 차례가 뒤일수록 더 앞으로 — 원작의 그리는 차례다
  material.polygonOffsetUnits = -(submesh + 1)
}

/**
 * 재질 명세 하나의 열쇠. `materialsFor`가 이것으로 보관함을 나눈다.
 *
 * ⚠️ **확산색도 열쇠에 든다.** 텍스처가 없는 재질은 그것만으로 색이 갈리는데
 * (`kage`는 (0,0,0), 옆의 `lambert1`은 (99,99,99)) 빼면 한 청크의 흰 재질
 * 둘이 먼저 만들어진 하나로 뭉쳐서 그림자와 판이 같은 색이 된다
 */
function materialKey(
  spec: ChunkMesh['materials'][number], twoSided: boolean, submesh: number,
): string {
  return `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}`
    // ⚠️ **서브메시 차례도 열쇠다.** `depthPriority`가 차례마다 다른 깊이 눈금을
    // 주므로, 이것을 빼면 먼저 만들어진 하나가 공유되어 그 눈금이 통째로 사라진다
    + `/${(spec.d ?? []).join(',')}/${String(twoSided)}/${String(submesh)}`
}

/**
 * 바닥 삼각형 보관함. 쪼갠 결과와 마찬가지로 청크마다 늘 같으므로 한 번만 센다
 */
const floorCache = new Map<string, FloorSource>()

/** 막힌 칸 열쇠. 월드 타일이 0~1023이라 넉넉히 잡는다 */
const SOLID_SPAN = 4096
const solidKey = (tx: number, tz: number): number => tx * SOLID_SPAN + tz

/**
 * 나무가 들어가면 안 되는 칸.
 *
 * 두 갈래를 같이 담는다 — 배치 기록이 세우는 **소품**(집·간판·다리)과, 원작
 * 청크에 세워져 있는 **판**(울타리·표지판). 판은 소품이 아니라 청크 지오메트리라
 * 배치 기록에 없다 (`shell.ts`가 실루엣을 밀어 두께를 준다)
 */
function markBox(
  into: Set<number>, x0: number, x1: number, z0: number, z1: number,
): void {
  if (!Number.isFinite(x0) || !Number.isFinite(z0)) return
  for (let tz = Math.floor(z0); tz <= Math.floor(z1 - 1e-6); tz += 1) {
    for (let tx = Math.floor(x0); tx <= Math.floor(x1 - 1e-6); tx += 1) {
      into.add(solidKey(tx, tz))
    }
  }
}

/**
 * 세워 놓은 판이 덮은 칸. 판 한 장(정점 6개)씩 잘라 그 칸을 적는다.
 *
 * ⚠️ **통짜 상자로 보면 안 된다.** 이 지오메트리는 청크 하나의 판을 전부 모아
 * 둔 것이라, 하나의 상자로 보면 청크 전체가 막힌 것이 된다
 */
function markShells(into: Set<number>, shells: CardShells, originX: number, originZ: number): void {
  const pos = shells.geometry.getAttribute('position') as BufferAttribute
  const at = pos.array as ArrayLike<number>
  for (let i = 0; i + 6 <= pos.count; i += 6) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (let k = 0; k < 6; k += 1) {
      const x = at[(i + k) * 3]!, z = at[(i + k) * 3 + 2]!
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (z < z0) z0 = z
      if (z > z1) z1 = z
    }
    markBox(into, x0 + originX, x1 + originX, z0 + originZ, z1 + originZ)
  }
}

/**
 * 그 자리에서 제일 가까운 막힌 칸까지의 거리 (타일). 없으면 `Infinity`.
 *
 * 잎이 제일 멀리 뻗는 것이 1.4타일이라 ±2칸만 보면 된다
 */
const SOLID_LOOK = 2

function clearance(solid: ReadonlySet<number>, x: number, z: number): number {
  if (solid.size === 0) return Infinity
  let best = Infinity
  const cx = Math.floor(x), cz = Math.floor(z)
  for (let tz = cz - SOLID_LOOK; tz <= cz + SOLID_LOOK; tz += 1) {
    for (let tx = cx - SOLID_LOOK; tx <= cx + SOLID_LOOK; tx += 1) {
      if (!solid.has(solidKey(tx, tz))) continue
      const dx = Math.max(tx - x, 0, x - (tx + 1))
      const dz = Math.max(tz - z, 0, z - (tz + 1))
      const d = Math.hypot(dx, dz)
      if (d < best) best = d
    }
  }
  return best
}

/**
 * 오려 낸 판의 옆면 보관함. 쪼갠 결과와 마찬가지로 청크마다 늘 같다 —
 * 청크를 넘을 때마다 실루엣을 다시 훑으면 그 순간 끊긴다
 */
const shellCache = new Map<string, CardShells | null>()

function cachedShells(
  key: string, mesh: ChunkMesh, cutout: readonly boolean[],
  split: ReturnType<typeof cachedSplit>, sheet: TexSheet, lumps: LumpSet,
): CardShells | null {
  const hit = shellCache.get(key)
  if (hit !== undefined) return hit
  const made = cardShells(
    mesh, cutout,
    (split.geometry.getAttribute('position') as BufferAttribute).array as Float32Array,
    sheet, lumps)
  shellCache.set(key, made)
  return made
}

function cachedFloors(
  key: string, mesh: ChunkMesh, split: ReturnType<typeof cachedSplit>,
): FloorSource {
  const hit = floorCache.get(key)
  if (hit) return hit
  // 물은 베껴 오지 않는다 — 숲 밑에 웅덩이가 깔린다 (`plates.canBorrowFloor`)
  const made = floorSource(split, (group) => canBorrowFloor(mesh, group))
  floorCache.set(key, made)
  return made
}

/**
 * 풀숲 그림 보관함. 같은 청크가 같은 자리에 놓이면 늘 같은 답이다 —
 * 거동값은 영역이 바뀌지 않는 한 안 변한다
 */
const tuftCache = new Map<string, Set<string>>()

/** 이 청크가 풀숲을 그리는 데 쓴 그림 이름들 (`plates.tuftTextures`) */
function cachedTufts(p: Piece, grid: MapGrid): Set<string> {
  const key = `${String(p.c.land)}/${String(p.originX)},${String(p.originZ)}`
  const hit = tuftCache.get(key)
  if (hit) return hit
  const made = tuftTextures(
    p.split,
    (g) => p.mesh.materials[g]?.tex ?? '',
    // 판 좌표가 청크 로컬이라 청크가 놓인 자리를 더해야 격자에 물을 수 있다
    (tx, tz) => isTuftTile(grid.behavior(tx + p.originX, tz + p.originZ)))
  tuftCache.set(key, made)
  return made
}

const areaCache = new Map<string, Map<string, number>>()

/**
 * 이 청크 바닥이 **그림마다 얼마나 넓은지.**
 *
 * ⚠️ **등급은 여기서 안 매긴다.** 무엇이 풀숲 그림인지는 창 전체를 모아야
 * 정해지는데(`tufts`), 창은 걸을 때마다 바뀐다. 넓이는 청크만 보면 정해지므로
 * 이것만 갈무리하고 등급은 쓸 때 매긴다
 */
function cachedArea(p: Piece): Map<string, number> {
  const key = `${String(p.c.land)}/${String(p.originX)},${String(p.originZ)}`
  const hit = areaCache.get(key)
  if (hit) return hit
  const made = new Map<string, number>()
  for (const f of p.source.floors) {
    const name = p.mesh.materials[f.group]?.tex ?? ''
    made.set(name, (made.get(name) ?? 0) + Math.abs(f.ux * f.vz - f.vx * f.uz) / 2)
  }
  areaCache.set(key, made)
  return made
}

/**
 * 청크 하나 몫의 재료. 빌려 오기가 이웃의 재질까지 봐야 해서 한 번에 들고 있는다
 */
interface Piece {
  c: { mx: number, my: number, land: number }
  mesh: ChunkMesh
  cutout: readonly boolean[]
  /** 담이 아니라 덩이인 판때기 사각형들 (`plates.plateLumps`) */
  lumps: LumpSet
  split: ReturnType<typeof cachedSplit>
  source: FloorSource
  /** 세워 놓은 판(울타리·표지판). 나무가 비켜설 자리를 여기서도 받는다 */
  shells: CardShells | null
  originX: number
  originZ: number
}

/**
 * 이웃 청크에서 바닥을 빌려 온다.
 *
 * 오버월드 배치 468개 중 46개가 이어 쓸 바닥 삼각형이 청크에 하나도 없다 —
 * 숲만 든 173번이 대부분이고, 그 46개가 잎 칸의 46.6%를 갖고 있다. 그대로 두면
 * 그 자리는 발밑이 통째로 뚫린다.
 *
 * 46개가 46개 다 **바로 옆 청크에 바닥이 있다**(실측). 그래도 고리를 넓혀 가며
 * 찾는 것은 창 가장자리에서 이웃이 안 실려 있을 수 있어서다.
 *
 * 빌려 온 삼각형의 재질은 이 청크 배열에 없다. **뒤에 덧붙이고** 그 번호를
 * 준다 — 땅 메시는 그 번호를 안 쓰므로 서로 간섭하지 않는다
 */
function borrowFloors(
  self: Piece, all: readonly Piece[], sheet: TexSheet,
  materials: Material[], cache: Map<string, Material>,
  pick?: string,
): FloorTri[] {
  /** 찾는 그림의 삼각형만. 통째로 베끼면 쓰지도 않을 것을 수만 개 옮긴다 */
  const only = (p: Piece): readonly FloorTri[] => (pick === undefined
    ? p.source.floors
    : p.source.floors.filter((f) => (p.mesh.materials[f.group]?.tex ?? '') === pick))
  for (let ring = 1; ring <= 4; ring++) {
    // ⚠️ **아무 이웃이나 잡으면 안 된다.** 찾는 그림을 가진 이웃이 이 고리에
    // 없으면 다음 고리로 넘어간다 — 안 그러면 절벽뿐인 옆 청크에서 절벽을
    // 빌려 와 놓고 「빌려 왔다」고 끝내 버린다
    const near = all.filter((p) =>
      p !== self && only(p).length > 0
      && Math.max(Math.abs(p.c.mx - self.c.mx), Math.abs(p.c.my - self.c.my)) === ring)
    if (near.length === 0) continue
    const added = new Map<string, number>()
    return near.flatMap((p) => shiftFloors(
      only(p), p.originX - self.originX, p.originZ - self.originZ,
      (from) => {
        const spec = p.mesh.materials[from]!
        // 빌려 온 바닥도 **원래 청크에서의 차례**를 그대로 쓴다 — 그래야
        // 깊이 우선순위(`depthPriority`)가 저쪽에서와 같은 순서로 갈린다
        const key = materialKey(spec, false, from)
        const had = added.get(key)
        if (had !== undefined) return had
        const item = sheet.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
        let made = cache.get(key)
        if (!made) {
          made = item ? makeMaterial(spec, sliceTexture(sheet, item, spec.rep)) : MISSING
          if (made !== MISSING) depthPriority(made, from)
          cache.set(key, made)
        }
        const at = materials.length
        materials.push(made)
        added.set(key, at)
        return at
      },
    ))
  }
  return []
}

/**
 * 소품 판 보관함. 한 소품은 늘 같은 판을 내므로 한 번만 만든다 —
 * 청크를 넘을 때마다 다시 만들면 그 순간 끊긴다.
 *
 * 그림(띠)도 여기 함께 둔다. 재질은 배치마다 새로 만들지만(`PropFade`) 그림은
 * 모델마다 하나면 된다
 */
interface Back {
  geometry: BufferGeometry | null
  /** 옆벽을 높이별 한 색으로 접은 띠의 그림. 없으면 벽 판이 없다는 뜻이다 */
  strip: Texture | null
  /** 띠가 물려받을 재질 명세 (알파·불투명도) */
  spec: ChunkMesh['materials'][number] | null
}

const backCache = new Map<number, Back>()

function cachedBack(mesh: ChunkMesh, sheet: TexSheet | null, id: number): Back {
  const hit = backCache.get(id)
  if (hit !== undefined) return hit
  const paint = shellPaint(mesh, sheet)
  const band = wallStrip(mesh, sheet, wallSource(mesh, paint))
  let strip: Texture | null = null
  if (band) {
    // 폭 1텍셀 × 높이 h. 세로만 늘어나므로 가로 물림은 뜻이 없다
    strip = new DataTexture(band.pixels, 1, band.h)
    strip.colorSpace = SRGBColorSpace
    strip.wrapS = ClampToEdgeWrapping
    strip.wrapT = ClampToEdgeWrapping
    strip.magFilter = NearestFilter
    strip.minFilter = NearestFilter
    strip.generateMipmaps = false
    strip.needsUpdate = true
  }
  const made: Back = {
    geometry: shellPlates(mesh, paint),
    strip,
    spec: band ? mesh.materials[band.group] ?? null : null,
  }
  backCache.set(id, made)
  return made
}

/**
 * 소품 몸통과 「채운 면」을 합친 기하. **모델마다 한 번만** 만든다.
 *
 * 재질 배열은 배치마다 새것이지만(`PropFade`가 배치 하나만 흐리게 하려고
 * 그렇게 한다) **같은 칸이 같은 재질로 풀리는 짜임은 늘 같다** — 합친 결과가
 * 배치와 무관하므로 여기 담아 둔다
 */
const mergedPropCache = new Map<number, BufferGeometry | null>()

function cachedMergedProp(
  id: number, mesh: BufferGeometry, back: BufferGeometry | null, materials: Material[],
): BufferGeometry | null {
  const hit = mergedPropCache.get(id)
  if (hit !== undefined) return hit
  const made = back === null ? null : mergeByMaterial([mesh, back], materials)
  mergedPropCache.set(id, made)
  return made
}

/** 배치가 저 혼자 갖고 있던 재질을 버린다. `MISSING`은 모두가 함께 쓰므로 뺀다 */
function disposeProps(list: readonly Prop[]): void {
  const seen = new Set<Material>()
  for (const p of list) {
    for (const m of p.materials) {
      if (m === MISSING || seen.has(m)) continue
      seen.add(m)
      dropMaterial(m)
    }
  }
}

/**
 * 재질 하나와 **그 재질이 제 것이라고 표시한 그림**을 버린다.
 *
 * ⚠️ **`Material.dispose()`가 `map`을 안 버린다.** GPU 자리의 대부분이
 * 그림인데 오래 그것을 안 버리고 있었다 — 실측(2026-09-08 `_land42`,
 * 축복시티↔201번도로 왕복): 씬에서 **닿는** 그림은 431~500장으로 평평한데
 * three가 세는 **만든** 그림은 242 → 3,496장으로 한 번도 안 줄고 올랐다.
 * 기하도 144 → 2,181로 같은 모양이다. 「메모리가 높다」가 아니라
 * **주인 없이 남은 것이 그만큼**이라는 뜻이다.
 *
 * ⚠️ **표시가 없는 그림은 남긴다.** 나눠 쓰는 것을 버리면 다음 배치가
 * 빈 그림을 문다 (`cachedBack`의 띠 그림이 그렇다)
 */
function dropMaterial(m: Material): void {
  if (m.userData.ownsMap === true) (m as { map?: Texture | null }).map?.dispose()
  m.dispose()
}

interface Props {
  grid: MapGrid
  chunkIndex: number
  radius: number
  /** 영역의 텍스처 묶음 번호 (`maps.json`의 areas[map.area].tex) */
  texSet: number
}

export function ChunkModels({ grid, chunkIndex, radius, texSet }: Props) {
  // 나무가 설 땅. 플레이어가 밟는 것과 **같은 자료**라 밑동이 발밑과 어긋나지
  // 않는다 — 잎 아래끝에 세우면 48,525그루 중 48,331그루가 뜬다 (`Foliage`)
  const groundAt = useCallback(
    (x: number, z: number, near: number) => grid.heightAtWorld(x, z, near), [grid])
  const [placed, setPlaced] = useState<Land[]>([])
  const [foliage, setFoliage] = useState<FoliageGroup[]>([])
  const [rocks, setRocks] = useState<RockGroup[]>([])
  const [grass, setGrass] = useState<GrassField | null>(null)
  const [flowers, setFlowers] = useState<FlowerField | null>(null)
  const [water, setWater] = useState<WaterField | null>(null)
  const [props, setProps] = useState<Prop[]>([])
  /** 소품 애니 표. 못 받으면 소품이 지금까지처럼 가만히 선다 */
  const anims = usePropAnimSet(loadPropAnimSet)
  /**
   * 나무가 못 들어가는 칸. **두 걸음으로 나눠 받는다.**
   *
   * ⚠️ **한 걸음에 받으려다 로딩을 통째로 늦췄다.** 소품 상자를 알려면 소품
   * 모델을 받아야 하는데, 그걸 청크 effect에서 같이 기다리게 했더니 **지형이
   * 건물 다운로드를 기다렸다** — 뜨는 시간이 1.6초에서 3.1~21.9초가 됐고
   * 축복시티는 아예 시간 초과였다 (`pnpm story` 실측).
   *
   * 그래서 청크가 아는 것(세운 판)은 청크 effect가, 소품은 소품 effect가 따로
   * 적는다. 소품 쪽이 늦게 와도 나무가 한 번 더 서는 것으로 끝난다
   */
  /**
   * 이번에 **받으려 한** 한 벌. 커밋 뒤에 `terrainMark`가 이것을 적는다.
   *
   * ⚠️ **`setPlaced`를 부른 자리는 아직 씬이 아니다.** 거기서 적으면
   * 「지형이 섰다」가 한 프레임 이르고, 그 한 프레임에 찍힌 컷이 하늘 한 장이다
   */
  const asked = useRef({
    mapId: -1, matrix: -1, chunkIndex: -1, want: 0, failed: false, why: null as string | null,
  })
  /**
   * **이 배치가 스스로 만든 지형 재질.** 배치가 바뀌면 앞엣것을 버려야 한다.
   *
   * ⚠️ **소품은 버리는데 지형은 안 버리고 있었다.** `materialsFor`의 보관함은
   * effect가 돌 때마다 **새것**이고, 그 안의 재질은 저마다 `sliceTexture`가
   * 새로 만든 `DataTexture`를 안고 있다 — 어느 것도 나눠 쓰지 않는다. 그런데
   * 창이 옮겨 가면 그냥 버려졌다(참조만 끊고 `dispose`는 안 했다).
   *
   * 실측(2026-09-08 `_land42`, 축복시티↔201번도로 열다섯 번 왕복): 씬의 메시는
   * 484~503으로 **평평한데** three가 세는 기하는 137 → 2,712, 그림은
   * 237 → **7,601**로 한 번도 안 줄고 올랐다. 왕복 한 번에 그림 약 600장이다.
   *
   * `pending`은 이번 것, `standingMats`는 화면에 서 있는 것이다 — **그린
   * 다음에** 앞엣것을 버린다(소품과 같은 차례다)
   */
  const pending = useRef<Material[]>([])
  const standingMats = useRef<Material[]>([])
  const [plateSolid, setPlateSolid] = useState<ReadonlySet<number>>(() => new Set())
  const [propSolid, setPropSolid] = useState<ReadonlySet<number>>(() => new Set())
  // 자리 하나에 최대 스물다섯 칸을 보므로 프레임마다 부를 것은 아니다 — 나무를
  // 세울 때 한 번씩만 쓴다 (`Foliage`의 `useMemo`)
  const clearAt = useCallback(
    (x: number, z: number) => Math.min(clearance(plateSolid, x, z), clearance(propSolid, x, z)),
    [plateSolid, propSolid])

  useEffect(() => {
    let alive = true
    const around = [...grid.chunksAround(chunkIndex, radius)]
    asked.current = {
      mapId: world.mapId, matrix: world.matrix, chunkIndex,
      want: around.length, failed: false, why: null,
    }
    void Promise.all([
      loadTexSheet(texSet),
      Promise.all(around.map((c) => loadChunkMesh(c.land).then((mesh) => ({ c, mesh })))),
    ])
      .then(([sheet, loaded]) => {
        if (!alive) return
        // 같은 (그림, 팔레트, 반복) 조합은 한 번만 만든다. 청크마다 새로
        // 만들면 25청크 × 19재질 = 텍스처 475개가 GPU에 올라간다
        const cache = new Map<string, Material>()
        // 그림이 같은 나무는 청크를 넘어 한 덩어리로 모은다. 창 안에 2천 그루가
        // 서므로 청크마다 따로 그리면 드로우콜이 수십 개가 된다
        const byTexture = new Map<string, FoliageGroup>()
        // 물가의 바위도 판때기 한 장이다. 나무와 같은 길로 모은다 (`Rocks`)
        const byRock = new Map<string, RockGroup>()
        // 화단 자리와 꽃잎 색. 청크를 넘어 한 덩어리로 모은다 — 창 하나에
        // 수백 칸이라 청크마다 따로 그리면 드로우콜만 늘어난다
        const petals: number[] = []
        const tints = new Set<number>()
        // 빌려 오기가 이웃의 바닥과 재질을 봐야 해서 두 걸음으로 나눈다
        /**
         * ⚠️ **깨어진 세계에서는 잎 판을 세우지 않는다.**
         *
         * 그곳은 원작의 필드 카메라를 **그대로** 쓴다 — 41.683칸 뒤 · 화각
         * 8.0914도 · −59.0515도(PARITY §6.10). 원작이 45°로 눕혀 둔 판은 바로
         * 그 렌즈에서 나무로 보이라고 그린 것이다. 그 카메라를 쓰면서 판만
         * 세우면 원작이 맞춰 둔 짝이 깨져 **검고 각진 파편**이 흩어진다 —
         * B4F에서 여든한 그루가 그렇게 나왔다 (REPAIR §15).
         *
         * 다른 맵은 우리 3인칭·1인칭으로 보므로 세우는 것이 맞다. 여기만 다르다.
         */
        const keepFoliage = isDistortionFloor(world.mapId ?? -1)
        const pieces: Piece[] = loaded.map(({ c, mesh }) => {
          const cutout = cutoutGroups(mesh, sheet)
          const key = `${String(c.land)}/${String(texSet)}`
          const lumps = plateLumps(
            mesh, sheet, cutout,
            (mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array)
          const split = cachedSplit(key, mesh, cutout, lumps, keepFoliage)
          return {
            c, mesh, cutout, lumps, split,
            source: cachedFloors(key, mesh, split),
            shells: cachedShells(key, mesh, cutout, split, sheet, lumps),
            originX: c.mx * CHUNK_TILES + CHUNK_TILES / 2,
            originZ: c.my * CHUNK_TILES + CHUNK_TILES / 2,
          }
        })
        /**
         * 나무가 못 들어가는 칸 (`clearance`).
         *
         * ⚠️ **줄기를 막힌 칸 쪽으로 미는 것만으로는 모자랐다** (`trunkNudge`).
         * 그것은 「길 위에 서지 마라」는 규칙이라, 집도 울타리도 막힌 칸이니
         * 오히려 **집 안쪽으로** 밀어 넣었다 — 사용자가 찍어 보낸 포켓몬 센터
         * 앞의 나무가 그것이다
         */
        /**
         * 실내인가, 그리고 어느 칸이 출입구인가.
         *
         * 워프 칸에 벽을 세우면 못 나가고 문이 벽으로 덮인다. 문 앞은 한 칸이
         * 아니라 **문 폭만큼** 비워야 해서 워프의 양옆도 같이 비운다 — 원작 문이
         * 두 칸짜리다
         */
        const header = mapById(world.mapId ?? -1)
        /**
         * ⚠️ **깨어진 세계는 실내로 세면 안 된다.** 헤더는 실내라고 적혀 있지만
         * 거기는 방이 아니라 **허공에 뜬 널판**이다 — 판마다 네 변이 전부
         * 「바닥이 끝나는데 벽이 없다」라, 세우면 판마다 상자가 씌워진다.
         *
         * 실측: 1F(573)에 벽 삼각형 292개 · B4F(577)에 330개가 섰고, 원작
         * 렌즈(8.09도)로 보면 그 판들이 화면을 가로지르는 검은 띠와 세로 실선으로
         * 찍힌다 (`node .audit/distortionWalls.mjs` · REPAIR §15)
         */
        const indoor = header !== null && !isOutdoors(header)
          && !isDistortionFloor(world.mapId ?? -1)
        const doors = new Set<number>()
        if (indoor) {
          for (const w of warpsOf(world.mapId ?? -1)) {
            for (let dx = -1; dx <= 1; dx += 1) doors.add(solidKey(w.x + dx, w.z))
          }
        }
        const isDoor = (tx: number, tz: number): boolean => doors.has(solidKey(tx, tz))

        const plates = new Set<number>()
        for (const p of pieces) {
          if (p.shells) markShells(plates, p.shells, p.originX, p.originZ)
        }
        setPlateSolid(plates)
        /**
         * 원작이 풀숲을 그리는 데 쓴 그림들 (`plates.tuftTextures`).
         *
         * ⚠️ **창 전체에서 한 번에 모은다.** 이웃에서 빌려 온 바닥은 이 청크의
         * 서브메시가 아니어서, 청크마다 따로 세면 빌려 온 풀숲이 그대로 통과한다
         */
        const tufts = new Set<string>()
        for (const p of pieces) {
          for (const name of cachedTufts(p, grid)) tufts.add(name)
        }
        /**
         * 청크마다 나무 밑에 깔 **땅 한 가지** (`plates.pickGround`).
         *
         * ⚠️ **자기 청크만 보고 고르면 청크 선이 그대로 드러난다.** 예진호수
         * (0,0)은 제 바닥이 절벽뿐이라 분홍 바위로 792칸을 깔았고 바로 옆
         * (0,1)은 풀로 616칸을 깔았다 — 숲 한복판에 직선 경계가 그어진다.
         * 그래서 **자기 + 이웃 한 겹**(3×3)을 합쳐서 고른다. 맞닿은 두 청크는
         * 아홉 칸 중 여섯을 같이 보므로 답이 거의 늘 같아진다.
         *
         * 창 전체로 넓히지 않는 것은 설원과 초원이 한 창에 같이 실릴 때
         * 한쪽이 통째로 남의 땅이 되기 때문이다
         */
        const rankOf = (name: string): number =>
          (tufts.has(name) ? 0 : groundRank(sheet, name))
        const picked = new Map<Piece, string | null>()
        for (const p of pieces) {
          const area: GroundArea = new Map()
          for (const q of pieces) {
            if (Math.max(Math.abs(q.c.mx - p.c.mx), Math.abs(q.c.my - p.c.my)) > 1) continue
            for (const [name, a] of cachedArea(q)) {
              const rank = rankOf(name)
              if (rank === 0) continue
              const had = area.get(name)
              if (had) had.area += a
              else area.set(name, { rank, area: a })
            }
          }
          picked.set(p, pickGround(area))
        }
        const next = pieces.map((p) => {
          const { c, cutout, mesh, split, originX, originZ } = p
          // 잎을 남긴 자리에는 세울 나무가 없다 — `treeSites`도 빈 배열이지만
          // 뜻을 여기서 한 번 더 적어 둔다
          for (const raw of keepFoliage ? [] : treeSites(split)) {
            // ⚠️ **걸어 다니는 칸에는 밑동을 안 세우거나 비켜 세운다.** 원작
            // 나무는 판 한 장이라 통행 가능한 칸 위에 걸쳐 있어도 그림으로만
            // 보였다. 그걸 그대로 입체로 세우면 **길 한복판에 나무가 서고 몸이
            // 그 안을 지나간다** (`trunkNudge`)
            const nudge = trunkNudge(
              (tx, tz) => grid.isBlocked(tx, tz), raw.x + originX, raw.z + originZ)
            if (!nudge) continue
            const site = nudge.dx === 0 && nudge.dz === 0
              ? raw
              : { ...raw, x: raw.x + nudge.dx, z: raw.z + nudge.dz }
            const spec = mesh.materials[site.cell.group]
            const key = `${spec?.tex ?? ''}/${spec?.pal ?? ''}`
            let group = byTexture.get(key)
            if (!group) {
              const item = sheet.items.find(
                (s) => s.tex === spec?.tex && s.pal === (spec.pal ?? ''))
              const colors = item
                ? plateColors(sheet, item)
                : { leaf: [0x4f9e52], trunk: 0x4a3a24 }
              group = { key, ...colors, items: [] }
              byTexture.set(key, group)
            }
            group.items.push([site, originX, originZ])
          }
          // 세워 놓은 바위 판. 원작은 45°로 눕힌 사각형 한 장이라 세우면
          // 새까만 달걀이 된다 — 자리와 폭만 가져와 입체로 세운다 (`Rocks`)
          for (const site of rockSites(
            mesh, (mesh.geometry.getAttribute('position') as BufferAttribute)
              .array as Float32Array, p.lumps)) {
            const spec = mesh.materials[site.group]
            // ⚠️ 열쇠에 **그림 칸**이 들어간다. 한 그림에 바위와 화분이 같이
            // 있어서 이름만으로 묶으면 화분이 바위 색으로 칠해진다
            const key = `${spec?.tex ?? ''}/${spec?.pal ?? ''}`
              + `/${site.u0.toFixed(3)},${site.u1.toFixed(3)}`
              + `,${site.v0.toFixed(3)},${site.v1.toFixed(3)}`
            let group = byRock.get(key)
            if (!group) {
              const item = sheet.items.find(
                (s) => s.tex === spec?.tex && s.pal === (spec.pal ?? ''))
              group = {
                key,
                bands: item
                  ? plateBands(sheet, item, site.u0, site.u1, site.v0, site.v1)
                  : [0x8c8c84],
                items: [],
              }
              byRock.set(key, group)
            }
            group.items.push([site, originX, originZ])
          }
          // 바닥에 깔린 꽃 그림 위에 실제로 서는 송이를 얹는다 (`Flowers`)
          for (const site of flowerSites(mesh, split)) {
            for (const c of flowerColors(sheet, mesh, site.group)) tints.add(c)
            for (let k = 0; k < FLOWERS_PER_TILE; k++) {
              const jx = flowerJitter(site.x, site.z, k * 2)
              const jz = flowerJitter(site.x, site.z, k * 2 + 1)
              petals.push(site.x + originX + jx, site.y + 0.02, site.z + originZ + jz)
            }
          }
          const materials = materialsFor(mesh, sheet, cache, p.cutout)
          // 깔 땅이 제 청크에 없으면 이웃에서 빌려 온다. 재질은 이 배열 뒤에 붙는다.
          //
          // ⚠️ **물·턱만 있는 청크도 "없는 것"으로 친다** (`plates.floorSource`).
          // 그 그림을 숲 밑에 깔면 잔디에 파란 마름모와 갈색 턱 띠가 그어진다.
          //
          // ⚠️ **「바닥이 하나도 없을 때만」으로 두었던 것이 고장이었다.** 예진호수
          // (0,0)에는 바닥이 있긴 있었다 — 절벽뿐이었을 뿐이다. 그래서 안 빌려
          // 오고 분홍 바위로 숲을 792칸 깔았다. 이제는 **고른 땅이 없으면** 빌린다.
          // 이웃에서도 못 빌려 오면 그때 마지막 보루를 쓴다 — 발밑이 뚫리는
          // 것보다는 낫다
          const pick = picked.get(p) ?? undefined
          const mine = pick !== undefined
            && p.source.floors.some((f) => (mesh.materials[f.group]?.tex ?? '') === pick)
          const borrowed = mine ? [] : borrowFloors(p, pieces, sheet, materials, cache, pick)
          const floors = borrowed.length > 0
            ? borrowed
            : p.source.floors.length > 0 ? [] : p.source.fallback ?? []
          // 원작 숲에는 바닥이 없다 — 잎에 가려 보일 일이 없어서 안 만든 것이다.
          // 그 칸에 깔 바닥 삼각형의 **서브메시와 UV 평면**을 이어 쓰되,
          // **한 그림으로 통일한다** (`plates.oneGround`) — 칸마다 제일 가까운
          // 것을 집으면 나무 밑이 눈·절벽·모래 누더기가 된다
          const floor = floorPatch(
            split, (x, z, near) => groundAt(x + originX, z + originZ, near),
            floors, p.source,
            // 풀숲 그림은 아예 후보에서 뺀다 — 깔면 숲 바닥이 통째로
            // 풀숲으로 보이는데 정작 인카운터 칸은 거기가 아니다
            (g) => {
              const name = materials[g]?.name ?? ''
              return { name, rank: rankOf(name) }
            },
            pick,
            // 머리 위를 덮은 판이 **벽인지 지붕인지**는 통행값이 가른다
            // (`plates.standLevel`) — 막힌 칸의 판은 건물 외벽이고, 걸어
            // 다니는 칸의 판은 성문 아치처럼 그 밑을 지나가는 것이다
            (x, z) => grid.isBlockedAtWorld(x + originX, z + originZ))
          return {
            key: `${String(c.mx)},${String(c.my)},${String(c.land)}`,
            index: c.land,
            x: originX,
            z: originZ,
            mesh,
            geometry: split.geometry,
            materials,
            // 원작 실내는 카메라가 고정이라 **안 보이는 쪽 벽을 안 만들었다** —
            // 문이 있는 앞벽이 그렇다. 출입구만 비우고 세운다 (`roomWalls.ts`).
            // 실외에는 안 건다: 거기서 바닥이 끝나는 자리는 맵 가장자리라
            // 벽을 세우면 세계가 상자 안에 갇힌다
            room: indoor
              ? roomWalls(split, isDoor, { x: originX, z: originZ },
                (g) => cutout[g] !== true)
              : null,
            // ⚠️ **방 벽은 안 합친다.** 나머지 셋은 그림자를 던지는데 방 벽은
            // 받기만 한다 — 합치면 안 보이는 앞벽이 방 안에 그림자를 드리운다
            merged: mergeByMaterial(
              [split.geometry, floor?.geometry, p.shells?.geometry], materials),
          }
        })
        // ⚠️ **카메라가 방 밖에 서지 않게 테두리를 넘긴다** (REPAIR §5).
        //
        // 3인칭이 여덟 칸 뒤에서 보므로 작은 방에서는 카메라가 바닥 밖으로
        // 나가고, 그러면 화면 아래가 통째로 검어진다 — 포켓몬센터가 7.5칸,
        // 들판 체육관이 7.5칸 밖이었다 (`node .audit/roomBox.mjs`).
        //
        // ⚠️ **방을 아는 자료가 이것뿐이다.** 통행 격자는 방 밖도 「안 막힘」으로
        // 두고 높이 판은 행렬 전체를 덮는 맵이 있다 — **그려진 바닥**만이 방이다.
        // 그 칸은 `roomWalls`가 벽 세울 자리를 찾느라 이미 세고 있다.
        //
        // ⚠️ **실외에는 안 넘긴다.** 거기서 바닥이 끝나는 자리는 맵 가장자리라
        // 물리면 신오 끝에서 화면이 갇힌다 (`roomWalls`를 실외에 안 거는 것과 같다)
        //
        // ⚠️ **하나로 감싸면 안 된다.** 방에서 떨어진 바닥 한 칸이 상자를 통째로
        // 부풀린다 — 연고시티 체육관 문 방(89)이 방은 x 1~15 · z 3~10인데 상자는
        // x −2~24 · z 0~19였고, 그 여유만큼 카메라가 벽을 지나 밖으로 나가
        // 화면의 73.1%가 검었다 (REPAIR §13). **이어진 것끼리** 갈라 넘긴다
        let rooms: RoomBox[] = []
        if (indoor) {
          const tiles: number[] = []
          for (const p2 of pieces) {
            tiles.push(...floorTiles(p2.split, { x: p2.originX, z: p2.originZ }))
          }
          rooms = floorRegions(tiles, (x, z) => grid.isBlocked(x, z))
        }
        cameraSystem.rooms = rooms

        // 이 배치가 만든 재질 — 커밋 뒤에 앞 배치의 것을 버리는 데 쓴다
        pending.current = [...cache.values()]
        setPlaced(next)
        setFoliage([...byTexture.values()])
        setRocks([...byRock.values()])
        // 풀숲 자리는 격자가 준다 — 그림이 아니라 타일 거동값이다. 색만
        // 이 영역 그림에서 가져온다
        setGrass({ spots: grassSpots(grid, chunkIndex, radius), colors: grassColors(sheet) })
        setFlowers(petals.length === 0 ? null : {
          spots: new Float32Array(petals),
          colors: [...tints].slice(0, 4),
          stem: 0x3f7a3a,
        })
        // 물도 자리는 거동값이 준다 — 색만 이 영역 그림에서 가져온다
        setWater({ ...waterField(grid, chunkIndex, radius), colors: waterColors(sheet) })
      })
      .catch((e: unknown) => {
        if (alive) {
          /**
           * ⚠️ **오래 이 자리가 조용했다.** 청크를 하나라도 못 받으면
           * `Promise.all`이 통째로 거절되고, 여기서 빈손으로 접은 뒤
           * **아무 자국도 안 남겼다** — 밖에서 보이는 것은 「지형 없는 하늘」
           * 한 장뿐이었고, 그것을 판정하는 자는 「덜 기다렸나」를 의심했다.
           * 삼키지 않고 적는다 (`scene/terrainMark`가 밖으로 낸다)
           */
          const why = String((e as Error | null)?.message ?? e).slice(0, 200)
          asked.current = { ...asked.current, failed: true, why }
          pending.current = []
          console.error(`[scene] 청크를 못 받아 지형을 비웠다 — 맵 ${String(world.mapId)}`
            + `/${String(world.matrix)} 칸 ${String(chunkIndex)} · ${why}`)
          setPlaced([]); setFoliage([]); setRocks([])
          setGrass(null); setWater(null); setFlowers(null)
        }
      })
    return () => { alive = false }
  }, [grid, chunkIndex, radius, texSet, groundAt])

  /**
   * **커밋이 끝났다 — 이제 씬에 있다.** 밖에서 「지형이 섰는가」를 상태로
   * 기다릴 수 있게 한 줄 적는다 (`scene/terrainMark`). 읽기만 되는 자리다
   */
  useEffect(() => {
    markTerrain({ ...asked.current, placed: placed.length })
  }, [placed])

  // 소품(집·간판)은 청크 모델에 없다. 배치 기록이 번호와 자리를 준다
  useEffect(() => {
    let alive = true
    const spots = [...grid.chunksAround(chunkIndex, radius)]
      .flatMap((c) => grid.meta.buildings[String(c.i)] ?? [])
    const wanted = [...new Set(spots.map((b) => b.model))]
    void Promise.all(wanted.map((id) =>
      Promise.all([loadPropMesh(id), loadPropSheet(id)])
        .then(([mesh, sheet]) => ({ id, mesh, sheet }))
        .catch(() => null)))
      .then((loaded) => {
        if (!alive) return
        const byId = new Map(loaded.filter((x) => x !== null).map((x) => [x.id, x]))
        // 나무가 비켜설 자리. 모델을 이미 받았으므로 상자를 여기서 찍는다
        const blockers = new Set<number>()
        for (const b of spots) {
          const got = byId.get(b.model)
          if (!got) continue
          if (!got.mesh.geometry.boundingBox) got.mesh.geometry.computeBoundingBox()
          const box = got.mesh.geometry.boundingBox
          if (!box) continue
          // 오버월드 배치는 실측으로 회전 0 · 크기 1이지만, 던전·실내에 0이 아닌
          // 값이 있으므로 Y축 회전만큼 네 귀퉁이를 돌려 상자를 다시 잡는다
          const a = b.rot?.[1] ?? 0
          const [sx, sz] = [b.scale?.[0] ?? 1, b.scale?.[2] ?? 1]
          const cos = Math.cos(a), sin = Math.sin(a)
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
          for (const [px, pz] of [
            [box.min.x, box.min.z], [box.max.x, box.min.z],
            [box.min.x, box.max.z], [box.max.x, box.max.z]] as const) {
            const rx = (px * sx) * cos + (pz * sz) * sin
            const rz = -(px * sx) * sin + (pz * sz) * cos
            x0 = Math.min(x0, rx); x1 = Math.max(x1, rx)
            z0 = Math.min(z0, rz); z1 = Math.max(z1, rz)
          }
          markBox(blockers, b.x + x0, b.x + x1, b.z + z0, b.z + z1)
        }
        setPropSolid(blockers)
        setProps(spots.flatMap((b, i) => {
          const got = byId.get(b.model)
          if (!got) return []
          // ⚠️ **장치가 움직이는 소품은 여기서 안 그린다.** 배치 기록의 y는
          // 「처음 자리」 하나뿐이라, 여기서 그리면 승강판이 올라가도 그림이 그
          // 자리에 남는다. `FeatureProps`가 지금 자리에 세운다 (PARITY §7.12)
          if (isFeaturePlacement(b.model, b.x, b.z)) return []
          // ⚠️ 재질 보관함이 **배치마다** 새것이다. 나눠 쓰면 카메라를 막은 집
          // 하나를 흐리게 할 때 같은 모델의 다른 집까지 같이 흐려진다 (`PropFade`)
          const own = new Map<string, Material>()
          const materials = materialsFor(
            // 소품은 **전부** 양면으로 그린다. 간판·그림자처럼 한 장짜리가
            // 98개나 되고, 그것들은 단면으로 두면 뒤에서 사라진다
            got.mesh, got.sheet, own, got.mesh.materials.map(() => true))
          const back = cachedBack(got.mesh, got.sheet, got.id)
          // 띠 재질은 소품 재질 배열 **뒤에** 붙는다 (`shell.stripGroup`). 배치마다
          // 새로 만들되 그림은 모델이 갖고 있는 것을 나눠 쓴다
          if (back.strip && back.spec) {
            materials.push(makeMaterial(back.spec, back.strip, true))
          }
          return [{
            // ⚠️ **y를 빼면 안 된다.** 깨어진 세계는 열 층이 같은 x·z 위에 세로로
            // 쌓여 있어서, 높이가 없으면 다른 층의 같은 소품이 같은 열쇠가 된다 —
            // React가 「중복 key」로 울고 한쪽이 안 그려진다
            key: `${String(b.model)}/${String(i)}/${String(b.x)}/${String(b.y)}/${String(b.z)}`,
            index: b.model,
            x: b.x, y: b.y, z: b.z,
            rot: b.rot, scale: b.scale,
            mesh: got.mesh,
            sheet: got.sheet,
            // 원작이 안 그린 면을 메운 판. 애니가 도는 소품은 몸통을 노드마다
            // 쪼개므로 합친 기하를 못 쓴다 — 이것만 따로 한 번 더 그린다
            fill: back.geometry,
            // 몸통과 채운 면을 합친 것. 합칠 것이 없으면 몸통 그대로다
            geometry: cachedMergedProp(got.id, got.mesh.geometry, back.geometry, materials)
              ?? got.mesh.geometry,
            materials,
          }]
        }))
      })
      .catch(() => { if (alive) setProps([]) })
    return () => { alive = false }
  }, [grid, chunkIndex, radius])

  // 소품 재질은 배치마다 새로 굽는다(위 참조). 창이 옮겨 가면 앞 창의 것을
  // 버려야 GPU에 쌓인다 — 그림 자체는 공유라 같이 안 버린다.
  //
  // **그린 다음에** 버린다. 새 목록이 화면에 붙은 뒤라야 방금 버린 재질을
  // 한 프레임 더 그리는 일이 없다
  const shown = useRef<Prop[]>([])
  useEffect(() => {
    const old = shown.current
    shown.current = props
    disposeProps(old)
  }, [props])
  useEffect(() => () => { disposeProps(shown.current) }, [])

  // 합친 청크 기하는 **배치마다 새것이다** — 메운 바닥이 이웃 지형에서 타일을
  // 빌려 오느라 자리에 매여 있어서 청크 번호로 나눠 쓸 수가 없다. 창이 옮겨
  // 가면 앞 창의 것을 버려야 GPU에 쌓인다.
  //
  // **그린 다음에** 버린다 — 새 목록이 붙은 뒤라야 방금 버린 것을 한 프레임
  // 더 그리는 일이 없다 (소품 재질과 같은 차례다)
  const standing = useRef<Land[]>([])
  /**
   * 지형 재질과 그 그림을 같이 버린다.
   *
   * ⚠️ **`Material.dispose()`는 `map`을 안 버린다.** 그림이 GPU 자리의 대부분인데
   * 재질만 버리면 그대로 남는다 — 위 실측의 「그림 7,601장」이 그것이다.
   *
   * ⚠️ **`MISSING`은 건드리지 않는다.** 모듈이 하나 들고 온 나눠 쓰는 재질이라
   * 버리면 그다음 못 찾은 서브메시가 통째로 사라진다
   */
  const dropMaterials = (list: readonly Material[]) => {
    for (const m of list) {
      if (m === MISSING) continue
      dropMaterial(m)
    }
  }
  useEffect(() => {
    const old = standing.current
    const oldMats = standingMats.current
    standing.current = placed
    standingMats.current = pending.current
    for (const p of old) p.merged?.dispose()
    dropMaterials(oldMats)
  }, [placed])
  useEffect(() => () => {
    for (const p of standing.current) p.merged?.dispose()
    dropMaterials(standingMats.current)
  }, [])

  return (
    <group>
      {/*
        땅도 그림자를 던진다 — 나무·절벽이 청크 모델 안에 들어 있어서 여기서
        안 던지면 숲이 통째로 그림자를 안 만든다
      */}
      {placed.map((p) => (
        <group key={p.key} position={[p.x, 0, p.z]}>
          {/*
            지형 + 숲 바닥의 구멍을 메운 판 + 울타리·표지판의 옆면.

            셋이 **같은 재질 배열**을 쓰는데 메시가 셋이라 청크마다 콜이 세
            몫 나갔다 — `poketch`에서 지형 230칸 · 메운 바닥 226칸 · 판 옆면
            109칸이다. 재질별로 색인을 다시 모아 하나로 합친다 (`mergeGroups`):

              메운 바닥 — 원작은 서 있는 잎 판이 제 바닥 판보다 옆으로 더 나가
                있어서, 걷어내고 나면 잎 칸의 15.6%가 발밑이 뚫린다
              판 옆면 — 원작 판 한 장은 옆에서 보면 선 하나로 사라진다.
                그림의 실루엣을 그대로 밀어내 두께를 준다

            ⚠️ **이름은 장식이 아니다.** `pnpm shot --hit`이 화면의 한 점에
            광선을 쏘아 "무엇이 거기 있느냐"를 되묻는다. 합치면서 셋을 가르는
            이름은 잃었고, 대신 방 벽은 그대로 제 이름으로 선다.

            ⚠️ 합치면 **메운 바닥도 그림자를 던진다.** 원래는 받기만 했다
          */}
          <TerrainMesh geometry={p.merged ?? p.geometry} materials={p.materials} />
          {/*
            원작이 안 만든 실내 앞벽. 카메라가 도는 화면에서는 그 자리가
            통째로 검게 뚫려 보인다 (`roomWalls.ts`)
          */}
          {p.room && (
            <mesh name="방 벽" geometry={p.room.geometry} material={p.materials} receiveShadow />
          )}
        </group>
      ))}
      {/*
        나무. 원작은 판때기 한 장이라 옆·뒤에서 종잇장이 된다 — 자리와 폭과
        색만 가져와 입체로 세운다 (`plates.ts`)
      */}
      <Foliage groups={foliage} ground={groundAt} clear={clearAt} />
      {/*
        물가의 바위. 원작은 45°로 눕힌 판 한 장이라(실측 1,001장이 전부 그렇다)
        세우면 새까만 달걀이 물 위에 늘어선다 — 자리와 폭만 가져온다 (`Rocks.tsx`)
      */}
      <Rocks groups={rocks} />
      {/*
        긴 풀. 원작은 바닥 그림이라 1인칭에서 초록 장판이 된다 — 거동값
        `0x0002`인 칸에만 포기를 세운다 (`Grass.tsx`)
      */}
      <Grass field={grass} />
      {/*
        화단. 원작은 바닥 그림이라 3인칭에서 잔디 위에 뿌린 색종이가 된다 —
        그 칸에 실제로 서는 꽃송이를 얹는다 (`Flowers.tsx`)
      */}
      <Flowers field={flowers} />
      {/*
        물. 원작은 바닥 도트라 1인칭에서 파란 장판이 된다 — 거동값 `0x0015`·
        `0x0010`인 칸 위에 실제로 출렁이는 면을 얹는다 (`Water.tsx`)
      */}
      <Water field={water} />
      {/*
        회전·크기는 배치 기록이 준다. 오버월드 468곳은 실측으로 전부 회전 0 ·
        크기 1이라 단위를 확인할 자리가 없다 — 0이 아닌 값이 나오는 실내·던전을
        붙일 때 라디안인지 다시 봐야 한다
      */}
      {props.map((p) => (
        <group key={p.key} position={[p.x, p.y, p.z]} rotation={p.rot} scale={p.scale}>
          {/*
            3인칭에서 카메라와 플레이어 사이에 든 건물은 흐려진다. 나무는 이미
            비켜 주는데 집은 안 비켜서 화면의 절반이 지붕이 됐다 (`PropFade`)
          */}
          <PropFade geometry={p.geometry} materials={p.materials}>
            {/*
              몸통 + 빠진 면. 원작 소품은 면이 통째로 없다 — 배치 501개 기준
              −Z가 64% · −X가 40% · +Y가 31% · +X가 22%다. 그쪽으로 돌아가면
              반대편 벽의 **안쪽**이 보인다 (`shell.ts`).

              둘이 같은 재질 배열을 쓰므로 한 기하로 합쳐 둔다 (`mergeGroups`) —
              `poketch`에서 소품 124칸 + 채운 면 113칸이 따로 나가던 자리다
            */}
            {/*
              애니가 있는 소품 112개는 원작 클립이 돌린다 — 문짝이 노드로 돌고,
              폭포·용암이 UV로 흐르고, 에스컬레이터가 그림을 갈아 낀다
              (`AnimatedProp`). 표를 아직 못 받았으면 정적 메시가 그대로 선다
            */}
            {anims && hasPropAnim(anims, p.index) ? (
              <AnimatedProp
                model={p.index} tile={[Math.floor(p.x), Math.floor(p.z)]}
                mesh={p.mesh} sheet={p.sheet} materials={p.materials} set={anims}
                whole={p.geometry} fill={p.fill}
              />
            ) : (
              <TerrainMesh geometry={p.geometry} materials={p.materials} name="소품" />
            )}
          </PropFade>
        </group>
      ))}
    </group>
  )
}
