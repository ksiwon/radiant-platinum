// 말 걸기 → 스크립트 → 대사창까지 (DATA.md §2.3, §2.10, §2.11)
//
// 지금까지의 시험은 조각별이었다. 진입점이 돌아간다, 글자가 한 자씩 나온다,
// 조사가 붙는다. 여기서는 **떡잎마을에 서서 A를 누르는 것부터** 끝까지 간다 —
// 앞 타일의 NPC를 찾고, 그 script 번호를 진입점으로 풀고, 분기를 타고, 창에
// 실제 뱅크의 글자가 찍히고, 버튼으로 닫힌다. 중간 어느 고리가 끊겨도 걸린다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import type { MapHeader, EventFile } from '../map/world'
import { world as mapWorld, npcsOf } from '../map/world'
import { worldState } from '../../state/worldState'
import { buildCommands } from './commands'
import { parseScriptMeta } from './data'
import { fieldScripts, makeWorld, npcAt, scriptBusy, scriptSystem, tileInFront } from './field'
import { printedText } from './printer'
import { VarStore } from './vars'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'scripts.bin'))
  && existsSync(resolve(DATA, 'events.json'))
  && existsSync(resolve(DATA, 'dialogue/ko/554.json'))
const maybe = present ? describe : describe.skip
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 떡잎마을. 대사 뱅크는 맵 헤더의 `msg`가 554번을 가리킨다 */
const TWINLEAF_MAP = 411
const TWINLEAF_BANK = 554
/** 기타리스트의 script 번호. 진입점 2번으로 풀린다 */
const GUITARIST_SCRIPT = 3
/** 도감을 받은 뒤 그가 하는 말 (554번 뱅크 7번) */
const GUITARIST_LINE = '모두 모험을 떠나면서\n어른이 되어가는 것이지'
/** `generated/vars_flags.txt`의 번호 */
const FLAG_HAS_POKEDEX = 144

describe('앞 타일 고르기', () => {
  // `facing`은 `atan2(vx, vz)`라 0이 +z다. 부호를 뒤집으면 등 뒤 NPC에게 말을 건다
  it.each([
    [0, 0, 1],
    [Math.PI / 2, 1, 0],
    [Math.PI, 0, -1],
    [-Math.PI / 2, -1, 0],
  ])('facing %f → (%i, %i)', (facing, dx, dz) => {
    expect(tileInFront(10.5, 20.5, facing)).toEqual({ x: 10 + dx, z: 20 + dz })
  })

  it('타일 안 어디에 서 있든 같은 칸을 본다', () => {
    expect(tileInFront(10.01, 20.99, 0)).toEqual({ x: 10, z: 21 })
    expect(tileInFront(10.99, 20.01, 0)).toEqual({ x: 10, z: 21 })
  })
})

