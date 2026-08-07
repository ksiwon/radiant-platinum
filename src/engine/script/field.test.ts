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
import {
  BG_EVENT_DIR, mapById, signsOf, TILE_BEHAVIOR_TABLE, triggersOf, world as mapWorld, npcsOf,
} from '../map/world'
import { MapGrid, type MatrixMeta } from '../map/grid'
import { worldState } from '../../state/worldState'
import { buildCommands } from './commands'
import { parseScriptMeta } from './data'
import {
  enterMap, fieldScripts, initScriptsOf, makeWorld, npcAt, resetTriggerTile, scriptBusy,
  scriptSystem, signAt, start, tileInFront, triggerAt,
} from './field'
import { frameTableScript } from './initScripts'
import { npcActors } from '../actor/npcs'
import { printedText } from './printer'
import { VarStore } from './vars'
import { MENU_NO, type FieldWorld } from './world'

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
/** 떡잎마을 숨은 도구. `HIDDEN_ITEM_FLAGS_START`(730) + (8201 − 8000) */
const HIDDEN_ITEM_FLAG_OF_8201 = 730 + 201

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

/** 운하시티 체육관. 트레이너 NPC가 여섯 있는 가장 이른 자리다 */
const GYM_MAP = 35
/** 그중 하나 — 스크립트 3231 = 트레이너 232(현승) */
const GYM_TRAINER_LOCAL_ID = 0
const GYM_TRAINER_ID = 232
const GYM_TRAINER_LINE = '그렇다면-!!\n제대로 한 방을 날려주마!\r'
/** `generated/vars_flags.txt`의 `TRAINER_DEFEATED_FLAGS_START` */
const TRAINER_DEFEATED_FLAGS_START = 1360
/** `TEXT_BANK_COMMON_STRINGS`. 3000번대 구역이 읽는 뱅크다 (미국 번호) */
const COMMON_STRINGS_BANK = 213

