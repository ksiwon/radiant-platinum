// 깨어진 세계 엔진 수리를 잰다 (REPAIR §100 ~ §109 · §112 ~ §115).
//
// 실제 `distortion.json`으로 층을 세우고 제품의 들고 나기·사건·걸음 자를 돌린다. 원작 값은 줄마다 디컴프
// 자리를 달았다 (`overlay009/ov9_02249960.c`).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'
import {
  MAP, PLATFORM_NONE, PLATFORM_WEST_WALL, distortionBridge, newDistortionState, terrainTileY,
} from '../engine/world/distortion'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'

const FILE = 'public/data/distortion.json'
const real = existsSync(FILE) && existsSync('public/data/matrices/interiors.bin')
  && existsSync('public/data/maps.json')
const data: DistortionData | null = real
  ? withDistortionTables(distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8'))))
  : null

// 걸음 자(`stepSystem`)가 도구 표 따위도 부르므로 나머지는 제품 그대로 둔다
vi.mock('../data/gameData', async (importOriginal) => ({
  ...await importOriginal<typeof import('../data/gameData')>(),
  loadDistortion: () => Promise.resolve(data),
}))

const { world } = await import('../engine/map/world')
const { worldState } = await import('../state/worldState')
const { useSaveStore } = await import('../state/saveStore')
const mod = await import('./distortion')
const core = await import('./distortionCore')
const { stepSystem, resetStepTile } = await import('./stepSystem')

/** 그 층의 맵 격자 — 제품이 받는 그 행렬 */
function gridOf(map: number): MapGrid {
  const maps = (JSON.parse(readFileSync('public/data/maps.json', 'utf8')) as {
    maps: { id: number, matrix: number }[]
  }).maps
  const idx = JSON.parse(readFileSync('public/data/matrices/interiors.json', 'utf8')) as {
    matrices: Record<string, MatrixMeta & { byteOffset: number }>
  }
  const blob = readFileSync('public/data/matrices/interiors.bin')
  const ab = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength)
  const meta = idx.matrices[String(maps.find((m) => m.id === map)!.matrix)]!
  return new MapGrid(meta, new Uint16Array(ab, meta.byteOffset, meta.tileWidth * meta.tileHeight))
}

const floorOf = (map: number) => data!.maps.find((m) => m.map === map)!

/** 세계 칸 → 지역 칸 */
function local(map: number, x: number, y: number, z: number): [number, number, number] {
  const f = floorOf(map)
  return [x - f.offsetX, y - f.offsetY, z - f.offsetZ]
}

beforeEach(async () => {
  await mod.distortionPreload()
  useSaveStore.setState({ distortion: newDistortionState() })
  core.takeFloorLoad()
  core.takeCarried()
  worldState.restoring = false
  worldState.input.move.set(0, 0)
  mod.distortionHooks.progress = () => 0
  mod.distortionHooks.runScript = () => false
  mod.distortionHooks.scriptRunning = null
  mod.distortionHooks.puzzleFinished = () => false
  mod.distortionHooks.vars = () => null as never
  mod.distortionHooks.giratinaAnim = null
  mod.distortionHooks.setGiratinaAnim = null
  mod.distortionHooks.steppingStones = null
  world.pending = null
})

