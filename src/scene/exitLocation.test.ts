// 출구 자리(`save.exit`)가 원작이 쓰는 자리에서 옮겨진다
//
//  · 전멸 — `Location_InitFly(warpId, GetExitLocation())` (`unk_020528D0.c:214`)가 출구를 부활 마을의 날기 칸으로 덮는다
//  · `ScrCmd_2B5` — 출구를 맵·칸으로 쓴다, 방향 남쪽 (`scrcmd.c:6494`). 송별의 샘 · 운하시티 항구 여관 스크립트가 부른다
//  · `ClearGame`은 출구를 **읽기만** 한다 (`SetPlayerFirstRespawnLocation(exit)`, `clear_game.c:185·200`) — 쓰지 않는다
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { fieldScripts, makeWorld } from '../engine/script/field'
import { buildCommands } from '../engine/script/commands'
import { parseScriptMeta } from '../engine/script/data'
import { VarStore } from '../engine/script/vars'
import { spawnTable, type SpawnPoint } from '../engine/map/spawns'
import { world as mapWorld, type EventFile, type MapHeader } from '../engine/map/world'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { installFieldServices } from './fieldServices'
import { blackOut, resetBlackOut } from './pokecenter'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const maybe = withData('scripts.bin', 'events.json', 'maps.json', 'spawns.json')

/** `MAP_HEADER_UNKNOWN_266` · `MAP_HEADER_CANALAVE_CITY` · `MAP_HEADER_TWINLEAF_TOWN` */
const SPRING_EXIT_MAP = 266
const CANALAVE_CITY = 33
const TWINLEAF_TOWN = 411

maybe('출구 자리', () => {
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
    mapWorld.pending = null
    spawnTable.list = (read('spawns.json') as { spawns: SpawnPoint[] }).spawns
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    stop = installFieldServices('ko')
    for (let i = 0; i < 3; i++) await new Promise((done) => { setImmediate(done) })
  })
  afterEach(() => {
    resetBlackOut()
    stop?.()
    mapWorld.pending = null
  })

  it('`ScrCmd_2B5`는 출구를 맵과 칸 가운데로 쓴다 (남쪽을 본다)', () => {
    fieldScripts.services.setExit?.(SPRING_EXIT_MAP, 762, 714)
    expect(useSaveStore.getState().exit).toEqual({
      map: SPRING_EXIT_MAP, matrix: mapWorld.maps?.[SPRING_EXIT_MAP]?.matrix ?? 0, x: 762.5, z: 714.5, facing: 0,
    })
    fieldScripts.services.setExit?.(CANALAVE_CITY, 58, 714)
    expect(useSaveStore.getState().exit).toMatchObject({ map: CANALAVE_CITY, x: 58.5, z: 714.5 })
  })

  it('전멸하면 맵을 다 간 뒤에 출구가 부활 마을의 날기 칸이 된다', async () => {
    // 이전 굴 입구가 남아 있다 — 덮여야 한다
    useSaveStore.setState({ exit: { map: 300, matrix: 0, x: 10.5, z: 10.5, facing: 0 }, healSpot: 0 })
    blackOut()
    // 씬이 워프를 받아 맵을 갈았다고 친다 — 과제가 `pending`이 비기를 기다린다
    mapWorld.pending = null
    const till = Date.now() + 5000
    while (useSaveStore.getState().exit?.map === 300 && Date.now() < till) {
      await new Promise((done) => { setTimeout(done, 20) })
    }
    const fly = spawnTable.list[0]!.fly
    expect(useSaveStore.getState().exit).toEqual({
      map: TWINLEAF_TOWN, matrix: mapWorld.maps![TWINLEAF_TOWN]!.matrix, x: fly.x + 0.5, z: fly.z + 0.5, facing: 0,
    })
  })
})
