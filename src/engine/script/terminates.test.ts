// 스크립트는 **끝나야 한다** (DATA.md §2.10)
//
// ⚠️ **안 끝나는 스크립트는 게임을 영영 세운다.** 스크립트가 도는 동안 발이
// 묶이므로(`field.ts`의 `scriptSystem`), 끝나지 않으면 화면은 멀쩡한데
// 걸음도 대사도 없는 채로 굳는다. 브라우저 실측이 실제로 그 자리에서 섰다 —
// 주인공 집 1층에서 다섯 번 중 세 번.
//
// 그 자리를 밖에서 보면 "안 움직인다"뿐이라 벽에 막힌 것과 구별이 안 된다.
// 여기서는 안에서 본다: 진짜 자료로 스크립트를 하나씩 걸고, 정해진 프레임
// 안에 끝나는지를 센다. 안 끝나면 **그때 돌던 명령 이름**까지 적는다.
//
// ⚠️ **바깥 일감(services)은 다 채워 준다.** 배틀도 상점도 여기서는 즉시
// 끝난 것으로 답한다 — 재려는 것이 "붙일 것을 안 붙여서 서는가"가 아니라
// **"다 붙여도 스크립트 자체가 안 끝나는가"**이기 때문이다. 안 붙여서 서는
// 자리는 `story.test.ts`가 따로 잡는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import type { MapHeader, EventFile } from '../map/world'
import { mapById, npcsOf, signsOf, triggersOf, world as mapWorld } from '../map/world'
import { worldState } from '../../state/worldState'
import { buildCommands } from './commands'
import type { CommandFn } from './context'
import { parseScriptMeta } from './data'
import {
  abortScript, enterMap, fieldScripts, initScriptsOf, makeWorld, scriptBusy, scriptSystem, start,
} from './field'
import { VarStore } from './vars'
import { withData } from '../../data/romData.testkit'
import { stubLabels, stubParty, stubTrainerInfo } from './services.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'events.json', 'maps.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/**
 * 오프닝이 지나가는 자리 전부. 새 게임에서 첫 배틀·첫 상점까지의 길이다.
 *
 * 415 침실 → 414 1층 → 411 떡잎마을 → 342 201번도로 → 418 모래시티 →
 * 419 프렌들리숍. 여기가 막히면 **아무도 게임을 시작 못 한다**
 */
const OPENING_MAPS = [415, 414, 411, 342, 418, 419, 412, 413, 420, 421]

/** 한 스크립트에 주는 프레임. 60프레임이 1초니까 100초다 */
const FRAME_CAP = 6_000

maybe('오프닝 길목의 스크립트는 전부 끝난다', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events

  /** 방금 돈 명령 이름들. 안 끝났을 때 어디서 도는지 적는다 */
  let trace: string[] = []

  beforeEach(() => {
    mapWorld.maps = maps
    mapWorld.events = events
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    const built = buildCommands(meta.commands)
    const named = new Map<number, CommandFn>()
    for (const [op, fn] of built.map) {
      const name = meta.commands[op]?.name ?? `#${String(op)}`
      named.set(op, (ctx) => {
        trace.push(name)
        if (trace.length > 4_000) trace = trace.slice(-200)
        return fn(ctx)
      })
    }
    fieldScripts.commands = { map: named, unhandled: built.unhandled }
    fieldScripts.vars = new VarStore()
    fieldScripts.services = ALL_SERVICES
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })

  /**
   * 이벤트 루프에 한 바퀴 양보한다.
   *
   * ⚠️ **없으면 전부 "안 끝난다"로 나온다.** 글 뱅크는 약속으로 오는데
   * (`switchBank`), 프레임 고리를 동기로 돌리면 그 약속이 영영 안 풀려
   * `bankPending`이 참인 채로 스크립트가 한 발도 못 뗀다. 처음에 그렇게 짜서
   * 맵 여덟 개가 통째로 빨갛게 나왔다 — 게임이 아니라 시험이 틀린 것이었다
   */
  const yieldToLoop = async (): Promise<void> => new Promise((done) => { setImmediate(done) })

  it.each(OPENING_MAPS)('맵 %i', async (mapId) => {
    const header = mapById(mapId)
    expect(header, `맵 ${String(mapId)}이 없다`).not.toBeNull()

    mapWorld.mapId = mapId
    enterMap(mapId)

    /** 이 맵에서 걸릴 수 있는 스크립트 전부. 어디서 왔는지도 같이 든다 */
    const jobs: { from: string, script: number, localID: number }[] = [
      ...npcsOf(mapId).map((n) => ({ from: '사람', script: n.script, localID: n.localID })),
      ...triggersOf(mapId).map((t) => ({ from: '밟기', script: t.script, localID: 0 })),
      ...signsOf(mapId).map((s) => ({ from: '간판', script: s.script, localID: 0 })),
      ...(initScriptsOf(mapId)?.frame ?? []).map((f) => ({ from: '매프레임', script: f.script, localID: 0 })),
    ]

    const stuck: string[] = []
    /** 실제로 걸린 스크립트 수. 0이면 이 시험은 아무것도 안 잰 것이다 */
    let ran = 0
    let frameTotal = 0
    for (const job of jobs) {
      abortScript()
      fieldScripts.vars = new VarStore()
      fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
      mapWorld.mapId = mapId
      trace = []
      if (!start(job.script, header!.scripts, job.localID)) continue
      ran++

      let frames = 0
      for (; frames < FRAME_CAP && scriptBusy(); frames++) {
        // A는 두 프레임에 한 번. 계속 누르고 있으면 눌린 순간이 안 잡힌다
        worldState.input.interact = frames % 2 === 0
        scriptSystem.fixedUpdate()
        if (frames % 8 === 0) await yieldToLoop()
      }
      if (scriptBusy()) {
        // ⚠️ **롬 글은 안 적는다.** 여기 남기는 것은 우리가 붙인 명령 이름과
        // 번호뿐이다 (COPYRIGHT.md §6)
        const loop = [...new Set(trace.slice(-40))].join(' → ')
        stuck.push(`${job.from} ${String(job.script)}: ${loop || '(명령을 한 번도 안 돌았다)'}`)
      }
      frameTotal += frames
      abortScript()
    }

    expect(stuck, `맵 ${String(mapId)}에서 안 끝나는 스크립트 ${String(stuck.length)}개`).toEqual([])
    // ⚠️ **아무것도 안 돌고 초록인 것을 막는다.** 한 번은 프레임 고리가 통째로
    // 헛돌면서 10개가 다 통과했다 — 스크립트가 하나도 안 걸렸기 때문이었다
    expect(ran, `맵 ${String(mapId)}에서 걸린 스크립트가 없다`).toBeGreaterThan(0)
    expect(frameTotal, `맵 ${String(mapId)}에서 프레임이 한 번도 안 돌았다`).toBeGreaterThan(0)
  })
})

