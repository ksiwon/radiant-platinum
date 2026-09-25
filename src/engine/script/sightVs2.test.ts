// 두 트레이너의 시야가 겹치는 자리 (PARITY §2.2b · `trainer_encounter.c` 84)
//
// 원작은 눈이 마주친 첫 사람이 **혼자 오는** 트레이너면 그 사람을 뺀 채로 시야를
// 한 번 더 훑는다. 둘째가 있고 두 마리가 싸울 수 있으면(동행이 있으면 늘 참)
// 둘이 같이 온다 — `APPROACH_TYPE_VS2`, 곧 트레이너 둘과의 2vs2다.
//
// **재는 것:**
//   ① 둘이 보면 둘 다 VS2로 적힌다 — 둘째는 제 거리·방향으로 온다
//   ② 싸울 수 있는 마리가 하나면 첫 사람만 온다
//   ③ 동행이 붙어 있으면 한 마리여도 둘이 온다 (`field_control.c` 184)
//   ④ 더블 트레이너는 두 마리가 없으면 아예 안 온다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { EventFile, MapHeader, Npc } from '../map/world'
import { world as mapWorld } from '../map/world'
import type { MapGrid } from '../map/grid'
import { worldState } from '../../state/worldState'
import {
  buildCommands, SCRIPT_ID_OFFSET_DOUBLE_BATTLES, SCRIPT_ID_OFFSET_SINGLE_BATTLES, SYSTEM_FLAG,
} from './commands'
import { parseScriptMeta } from './data'
import { enterMap, fieldScripts, makeWorld, resetSightTile, scriptStepSystem } from './field'
import { addNpcFrom, clearNpcs } from '../actor/npcs'
import { APPROACH_TYPE } from '../actor/approach'
import { DIR } from './movement'
import { VarStore } from './vars'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'scripts.json', 'maps.json', 'events.json', 'dialogue/ko/213.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 운하시티 체육관 — 맵 머리말과 스크립트 뱅크만 빌린다. 사람은 우리가 세운다 */
const MAP = 35
const COMMON_STRINGS_BANK = 213
const A = { localID: 50, trainer: 700 }
const B = { localID: 51, trainer: 701 }

/** 그 자리에 서서 그쪽을 보는 트레이너. 시야는 네 칸이다 */
const trainerAt = (who: { localID: number; trainer: number }, x: number, z: number, facing: number): Npc => ({
  x, z, height: 0, localID: who.localID, sprite: 1, move: 0,
  trainerType: 1, facing, script: SCRIPT_ID_OFFSET_SINGLE_BATTLES + who.trainer - 1,
  flag: null, range: [0, 0], raw: [0, 0, 0, 0, 0, 0, 0, 4],
})

/** 막는 것도 높이도 없는 땅 — 시야 판정이 보는 것은 이 둘뿐이다 */
const OPEN_GROUND = new Proxy({}, { get: () => () => 0 }) as unknown as MapGrid

maybe('두 트레이너의 시야', () => {
  let alive = 2
  let double = false

  beforeEach(() => {
    const meta = parseScriptMeta(read('scripts.json'))
    const raw = readFileSync(resolve(DATA, 'scripts.bin'))
    mapWorld.maps = (read('maps.json') as { maps: MapHeader[] }).maps
    mapWorld.events = (read('events.json') as { events: Record<string, EventFile> }).events
    mapWorld.mapId = MAP
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    alive = 2
    double = false
    fieldScripts.services = {
      startTrainerBattle: () => {},
      battleResult: () => null,
      trainer: () => ({ double, msg: {}, class: 0 }),
      trainerMessage: () => '',
      aliveMons: () => alive,
    }
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    fieldScripts.varsReady = true
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    fieldScripts.banks = new Map([[COMMON_STRINGS_BANK, read('dialogue/ko/213.json') as string[]]])
    enterMap(MAP)
    // 체육관 사람들은 치운다 — 우리가 세운 둘만 본다
    clearNpcs()
    addNpcFrom(trainerAt(A, 10, 6, DIR.south), fieldScripts.vars)
    addNpcFrom(trainerAt(B, 14, 10, DIR.west), fieldScripts.vars)
    mapWorld.grid = OPEN_GROUND
    worldState.input.interact = false
    worldState.input.cancel = false
    worldState.input.move.set(0, 0)
  })

  afterEach(() => {
    clearNpcs()
    mapWorld.grid = null
    fieldScripts.ctx = null
  })

  /** 남쪽에서 걸어 올라와 두 시야가 겹치는 (10, 10)에 선다 */
  const walkIn = (): void => {
    worldState.player.position.set(10.5, 0, 12.5)
    resetSightTile()
    worldState.player.position.set(10.5, 0, 10.5)
    scriptStepSystem.fixedUpdate()
  }

  it('① 둘이 한꺼번에 보면 둘 다 VS2다 — 둘째는 제 시야로 온다', () => {
    walkIn()
    const [first, second] = fieldScripts.world!.approaching
    expect(first?.trainerID).toBe(A.trainer)
    expect(first?.type).toBe(APPROACH_TYPE.vs2)
    expect(second?.trainerID).toBe(B.trainer)
    expect(second?.localID).toBe(B.localID)
    expect(second?.type).toBe(APPROACH_TYPE.vs2)
    // 둘째는 서쪽을 보고 네 칸 떨어져 있다 — 첫 사람 값을 물려받지 않는다
    expect(second?.direction).toBe(DIR.west)
    expect(second?.sightRange).toBe(4)
  })

  it('② 싸울 수 있는 마리가 하나면 첫 사람만 온다', () => {
    alive = 1
    walkIn()
    const [first, second] = fieldScripts.world!.approaching
    expect(first?.type).toBe(APPROACH_TYPE.singles)
    expect(second).toBeNull()
  })

  it('③ 동행이 붙어 있으면 한 마리여도 둘이 온다', () => {
    alive = 1
    fieldScripts.vars.setFlag(SYSTEM_FLAG.hasPartner)
    walkIn()
    const [first, second] = fieldScripts.world!.approaching
    expect(first?.type).toBe(APPROACH_TYPE.vs2)
    expect(second?.trainerID).toBe(B.trainer)
  })

  it('⑤ 더블 한 쌍은 **트레이너 번호로** 짝을 찾는다 — 짝의 스크립트는 5000번대다', () => {
    // 209번도로 쌍둥이가 3293·5293이다 (`tools/jsoncnv/convert.py` 81). 스크립트가 같기를
    // 바라면 짝이 안 걸려 한 사람만 걸어왔다 (`FindTrainerPartner` · `trainer_encounter.c` 356)
    double = true
    clearNpcs()
    addNpcFrom(trainerAt(A, 10, 6, DIR.south), fieldScripts.vars)
    addNpcFrom({
      ...trainerAt({ localID: 52, trainer: A.trainer }, 11, 6, DIR.south),
      script: SCRIPT_ID_OFFSET_DOUBLE_BATTLES + A.trainer - 1,
    }, fieldScripts.vars)
    walkIn()
    const [first, second] = fieldScripts.world!.approaching
    expect(first?.type).toBe(APPROACH_TYPE.doubles)
    expect(second?.localID).toBe(52)
    expect(second?.trainerID).toBe(A.trainer)
  })

  it('④ 더블 트레이너는 두 마리가 없으면 아예 안 온다', () => {
    alive = 1
    double = true
    walkIn()
    expect(fieldScripts.ctx, '다가오는 스크립트가 걸렸다').toBeNull()
  })
})
