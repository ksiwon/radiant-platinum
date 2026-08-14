// 본 안농 글자를 적는 자리 (PARITY §6.8)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import { seeUnownForm, UNOWN_FORM_COUNT, unownFormsSeen } from './dex'
import { UNOWN_TABLES } from '../battle/encounter'

describe('본 글자 기록', () => {
  it('스물여덟이다 — 알파벳 26 + ! + ?', () => {
    expect(UNOWN_FORM_COUNT).toBe(28)
  })

  it('⚠️ 본 차례가 남는다 — 비트가 아니라 목록이다', () => {
    let seen: readonly number[] = []
    seen = seeUnownForm(seen, 5) // F
    seen = seeUnownForm(seen, 0) // A
    seen = seeUnownForm(seen, 17) // R
    // 번호순이 아니라 본 차례다 — 도감의 폼 쪽이 이 차례로 늘어선다
    expect(seen).toEqual([5, 0, 17])
    expect(unownFormsSeen(seen)).toBe(3)
  })

  it('같은 글자를 또 봐도 안 늘어난다', () => {
    const once = seeUnownForm([], 5)
    expect(seeUnownForm(once, 5)).toBe(once)
    expect(unownFormsSeen(seeUnownForm(once, 5))).toBe(1)
  })

  it('스물여덟을 넘겨 담지 않는다', () => {
    let seen: readonly number[] = []
    for (let f = 0; f < UNOWN_FORM_COUNT; f++) seen = seeUnownForm(seen, f)
    expect(unownFormsSeen(seen)).toBe(UNOWN_FORM_COUNT)
    // 있을 수 없는 글자가 와도 안 늘어난다
    expect(unownFormsSeen(seeUnownForm(seen, 99))).toBe(UNOWN_FORM_COUNT)
  })
})

describe('유적의 표 여덟', () => {
  it('막다른 방이 스무 글자고 F·R·I·E·N·D가 빠져 있다', () => {
    expect(UNOWN_TABLES[0]).toHaveLength(20)
    // F(5) R(17) I(8) E(4) N(13) D(3)
    for (const f of [5, 17, 8, 4, 13, 3]) {
      expect(UNOWN_TABLES[0], `글자 ${String(f)}`).not.toContain(f)
    }
  })

  it('올바른 길 여섯이 F-R-I-E-N-D 차례다', () => {
    expect(UNOWN_TABLES.slice(1, 7)).toEqual([[5], [17], [8], [13], [4], [3]])
  })

  it('⚠️ 비밀방에서만 「!」와 「?」가 나온다', () => {
    expect(UNOWN_TABLES[7]).toEqual([26, 27])
    // 다른 어느 표에도 없다 — 그래서 스물여섯을 다 봐야 스물여덟이 채워진다
    for (const t of UNOWN_TABLES.slice(0, 7)) {
      expect(t).not.toContain(26)
      expect(t).not.toContain(27)
    }
  })

  it('여덟 표를 합치면 스물여덟이 빠짐없이 나온다', () => {
    const all = new Set(UNOWN_TABLES.flat())
    expect(all.size).toBe(UNOWN_FORM_COUNT)
  })
})

const maybe = withData('encounters.json')

maybe('실제 맵과 맞물린다', () => {
  const tables = (JSON.parse(readFileSync(resolve(DATA, 'encounters.json'), 'utf8')) as
    { tables: { unownTable: number }[] }).tables

  it('표 번호가 0~8 안이다 — 0은 「안농이 안 나온다」', () => {
    for (const t of tables) {
      expect(t.unownTable).toBeGreaterThanOrEqual(0)
      expect(t.unownTable).toBeLessThanOrEqual(UNOWN_TABLES.length)
    }
  })

  it('여덟 표가 실제로 다 쓰인다', () => {
    const used = new Set(tables.map((t) => t.unownTable).filter((n) => n > 0))
    expect(used.size).toBe(UNOWN_TABLES.length)
  })
})
