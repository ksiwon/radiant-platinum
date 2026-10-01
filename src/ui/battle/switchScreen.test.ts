// 교체 화면이 파티를 제대로 읽는가 (PLAN §2.5)
//
// 여기서 지키는 것 셋: **벤치에 있는 애의 속사정이 요청에서 다 나온다**는 것,
// **프로토콜의 특성 아이디를 롬 번호로 되돌릴 수 있다**는 것, 그리고 기술 줄의
// 상성 귀띔이 **기술 메뉴와 같은 규칙·같은 말**이라는 것.
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { partySummary } from '../../engine/battle/choice'
import type { BattleRequest } from '../../engine/battle/events'
import { romAbility } from '../../engine/battle/sim/bridge'
import { TYPE } from '../../engine/battle/ai/typeChart'
import { MATCH_LABEL, sharedMatch } from '../../engine/battle/movePreview'
import type { Move, Stats } from '../../data/schema'
import * as css from './switchScreen.css'

const mon = (over: Partial<BattleRequest['side']['pokemon'][0]>) => ({
  ident: 'p1: turtwig',
  details: 'Turtwig, L13, F',
  condition: '38/38',
  active: false,
  stats: { atk: 20, def: 22, spa: 18, spd: 18, spe: 15 },
  moves: ['tackle', 'withdraw'],
  baseAbility: 'overgrow',
  item: '',
  ...over,
})

const request = (pokemon: BattleRequest['side']['pokemon']): BattleRequest => ({
  side: { name: '나', id: 'p1', pokemon },
})

describe('교체 화면이 읽는 파티', () => {
  it('벤치에 있는 애의 체력·기술·특성까지 나온다', () => {
    // ⚠️ 이게 이 화면의 근거 전부다. `roster`에는 종족·이름·레벨만 있어서
    // 체력도 기술도 없다 — 요청에는 나와 있지 않은 애들 것까지 실려 온다
    const got = partySummary(request([
      mon({ active: true }),
      mon({ ident: 'p1: starly', condition: '12/30 brn', moves: ['quickattack'] }),
      mon({ ident: 'p1: shinx', condition: '0 fnt' }),
    ]))
    expect(got).toHaveLength(3)
    expect(got[0]).toMatchObject({ index: 1, key: 'turtwig', hp: 38, maxHp: 38, active: true })
    expect(got[1]).toMatchObject({ key: 'starly', hp: 12, maxHp: 30, status: 'brn', fainted: false })
    expect(got[2]).toMatchObject({ key: 'shinx', hp: 0, fainted: true, status: null })
    expect(got[1]!.moves.map((m) => m.id)).toEqual(['quickattack'])
    expect(got[0]!.ability).toBe('overgrow')
  })

  it('빈 턴 칸은 파티에 안 뜬다', () => {
    // 볼·도망이 턴을 쓰려고 끼워 넣은 기술(`IDLE_MOVE`)이다. 다섯 번째 기술로
    // 뜨면 안 되고, **나와 있는 한 마리에게만** 붙는다
    const rows = partySummary(
      request([
        mon({ active: true, moves: ['tackle', 'withdraw', 'absorb', 'razorleaf', 'splash'] }),
        mon({ ident: 'p1: starly', moves: ['tackle', 'growl', 'quickattack', 'splash'] }),
      ]),
      { hiddenSlot: 5 },
    )
    expect(rows[0]!.moves.map((m) => m.id)).toEqual(['tackle', 'withdraw', 'absorb', 'razorleaf'])
    // 벤치에 있는 애의 다섯 번째는 진짜 그 애의 기술이라 안 자른다
    expect(rows[1]!.moves).toHaveLength(4)
  })

  it('기술 번호는 풀어 주는 쪽이 준다', () => {
    const rows = partySummary(request([mon({})]), {
      moveId: (id) => (id === 'tackle' ? 33 : null),
    })
    expect(rows[0]!.moves).toEqual([
      { id: 'tackle', move: 33 }, { id: 'withdraw', move: null },
    ])
  })

  it('요청이 없으면 빈 목록', () => {
    expect(partySummary(null)).toEqual([])
  })
})

describe('특성 아이디 → 롬 번호', () => {
  // ⚠️ **영어 이름표에 안 묻는다.** 한때 `names/labels.en.json`의 차례와 맞췄는데
  // 그 파일은 **영어 롬 설치본에만 있다** — 한국·일본 롬으로 깔면 그 한 파일이
  // 없어서 배틀 이름표가 통째로 안 왔다 (REPAIR §29). sim 덱스가 같은 값을 준다.
  //
  // 번호가 곧 롬 이름표의 자리라는 것은 실측이다: `labels.ko.json`의 특성
  // 124개 중 2·3·4번이 잔비·가속·전투무장이고, 그것이 Drizzle·Speed Boost·
  // Battle Armor의 번호다
  it('사이의 빈칸과 대소문자를 무시하고 맞춘다', () => {
    expect(romAbility('speedboost')).toBe(3)
    expect(romAbility('battlearmor')).toBe(4)
    expect(romAbility('drizzle')).toBe(2)
  })

  it('4세대에 없는 특성은 null', () => {
    expect(romAbility('justified')).toBeNull()
  })
})