describe.runIf(real)('§100 워프로 들어설 때만 세이브 자리를 비운다', () => {
  it('귀혼동굴 → 깨어진 세계 방(583): 낡은 판 번호 0이 동쪽 벽을 잡지 않는다', () => {
    // B6F → B7F 승강 발판 뒤에 남는 값 — B7F는 판이 없어 「판 개수」 0이 적힌다
    useSaveStore.setState({ distortion: { ...newDistortionState(), valid: true, platformIndex: 0 } })
    // 워프 도착 칸 (116,75) = 지역 (46,45) (REPAIR §83). 그 방의 `OnTransition`이 비운다
    mod.resetDistortionPersisted()
    const [lx, ly, lz] = local(MAP.turnbackCaveRoom, 116, 65, 75)
    mod.distortionEnter(MAP.turnbackCaveRoom, lx, ly, lz)
    expect(mod.distortionKind()).toBe(PLATFORM_NONE)
    expect(useSaveStore.getState().distortion.valid).toBe(true)
  })

  it('비우지 않고 들어서면(예전) 그 방의 판 0이 잡혀 사방이 막힌다 — 비워야 하는 까닭', () => {
    useSaveStore.setState({ distortion: { ...newDistortionState(), valid: true, platformIndex: 0 } })
    const [lx, ly, lz] = local(MAP.turnbackCaveRoom, 116, 65, 75)
    mod.distortionEnter(MAP.turnbackCaveRoom, lx, ly, lz)
    expect(mod.distortionKind()).not.toBe(PLATFORM_NONE)
  })

  it('층 갈이와 이어하기는 안 비운다', () => {
    const kept = { ...newDistortionState(), valid: true, platformFlags: 0x1f, puzzleFlags: 7 }
    useSaveStore.setState({ distortion: kept })
    core.beginFloorLoad()
    mod.resetDistortionPersisted()
    expect(useSaveStore.getState().distortion).toMatchObject({ valid: true, platformFlags: 0x1f })
    core.takeFloorLoad()
    worldState.restoring = true
    mod.resetDistortionPersisted()
    expect(useSaveStore.getState().distortion).toMatchObject({ valid: true, puzzleFlags: 7 })
    worldState.restoring = false
    mod.resetDistortionPersisted()
    expect(useSaveStore.getState().distortion).toEqual(newDistortionState())
  })

  it('층 갈이는 판을 풀고(「판 개수」를 적는다) 카메라를 안 건드린다 — 도중에 판이 돌지 않는다', () => {
    // B3F → B4F 승강 발판: 앞 층 판 번호 1을 들고 오면 B4F의 1번(천장)이 잡혀 화면이 뒤집혔다
    useSaveStore.setState({
      distortion: { ...newDistortionState(), valid: true, platformIndex: 1, cameraAngleX: 245 },
    })
    const [lx, ly, lz] = local(MAP.b4f, 95, 161 + 16, 70)
    core.beginFloorLoad()
    mod.distortionEnter(MAP.b4f, lx, ly, lz)
    expect(mod.distortionKind()).toBe(PLATFORM_NONE)
    expect(useSaveStore.getState().distortion.platformIndex).toBe(floorOf(MAP.b4f).platforms.length)
    expect(useSaveStore.getState().distortion.cameraAngleX).toBe(245)
  })

  it('이어하기는 유령 소품 무리를 적어 둔 대로 세운다 (`InitActiveGhostPropManager(…, FALSE)`)', () => {
    const [lx, ly, lz] = local(MAP.giratinaRoom, 15, 1, 20)
    useSaveStore.setState({ distortion: { ...newDistortionState(), valid: true, hiddenGroups: 0b0001 } })
    mod.distortionEnter(MAP.giratinaRoom, lx, ly, lz)
    expect(useSaveStore.getState().distortion.hiddenGroups).toBe(0b0001)
  })
})

describe.runIf(real)('§101 사건은 걸음마다 돈다 — 옮겨진 칸은 걸음이 아니다', () => {
  const run = () => {
    for (let f = 0; f < 3000 && mod.distortionEventRunning(); f++) mod.distortionEventTick(1 / 60)
    expect(mod.distortionEventRunning()).toBe(false)
  }

  it('B2F 판을 타고 되돌아가고 다시 탄다 — 한 층 안에서', () => {
    const [ex, ey, ez] = local(MAP.b2f, 33, 225, 36)
    mod.distortionEnter(MAP.b2f, ex, ey, ez)
    for (const [x, y, z] of [[33, 225, 36], [33, 225, 25], [33, 225, 36]] as const) {
      const [lx, ly, lz] = local(MAP.b2f, x, y, z)
      worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
      mod.distortionStepped(lx + 0.5, ly, lz + 0.5, 0)
      expect(mod.distortionEventRunning(), `(${String(x)},${String(y)},${String(z)})`).toBe(true)
      run()
      // 판이 옮겨 놓았다 — 걸음 자가 이 칸을 걸은 칸으로 안 센다
      expect(mod.takeCarried()).toBe(true)
    }
  })
})

