// 맵에 들어서면 `OnLoad` 다음에 **`OnResume`이 돈다** (REPAIR §117 · `overlay005/fieldmap.c` 205·224)
//
// 원작은 필드를 세울 때마다 둘을 차례로 돈다 — 레이아웃을 올리고 `ON_LOAD`, 다 그린 뒤 `ON_RESUME`.
// 서른여섯 맵이 `OnResume`을 쓰는데 우리는 한 번도 안 돌렸다. 재는 자리는 206번도로다: 자전거로드
// 위(`FLAG_ON_CYCLING_ROAD`)에서 들어서면 `Route206_ForceBicycling`이 자전거에 묶는다(`ForceBicycling TRUE`) —
// 안 돌면 이어하기·배틀 뒤에 자전거로드 한복판에서 내릴 수 있었다.
//
// ⚠️ **롬 글은 안 적는다.** 번호와 플래그뿐이다 (COPYRIGHT.md §6).
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildCommands } from '../engine/script/commands'
import { parseScriptMeta } from '../engine/script/data'
import { abortScript, enterMap, fieldScripts, makeWorld, reloadFieldMap } from '../engine/script/field'
import { VarStore } from '../engine/script/vars'
import { world as mapWorld, type EventFile, type MapHeader } from '../engine/map/world'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { installFieldServices } from './fieldServices'
import { isOnCyclingRoad, setOnCyclingRoad } from '../engine/actor/bike'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const maybe = withData('scripts.bin', 'events.json', 'maps.json')

/** `MAP_HEADER_ROUTE_206` (`generated/map_headers.txt` 351줄 − 1) */
const ROUTE_206 = 350
/** `FLAG_ON_CYCLING_ROAD` */
const FLAG_ON_CYCLING_ROAD = 2452

maybe('OnResume', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  let restoreAssets: (() => void) | null = null
  let stop: (() => void) | null = null
  beforeAll(() => { restoreAssets = installNodeAssets() })
  afterAll(() => { restoreAssets?.() })

  beforeEach(async () => {
    useSaveStore.setState(createNewSave())
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = ROUTE_206
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    setOnCyclingRoad(false)
    stop = installFieldServices('ko')
    for (let i = 0; i < 3; i++) await new Promise((done) => { setImmediate(done) })
  })
  afterEach(() => {
    abortScript()
    stop?.()
    setOnCyclingRoad(false)
    mapWorld.mapId = -1
  })

  describe('206번도로 — 자전거로드 위에서 들어서면 자전거에 묶인다', () => {
    it('맵에 들어설 때 돈다', () => {
      fieldScripts.vars.setFlag(FLAG_ON_CYCLING_ROAD)
      enterMap(ROUTE_206)
      expect(isOnCyclingRoad()).toBe(true)
    })

    it('자전거로드 밖이면 안 묶는다', () => {
      enterMap(ROUTE_206)
      expect(isOnCyclingRoad()).toBe(false)
    })

    it('배틀 뒤에 필드를 다시 세울 때도 돈다', () => {
      fieldScripts.vars.setFlag(FLAG_ON_CYCLING_ROAD)
      setOnCyclingRoad(false)
      reloadFieldMap()
      expect(isOnCyclingRoad()).toBe(true)
    })
  })
})

// REPAIR §125 — 괴력 표식은 맵을 옮기면 풀린다 (`FieldSystem_InitFlagsOnMapChange`)
describe('괴력 표식', () => {
  it('맵에 들어서면 `FLAG_STRENGTH_ACTIVE`(2402)가 풀린다', () => {
    fieldScripts.vars = new VarStore()
    fieldScripts.vars.setFlag(2402)
    enterMap(350)
    expect(fieldScripts.vars.checkFlag(2402)).toBe(false)
  })
})

// REPAIR §126 — 맵 지역 표식·변수는 맵을 옮길 때마다 비운다 (`FieldSystem_ClearLocalFlags`)
describe('맵 지역 표식', () => {
  it('들어설 때 0~63번 표식과 16384~16415 변수가 비워지고, 그 밖은 남는다', () => {
    fieldScripts.vars = new VarStore()
    const v = fieldScripts.vars
    // FLAG_MAP_LOCAL_HIDE_OBSTACLE_2 = 33 — 천관산 2F 괴력 바위의 숨김 표식
    v.setFlag(33); v.setFlag(63); v.setFlag(64)
    v.set(16384, 7); v.set(16415, 9); v.set(16416, 5)
    enterMap(350)
    expect(v.checkFlag(33)).toBe(false)
    expect(v.checkFlag(63)).toBe(false)
    expect(v.checkFlag(64)).toBe(true)
    expect(v.get(16384)).toBe(0)
    expect(v.get(16415)).toBe(0)
    expect(v.get(16416)).toBe(5)
  })
})
