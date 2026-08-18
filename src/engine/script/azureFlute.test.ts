// 천계의피리가 계단을 놓는다 (PARITY §4.1 · SIWON.md §5)
//
// ⚠️ **시원의 줄이 여기서 끊겨 있었다.** 넷째 선물이 천계의피리인데 도구
// 갈래가 「폼 체인지가 아직 없다」로 떨어져서, 불 수가 없으니 아르세우스를 못
// 잡고, 그러면 다섯째(레지기가스)와 여섯째(마나피 알)가 영영 안 나왔다.
//
// **우리가 판정할 것은 하나도 없다.** 창기둥인가·칸이 (31,52)인가·전당에
// 올랐는가·전국도감인가·배포 표식이 있는가·이미 잡았는가를 원작의 공용
// 스크립트 2039가 다 묻고, 안 맞으면 제 대사로 닫는다. 여기서 재는 것은
// **그 스크립트가 실제로 시작의 방까지 데려가는가**다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { DIR } from './movement'
import { mapById, world as mapWorld, type EventFile, type MapHeader } from '../map/world'
import { worldState } from '../../state/worldState'
import { printedText } from './printer'
import { enterMap, fieldScripts, makeWorld, scriptBusy, scriptSystem, start } from './field'
import { DATA, withData } from '../../data/romData.testkit'
import { stubFieldMoves, stubLabels, stubParty, stubTrainerInfo } from './services.testkit'
import { COMMON_SCRIPT_AZURE_FLUTE, fieldAction, FieldUse } from '../bag/fieldUse'
import {
  DISTRIBUTION_EVENT, DISTRIBUTION_MAGIC, FLAG_GAME_COMPLETED, VAR_DISTRIBUTION_EVENT_FIRST,
} from '../world/siwon'

const maybe = withData('scripts.json', 'scripts.bin', 'maps.json')

/** `MAP_HEADER_SPEAR_PILLAR` · 딸린 둘. 셋 다 같은 자리다 */
const SPEAR_PILLAR = 220
/** `MAP_HEADER_HALL_OF_ORIGIN` */
const HALL_OF_ORIGIN = 510
/** 피리가 통하는 단 한 칸 (`GetPlayerMapPos` 뒤의 `GoToIfNe 31`·`52`) */
const SPOT = { x: 31, z: 52 }
/** `FLAG_CAUGHT_ARCEUS` — 이미 잡았으면 다시 안 열린다 */
const FLAG_CAUGHT_ARCEUS = 286

it('도구표가 천계의피리를 공용 스크립트로 보낸다', () => {
  const flute = { constant: 'ITEM_AZURE_FLUTE', fieldUseFunc: FieldUse.AZURE_FLUTE } as never
  expect(fieldAction(flute, {
    mapId: SPEAR_PILLAR, mapType: 0, escapeRopeAllowed: false, repelSteps: 0, waterAhead: false,
  })).toEqual({ kind: 'commonScript', id: COMMON_SCRIPT_AZURE_FLUTE })
})

it('그라시데아꽃은 누구에게 쓸지부터 고른다', () => {
  const flower = { constant: 'ITEM_GRACIDEA', fieldUseFunc: FieldUse.GRACIDEA } as never
  expect(fieldAction(flower, {
    mapId: 0, mapType: 0, escapeRopeAllowed: false, repelSteps: 0, waterAhead: false,
  })).toEqual({ kind: 'party', use: 'gracidea' })
})