maybe('트레이너전', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))

  /** 배틀 화면 대신 이 자리에서 결과를 정한다 */
  const started: number[] = []
  let result: 'win' | 'loss' | null = null

  beforeEach(() => {
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = GYM_MAP
    started.length = 0
    result = null

    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.services = {
      startTrainerBattle: (id) => { started.push(id) },
      battleResult: () => result,
      trainer: (id) => (id === GYM_TRAINER_ID ? { double: false, msg: { '0': 1164, '1': 1165, '2': 1166 } } : null),
      trainerMessage: (index) => (index === 1164 ? GYM_TRAINER_LINE : `#${index}`),
      aliveMons: () => 3,
    }
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    // 트레이너 스크립트는 3000번대라 **글 뱅크가 맵이 아니라 공용 문자열**이다.
    // 미리 넣어 두면 fetch 없이 돈다 (`fieldScripts.banks`)
    fieldScripts.banks = new Map([[COMMON_STRINGS_BANK, read('dialogue/ko/213.json') as string[]]])
    enterMap(GYM_MAP)
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })

  const frames = (n: number, a = false): void => {
    for (let i = 0; i < n; i++) {
      worldState.input.interact = a
      scriptSystem.fixedUpdate()
    }
  }

  /** 그 트레이너 바로 남쪽에 서서 그를 본다 */
  const faceTrainer = (): void => {
    const npc = npcsOf(GYM_MAP).find((n) => n.localID === GYM_TRAINER_LOCAL_ID)!
    worldState.player.position.set(npc.x + 0.5, 0, npc.z - 0.5)
    worldState.player.facing = 0
  }

  it('말을 걸면 싸움 전 대사가 나오고 배틀이 열린다', () => {
    faceTrainer()
    frames(1, true)
    expect(scriptBusy()).toBe(true)

    // 대사가 다 찍힐 때까지 — 그 사이에 배틀은 안 열려야 한다
    frames(300)
    expect(printedText(fieldScripts.world!.printer!)).toContain('제대로 한 방을 날려주마')
    expect(started).toEqual([])

    // 넘기면 대사창을 닫고 배틀로 넘어간다
    frames(1, true)
    frames(20)
    expect(started).toEqual([GYM_TRAINER_ID])
    // 결과가 날 때까지 스크립트는 그 자리에 선다
    frames(10)
    expect(scriptBusy()).toBe(true)
  })

  it('이기면 그 트레이너 플래그가 선다', () => {
    faceTrainer()
    frames(1, true)
    frames(300)
    frames(1, true)
    frames(20)
    expect(started).toEqual([GYM_TRAINER_ID])
    result = 'win'
    frames(20)
    expect(fieldScripts.vars.checkFlag(TRAINER_DEFEATED_FLAGS_START + GYM_TRAINER_ID)).toBe(true)
    expect(scriptBusy()).toBe(false)
    expect(fieldScripts.lastError).toBeNull()
  })

  it('이긴 트레이너에게 다시 말을 걸면 안 싸운다', () => {
    fieldScripts.vars.setFlag(TRAINER_DEFEATED_FLAGS_START + GYM_TRAINER_ID)
    faceTrainer()
    frames(1, true)
    frames(300)
    // 싸움 뒤 대사로 간다 (`GoToIfDefeated` → `PrintTrainerDialogue …, 2`)
    expect(printedText(fieldScripts.world!.printer!)).toContain('#1166')
    expect(started).toEqual([])
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
    worldState.player.position.set(0, 0, 0)
    resetTriggerTile()
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
    // 여러 쪽짜리 글로 간다. 버튼을 안 누르면 첫 쪽에서 멈춰 있어야 한다
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

  it('떡잎마을의 숨은 도구는 주우면 사라진다', () => {
    // 떡잎마을 간판 구역에 든 것은 숨은 도구 하나뿐이다. scriptID 8201이
    // 도구 번호와 플래그를 한 수에 담고 있다 — 플래그 = 730 + (8201 − 8000)
    const [sign] = signsOf(TWINLEAF_MAP)
    expect(sign!.type).toBe(2)
    expect(sign!.facing).toBe(BG_EVENT_DIR.all)
    const vars = new VarStore()
    expect(signAt(TWINLEAF_MAP, sign!.x, sign!.z, 0, vars)).toBe(sign)
    vars.setFlag(HIDDEN_ITEM_FLAG_OF_8201)
    expect(signAt(TWINLEAF_MAP, sign!.x, sign!.z, 0, vars)).toBeNull()
  })

  it('간판은 맞는 방향에서만 읽힌다', () => {
    // 방향이 붙은 간판 418개가 있다. 원작이 그러는 이유는 벽에 붙은 간판을
    // 옆에서 읽으면 이상해서다
    const northSign = { script: 1, type: 0, x: 10, z: 20, y: 0, facing: BG_EVENT_DIR.north }
    mapWorld.events!['390']!.signs.push(northSign)
    const vars = new VarStore()
    // z가 커지는 쪽이 남쪽이다 → −z(사분면 2)를 보는 것이 북쪽을 보는 것이다
    expect(signAt(TWINLEAF_MAP, 10, 20, 2, vars)).toBe(northSign)
    expect(signAt(TWINLEAF_MAP, 10, 20, 0, vars)).toBeNull()
    mapWorld.events!['390']!.signs.pop()
  })

  it('떡잎마을 북쪽 끝을 밟으면 트리거가 걸린다', () => {
    // 상자 8×1이 마을 북쪽 출구를 가로지른다. 조건 변수가 맞을 때만 돈다
    const north = triggersOf(TWINLEAF_MAP).find((t) => t.width === 8)!
    const vars = new VarStore()
    expect(triggerAt(TWINLEAF_MAP, north.x, north.z, vars)).toBeNull()
    vars.set(north.var, north.value)
    expect(triggerAt(TWINLEAF_MAP, north.x, north.z, vars)).toBe(north.script)
    // 상자 밖은 안 걸린다 — 폭을 잘못 읽으면 마을 절반이 트리거가 된다
    expect(triggerAt(TWINLEAF_MAP, north.x + north.width, north.z, vars)).toBeNull()
    expect(triggerAt(TWINLEAF_MAP, north.x, north.z + 1, vars)).toBeNull()
  })

  it('밟은 칸이 바뀔 때만 트리거가 돈다', () => {
    const north = triggersOf(TWINLEAF_MAP).find((t) => t.width === 8)!
    fieldScripts.vars.set(north.var, north.value)
    // 도착한 자리는 "이미 밟은 것"으로 친다 — 문에서 나오자마자 도는 것을 막는다
    worldState.player.position.set(north.x + 0.5, 0, north.z + 0.5)
    resetTriggerTile()
    run(2)
    expect(scriptBusy()).toBe(false)
    // 한 칸 나갔다가 다시 들어오면 걸린다
    worldState.player.position.set(north.x + 0.5, 0, north.z + 1.5)
    run(1)
    worldState.player.position.set(north.x + 0.5, 0, north.z + 0.5)
    run(1)
    expect(scriptBusy()).toBe(true)
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

/**
 * 포켓몬센터 간호사 — 공용 스크립트를 타고 가는 유일한 갈래.
 *
 * ⚠️ **이 자리가 오래 비어 있었다.** 간호사의 맵 스크립트는 `SetVar` 하나에
 * `CallCommonScript 2002`가 전부다. 그 명령을 안 만들고 건너뛰고 있었으니
 * 말을 걸어도 아무 일이 안 일어났다 — 창도 안 뜨므로 "말이 안 걸린다"로 보인다.
 *
 * 그래서 여기서는 **말을 건 결과 창에 원작 문장이 찍히는가**를 잰다. 명령을
 * 도로 건너뛰면 창이 아예 안 뜨고, 글 뱅크를 안 갈면 같은 번호의 엉뚱한
 * 문장이 찍힌다.
 */
const JUBILIFE_PC = 6
/** 간호사가 서는 칸. 열여덟 센터가 전부 같은 자리다 */
const NURSE = { x: 8, z: 4 }
/** 그 앞 칸의 타일 동작 — 계산대(`TILE_BEHAVIOR_TABLE`) */
const COUNTER = { x: 8, z: 5 }

maybe('포켓몬센터 간호사', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const common = read('dialogue/ko/213.json') as string[]
  const interiors = read('matrices/interiors.json') as {
    matrices: Record<string, MatrixMeta & { byteOffset: number }>
  }
  const blob = readFileSync(resolve(DATA, 'matrices/interiors.bin'))

  const gridFor = (matrix: number): MapGrid => {
    const m = interiors.matrices[String(matrix)]!
    const ab = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer
    return new MapGrid(m, new Uint16Array(ab, m.byteOffset, m.tileWidth * m.tileHeight))
  }

  let healed = 0

  beforeEach(() => {
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = JUBILIFE_PC
    mapWorld.grid = gridFor(mapById(JUBILIFE_PC)!.matrix)
    healed = 0

    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.services = { healParty: () => { healed++ } }
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    // 2000번대 구역은 `TEXT_BANK_COMMON_STRINGS`를 읽는다. 미리 넣어 두면 fetch가 없다
    fieldScripts.banks = new Map([[COMMON_STRINGS_BANK, common]])
    enterMap(JUBILIFE_PC)
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
    // 계산대 남쪽에 서서 북쪽(간호사 쪽)을 본다
    worldState.player.position.set(COUNTER.x + 0.5, 0, COUNTER.z + 1.5)
    worldState.player.facing = Math.PI
    resetTriggerTile()
  })

  const frames = (n: number, a = false): void => {
    for (let i = 0; i < n; i++) {
      worldState.input.interact = a
      scriptSystem.fixedUpdate()
    }
  }
  /** A를 한 번 톡. 눌린 **순간**만 잡히므로 떼는 프레임이 있어야 한다 */
  const tap = (): void => { frames(1, true); frames(3) }
  const printed = (): string => {
    const printer = fieldScripts.world!.printer
    return printer === null ? '' : printedText(printer)
  }

  it('계산대 너머의 간호사가 말 걸 상대로 잡힌다', () => {
    // 앞 칸은 계산대라 사람이 없다. 한 칸 더 봐야 간호사에 닿는다
    expect(mapWorld.grid!.behavior(COUNTER.x, COUNTER.z)).toBe(TILE_BEHAVIOR_TABLE)
    expect(npcAt(JUBILIFE_PC, COUNTER.x, COUNTER.z, fieldScripts.vars)).toBeNull()
    const nurse = npcAt(JUBILIFE_PC, NURSE.x, NURSE.z, fieldScripts.vars)
    expect(nurse).not.toBeNull()
    // 간호사의 맵 스크립트는 딱 세 명령이다 — 그중 하나가 `CallCommonScript`다
    expect(nurse!.script).toBe(1)
  })

  it('말을 걸면 공용 스크립트가 돌고 원작 인사말이 나온다', () => {
    frames(1, true)
    expect(scriptBusy()).toBe(true)
    frames(200)
    // ⚠️ 이 문장은 **맵 뱅크가 아니라 `common_strings`**에 있다. 뱅크를 안 갈면
    // 같은 번호의 엉뚱한 문장이 찍히고, 명령을 건너뛰면 창이 아예 안 뜬다
    expect(printed()).toBe('안녕하세요!\n포켓몬센터입니다')
    expect(fieldScripts.world!.boxOpen).toBe(true)
    expect(fieldScripts.lastError).toBeNull()
  })

  /** 예/아니오가 뜰 때까지 넘긴다. **누르기 전에** 물어봐야 답이 안 새어 나간다 */
  const untilMenu = (): FieldWorld['menu'] => {
    for (let i = 0; i < 80; i++) {
      const menu = fieldScripts.world!.menu
      if (menu !== null) return menu
      tap()
    }
    return null
  }

  /** 스크립트가 끝날 때까지 넘긴다 */
  const untilIdle = (): void => {
    for (let i = 0; i < 300 && scriptBusy(); i++) tap()
  }

  it('"쉬게 해 주겠습니까?"까지 가고 예/아니오가 뜬다', () => {
    frames(1, true)
    const menu = untilMenu()
    expect(printed()).toBe('당신의 포켓몬을\n쉬게 해 주겠습니까?')
    expect(menu?.kind).toBe('yesno')
    expect(menu?.entries.map((e) => e.text)).toEqual(['예', '아니오'])
  })

  it('"아니오"면 회복 없이 끝난다', () => {
    frames(1, true)
    expect(untilMenu()).not.toBeNull()
    fieldScripts.world!.choose(MENU_NO)
    untilIdle()
    expect(healed).toBe(0)
    expect(scriptBusy()).toBe(false)
    expect(fieldScripts.lastError).toBeNull()
  })

  it('"예"면 파티가 회복된다', () => {
    frames(1, true)
    expect(untilMenu()).not.toBeNull()
    fieldScripts.world!.choose(0)
    untilIdle()
    expect(healed).toBe(1)
    expect(fieldScripts.lastError).toBeNull()
  })

  it('공용 스크립트가 끝나면 글이 맵 뱅크로 돌아온다', () => {
    // 안 돌리면 다음 대사가 `common_strings`의 같은 번호로 찍힌다
    const world = fieldScripts.world!
    world.setMessages(['맵 뱅크 0번'])
    frames(1, true)
    expect(untilMenu()).not.toBeNull()
    world.choose(MENU_NO)
    untilIdle()
    world.showMessage(0)
    world.printer!.finish()
    expect(printedText(world.printer!)).toBe('맵 뱅크 0번')
  })
})

/**
 * 간판 판 (`Signpost`).
 *
 * ⚠️ **간판 절반이 대사창이 아니다.** 마을 이름표·우편함·도로 표지판은
 * `ShowMapSign` 같은 매크로로 뜨는데, 그 다섯 명령을 안 만들고 있어서 읽어도
 * 아무 일이 안 났다. 여기서는 떡잎마을 이름표를 실제로 밟아 본다.
 */
maybe('간판 판', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const bank = read(`dialogue/ko/${TWINLEAF_BANK}.json`) as string[]
  /** `scripts_twinleaf_town`의 마을 이름표 진입점 (`TwinleafTown_MapSignpost`) */
  const MAP_SIGN_ENTRY = 6
  const TWINLEAF_SCRIPTS = 1052
  /** 맵 스크립트 번호는 **진입점 + 1**이다 (`resolveScript`) */
  const SCRIPT_ENTRY_BASE = 1
  /**
   * 떡잎마을 이름표가 보여 줄 약도 번호.
   *
   * 스크립트가 안 주므로 배치표에서 와야 하는데, 이 간판은 맵 스크립트로 직접
   * 걸어서 말을 건 상대가 없다 — 그때는 0(빈 판)이다
   */
  const TWINLEAF_SIGN_PICTURE = 0

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
    worldState.input.interact = false
  })

  const run = (n: number, a = false): void => {
    for (let i = 0; i < n; i++) {
      worldState.input.interact = a
      scriptSystem.fixedUpdate()
    }
  }

  it('마을 이름표를 읽으면 판이 뜨고 원작 글이 그대로 나온다', () => {
    // 진입점 번호로 바로 건다 — 이 간판은 타일 거동으로 열리는 것이 아니라
    // 맵 스크립트라 자리를 잡고 서는 것까지 흉내 낼 이유가 없다
    expect(start(SCRIPT_ENTRY_BASE + MAP_SIGN_ENTRY, TWINLEAF_SCRIPTS)).toBe(true)
    run(1)
    const world = fieldScripts.world!
    // ⚠️ 대사창이 아니라 **간판 판**이다. `signpost`가 null이면 같은 글이
    // 아래쪽 대사창에 떠서 "누가 말을 걸었나" 싶게 읽힌다
    // 종류 0(지도)이라 나무 판이다. 그림 번호는 **배치표의 `data[0]`**에서 온다 —
    // 매크로가 인자를 0으로 두므로 스크립트만 봐서는 알 수 없다
    expect(world.signpost).toEqual({ type: 0, picture: TWINLEAF_SIGN_PICTURE })
    expect(printedText(world.printer!)).toBe('여기는 떡잎마을\n어린잎이 숨 쉬는 장소')
    expect(fieldScripts.lastError).toBeNull()
  })

  it('버튼을 누르면 판이 걷히고 스크립트가 끝난다', () => {
    start(SCRIPT_ENTRY_BASE + MAP_SIGN_ENTRY, TWINLEAF_SCRIPTS)
    run(1)
    expect(fieldScripts.world!.signpost?.type).toBe(0)
    run(3, true)
    run(30)
    expect(fieldScripts.world!.signpost).toBeNull()
    expect(scriptBusy()).toBe(false)
    expect(fieldScripts.lastError).toBeNull()
  })
})

