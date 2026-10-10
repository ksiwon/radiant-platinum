// 바닥 조작 안내 (`KeyHints.tsx`) — **문자열은 그대로다.**
//
// 키캡은 키 글자에 여백만 더한다. 화면이 넘긴 `'Z 결정 · X 닫기'`의 글자는 한 자도 안 바뀌어야 한다 — 시험
// (`menuFootText.test` 따위)이 그 문자열을 맞대고, 하네스가 바닥 글을 읽는다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { KeyHints, splitKeys } from './KeyHints'

/** 실제 화면이 넘기는 바닥 글들 (`menuFootText.test`와 각 화면에서 모았다) */
const FEET = [
  'Z · X 닫기',
  'Z 결정 · X 닫기',
  '↑↓ 고르기 · Z 결정 · X 그만둔다',
  '↑↓←→ 옮기기 · Tab 확대 · Z 날아간다 · X 뒤로',
  '↑↓ 단어 · Q/E 한 쪽씩 · Z 넣는다 · X 무리로',
  '←→ 기록 · ↑↓ 포켓몬 · Z 기술 보기 · X 닫기',
  'Shift 옮기기 · Space 결정 · Enter · Esc',
  'Z 뒤집기 · X 닫기',
  'X 아니오',
  '',
]

describe('문자열이 그대로다', () => {
  it('키 토큰과 나머지를 이으면 입력과 같다', () => {
    for (const text of FEET) {
      expect(splitKeys(text).map((p) => p.text).join(''), text).toBe(text)
    }
  })

  it('렌더한 글자(태그를 뗀 것)가 입력과 같다', () => {
    for (const tone of ['light', 'dark'] as const) {
      for (const text of FEET) {
        const html = renderToStaticMarkup(createElement(KeyHints, { text, tone }))
        const plain = html.replace(/<[^>]+>/g, '').replaceAll('&gt;', '>').replaceAll('&amp;', '&')
        expect(plain, text).toBe(text)
      }
    }
  })
})

describe('키 글자만 키캡이다', () => {
  const keys = (text: string): string[] => splitKeys(text).filter((p) => p.key).map((p) => p.text)

  it('열세 키 토큰을 잡는다', () => {
    expect(keys('↑↓ ←→ Z X C F S Q E Tab Shift Space Enter Esc'))
      .toEqual(['↑↓', '←→', 'Z', 'X', 'C', 'F', 'S', 'Q', 'E', 'Tab', 'Shift', 'Space', 'Enter', 'Esc'])
  })

  it('화살표 묶음은 긴 것을 먼저 잡는다', () => {
    expect(keys('↑↓←→ 옮기기')).toEqual(['↑↓←→'])
    expect(keys('↑↓ 고르기')).toEqual(['↑↓'])
    expect(keys('↑ 위')).toEqual(['↑'])
  })

  it('Q/E는 둘이다', () => {
    expect(keys('Q/E 한 쪽씩')).toEqual(['Q', 'E'])
  })

  it('낱말 속의 글자는 키가 아니다 — EXP · Lv · Tab키', () => {
    expect(keys('EXP 와 Lv 와 CPU')).toEqual([])
    expect(keys('Z키')).toEqual([])
  })

  it('한글 동사와 가운뎃점은 키캡이 아니다', () => {
    const parts = splitKeys('Z 결정 · X 닫기')
    expect(parts.filter((p) => !p.key).map((p) => p.text)).toEqual([' 결정 · ', ' 닫기'])
  })

  it('어두운 판이면 어두운 키캡 클래스다', () => {
    const light = renderToStaticMarkup(createElement(KeyHints, { text: 'Z 결정' }))
    const dark = renderToStaticMarkup(createElement(KeyHints, { text: 'Z 결정', tone: 'dark' }))
    expect(light).toContain('<kbd')
    expect(dark).toContain('<kbd')
    expect(dark).not.toBe(light)
  })
})
