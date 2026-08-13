// 깨어진 세계의 소품 (PARITY §6.10)
//
// 이 세계의 「블록」은 지형이 아니라 소품이다. 걷는 판정은 `tw_arc_attr`가
// 주지만, **눈에 보이는 발판·바위·덩굴은 여기서 선다.**
//
// ⚠️ **이게 없으면 허공을 걷는다.** 밟으면 나타나야 할 발판이 `hiddenGroups`
// 상태로만 켜지고 화면에는 아무 일도 안 일어나서, 어디로 가야 하는지 알 수가
// 없었다. 모델은 지어낸 것이 아니라 원작 NSBMD 스물다섯 개다
// (`tools/extract/distortionProps.js`).
//
// ⚠️ **무리를 켜고 끄는 것은 `visible`로만 한다.** 뺐다 넣으면 소품이
// 나타날 때마다 GLB를 다시 세우게 되고, 무리 하나가 수십 개다
import { useEffect, useMemo, useRef, useState } from 'react'
import { DoubleSide, FrontSide, Group, MeshBasicMaterial, type Material } from 'three'
import type { DistortionMap } from '../data/schema'
import { MAX_GHOST_PROP_GROUPS } from '../engine/world/distortion'
import { distortionFloor, isDistortionFloor } from './distortion'
import { useSaveStore } from '../state/saveStore'
import {
  loadDistortionPropMesh, loadDistortionPropSheet, sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'

interface Loaded {
  kind: number
  mesh: ChunkMesh
  materials: Material[]
}

function materialsOf(mesh: ChunkMesh, sheet: TexSheet | null): Material[] {
  const cache = new Map<string, Material>()
  return mesh.materials.map((spec) => {
    const key = `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}`
    const hit = cache.get(key)
    if (hit) return hit
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    const translucent = spec.a < 31
    const made = new MeshBasicMaterial({
      map: item && sheet ? sliceTexture(sheet, item, spec.rep) : null,
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

export function DistortionProps({ mapId }: { mapId: number }) {
  const hiddenGroups = useSaveStore((s) => s.distortion.hiddenGroups)
  // 층이 실제로 걸린 뒤에야 자료가 온다. 처음 들어설 때 `valid`가 서므로
  // 그때 한 번 더 본다 — 안 그러면 첫 층만 소품이 안 뜬다
  const valid = useSaveStore((s) => s.distortion.valid)
  const [floor, setFloor] = useState<DistortionMap | null>(null)
  useEffect(() => {
    setFloor(isDistortionFloor(mapId) ? distortionFloor() : null)
    // ⚠️ `valid`도 본다. 자료를 아직 안 받았을 때 처음 들어서면 층이 나중에
    // 걸리는데, 그때 서는 표가 이것뿐이다 — 빼면 첫 층만 소품이 안 뜬다
  }, [mapId, valid])
  const groupRef = useRef<Group>(null)
  const [loaded, setLoaded] = useState<readonly Loaded[]>([])

  /** 이 층이 쓰는 소품 종류만 받는다. 스물다섯을 다 받을 이유가 없다 */
  const kinds = useMemo(() => {
    if (floor === null) return []
    return [...new Set(floor.props.map((p) => p.kind))].sort((a, b) => a - b)
  }, [floor])

  useEffect(() => {
    let alive = true
    if (kinds.length === 0) {
      setLoaded([])
      return
    }
    void Promise.all(
      kinds.map((kind) =>
        Promise.all([loadDistortionPropMesh(kind), loadDistortionPropSheet(kind)])
          .then(([mesh, sheet]): Loaded => ({ kind, mesh, materials: materialsOf(mesh, sheet) }))
          .catch(() => null),
      ),
    )
      .then((got) => {
        if (alive) setLoaded(got.filter((v): v is Loaded => v !== null))
      })
      .catch(() => {
        if (alive) setLoaded([])
      })
    return () => {
      alive = false
    }
  }, [kinds])

  const byKind = useMemo(() => new Map(loaded.map((l) => [l.kind, l])), [loaded])

  if (floor === null) return null
  return (
    <group ref={groupRef}>
      {floor.props.map((prop, i) => {
        const got = byKind.get(prop.kind)
        if (got === undefined) return null
        // ⚠️ 무리 번호가 24 이상이면 표에 자리가 없다. 원작이 그런 것을 안 만들지만,
        // 만들었다면 늘 보이는 것으로 친다 — 비트가 없으니 끌 수가 없다
        const shown = prop.group >= MAX_GHOST_PROP_GROUPS
          || (hiddenGroups & (1 << prop.group)) === 0
        return (
          <mesh
            key={i}
            visible={shown}
            geometry={got.mesh.geometry}
            material={got.materials}
            position={[
              prop.x - floor.offsetX + 0.5,
              prop.y - floor.offsetY,
              prop.z - floor.offsetZ + 0.5,
            ]}
          />
        )
      })}
    </group>
  )
}
