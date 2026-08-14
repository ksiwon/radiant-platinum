import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DATA, withData } from '../../data/romData.testkit'
import { fillMenuText, TRADE_TEXT } from '../../data/uiText'
import { npcTradesSchema, speciesFileSchema, type NpcTrades, type Species } from '../../data/schema'
import { isShiny, type PokemonInstance } from './instance'
import { isOriginalTrainer, MET_LINK_TRADE } from './origin'
import {
  createTradedMon, NPC_TRADE, NPC_TRADE_COUNT, npcTradeAccepts, npcTradeNames,
} from './npcTrade'

const read = (rel: string): unknown => JSON.parse(readFileSync(resolve(DATA, rel), 'utf8'))

const maybe = withData('npcTrades.json', 'species.json', 'dialogue/ko/370.json')

maybe('NPC 교환', () => {
  const trades: NpcTrades = npcTradesSchema.parse(read('npcTrades.json'))
  const speciesFile = speciesFileSchema.parse(read('species.json'))
  const nameBank = read('dialogue/ko/370.json') as string[]
  const speciesOf = (id: number): Species => {
    const info = speciesFile.species.find((s) => s.id === id)
    if (!info) throw new Error(`종족 ${String(id)}이 표에 없다`)
    return info
  }

  it('넷이고 저마다 다른 종을 요구한다', () => {
    expect(trades.trades).toHaveLength(NPC_TRADE_COUNT)
    const wanted = trades.trades.map((t) => t.requestedSpecies)
    expect(new Set(wanted).size).toBe(NPC_TRADE_COUNT)
    // 아브라 ↔ 알통몬 · 페라페 ↔ 브이젤 · 고우스트 ↔ 요가램 · 잉어킹 ↔ 케이시
    expect(trades.trades.map((t) => [t.species, t.requestedSpecies])).toEqual([
      [63, 66], [441, 418], [93, 308], [129, 456],
    ])
  })

  it('별명 넷과 트레이너 이름 넷이 한 뱅크의 앞뒤다', () => {
    expect(nameBank).toHaveLength(NPC_TRADE_COUNT * 2)
    const kazza = npcTradeNames(nameBank, NPC_TRADE.kazzaAbra)
    expect(kazza.nickname).toBe(nameBank[0])
    expect(kazza.otName).toBe(nameBank[4])
    const foppa = npcTradeNames(nameBank, NPC_TRADE.foppaMagikarp)
    expect(foppa.nickname).toBe(nameBank[3])
    expect(foppa.otName).toBe(nameBank[7])
    // 여덟 줄이 다 차 있어야 한다 — 하나라도 비면 화면에 이름 없는 마리가 뜬다
    expect(nameBank.filter((s) => s.length > 0)).toHaveLength(8)
  })

  it('요구한 종이 아니면 안 받는다', () => {
    const abra = trades.trades[NPC_TRADE.kazzaAbra]!
    expect(npcTradeAccepts(abra, 66)).toBe(true)
    expect(npcTradeAccepts(abra, 63)).toBe(false)
  })

  /** 케이케이의 아브라. 내가 Lv.23짜리를 건넸다고 하자 */
  const kazza = (level = 23): PokemonInstance => {
    const record = trades.trades[NPC_TRADE.kazzaAbra]!
    return createTradedMon(
      record, speciesOf(record.species), level,
      npcTradeNames(nameBank, NPC_TRADE.kazzaAbra),
      { year: 26, month: 8, day: 14 },
    )
  }

  it('⚠️ 레벨이 내가 건넨 마리의 것이다 — 표에는 레벨 칸이 없다', () => {
    expect(kazza(5).level).toBe(5)
    expect(kazza(60).level).toBe(60)
    // 만난 레벨도 같이 따라간다 (`BoxPokemon_SetMetLevelToCurrentLevel`)
    expect(kazza(60).origin.metLevel).toBe(60)
  })

  it('⚠️ 만난 자리가 지금 서 있는 맵이 아니라 「통신교환」이다', () => {
    // 원작이 `MapHeader_GetMapLabelTextID(mapID)`를 넘기지만 `sel == 1` 가지는
    // 그 인자를 안 쓴다. 맵 이름으로 채우면 요약 화면의 메모가 딴 문장이 된다
    expect(kazza().origin.met.location).toBe(MET_LINK_TRADE)
    expect(kazza().origin.egg.location).toBe(0)
  })

  it('개체값 여섯이 표 그대로다 — 굴린 값이 한 칸도 안 남는다', () => {
    const record = trades.trades[NPC_TRADE.kazzaAbra]!
    expect(kazza().ivs).toEqual(record.ivs)
    // ⚠️ 스피드가 저장 차례에서 넷째다. 뒤집으면 특공 25가 스피드 25로 온다
    expect(record.ivs.spa).toBe(25)
    expect(record.ivs.spe).toBe(20)
  })

  it('성격값·트레이너 번호·도구가 고정이라 넷 다 늘 같은 개체다', () => {
    const record = trades.trades[NPC_TRADE.kazzaAbra]!
    const a = kazza()
    const b = kazza()
    expect(a.pid).toBe(record.personality)
    expect(a.otId).toBe(record.otId)
    expect(a.heldItem).toBe(record.heldItem)
    expect(a).toEqual(b)
    // 받은 것은 몬스터볼이다 (`BoxPokemon_InitWith`)
    expect(a.ball).toBe(4)
    expect(a.friendship).toBe(speciesOf(record.species).baseFriendship)
  })

  it('별명이 늘 붙어 있다', () => {
    expect(kazza().nickname).toBe(nameBank[0])
    expect(kazza().nickname).not.toBe('')
  })

  it('⚠️ 남의 포켓몬이라 말 안 듣기가 걸린다 — 이 넷이 그 유일한 문이다', () => {
    const me = { name: '지훈', gender: 'male' as const, id: 25643, secretId: 0 }
    // 트레이너 번호를 일부러 같게 맞춰도 이름·성별이 달라서 내 것이 아니다
    expect(isOriginalTrainer(kazza(), me)).toBe(false)
    expect(kazza().origin.otName).toBe(nameBank[4])
    expect(kazza().origin.otGender).toBe('female')
  })

  it('⚠️ 넷 다 색이 다르지 않다 — 원작이 그 자리에서 단언한다', () => {
    // `GF_ASSERT(!Pokemon_IsShiny(mon))`. 성격값과 트레이너 번호가 둘 다
    // 고정이라 색은 처음부터 정해져 있다
    for (const record of trades.trades) {
      expect(isShiny(record.personality, record.otId, record.otSecretId)).toBe(false)
    }
  })

  it('트레이너 번호 위 16비트가 비밀 번호로 갈라진다', () => {
    for (const record of trades.trades) {
      expect(record.otId).toBeLessThan(0x10000)
      // 넷 다 위가 0이다 — 갈라 두지 않으면 색 판정이 32비트를 못 본다
      expect(record.otSecretId).toBe(0)
    }
  })

  it('기술은 그 레벨에서 알 만한 것들이다', () => {
    const low = kazza(5)
    const high = kazza(40)
    expect(low.moves.length).toBeGreaterThan(0)
    expect(high.moves.length).toBeGreaterThanOrEqual(low.moves.length)
    expect(high.moves.length).toBeLessThanOrEqual(4)
  })
})

