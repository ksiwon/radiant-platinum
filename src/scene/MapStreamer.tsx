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
import { BackSide, DirectionalLight, InstancedMesh, Mesh, Object3D } from 'three'
import { activeZone } from '../engine/map/zone'
import { MapGrid } from '../engine/map/grid'
import { mapById, world } from '../engine/map/world'
import {
  enterMap, fieldScripts, initFieldScripts, initNewGame, loadVars,
} from '../engine/script/field'
import { installFieldServices } from './fieldServices'
import { npcActors } from '../engine/actor/npcs'
import { loadGenericNames, pickName, type NameKind } from '../data/genericNames'
import { useSaveStore } from '../state/saveStore'
import { textSpeedFrames, useOptionsStore } from '../state/optionsStore'
import { worldState } from '../state/worldState'
import { useSessionStore } from '../state/sessionStore'
import { useBattleStore } from '../state/battleStore'
import { setGameActive } from '../engine/input/keyboard'
import { encounters, resetEncounterTile } from '../engine/battle/encounterSystem'
import { gridFor } from './worldData'
import { ChunkModels } from './ChunkModels'
import { DAY, makeSkyTexture } from './fx/sky'

/** 렌더 창 반경(청크). 2면 5×5청크 = 160×160타일 — far 200 안에 들어온다 */
const VIEW_RADIUS = 2
const dummy = new Object3D()

/** NPC를 그리는 거리(타일). 청크 창보다 조금 넉넉하게 둔다 */
const NPC_DRAW_RANGE = 48

/**
 * 그림자 맵 한 변.
 *
 * 절두체가 ±30타일이라 2048이면 타일 하나에 34픽셀이다. 원작 타일 그림이
 * 16×16이므로 그림자가 텍스처보다 곱게 나온다 — 더 키워도 눈에 안 보인다
 */
