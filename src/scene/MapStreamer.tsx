// 맵 렌더 스트리머 + 워프 전이 (DATA.md §4.1)
//
// 충돌은 행렬 격자를 통째로 들고 있지만 렌더링은 그럴 수 없다 — 오버월드 92만 타일을
// 다 세우면 인스턴스 버퍼만 수백 MB다. 플레이어 주변 청크만 세우고 청크를 넘을 때
// 다시 채운다.
//
// setState는 청크를 넘거나 맵이 바뀌는 순간에만 부른다. 프레임마다 부르면 R3F
// 프로젝트가 죽는다(PLAN §3.2). 인스턴스 개수는 최대치로 한 번 잡고 mesh.count만
// 바꾼다 — args를 바꾸면 InstancedMesh가 통째로 다시 만들어진다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, InstancedMesh, Object3D } from 'three'
import { activeZone, Behavior, IMPASSABLE, isWater } from '../engine/map/zone'
import { MapGrid } from '../engine/map/grid'
import { mapById, npcsOf, world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { useSessionStore } from '../state/sessionStore'
import { encounters, resetEncounterTile } from '../engine/battle/encounterSystem'
import { gridFor } from './worldData'

/** 렌더 창 반경(청크). 2면 5×5청크 = 160×160타일 — far 200 안에 들어온다 */
const VIEW_RADIUS = 2
const WALL_HEIGHT = 1.2
const dummy = new Object3D()

function tileColor(behavior: number): Color {
  if (behavior === Behavior.NORMAL) return new Color('#6f7a52')
  if (behavior === Behavior.TALL_GRASS) return new Color('#3f7d3a')
  if (isWater(behavior)) return new Color('#2f5f8f')
  const h = ((behavior * 2654435761) % 360) / 360
  return new Color().setHSL(h, 0.35, 0.45)
}

interface Cell { x: number; z: number; color?: Color }

/** 창 안의 타일을 바닥/벽으로 나눈다. 벽은 걸을 수 있는 칸에 접한 것만 세운다 */
function buildWindow(grid: MapGrid, chunkIndex: number) {
  const floors: Cell[] = []
  const walls: Cell[] = []
  const buildings = []
  const n = grid.chunkTiles
  for (const c of grid.chunksAround(chunkIndex, VIEW_RADIUS)) {
    const ox = c.mx * n, oz = c.my * n
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const x = ox + tx, z = oz + ty
        const t = grid.tileAt(x, z)
        if (!(t & IMPASSABLE)) { floors.push({ x, z, color: tileColor(t) }); continue }
        // 벽 속을 채워봐야 보이지 않는다 — 걸을 수 있는 칸에 접한 껍질만 세운다
        if (
          !grid.isBlocked(x - 1, z) || !grid.isBlocked(x + 1, z) ||
          !grid.isBlocked(x, z - 1) || !grid.isBlocked(x, z + 1)
        ) walls.push({ x, z })
      }
    }
    const bs = grid.meta.buildings[String(c.i)]
    if (bs) buildings.push(...bs)
  }
  return { floors, walls, buildings }
}

interface Props {
  initial: MapGrid
  spawn: { x: number; z: number; map: number }
  /** 종족 번호로 색인된 이름 */
  speciesNames: string[]
  /** 지역명. 맵 헤더의 label로 색인한다 */
  locationNames: string[]
}

