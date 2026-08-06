// 청크 모델 렌더 (DATA.md §2.2)
//
// 블록아웃(색칠한 상자)을 원작 지오메트리로 바꾼다. 길·계단·물가·나무·건물이
// 전부 여기서 나온다 — 우리가 모양을 지어내지 않는다.
//
// 청크 좌표계: 모델이 −16~+16 타일로 **가운데 정렬**돼 있으므로 행렬 칸의
// 한가운데에 놓는다. 높이는 모델이 스스로 갖고 있어서 따로 안 올린다.
import { useEffect, useState } from 'react'
import {
  DoubleSide, MeshBasicMaterial, MeshLambertMaterial,
  type BufferGeometry, type Material,
} from 'three'
import type { MapGrid } from '../engine/map/grid'
import {
  loadChunkMesh, loadPropMesh, loadPropSheet, loadTexSheet, makeMaterial, sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'
import { cachedSplit, cutoutGroups, grassColors, plateColors } from './plates'
import { Foliage, type FoliageGroup } from './Foliage'
import { Grass, grassSpots, type GrassField } from './Grass'
import { backPlate, shellColors } from './shell'

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

interface Prop extends Placed {
  y: number
  rot: [number, number, number]
  scale: [number, number, number]
  /** 뒤판. 원작 집은 뒤가 통째로 없다 (`shell.ts`) */
  back: BufferGeometry | null
}

/** 뒤판은 색을 정점이 나른다. 재질은 한 벌이면 된다 */
const BACK = new MeshLambertMaterial({ vertexColors: true })

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

/**
 * 소품 뒤판 보관함. 한 소품은 늘 같은 뒤판을 내므로 한 번만 만든다 —
 * 청크를 넘을 때마다 다시 만들면 그 순간 끊긴다
 */
const backCache = new Map<number, BufferGeometry | null>()

function cachedBack(mesh: ChunkMesh, sheet: TexSheet | null, id: number): BufferGeometry | null {
  const hit = backCache.get(id)
  if (hit !== undefined) return hit
  const made = backPlate(mesh, shellColors(mesh, sheet, cutoutGroups(mesh, sheet)))
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
  const [placed, setPlaced] = useState<Placed[]>([])
  const [foliage, setFoliage] = useState<FoliageGroup[]>([])
  const [grass, setGrass] = useState<GrassField | null>(null)
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
        const next = loaded.map(({ c, mesh }) => {
          const cutout = cutoutGroups(mesh, sheet)
          const split = cachedSplit(`${String(c.land)}/${String(texSet)}`, mesh, cutout)
          const originX = c.mx * CHUNK_TILES + CHUNK_TILES / 2
          const originZ = c.my * CHUNK_TILES + CHUNK_TILES / 2
          for (const [cellId, cell] of split.cells) {
            const spec = mesh.materials[cell.group]
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
            group.items.push([cellId, cell, originX, originZ])
          }
          return {
            key: `${String(c.mx)},${String(c.my)},${String(c.land)}`,
            index: c.land,
            x: originX,
            z: originZ,
            mesh,
            geometry: split.geometry,
            materials: materialsFor(mesh, sheet, cache, cutout),
          }
        })
        setPlaced(next)
        setFoliage([...byTexture.values()])
        // 풀숲 자리는 격자가 준다 — 그림이 아니라 타일 거동값이다. 색만
        // 이 영역 그림에서 가져온다
        setGrass({ spots: grassSpots(grid, chunkIndex, radius), colors: grassColors(sheet) })
      })
      .catch(() => { if (alive) { setPlaced([]); setFoliage([]); setGrass(null) } })
    return () => { alive = false }
  }, [grid, chunkIndex, radius, texSet])

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
        <mesh
          key={p.key}
          position={[p.x, 0, p.z]}
          geometry={p.geometry}
          material={p.materials}
          castShadow
          receiveShadow
        />
      ))}
      {/*
        나무. 원작은 판때기 한 장이라 옆·뒤에서 종잇장이 된다 — 자리와 폭과
        색만 가져와 입체로 세운다 (`plates.ts`)
      */}
      <Foliage groups={foliage} />
      {/*
        긴 풀. 원작은 바닥 그림이라 1인칭에서 초록 장판이 된다 — 거동값
        `0x0002`인 칸에만 포기를 세운다 (`Grass.tsx`)
      */}
      <Grass field={grass} />
      {/*
        회전·크기는 배치 기록이 준다. 오버월드 468곳은 실측으로 전부 회전 0 ·
        크기 1이라 단위를 확인할 자리가 없다 — 0이 아닌 값이 나오는 실내·던전을
        붙일 때 라디안인지 다시 봐야 한다
      */}
      {props.map((p) => (
        <group key={p.key} position={[p.x, p.y, p.z]} rotation={p.rot} scale={p.scale}>
          <mesh geometry={p.mesh.geometry} material={p.materials} castShadow receiveShadow />
          {/*
            뒷면. 원작 집은 뒤가 통째로 없어서(주인공 집 219삼각형 중 −Z를 보는
            면이 0개) 뒤로 돌아가면 앞벽의 **안쪽**이 보인다 (`shell.ts`)
          */}
          {p.back && <mesh geometry={p.back} material={BACK} castShadow receiveShadow />}
        </group>
      ))}
    </group>
  )
}