describe.runIf(real)('§102 B4F 그림자 표식 (명령 8 · 2478/2479)', () => {
  it('지나가면 표식이 서고, 다시 밟아도 안 지나간다', () => {
    const flags = new Set<number>()
    mod.distortionHooks.giratinaAnim = (n) => flags.has(n)
    mod.distortionHooks.setGiratinaAnim = (n) => { flags.add(n) }
    const [lx, ly, lz] = local(MAP.b4f, 65, 161, 57)
    mod.distortionEnter(MAP.b4f, lx, ly, lz)
    mod.distortionStepped(lx + 0.5, ly, lz + 0.5, 0)
    expect(mod.distortionEventRunning()).toBe(true)
    for (let f = 0; f < 3000 && mod.distortionEventRunning(); f++) {
      mod.distortionShadowTick(1 / 60)
      mod.distortionEventTick(1 / 60)
    }
    expect([...flags]).toEqual([0])
    mod.distortionStepped(lx + 0.5, ly, lz + 0.5, 0)
    expect(mod.distortionEventRunning()).toBe(false)
  })
})

describe.runIf(real)('§105 판 밖의 높이는 지형의 칸이다', () => {
  it('반 칸은 내린다 — B5F 웅덩이 0.5는 칸 0(세계 128), 뭍 1.0은 1(129)', () => {
    expect(terrainTileY(0.5)).toBe(0)
    expect(terrainTileY(1)).toBe(1)
    expect(terrainTileY(0.999_999_9)).toBe(1)
    expect(terrainTileY(null)).toBeNull()
  })

  it('판 밖에 들어서면 지형을 딛고, 판 뛰기 뒤에는 안 딛는다', () => {
    const [lx, ly, lz] = local(MAP.b5f, 101, 129, 67)
    mod.distortionEnter(MAP.b5f, lx, ly, lz)
    expect(core.distortionFollowsGround()).toBe(true)
    core.setHeightCalc(false)
    expect(core.distortionFollowsGround()).toBe(false)
  })
})

describe.runIf(real)('§106 벽의 오르내림은 한 걸음이다', () => {
  it('B2F 서쪽 벽을 누른 채로 내려와 (30,226,22)에서 뛴다', () => {
    const [lx, ly, lz] = local(MAP.b2f, 30, 227, 22)
    world.grid = gridOf(MAP.b2f)
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    expect(mod.distortionKind()).toBe(PLATFORM_WEST_WALL)
    const p = worldState.player.position
    p.set(lx + 0.5, ly, lz + 0.5)
    // ↓ — 서쪽 벽에서는 y − 1이다
    worldState.input.move.set(0, 1)
    resetStepTile()
    stepSystem.fixedUpdate()
    expect(mod.distortionJumping()).toBe(false)
    const steps = useSaveStore.getState().records[0] ?? 0
    // 키를 **누른 채로** 한 칸 내려간다 — y만 바뀐다
    p.y = ly - 1
    stepSystem.fixedUpdate()
    expect(mod.distortionJumping(), '떠나는 칸 처리가 y 칸에서 안 돌았다').toBe(true)
    // 한 칸 = 한 걸음 (`Field_ProcessStep`)
    expect(useSaveStore.getState().records[0] ?? 0).toBe(steps + 1)
    for (let f = 0; f < 60 && mod.distortionJumping(); f++) mod.distortionJumpTick(1 / 60)
    world.grid = null
  })
})

