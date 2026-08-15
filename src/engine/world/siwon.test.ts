// 시원의 배포 (SIWON.md)
//
// **가장 중요한 것은 「막히지 않는가」다.** 여섯을 한 줄로 이어 놓았으므로
// 어느 한 칸이라도 판정이 너무 엄하면 그 뒤가 통째로 안 열린다 — 특히 레지를
// 놓친 사람이 마지막 선물을 못 받는 자리가 실제로 있었다 (§5의 ⚠️)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  distributionVarOf, DISTRIBUTION_MAGIC, FLAG_GAME_COMPLETED, SIWON_GIFTS, SIWON_ITEM,
  SIWON_SPECIES, siwonTurn, VAR_DISTRIBUTION_EVENT_FIRST, type SiwonProbe,
} from './siwon'
import { siwonLines } from './siwonText'
import { planSiwonTalk } from '../script/siwonScene'
import { withDecomp } from '../../data/romData.testkit'

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

// ── 롬에서 베낀 수를 표와 맞춰 본다 ─────────────────────────────────────────
//
// ⚠️ **이 파일의 모든 판정이 이 수들 위에 서 있다.** 하나라도 어긋나면
// 「받았는데 다음이 안 나온다」로만 보이고 왜인지는 안 보인다. 손으로 적어 둔
// 번호라 디컴프가 한 줄만 바뀌어도 조용히 틀리므로 여기서 못 박는다
// (`script/varsFlags.test.ts`와 같은 장치다).
//
// ⚠️ `raw/`는 리포에 안 들어간다. 표가 있을 때만 돌린다 — 없다고 통과시키는
// 것이 아니라 **건너뛴다**.

const decomp = withDecomp('generated/vars_flags.txt')

/**
 * `vars_flags.txt`를 C 열거형처럼 센다.
 *
 * 이름만 있는 줄은 앞 값에서 하나 올라가고, `A = B` 줄은 B의 값을 받는다 —
 * **그 줄도 하나 올라간다**. 줄 번호로 세면 어긋난다
 */
function readVarsFlags(): Map<string, number> {
  const table = resolve(__dirname, '../../../raw/decomp/generated/vars_flags.txt')
  const out = new Map<string, number>()
  let value = 0
  for (const raw of readFileSync(table, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const eq = line.indexOf('=')
    if (eq >= 0) {
      const rhs = line.slice(eq + 1).trim()
      value = out.get(rhs) ?? Number(rhs)
      out.set(line.slice(0, eq).trim(), value)
    } else out.set(line, value)
    value += 1
  }
  return out
}

decomp('시원이 읽는 롬의 수', () => {
  const table = readVarsFlags()

  it('먼저 세는 법이 맞는지 본다 — 이름에 번호가 박힌 것들이 그 번호다', () => {
    const named = [...table].filter(([name]) => /^FLAG_UNUSED_0x[0-9A-F]{4}$/.test(name))
    expect(named.length).toBeGreaterThan(100)
    expect(named.filter(([name, value]) => Number(`0x${name.slice(-4)}`) !== value)).toEqual([])
  })

  it('「썼다」를 재는 깃발 넷', () => {
    expect(table.get('FLAG_GAME_COMPLETED')).toBe(FLAG_GAME_COMPLETED)
    expect(table.get('FLAG_CAUGHT_DARKRAI')).toBe(FLAG_CAUGHT_DARKRAI)
    expect(table.get('FLAG_CAUGHT_SHAYMIN')).toBe(FLAG_CAUGHT_SHAYMIN)
    expect(table.get('FLAG_CAUGHT_ARCEUS')).toBe(FLAG_CAUGHT_ARCEUS)
  })

  it('⚠️ 배포 변수 넷이 잇달아 붙어 있다 — 첫 칸에 번호를 더해 쓴다', () => {
    expect(table.get('VAR_DISTRIBUTION_EVENT_DARKRAI')).toBe(VAR_DISTRIBUTION_EVENT_FIRST)
    expect(table.get('VAR_DISTRIBUTION_EVENT_SHAYMIN')).toBe(VAR_DISTRIBUTION_EVENT_FIRST + 1)
    expect(table.get('VAR_DISTRIBUTION_EVENT_ARCEUS')).toBe(VAR_DISTRIBUTION_EVENT_FIRST + 2)
    expect(table.get('VAR_DISTRIBUTION_EVENT_ROTOM')).toBe(VAR_DISTRIBUTION_EVENT_FIRST + 3)
  })

  it('⚠️ 유적 셋의 상태 칸이 셋 다 맞다 — 하나만 봐도 다섯째가 안 열린다', () => {
    expect(table.get('VAR_IRON_RUINS_STATE')).toBe(16_489)
    expect(table.get('VAR_ICEBERG_RUINS_STATE')).toBe(16_490)
    expect(table.get('VAR_ROCK_PEAK_RUINS_STATE')).toBe(VAR_ROCK_PEAK_RUINS_STATE)
  })
})

const regi = withDecomp('include/constants/regi_ruins.h')

regi('석상을 깨운 값이 270이다 — 잡은 값(290)으로 재면 막힌다', () => {
  it('표와 같다', () => {
    const header = readFileSync(
      resolve(__dirname, '../../../raw/decomp/include/constants/regi_ruins.h'), 'utf8')
    expect(header).toMatch(/RUINS_STATE_ACTIVATED_STATUE\s+270/)
    expect(header).toMatch(/RUINS_STATE_DID_NOT_CATCH_REGI\s+280/)
  })
})

const magic = withDecomp('src/system_vars.c')

magic('마법의 수 넷이 롬의 표 그대로다', () => {
  it('표와 같다', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../raw/decomp/src/system_vars.c'), 'utf8')
    const found = [...src.matchAll(/\[DISTRIBUTION_EVENT_(\w+)\] = (0x[0-9A-Fa-f]+)/g)]
      .map(([, , value]) => Number(value))
    expect(found).toEqual([...DISTRIBUTION_MAGIC])
  })
})
