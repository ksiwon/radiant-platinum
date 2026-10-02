// 필드 태스크가 쥔 동안은 필드가 새 스크립트를 안 건다 (`FieldServices.taskUp`)
//
// 원작은 태스크가 도는 동안 필드 입력을 안 받는다 (`field_system.c` 236줄 · `FieldSystem_IsRunningTask`).
// 전멸 과제(`FieldTask_BlackOutFromBattle`)가 그 태스크라, 깨어난 자리의 스크립트(2020)가 도착한 맵의
// `OnFrame`보다 먼저 돈다. 실측으로 시작의 방에서 져 집 1층에 닿자 엄마의 `OnFrame`(스크립트 2)이
// 검은 줄보다 먼저 떴다 (`.audit/probe/originLoss.mjs`).
//
// ⚠️ **롬 글은 안 적는다.** 번호와 변수만 다룬다 (COPYRIGHT.md §6).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import type { EventFile, MapHeader } from '../map/world'
import { world as mapWorld } from '../map/world'
import { worldState } from '../../state/worldState'
import { buildCommands } from './commands'
import { parseScriptMeta } from './data'
import { abortScript, enterMap, fieldScripts, makeWorld, scriptBusy, scriptSystem } from './field'
import { VarStore } from './vars'
import { installNodeAssets, withData } from '../../data/romData.testkit'
import { allDoneServices } from './services.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'scripts.json', 'events.json', 'maps.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 떡잎마을 주인공 집 1층 — 기본 부활 자리. `VAR_PLAYER_HOUSE_STATE`가 0이면 `OnFrame` 스크립트 2가 걸린다 */
const PLAYER_HOUSE_1F = 414
const ON_FRAME_RIVAL_LEFT = 2

maybe('필드 태스크가 필드를 쥘 때', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events
  let held = false

  let restoreAssets: (() => void) | null = null
  beforeAll(() => { restoreAssets = installNodeAssets() })
  afterAll(() => { restoreAssets?.() })

  beforeEach(async () => {
    held = false
    mapWorld.maps = maps
    mapWorld.events = events
    mapWorld.pending = null
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.varsReady = true
    fieldScripts.services = { ...allDoneServices, taskUp: () => held }
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
    mapWorld.mapId = PLAYER_HOUSE_1F
    enterMap(PLAYER_HOUSE_1F)
    // 맵 뱅크가 올 때까지 — 그전에는 맵 뱅크를 읽는 스크립트가 안 걸린다 (`start`의 `mapBankPending`)
    for (let i = 0; i < 5; i++) await new Promise((done) => { setImmediate(done) })
  })

  afterEach(() => {
    abortScript()
    worldState.input.move.set(0, 0)
  })

  it('쥔 동안은 `OnFrame`이 안 걸리고 발이 묶인다 — 놓으면 그때 걸린다', () => {
    held = true
    worldState.input.move.set(0, 1)
    for (let i = 0; i < 30; i++) scriptSystem.fixedUpdate()
    expect(scriptBusy(), '태스크가 쥔 동안 맵 스크립트가 걸렸다').toBe(false)
    expect(worldState.input.move.length(), '태스크가 쥔 동안 발이 안 묶였다').toBe(0)

    held = false
    scriptSystem.fixedUpdate()
    expect(scriptBusy()).toBe(true)
    expect(fieldScripts.world?.scriptID).toBe(ON_FRAME_RIVAL_LEFT)
  })
})
