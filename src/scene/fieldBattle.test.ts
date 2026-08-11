// 스크립트가 부른 트레이너전이 **진짜로 열린다** (DEPLOY.md §5의 ㉖)
//
// ⚠️ **왜 또 시험인가.** `terminates.test.ts`는 바깥 일감을 전부 가짜로 채운다 —
// 배틀도 "이미 이겼다"로 답한다. 그래서 스크립트가 `StartTrainerBattle`까지
// 가기만 하면 초록이고, **그 뒤에 배틀이 실제로 서는지는 아무도 안 본다.**
//
// 그 틈으로 실제 결함이 지나갔다: 브라우저 실측에서 202번도로 트레이너 셋에게
// 말을 걸어도 트레이너전이 한 번도 안 열렸는데, 노드에서 같은 스크립트를 가짜
// 일감으로 돌리면 셋 다 초록이었다. 갈린 자리가 여기 — **붙이는 쪽**이다.
//
// 그래서 여기서는 `scene/fieldServices`를 진짜로 붙이고, 진짜 `battleStore`로
// 배틀을 끝까지 치르고, 이긴 것이 플래그로 남는지까지 본다.
//
// ⚠️ **롬 글은 안 적는다.** 여기서 다루는 것은 번호와 플래그뿐이다 (COPYRIGHT.md §6).
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { buildCommands, TRAINER_DEFEATED_FLAGS_START, trainerIdOf } from '../engine/script/commands'
import { parseScriptMeta } from '../engine/script/data'
import {
  abortScript, enterMap, fieldScripts, makeWorld, scriptBusy, scriptSystem, start,
} from '../engine/script/field'
import { VarStore } from '../engine/script/vars'
import { mapById, npcsOf, world as mapWorld } from '../engine/map/world'
import type { EventFile, MapHeader } from '../engine/map/world'
import { loadMoves, loadSpecies } from '../data/gameData'
import { createWild, fillPp, statsOf } from '../engine/pokemon/instance'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { useBattleStore } from '../state/battleStore'
import { createNewSave, useSaveStore } from '../state/saveStore'
import { worldState } from '../state/worldState'
import { installFieldServices } from './fieldServices'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const maybe = withData('scripts.bin', 'events.json', 'maps.json', 'trainers.json')

/** 202번도로. 새 게임에서 처음 만나는 트레이너 셋이 여기 서 있다 */
const ROUTE_202 = 343
/** 한 판에 주는 프레임. 60프레임이 1초니까 게임 시간으로 1000초분이다 */
const FRAME_CAP = 60_000
/** 그리고 진짜 시간으로 이만큼. 배틀 한 판이 이 안에 끝나야 한다 */
const WALL_CAP_MS = 90_000
/** 이길 몸. 5레벨 파트너로는 져서 "이겼다" 갈래를 못 밟는다 */
const TORTERRA = 389

