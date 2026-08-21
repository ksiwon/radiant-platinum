// 손잡이가 **제 장치로 가는가** (PARITY §7.12)
//
// ⚠️ **여기가 통째로 비어 있었다.** `fieldServices`의 `mapFeatures`는 스크립트
// 명령과 체육관 여섯을 잇는 배선판인데, 이 파일이 생기기 전에는 저장소의 어떤
// 시험도 `mapFeatures`를 건드리지 않았다. 그래서 배선을 두 줄 맞바꿔 놓아도
// 체육관 시험 109개가 전부 초록이었다.
//
// ⚠️ **그 사고가 이미 한 번 났다.** 들판시티(맵 122)와 물가시티(맵 154~156)의
// 이름이 파일 열둘에서 서로 뒤바뀐 채로 있었다. 이름만 틀린 것이었으니 망정이지
// 오른쪽이 바뀌었으면 아무 시험도 안 걸렸다.
//
// 재는 법: 손잡이를 부르고 **어느 장치가 살아났는지**를 본다
// (`PersistedMapFeatures_GetID`). 원작이 한 번에 하나만 살리므로 이 값이
// 곧 「방금 켠 것이 무엇인가」다.
//
// ⚠️ **여기서 안 보는 것** — 장치의 알맹이(표·물리·프레임)는 각자의
// `scene/*Gym.test.ts`가 본다. 여기는 **배선만** 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { world as mapWorld, type MapHeader } from '../engine/map/world'
import { fieldScripts } from '../engine/script/field'
import { clearMapFeature, MAP_FEATURE, mapFeature } from '../engine/world/mapFeatures'
import { CANALAVE_GYM_MAP, CANALAVE_PLATFORMS } from '../engine/world/canalaveGym'
import { ETERNA_GYM_MAP } from '../engine/world/eternaGym'
import { PASTORIA_BUTTON_MODEL, PASTORIA_GYM_MAP, PASTORIA_PLATE_BOX } from '../engine/world/pastoriaGym'
import { SUNYSHORE_GYM_MAPS } from '../engine/world/sunyshoreGym'
import { VEILSTONE_BAGS, VEILSTONE_GYM_MAP } from '../engine/world/veilstoneGym'
import { HEARTHOME_TRAINER_ROOMS } from '../engine/world/hearthomeGym'
import { worldState } from '../state/worldState'
import { activeZone } from '../engine/map/zone'
import { canalavePlatformTile, resetCanalaveGym } from './canalaveGym'
import { resetEternaGym } from './eternaGym'
import { hearthomePuzzle, resetHearthomeGym } from './hearthomeGym'
import { resetPastoriaGym } from './pastoriaGym'
import { resetSunyshoreGym, sunyshoreState } from './sunyshoreGym'
import { resetVeilstoneGym } from './veilstoneGym'
import { installFieldServices } from './fieldServices'
import { installNodeAssets, withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('maps.json', 'matrices/interiors.bin')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/** 지금 붙어 있는 손잡이 한 벌. 안 붙어 있으면 그 자리에서 세운다 */
function handles(): NonNullable<typeof fieldScripts.services.mapFeatures> {
  const at = fieldScripts.services.mapFeatures
  expect(at, '`mapFeatures`가 안 붙었다').toBeDefined()
  return at!
}

describe('배선판', () => {
  let stop: () => void
  let unassets: () => void

  beforeAll(() => {
    unassets = installNodeAssets()
    stop = installFieldServices()
  })
  afterAll(() => { stop(); unassets() })

  it('선언한 손잡이가 하나도 안 빈다', () => {
    // ⚠️ 명령 쪽이 전부 `?.`로 부르므로 **빠진 손잡이는 조용히 지나간다.**
    // 인터페이스에 적어 놓고 안 잇는 것이 그래서 안 걸린다
    const want = [
      'initPlatformLift', 'triggerPlatformLift', 'platformLiftBusy',
      'platformLiftNotUsedWhenEnteredMap',
      'initPastoriaGym', 'pressPastoriaButton', 'pastoriaBusy',
      'initSunyshoreGym', 'pressSunyshoreButton', 'sunyshoreBusy',
      'initEternaGym', 'advanceEternaClock', 'eternaBusy',
      'initCanalaveGym', 'stepOnFeature',
      'initVeilstoneGym', 'kickBag',
      'initHearthomeGym',
    ]
    const at = handles() as unknown as Record<string, unknown>
    for (const key of want) expect(typeof at[key], key).toBe('function')
  })
})

maybe('손잡이가 제 장치를 켠다', () => {
  let stop: () => void
  let unassets: () => void
  const grids = new Map<number, MapGrid>()
  let maps: MapHeader[]

  beforeAll(() => {
    unassets = installNodeAssets()
    stop = installFieldServices()
    maps = read('maps.json').maps as MapHeader[]
    mapWorld.maps = maps

    const idx = read('matrices/interiors.json') as {
      matrices: Record<string, MatrixMeta & { byteOffset: number }>
    }
    const blob = detach('matrices/interiors.bin')
    for (const [id, meta] of Object.entries(idx.matrices)) {
      const count = meta.tileWidth * meta.tileHeight
      grids.set(Number(id), new MapGrid(meta, new Uint16Array(blob, meta.byteOffset, count)))
    }
  })
  afterAll(() => { stop(); unassets() })

  afterEach(() => {
    clearMapFeature()
    resetCanalaveGym(); resetEternaGym(); resetHearthomeGym()
    resetPastoriaGym(); resetSunyshoreGym(); resetVeilstoneGym()
    mapWorld.grid = null
    activeZone.grid = null
  })

  /** 그 맵에 선 것으로 친다 — 격자까지 같이 놓아야 장치가 제대로 선다 */
  function stand(map: number): void {
    mapWorld.mapId = map
    mapWorld.enteredZ = 0
    const grid = grids.get(maps[map]!.matrix) ?? null
    mapWorld.grid = grid
    activeZone.grid = grid
  }

  it.each([
    ['영원 꽃시계', ETERNA_GYM_MAP, MAP_FEATURE.eternaGym,
      (h: ReturnType<typeof handles>) => { h.initEternaGym(0) }],
    ['장막 샌드백', VEILSTONE_GYM_MAP, MAP_FEATURE.veilstoneGym,
      (h: ReturnType<typeof handles>) => { h.initVeilstoneGym() }],
    ['들판 물바닥', PASTORIA_GYM_MAP, MAP_FEATURE.pastoriaGym,
      (h: ReturnType<typeof handles>) => { h.initPastoriaGym() }],
    ['운하 뜨는 판', CANALAVE_GYM_MAP, MAP_FEATURE.canalaveGym,
      (h: ReturnType<typeof handles>) => { h.initCanalaveGym() }],
    ['물가 톱니', SUNYSHORE_GYM_MAPS[0]!, MAP_FEATURE.sunyshoreGym,
      (h: ReturnType<typeof handles>) => { h.initSunyshoreGym(0) }],
  ] as const)('%s', (_label, map, feature, run) => {
    stand(map)
    run(handles())
    // 손잡이가 옆 장치로 가 있으면 그 장치는 이 맵을 제 맵으로 안 보고 그냥
    // 돌아가므로, 살아난 갈래가 `none`이 된다
    expect(mapFeature()).toBe(feature)
  })

  it('연고 문 고르기', () => {
    // ⚠️ 연고만 갈래를 **맵과 상관없이** 세운다 (원작이 그렇다) — 그래서
    // `mapFeature()`로는 배선이 맞는지 못 가른다. 답이 뽑혔는가로 본다
    stand(HEARTHOME_TRAINER_ROOMS[0]!)
    handles().initHearthomeGym()
    expect(mapFeature()).toBe(MAP_FEATURE.hearthomeGym)
    expect(hearthomePuzzle(), '문 방인데 답이 안 뽑혔다').not.toBeNull()
  })

  it('⚠️ 남의 맵에서는 안 켜진다', () => {
    // 이게 없으면 위의 다섯은 「어느 손잡이나 다 켠다」와 구별이 안 된다.
    // ⚠️ 물가는 여기 안 든다 — 그 손잡이만 **선 맵이 아니라 스크립트가 준
    // 방 번호**로 맵을 고른다(`SUNYSHORE_GYM_MAPS[room]`). 그래서 어디에
    // 서 있든 켜지는 것이 맞다
    stand(ETERNA_GYM_MAP)
    handles().initCanalaveGym()
    expect(mapFeature()).toBe(MAP_FEATURE.none)
    handles().initPastoriaGym()
    expect(mapFeature()).toBe(MAP_FEATURE.none)
    handles().initVeilstoneGym()
    expect(mapFeature()).toBe(MAP_FEATURE.none)
  })

  it('⚠️ 물가는 방 번호가 맵을 고른다', () => {
    // 손잡이가 번호를 그대로 흘리면 방 셋이 다 0번 방으로 선다 — 톱니 수도
    // 회전 상태도 방마다 다르므로 그 방에서 수수께끼가 안 풀린다.
    // 방마다 처음 상태가 달라서 그 값으로 가른다
    const seen = new Set<number>()
    for (let room = 0; room < SUNYSHORE_GYM_MAPS.length; room++) {
      resetSunyshoreGym()
      stand(SUNYSHORE_GYM_MAPS[room]!)
      handles().initSunyshoreGym(room)
      expect(mapFeature(), `${String(room)}번 방`).toBe(MAP_FEATURE.sunyshoreGym)
      seen.add(sunyshoreState() ?? -1)
    }
    expect(seen.has(-1), '어느 방이 안 섰다').toBe(false)
  })
})

maybe('밟고 누르는 손잡이도 제 장치로 간다', () => {
  let stop: () => void
  let unassets: () => void
  const grids = new Map<number, MapGrid>()
  let maps: MapHeader[]

  beforeAll(() => {
    unassets = installNodeAssets()
    stop = installFieldServices()
    maps = read('maps.json').maps as MapHeader[]
    mapWorld.maps = maps
    const idx = read('matrices/interiors.json') as {
      matrices: Record<string, MatrixMeta & { byteOffset: number }>
    }
    const blob = detach('matrices/interiors.bin')
    for (const [id, meta] of Object.entries(idx.matrices)) {
      const count = meta.tileWidth * meta.tileHeight
      grids.set(Number(id), new MapGrid(meta, new Uint16Array(blob, meta.byteOffset, count)))
    }
  })
  afterAll(() => { stop(); unassets() })

  afterEach(() => {
    clearMapFeature()
    resetCanalaveGym(); resetEternaGym(); resetPastoriaGym()
    resetSunyshoreGym(); resetVeilstoneGym()
    mapWorld.grid = null
    activeZone.grid = null
  })

  function stand(map: number): void {
    mapWorld.mapId = map
    mapWorld.enteredZ = 0
    const grid = grids.get(maps[map]!.matrix) ?? null
    mapWorld.grid = grid
    activeZone.grid = grid
  }

  it('영원 — 시계를 한 칸 넘긴다', () => {
    stand(ETERNA_GYM_MAP)
    handles().initEternaGym(0)
    expect(handles().advanceEternaClock()).toBe(1)
    expect(handles().eternaBusy()).toBe(true)
  })

  it('물가 — 톱니를 돌린다', () => {
    stand(SUNYSHORE_GYM_MAPS[0]!)
    handles().initSunyshoreGym(0)
    expect(handles().pressSunyshoreButton(0)).toBe(true)
    expect(handles().sunyshoreBusy()).toBe(true)
  })

  it('장막 — 앞 칸의 샌드백만 찬다', () => {
    stand(VEILSTONE_GYM_MAP)
    handles().initVeilstoneGym()
    const [x, z] = VEILSTONE_BAGS[0]!
    // 북쪽. 어느 쪽이든 샌드백이 있으면 참이다
    expect(handles().kickBag?.(x, z, 0)).toBe(true)
    // 샌드백이 없는 칸은 거짓 — 말 걸기로 내려가야 하는 자리다
    expect(handles().kickBag?.(0, 0, 0)).toBe(false)
  })

  it('운하 — 판 위에서 한 걸음 밟으면 판이 움직인다', () => {
    stand(CANALAVE_GYM_MAP)
    handles().initCanalaveGym()
    const index = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'y')
    const before = [...canalavePlatformTile(index)!]
    worldState.player.position.set(before[0]! + 0.5, before[1]!, before[2]! + 0.5)
    handles().stepOnFeature?.()
    expect(canalavePlatformTile(index), '판이 안 움직였다').not.toEqual(before)
  })

  it('들판 — 밟은 칸의 단추를 누른다', () => {
    stand(PASTORIA_GYM_MAP)
    handles().initPastoriaGym()
    // ⚠️ 손잡이는 좌표를 안 받는다 — **선 칸의 소품 번호**를 스스로 읽는다
    // (`propModelUnderPlayer`). 그래서 파란 단추 칸을 격자에서 찾아 그 위에 선다
    const grid = mapWorld.grid!
    const box = PASTORIA_PLATE_BOX
    let at: [number, number] | null = null
    for (let z = box.startTileZ; z < box.startTileZ + box.sizeZ && at === null; z++) {
      for (let x = box.startTileX; x < box.startTileX + box.sizeX; x++) {
        if (grid.propModelAt(x, z) === PASTORIA_BUTTON_MODEL.blue) { at = [x, z]; break }
      }
    }
    expect(at, '파란 단추 칸을 격자에서 못 찾았다').not.toBeNull()

    worldState.player.position.set(at![0] + 0.5, 0, at![1] + 0.5)
    expect(handles().pressPastoriaButton(), '단추 위에 섰는데 안 눌렸다').toBe(true)
    expect(handles().pastoriaBusy()).toBe(true)

    // 단추가 없는 칸에서는 안 눌린다
    worldState.player.position.set(0.5, 0, 0.5)
    expect(handles().pressPastoriaButton()).toBe(false)
  })
})