export function MapStreamer({ initial, spawn, speciesNames, locationNames }: Props) {
  const setZone = useSessionStore((s) => s.setZoneName)
  const setEncounter = useSessionStore((s) => s.setEncounter)
  const [grid, setGrid] = useState(initial)
  const [chunkIndex, setChunkIndex] = useState(() =>
    initial.chunkIndexAt(Math.floor(spawn.x), Math.floor(spawn.z)))

  const floorRef = useRef<InstancedMesh>(null)
  const wallRef = useRef<InstancedMesh>(null)
  const buildingRef = useRef<InstancedMesh>(null)
  const npcRef = useRef<InstancedMesh>(null)
  const [mapId, setMapId] = useState(spawn.map)

  // 오버월드 창이 가장 크다. 실내로 바뀌어도 이 용량 안에 들어온다
  const capacity = useMemo(
    () => ({ tiles: (VIEW_RADIUS * 2 + 1) ** 2 * 32 * 32, buildings: 512, npcs: 64 }), [])

  /** 맵 헤더 id → 표시용 지역명. 집 내부는 그 마을 이름을 그대로 쓴다 */
  const displayName = useCallback((mapId: number) => {
    const m = mapById(mapId)
    return m ? (locationNames[m.label] ?? m.name) : null
  }, [locationNames])

  /** 맵을 갈아 끼운다. 격자·플레이어 위치·존 이름을 한 번에 맞춘다 */
  const enter = useCallback((next: MapGrid, mapId: number, x: number, z: number) => {
    setGrid(next)
    activeZone.grid = next
    world.grid = next
    world.mapId = mapId
    worldState.player.position.set(x, 0, z)
    worldState.player.prevPosition.copy(worldState.player.position)
    worldState.player.velocity.set(0, 0, 0)
    setChunkIndex(next.chunkIndexAt(Math.floor(x), Math.floor(z)))
    setZone(displayName(mapId))
    setMapId(mapId)
    // 도착한 칸을 "방금 밟았다"로 치게 초기화한다
    resetEncounterTile()
  }, [setZone, displayName])

  useEffect(() => {
    enter(initial, spawn.map, spawn.x, spawn.z)
    return () => {
      activeZone.grid = null
      world.grid = null
      world.mapId = -1
      world.pending = null
      encounters.pending = null
      setZone(null)
      setEncounter(null)
    }
  }, [initial, spawn, enter, setZone, setEncounter])

  // 프레임마다 도는 일은 정수 비교 둘뿐이다
  const warping = useRef(false)
  useFrame(() => {
    const p = worldState.player.position
    const tx = Math.floor(p.x), tz = Math.floor(p.z)

    if (world.pending && !warping.current) {
      const target = world.pending
      warping.current = true
      gridFor(target.matrix)
        .then((next) => { enter(next, target.to, target.x, target.z) })
        .catch((e) => { console.error('워프 실패', e) })
        .finally(() => { world.pending = null; warping.current = false })
      return
    }

    // 오버월드는 한 행렬 안에 존이 여럿이다 — 마을에서 도로로 걸어 나가는 것은
    // 워프가 아니라 좌표 연속이므로 여기서 존만 갱신한다
    const zone = grid.zoneAt(tx, tz)
    if (zone >= 0 && zone !== world.mapId) {
      world.mapId = zone
      setZone(displayName(zone))
      setMapId(zone)
    }
    const i = grid.chunkIndexAt(tx, tz)
    if (i >= 0) setChunkIndex((prev) => (prev === i ? prev : i))

    // 야생이 나왔다 — 전투 화면이 생기기 전까지는 배너로만 알린다
    if (encounters.pending) {
      const e = encounters.pending
      encounters.pending = null
      setEncounter({ species: e.species, level: e.level, name: speciesNames[e.species] ?? `#${e.species}` })
    }
  })

  const window_ = useMemo(() => buildWindow(grid, chunkIndex), [grid, chunkIndex])
  // NPC는 맵 단위다. 오버월드는 한 행렬에 존이 67개라 창 안의 것만 골라야 한다
  const npcs = useMemo(() => {
    const n = grid.chunkTiles
    const inWindow = new Set(grid.chunksAround(chunkIndex, VIEW_RADIUS).map((c) => c.i))
    return npcsOf(mapId).filter((p) => {
      const ci = grid.chunkIndexAt(p.x, p.z)
      return ci >= 0 && inWindow.has(ci) && n > 0
    })
  }, [grid, chunkIndex, mapId])

  useEffect(() => {
    const { floors, walls, buildings } = window_
    const f = floorRef.current
    if (f) {
      f.count = Math.min(floors.length, capacity.tiles)
      floors.slice(0, capacity.tiles).forEach((t, i) => {
        dummy.position.set(t.x + 0.5, 0, t.z + 0.5)
        dummy.updateMatrix()
        f.setMatrixAt(i, dummy.matrix)
        f.setColorAt(i, t.color!)
      })
      f.instanceMatrix.needsUpdate = true
      if (f.instanceColor) f.instanceColor.needsUpdate = true
      f.computeBoundingSphere()
    }
    const w = wallRef.current
    if (w) {
      w.count = Math.min(walls.length, capacity.tiles)
      walls.slice(0, capacity.tiles).forEach((t, i) => {
        dummy.position.set(t.x + 0.5, WALL_HEIGHT / 2, t.z + 0.5)
        dummy.updateMatrix()
        w.setMatrixAt(i, dummy.matrix)
      })
      w.instanceMatrix.needsUpdate = true
      w.computeBoundingSphere()
    }
    const b = buildingRef.current
    if (b) {
      b.count = Math.min(buildings.length, capacity.buildings)
      buildings.slice(0, capacity.buildings).forEach((o, i) => {
        dummy.position.set(o.x, o.y + 1, o.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        b.setMatrixAt(i, dummy.matrix)
      })
      b.instanceMatrix.needsUpdate = true
      b.computeBoundingSphere()
    }
    const p = npcRef.current
    if (p) {
      p.count = Math.min(npcs.length, capacity.npcs)
      npcs.slice(0, capacity.npcs).forEach((o, i) => {
        dummy.position.set(o.x + 0.5, 0.55, o.z + 0.5)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        p.setMatrixAt(i, dummy.matrix)
      })
      p.instanceMatrix.needsUpdate = true
      p.computeBoundingSphere()
    }
  }, [window_, npcs, capacity])

  return (
    <group>
      <ambientLight intensity={0.7} />
      <directionalLight position={[20, 40, 15]} intensity={1.5} />

      <instancedMesh ref={floorRef} args={[undefined, undefined, capacity.tiles]}>
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>

      <instancedMesh ref={wallRef} args={[undefined, undefined, capacity.tiles]}>
        <boxGeometry args={[1, WALL_HEIGHT, 1]} />
        <meshStandardMaterial color="#4a5163" roughness={0.9} />
      </instancedMesh>

      <instancedMesh ref={buildingRef} args={[undefined, undefined, capacity.buildings]}>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial color="#b07a4a" roughness={0.85} />
      </instancedMesh>

      {/* NPC 블록아웃. 모델(sprite)은 아직 안 뽑았으므로 자리만 세운다 */}
      <instancedMesh ref={npcRef} args={[undefined, undefined, capacity.npcs]}>
        <capsuleGeometry args={[0.28, 0.5, 4, 8]} />
        <meshStandardMaterial color="#d6c26a" roughness={0.7} />
      </instancedMesh>
    </group>
  )
}
