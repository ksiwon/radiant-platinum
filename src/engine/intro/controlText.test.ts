// 마박사의 조작 설명이 **실제로 묶인 키**와 같은가.
//
// 이 글은 우리가 지은 것이라 원작과 대조할 데가 없다. 대신 대조할 것이 하나
// 있다 — `BINDINGS`다. 키를 바꿨는데 글이 안 바뀌면 게임이 **거짓말을 하게**
// 되므로, 그 어긋남을 여기서 잡는다.
import { describe, expect, it } from 'vitest'
import { BINDINGS } from '../input/keys'
import { controlPages, keyLabel, keyList, moveKeys } from './controlText'

const LOCALES = ['ko', 'en', 'ja'] as const

/** 원작 대사창 규칙 — `\r`이 쪽 넘김이다 */
const pagesOf = (text: string): string[] => text.split('\r')

describe('오프닝 조작 설명', () => {
  it('세 언어 다 두 쪽이다 — 원작이 나눈 자리와 같다', () => {
    for (const locale of LOCALES) {
      const got = controlPages(locale)
      expect(got, locale).toHaveLength(2)
      for (const page of got) expect(page.length, locale).toBeGreaterThan(20)
    }
    // 모르는 언어는 한국어로 떨어진다 — 설정에 그 셋뿐이다
    expect(controlPages('zz')).toEqual(controlPages('ko'))
  })

  it('자판 이름(`event.code`)이 화면에 새지 않는다', () => {
    // `KeyZ`·`ShiftLeft`는 자판을 가리키는 이름이라 사람이 못 읽는다.
    // 이름표를 빠뜨리면 그 글자가 그대로 화면에 뜬다
    for (const locale of LOCALES) {
      for (const page of controlPages(locale)) {
        expect(page, locale).not.toMatch(/Key[A-Z]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)/)
      }
    }
    // 묶여 있는 키는 하나도 빠짐없이 **읽을 수 있는** 이름을 갖는다.
    // `Space`·`Enter`처럼 자판 이름이 곧 읽는 이름인 것도 있으므로 「코드와
    // 다른가」가 아니라 **「자판 이름처럼 생겼는가」**로 본다
    for (const [action, codes] of Object.entries(BINDINGS)) {
      for (const code of codes) {
        expect(keyLabel(code), `${action}의 ${code}`)
          .not.toMatch(/^(Key[A-Z]|Arrow|Shift(Left|Right))/)
      }
    }
  })

  it('말하는 키가 실제로 그 일에 묶인 키다', () => {
    for (const locale of LOCALES) {
      const [first, second] = controlPages(locale)
      // 앞쪽 — 움직이기·달리기·결정·취소
      expect(first).toContain(moveKeys(locale))
      for (const codes of [BINDINGS.run, BINDINGS.interact, BINDINGS.cancel]) {
        expect(first, `${locale} ${codes.join('/')}`).toContain(keyList(codes, locale))
      }
      // 뒤쪽 — 메뉴·등록한 도구·포켓치·시점
      for (const codes of [BINDINGS.menu, BINDINGS.register, BINDINGS.poketch, BINDINGS.view]) {
        expect(second, `${locale} ${codes.join('/')}`).toContain(keyList(codes, locale))
      }
      expect(second).toContain(keyList([...BINDINGS.poketchPrev, ...BINDINGS.poketchNext], locale))
    }
  })

  it('걷는 키를 여덟 개짜리 목록으로 늘어놓지 않는다', () => {
    // W A S D와 화살표 넷이 같은 일을 한다. 「W 또는 ↑ 또는 A 또는 …」로 적으면
    // 읽히지 않는다 — 글자 자판은 나란히, 화살표는 한 마디로 줄인다
    const ko = moveKeys('ko')
    expect(ko).toContain('W A S D')
    expect(ko).toContain('화살표')
    expect(ko).not.toContain('↑')
    expect(moveKeys('en')).toContain('arrow')
    expect(moveKeys('ja')).toContain('矢印')
  })

  it('같은 이름으로 적히는 키는 한 번만 적는다', () => {
    // 왼쪽·오른쪽 Shift가 둘 다 달리기다. 「Shift 또는 Shift」가 되면 안 된다
    expect(BINDINGS.run.length).toBeGreaterThan(1)
    expect(keyList(BINDINGS.run, 'ko')).toBe('Shift')
    expect(keyList(['KeyZ', 'Space'], 'ko')).toBe('Z 또는 Space')
    expect(keyList(['KeyZ', 'Space'], 'en')).toBe('Z or Space')
  })

  it('창에 올릴 수 있는 길이다', () => {
    // 대사창은 두 줄짜리다. 원작 줄도 그 폭에 맞춰 잘려 있고 우리 글도 같아야
    // 한다 — 한 쪽에 세 줄이 들어가면 창을 넘긴다
    for (const locale of LOCALES) {
      for (const page of controlPages(locale)) {
        for (const window of pagesOf(page)) {
          expect(window.split('\n').length, `${locale}: ${window}`).toBeLessThanOrEqual(2)
        }
      }
    }
  })
})
