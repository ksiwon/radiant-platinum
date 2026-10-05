// 던전 판 가장자리 너머의 바닥 — 안개색 원판 하나
//
// 하늘이 트인 던전(`openAir` · 호수 · 창기둥 …)은 원작 3인칭 부감용 판때기 하나다. 가장자리 너머에 땅 자료가 없어서, 높은 카메라로
// 내려다보면 판이 하늘 돔 위에 뜬 널판으로 찍혔다(트레일러 D1 · E2). 바깥 지역(`BdspField`의 `FogFloor`)은 안개색 원판이 그 너머를
// 받치는데 던전에는 그것이 없었다. 같은 원판을 던전의 가장 낮은 땅 밑에 깐다 — 안개 끝 밖은 지평선과 같은 색이라 하늘로 녹는다.
// BDSP에는 이 판 너머의 땅이 따로 없다(던전 glb가 판 하나다) — 자료가 생기면 이 원판 대신 그것을 세운다.
import { useEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CircleGeometry, Fog, Mesh, MeshBasicMaterial, type Material } from 'three'
import { worldState } from '../state/worldState'

/** 원판을 가장 낮은 땅보다 이만큼 내린다 (칸) — `BdspField`의 `FOG_FLOOR_DROP`과 같다 */
const DROP = 0.3
/** 원판 반지름 (칸) — 안개 끝(낮 130칸)을 넉넉히 넘는다 */
const RADIUS = 600

/** 지금 선 던전의 가장 낮은 땅 높이. 없으면 `null` — `BdspDungeon`이 세울 때 적고 뗄 때 지운다 */
let dungeonLow: number | null = null
export function setDungeonLow(y: number | null): void { dungeonLow = y }

/** 던전의 가장 낮은 땅 밑 원판 높이 — 땅을 못 쟀으면 `null` (원판을 안 그린다) */
export function outerFloorY(low: number | null): number | null {
  return low === null ? null : low - DROP
}

export function OuterFloor() {
  const scene = useThree((s) => s.scene)
  const [mesh] = useState(() => {
    const m = new Mesh(
      new CircleGeometry(RADIUS, 64).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ fog: true }),
    )
    m.name = 'outerFloor'
    m.castShadow = false
    m.receiveShadow = false
    m.frustumCulled = false
    m.visible = false
    return m
  })
  useEffect(() => () => {
    mesh.geometry.dispose()
    ;(mesh.material as Material).dispose()
  }, [mesh])
  useFrame(() => {
    const y = outerFloorY(dungeonLow)
    mesh.visible = y !== null
    if (y === null) return
    const fog = scene.fog
    if (fog instanceof Fog) (mesh.material as MeshBasicMaterial).color.copy(fog.color)
    const p = worldState.player.position
    mesh.position.set(p.x, y, p.z)
  })
  return <primitive object={mesh} />
}
