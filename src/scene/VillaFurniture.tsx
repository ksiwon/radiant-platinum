// 별장의 가구 (`overlay005/villa_furniture.c` · `engine/world/villa`)
//
// 산 가구만 소품으로 선다 — 자리 스물셋에 가구 스물(화분이 넷)이다. 모델은 맵 소품 표의 `villa_furniture_*`
// (559~578)이고, 자리는 원작 좌표 그대로다(`MAP_OBJECT_COORD_CENTER_TO_FX32` · `…EDGE…`). 원작은 맵 원점을 안 더하고
// 절대 좌표로 놓는데, 별장은 제 행렬이 하나뿐이라 맵 칸이 곧 월드 칸이다.
//
// 산 것은 깃발이다(`FLAG_VILLA_FURNITURE_*`). 가구를 사는 스크립트가 깃발을 세우면 다음 프레임에 선다.
import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Material } from 'three'
import { loadPropMesh, loadPropSheet, type ChunkMesh, type TexSheet } from './chunkMesh'
import { materialsFor } from './ChunkModels'
import { world as mapWorld } from '../engine/map/world'
import { fieldScripts } from '../engine/script/field'
import { MAP_FEATURE, mapFeature } from '../engine/world/mapFeatures'
import { FLAG_VILLA_FURNITURE_START, VILLA_FURNITURE_COUNT, VILLA_FURNITURE_MODEL_START, VILLA_SLOTS } from '../engine/world/villa'

/** 그려진 가구 조각 — 자리 번호 (진단이 읽는다) */
const drawn = new Set<number>()

/** 지금 그려진 가구 조각의 수 — 화분은 자리마다 센다 */
export function villaFurnitureDrawn(): number {
  return drawn.size
}

/** 지금 선 가구 — 깃발이 바뀌었는지 가르는 열쇠 */
function ownedKey(): string {
  // 맵 스크립트가 `InitPersistedMapFeaturesForVilla`로 갈래를 세워야 선다 — 원작도 그 자리에서 모델을 싣는다
  if (mapFeature() !== MAP_FEATURE.villa) return ''
  const vars = fieldScripts.vars
  let key = ''
  for (let t = 0; t < VILLA_FURNITURE_COUNT; t++) key += vars.checkFlag(FLAG_VILLA_FURNITURE_START + t) ? '1' : '0'
  return key
}

function Piece({ slot, model, x, z }: { slot: number, model: number, x: number, z: number }) {
  const [loaded, setLoaded] = useState<{ mesh: ChunkMesh, sheet: TexSheet | null } | null>(null)
  useEffect(() => {
    let alive = true
    void Promise.all([loadPropMesh(model), loadPropSheet(model)])
      .then(([mesh, sheet]) => { if (alive) setLoaded({ mesh, sheet }) })
      .catch(() => { /* 그 가구만 안 선다 */ })
    return () => { alive = false }
  }, [model])
  const materials = useMemo<Material[] | null>(() => {
    if (loaded === null) return null
    return materialsFor(loaded.mesh, loaded.sheet, new Map<string, Material>(), loaded.mesh.materials.map(() => true))
  }, [loaded])
  useEffect(() => () => { for (const m of materials ?? []) m.dispose() }, [materials])
  useEffect(() => {
    if (materials === null) return
    drawn.add(slot)
    return () => { drawn.delete(slot) }
  }, [materials, slot])
  if (loaded === null || materials === null) return null
  // 원작은 높이 0에 놓는다 — 별장 바닥이 그 높이다. 격자가 답하면 그 높이를 쓴다
  const y = mapWorld.grid?.heightAtWorld(x, z) ?? 0
  return <mesh position={[x, y, z]} geometry={loaded.mesh.geometry} material={materials} castShadow receiveShadow />
}

export function VillaFurniture() {
  const [owned, setOwned] = useState('')
  useFrame(() => {
    const now = ownedKey()
    if (now !== owned) setOwned(now)
  })
  if (owned === '') return null
  return (
    <group name="별장 가구">
      {VILLA_SLOTS.map((slot, i) => (owned[slot.type] === '1'
        ? <Piece key={i} slot={i} model={VILLA_FURNITURE_MODEL_START + slot.type} x={slot.x} z={slot.z} />
        : null))}
    </group>
  )
}
