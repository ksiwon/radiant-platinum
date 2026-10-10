// 이름 짓기 화면의 DOM 계약 (`tools/e2e/drive.mjs:547-553` · `_pg42.mjs:144-146`)
//
// 하네스가 기대는 것은 이 화면 하나다: 문서의 **첫 `input`이 하나뿐**이고(`page.fill('input', …)`), 접근 이름이 「별명」이며,
// 「결정」은 submit 단추, 「그대로 두기」는 `button`이다. 길이 계기(열 칸)가 `input`을 늘리면 안 된다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// zustand는 서버 렌더에서 **처음 값**만 읽는다 — 화면이 읽는 열기 상태(`naming`)를 손으로 바꾼 가짜 스토어로 갈아 끼운다
const fake = vi.hoisted(() => ({
  state: { naming: null as unknown, closeAll: () => undefined, back: () => undefined },
}))
vi.mock('../../state/menuStore', () => ({
  useMenuStore: Object.assign(
    (select: (s: typeof fake.state) => unknown) => select(fake.state),
    { getState: () => fake.state },
  ),
}))

const { NameScreen } = await import('./NameScreen')

describe('이름 짓기 DOM 계약', () => {
  const html = (kind: 'pokemon' | 'tablet' | 'box', initial: string, max: number): string => {
    fake.state.naming = { kind, slot: 0, initial, max }
    return renderToStaticMarkup(createElement(NameScreen))
  }

  it('input은 하나뿐이고 이름이 「별명」이다 — 길이 계기가 input이 아니다', () => {
    for (const kind of ['pokemon', 'tablet', 'box'] as const) {
      const out = html(kind, '풀', 10)
      expect(out.match(/<input/g)).toHaveLength(1)
      expect(out).toContain('aria-label="별명"')
    }
  })

  it('길이 계기는 한도만큼의 칸이고 글자 수만큼 찬다', () => {
    const out = html('pokemon', '풀돌이', 10)
    // 계기 칸 열 + 「3 / 10」
    expect(out).toContain('3 / 10')
    expect(out.match(/<i class=/g)).toHaveLength(10)
  })

  it('「결정」은 submit이고 「그대로 두기」는 button이다', () => {
    const out = html('pokemon', '', 10)
    expect(out).toMatch(/<button[^>]*type="submit"[^>]*>결정<\/button>/)
    expect(out).toMatch(/<button[^>]*type="button"[^>]*>그대로 두기<\/button>/)
  })

  it('바닥 문자열은 그대로고 키캡이 감싼다', () => {
    const out = html('pokemon', '', 10)
    expect(out).toContain('<kbd')
    expect(out.replace(/<[^>]+>/g, '')).toContain('Enter 결정 · Esc 그대로 두기')
  })

  it('글이 아직 안 왔으면 물음 줄은 비어 있다 — 지은 문구를 채우지 않는다', () => {
    expect(html('pokemon', '풀', 10)).not.toContain('별명을 지어 주세요')
  })
})
