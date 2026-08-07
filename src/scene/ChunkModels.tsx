// 청크 모델 렌더 (DATA.md §2.2)
//
// 블록아웃(색칠한 상자)을 원작 지오메트리로 바꾼다. 길·계단·물가·나무·건물이
// 전부 여기서 나온다 — 우리가 모양을 지어내지 않는다.
//
// 청크 좌표계: 모델이 −16~+16 타일로 **가운데 정렬**돼 있으므로 행렬 칸의
// 한가운데에 놓는다. 높이는 모델이 스스로 갖고 있어서 따로 안 올린다.
import { useCallback, useEffect, useState } from 'react'
import {
  DoubleSide, MeshBasicMaterial, MeshLambertMaterial,
  type BufferAttribute, type BufferGeometry, type Material,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import {
  loadChunkMesh, loadPropMesh, loadPropSheet, loadTexSheet, makeMaterial, sheetTexture,
  sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'
import {
  cachedSplit, cutoutGroups, floorPatch, floorSource, grassColors, plateColors, shiftFloors,
  treeSites, waterColors,
  type FloorPatch, type FloorSource, type FloorTri,
} from './plates'
import { Foliage, type FoliageGroup } from './Foliage'
import { Grass, grassSpots, type GrassField } from './Grass'
import { Water, waterField, type WaterField } from './Water'
import { shellPaint, shellPlates } from './shell'
import { cardShells, type CardShells } from './cards'

/** 한 청크가 몇 타일인가. 모델이 그 절반씩 양쪽으로 뻗는다 */
const CHUNK_TILES = 32

/** 아직 재질을 못 만든 서브메시. 안 보이는 것보다 눈에 띄는 편이 낫다 */
const MISSING = new MeshBasicMaterial({ color: '#ff00ff', side: DoubleSide })

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
  /** 빠진 면을 채운 판. 원작 소품은 면이 통째로 없다 (`shell.ts`) */
  back: BufferGeometry | null
  /** 그 판에 입힐 재질. 소품마다 제 그림 묶음을 쓴다 */
  backMaterial: Material
}

/**
 * 채운 면의 재질.
 *
 * **원작 그림을 그대로 입힌다.** 판의 UV가 아틀라스 좌표로 고쳐져 있어서
 * (`shell.ts`의 `atlasUv`) 시트 한 장이면 소품 하나의 판 전체가 드로우콜 하나다.
 * 정점 색은 그대로 곱해진다 — 시트를 못 받았을 때 평균색으로 떨어지는 자리다.
 *
 * 묶음마다 한 벌이면 되므로 텍스처 번호로 담아 둔다
 */
const backMaterials = new Map<number, Material>()
function backMaterial(propId: number, sheet: TexSheet | null): Material {
  const hit = backMaterials.get(propId)
  if (hit) return hit
  const made = new MeshLambertMaterial({
    vertexColors: true,
    map: sheet ? sheetTexture(sheet) : null,
  })
  backMaterials.set(propId, made)
  return made
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
    const made = item && sheet
      ? makeMaterial(spec, sliceTexture(sheet, item, spec.rep), twoSided)
      : MISSING
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
  split: ReturnType<typeof cachedSplit>, sheet: TexSheet,
): CardShells | null {
  const hit = shellCache.get(key)
  if (hit !== undefined) return hit
  const made = cardShells(
    mesh, cutout,
    (split.geometry.getAttribute('position') as BufferAttribute).array as Float32Array, sheet)
  shellCache.set(key, made)
  return made
}

function cachedFloors(key: string, split: ReturnType<typeof cachedSplit>): FloorSource {
  const hit = floorCache.get(key)
  if (hit) return hit
  const made = floorSource(split)
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
 * 청크를 넘을 때마다 다시 만들면 그 순간 끊긴다
 */
const backCache = new Map<number, BufferGeometry | null>()

function cachedBack(mesh: ChunkMesh, sheet: TexSheet | null, id: number): BufferGeometry | null {
  const hit = backCache.get(id)
  if (hit !== undefined) return hit
  const made = shellPlates(mesh, shellPaint(mesh, sheet))
  backCache.set(id, made)
  return made
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
  const [grass, setGrass] = useState<GrassField | null>(null)
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
        // 빌려 오기가 이웃의 바닥과 재질을 봐야 해서 두 걸음으로 나눈다
        const pieces: Piece[] = loaded.map(({ c, mesh }) => {
          const cutout = cutoutGroups(mesh, sheet)
          const key = `${String(c.land)}/${String(texSet)}`
          const split = cachedSplit(key, mesh, cutout)
          return {
            c, mesh, cutout, split,
            source: cachedFloors(key, split),
            originX: c.mx * CHUNK_TILES + CHUNK_TILES / 2,
            originZ: c.my * CHUNK_TILES + CHUNK_TILES / 2,
          }
        })
        const next = pieces.map((p) => {
          const { c, mesh, split, originX, originZ } = p
          for (const site of treeSites(split)) {
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
          const materials = materialsFor(mesh, sheet, cache, p.cutout)
          // 바닥이 아예 없는 청크는 이웃에서 빌려 온다. 재질은 이 배열 뒤에 붙는다
          const borrowed = p.source.floors.length > 0
            ? []
            : borrowFloors(p, pieces, sheet, materials, cache)
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
              borrowed, p.source),
            shells: cachedShells(
              `${String(c.land)}/${String(texSet)}`, mesh, p.cutout, split, sheet),
          }
        })
        setPlaced(next)
        setFoliage([...byTexture.values()])
        // 풀숲 자리는 격자가 준다 — 그림이 아니라 타일 거동값이다. 색만
        // 이 영역 그림에서 가져온다
        setGrass({ spots: grassSpots(grid, chunkIndex, radius), colors: grassColors(sheet) })
        // 물도 자리는 거동값이 준다 — 색만 이 영역 그림에서 가져온다
        setWater({ ...waterField(grid, chunkIndex, radius), colors: waterColors(sheet) })
      })
      .catch(() => { if (alive) { setPlaced([]); setFoliage([]); setGrass(null); setWater(null) } })
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
        const cache = new Map<string, Material>()
        const byId = new Map(loaded.filter((x) => x !== null).map((x) => [x.id, x]))
        setProps(spots.flatMap((b, i) => {
          const got = byId.get(b.model)
          if (!got) return []
          return [{
            key: `${String(b.model)}/${String(i)}/${String(b.x)}/${String(b.z)}`,
            index: b.model,
            x: b.x, y: b.y, z: b.z,
            rot: b.rot, scale: b.scale,
            mesh: got.mesh,
            geometry: got.mesh.geometry,
            // 소품은 **전부** 양면으로 그린다. 간판·그림자처럼 한 장짜리가
            // 98개나 되고, 그것들은 단면으로 두면 뒤에서 사라진다
            materials: materialsFor(got.mesh, got.sheet, cache, got.mesh.materials.map(() => true)),
            back: cachedBack(got.mesh, got.sheet, got.id),
            backMaterial: backMaterial(got.id, got.sheet),
          }]
        }))
      })
      .catch(() => { if (alive) setProps([]) })
    return () => { alive = false }
  }, [grid, chunkIndex, radius])

  return (
    <group>
      {/*
        땅도 그림자를 던진다 — 나무·절벽이 청크 모델 안에 들어 있어서 여기서
        안 던지면 숲이 통째로 그림자를 안 만든다
      */}
      {placed.map((p) => (
        <group key={p.key} position={[p.x, 0, p.z]}>
          <mesh geometry={p.geometry} material={p.materials} castShadow receiveShadow />
          {/*
            숲 바닥의 구멍. 원작은 서 있는 잎 판이 제 바닥 판보다 옆으로 더
            나가 있어서, 걷어내고 나면 잎 칸의 15.6%가 발밑이 뚫린다
          */}
          {p.floor && (
            <mesh geometry={p.floor.geometry} material={p.materials} receiveShadow />
          )}
          {/*
            울타리·표지판의 옆면. 원작 판 한 장을 세워 놔도 옆에서 보면 선
            하나로 사라진다 — 그림의 실루엣을 그대로 밀어내 두께를 준다
          */}
          {p.shells && (
            <mesh geometry={p.shells.geometry} material={p.materials} castShadow receiveShadow />
          )}
        </group>
      ))}
      {/*
        나무. 원작은 판때기 한 장이라 옆·뒤에서 종잇장이 된다 — 자리와 폭과
        색만 가져와 입체로 세운다 (`plates.ts`)
      */}
      <Foliage groups={foliage} ground={groundAt} />
      {/*
        긴 풀. 원작은 바닥 그림이라 1인칭에서 초록 장판이 된다 — 거동값
        `0x0002`인 칸에만 포기를 세운다 (`Grass.tsx`)
      */}
      <Grass field={grass} />
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
          <mesh geometry={p.mesh.geometry} material={p.materials} castShadow receiveShadow />
          {/*
            빠진 면. 원작 소품은 면이 통째로 없다 — 배치 501개 기준 −Z가 64% ·
            −X가 40% · +Y가 31% · +X가 22%다. 그쪽으로 돌아가면 반대편 벽의
            **안쪽**이 보인다 (`shell.ts`)
          */}
          {p.back && <mesh geometry={p.back} material={p.backMaterial} castShadow receiveShadow />}
        </group>
      ))}
    </group>
  )
}