// ── 맵 초기화 스크립트 ───────────────────────────────────────────────────────
//
// 맵에 들어서면 그 맵의 `OnTransition`이 **사람을 세우기 전에** 돌면서 배치표를
// 고친다. 예진호수의 마박사가 그 예다 — 이야기가 어디까지 왔는지에 따라 세
// 자리 중 하나에 선다.
//
// ⚠️ **이 고리가 끊겨도 화면은 멀쩡하다.** 마박사가 롬의 기본 자리(53, 39)에
// 그냥 서 있을 뿐이라, 원작을 옆에 놓고 보지 않는 한 안 보인다. 그리고 그
// 자리는 이야기가 시작되는 칸이 아니라서 **오프닝이 한 걸음도 안 나간다.**

/** 예진호수. `map_headers.txt`의 312번 (`D27R0102`) */
const LAKE_VERITY = 312
/** `events_lake_verity.json`의 여섯 번째 객체 */
const LOCALID_PROF_ROWAN = 5
const LOCALID_COUNTERPART = 6
/** `generated/vars_flags.txt` */
const VAR_LAKE_VERITY_PROF_ROWAN_STATE = 0x4097
const FLAG_TEAM_GALACTIC_LEFT_LAKE_VERITY = 186
/** `LakeVerity_OnFrame_ProfRowanNoticePlayer` — 진입점 표의 다섯 번째 */
const LAKE_VERITY_ON_FRAME = 5

