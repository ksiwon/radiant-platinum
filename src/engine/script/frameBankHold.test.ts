// 맵이 스스로 거는 장면(`OnFrame`)이 아직 안 걸린 동안 발이 묶인다 (`field.ts`의 `holdForFrameScene`)
//
// 원작은 들어선 첫 프레임에 `OnFrame` 표를 입력보다 먼저 본다(`FieldInput_Process`). 우리는 맵 글이 fetch로 오기 전에는
// 장면을 안 건다 — 그 틈에 발이 풀려 있으면 주인공이 먼저 걸어가고 장면의 걸음이 엉뚱한 자리에서 시작한다
// (최종 연쇄 8936cf39 칸 1: 모래시티 `OnFrame_ExitLab`이 15칸 늦게 걸려 주인공을 마을 밖 막힌 칸에 세웠다).
//
// ⚠️ **롬 글은 안 적는다.** 번호와 변수만 다룬다 (COPYRIGHT.md §6).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import type { EventFile, MapHeader } from '../map/world'
import { world as mapWorld } from '../map/world'
import { worldState } from '../../state/worldState'
import { buildCommands } from './commands'
import { parseScriptMeta } from './data'
import { abortScript, enterMap, fieldScripts, initScriptsOf, makeWorld, scriptBusy, scriptSystem } from './field'
import { VarStore } from './vars'
import { installNodeAssets, withData } from '../../data/romData.testkit'
import { allDoneServices } from './services.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'scripts.json', 'events.json', 'maps.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 떡잎마을 주인공 집 1층 — 기본 부활 자리. `VAR_PLAYER_HOUSE_STATE`가 0이면 `OnFrame` 스크립트 2가 걸린다 */
const PLAYER_HOUSE_1F = 414
const ON_FRAME_RIVAL_LEFT = 2

maybe('맵 글을 기다리는 장면', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events

  let restoreAssets: (() => void) | null = null
  beforeAll(() => { restoreAssets = installNodeAssets() })
  afterAll(() => { restoreAssets?.() })

  beforeEach(() => {
    mapWorld.maps = maps
    mapWorld.events = events
    mapWorld.pending = null
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.varsReady = true
    fieldScripts.services = { ...allDoneServices }
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })

  afterEach(() => {
    abortScript()
    worldState.input.move.set(0, 0)
  })

  it('글이 오기 전에는 장면도 안 걸리고 발도 묶인다 — 글이 오면 그 자리에서 장면이 걸린다', async () => {
    // 다른 맵 글을 쥔 채로 집 1층에 들어선다 — 이 맵의 글은 아직 오는 중이다
    mapWorld.mapId = PLAYER_HOUSE_1F
    enterMap(PLAYER_HOUSE_1F)
    worldState.input.move.set(0, 1)
    scriptSystem.fixedUpdate()
    expect(scriptBusy(), '글이 오기 전에 장면이 걸렸다').toBe(false)
    expect(worldState.input.move.length(), '장면이 글을 기다리는 동안 발이 안 묶였다').toBe(0)

    for (let i = 0; i < 5; i++) await new Promise((done) => { setImmediate(done) })
    scriptSystem.fixedUpdate()
    expect(scriptBusy()).toBe(true)
    expect(fieldScripts.world?.scriptID).toBe(ON_FRAME_RIVAL_LEFT)
  })

  it('글이 아닌 까닭(배틀 화면)으로 미뤄도 발이 묶이고, 10초(600스텝)가 지나면 풀린다', async () => {
    let battle = true
    fieldScripts.services = { ...allDoneServices, battleUp: () => battle }
    mapWorld.mapId = PLAYER_HOUSE_1F
    enterMap(PLAYER_HOUSE_1F)
    for (let i = 0; i < 5; i++) await new Promise((done) => { setImmediate(done) })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (let i = 0; i < 600; i++) {
      worldState.input.move.set(0, 1)
      scriptSystem.fixedUpdate()
      expect(worldState.input.move.length(), `${String(i)}번째 스텝에 발이 풀렸다`).toBe(0)
    }
    worldState.input.move.set(0, 1)
    scriptSystem.fixedUpdate()
    expect(worldState.input.move.length(), '한도가 지나도 묶였다').toBe(1)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
    // 배틀이 내려가면 그때 장면이 걸린다
    battle = false
    scriptSystem.fixedUpdate()
    expect(scriptBusy()).toBe(true)
  })

  it('걸릴 장면이 없으면 글을 기다리는 동안에도 걷는다', () => {
    // 표의 변수를 이미 지난 값으로 — 집 1층 `OnFrame` 표가 아무것도 안 고른다
    for (const row of initScriptsOf(PLAYER_HOUSE_1F)!.frame) fieldScripts.vars.set(row.left, 99)
    mapWorld.mapId = PLAYER_HOUSE_1F
    enterMap(PLAYER_HOUSE_1F)
    worldState.input.move.set(0, 1)
    scriptSystem.fixedUpdate()
    expect(scriptBusy()).toBe(false)
    expect(worldState.input.move.length()).toBe(1)
  })
})
