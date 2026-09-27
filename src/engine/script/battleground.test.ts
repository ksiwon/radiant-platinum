// 배틀그라운드 오늘의 넷 (`GetRandomBattlegroundTrainers` · REPAIR §139)
//
// 뽑는 규칙은 순수 함수로 재고, 원작 `OnTransition`을 실제로 돌려 겉모습 변수와 숨김 표식이 그 넷을 따르는지 본다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BATTLEGROUND_TRAINER_NONE, buildCommands, pickBattlegroundTrainers } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { world as mapWorld, type MapHeader } from '../map/world'
import { DATA, withData } from '../../data/romData.testkit'
import { stubFieldMoves, stubLabels, stubParty, stubTrainerInfo } from './services.testkit'

/** 굴림을 차례로 내준다 — `rand(bound)`가 받는 상한도 같이 적는다 */
function scripted(values: number[]): { rand: (bound: number) => number; bounds: number[] } {
  const bounds: number[] = []
  let i = 0
  return { bounds, rand: (bound) => { bounds.push(bound); return values[i++]! } }
}

describe('오늘의 넷을 뽑는 규칙', () => {
  it('첫째는 관장 여덟 중 하나, 둘째·셋째는 아홉으로 굴려 끝 칸이면 빈다, 넷째는 여섯으로 굴린다', () => {
    const r = scripted([2, 8, 8, 5])
    expect(pickBattlegroundTrainers(r.rand)).toEqual([128, BATTLEGROUND_TRAINER_NONE, BATTLEGROUND_TRAINER_NONE, BATTLEGROUND_TRAINER_NONE])
    expect(r.bounds).toEqual([8, 9, 9, 6])
  })

  it('겹치면 다시 굴린다', () => {
    const r = scripted([0, 0, 3, 3, 0, 7, 1])
    expect(pickBattlegroundTrainers(r.rand)).toEqual([126, 129, 133, 142])
  })

  it('여덟 번째 굴림까지 겹치면 비운다 — 여덟째는 값을 안 본다', () => {
    const r = scripted([4, 4, 4, 4, 4, 4, 4, 4, 0, 1, 4])
    const [, second, third, fourth] = pickBattlegroundTrainers(r.rand)
    expect(second).toBe(BATTLEGROUND_TRAINER_NONE)
    expect(third).toBe(127)
    expect(fourth).toBe(145)
  })
})

const maybe = withData('scripts.json', 'scripts.bin', 'maps.json')

/** `MAP_HEADER_BATTLEGROUND` · `VAR_BATTLEGROUND_TRAINER_1` · `VAR_OBJ_GFX_ID_1` · `FLAG_HIDE_BATTLEGROUND_TRAINER_1` */
const BATTLEGROUND = 454
const VAR_TRAINER_1 = 16485
const VAR_OBJ_GFX_ID_1 = 16417
const FLAG_HIDE_TRAINER_1 = 674
/** `FLAG_TRAVELED_WITH_CHERYL` · `OBJ_EVENT_GFX_CHERYL` — 넷째 자리는 같이 걸었던 사람만 선다 */
const FLAG_TRAVELED_WITH_CHERYL = 227
const GFX_CHERYL = 141

maybe('배틀그라운드 — 들어설 때', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)
  const header = (JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')) as { maps: MapHeader[] }).maps[BATTLEGROUND]!

  function transition(vars: VarStore): void {
    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }), movements: meta.movements,
      services: { party: stubParty, labels: stubLabels, fieldMoves: stubFieldMoves, trainerInfo: stubTrainerInfo },
    })
    mapWorld.mapId = BATTLEGROUND
    // `Battleground_OnTransition`은 넷째 항목이다
    const target = resolveScript(meta, 4, header.scripts)
    if (!target) throw new Error('OnTransition을 못 찾았다')
    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, target.file), target.file)
    ctx.start(entryOffset(data, target.file, target.entry))
    for (let frame = 0; frame < 200; frame++) if (!ctx.step(200_000)) break
    mapWorld.mapId = -1
  }

  it('넷의 겉모습이 뽑힌 넷을 따르고, 빈 자리만 숨는다', () => {
    for (let round = 0; round < 40; round++) {
      const vars = new VarStore()
      vars.setFlag(FLAG_TRAVELED_WITH_CHERYL) // 동행한 사람은 모미 하나 — 넷째가 모미일 때만 선다
      transition(vars)
      const picked = [0, 1, 2, 3].map((i) => vars.get(VAR_TRAINER_1 + i))
      expect(picked.map((_, i) => vars.get(VAR_OBJ_GFX_ID_1 + i))).toEqual(picked)
      expect(picked[0]).toBeGreaterThanOrEqual(126)
      expect(picked[0]).toBeLessThanOrEqual(133)
      const leaders = picked.slice(0, 3).filter((g) => g !== BATTLEGROUND_TRAINER_NONE)
      expect(new Set(leaders).size).toBe(leaders.length)
      for (let i = 1; i < 3; i++) {
        expect(vars.checkFlag(FLAG_HIDE_TRAINER_1 + i), `자리 ${String(i + 1)}`).toBe(picked[i] === BATTLEGROUND_TRAINER_NONE)
      }
      const fourth = picked[3]!
      expect(vars.checkFlag(FLAG_HIDE_TRAINER_1 + 3), `넷째 ${String(fourth)}`).toBe(fourth !== GFX_CHERYL)
      expect(vars.checkFlag(FLAG_HIDE_TRAINER_1)).toBe(false)
    }
  })
})
