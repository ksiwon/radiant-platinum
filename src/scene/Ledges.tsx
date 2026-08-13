import { useEffect, useMemo, useRef } from 'react'
import { InstancedMesh, Object3D } from 'three'
import type { MapGrid } from '../engine/map/grid'
import { worldState } from '../state/worldState'
import { ledgeFacing } from './ledgeVisual'

interface LedgeInstance {
  x: number
  y: number
  z: number
  dx: number
  dz: number
  yaw: number
}

const LIP_HEIGHT = 0.18

function collect(grid: MapGrid, center: number, radius: number): LedgeInstance[] {
  const out: LedgeInstance[] = []
  const n = grid.chunkTiles
  const near = worldState.player.position.y
  for (const chunk of grid.chunksAround(center, radius)) {
    const x0 = chunk.mx * n
    const z0 = chunk.my * n
    for (let z = z0; z < z0 + n; z++) {
      for (let x = x0; x < x0 + n; x++) {
        const facing = ledgeFacing(grid.behavior(x, z))
        if (!facing) continue
        out.push({
          x: x + 0.5,
          y: grid.heightAtWorld(x + 0.5, z + 0.5, near) ?? 0,
          z: z + 0.5,
          ...facing,
        })
      }
    }
  }
  return out
}

/** 평면 텍스처였던 720개 턱에 높이·앞면·그림자를 주는 절차적 3D 덧면. */
export function Ledges(
  { grid, chunkIndex, radius }: { grid: MapGrid; chunkIndex: number; radius: number },
) {
  const top = useRef<InstancedMesh>(null)
  const face = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const ledges = useMemo(
    () => collect(grid, chunkIndex, radius),
    [grid, chunkIndex, radius],
  )

  useEffect(() => {
    const tops = top.current
    const faces = face.current
    if (!tops || !faces) return
    tops.count = ledges.length
    faces.count = ledges.length
    ledges.forEach((ledge, i) => {
      dummy.position.set(ledge.x, ledge.y + LIP_HEIGHT / 2, ledge.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      tops.setMatrixAt(i, dummy.matrix)

      dummy.position.set(
        ledge.x + ledge.dx * 0.43,
        ledge.y + LIP_HEIGHT / 2,
        ledge.z + ledge.dz * 0.43,
      )
      dummy.rotation.set(0, ledge.yaw, 0)
      dummy.updateMatrix()
      faces.setMatrixAt(i, dummy.matrix)
    })
    tops.instanceMatrix.needsUpdate = true
    faces.instanceMatrix.needsUpdate = true
  }, [dummy, ledges])

  const capacity = Math.max(1, ledges.length)
  return (
    <group>
      <instancedMesh ref={top} args={[undefined, undefined, capacity]} castShadow receiveShadow>
        <boxGeometry args={[0.96, LIP_HEIGHT, 0.96]} />
        <meshStandardMaterial color="#7c5b36" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={face} args={[undefined, undefined, capacity]} castShadow receiveShadow>
        <boxGeometry args={[0.9, LIP_HEIGHT + 0.08, 0.12]} />
        <meshStandardMaterial color="#4d3825" roughness={0.98} />
      </instancedMesh>
    </group>
  )
}
