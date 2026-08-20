// 소품 메시를 받아 세우는 두 자리가 함께 쓰는 것 (PARITY §1.27 · §6.10)
//
// `DistortionProps`(깨어진 세계의 발판·바위·덩굴)와 `ObjectProps`(간판·눈덩이·
// 책·사천왕 방문·로토무 방 벽)는 **같은 소품 파일**을 읽는다 —
// `data/distortionProps/<갈래>.bin`이다. 받는 일도 재질을 만드는 일도 같은데
// 두 벌로 갈라져 있었고, 그래서 한쪽만 고쳐진 자리가 생겼다:
//
// ⚠️ **텍스처 없는 재질의 확산색을 `ObjectProps`가 빠뜨리고 있었다.** 갈래 38
// (로토무 방 벽, 그림 262)의 재질 둘 중 하나가 텍스처 없이 확산색 (99,99,99)만
// 드는데, 그것을 안 곱하면 정점색 흰색이 그대로 나가 **회색 벽이 하얗게 뜬다**
// (DATA.md §2.2 — 맵 청크와 건물 소품에서 고친 것과 같은 자리다).
import { useEffect, useMemo, useState } from 'react'
import { DoubleSide, FrontSide, MeshBasicMaterial, type Material } from 'three'
import {
  loadDistortionPropMesh, loadDistortionPropOffsets, loadDistortionPropSheet, sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'

/** 받아 놓은 소품 한 갈래 */
export interface LoadedProp {
  kind: number
  mesh: ChunkMesh
  materials: Material[]
}

/**
 * 소품 하나의 재질들. 같은 명세는 한 재질로 모은다.
 *
 * ⚠️ **열쇠에 확산색이 들어간다.** 그림·팔레트가 똑같이 없고 알파·면만 같은
 * 두 재질이 색만 다를 수 있어서, 확산색을 빼면 둘이 한 재질로 뭉쳐 뒤엣것이
 * 앞엣것의 색으로 그려진다
 */
export function propMaterials(mesh: ChunkMesh, sheet: TexSheet | null): Material[] {
  const cache = new Map<string, Material>()
  return mesh.materials.map((spec) => {
    const key = `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}`
      + `/${(spec.d ?? []).join(',')}`
    const hit = cache.get(key)
    if (hit) return hit
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    const translucent = spec.a < 31
    const made = new MeshBasicMaterial({
      map: item && sheet ? sliceTexture(sheet, item, spec.rep) : null,
      // ⚠️ **텍스처가 없는 재질은 확산색이 유일한 색이다.** 정점색이 흰색
      // 하나뿐이라 이걸 안 곱하면 새까만 기라티나 그림자가 하얗게 뜬다
      ...(spec.d ? { color: (spec.d[0] << 16) | (spec.d[1] << 8) | spec.d[2] } : {}),
      vertexColors: true,
      // 4세대 텍스처는 색 0을 투명으로 쓴다
      alphaTest: translucent ? 0 : 0.5,
      transparent: translucent,
      opacity: translucent ? spec.a / 31 : 1,
      depthWrite: !translucent,
      side: spec.f === 3 ? DoubleSide : FrontSide,
    })
    cache.set(key, made)
    return made
  })
}

/**
 * 그 갈래들의 메시·재질과 자리 보정을 받는다.
 *
 * ⚠️ **쓰는 갈래만 받는다.** 스물다섯을 다 받을 이유가 없다 — 부르는 쪽이
 * 그 화면에 실제로 서는 갈래만 추려서 넘긴다.
 *
 * 하나가 없어도 나머지는 선다 (`.catch(() => null)`). 소품 하나를 못 받았다고
 * 층 전체가 비면 걸어 다닐 길이 안 보인다
 */
export function useLoadedProps(kinds: readonly number[]): {
  byKind: ReadonlyMap<number, LoadedProp>
  offsets: readonly (readonly number[])[]
} {
  const [loaded, setLoaded] = useState<readonly LoadedProp[]>([])
  const [offsets, setOffsets] = useState<readonly (readonly number[])[]>([])

  useEffect(() => {
    let alive = true
    if (kinds.length === 0) {
      setLoaded([])
      return
    }
    void Promise.all([
      loadDistortionPropOffsets(),
      Promise.all(kinds.map((kind) =>
        Promise.all([loadDistortionPropMesh(kind), loadDistortionPropSheet(kind)])
          .then(([mesh, sheet]): LoadedProp => ({
            kind, mesh, materials: propMaterials(mesh, sheet),
          }))
          .catch(() => null))),
    ])
      .then(([off, got]) => {
        if (!alive) return
        setOffsets(off)
        setLoaded(got.filter((v): v is LoadedProp => v !== null))
      })
      .catch(() => {
        if (alive) setLoaded([])
      })
    return () => {
      alive = false
    }
  }, [kinds])

  const byKind = useMemo(() => new Map(loaded.map((l) => [l.kind, l])), [loaded])
  return { byKind, offsets }
}