maybe('천계의피리', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)
  // ⚠️ **맵 표가 있어야 `Warp`가 걸린다** — 목적지 헤더에서 행렬 번호를 받는다
  mapWorld.maps = (JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')) as
    { maps: MapHeader[] }).maps

  interface Setup {
    /** 어느 맵에서 부는가 */
    mapId?: number
    /** 어느 칸에서 부는가 */
    at?: { x: number; z: number }
    completed?: boolean
    nationalDex?: boolean
    /** 시원이 넷째를 건네며 세우는 표식 */
    distribution?: boolean
    caught?: boolean
  }

  /** 피리를 분다. 워프가 걸렸으면 목적지를 돌려준다 */
  function blow(setup: Setup): { warpedTo: number | null; ended: boolean } {
    const vars = new VarStore()
    if (setup.completed !== false) vars.setFlag(FLAG_GAME_COMPLETED)
    if (setup.caught === true) vars.setFlag(FLAG_CAUGHT_ARCEUS)
    if (setup.distribution !== false) {
      vars.set(
        VAR_DISTRIBUTION_EVENT_FIRST + DISTRIBUTION_EVENT.arceus,
        DISTRIBUTION_MAGIC[DISTRIBUTION_EVENT.arceus]!)
    }
    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }),
      movements: meta.movements,
      services: {
        party: stubParty, labels: stubLabels, fieldMoves: stubFieldMoves,
        trainerInfo: { ...stubTrainerInfo, nationalDex: () => setup.nationalDex !== false },
      },
    })
    const at = setup.at ?? SPOT
    world.player = { x: at.x, z: at.z, visible: true, dir: DIR.north }
    mapWorld.mapId = setup.mapId ?? SPEAR_PILLAR
    mapWorld.pending = null

    const target = resolveScript(meta, COMMON_SCRIPT_AZURE_FLUTE, -1)
    if (!target) throw new Error('공용 스크립트 2039를 못 찾았다')
    const ctx = new ScriptContext(
      { vars, world, commands: map }, fileBytes(data, target.file), target.file)
    ctx.start(entryOffset(data, target.file, target.entry))
    let ended = false
    for (let frame = 0; frame < 4000; frame++) {
      if (!ctx.step(200_000)) { ended = true; break }
      world.tick()
      // 「불겠습니까」에 예로 답한다. 그 뒤로는 묻는 것이 없다
      if (world.menu !== null) world.choose(world.menu.entries[0]?.value ?? 0)
    }
    // ⚠️ 모듈 전역이라 위에서 `null`을 넣은 것을 타입 좁히기가 기억한다.
    // 한 번 꺼내서 본다
    const { pending } = mapWorld as { pending: { to: number } | null }
    const warpedTo = pending === null ? null : pending.to
    mapWorld.pending = null
    mapWorld.mapId = -1
    return { warpedTo, ended }
  }

  it('⚠️ 조건이 다 맞으면 시작의 방으로 간다 — 계단은 롬이 놓는다', () => {
    const got = blow({})
    expect(got.ended).toBe(true)
    expect(got.warpedTo).toBe(HALL_OF_ORIGIN)
  })

  it('창기둥의 딸린 둘에서도 통한다', () => {
    expect(blow({ mapId: 584 }).warpedTo).toBe(HALL_OF_ORIGIN)
    expect(blow({ mapId: 585 }).warpedTo).toBe(HALL_OF_ORIGIN)
  })

  it.each([
    ['딴 맵', { mapId: 3 }],
    ['같은 맵의 딴 칸', { at: { x: 30, z: 52 } }],
    ['전당등록 전', { completed: false }],
    ['전국도감 전', { nationalDex: false }],
    ['⚠️ 배포 표식이 없을 때 — 시원에게 안 받고는 못 분다', { distribution: false }],
    ['이미 잡았을 때', { caught: true }],
  ])('%s는 안 열리고 스스로 닫는다', (_what, setup: Setup) => {
    const got = blow(setup)
    expect(got.ended).toBe(true)
    expect(got.warpedTo).toBeNull()
  })
})

/**
 * 워프를 건너뛴 스크립트의 **글 뱅크** (`field.ts`의 `switchBank`).
 *
 * ⚠️ **화면에서 잡은 것이다.** 시험은 다 초록인데 시작의 방에 올라가면
 * 아르세우스의 「구콰-쾅!!」 자리에 **「안녕하세요! 포켓몬센터입니다」**가 떴다.
 * 피리가 2000번대 공용 스크립트라 창에 뱅크 213을 얹는데, ① 그 스크립트가
 * 도중에 워프해서 `enterMap`이 **장부(`activeBank`)만** 비우고 창에 얹힌 것은
 * 그대로 두었고, ② 스크립트가 끝날 때 걷는 자리가 없었다 — `endCommon`은
 * **불린** 공용 스크립트만 걷는다. 그래서 다음 스크립트가 남의 뱅크에서 같은
 * 번호를 읽었다. 글자는 멀쩡히 나오므로 눈으로만 보면 그냥 지나간다.
 *
 * 여기서 재는 것은 둘이다 — **워프 뒤에도 그 스크립트의 글이 나오는가**와
 * **끝나면 맵 뱅크로 돌아오는가**.
 */
