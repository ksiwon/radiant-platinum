// 깨어진 세계의 소품 (PARITY §6.10)
//
// 이 세계의 「블록」은 지형이 아니라 소품이다. 걷는 판정은 `tw_arc_attr`와 맵
// 격자가 주지만, **눈에 보이는 발판·바위·덩굴·승강판은 여기서 선다.**
//
// ⚠️ **세 갈래를 다 세워야 한다.** 원작은 관리자를 셋으로 나눠 든다 —
// 밟으면 나타나는 유령 소품, 층을 오르내리는 승강 발판, 늘 서 있는 문·폭포·
// 덩굴이다. 한동안 첫째만 그렸는데, 그러면 **타야 할 승강 발판이 통째로
// 안 보인다** — 1F에서 아래로 내려가는 그 판이 그것이다.
//
// ⚠️ **자리 보정을 빼먹으면 한 칸 위에 뜬다.** 원작이 칸 한가운데(+0.5)에
// `sPropInitialPosOffsetByKind`를 더해 세운다. 작은 발판은 y가 −1.5625라,
// 모델 윗면(제 원점에서 +1)이 「선 높이 − 1/16」에 정확히 온다.
//
// ⚠️ **보임새는 프레임마다 본다.** 유령 소품은 무리 비트, 승강 발판은 자리
// 비트, 늘 서 있는 것은 진행도 조건을 본다 — 마지막 하나가 스토어에 없어서
// (스크립트 변수다) React 구독으로는 늦는다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, FrontSide, Mesh, MeshBasicMaterial, type Material } from 'three'
import {
  distortionFloor, distortionPropPlaces, distortionPropShown, distortionRideAt, isDistortionFloor,
  type DistortionPropPlace,
} from './distortion'
import { useSaveStore } from '../state/saveStore'
import {
  loadDistortionPropMesh, loadDistortionPropOffsets, loadDistortionPropSheet, sliceTexture,
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
  // 층이 실제로 걸린 뒤에야 자료가 온다. 처음 들어설 때 `valid`가 서므로
  // 그때 한 번 더 본다 — 안 그러면 첫 층만 소품이 안 뜬다
  const valid = useSaveStore((s) => s.distortion.valid)
  const [places, setPlaces] = useState<readonly DistortionPropPlace[]>([])
  useEffect(() => {
    setPlaces(isDistortionFloor(mapId) && distortionFloor() !== null
      ? distortionPropPlaces(mapId)
      : [])
    // ⚠️ `valid`도 본다. 자료를 아직 안 받았을 때 처음 들어서면 층이 나중에
    // 걸리는데, 그때 서는 표가 이것뿐이다 — 빼면 첫 층만 소품이 안 뜬다
  }, [mapId, valid])

  const [loaded, setLoaded] = useState<readonly Loaded[]>([])
  const [offsets, setOffsets] = useState<readonly (readonly number[])[]>([])

  /** 이 층이 쓰는 소품 종류만 받는다. 스물다섯을 다 받을 이유가 없다 */
  const kinds = useMemo(
    () => [...new Set(places.map((p) => p.kind))].sort((a, b) => a - b),
    [places],
  )

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
          .then(([mesh, sheet]): Loaded => ({ kind, mesh, materials: materialsOf(mesh, sheet) }))
          .catch(() => null))),
    ])
      .then(([off, got]) => {
        if (!alive) return
        setOffsets(off)
        setLoaded(got.filter((v): v is Loaded => v !== null))
      })
      .catch(() => {
        if (alive) setLoaded([])
      })
    return () => {
      alive = false
    }
  }, [kinds])

  const byKind = useMemo(() => new Map(loaded.map((l) => [l.kind, l])), [loaded])
  const meshes = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    const ride = distortionRideAt()
    for (const [i, place] of places.entries()) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      mesh.visible = distortionPropShown(place)
      if (ride === null || place.elevator !== ride.index) continue
      // 타고 가는 동안 발판은 주인공 발밑에 붙어 같이 움직인다
      const off = offsets[place.kind] ?? [0, 0, 0]
      mesh.position.set(
        ride.x + 0.5 + off[0]!, ride.y + 0.5 + off[1]!, ride.z + 0.5 + off[2]!)
    }
  })

  if (places.length === 0) return null
  return (
    <group>
      {places.map((place, i) => {
        const got = byKind.get(place.kind)
        if (got === undefined) return null
        const off = offsets[place.kind] ?? [0, 0, 0]
        return (
          <mesh
            key={i}
            ref={(m) => { meshes.current[i] = m }}
            visible={false}
            geometry={got.mesh.geometry}
            material={got.materials}
            position={[
              place.x + 0.5 + off[0]!,
              place.y + 0.5 + off[1]!,
              place.z + 0.5 + off[2]!,
            ]}
          />
        )
      })}
    </group>
  )
}
