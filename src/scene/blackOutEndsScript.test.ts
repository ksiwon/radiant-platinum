// 전멸하면 **돌던 스크립트도 같이 끝난다** (DATA.md §2.10)
//
// ⚠️ **맵만 갈고 스크립트를 놔두면 플레이어가 잠긴 채로 깨어난다.** 원작은
// 전멸을 `FieldTask_ChangeMapByLocation`으로 처리하므로 **필드 태스크가 통째로
// 갈려서** 그 위에 얹혀 있던 스크립트가 같이 죽는다. 우리는 워프만 걸었다 —
// 그래서 배틀을 연 스크립트가 집에서 계속 돌고, 스크립트가 도는 동안은 발이
// 묶이므로(`field.ts`의 `scriptSystem`) 깨어난 자리에서 한 칸도 못 간다.
// `field.ts`의 `abortScript` 주석이 같은 증상을 이미 적어 뒀다 — 「딴 맵에서 그
// 대사창이 뜨고 플레이어가 잠긴 채로 서 있는다」.
//
// 실측으로 이 자리가 밖에서 어떻게 보였는지: `pnpm story`의 시작의 방(맵 510)이
// 다섯 판 중 한 판 「스크립트가 안 끝난다 (번호 2)」로 떨어졌고, 그 판만 맵
// **414**(떡잎마을 주인공 집 1층 — `spawnTable`의 기본 부활 자리)에서 끝났다.
// 컷신을 596번 눌러도 안 끝났다.
//
// 그래서 여기서는 **일부러 진다.** 이길 몸을 안 주고 스크립트가 연 트레이너전에
// 들어가, 배틀이 닫힌 뒤에 스크립트가 놓여났는지를 본다.
//
// ⚠️ **롬 글은 안 적는다.** 여기서 다루는 것은 번호와 플래그뿐이다 (COPYRIGHT.md §6).
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { buildCommands } from '../engine/script/commands'
import { parseScriptMeta } from '../engine/script/data'
import {
  abortScript, enterMap, fieldScripts, makeWorld, scriptBusy, scriptSystem, start,
} from '../engine/script/field'
import { VarStore } from '../engine/script/vars'
import { mapById, npcsOf, world as mapWorld } from '../engine/map/world'
import { spawnTable, type SpawnPoint } from '../engine/map/spawns'
import type { EventFile, MapHeader } from '../engine/map/world'
import { loadMoves, loadSpecies } from '../data/gameData'
import { createWild, fillPp, statsOf } from '../engine/pokemon/instance'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { useBattleStore } from '../state/battleStore'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'
import { installFieldServices } from './fieldServices'
import { cutInSystem, resetCutIn } from './encounterCutIn'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const maybe = withData('scripts.bin', 'events.json', 'maps.json', 'trainers.json', 'spawns.json')

/** 202번도로. 새 게임에서 처음 만나는 트레이너 셋이 여기 서 있다 */
const ROUTE_202 = 343
/** 떡잎마을 주인공 집 1층 — `spawnTable`의 첫 줄이자 기본 부활 자리다 */
const PLAYER_HOUSE_1F = 414
/** 한 판에 주는 프레임. 60프레임이 1초니까 게임 시간으로 1000초분이다 */
const FRAME_CAP = 60_000
/** 그리고 진짜 시간으로 이만큼 */
const WALL_CAP_MS = 90_000
/**
 * 질 몸. **2레벨 모부기 하나뿐이다** — 202번도로 트레이너의 파티를 못 이긴다.
 * 이기면 이 시험이 재려던 갈래를 아예 안 밟는다
 */
const TURTWIG = 387

