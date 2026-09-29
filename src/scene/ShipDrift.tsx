// 필드의 배 소품 — 배로 건너가기가 밀 때 따라 옮긴다 (`scene/boatCutscene` · `BoatCutscene_MoveBoatToGoal`)
//
// 배 소품(운하 34 · 선단 538)만 이것으로 감싼다. 놓인 자리를 올려 두고(`shipProps`), 그 소품이 밀리는 동안은 틱마다
// 밀린 만큼을 더한다. 안 밀리면 놓인 자리 그대로다
import { useEffect, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Euler, Group } from 'three'
import { shipOffset, shipProps } from './boatCutscene'

export function ShipDrift({ id, model, at, rotation, scale, children }: {
  id: string, model: number, at: readonly [number, number, number],
  rotation?: Euler | [number, number, number], scale?: number | [number, number, number], children: ReactNode,
}) {
  const ref = useRef<Group>(null)
  useEffect(() => {
    shipProps.set(id, { model, x: at[0], z: at[2] })
    return () => { shipProps.delete(id) }
  }, [id, model, at])
  useFrame(() => {
    const g = ref.current
    if (!g) return
    const off = shipOffset(id)
    g.position.set(at[0] + (off?.[0] ?? 0), at[1], at[2] + (off?.[1] ?? 0))
  })
  return <group ref={ref} position={[at[0], at[1], at[2]]} rotation={rotation} scale={scale}>{children}</group>
}