const scene = withData('dialogue/ko/350.json')

scene('교환 장면의 네 줄', () => {
  const bank = read('dialogue/ko/350.json') as string[]
  /** 0 내가 주는 마리 · 1 받는 마리 · 2 상대 트레이너 */
  const slots = (raw: string): number[] =>
    [...raw.matchAll(/\{STRVAR_1 \d+, (\d+), \d+\}/g)].map((m) => Number(m[1]))

  it('여섯 줄이고 앞의 넷이 NPC 교환 것이다', () => {
    // 4·5번은 GTS 것이라 여기서는 안 뜬다 (`TRADE_TYPE_NORMAL`이 아닐 때)
    expect(bank).toHaveLength(6)
  })

  it('칸 번호가 원작이 채우는 자리와 같다', () => {
    expect(slots(bank[TRADE_TEXT.willBeSent]!)).toEqual([0, 2])
    expect(slots(bank[TRADE_TEXT.byeBye]!)).toEqual([0])
    expect(slots(bank[TRADE_TEXT.sentOver]!)).toEqual([2, 1])
    expect(slots(bank[TRADE_TEXT.takeCare]!)).toEqual([1])
  })

  it('칸을 채우면 부호가 하나도 안 남는다', () => {
    const filled = [
      TRADE_TEXT.willBeSent, TRADE_TEXT.byeBye, TRADE_TEXT.sentOver, TRADE_TEXT.takeCare,
    ].map((at) => fillMenuText(bank[at]!, ['알통몬', '케이케이', '에이']))
    for (const line of filled) expect(line).not.toContain('{')
    // 조사까지 붙는다 — "케이케이를"이지 "케이케이을"이 아니다
    expect(filled[0]).toContain('알통몬을')
    expect(filled[3]).toContain('케이케이를')
  })
})
