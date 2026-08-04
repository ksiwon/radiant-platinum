// 존 블록아웃 렌더러 (PLAN §4.2)
//
// DS 원본 지오메트리는 웹 품질에 못 미치므로 아트는 자체 제작한다. 여기서는 롬에서 뽑은
// 충돌·거동·배치를 그대로 세워 **레이아웃 정본**을 눈으로 확인하고 그 위를 걸을 수 있게 한다.
// 타일 수천 개를 개별 메시로 두면 드로우콜이 터지므로 종류별 InstancedMesh 하나씩만 쓴다.
import { useEffect, useMemo, useRef } from 'react'
import { Color, InstancedMesh, Object3D } from 'three'
import { activeZone, Behavior, IMPASSABLE, ZoneGrid, type ZoneData } from '../engine/map/zone'
import { worldState } from '../state/worldState'

const WALL_HEIGHT = 1.2
const dummy = new Object3D()

interface Props {
  zone: ZoneData
}

/** 타일 종류별 색. 아직 의미를 특정하지 못한 거동은 값으로 색을 만들어 구분만 시킨다 */
function tileColor(behavior: number): Color {
  if (behavior === Behavior.NORMAL) return new Color('#6f7a52')
  if (behavior === Behavior.TALL_GRASS) return new Color('#3f7d3a')
  // 안정적인 해시 → 같은 거동은 항상 같은 색
  const h = ((behavior * 2654435761) % 360) / 360
  return new Color().setHSL(h, 0.35, 0.45)
}

export function ZoneBlockout({ zone }: Props) {
  const grid = useMemo(() => new ZoneGrid(zone), [zone])
  const floorRef = useRef<InstancedMesh>(null)
  const wallRef = useRef<InstancedMesh>(null)
  const buildingRef = useRef<InstancedMesh>(null)

  const { floors, walls, buildings } = useMemo(() => {
    const floors: { x: number; z: number; color: Color }[] = []
    const walls: { x: number; z: number }[] = []
    for (let z = 0; z < grid.depth; z++) {
      for (let x = 0; x < grid.width; x++) {
        const t = grid.tileAt(x, z)
        if (t & IMPASSABLE) walls.push({ x, z })
        else floors.push({ x, z, color: tileColor(t) })
      }
    }
    const buildings = zone.chunks.flatMap((c) =>
      c.buildings.map((b) => ({ ...b, x: b.x + c.origin.x, z: b.z + c.origin.z })),
    )
    return { floors, walls, buildings }
  }, [grid, zone])

  // 존을 이동 시스템에 등록하고 스폰 위치를 잡는다
  useEffect(() => {
    activeZone.grid = grid
    const spawn = grid.findSpawn()
    worldState.player.position.set(spawn.x, 0, spawn.z)
    worldState.player.prevPosition.copy(worldState.player.position)
    worldState.player.velocity.set(0, 0, 0)
    return () => { activeZone.grid = null }
  }, [grid])

  useEffect(() => {
    const f = floorRef.current
    if (f) {
      floors.forEach((t, i) => {
        dummy.position.set(t.x + 0.5, 0, t.z + 0.5)
        dummy.updateMatrix()
        f.setMatrixAt(i, dummy.matrix)
        f.setColorAt(i, t.color)
      })
      f.instanceMatrix.needsUpdate = true
      if (f.instanceColor) f.instanceColor.needsUpdate = true
    }
    const w = wallRef.current
    if (w) {
      walls.forEach((t, i) => {
        dummy.position.set(t.x + 0.5, WALL_HEIGHT / 2, t.z + 0.5)
        dummy.updateMatrix()
        w.setMatrixAt(i, dummy.matrix)
      })
      w.instanceMatrix.needsUpdate = true
    }
    const b = buildingRef.current
    if (b) {
      buildings.forEach((o, i) => {
        dummy.position.set(o.x, o.y + 1, o.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        b.setMatrixAt(i, dummy.matrix)
      })
      b.instanceMatrix.needsUpdate = true
    }
  }, [floors, walls, buildings])

  return (
    <group>
      <ambientLight intensity={0.7} />
      <directionalLight position={[20, 40, 15]} intensity={1.5} />

      <instancedMesh ref={floorRef} args={[undefined, undefined, floors.length]}>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>

      <instancedMesh ref={wallRef} args={[undefined, undefined, walls.length]}>
        <boxGeometry args={[1, WALL_HEIGHT, 1]} />
        <meshStandardMaterial color="#4a5163" roughness={0.9} />
      </instancedMesh>

      <instancedMesh ref={buildingRef} args={[undefined, undefined, Math.max(1, buildings.length)]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#b07a4a" roughness={0.85} />
      </instancedMesh>
    </group>
  )
}