maybe('맵 초기화 스크립트', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))

  beforeEach(() => {
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = LAKE_VERITY
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.services = {}
    fieldScripts.world = makeWorld(fieldScripts.vars, [])
    fieldScripts.ctx = null
  })

  const rowan = () => npcActors.byLocalID.get(LOCALID_PROF_ROWAN)!

  it('배치표의 자리가 아니라 이야기가 정한 자리에 선다', () => {
    // 롬의 기본 자리는 (53, 39)다. 그대로면 초기화 스크립트가 안 돈 것이다
    expect(npcsOf(LAKE_VERITY).find((n) => n.localID === LOCALID_PROF_ROWAN))
      .toMatchObject({ x: 53, z: 39 })

    enterMap(LAKE_VERITY)
    // `LakeVerity_SetPositionsDuringTeamGalactic`이 (46, 51)에 세우고, 곧이어
    // `LakeVerity_SetProfRowanStartPosition`이 (46, 50)으로 한 칸 올린다 —
    // **두 번째 것이 이긴다.** 순서를 뒤집으면 한 칸 아래에 서고, 그러면
    // 좌표 트리거가 안 걸린다
    expect({ x: rowan().x, z: rowan().z, dir: rowan().dir }).toEqual({ x: 46, z: 50, dir: 0 })
  })

  it('이야기가 지나가면 다른 자리에 선다', () => {
    fieldScripts.vars.setFlag(FLAG_TEAM_GALACTIC_LEFT_LAKE_VERITY)
    fieldScripts.vars.set(VAR_LAKE_VERITY_PROF_ROWAN_STATE, 1)
    enterMap(LAKE_VERITY)
    // `LakeVerity_SetPositionsAfterTeamGalactic` — 둘이 나란히 서쪽을 본다
    expect({ x: rowan().x, z: rowan().z, dir: rowan().dir }).toEqual({ x: 50, z: 37, dir: 2 })
    const other = npcActors.byLocalID.get(LOCALID_COUNTERPART)!
    expect({ x: other.x, z: other.z, dir: other.dir }).toEqual({ x: 50, z: 39, dir: 2 })
  })

  it('매 프레임 표가 조건이 맞을 때만 스크립트를 건다', () => {
    const init = initScriptsOf(LAKE_VERITY)!
    expect(init.frame).toEqual([
      { left: VAR_LAKE_VERITY_PROF_ROWAN_STATE, right: 0, script: LAKE_VERITY_ON_FRAME },
    ])
    const vars = fieldScripts.vars
    expect(frameTableScript(init, (id) => vars.get(id))).toBe(LAKE_VERITY_ON_FRAME)
    // 걸린 스크립트가 **스스로** 이 변수를 1로 바꾼다. 그래서 한 번만 돈다
    vars.set(VAR_LAKE_VERITY_PROF_ROWAN_STATE, 1)
    expect(frameTableScript(init, (id) => vars.get(id))).toBeNull()
  })
})