const bankMaybe = withData('scripts.json', 'scripts.bin', 'maps.json', 'events.json',
  'dialogue/ko/213.json')

bankMaybe('피리가 지나간 뒤의 글 뱅크', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  /** `TEXT_BANK_COMMON_STRINGS`. 2000번대 구역이 읽는 뱅크다 */
  const COMMON_STRINGS_BANK = 213

  /** 피리를 불고 **끝까지** 돌린다. 워프는 씬이 하는 일을 우리가 대신한다 */
  function run(): { printed: string[]; mapId: number } {
    mapWorld.maps = (JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')) as
      { maps: MapHeader[] }).maps
    mapWorld.events = (JSON.parse(readFileSync(resolve(DATA, 'events.json'), 'utf8')) as
      { events: Record<string, EventFile> }).events
    mapWorld.mapId = SPEAR_PILLAR
    mapWorld.grid = null
    mapWorld.pending = null

    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.services = {
      ...stubFieldMoves && {},
      trainerInfo: { ...stubTrainerInfo, nationalDex: () => true },
    } as never
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    // 미리 넣어 두면 fetch가 없다. 맵 뱅크는 없는 채로 두고 아래에서 우리가 넣는다
    fieldScripts.banks = new Map([[COMMON_STRINGS_BANK,
      JSON.parse(readFileSync(resolve(DATA, 'dialogue/ko/213.json'), 'utf8')) as string[]]])
    enterMap(SPEAR_PILLAR)

    fieldScripts.vars.setFlag(FLAG_GAME_COMPLETED)
    fieldScripts.vars.set(
      VAR_DISTRIBUTION_EVENT_FIRST + DISTRIBUTION_EVENT.arceus,
      DISTRIBUTION_MAGIC[DISTRIBUTION_EVENT.arceus]!)
    worldState.player.position.set(SPOT.x + 0.5, 0, SPOT.z + 0.5)
    worldState.player.facing = Math.PI

    start(COMMON_SCRIPT_AZURE_FLUTE, mapById(SPEAR_PILLAR)?.scripts ?? -1)
    const printed: string[] = []
    for (let frame = 0; frame < 4000 && scriptBusy(); frame++) {
      worldState.input.interact = frame % 4 === 0
      scriptSystem.fixedUpdate()
      const world = fieldScripts.world
      if (world?.menu) world.choose(world.menu.entries[0]?.value ?? 0)
      if (world?.printer?.finished === true) {
        const line = printedText(world.printer)
        if (line !== '' && line !== printed[printed.length - 1]) printed.push(line)
      }
      // 씬이 하는 일 — 워프가 걸리면 맵을 갈아 끼우고 `enterMap`을 부른다
      const { pending } = mapWorld as { pending: { to: number } | null }
      if (pending !== null) {
        mapWorld.mapId = pending.to
        mapWorld.pending = null
        enterMap(pending.to)
      }
    }
    worldState.input.interact = false
    return { printed, mapId: mapWorld.mapId }
  }

  it('⚠️ 워프 뒤에도 그 스크립트의 뱅크로 말한다', () => {
    const got = run()
    expect(got.mapId).toBe(HALL_OF_ORIGIN)
    // 이 문장은 맵 뱅크가 아니라 `common_strings`에 있다. 워프가 뱅크를 걷어
    // 버리면 같은 번호의 엉뚱한 문장이 찍힌다
    expect(got.printed).toContain('빛의 계단이 나타났다!')
    expect(fieldScripts.lastError).toBeNull()
  })

  it('⚠️ 끝나면 맵 뱅크로 돌아온다 — 남기면 다음 스크립트가 남의 글을 읽는다', () => {
    run()
    expect(scriptBusy()).toBe(false)
    const world = fieldScripts.world!
    world.setMessages(['시작의 방 0번'])
    world.showMessage(0)
    world.printer!.finish()
    expect(printedText(world.printer!)).toBe('시작의 방 0번')
  })
})