describe.runIf(real)('§113 B6F의 B7F행 발판은 깃발 2423이 서야 나타난다', () => {
  it('깃발 전에는 숨고, 서면 62프레임에 걸쳐 나타난다', () => {
    let stones = false
    mod.distortionHooks.steppingStones = () => stones
    const [lx, ly, lz] = local(MAP.b6f, 87, 115, 67)
    mod.distortionEnter(MAP.b6f, lx, ly, lz)
    const place = mod.distortionPropPlaces(MAP.b6f).find((p) => p.steppingStones)!
    expect(place.elevator).toBe(1)
    expect(mod.distortionPropShown(place)).toBe(false)
    stones = true
    let frames = 0
    while (mod.distortionPropOpacity(place) < 1 && frames < 200) {
      mod.distortionPropTick(1 / 60)
      frames++
    }
    expect(frames).toBe(62)
    expect(mod.distortionPropShown(place)).toBe(true)
  })

  it('들어설 때 이미 깃발이 서 있으면 처음부터 다 보인다', () => {
    mod.distortionHooks.steppingStones = () => true
    const [lx, ly, lz] = local(MAP.b6f, 87, 115, 67)
    mod.distortionEnter(MAP.b6f, lx, ly, lz)
    const place = mod.distortionPropPlaces(MAP.b6f).find((p) => p.steppingStones)!
    expect(mod.distortionPropOpacity(place)).toBe(1)
  })
})

describe.runIf(real)('§114 스크립트 칸 앞의 막힌 칸을 밀어도 넘어간다', () => {
  it('기라티나 방 (15,1,25)에서 남쪽을 밀면 스크립트 4가 선다', () => {
    const started: number[] = []
    mod.distortionHooks.runScript = (id) => { started.push(id); return true }
    const [lx, ly, lz] = local(MAP.giratinaRoom, 15, 1, 25)
    mod.distortionEnter(MAP.giratinaRoom, lx, ly, lz)
    mod.distortionBumped(lx + 0.5, ly, lz + 0.5, 1)
    expect(started).toEqual([4])
  })
})

describe.runIf(real)('§107 판 위의 사람은 그 사람의 높이로 막고, 말은 세 축으로 건다', () => {
  it('B2F 서쪽 벽의 시로나(30,233,20) — 같은 높이만 막고, 앞 칸의 높이가 맞아야 말이 걸린다', async () => {
    const { VarStore } = await import('../engine/script/vars')
    const { solidNpcAtHeight } = await import('../engine/actor/obstacles')
    const { npcAt } = await import('../engine/script/field')
    const { npcActors } = await import('../engine/actor/npcs')
    const vars = new VarStore()
    // 제품은 층에 들어설 때 `spawnNpcs`가 배우를 비운다 — 여기서는 그 몫을 한다
    npcActors.list = []
    npcActors.byLocalID.clear()
    npcActors.mapId = MAP.b2f
    mod.distortionHooks.vars = () => vars
    mod.distortionHooks.progress = () => 4
    const [lx, ly, lz] = local(MAP.b2f, 30, 229, 20)
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    const [cx, cy, cz] = local(MAP.b2f, 30, 233, 20)
    expect(solidNpcAtHeight(cx + 0.5, cz + 0.5, cy)?.localID).toBe(128)
    // 같은 기둥의 딴 높이는 안 막는다
    expect(solidNpcAtHeight(cx + 0.5, cz + 0.5, cy - 2)).toBeNull()
    expect(npcAt(MAP.b2f, cx, cz, vars, cy)?.localID).toBe(128)
    expect(npcAt(MAP.b2f, cx, cz, vars, cy - 1)).toBeNull()
  })
})

