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
import {
  BackSide, InstancedBufferAttribute, InstancedMesh, Mesh, Object3D, type Color,
} from 'three'
import { activeZone, IMPASSABLE } from '../engine/map/zone'
import { MapGrid } from '../engine/map/grid'
import { mapById, npcsOf, world } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { useSessionStore } from '../state/sessionStore'
import { useBattleStore } from '../state/battleStore'
import { setGameActive } from '../engine/input/keyboard'
import { encounters, resetEncounterTile } from '../engine/battle/encounterSystem'
import { gridFor } from './worldData'
import { CLIFF_COLOR, tileColor } from './fx/palette'
import { DAY, makeSkyTexture } from './fx/sky'

/** 렌더 창 반경(청크). 2면 5×5청크 = 160×160타일 — far 200 안에 들어온다 */
const VIEW_RADIUS = 2
const WALL_HEIGHT = 1.2
const dummy = new Object3D()

interface Cell { x: number; z: number; y: number; color?: Color }

/**
 * 인스턴스 색 버퍼를 **첫 렌더 전에** 만들어 둔다.
 *
 * `setColorAt`은 버퍼가 없으면 그때 만든다. 그런데 그 호출은 effect 안에서
 * 일어나고, 그 사이에 렌더러가 이미 `instanceColor === null`인 상태로 머티리얼을
 * 컴파일해 버리면 **그 뒤에 넣은 색은 셰이더에 영영 안 들어간다.**
 *
 * 실측으로 잡았다: 머티리얼 색을 빨강으로 두고 인스턴스 색을 올리브로 넣었더니
 * 화면이 rgb(185, 0, 10) — 곱해지지 않고 순수 빨강이었다. 타일 색이 실행할
 * 때마다 나왔다 안 나왔다 한 것이 이 경쟁 때문이다.
 *
 * ref 콜백은 커밋 시점, 즉 첫 프레임 전에 돈다
 */
function ensureInstanceColor(mesh: InstancedMesh | null, count: number): void {
  if (!mesh || mesh.instanceColor) return
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3)
}

/**
 * 창 안의 타일을 바닥/벽으로 나눈다. 벽은 걸을 수 있는 칸에 접한 것만 세운다.
 *
 * `layer`는 지금 플레이어가 선 높이다. 판이 겹치는 자리(다리와 그 밑, 666개 중
 * 81개 청크)에서 **어느 층을 그릴지**를 그걸로 고른다 — 0으로 고정하면 다리
 * 위를 걸어도 화면에는 밑바닥이 깔린다
 */
