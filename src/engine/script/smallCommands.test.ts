// 매 판 밟는 작은 명령들 (COMPLETION 1단계)
//
// 없던 동안 공통점이 하나였다 — **답 칸에 앞 명령의 값이 남았다.** 그래서 여기서는 답 칸에 일부러 엉뚱한 값을 먼저
// 넣어 두고, 명령이 그것을 제 답으로 덮는지를 본다. 명령 하나씩을 바이트로 짜서 돌린다 (원작 인자 차례 그대로)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCommands, pokedexRatingMessage, VAR_DAILY_RANDOM_LEVEL, VAR_NEWS_PRESS_DEADLINE } from './commands'
import { ScriptContext } from './context'
import { parseScriptMeta } from './data'
import { VarStore } from './vars'
import { FieldWorld, type FieldServices } from './world'
import { DATA, withData } from '../../data/romData.testkit'
import { stubFieldMoves, stubLabels, stubParty, stubTrainerInfo } from './services.testkit'

const maybe = withData('scripts.json')
const DEST = 0x8004

describe('도감 평가 문턱 (`Pokedex_GetRatingMessageID_*`)', () => {
  it('신오는 본 수로 — 15 · 16 · 209 · 다 참(영원시티 전후)', () => {
    expect(pokedexRatingMessage(false, 15, false, false)).toBe(6)
    expect(pokedexRatingMessage(false, 16, false, false)).toBe(7)
    expect(pokedexRatingMessage(false, 209, false, false)).toBe(17)
    expect(pokedexRatingMessage(false, 210, true, false)).toBe(4)
    expect(pokedexRatingMessage(false, 210, false, false)).toBe(5)
  })
  it('전국은 잡은 수로 — 39 · 40 · 410(성별) · 476 · 482 이상(성별)', () => {
    expect(pokedexRatingMessage(true, 39, false, false)).toBe(22)
    expect(pokedexRatingMessage(true, 40, false, false)).toBe(23)
    expect(pokedexRatingMessage(true, 410, false, false)).toBe(34)
    expect(pokedexRatingMessage(true, 410, false, true)).toBe(35)
    expect(pokedexRatingMessage(true, 476, false, false)).toBe(40)
    expect(pokedexRatingMessage(true, 482, false, true)).toBe(42)
  })
})