describe.runIf(real)('§116 떨어진 바위는 떨어진 칸에 서고, 그 자리가 세이브에 남는다', () => {
  it('B5F (75,68)의 바위를 동쪽 구멍(76,68)에 밀면 B6F의 (76,68)에 선다 — 배치표 (75,68)이 아니다', async () => {
    const { VarStore } = await import('../engine/script/vars')
    const { npcActors } = await import('../engine/actor/npcs')
    const vars = new VarStore()
    npcActors.list = []
    npcActors.byLocalID.clear()
    mod.distortionHooks.vars = () => vars
    mod.distortionHooks.progress = () => 6
    mod.distortionRideTick(0)
    const [lx, ly, lz] = local(MAP.b5f, 74, 129, 68)
    mod.distortionEnter(MAP.b5f, lx, ly, lz)
    const rock = npcActors.byLocalID.get(128)!
    expect(rock).toBeDefined()
    expect(distortionBridge.dropBoulder!({ localID: 128, x: rock.x, z: rock.z }, { x: 1, z: 0 })).toBe(true)
    for (let f = 0; f < 200 && mod.distortionBoulderFalling(); f++) mod.distortionBoulderTick(1 / 60)
    expect(useSaveStore.getState().distortion.boulders).toEqual([{ map: MAP.b6f, localID: 128, x: 76, z: 68 }])
    // 한 층 내려가면(층 갈이) B6F가 지금 층이라 남는다
    npcActors.list = []
    npcActors.byLocalID.clear()
    core.beginFloorLoad()
    const [bx, by, bz] = local(MAP.b6f, 87, 115, 67)
    mod.distortionEnter(MAP.b6f, bx, by, bz)
    const fallen = npcActors.byLocalID.get(128)!
    expect([fallen.x, fallen.z]).toEqual([local(MAP.b6f, 76, 0, 68)[0], local(MAP.b6f, 76, 0, 68)[2]])
    // 워프로 세계에 다시 들어서면 버퍼와 함께 비워진다
    mod.resetDistortionPersisted()
    expect(useSaveStore.getState().distortion.boulders).toBeUndefined()
  })
})

describe.runIf(real)('§112 사건이 건 스크립트는 끝나야 다음으로 간다 · 기라티나 방 발판', () => {
  it('(15,1,24) 진행도 10 — 스크립트 7이 끝난 뒤에 첫 그림자가 지나간다', () => {
    let busy = true
    let progress = 10
    const started: number[] = []
    mod.distortionHooks.progress = () => progress
    mod.distortionHooks.setProgress = (v) => { progress = v }
    mod.distortionHooks.runScript = (id) => { started.push(id); return true }
    mod.distortionHooks.scriptRunning = () => busy
    const [lx, ly, lz] = local(MAP.giratinaRoom, 15, 1, 24)
    mod.distortionEnter(MAP.giratinaRoom, lx, ly, lz)
    mod.distortionStepped(lx + 0.5, ly, lz + 0.5, 0)
    expect(started).toEqual([7])
    for (let f = 0; f < 30; f++) mod.distortionEventTick(1 / 60)
    expect(mod.distortionShadowAt(), '말하는 동안 그림자가 지나간다').toBeNull()
    expect(progress).toBe(10)
    busy = false
    mod.distortionEventTick(1 / 60)
    expect(mod.distortionShadowAt()).not.toBeNull()
    for (let f = 0; f < 600 && mod.distortionEventRunning(); f++) {
      mod.distortionShadowTick(1 / 60)
      mod.distortionEventTick(1 / 60)
    }
    expect(progress).toBe(11)
  })

  it('발판이 설 때 카메라가 x 16눈금으로 기운다 (`sGiratinaRoomPlatformsShownCameraAngle`)', async () => {
    const g = await import('./distortionGiratina')
    const [lx, ly, lz] = local(MAP.giratinaRoom, 15, 1, 23)
    mod.distortionEnter(MAP.giratinaRoom, lx, ly, lz)
    g.startGhostRun(true)
    expect(useSaveStore.getState().distortion).toMatchObject({ cameraAngleX: 0x10, cameraAngleY: 0, cameraAngleZ: 0 })
    let frames = 0
    while (g.distortionGhostRunning() && frames < 1000) { g.distortionGhostTick(1 / 60); frames++ }
    // 첫 뜸 36 + 48 × 2 — 셋째 무리를 세운 프레임에 끝난다
    expect(frames).toBeGreaterThanOrEqual(36 + 96)
    g.startGhostRun(false)
    frames = 0
    while (g.distortionGhostRunning() && frames < 1000) { g.distortionGhostTick(1 / 60); frames++ }
    // 첫 뜸 16 + 48 × 3 + 마지막 뜸 8
    expect(frames).toBeGreaterThanOrEqual(16 + 144 + 8)
  })
})
