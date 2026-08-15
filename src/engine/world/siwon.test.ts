// 시원의 배포 (SIWON.md)
//
// **가장 중요한 것은 「막히지 않는가」다.** 여섯을 한 줄로 이어 놓았으므로
// 어느 한 칸이라도 판정이 너무 엄하면 그 뒤가 통째로 안 열린다 — 특히 레지를
// 놓친 사람이 마지막 선물을 못 받는 자리가 실제로 있었다 (§5의 ⚠️)
import { describe, it, expect } from 'vitest'
import {
  distributionVarOf, DISTRIBUTION_MAGIC, FLAG_GAME_COMPLETED, SIWON_GIFTS, SIWON_ITEM,
  SIWON_SPECIES, siwonTurn, VAR_DISTRIBUTION_EVENT_FIRST, type SiwonProbe,
} from './siwon'
import { siwonLines } from './siwonText'
import { planSiwonTalk } from '../script/siwonScene'

const FLAG_CAUGHT_ARCEUS = 286
const FLAG_CAUGHT_SHAYMIN = 291
const FLAG_CAUGHT_DARKRAI = 344
const VAR_ROCK_PEAK_RUINS_STATE = 16491

/** 아무것도 안 한 사람 */
function probe(over: Partial<{
  flags: number[]; vars: Record<number, number>; rotom: number
}> = {}): SiwonProbe {
  const flags = new Set(over.flags ?? [])
  return {
    flag: (id) => flags.has(id),
    variable: (id) => over.vars?.[id] ?? 0,
    rotomForms: () => over.rotom ?? 0,
  }
}

const CLEARED = [FLAG_GAME_COMPLETED]

describe('시원의 차례', () => {
  it('전당등록 전에는 하나도 안 준다', () => {
    expect(siwonTurn(0, probe()).kind).toBe('locked')
    // 이미 다 잡아 놨어도 마찬가지다 — 등록이 먼저다
    expect(siwonTurn(0, probe({ flags: [FLAG_CAUGHT_DARKRAI], rotom: 1 })).kind).toBe('locked')
  })

  it('전당등록 뒤 첫 번째는 비밀의 열쇠다', () => {
    const turn = siwonTurn(0, probe({ flags: CLEARED }))
    expect(turn.kind).toBe('gift')
    if (turn.kind !== 'gift') return
    expect(turn.entry.gift).toEqual({
      kind: 'item', item: SIWON_ITEM.secretKey, event: 3,
    })
  })

  it('앞의 것을 안 쓰면 다음을 안 준다', () => {
    const turn = siwonTurn(1, probe({ flags: CLEARED }))
    expect(turn).toEqual({ kind: 'wait', at: 0 })
  })

  it('로토무 폼을 하나라도 바꾸면 다음으로 넘어간다', () => {
    const turn = siwonTurn(1, probe({ flags: CLEARED, rotom: 0b00001 }))
    expect(turn.kind).toBe('gift')
    if (turn.kind !== 'gift') return
    expect(turn.entry.gift).toEqual({ kind: 'item', item: SIWON_ITEM.memberCard, event: 0 })
  })

  it('여섯을 다 주면 끝난다', () => {
    expect(siwonTurn(SIWON_GIFTS.length, probe({ flags: CLEARED }))).toEqual({ kind: 'done' })
  })

  it('여섯이 아이템 넷 · 포켓몬 하나 · 알 하나다', () => {
    const kinds = SIWON_GIFTS.map((g) => g.gift.kind)
    expect(kinds).toEqual(['item', 'item', 'item', 'item', 'mon', 'egg'])
    // 배포로만 열리던 자리를 전부 덮는가 — 쉐이미와 아르세우스는 아이템이 데려온다
    expect(SIWON_GIFTS.filter((g) => g.gift.kind === 'item').map((g) => (
      g.gift.kind === 'item' ? g.gift.item : 0
    ))).toEqual([
      SIWON_ITEM.secretKey, SIWON_ITEM.memberCard, SIWON_ITEM.oaksLetter, SIWON_ITEM.azureFlute,
    ])
  })

  it('레지기가스는 운명적 만남으로 준다 — 그것만이 유적을 연다', () => {
    const gift = SIWON_GIFTS[4]!.gift
    expect(gift).toEqual({ kind: 'mon', species: SIWON_SPECIES.regigigas, level: 1 })
  })
})