const SHADOW_MAP = 2048
/** 그림자 절두체 반경(타일). 렌더 창(±80)보다 좁다 — 가까운 것만 그림자를 진다 */
const SHADOW_SPAN = 30
/** 태양이 플레이어보다 얼마나 위·옆에 서는가. 방향은 아래 `directionalLight`와 같다 */
const SUN_OFFSET: readonly [number, number, number] = [24, 42, 18]
/** 원작 방향(0 북 · 1 남 · 2 서 · 3 동) → 모델 y 회전 */
const NPC_FACING = [Math.PI, 0, -Math.PI / 2, Math.PI / 2]

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
  const npcRef = useRef<InstancedMesh>(null)
  const sunRef = useRef<DirectionalLight>(null)
  const [mapId, setMapId] = useState(spawn.map)

  // 오버월드 창이 가장 크다. 실내로 바뀌어도 이 용량 안에 들어온다
  const capacity = useMemo(
    () => ({ tiles: (VIEW_RADIUS * 2 + 1) ** 2 * 32 * 32, buildings: 512, npcs: 64 }), [])

  /** 맵 헤더 id → 표시용 지역명. 집 내부는 그 마을 이름을 그대로 쓴다 */
  /** 이 맵의 텍스처 묶음. 영역 표가 아직 없으면 0번으로 뜬다 */
  const texSet = useMemo(() => {
    const area = mapById(mapId)?.area ?? 0
    return world.areas?.[area]?.tex ?? 0
  }, [mapId])

  const displayName = useCallback((mapId: number) => {
    const m = mapById(mapId)
    return m ? (locationNames[m.label] ?? m.name) : null
  }, [locationNames])

  /** 맵을 갈아 끼운다. 격자·플레이어 위치·존 이름을 한 번에 맞춘다 */
  const enter = useCallback((next: MapGrid, mapId: number, x: number, z: number, matrix: number) => {
    setGrid(next)
    activeZone.grid = next
    world.grid = next
    world.mapId = mapId
    world.matrix = matrix
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
    // NPC를 세우고 대사 뱅크를 받는다. 세우기는 이 자리에서 바로 끝나야
    // 같은 프레임에 그릴 수 있다
    enterMap(mapId)
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

  // 세이브가 적어 둔 자리에서 시작한다. 새 판이면 그것이 주인공 방이고
  // (`START_LOCATION`) 이어하기면 리포트를 쓴 자리다.
  //
  // 실내는 그 격자를 따로 받아야 해서 오버월드로 한 번 세운 뒤 갈아 끼운다 —
  // 첫 프레임에 빈 화면을 안 보이려고
  useEffect(() => {
    enter(initial, spawn.map, spawn.x, spawn.z, 0)
    const at = useSaveStore.getState().position
    worldState.player.facing = at.facing
    if (at.matrix === 0) enter(initial, at.map, at.x, at.z, 0)
    else {
      void gridFor(at.matrix)
        .then((next) => { enter(next, at.map, at.x, at.z, at.matrix) })
        .catch(() => { /* 못 받으면 기본 스폰에 그대로 선다 */ })
    }
    return () => {
      activeZone.grid = null
      world.grid = null
      world.mapId = -1
      world.pending = null
      encounters.pending = null
      setZone(null)
    }
  }, [initial, spawn, enter, setZone])

  // 스크립트 바이트코드는 한 벌뿐이라 한 번만 받는다. 대사는 맵마다 다르므로
  // 존이 바뀔 때마다 그 맵의 뱅크를 받는다 — 한 맵이 쓰는 것은 몇 KB다
  const [generic, setGeneric] = useState<string[]>([])
  useEffect(() => {
    // 이름 짓기 화면이 아직 없다. 그동안은 원작이 제안하는 표의 첫 이름을
    // 쓴다 — 우리가 지어낸 이름을 화면에 내보내지 않기 위해서다
    const fallback = (kind: NameKind): string =>
      generic.length === 0 ? '' : pickName(generic, kind, 0)
    fieldScripts.names = {
      player: () => {
        const save = useSaveStore.getState()
        return save.trainer.name
          || fallback(save.trainer.gender === 'girl' ? 'playerFemale' : 'playerMale')
      },
      rival: () => useSaveStore.getState().rivalName || fallback('rival'),
      // 주인공의 반대 성별 주인공
      counterpart: () =>
        fallback(useSaveStore.getState().trainer.gender === 'girl' ? 'playerMale' : 'playerFemale'),
    }
    // 설정의 글자 속도. 여기서 붙여야 엔진이 상태 계층을 안 import 한다
    fieldScripts.textSpeed = textSpeedFrames
    // 플래그 하나가 NPC의 등장 조건이라, 저장이 안 되면 다음에 켤 때
    // 이야기가 통째로 되감긴다
    fieldScripts.onScriptEnd = (vars) => {
      useSaveStore.getState().commitScriptState(vars.saved, vars.flags)
    }
    void initFieldScripts('ko').then(() => { setScriptsReady(true) })
    const uninstall = installFieldServices('ko')
    return () => {
      uninstall()
      fieldScripts.onScriptEnd = null
    }
  }, [generic])

  useEffect(() => {
    loadGenericNames('ko').then(setGeneric).catch(() => { /* 이름이 비면 대사에 빈칸이 난다 */ })
  }, [])

  // 플래그·변수를 붓는다. 새 판이면 원작의 초기화 스크립트를 **돌려서** 세운다 —
  // 그 표는 NPC 130여 명을 숨기는 플래그고, 손으로 옮기면 베끼는 것이 된다.
  //
  // 스크립트 자료가 온 뒤여야 한다(`scriptsReady`). 그리고 세우고 나면 **NPC를
  // 다시 세운다** — 숨김 플래그가 등장 조건이라, 먼저 세워 두면 아직 안 나올
  // 사람이 방 안에 서 있다
  const hydrated = useSaveStore((s) => s.hydrated)
  const [scriptsReady, setScriptsReady] = useState(false)
  useEffect(() => {
    if (!hydrated || !scriptsReady) return
    const save = useSaveStore.getState()
    if (save.pendingInit) {
      if (!initNewGame()) return
      useSaveStore.setState({ pendingInit: false })
      save.commitScriptState(fieldScripts.vars.saved, fieldScripts.vars.flags)
    } else {
      loadVars(save.vars, save.flags)
    }
    if (world.mapId >= 0) enterMap(world.mapId)
  }, [hydrated, scriptsReady])

  // 존만 바뀌는 경우(마을 → 도로)도 맵이 바뀐 것이다
  useEffect(() => { enterMap(mapId) }, [mapId])

  // 시점은 설정에 있고 카메라는 프레임 상태를 본다. 그 사이를 여기서 잇는다 —
  // 카메라 시스템이 zustand를 구독하면 프레임마다 스토어를 읽게 된다
  const viewMode = useOptionsStore((s) => s.view)
  useEffect(() => { worldState.camera.mode = viewMode === 1 ? 'first' : 'third' }, [viewMode])

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

    // 그림자 절두체를 플레이어 위로 옮긴다. 원점에 고정해 두면 마을을 벗어나는
    // 순간 그림자가 통째로 사라진다 — 신오가 960타일이라 한 판에 안 들어온다
    const sun = sunRef.current
    if (sun) {
      sun.position.set(p.x + SUN_OFFSET[0], p.y + SUN_OFFSET[1], p.z + SUN_OFFSET[2])
      sun.target.position.set(p.x, p.y, p.z)
      sun.target.updateMatrixWorld()
    }

    if (world.pending && !warping.current) {
      const target = world.pending
      warping.current = true
      gridFor(target.matrix)
        .then((next) => { enter(next, target.to, target.x, target.z, target.matrix) })
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

    // NPC. 스크립트가 걷게 만들면 좌표가 프레임마다 바뀌므로 여기서 다시 쓴다.
    // 맵 하나의 NPC는 많아야 수십 명이라 전수를 훑어도 부담이 없다
    const npcMesh = npcRef.current
    if (npcMesh) {
      let n = 0
      for (const actor of npcActors.list) {
        if (n >= capacity.npcs) break
        if (!actor.visible) continue
        // 창 밖은 안 그린다 — 오버월드는 한 행렬에 존이 67개다
        if (Math.abs(actor.x - p.x) > NPC_DRAW_RANGE) continue
        if (Math.abs(actor.z - p.z) > NPC_DRAW_RANGE) continue
        const y = grid.heightAtWorld(actor.x + 0.5, actor.z + 0.5, layer) ?? 0
        dummy.position.set(actor.x + 0.5, y + 0.55, actor.z + 0.5)
        dummy.rotation.set(0, NPC_FACING[actor.dir] ?? 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        npcMesh.setMatrixAt(n++, dummy.matrix)
      }
      npcMesh.count = n
      npcMesh.instanceMatrix.needsUpdate = true
      npcMesh.computeBoundingSphere()
    }

    // 야생이 나왔다. 배틀 청크는 이때 처음 받는다 — 그동안 판정을 멈춰 둔다
    if (encounters.pending) {
      const e = encounters.pending
      encounters.pending = null
      encounters.suspended = true
      void startWild({ species: e.species, level: e.level })
    }
  })


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
      {/*
        반구광의 **아래쪽 색**이 그늘진 면을 정한다. 어둡게 두면 절벽 옆면이
        rgb(34,30,21)까지 죽어서 단차가 검은 덩어리로 뭉친다(실측). 지면에서
        튀는 빛이라 생각하고 흙 계열로 밝게 잡는다
      */}
      <hemisphereLight args={['#d4e9f7', '#8d8468', 0.85]} />
      {/*
        태양. 그림자를 던지는 것은 이 하나뿐이다 — 나무가 땅에 그림자를 안
        떨어뜨리면 아무리 면을 나눠 칠해도 서 있는 것으로 안 보인다.
        절두체는 플레이어를 따라다닌다 (`useFrame` 안 `sun.current`)
      */}
      <directionalLight
        ref={sunRef}
        position={[24, 42, 18]}
        intensity={1.05}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[SHADOW_MAP, SHADOW_MAP]}
        shadow-camera-left={-SHADOW_SPAN}
        shadow-camera-right={SHADOW_SPAN}
        shadow-camera-top={SHADOW_SPAN}
        shadow-camera-bottom={-SHADOW_SPAN}
        shadow-camera-near={1}
        shadow-camera-far={140}
        // 나뭇잎은 알파로 오려 낸 판이라 자기 그림자가 얼룩진다. 살짝 밀어 둔다
        shadow-bias={-0.0012}
        shadow-normalBias={0.03}
      />
      {/* 카메라 쪽에서 넣는 필. 우리를 향한 절벽면이 정면광을 못 받는다 */}
      <directionalLight position={[-14, 12, 26]} intensity={0.38} color="#cfe0f0" />

      {/*
        땅. 색칠한 상자가 아니라 **원작 모델**이다 — 길·계단·물가·나무·건물 윤곽이
        전부 여기서 나온다 (DATA.md §2.2). 청크 하나가 파일 하나고 창 안의 것만
        받는다. 충돌·높이는 여전히 perm/BDHC가 잡으므로 이 층은 그림만 담당한다
      */}
      <ChunkModels grid={grid} chunkIndex={chunkIndex} radius={VIEW_RADIUS} texSet={texSet} />

      {/* NPC 블록아웃. 모델(sprite)은 아직 안 뽑았으므로 자리만 세운다 */}
      <instancedMesh ref={npcRef} args={[undefined, undefined, capacity.npcs]}>
        <capsuleGeometry args={[0.28, 0.5, 4, 8]} />
        <meshStandardMaterial color="#d6c26a" roughness={0.7} />
      </instancedMesh>
    </group>
  )
}