function buildWindow(grid: MapGrid, chunkIndex: number, layer: number) {
  const floors: Cell[] = []
  const walls: Cell[] = []
  const buildings = []
  const n = grid.chunkTiles
  /** 타일 한가운데의 지면 높이. 판이 없으면 0 — 높이 데이터가 아직 없을 때다 */
  const groundAt = (x: number, z: number) =>
    grid.heightAtWorld(x + 0.5, z + 0.5, layer) ?? 0
  for (const c of grid.chunksAround(chunkIndex, VIEW_RADIUS)) {
    const ox = c.mx * n, oz = c.my * n
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const x = ox + tx, z = oz + ty
        const t = grid.tileAt(x, z)
        const y = groundAt(x, z)
        if (!(t & IMPASSABLE)) { floors.push({ x, z, y, color: tileColor(t) }); continue }
        // 벽 속을 채워봐야 보이지 않는다 — 걸을 수 있는 칸에 접한 껍질만 세운다
        if (
          !grid.isBlocked(x - 1, z) || !grid.isBlocked(x + 1, z) ||
          !grid.isBlocked(x, z - 1) || !grid.isBlocked(x, z + 1)
        ) walls.push({ x, z, y })
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
  /** 지역명. 맵 헤더의 label로 색인한다 */
  locationNames: string[]
}

export function MapStreamer({ initial, spawn, locationNames }: Props) {
  const setZone = useSessionStore((s) => s.setZoneName)
  const startWild = useBattleStore((s) => s.startWild)
  const [grid, setGrid] = useState(initial)
  const [chunkIndex, setChunkIndex] = useState(() =>
    initial.chunkIndexAt(Math.floor(spawn.x), Math.floor(spawn.z)))

  const skyRef = useRef<Mesh>(null)
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
    // 도착 높이를 여기서 맞춘다. 0으로 두면 실내 2층에 y=0으로 떨어졌다가
    // 플레이어 시스템이 따라 올라가는 게 한 프레임 보인다
    worldState.player.position.set(x, next.heightAtWorld(x, z, 0) ?? 0, z)
    worldState.player.prevPosition.copy(worldState.player.position)
    worldState.player.velocity.set(0, 0, 0)
    setChunkIndex(next.chunkIndexAt(Math.floor(x), Math.floor(z)))
    setZone(displayName(mapId))
    setMapId(mapId)
    // 도착한 칸을 "방금 밟았다"로 치게 초기화한다
    resetEncounterTile()
  }, [setZone, displayName])

  // 배틀 중에는 오버월드가 멈춘다. 조우 판정도 키보드도 다 꺼야 한다 —
  // 안 그러면 배틀 화면 뒤에서 계속 걸어다니고 두 번째 조우가 겹쳐 들어온다.
  // 돌아올 때 `lastTile`은 일부러 초기화하지 않는다: 서 있던 풀숲 칸에서 곧바로
  // 또 튀어나오면 안 되고, 원작도 한 칸 움직여야 다시 굴린다
  const battlePhase = useBattleStore((s) => s.phase)
  useEffect(() => {
    const inBattle = battlePhase !== 'off'
    encounters.suspended = inBattle
    setGameActive(!inBattle)
  }, [battlePhase])

  useEffect(() => {
    enter(initial, spawn.map, spawn.x, spawn.z)
    return () => {
      activeZone.grid = null
      world.grid = null
      world.mapId = -1
      world.pending = null
      encounters.pending = null
      setZone(null)
    }
  }, [initial, spawn, enter, setZone])

  // 하늘 텍스처는 한 번만 만든다
  const sky = useMemo(() => makeSkyTexture(DAY), [])

  // 지금 서 있는 층. 다리처럼 판이 겹치는 자리에서 어느 쪽을 그릴지 고른다.
  // 정수로 반올림해 두는 이유는 계단을 오르는 동안 매 프레임 창을 다시 세우지
  // 않기 위해서다 — 한 번 다시 세우는 데 5×5청크 × 1024타일을 훑는다
  const [layer, setLayer] = useState(0)

  // 프레임마다 도는 일은 정수 비교 셋뿐이다
  const warping = useRef(false)
  useFrame(() => {
    const p = worldState.player.position
    const tx = Math.floor(p.x), tz = Math.floor(p.z)
    const l = Math.round(p.y)
    if (l !== layer) setLayer(l)

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

    // 하늘 돔을 플레이어 위로 옮긴다. 안 옮기면 오버월드 끝(960타일)에서
    // 돔 밖으로 걸어 나가 하늘이 사라진다
    if (skyRef.current) skyRef.current.position.set(p.x, 0, p.z)

    // 야생이 나왔다. 배틀 청크는 이때 처음 받는다 — 그동안 판정을 멈춰 둔다
    if (encounters.pending) {
      const e = encounters.pending
      encounters.pending = null
      encounters.suspended = true
      void startWild({ species: e.species, level: e.level })
    }
  })

  const window_ = useMemo(() => buildWindow(grid, chunkIndex, layer), [grid, chunkIndex, layer])
  // NPC는 맵 단위다. 오버월드는 한 행렬에 존이 67개라 창 안의 것만 골라야 한다
  const npcs = useMemo(() => {
    const n = grid.chunkTiles
    const inWindow = new Set(grid.chunksAround(chunkIndex, VIEW_RADIUS).map((c) => c.i))
    // 높이도 여기서 붙인다 — 배치 효과에서 격자를 다시 묻으면 그 효과가
    // 격자·층에 의존하게 되고, 창이 안 바뀌었는데도 다시 도는 이유가 생긴다
    return npcsOf(mapId)
      .filter((p) => {
        const ci = grid.chunkIndexAt(p.x, p.z)
        return ci >= 0 && inWindow.has(ci) && n > 0
      })
      .map((p) => ({ ...p, y: grid.heightAtWorld(p.x + 0.5, p.z + 0.5, layer) ?? 0 }))
  }, [grid, chunkIndex, mapId, layer])

  useEffect(() => {
    const { floors, walls, buildings } = window_
    const f = floorRef.current
    if (f) {
      f.count = Math.min(floors.length, capacity.tiles)
      floors.slice(0, capacity.tiles).forEach((t, i) => {
        dummy.position.set(t.x + 0.5, t.y, t.z + 0.5)
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
        dummy.position.set(t.x + 0.5, t.y + WALL_HEIGHT / 2, t.z + 0.5)
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
        dummy.position.set(o.x + 0.5, o.y + 0.55, o.z + 0.5)
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
      {/*
        하늘 돔. 카메라를 따라다니게 두지 않고 플레이어 위에 세운다 — 반지름
        400이면 far(200) 밖으로 나가지 않는 한 어디서 봐도 지평선이 보인다.
        안개는 끈다: 안 그러면 하늘 자체가 안개색으로 뭉개진다
      */}
      {sky && (
        <mesh ref={skyRef} renderOrder={-1}>
          <sphereGeometry args={[190, 32, 20]} />
          <meshBasicMaterial map={sky} side={BackSide} fog={false} depthWrite={false} />
        </mesh>
      )}
      {/*
        조명 셋. 앰비언트 하나로 평평하게 채우면 절벽의 단차가 안 보인다 —
        하늘/지면 두 색을 섞는 반구광이 야외에서는 훨씬 낫다
      */}
      <hemisphereLight args={['#cfe4f2', '#5b6b46', 0.62]} />
      <directionalLight position={[24, 42, 18]} intensity={1.15} color="#fff4e0" />
      {/* 반대쪽에서 넣는 약한 빛. 그늘진 면이 검게 죽는 것을 막는다 */}
      <directionalLight position={[-20, 16, -24]} intensity={0.22} color="#9fc4e8" />

      <instancedMesh
        ref={(m) => { floorRef.current = m; ensureInstanceColor(m, capacity.tiles) }}
        args={[undefined, undefined, capacity.tiles]}
      >
        <boxGeometry args={[1, 0.1, 1]} />
        <meshStandardMaterial roughness={0.95} />
      </instancedMesh>

      <instancedMesh ref={wallRef} args={[undefined, undefined, capacity.tiles]}>
        <boxGeometry args={[1, WALL_HEIGHT, 1]} />
        <meshStandardMaterial color={CLIFF_COLOR} roughness={0.95} />
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
