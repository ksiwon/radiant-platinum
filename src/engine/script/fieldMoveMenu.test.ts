// 기술 창에서 쓰는 비전머신 (DATA.md §4.6)
//
// 앞에 대고 A를 누르는 길과 **조건이 같아야** 한다 — 원작도 두 길이 같은
// `FieldMoves_Check*`를 지난다. 다른 것은 여기서는 "왜 안 되는지"를 돌려준다는
// 것뿐이고, 그 이유가 화면에 뜬다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import { parseScriptMeta, resolveScript } from './data'
import { withData } from '../../data/romData.testkit'
import {
  clearOverworldWeather, OVERWORLD_WEATHER, overworldWeather,
} from '../world/overworldWeather'
import { fieldMoveFromMenu, fieldScripts, makeWorld } from './field'
import { buildCommands } from './commands'
import { VarStore } from './vars'
import { BADGE, FIELD_MOVES } from './fieldMoves'
import { world as mapWorld } from '../map/world'
import { worldState } from '../../state/worldState'
import { npcActors } from '../actor/npcs'
import type { MapGrid } from '../map/grid'
import type { NpcActor } from '../actor/npcs'
import { stubFieldMoves } from './services.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 필요한 것만 갖춘 격자. `behavior`가 주는 값을 시험이 갈아 끼운다 */
function fakeGrid(behavior: number) {
  return {
    behavior: () => behavior,
    isBlocked: () => false,
  } as unknown as MapGrid
}

/** 뱃지와 파티를 세운다 */
function trainer(badges: number, moves: number[]) {
  fieldScripts.services = {
    fieldMoves: { ...stubFieldMoves, badges: () => badges, knows: (m) => moves.includes(m) },
  }
}

const SURF = FIELD_MOVES.surf.move
const CUT = FIELD_MOVES.cut.move
const FLY = FIELD_MOVES.fly.move
/** `WATER_SEA` */
const WATER = 0x15

beforeEach(() => {
  npcActors.list = []
  worldState.player.position.set(0.5, 0, 0.5)
  worldState.player.facing = 0 // +z
  worldState.player.surfing = false
  worldState.player.strength = false
  worldState.player.hop.active = false
  mapWorld.grid = fakeGrid(0)
  fieldScripts.services = {}
})

describe('기술 창에서 쓴다', () => {
  it('비전머신이 아닌 기술은 아무것도 아니다', () => {
    trainer(0xff, [1])
    // 1번은 막치기다. 밖에서 쓸 것이 아니므로 null이 나와야 한다
    expect(fieldMoveFromMenu(1)).toBeNull()
  })

  it('뱃지가 없으면 뱃지 탓이라고 말한다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(0, [SURF])
    expect(fieldMoveFromMenu(SURF)).toBe('badge')
  })

  it('그 기술을 아는 파티원이 없으면 파티 탓이라고 말한다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(1 << BADGE.fen, [])
    expect(fieldMoveFromMenu(SURF)).toBe('party')
  })

  it('자격이 있어도 자리가 아니면 안 나간다', () => {
    // 물이 아닌 데서 파도타기
    mapWorld.grid = fakeGrid(0)
    trainer(1 << BADGE.fen, [SURF])
    expect(fieldMoveFromMenu(SURF)).toBe('notHere')
    expect(worldState.player.surfing).toBe(false)
  })

  it('물 앞에서 자격이 있으면 실제로 탄다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(1 << BADGE.fen, [SURF])
    expect(fieldMoveFromMenu(SURF)).toBe('used')
    expect(worldState.player.surfing).toBe(true)
    // 물 칸으로 한 칸 뛴다 — 뭍에 선 채로 상태만 세우면 그 프레임에 내린다
    expect(worldState.player.hop.active).toBe(true)
  })

  it('벨 나무 앞에서는 그 나무가 사라진다', () => {
    const tree: NpcActor = {
      localID: 0,
      info: { sprite: 86 } as NpcActor['info'],
      gfx: 86,
      x: 0, z: 1, y: 0, dir: 0, visible: true, movementType: 0, params: [], ambient: null, speed: 0, tickX: 0, tickZ: 0,
    }
    npcActors.list = [tree]
    trainer(1 << BADGE.forest, [CUT])
    expect(fieldMoveFromMenu(CUT)).toBe('used')
    expect(tree.visible).toBe(false)
    // 나무가 없으면 벨 것도 없다
    expect(fieldMoveFromMenu(CUT)).toBe('notHere')
  })

  it('공중날기는 여기서 안 끝난다 — 어디로 갈지는 화면이 고른다', () => {
    trainer(1 << BADGE.cobble, [FLY])
    expect(fieldMoveFromMenu(FLY)).toBe('fly')
    // 뱃지가 없으면 목적지를 물어보기 전에 걸린다
    trainer(0, [FLY])
    expect(fieldMoveFromMenu(FLY)).toBe('badge')
  })

  it('이미 타고 있으면 파도타기가 다시 안 나간다', () => {
    mapWorld.grid = fakeGrid(WATER)
    trainer(1 << BADGE.fen, [SURF])
    worldState.player.surfing = true
    expect(fieldMoveFromMenu(SURF)).toBe('notHere')
  })
})

