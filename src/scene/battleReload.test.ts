// 배틀에서 돌아오면 **맵의 `OnLoad`가 다시 돈다** — 그리고 「이겼나」는 「지지 않았나」다
// (REPAIR §88 · §89)
//
// 원작 `FieldTask_Encounter`는 지지 않은 판이면 `FieldTransition_StartMap`으로 필드를 다시 세우고,
// 그 `FieldMap_Init`이 `INIT_SCRIPT_ON_LOAD`를 돈다(`overlay005/fieldmap.c` 205). 전설 스크립트가 모두
// 이것에 기댄다: 배틀 앞에 `FLAG_MAP_LOCAL_REMOVE_OBJECT`를 세우고, `OnLoad`가 그 표식을 보고 그
// 포켓몬을 치운다. 깨어진 세계의 기라티나 방은 **진행도 14도 거기서만** 세운다.
//
// 배틀 자체는 가짜다 — 재는 것은 필드 쪽이다. `startWild`를 갈아 끼워 결과 다섯(이김 · 잡음 · 달아남 ·
// 상대가 달아남 · 짐)을 차례로 넣고, **롬 스크립트 바이트코드를 그대로** 돌려서 플래그·진행도·물체를 본다.
//
// ⚠️ **롬 글은 안 적는다.** 여기서 다루는 것은 번호와 플래그뿐이다 (COPYRIGHT.md §6).
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildCommands } from '../engine/script/commands'
import { parseScriptMeta } from '../engine/script/data'
import {
  abortScript, enterMap, fieldScripts, makeWorld, npcAt, scriptBusy, scriptSystem, signAt, start,
} from '../engine/script/field'
import { VarStore } from '../engine/script/vars'
import { mapById, npcsOf, world as mapWorld } from '../engine/map/world'
import type { EventFile, MapHeader } from '../engine/map/world'
import { spawnTable, type SpawnPoint } from '../engine/map/spawns'
import { npcActors } from '../engine/actor/npcs'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { useBattleStore } from '../state/battleStore'
import type { BattleFinish } from '../engine/battle/sim/controller'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'
import { installFieldServices } from './fieldServices'
import { cutInSystem, resetCutIn } from './encounterCutIn'
import { distortionHooks, distortionPreload } from './distortionCore'
import { distortionEnter, distortionLeave } from './distortion'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const maybe = withData('scripts.bin', 'events.json', 'maps.json', 'spawns.json', 'distortion.json')

/** `FLAG_MAP_LOCAL_REMOVE_OBJECT` */
const FLAG_REMOVE_OBJECT = 142
/** `FLAG_CAUGHT_GIRATINA` */
const FLAG_CAUGHT_GIRATINA = 289
/** `FLAG_HIDE_TURNBACK_CAVE_GIRATINA_ROOM_GIRATINA` */
const FLAG_HIDE_TURNBACK_GIRATINA = 592
/** `VAR_DISTORTION_WORLD_PROGRESS` */
const VAR_DW_PROGRESS = 16469
/** `DIST_WORLD_PROGRESS_GIRATINA_ARRIVED` · `_BATTLED_GIRATINA` */
const PROGRESS_ARRIVED = 13
const PROGRESS_BATTLED = 14

/** 귀혼동굴 기라티나 방 (`MAP_HEADER_TURNBACK_CAVE_GIRATINA_ROOM`) */
const TURNBACK_ROOM = 270
/** 깨어진 세계 기라티나 방 */
const DW_GIRATINA_ROOM = 582
/** 깨어진 세계 기라티나 방의 물체 번호 (`DIST_WORLD_MAP_OBJECT_GIRATINA_ROOM_*`) */
const DW_GIRATINA = 128
const DW_PORTAL = 131
const DW_CYNTHIA_MESSAGE = 132

const FRAME_CAP = 20_000

