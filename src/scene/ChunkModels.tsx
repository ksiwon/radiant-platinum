// 청크 모델 렌더 (DATA.md §2.2)
//
// 블록아웃(색칠한 상자)을 원작 지오메트리로 바꾼다. 길·계단·물가·나무·건물이
// 전부 여기서 나온다 — 우리가 모양을 지어내지 않는다.
//
// 청크 좌표계: 모델이 −16~+16 타일로 **가운데 정렬**돼 있으므로 행렬 칸의
// 한가운데에 놓는다. 높이는 모델이 스스로 갖고 있어서 따로 안 올린다.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ClampToEdgeWrapping, DataTexture, DoubleSide, MeshBasicMaterial, NearestFilter,
  SRGBColorSpace,
  type BufferAttribute, type BufferGeometry, type Material, type Texture,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import {
  loadChunkMesh, loadPropMesh, loadPropSheet, loadTexSheet, makeMaterial, sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'
import {
  cachedSplit, canBorrowFloor, cutoutGroups, floorPatch, floorSource, flowerColors, flowerSites,
  grassColors,
  plateColors, plateLumps, rockSites, shiftFloors, treeSites, trunkNudge, waterColors,
  type FloorPatch, type FloorSource, type FloorTri, type LumpSet,
} from './plates'
import { Foliage, type FoliageGroup } from './Foliage'
import { Rocks, plateBands, type RockGroup } from './Rocks'
import { Flowers, type FlowerField } from './Flowers'
import { Grass, grassSpots, type GrassField } from './Grass'
import { Water, waterField, type WaterField } from './Water'
import { shellPaint, shellPlates, wallSource, wallStrip } from './shell'
import { cardShells, type CardShells } from './cards'
import { PropFade } from './PropFade'

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

/** 청크 지형. 소품과 달리 숲 바닥을 메울 판을 하나 더 갖는다 */
interface Land extends Placed {
  /** 원작이 땅을 안 만든 숲 바닥. 둘레 지형의 타일로 메운다 (`plates.floorPatch`) */
  floor: FloorPatch | null
  /** 울타리·표지판의 옆면. 원작은 판 한 장이라 옆에서 사라진다 (`cards.ts`) */
  shells: CardShells | null
}

interface Prop extends Placed {
  y: number
  rot: [number, number, number]
  scale: [number, number, number]
  /**
   * 빠진 면을 채운 판. 원작 소품은 면이 통째로 없다 (`shell.ts`).
   *
   * 재질은 따로 없다 — **소품이 쓰는 그 배열을 그대로 쓴다.** 판에 서브메시
   * 그룹이 달려 있어서 번호가 그대로 맞는다
   */
  back: BufferGeometry | null
}

/**
 * 재질 명세 + 시트 → three 재질. 같은 조합은 한 번만 만든다.
 *
 * `cutout`이 선 서브메시는 양면으로 만든다 — 오려 낸 그림은 판 한 장이라
 * 단면으로 두면 뒤에서 사라진다
 */
function materialsFor(
  mesh: ChunkMesh, sheet: TexSheet | null, cache: Map<string, Material>,
  cutout: readonly boolean[] = [],
): Material[] {
  return mesh.materials.map((spec, i) => {
    const twoSided = cutout[i] === true
    const key = `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}/${String(twoSided)}`
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
    cache.set(key, made)
    return made
  })
}

/** 재질 명세 하나의 열쇠. `materialsFor`와 같은 꼴이라 보관함을 함께 쓴다 */
function materialKey(spec: ChunkMesh['materials'][number], twoSided: boolean): string {
  return `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}/${String(twoSided)}`
}

/**
 * 바닥 삼각형 보관함. 쪼갠 결과와 마찬가지로 청크마다 늘 같으므로 한 번만 센다
 */
const floorCache = new Map<string, FloorSource>()

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
): FloorTri[] {
  for (let ring = 1; ring <= 4; ring++) {
    const near = all.filter((p) =>
      p !== self && p.source.floors.length > 0
      && Math.max(Math.abs(p.c.mx - self.c.mx), Math.abs(p.c.my - self.c.my)) === ring)
    if (near.length === 0) continue
    const added = new Map<string, number>()
    return near.flatMap((p) => shiftFloors(
      p.source.floors, p.originX - self.originX, p.originZ - self.originZ,
      (from) => {
        const spec = p.mesh.materials[from]!
        const key = materialKey(spec, false)
        const had = added.get(key)
        if (had !== undefined) return had
        const item = sheet.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
        let made = cache.get(key)
        if (!made) {
          made = item ? makeMaterial(spec, sliceTexture(sheet, item, spec.rep)) : MISSING
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

/** 배치가 저 혼자 갖고 있던 재질을 버린다. `MISSING`은 모두가 함께 쓰므로 뺀다 */
function disposeProps(list: readonly Prop[]): void {
  const seen = new Set<Material>()
  for (const p of list) {
    for (const m of p.materials) {
      if (m === MISSING || seen.has(m)) continue
      seen.add(m)
      m.dispose()
    }
  }
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

  useEffect(() => {
    let alive = true
    const around = [...grid.chunksAround(chunkIndex, radius)]
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
        const pieces: Piece[] = loaded.map(({ c, mesh }) => {
          const cutout = cutoutGroups(mesh, sheet)
          const key = `${String(c.land)}/${String(texSet)}`
          const lumps = plateLumps(
            mesh, sheet, cutout,
            (mesh.geometry.getAttribute('position') as BufferAttribute).array as Float32Array)
          const split = cachedSplit(key, mesh, cutout, lumps)
          return {
            c, mesh, cutout, lumps, split,
            source: cachedFloors(key, mesh, split),
            originX: c.mx * CHUNK_TILES + CHUNK_TILES / 2,
            originZ: c.my * CHUNK_TILES + CHUNK_TILES / 2,
          }
        })
        const next = pieces.map((p) => {
          const { c, mesh, split, originX, originZ } = p
          for (const raw of treeSites(split)) {
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
          // 바닥이 아예 없는 청크는 이웃에서 빌려 온다. 재질은 이 배열 뒤에 붙는다.
          //
          // ⚠️ **물·턱만 있는 청크도 "없는 것"으로 친다** (`plates.floorSource`).
          // 그 그림을 숲 밑에 깔면 잔디에 파란 마름모와 갈색 턱 띠가 그어진다.
          // 이웃에서도 못 빌려 오면 그때 마지막 보루를 쓴다 — 발밑이 뚫리는
          // 것보다는 낫다
          const borrowed = p.source.floors.length > 0
            ? []
            : borrowFloors(p, pieces, sheet, materials, cache)
          const floors = borrowed.length > 0 ? borrowed : p.source.fallback ?? []
          return {
            key: `${String(c.mx)},${String(c.my)},${String(c.land)}`,
            index: c.land,
            x: originX,
            z: originZ,
            mesh,
            geometry: split.geometry,
            materials,
            // 원작 숲에는 바닥이 없다 — 잎에 가려 보일 일이 없어서 안 만든 것이다.
            // 칸마다 제일 가까운 바닥 삼각형의 **서브메시와 UV 평면**을 이어 쓴다
            floor: floorPatch(
              split, (x, z, near) => groundAt(x + originX, z + originZ, near),
              floors, p.source),
            shells: cachedShells(
              `${String(c.land)}/${String(texSet)}`, mesh, p.cutout, split, sheet, p.lumps),
          }
        })
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
      .catch(() => {
        if (alive) {
          setPlaced([]); setFoliage([]); setRocks([])
          setGrass(null); setWater(null); setFlowers(null)
        }
      })
    return () => { alive = false }
  }, [grid, chunkIndex, radius, texSet, groundAt])

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
        setProps(spots.flatMap((b, i) => {
          const got = byId.get(b.model)
          if (!got) return []
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
            key: `${String(b.model)}/${String(i)}/${String(b.x)}/${String(b.z)}`,
            index: b.model,
            x: b.x, y: b.y, z: b.z,
            rot: b.rot, scale: b.scale,
            mesh: got.mesh,
            geometry: got.mesh.geometry,
            materials,
            back: back.geometry,
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

  return (
    <group>
      {/*
        땅도 그림자를 던진다 — 나무·절벽이 청크 모델 안에 들어 있어서 여기서
        안 던지면 숲이 통째로 그림자를 안 만든다
      */}
      {placed.map((p) => (
        <group key={p.key} position={[p.x, 0, p.z]}>
          {/*
            ⚠️ **이름은 장식이 아니다.** `pnpm shot --hit`이 화면의 한 점에 광선을
            쏘아 "무엇이 거기 있느냐"를 되묻는데, 답이 `Mesh`뿐이면 지형인지
            메운 바닥인지 옆면인지 못 가른다
          */}
          <mesh name="지형" geometry={p.geometry} material={p.materials} castShadow receiveShadow />
          {/*
            숲 바닥의 구멍. 원작은 서 있는 잎 판이 제 바닥 판보다 옆으로 더
            나가 있어서, 걷어내고 나면 잎 칸의 15.6%가 발밑이 뚫린다
          */}
          {p.floor && (
            <mesh name="메운 바닥" geometry={p.floor.geometry} material={p.materials} receiveShadow />
          )}
          {/*
            울타리·표지판의 옆면. 원작 판 한 장을 세워 놔도 옆에서 보면 선
            하나로 사라진다 — 그림의 실루엣을 그대로 밀어내 두께를 준다
          */}
          {p.shells && (
            <mesh name="판 옆면" geometry={p.shells.geometry} material={p.materials} castShadow receiveShadow />
          )}
        </group>
      ))}
      {/*
        나무. 원작은 판때기 한 장이라 옆·뒤에서 종잇장이 된다 — 자리와 폭과
        색만 가져와 입체로 세운다 (`plates.ts`)
      */}
      <Foliage groups={foliage} ground={groundAt} />
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
          <PropFade geometry={p.mesh.geometry} materials={p.materials}>
            <mesh name="소품" geometry={p.mesh.geometry} material={p.materials} castShadow receiveShadow />
            {/*
              빠진 면. 원작 소품은 면이 통째로 없다 — 배치 501개 기준 −Z가 64% ·
              −X가 40% · +Y가 31% · +X가 22%다. 그쪽으로 돌아가면 반대편 벽의
              **안쪽**이 보인다 (`shell.ts`)
            */}
            {p.back && (
              <mesh name="소품 채운 면" geometry={p.back} material={p.materials} castShadow receiveShadow />
            )}
          </PropFade>
        </group>
      ))}
    </group>
  )
}