/**
 * 바깥 일감을 전부 "끝났다"로 답하는 판.
 *
 * 값은 스크립트가 갈래를 타는 데 필요한 최소한이다 — 파티가 있고, 배틀은
 * 이기고, 화면은 곧바로 닫힌다
 */
const ALL_SERVICES = {
  startTrainerBattle: () => {},
  startFirstBattle: () => {},
  startLegendaryBattle: () => {},
  startTagBattle: () => {},
  battleResult: () => 'win' as const,
  trainer: () => ({ double: false, msg: {} }),
  trainerMessage: () => '',
  aliveMons: () => 6,
  party: {
    ...stubParty,
    count: () => 6,
    species: () => 387,
    hasSpecies: () => true,
    aliveExcept: () => 5,
    give: () => true,
    level: () => 5,
    friendship: () => 70,
    hasMove: () => true,
    move: () => 33,
    moveCount: () => 4,
  },
  trainerInfo: { ...stubTrainerInfo, hasBadge: () => true },
  labels: stubLabels,
  chooseMon: { open: () => {}, picked: () => 0 },
  boxes: { nickname: () => '' },
  tablet: { name: () => '', open: () => {} },
  appearance: { get: () => 0, set: () => {} },
  bag: {
    pocketOf: () => 0,
    add: () => true,
    remove: () => true,
    canFit: () => true,
    quantity: () => 1,
    pocketHasItems: () => true,
    name: () => '',
  },
  money: { get: () => 3_000, add: () => {}, spend: () => true },
  openStartMenu: () => {},
  menuOpen: () => false,
  openShop: () => {},
  openStorage: () => {},
  boxFreeSlots: () => 30,
  aliveAndBoxMons: () => 6,
  martStock: { common: () => [], specialties: () => [] },
  fieldMoves: { badges: () => 0xff, knows: () => true },
  sound: {
    playEffect: () => {},
    stopEffect: () => {},
    effectPlaying: () => false,
    playCry: () => {},
    cryPlaying: () => false,
    playFanfare: () => {},
    fanfarePlaying: () => false,
    setMusic: () => {},
    sequencePlaying: () => false,
    fadeVolume: () => {},
  },
  healParty: () => {},
  setHealSpot: () => {},
  blackOut: () => {},
  timeOfDay: () => 1,
  gear: { giveRunningShoes: () => {}, hasRunningShoes: () => true },
  warpEvents: { setPos: () => {} },
  door: {
    load: () => {}, open: () => {}, close: () => {}, busy: () => false, unload: () => {},
  },
  chooseStarter: { open: () => {}, chosen: () => 387 },
  breakObstacle: { start: () => {}, done: () => true },
  hmCutIn: { start: () => {}, done: () => true },
  seeSpecies: () => {},
  naming: { openForParty: () => {}, named: () => '' },
  giveEgg: () => {},
  survivePoison: () => true,
  camera: { free: () => {}, restore: () => {} },
}