/**
 * 비전머신은 **원작 스크립트로 넘긴다** (`FieldMoves_Set*Task`).
 *
 * ⚠️ **진입점 번호가 하나만 어긋나도 조용히 엉뚱한 장면이 돈다.** 표가
 * `scripts_field_moves.s`의 `ScriptEntry` 차례고, 그 파일에는 더미 진입점
 * (`FieldMoves_Dummy8`)까지 섞여 있어서 눈으로 세면 틀린다. 그래서 실제
 * 스크립트 자료에 대고 확인한다 — 뽑아 둔 구간표가 10000번을
 * `TEXT_BANK_FIELD_MOVES`(381)로 푼다
 */
// ⚠️ 롬을 안 뽑은 기계에서는 건너뛴다 — 다른 자료 시험과 같은 규칙이다
withData('scripts.json')('비전머신이 부르는 원작 스크립트', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  /** `SCRIPT_ID(FIELD_MOVES, 0)` */
  const BASE = 10_000

  it('구간표가 10000번대를 `FIELD_MOVES` 파일로 푼다', () => {
    const at = resolveScript(meta, BASE, -1)
    expect(at, 'FIELD_MOVES 구간이 없다').not.toBeNull()
    expect(at!.msg, '글 뱅크가 `TEXT_BANK_FIELD_MOVES`가 아니다').toBe(381)
    // 그 파일에 진입점 열여섯이 다 있어야 한다 (`ScriptEntryEnd`까지)
    expect(meta.files[at!.file]?.entries ?? 0).toBeGreaterThanOrEqual(16)
  })

  it.each([
    ['앞 칸 — 폭포', 6],
    ['앞 칸 — 바위벽', 3],
    ['앞 칸 — 물', 4],
    ['창 — 풀베기', 8],
    ['창 — 바위깨기', 9],
    ['창 — 괴력', 10],
    ['창 — 락클라임', 11],
    ['창 — 파도타기', 12],
    ['창 — 폭포', 13],
    ['창 — 안개제거', 14],
    ['창 — 플래시', 15],
  ])('%s 진입점이 실제로 있다', (_what, entry) => {
    const at = resolveScript(meta, BASE + entry, -1)
    expect(at).not.toBeNull()
    expect(at!.entry).toBe(entry)
    expect(entry).toBeLessThan(meta.files[at!.file]?.entries ?? 0)
  })
})

/**
 * 안개제거·플래시는 **날씨가 정한다** (`FieldMoves_CanUseMoves`의 끝 `switch`).
 *
 * ⚠️ **한동안 이 둘이 영영 안 나갔다.** 「날씨 자료를 아직 안 뽑았다」고 적혀
 * 있었지만 실제로는 뽑혀 있었고(`maps.json`의 `weather`), 빠진 것은 그 값을
 * `FieldSpot`에 넣는 두 줄이었다
 */
withData('scripts.json', 'scripts.bin')('날씨가 여는 비전머신', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const DEFOG = FIELD_MOVES.defog.move
  const FLASH = FIELD_MOVES.flash.move

  /**
   * ⚠️ **진짜 스크립트를 걸 수 있게 세운다.** 자료가 없으면 `start`가 거짓을
   * 돌려주고 `fieldMoveFromMenu`가 옛 길(`runFieldMove`)로 되돌아가는데,
   * 그쪽에는 안개제거·플래시 갈래가 아예 없어서 **날씨를 켜든 끄든 똑같이
   * 안 나간다** — 그러면 이 시험이 아무것도 안 잰다
   */
  beforeEach(() => {
    clearOverworldWeather()
    fieldScripts.data = {
      meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
    }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.varsReady = true
    fieldScripts.ctx = null
    trainer(0xff, [DEFOG, FLASH])
  })

  it('맑으면 둘 다 안 나간다', () => {
    expect(fieldMoveFromMenu(DEFOG)).toBe('notHere')
    expect(fieldMoveFromMenu(FLASH)).toBe('notHere')
  })

  it('안개에서는 안개제거만, 어둠에서는 플래시만 나간다', () => {
    overworldWeather.value = OVERWORLD_WEATHER.fog
    expect(fieldMoveFromMenu(FLASH)).toBe('notHere')
    expect(fieldMoveFromMenu(DEFOG)).toBe('used')
    fieldScripts.ctx = null
    overworldWeather.value = OVERWORLD_WEATHER.darkFlash
    expect(fieldMoveFromMenu(DEFOG)).toBe('notHere')
    expect(fieldMoveFromMenu(FLASH)).toBe('used')
  })

  it('안개를 걷은 뒤에는 다시 안 권한다', () => {
    overworldWeather.value = OVERWORLD_WEATHER.fog
    expect(fieldMoveFromMenu(DEFOG)).toBe('used')
    // `ScrCmd_0C4`가 그 스크립트 안에서 하는 일
    clearOverworldWeather()
    fieldScripts.ctx = null
    expect(fieldMoveFromMenu(DEFOG)).toBe('notHere')
  })
})