maybe('배틀 뒤의 필드 다시 세우기', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events

  let restoreAssets: (() => void) | null = null
  beforeAll(() => { restoreAssets = installNodeAssets() })
  afterAll(() => { restoreAssets?.() })

  let stopServices: (() => void) | null = null
  const realStartWild = useBattleStore.getState().startWild
  /** 가짜 배틀이 낼 결과. 판마다 갈아 끼운다 */
  let outcome: Exclude<BattleFinish, null> = 'win'
  /** 가짜 배틀이 몇 번 열렸나 — 0이면 시험이 아무것도 안 쟀다 */
  let battles = 0

  beforeEach(async () => {
    useBattleStore.getState().close()
    useSaveStore.setState(createNewSave())
    mapWorld.maps = maps
    mapWorld.events = events
    mapWorld.pending = null
    spawnTable.list = (read('spawns.json') as { spawns: SpawnPoint[] }).spawns
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false
    battles = 0

    // 배틀 화면이 여는 판 한 번을 그대로 흉내 낸다: 결과가 서고(`outcome`) → 화면이 닫힌다(`phase: 'off'`)
    useBattleStore.setState({
      startWild: () => {
        battles++
        useBattleStore.setState({ phase: 'running', outcome: null })
        useBattleStore.setState({ phase: 'over', outcome })
        useBattleStore.setState({ phase: 'off', outcome: null })
        return Promise.resolve()
      },
    })

    stopServices = installFieldServices('ko')
    for (let i = 0; i < 3; i++) await new Promise((done) => { setImmediate(done) })
  })

  afterEach(() => {
    abortScript()
    stopServices?.()
    stopServices = null
    resetCutIn()
    useBattleStore.setState({ startWild: realStartWild })
    useBattleStore.getState().close()
    mapWorld.pending = null
    distortionLeave()
  })

  /**
   * 맵의 대사 뱅크가 올 때까지. ⚠️ 뱅크가 오기 전에는 필드가 스크립트를 안 건다
   * (`enterMap`의 `mapBankPending`) — 안 기다리면 처음 가는 맵의 첫 시험만 떨어진다
   */
  async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await new Promise((done) => { setTimeout(done, 0) })
  }

  /** 스크립트가 끝날 때까지 돌린다. 대사는 A로 넘긴다 */
  async function runToEnd(): Promise<number> {
    let frames = 0
    for (; frames < FRAME_CAP && scriptBusy(); frames++) {
      worldState.input.interact = frames % 2 === 0
      scriptSystem.fixedUpdate()
      cutInSystem.fixedUpdate()
      if (frames % 50 === 0) await new Promise((done) => { setTimeout(done, 0) })
    }
    worldState.input.interact = false
    return frames
  }

  describe('귀혼동굴 기라티나 방 — `CheckWonBattle`과 `OnLoad`', () => {
    /** 기라티나(0번)에게 말을 건다 */
    async function battleTurnback(result: Exclude<BattleFinish, null>): Promise<void> {
      outcome = result
      const header = mapById(TURNBACK_ROOM)!
      mapWorld.mapId = TURNBACK_ROOM
      enterMap(TURNBACK_ROOM)
      await settle()
      expect(npcActors.byLocalID.has(0), '들어서면 기라티나가 서 있어야 한다').toBe(true)
      const giratina = npcsOf(TURNBACK_ROOM).find((n) => n.localID === 0)!
      worldState.player.position.set(giratina.x + 0.5, 0, giratina.z + 1.5)
      expect(start(giratina.script, header.scripts, 0), '스크립트가 안 걸렸다').toBe(true)
      const frames = await runToEnd()
      expect(fieldScripts.lastError, '스크립트가 터졌다').toBeNull()
      expect(scriptBusy(), `${String(frames)}프레임 뒤에도 돈다`).toBe(false)
      expect(battles, '배틀이 안 열렸다').toBe(1)
    }

    it('잡으면 잡은 표식과 숨김 표식이 서고 기라티나가 사라진다', async () => {
      await battleTurnback('caught')
      const vars = fieldScripts.vars
      expect(vars.checkFlag(FLAG_CAUGHT_GIRATINA)).toBe(true)
      expect(vars.checkFlag(FLAG_HIDE_TURNBACK_GIRATINA)).toBe(true)
      expect(npcActors.byLocalID.has(0)).toBe(false)
      expect(mapWorld.pending, '잡았는데 전멸로 빠졌다').toBeNull()
    })

    it.each(['win', 'fled', 'foeFled'] as const)('%s — 「사라졌다」 갈래: 숨김 표식만 서고 잡은 표식은 없다', async (result) => {
      await battleTurnback(result)
      const vars = fieldScripts.vars
      // ⚠️ 달아난 판도 「지지 않았다」다 — 전멸로 빠지면 이 표식이 **지워진다**
      expect(vars.checkFlag(FLAG_HIDE_TURNBACK_GIRATINA)).toBe(true)
      expect(vars.checkFlag(FLAG_CAUGHT_GIRATINA)).toBe(false)
      expect(npcActors.byLocalID.has(0)).toBe(false)
      expect(vars.checkFlag(FLAG_REMOVE_OBJECT), '지역 표식은 배틀 뒤에 스크립트가 지운다').toBe(false)
      expect(mapWorld.pending).toBeNull()
    })

    it('지면 필드를 다시 안 세운다 — 숨김 표식이 지워지고 전멸한다', async () => {
      await battleTurnback('loss')
      const vars = fieldScripts.vars
      expect(vars.checkFlag(FLAG_HIDE_TURNBACK_GIRATINA)).toBe(false)
      expect(vars.checkFlag(FLAG_CAUGHT_GIRATINA)).toBe(false)
      expect(mapWorld.pending, '부활 자리로 안 옮겼다').not.toBeNull()
    })

    // 차원문 간판(11,14)이 기라티나와 **같은 칸**이다. 기라티나가 안 치워지면 A가 늘 기라티나에게
    // 걸려서 방 583과 백금옥에 못 간다 (감사 A #5)
    it('사라진 뒤에는 그 칸의 A가 차원문 간판에 닿는다', async () => {
      await battleTurnback('win')
      expect(npcAt(TURNBACK_ROOM, 11, 14, fieldScripts.vars)).toBeNull()
      expect(signAt(TURNBACK_ROOM, 11, 14, 2, fieldScripts.vars)?.script).toBe(6)
      // 다시 들어와도 안 선다 — 숨김 표식이 남았다
      enterMap(TURNBACK_ROOM)
      expect(npcActors.byLocalID.has(0)).toBe(false)
    })
  })

  describe('깨어진 세계 기라티나 방 — 진행도 14와 차원문', () => {
    async function battleDw(result: Exclude<BattleFinish, null>): Promise<void> {
      outcome = result
      await distortionPreload()
      const vars = fieldScripts.vars
      distortionHooks.vars = () => fieldScripts.vars
      distortionHooks.progress = () => fieldScripts.vars.get(VAR_DW_PROGRESS)
      distortionHooks.setProgress = (v) => { fieldScripts.vars.set(VAR_DW_PROGRESS, v) }
      distortionHooks.cyrusAppearance = () => 0
      vars.set(VAR_DW_PROGRESS, PROGRESS_ARRIVED)
      mapWorld.mapId = DW_GIRATINA_ROOM
      enterMap(DW_GIRATINA_ROOM)
      await settle()
      // 기라티나 앞 (15,14) — 원작 도착 칸이 그 줄이다
      worldState.player.position.set(15.5, 1, 14.5)
      distortionEnter(DW_GIRATINA_ROOM, 15.5, 1, 14.5)
      expect(npcActors.byLocalID.has(DW_GIRATINA), '진행도 13이면 기라티나가 서 있어야 한다').toBe(true)
      expect(npcActors.byLocalID.has(DW_PORTAL)).toBe(false)
      const header = mapById(DW_GIRATINA_ROOM)!
      const script = npcActors.byLocalID.get(DW_GIRATINA)!.info.script
      expect(start(script, header.scripts, DW_GIRATINA), '스크립트가 안 걸렸다').toBe(true)
      const frames = await runToEnd()
      expect(fieldScripts.lastError, '스크립트가 터졌다').toBeNull()
      expect(scriptBusy(), `${String(frames)}프레임 뒤에도 돈다`).toBe(false)
      expect(battles, '배틀이 안 열렸다').toBe(1)
    }

    it.each(['caught', 'win', 'fled'] as const)('%s — `OnLoad`가 진행도를 14로 올리고 기라티나를 치우며 차원문이 선다', async (result) => {
      await battleDw(result)
      const vars = fieldScripts.vars
      expect(vars.get(VAR_DW_PROGRESS)).toBe(PROGRESS_BATTLED)
      expect(npcActors.byLocalID.has(DW_GIRATINA), '기라티나가 남았다 — 또 싸울 수 있다').toBe(false)
      // 조건 `progress == 14`인 둘 — 필드를 다시 세울 때 층의 물체를 다시 센다
      expect(npcActors.byLocalID.has(DW_PORTAL), '차원문이 안 섰다 — 세계를 못 나간다').toBe(true)
      expect(npcActors.byLocalID.has(DW_CYNTHIA_MESSAGE)).toBe(true)
      expect(vars.checkFlag(FLAG_CAUGHT_GIRATINA)).toBe(result === 'caught')
      expect(mapWorld.pending).toBeNull()
    })

    it('지면 필드를 다시 안 세운다 — 진행도 13 그대로 전멸한다', async () => {
      await battleDw('loss')
      expect(fieldScripts.vars.get(VAR_DW_PROGRESS)).toBe(PROGRESS_ARRIVED)
      expect(npcActors.byLocalID.has(DW_PORTAL)).toBe(false)
      expect(mapWorld.pending, '부활 자리로 안 옮겼다').not.toBeNull()
    })
  })
})