maybe('명령 하나씩', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const { map } = buildCommands(meta.commands)
  const op = (name: string): number => {
    const at = meta.commands.findIndex((c) => c?.name === name)
    if (at < 0) throw new Error(`${name} 명령이 표에 없다`)
    return at
  }
  /** 명령 하나와 `End`를 짠다. 인자는 [폭, 값] */
  const bytes = (name: string, args: [1 | 2, number][]): Uint8Array => {
    const out: number[] = []
    const u16 = (v: number) => { out.push(v & 0xff, (v >> 8) & 0xff) }
    u16(op(name))
    for (const [w, v] of args) { if (w === 1) out.push(v & 0xff); else u16(v) }
    u16(op('End'))
    return Uint8Array.from(out)
  }
  const run = (name: string, args: [1 | 2, number][], party: Partial<NonNullable<FieldServices['party']>> = {},
    extra: Partial<FieldServices> = {}, vars = new VarStore()): VarStore => {
    vars.set(DEST, 0x1234)
    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }), movements: meta.movements,
      services: { party: { ...stubParty, ...party }, labels: stubLabels, fieldMoves: stubFieldMoves, trainerInfo: stubTrainerInfo, ...extra },
    })
    const ctx = new ScriptContext({ vars, world, commands: map }, bytes(name, args), 0)
    ctx.start(0)
    for (let f = 0; f < 10 && ctx.step(1000); f++) { /* 한 프레임씩 */ }
    return vars
  }

  it('IsItemTMHM — 기술머신01(328)~비전머신08(427)만 참', () => {
    expect(run('IsItemTMHM', [[2, 327], [2, DEST]]).get(DEST)).toBe(0)
    expect(run('IsItemTMHM', [[2, 328], [2, DEST]]).get(DEST)).toBe(1)
    expect(run('IsItemTMHM', [[2, 427], [2, DEST]]).get(DEST)).toBe(1)
    expect(run('IsItemTMHM', [[2, 428], [2, DEST]]).get(DEST)).toBe(0)
  })

  it('CheckPartyPokerus — 한 마리 파티라도 걸린 적이 없으면 0', () => {
    const one = { count: () => 1, pokerus: () => 0 }
    expect(run('CheckPartyPokerus', [[2, DEST]], one).get(DEST)).toBe(0)
    expect(run('CheckPartyPokerus', [[2, DEST]], { count: () => 2, pokerus: (s) => (s === 1 ? 0x21 : 0) }).get(DEST)).toBe(1)
  })

  it('CheckPartyCombeeGenderCount — 암수가 몇 가지인가 (알 · 다른 종 빼고)', () => {
    const party = (list: [number, number][]) => ({
      count: () => list.length, species: (s: number) => list[s]?.[0] ?? 0, gender: (s: number) => list[s]?.[1] ?? 2,
    })
    expect(run('CheckPartyCombeeGenderCount', [[2, DEST]], party([[1, 0]])).get(DEST)).toBe(0)
    expect(run('CheckPartyCombeeGenderCount', [[2, DEST]], party([[415, 1]])).get(DEST)).toBe(1)
    expect(run('CheckPartyCombeeGenderCount', [[2, DEST]], party([[415, 1], [415, 0]])).get(DEST)).toBe(2)
  })

  it('CheckBonusRoundStreak — 보너스 판 열 번부터', () => {
    const v = new VarStore()
    v.set(16448, 9)
    expect(run('CheckBonusRoundStreak', [[2, DEST]], {}, {}, v).get(DEST)).toBe(0)
    v.set(16448, 10)
    expect(run('CheckBonusRoundStreak', [[2, DEST]], {}, {}, v).get(DEST)).toBe(1)
  })

  it('오늘의 레벨 · 신문사 마감 — 저장 변수를 읽고 쓴다', () => {
    const v = run('InitDailyRandomLevel', [])
    expect(v.get(VAR_DAILY_RANDOM_LEVEL)).toBeGreaterThanOrEqual(2)
    expect(v.get(VAR_DAILY_RANDOM_LEVEL)).toBeLessThanOrEqual(99)
    expect(run('GetDailyRandomLevel', [[2, DEST]], {}, {}, v).get(DEST)).toBe(v.get(VAR_DAILY_RANDOM_LEVEL))
    const w = run('SetNewsPressDeadline', [[2, 3]])
    expect(w.get(VAR_NEWS_PRESS_DEADLINE)).toBe(3)
    expect(run('GetNewsPressDeadline', [[2, DEST]], {}, {}, w).get(DEST)).toBe(3)
  })

  it('CalcHiddenPowerType — 못 배우는 종은 0xFFFF, 알은 종을 안 본다', () => {
    const mon = (species: number, egg: boolean) => ({ species: () => species, isEgg: () => egg, hiddenPowerType: () => 13 })
    expect(run('CalcHiddenPowerType', [[2, 0], [2, DEST]], mon(25, false)).get(DEST)).toBe(13)
    expect(run('CalcHiddenPowerType', [[2, 0], [2, DEST]], mon(129, false)).get(DEST)).toBe(0xffff)
    expect(run('CalcHiddenPowerType', [[2, 0], [2, DEST]], mon(129, true)).get(DEST)).toBe(13)
  })

  it('TryGetRandomMassageGirlAccessory — 더 들어가는 것 중 하나, 다 찼으면 0xFFFF', () => {
    const full = { fashionCase: { canFit: () => false, add: () => {}, remove: () => {} } }
    expect(run('TryGetRandomMassageGirlAccessory', [[2, DEST]], {}, full).get(DEST)).toBe(0xffff)
    const one = { fashionCase: { canFit: (a: number) => a === 40, add: () => {}, remove: () => {} } }
    expect(run('TryGetRandomMassageGirlAccessory', [[2, DEST]], {}, one).get(DEST)).toBe(40)
  })

  it('CheckShouldShowGhost — 100%면 늘 참 · 0%는 거의 거짓', () => {
    expect(run('CheckShouldShowGhost', [[1, 100], [2, DEST]]).get(DEST)).toBe(1)
    const v = run('CheckShouldShowGhost', [[1, 0], [2, DEST]]).get(DEST)
    expect([0, 1]).toContain(v)
  })

  it('화강돌 인사 수 — 지운 뒤 0', () => {
    const v = new VarStore()
    v.set(16446, 7)
    expect(run('GetSpiritombCounter', [[2, DEST]], {}, {}, v).get(DEST)).toBe(7)
    run('ClearSpiritombCounter', [], {}, {}, v)
    expect(v.get(16446)).toBe(0)
  })
})
