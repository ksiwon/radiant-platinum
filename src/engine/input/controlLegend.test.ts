// 화면 구석 쪽지가 **실제로 묶인 키**를 적는가.
//
// 오프닝 설명(`intro/controlText`)과 같은 잣대다 — 자리가 둘이면 한쪽만
// 고쳐지므로, 둘 다 `BINDINGS`에서 뽑고 둘 다 여기서 맞춰 본다.
import { describe, expect, it } from 'vitest'
import { controlRows, keyLocale, LEGEND_TOGGLE } from './controlLegend'
import { keyList, moveKeys } from './keyNames'
import { BINDINGS, LEFT_HAND } from './keys'

const LOCALES = ['ko', 'en', 'ja'] as const

describe('조작 쪽지', () => {
  it('아홉 줄이 세 언어 다 채워져 있다', () => {
    for (const locale of LOCALES) {
      const rows = controlRows(locale)
      expect(rows, locale).toHaveLength(9)
      for (const row of rows) {
        expect(row.keys.length, `${locale} ${row.what}`).toBeGreaterThan(0)
        expect(row.what.length, `${locale} ${row.keys}`).toBeGreaterThan(0)
      }
    }
    expect(controlRows('zz')).toEqual(controlRows('ko'))
    expect(keyLocale('en')).toBe('en')
  })

  it('적는 키가 실제로 그 일에 묶인 키다', () => {
    for (const locale of LOCALES) {
      const keys = controlRows(locale).map((r) => r.keys)
      expect(keys).toEqual([
        moveKeys(locale),
        keyList(BINDINGS.run, locale),
        keyList(BINDINGS.interact, locale),
        keyList(BINDINGS.cancel, locale),
        keyList(BINDINGS.menu, locale),
        keyList(BINDINGS.register, locale),
        keyList(BINDINGS.poketch, locale),
        keyList([...BINDINGS.poketchPrev, ...BINDINGS.poketchNext], locale),
        keyList(BINDINGS.view, locale),
      ])
    }
  })

  it('자판 이름이 쪽지에 새지 않는다', () => {
    for (const locale of LOCALES) {
      for (const row of controlRows(locale)) {
        expect(row.keys, locale).not.toMatch(/Key[A-Z]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)/)
      }
    }
  })

  it('임자 키가 전부 왼손에 있다', () => {
    // 오른손은 마우스에 있다. 각 동작의 **첫 키**가 임자고, 그것이 WASD 언저리에
    // 없으면 손을 건너가야 한다 — 등록 도구가 `Y`였을 때가 그랬다.
    // 뒤에 붙은 것(화살표·Enter·Backspace·Esc)은 덤이라 여기 안 걸린다
    const left = new Set(LEFT_HAND)
    for (const [action, codes] of Object.entries(BINDINGS)) {
      expect(left.has(codes[0] ?? ''), `${action}의 임자 ${String(codes[0])}`).toBe(true)
    }
    // 스페이스가 결정이다 — 엄지 자리라 WASD에서 손이 안 움직인다
    expect(BINDINGS.interact[0]).toBe('Space')
    // 오른손 자판은 임자로 안 쓴다
    for (const codes of Object.values(BINDINGS)) {
      expect(codes[0]).not.toMatch(/^(Key[YUIOPHJKLNM]|Arrow|Enter|Backspace|Escape)/)
    }
  })

  it('여닫는 키가 게임 키와 안 겹친다', () => {
    // 겹치면 쪽지를 여는 순간 주인공이 걷거나 메뉴가 열린다
    const taken = new Set(Object.values(BINDINGS).flat())
    for (const code of LEGEND_TOGGLE) {
      expect(taken.has(code), `${code}는 이미 임자가 있다`).toBe(false)
    }
    expect(LEGEND_TOGGLE.length).toBeGreaterThan(0)
    // 쪽지 여는 키도 왼손이다
    expect(new Set(LEFT_HAND).has(LEGEND_TOGGLE[0] ?? '')).toBe(true)
  })

  it('한 줄이 길지 않다 — 구석에 붙는 쪽지다', () => {
    // 가장 긴 줄이 영어의 「W A S D or the arrow keys」 25자다 — 12px로 160px쯤.
    // 이보다 길어지면 구석 쪽지가 아니라 판이 된다
    for (const locale of LOCALES) {
      for (const row of controlRows(locale)) {
        expect(row.keys.length, `${locale} ${row.keys}`).toBeLessThanOrEqual(26)
        expect(row.what.length, `${locale} ${row.what}`).toBeLessThanOrEqual(16)
      }
    }
  })
})