describe('교체 화면의 상성 귀띔', () => {
  const thunder = (over: Partial<Move> = {}): Move => ({
    id: 85, effect: 0, category: 'special', power: 95, type: TYPE.ELECTRIC,
    accuracy: 100, alwaysHits: false, pp: 15, effectChance: 10, target: 0,
    priority: 0, flags: 0, contact: false, protectable: true,
    ...over,
  })
  const water = { types: [TYPE.WATER], known: true }
  const flying = { types: [TYPE.FLYING], known: true }
  const ground = { types: [TYPE.GROUND], known: true }
  const grass = { types: [TYPE.GRASS], known: true }

  it('싱글이면 그 상대 하나에 대고 잰다', () => {
    expect(sharedMatch(thunder(), [water], null)).toBe('super')
    expect(sharedMatch(thunder(), [grass], null)).toBe('resisted')
    expect(sharedMatch(thunder(), [ground], null)).toBe('immune')
  })

  /**
   * ⚠️ 한때 교체 화면은 처음 보는 상대에게도 약점을 띄웠다. 기술 메뉴는
   * **상대해 본 종**에게만 띄운다 (§2.22) — 같은 배틀에서 규칙이 둘이었다
   */
  it('상대해 본 적 없는 종에게는 안 띄운다', () => {
    expect(sharedMatch(thunder(), [{ types: [TYPE.WATER], known: false }], null)).toBeNull()
  })

  /** ⚠️ 한때 p2a 하나로만 쟀다. 왼쪽 상대에게는 거짓 귀띔이었다 */
  it('더블에서 상대 둘의 결과가 같을 때만 띄운다', () => {
    expect(sharedMatch(thunder(), [water, flying], null)).toBe('super')
    expect(sharedMatch(thunder(), [water, ground], null)).toBeNull()
    // 한쪽만 처음 보는 종이어도 비운다 — 같은 줄에 그쪽 약점이 묻어 나간다
    expect(sharedMatch(thunder(), [water, { types: [TYPE.WATER], known: false }], null)).toBeNull()
  })

  it('잠재파워는 쓰는 쪽의 개체값으로, 발버둥은 아무 말 없이', () => {
    const hp = thunder({ id: 237, type: TYPE.NORMAL, power: 0 })
    const ivs: Stats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 } // 악
    const ghost = { types: [TYPE.GHOST], known: true }
    expect(sharedMatch(hp, [ghost], null)).toBe('immune')
    expect(sharedMatch(hp, [ghost], ivs)).toBe('super')
    expect(sharedMatch(thunder({ id: 165, type: TYPE.NORMAL }), [ghost], null)).toBeNull()
  })

  it('상대가 없으면 비운다', () => {
    expect(sharedMatch(thunder(), [], null)).toBeNull()
  })

  /** 말은 기술 메뉴의 표 하나에서 온다. 색 칸도 그 키를 그대로 쓴다 */
  it('색 칸의 키가 기술 메뉴의 말과 같다', () => {
    expect(Object.keys(css.hint).sort()).toEqual(Object.keys(MATCH_LABEL).sort())
    expect(MATCH_LABEL).toEqual({
      super: '효과가 굉장함', resisted: '효과가 별로임', immune: '효과가 없음',
    })
  })
})

/**
 * 파티 카드의 모양. 실제 픽셀은 브라우저로 봐야 한다 — 여기서는 그 모양이
 * 소스에서 다시 빠지지 않는지만 잡는다 (`hpDrain.test`와 같은 방식)
 */
describe('파티 카드', () => {
  const CSS_SOURCE = new URL('./switchScreen.css.ts', import.meta.url)
  const BAG_SOURCE = new URL('./BattleBag.tsx', import.meta.url)
  /** `export const <name> = style({ ... })`의 몸만 */
  const rule = (src: string, name: string): string => {
    const from = src.slice(src.indexOf(`export const ${name} = style(`))
    return from.slice(0, from.indexOf('})'))
  }

  /**
   * ⚠️ 홈도 채움도 `<span>`이다. display가 없으면 인라인이라 너비·높이가 안 먹어
   * 홈이 테두리 2px씩만 남은 세로 막대기가 되고, 채움 폭은 통째로 사라졌다
   */
  it('HP 막대의 홈과 채움이 블록이다', () => {
    const src = readFileSync(CSS_SOURCE, 'utf8')
    for (const name of ['bar', 'fill']) {
      expect(rule(src, name)).toContain("display: 'block'")
    }
    // 높이는 홈이 정하고 채움은 그 100%를 탄다 (`BAR_FILL`)
    expect(rule(src, 'bar')).toMatch(/height: \d+/)
  })

  /** 한때 가방의 대상 고르기 카드만 `mon`을 안 넘겨 아이콘 자리가 빈 40px였다 */
  it('가방 대상 카드도 아이콘을 받고, 알 표시는 키와 종으로 찾은 세이브에서 온다', () => {
    const bag = readFileSync(BAG_SOURCE, 'utf8')
    const cards = bag.slice(bag.indexOf('const cards = party.map('))
    const body = cards.slice(0, cards.indexOf('\n    })'))
    expect(body).toMatch(/mon: it \? \{/)
    expect(body).toContain('species: it.species')
    expect(body).toContain('form: it.form')
    // 요청의 차례(`i`·`one.index`)가 아니라 키로 찾는다
    expect(body).toContain('one.key.slice(3)')
    expect(body).toContain('saved.species === it.species')
  })
})