describe('막히지 않는다', () => {
  const cleared = { flags: [...CLEARED] }

  /** 다섯째까지 받으려면 밟아야 하는 것들 */
  function upTo(n: number): SiwonProbe {
    const flags = [...CLEARED]
    if (n >= 2) flags.push(FLAG_CAUGHT_DARKRAI)
    if (n >= 3) flags.push(FLAG_CAUGHT_SHAYMIN)
    if (n >= 4) flags.push(FLAG_CAUGHT_ARCEUS)
    return probe({
      flags,
      rotom: n >= 1 ? 0b00001 : 0,
      vars: n >= 5 ? { [VAR_ROCK_PEAK_RUINS_STATE]: 270 } : {},
    })
  }

  it('차례대로 밟으면 여섯이 다 나온다', () => {
    for (let given = 0; given < SIWON_GIFTS.length; given++) {
      expect(siwonTurn(given, upTo(given)).kind, `${given}번째`).toBe('gift')
    }
  })

  it('⚠️ 레지를 놓쳐도 마지막 선물을 받는다', () => {
    // 석상은 깨웠는데(270) 못 잡은 상태(280). 이 자리에서 그 레지는 다시 안
    // 나오므로, 「잡았다」로 재면 여기서 영영 막힌다
    const missed = probe({ flags: upTo(4) && [...CLEARED, FLAG_CAUGHT_DARKRAI,
      FLAG_CAUGHT_SHAYMIN, FLAG_CAUGHT_ARCEUS], rotom: 1,
    vars: { [VAR_ROCK_PEAK_RUINS_STATE]: 280 } })
    expect(siwonTurn(5, missed).kind).toBe('gift')
  })

  it('석상을 안 깨웠으면 아직 기다린다', () => {
    const untouched = probe({
      flags: [...CLEARED, FLAG_CAUGHT_DARKRAI, FLAG_CAUGHT_SHAYMIN, FLAG_CAUGHT_ARCEUS],
      rotom: 1,
      vars: { [VAR_ROCK_PEAK_RUINS_STATE]: 260 },
    })
    expect(siwonTurn(5, untouched)).toEqual({ kind: 'wait', at: 4 })
  })

  it('가방이 가득 차도 세는 수는 안 올라간다', () => {
    let counted = 0
    const plan = planSiwonTalk({
      locale: 'ko',
      given: 0,
      probe: probe(cleared),
      canFitItem: () => false,
      hasPartyRoom: () => true,
      giveFateful: () => { throw new Error('주면 안 된다') },
      giveEgg: () => { throw new Error('주면 안 된다') },
      setVar: () => { throw new Error('세우면 안 된다') },
      countGiven: () => { counted++ },
    })
    expect(plan.giveItem).toBeNull()
    expect(plan.commit).toBeNull()
    expect(plan.text).toBe(siwonLines('ko').bagFull)
    expect(counted).toBe(0)
  })

  it('파티가 가득 차면 레지기가스를 안 준다', () => {
    const plan = planSiwonTalk({
      locale: 'ko',
      given: 4,
      probe: probe({ flags: [...CLEARED, FLAG_CAUGHT_ARCEUS] }),
      canFitItem: () => true,
      hasPartyRoom: () => false,
      giveFateful: () => { throw new Error('주면 안 된다') },
      giveEgg: () => { throw new Error('주면 안 된다') },
      setVar: () => { throw new Error('세우면 안 된다') },
      countGiven: () => { throw new Error('세면 안 된다') },
    })
    expect(plan.text).toBe(siwonLines('ko').partyFull)
    expect(plan.commit).toBeNull()
  })
})

describe('배포 변수', () => {
  it('아이템마다 제 마법의 수를 세운다', () => {
    for (const entry of SIWON_GIFTS) {
      const got = distributionVarOf(entry.gift)
      if (entry.gift.kind !== 'item') { expect(got).toBeNull(); continue }
      expect(got).toEqual({
        id: VAR_DISTRIBUTION_EVENT_FIRST + entry.gift.event,
        value: DISTRIBUTION_MAGIC[entry.gift.event],
      })
    }
  })

  it('⚠️ 물건과 변수가 한 번에 간다 — 하나만 가면 자리가 안 열린다', () => {
    const set: { id: number; value: number }[] = []
    let counted = 0
    const plan = planSiwonTalk({
      locale: 'ko',
      given: 0,
      probe: probe({ flags: CLEARED }),
      canFitItem: () => true,
      hasPartyRoom: () => true,
      giveFateful: () => { throw new Error('아이템이다') },
      giveEgg: () => { throw new Error('아이템이다') },
      setVar: (id, value) => { set.push({ id, value }) },
      countGiven: () => { counted++ },
    })
    expect(plan.giveItem).toBe(SIWON_ITEM.secretKey)
    // 말이 끝나기 전에는 아무 일도 안 일어난다
    expect(set).toEqual([])
    plan.commit!()
    expect(set).toEqual([{ id: VAR_DISTRIBUTION_EVENT_FIRST + 3, value: 0x1103 }])
    expect(counted).toBe(1)
  })
})

describe('세 나라 말', () => {
  it('셋 다 빠진 줄이 없다', () => {
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const lines = siwonLines(locale)
      expect(lines.gift.length, locale).toBe(SIWON_GIFTS.length)
      expect(lines.wait.length, locale).toBe(SIWON_GIFTS.length - 1)
      for (const [key, text] of Object.entries(lines)) {
        for (const one of Array.isArray(text) ? text : [text]) {
          expect(String(one).trim().length, `${locale}/${key}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('모르는 말은 한국어로 준다', () => {
    expect(siwonLines('de')).toBe(siwonLines('ko'))
  })

  it('한 쪽이 두 줄을 안 넘는다', () => {
    // 대사창이 두 줄이다. `\r`·`\f`가 쪽을 나누고 그 안에서는 `\n` 하나뿐이다
    for (const locale of ['ko', 'en', 'ja'] as const) {
      const lines = siwonLines(locale)
      const all = Object.values(lines).flatMap((v) => (Array.isArray(v) ? v : [v]))
      for (const text of all) {
        for (const page of String(text).split(/[\r\f]/)) {
          expect(page.split('\n').length, `${locale}: ${page}`).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})
