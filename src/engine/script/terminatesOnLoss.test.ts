// 스크립트는 **져도** 끝나야 한다 (DATA.md §2.10)
//
// ⚠️ **`terminates.test.ts`는 이긴 판만 잰다.** 거기 붙은 가짜 일감은
// `battleResult: () => 'win'`이라, 배틀을 여는 스크립트는 전부 **이긴 갈래**로만
// 지나간다. 진 갈래는 아무도 안 밟았다.
//
// 그 틈으로 이런 자리가 지나간다: 스크립트가 배틀을 열고 `ctx.pause`로 결과를
// 기다리는데(`StartTrainerBattle`·`StartLegendaryBattle`·`StartWildBattle` 셋 다
// 같은 모양이다), 결과가 「졌다」로 오면 그 뒤 갈래가 안 끝날 수 있다. 원작은
// 전멸을 `FieldTask_ChangeMapByLocation`으로 처리해 **필드 태스크째 갈아 끼우므로**
// 그 위에 얹힌 스크립트가 같이 죽는다 — 우리는 워프만 건다. 그래서 진 갈래는
// 스크립트 스스로 끝나야 한다.
//
// 안 끝나면 무슨 일이 나는지는 `field.ts`의 `abortScript` 주석이 적어 뒀다 —
// 「딴 맵에서 그 대사창이 뜨고 플레이어가 잠긴 채로 서 있는다」. 스크립트가 도는
// 동안은 발이 묶이므로, 깨어난 자리에서 한 칸도 못 간다.
//
// ⚠️ **롬 글은 안 적는다.** 여기 남기는 것은 우리가 붙인 명령 이름과 번호뿐이다
// (COPYRIGHT.md §6).
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
import { allDoneServices } from './services.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'events.json', 'maps.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/**
 * 배틀을 여는 스크립트가 실제로 있는 맵들.
 *
 * 510 시작의 방(전설전)과 175 리그 로비는 `story.mjs`가 「배틀 명령 바로 다음에
 * 선다」로 적어 둔 바로 그 두 자리다. 343 202번도로는 새 게임에서 처음 만나는
 * 트레이너 셋이 서 있는 곳이고, 나머지는 오프닝 길목이다
 */
const BATTLE_MAPS = [510, 175, 343, 415, 414, 411, 342]

/** 배틀을 여는 명령들. 하나라도 안 돌면 이 시험은 아무것도 안 잰 것이다 */
const OPENS_BATTLE = new Set([
  'StartTrainerBattle', 'StartLegendaryBattle', 'StartWildBattle', 'StartTagBattle',
  'StartFirstBattle',
])

/** 한 스크립트에 주는 프레임. 60프레임이 1초니까 100초다 */
const FRAME_CAP = 6_000

maybe('배틀을 여는 스크립트는 져도 끝난다', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events

  /** 방금 돈 명령 이름들. 안 끝났을 때 어디서 도는지 적는다 */
  let trace: string[] = []
  /** 이 판에서 배틀을 연 횟수 */
  let opened = 0

  beforeEach(() => {
    mapWorld.maps = maps
    mapWorld.events = events
    mapWorld.pending = null
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }

    const built = buildCommands(meta.commands)
    const named = new Map<number, CommandFn>()
    for (const [op, fn] of built.map) {
      const name = meta.commands[op]?.name ?? `#${String(op)}`
      named.set(op, (ctx) => {
        trace.push(name)
        if (OPENS_BATTLE.has(name)) opened++
        if (trace.length > 4_000) trace = trace.slice(-200)
        return fn(ctx)
      })
    }
    fieldScripts.commands = { map: named, unhandled: built.unhandled }
    fieldScripts.vars = new VarStore()
    // ⚠️ **여기 한 줄이 이 파일의 전부다.** 나머지는 `terminates.test.ts`와 같고,
    // 배틀 결과만 「졌다」로 답한다
    fieldScripts.services = { ...allDoneServices, battleResult: () => 'loss' as const }
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })

  const yieldToLoop = async (): Promise<void> => new Promise((done) => { setImmediate(done) })

  it.each(BATTLE_MAPS)('맵 %i', async (mapId) => {
    const header = mapById(mapId)
    expect(header, `맵 ${String(mapId)}이 없다`).not.toBeNull()

    mapWorld.mapId = mapId
    enterMap(mapId)
    await yieldToLoop()

    const jobs: { from: string, script: number, localID: number }[] = [
      ...npcsOf(mapId).map((n) => ({ from: '사람', script: n.script, localID: n.localID })),
      ...triggersOf(mapId).map((t) => ({ from: '밟기', script: t.script, localID: 0 })),
      ...signsOf(mapId).map((s) => ({ from: '간판', script: s.script, localID: 0 })),
      ...(initScriptsOf(mapId)?.frame ?? []).map((f) => ({ from: '매프레임', script: f.script, localID: 0 })),
    ]

    const stuck: string[] = []
    let ran = 0
    opened = 0
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
        worldState.input.interact = frames % 2 === 0
        scriptSystem.fixedUpdate()
        if (frames % 8 === 0) await yieldToLoop()
      }
      if (scriptBusy()) {
        const loop = [...new Set(trace.slice(-40))].join(' → ')
        stuck.push(`${job.from} ${String(job.script)}: ${loop || '(명령을 한 번도 안 돌았다)'}`)
      }
      abortScript()
    }

    expect(stuck, `맵 ${String(mapId)}에서 지고 나서 안 끝나는 스크립트 ${String(stuck.length)}개`)
      .toEqual([])
    expect(ran, `맵 ${String(mapId)}에서 걸린 스크립트가 없다`).toBeGreaterThan(0)
  })

  /**
   * ⚠️ **진 갈래를 한 번도 안 밟고 초록인 것을 막는다.** 위 맵들이 배틀을 아예
   * 안 열면 `battleResult`를 무엇으로 두든 결과가 같다 — 그러면 이 파일은 그냥
   * `terminates.test.ts`를 한 번 더 돌린 것이다
   */
  it('배틀을 실제로 열었다', async () => {
    const header = mapById(343)
    expect(header, '202번도로 헤더가 없다').not.toBeNull()
    mapWorld.mapId = 343
    enterMap(343)
    await yieldToLoop()

    opened = 0
    for (const n of npcsOf(343).filter((x) => x.script >= 3000 && x.script < 5000)) {
      abortScript()
      fieldScripts.vars = new VarStore()
      fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
      mapWorld.mapId = 343
      trace = []
      if (!start(n.script, header!.scripts, n.localID)) continue
      for (let f = 0; f < FRAME_CAP && scriptBusy(); f++) {
        worldState.input.interact = f % 2 === 0
        scriptSystem.fixedUpdate()
        if (f % 8 === 0) await yieldToLoop()
      }
      abortScript()
    }
    expect(opened, '배틀을 여는 명령이 한 번도 안 돌았다').toBeGreaterThan(0)
  })
})