maybe('떡잎마을에서 말 걸기', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const bank = read(`dialogue/ko/${TWINLEAF_BANK}.json`) as string[]

  beforeEach(() => {
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = TWINLEAF_MAP

    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, bank)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    fieldScripts.names = { player: () => '', rival: () => '', counterpart: () => '' }
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })

  /** n 프레임. `a`를 주면 그 프레임 동안 A를 누르고 있는다 */
  const run = (n: number, a = false): void => {
    for (let i = 0; i < n; i++) {
      worldState.input.interact = a
      scriptSystem.fixedUpdate()
    }
  }

  /** A를 한 번 톡 누른다. 눌린 **순간**만 잡히므로 떼는 프레임이 있어야 한다 */
  const tap = (): void => { run(1, true); run(1) }

  const guitarist = () => npcsOf(TWINLEAF_MAP).find((n) => n.script === GUITARIST_SCRIPT)!

  /** 기타리스트 바로 남쪽에 서서 그를 본다 */
  const standInFrontOfGuitarist = (): void => {
    const npc = guitarist()
    worldState.player.position.set(npc.x + 0.5, 0, npc.z - 0.5)
    worldState.player.facing = 0 // +z
  }

  const printed = (): string => printedText(fieldScripts.world!.printer!)

  it('앞 타일 판정이 기타리스트를 집어낸다', () => {
    const npc = guitarist()
    expect(tileInFront(npc.x + 0.5, npc.z - 0.5, 0)).toEqual({ x: npc.x, z: npc.z })
    expect(npcAt(TWINLEAF_MAP, npc.x, npc.z, new VarStore())).toBe(npc)
  })

  it('A를 누르면 대사가 한 자씩 나오고 버튼으로 닫힌다', () => {
    fieldScripts.vars.setFlag(FLAG_HAS_POKEDEX) // 한 쪽으로 끝나는 가지를 고른다
    standInFrontOfGuitarist()
    expect(scriptBusy()).toBe(false)

    run(1, true) // 눌린 순간에 걸린다
    expect(scriptBusy()).toBe(true)

    // 보통 속도는 다섯 프레임에 한 자다. 22자면 아직 한참 남았다
    run(20)
    const partial = printed()
    expect(partial.length).toBeGreaterThan(0)
    expect(GUITARIST_LINE.startsWith(partial)).toBe(true)
    expect(partial).not.toBe(GUITARIST_LINE)

    run(200)
    expect(printed()).toBe(GUITARIST_LINE)
    // 다 찍고 나면 `WaitButton`에서 선다 — 창은 그대로 떠 있다
    expect(fieldScripts.world!.boxOpen).toBe(true)
    expect(scriptBusy()).toBe(true)

    tap()
    run(2)
    expect(scriptBusy()).toBe(false)
    expect(fieldScripts.world!.boxOpen).toBe(false)
    expect(fieldScripts.lastError).toBeNull()
  })

  it('도감이 없으면 다른 대사로 가고 \\r에서 버튼을 기다린다', () => {
    // 6번 글은 `…\r…\f…` 세 쪽짜리다. 버튼을 안 누르면 첫 쪽에서 멈춰 있어야 한다
    standInFrontOfGuitarist()
    run(1, true)
    run(600)
    expect(fieldScripts.world!.lastMessage).not.toBe(7)
    expect(fieldScripts.world!.printer!.waiting).toBe('clear')
    const firstPage = printed()
    expect(firstPage).toContain('찾았단다')
    expect(scriptBusy()).toBe(true)

    // 넘기면 창이 비워지고 다음 쪽이 나온다
    tap()
    run(400)
    expect(printed()).not.toBe(firstPage)
    expect(printed()).toContain('가보는 건 어때?')
  })

  it('이름과 조사가 대사에 들어간다', () => {
    // 이 가지의 글은 "오오! {칸0} 아닌가 / {칸1}{조사 이·가} 찾았단다"다.
    // `BufferPlayerName`·`BufferRivalName`이 칸을 안 채우면 "오오!  아닌가"가 된다
    fieldScripts.names = {
      player: () => '한별',
      rival: () => '광휘',
      counterpart: () => '빛나',
    }
    standInFrontOfGuitarist()
    run(1, true)
    run(600)
    const page = printed()
    expect(page).toContain('한별')
    // 받침 없는 이름이라 '가'가 붙는다. '이'가 붙으면 조사 판정이 뒤집힌 것이다
    expect(page).toContain('광휘가 찾았단다')
  })

  it('스크립트가 도는 동안은 못 움직인다', () => {
    standInFrontOfGuitarist()
    run(1, true)
    worldState.input.move.set(1, 1)
    scriptSystem.fixedUpdate()
    expect(worldState.input.move.x).toBe(0)
    expect(worldState.input.move.y).toBe(0)
  })

  it('아무도 없는 쪽을 보고 누르면 아무 일도 없다', () => {
    standInFrontOfGuitarist()
    worldState.player.facing = Math.PI // 등을 돌린다
    run(3, true)
    expect(scriptBusy()).toBe(false)
  })

  it('플래그가 서면 그 자리에 NPC가 없는 것이 된다', () => {
    // 플래그가 **서 있으면** 숨은 것이다. 반대로 읽으면 이야기가 끝난 NPC에게
    // 계속 말을 걸게 되고, 그건 원작과 다른 게임이 된다
    const npc = npcsOf(TWINLEAF_MAP).find((n) => n.flag !== null && n.flag > 0)!
    const vars = new VarStore()
    expect(npcAt(TWINLEAF_MAP, npc.x, npc.z, vars)).toBe(npc)
    vars.setFlag(npc.flag!)
    expect(npcAt(TWINLEAF_MAP, npc.x, npc.z, vars)).toBeNull()
  })
})
