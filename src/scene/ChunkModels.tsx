// 청크 모델 렌더 (DATA.md §2.2)
//
// 블록아웃(색칠한 상자)을 원작 지오메트리로 바꾼다. 길·계단·물가·나무·건물이
// 전부 여기서 나온다 — 우리가 모양을 지어내지 않는다.
//
// 청크 좌표계: 모델이 −16~+16 타일로 **가운데 정렬**돼 있으므로 행렬 칸의
// 한가운데에 놓는다. 높이는 모델이 스스로 갖고 있어서 따로 안 올린다.
import { useEffect, useState } from 'react'
import { DoubleSide, MeshBasicMaterial, type Material } from 'three'
import type { MapGrid } from '../engine/map/grid'
import {
  loadChunkMesh, loadPropMesh, loadPropSheet, loadTexSheet, makeMaterial, sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'

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
  materials: Material[]
}

interface Prop extends Placed {
  y: number
  rot: [number, number, number]
  scale: [number, number, number]
}

/** 재질 명세 + 시트 → three 재질. 같은 조합은 한 번만 만든다 */
function materialsFor(
  mesh: ChunkMesh, sheet: TexSheet | null, cache: Map<string, Material>,
): Material[] {
  return mesh.materials.map((spec) => {
    const key = `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}`
    const hit = cache.get(key)
    if (hit) return hit
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    const made = item && sheet ? makeMaterial(spec, sliceTexture(sheet, item, spec.rep)) : MISSING
    cache.set(key, made)
    return made
  })
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
        const next = loaded.map(({ c, mesh }) => ({
          key: `${String(c.mx)},${String(c.my)},${String(c.land)}`,
          index: c.land,
          x: c.mx * CHUNK_TILES + CHUNK_TILES / 2,
          z: c.my * CHUNK_TILES + CHUNK_TILES / 2,
          mesh,
          materials: materialsFor(mesh, sheet, cache),
        }))
        setPlaced(next)
      })
      .catch(() => { if (alive) setPlaced([]) })
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
            materials: materialsFor(got.mesh, got.sheet, cache),
          }]
        }))
      })
      .catch(() => { if (alive) setProps([]) })
    return () => { alive = false }
  }, [grid, chunkIndex, radius])

  return (
    <group>
      {placed.map((p) => (
        <mesh
          key={p.key}
          position={[p.x, 0, p.z]}
          geometry={p.mesh.geometry}
          material={p.materials}
        />
      ))}
      {/*
        회전·크기는 배치 기록이 준다. 오버월드 468곳은 실측으로 전부 회전 0 ·
        크기 1이라 단위를 확인할 자리가 없다 — 0이 아닌 값이 나오는 실내·던전을
        붙일 때 라디안인지 다시 봐야 한다
      */}
      {props.map((p) => (
        <mesh
          key={p.key}
          position={[p.x, p.y, p.z]}
          rotation={p.rot}
          scale={p.scale}
          geometry={p.mesh.geometry}
          material={p.materials}
        />
      ))}
    </group>
  )
}