maybe('스크립트가 연 트레이너전', () => {
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
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false

    // ⚠️ **진짜 일감을 붙인다.** 이 한 줄이 이 파일의 요점이다
    stopServices = installFieldServices('ko')
    // 표는 약속으로 온다. 안 기다리면 트레이너가 통째로 비어 스크립트가
    // "파티가 없다" 갈래를 탄다 — 그건 게임이 아니라 시험이 틀린 것이다
    await settleLoaders()

    // 이길 몸 하나. 지면 `CheckWonBattle`이 다른 갈래로 빠져 플래그를 안 본다
    const [species, moves] = await Promise.all([loadSpecies(), loadMoves()])
    const sp = species.get(TORTERRA)
    const mon = createWild({
      species: sp, level: 60, rng: Math.random, otId: 1, otSecretId: 1,
    })
    mon.hp = statsOf(mon, sp).hp
    useSaveStore.setState({ party: [fillPp(mon, (id) => moves.byId.get(id)?.pp ?? 5)] })
  })

  afterEach(() => {
    abortScript()
    stopServices?.()
    stopServices = null
    useBattleStore.getState().close()
  })

  /** 202번도로에 서 있는 트레이너들. 3000번대가 싱글 배틀이다 */
  const TRAINERS = (): { script: number, localID: number }[] =>
    npcsOf(ROUTE_202)
      .filter((n) => n.script >= 3000 && n.script < 5000)
      .map((n) => ({ script: n.script, localID: n.localID }))

  it.each([0, 1, 2])('202번도로 트레이너 %i에게 걸면 배틀이 서고 이긴 것이 남는다', async (i) => {
    const header = mapById(ROUTE_202)
    expect(header, '202번도로 헤더가 없다').not.toBeNull()
    const who = TRAINERS()[i]
    expect(who, `202번도로에 트레이너가 ${String(i + 1)}명도 없다`).toBeDefined()

    mapWorld.mapId = ROUTE_202
    enterMap(ROUTE_202)

    /**
     * 실제로 **선** 배틀의 갈래.
     *
     * ⚠️ `phase`가 `'off'`에서 벗어나는 순간을 세면 안 된다 — 그건 `'loading'`
     * 이고, 심판(`@pkmn/sim`)을 아직 못 받은 상태다. 그것만 보고 초록을 주면
     * "열리다 만 배틀"이 통과한다
     */
    const opened: string[] = []
    const stopWatch = useBattleStore.subscribe((now, before) => {
      if (now.phase === 'running' && before.phase !== 'running') opened.push(now.kind)
    })

    try {
      expect(start(who!.script, header!.scripts, who!.localID), '스크립트가 안 걸렸다').toBe(true)

      let frames = 0
      const till = Date.now() + WALL_CAP_MS
      for (; frames < FRAME_CAP && scriptBusy() && Date.now() < till; frames++) {
        // A는 두 프레임에 한 번. 계속 누르고 있으면 눌린 순간이 안 잡힌다
        worldState.input.interact = frames % 2 === 0
        scriptSystem.fixedUpdate()
        // ⚠️ **프레임마다 진짜 시간을 흘려보낸다.** 글 뱅크도 배틀 청크도
        // 약속으로 오는데, `setImmediate`로만 양보하면 프레임이 마이크로초
        // 단위로 지나가 버려서 `@pkmn/sim`을 받기도 전에 6000프레임이 끝난다 —
        // 처음에 그렇게 짜서 "스크립트가 안 끝난다"로 세 개가 빨갛게 나왔다
        await new Promise((done) => { setTimeout(done, 0) })
        await pushBattle()
      }

      expect(fieldScripts.lastError, '스크립트가 터졌다').toBeNull()
      expect(opened, '트레이너전이 한 번도 안 열렸다').toContain('trainer')
      expect(useBattleStore.getState().error, '배틀이 거절당했다').toBeNull()
      expect(scriptBusy(), `스크립트가 ${String(frames)}프레임 안에 안 끝났다`).toBe(false)
      // 이긴 것이 남아야 다시 지나갈 때 안 덤빈다 (`Script_IsTrainerDefeated`)
      const flag = TRAINER_DEFEATED_FLAGS_START + trainerIdOf(who!.script)
      expect(fieldScripts.vars.checkFlag(flag), '이겼는데 기록이 안 남았다').toBe(true)
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
 * 스크립트는 화면이 **닫혀야** 놓여난다(`fieldServices`의 `watchBattle`) —
 * 여기서 안 닫으면 프레임만 6000번 돌고 "안 끝났다"가 된다
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
  // ⚠️ **첫 기술을 고르면 안 된다.** 그 칸이 광합성이면 아무리 때려도 안 끝난다
  const best = [...actions.filter((a) => a.type === 'move')]
    .sort((a, b) => power(b.move) - power(a.move))[0]
  await state.choose(best ?? actions[0]!)
}
