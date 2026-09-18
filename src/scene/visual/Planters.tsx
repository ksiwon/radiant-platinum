// 입체 사각 화분 (FIRST_PERSON §6.1 · FP-02)
//
// `Rocks`와 같은 길로 그린다 — 무리마다 인스턴싱 하나, 매 프레임 절두체로 추린다.
// 무리 열쇠는 **레시피 · 그림 칸 지문 · 폭**이다: 같은 화분 그림이면 청크를 넘어
// 한 덩어리로 모인다.
//
// 자리·폭·색은 원본 판과 그림 칸에서 온다. 형상의 깊이·비율은 §6.1 시제품 값이다.
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  Frustum, InstancedMesh, Matrix4, MeshLambertMaterial, Quaternion, Sphere, Vector3,
  type BufferGeometry,
} from 'three'
import { setInstances } from '../instances'
import { paintedBollard, paintedFence, paintedPlanter, paintedShrub } from './planter'
import type { BollardSwatch, FenceSwatch, PlanterSwatch, ShrubSwatch } from './swatches'

/** 화분 하나의 자리 — 밑면 한가운데와 판의 가로축 방향 */
export interface PlanterSite {
  x: number
  y: number
  z: number
  /** 원본 판의 경첩(가로축)이 +x에서 돈 각 (라디안). 네모가 판과 나란히 선다 */
  yaw: number
}

/** 무리 하나 — 무엇을 세우는지와 그 색 */
export type PlanterGroup = {
  key: string
  width: number
  items: [PlanterSite, number, number][]
} & (
  | { kind: 'planter', swatch: PlanterSwatch }
  | { kind: 'shrub', swatch: ShrubSwatch }
  /** `u0`·`u1` — 토막 양 끝의 칸 텍셀 u (`fenceGeometry`) */
  | { kind: 'fence', swatch: FenceSwatch, u0: number, u1: number }
  /** 볼라드 — 사슬 갈래와 풀 갈래 (FP-05) */
  | { kind: 'bollard', variant: 'chain' | 'grass', swatch: BollardSwatch, u0: number, u1: number }
)

/** 절두체 여유 (타일) */
const CULL_MARGIN = 0.5

/**
 * 모양 보관함 — 열쇠가 같으면 같은 모양이다. 배치마다 새로 안 만든다.
 * ⚠️ **공유 자원이라 인스턴스가 내려갈 때 안 버린다** (§4.4)
 */
const shapes = new Map<string, BufferGeometry>()
const material = new MeshLambertMaterial({ name: '화분', vertexColors: true })

const viewProj = new Matrix4()
const frustum = new Frustum()
const sphere = new Sphere()
const Y = new Vector3(0, 1, 0)

export function Planters({ groups }: { groups: PlanterGroup[] }) {
  const camera = useThree((s) => s.camera)

  const meshes = useMemo(() => groups.map((g) => {
    let shape = shapes.get(g.key)
    if (!shape) {
      shape = g.kind === 'planter' ? paintedPlanter(g.width, g.swatch)
        : g.kind === 'shrub' ? paintedShrub(g.width, g.swatch)
          : g.kind === 'bollard' ? paintedBollard(g.width, g.u0, g.u1, g.variant, g.swatch)
            : paintedFence(g.width, g.u0, g.u1, g.swatch)
      shape.clearGroups()
      shapes.set(g.key, shape)
    }
    const matrices = g.items.map(([site, originX, originZ]) => new Matrix4().compose(
      new Vector3(site.x + originX, site.y, site.z + originZ),
      new Quaternion().setFromAxisAngle(Y, -site.yaw),
      new Vector3(1, 1, 1)))
    const mesh = new InstancedMesh(shape, material, Math.max(1, matrices.length))
    mesh.name = '화분'
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    setInstances(mesh, 0)
    const spots = matrices.map((m) => new Vector3().setFromMatrixPosition(m))
    return { key: g.key, mesh, matrices, spots, radius: g.width }
  }), [groups])

  useFrame(() => {
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProj)
    for (const g of meshes) {
      let n = 0
      for (let i = 0; i < g.spots.length; i++) {
        sphere.set(g.spots[i]!, g.radius + CULL_MARGIN)
        if (!frustum.intersectsSphere(sphere)) continue
        g.mesh.setMatrixAt(n++, g.matrices[i]!)
      }
      setInstances(g.mesh, n)
    }
  })

  // 인스턴스 버퍼만 버린다 — 모양·재질은 보관함의 것이다
  useEffect(() => () => {
    for (const g of meshes) g.mesh.dispose()
  }, [meshes])

  return (
    <group>
      {meshes.map(({ key, mesh }) => <primitive key={key} object={mesh} />)}
    </group>
  )
}