maybe('전멸과 스크립트', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events

  let restoreAssets: (() => void) | null = null
  beforeAll(() => { restoreAssets = installNodeAssets() })
  afterAll(() => { restoreAssets?.() })

  let stopServices: (() => void) | null = null

  beforeEach(async () => {
    useBattleStore.getState().close()
    useSaveStore.setState(createNewSave())

    mapWorld.maps = maps
    mapWorld.events = events
    mapWorld.pending = null
    // 부활 자리 표는 평소 `scene/worldData`가 채운다. 안 채우면 `spawnWarp`가
    // null을 내서 「안 옮겼다」가 제품이 아니라 시험 탓으로 난다
    spawnTable.list = (read('spawns.json') as { spawns: SpawnPoint[] }).spawns
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false

    stopServices = installFieldServices('ko')
    await settleLoaders()

    const [species, moves] = await Promise.all([loadSpecies(), loadMoves()])
    const sp = species.get(TURTWIG)
    const mon = createWild({
      species: sp, level: 2, rng: Math.random, otId: 1, otSecretId: 1,
    })
    mon.hp = statsOf(mon, sp).hp
    useSaveStore.setState({ party: [fillPp(mon, (id) => moves.byId.get(id)?.pp ?? 5)] })
  })

  afterEach(() => {
    abortScript()
    stopServices?.()
    stopServices = null
    resetCutIn()
    useBattleStore.getState().close()
    mapWorld.pending = null
  })

  it('스크립트가 연 배틀에서 지면 스크립트가 놓여나고 부활 자리로 옮겨진다', async () => {
    const header = mapById(ROUTE_202)
    expect(header, '202번도로 헤더가 없다').not.toBeNull()
    /** 202번도로에 서 있는 트레이너들. 3000번대가 싱글 배틀이다 */
    const who = npcsOf(ROUTE_202)
      .filter((n) => n.script >= 3000 && n.script < 5000)
      .map((n) => ({ script: n.script, localID: n.localID }))[0]
    expect(who, '202번도로에 트레이너가 없다').toBeDefined()

    mapWorld.mapId = ROUTE_202
    enterMap(ROUTE_202)

    /** 진 것이 실제로 잡혔는가. 이겨 버리면 이 시험은 아무것도 안 잰 것이다 */
    let lost = false
    const stopWatch = useBattleStore.subscribe((now, before) => {
      if (now.outcome === 'loss' && before.outcome !== 'loss') lost = true
    })

    try {
      expect(start(who!.script, header!.scripts, who!.localID), '스크립트가 안 걸렸다').toBe(true)

      let frames = 0
      const till = Date.now() + WALL_CAP_MS
      for (; frames < FRAME_CAP && scriptBusy() && Date.now() < till; frames++) {
        worldState.input.interact = frames % 2 === 0
        scriptSystem.fixedUpdate()
        cutInSystem.fixedUpdate()
        await new Promise((done) => { setTimeout(done, 0) })
        await pushBattle()
      }

      expect(fieldScripts.lastError, '스크립트가 터졌다').toBeNull()
      expect(lost, '지는 갈래를 안 밟았다 — 이 판은 아무것도 안 쟀다').toBe(true)
      // ⚠️ 여기가 이 파일의 요점이다. 맵만 갈고 스크립트를 놔두면 깨어난 자리에서
      // 발이 묶인다
      expect(scriptBusy(), `졌는데 스크립트가 ${String(frames)}프레임 뒤에도 돈다`).toBe(false)
      expect(mapWorld.pending?.to, '부활 자리로 안 옮겼다').toBe(PLAYER_HOUSE_1F)
    } finally {
      stopWatch()
    }
  }, 180_000)
})

/** 표를 받아 오는 약속들이 다 풀릴 때까지. 매크로태스크 한 바퀴면 충분하다 */
async function settleLoaders(): Promise<void> {
  for (let i = 0; i < 3; i++) await new Promise((done) => { setImmediate(done) })
}

/**
 * 배틀이 서 있으면 한 수 둔다. 끝났으면 닫는다.
 *
 * ⚠️ **여기서는 제일 약한 수를 고른다.** 이기면 `CheckWonBattle`이 다른 갈래로
 * 빠져 전멸을 아예 안 밟는다
 */
async function pushBattle(): Promise<void> {
  const state = useBattleStore.getState()
  if (state.phase === 'over') { state.close(); return }
  if (state.phase !== 'running') return
  if (state.shiftAsk !== null) { await state.answerShift(false); return }
  const moves = await loadMoves()
  const power = (id: number | null) => (id === null ? 0 : moves.byId.get(id)?.power ?? 0)
  const actions = state.actions
  if (!actions.length) return
  const weakest = [...actions.filter((a) => a.type === 'move')]
    .sort((a, b) => power(a.move) - power(b.move))[0]
  await state.choose(weakest ?? actions[0]!)
}
