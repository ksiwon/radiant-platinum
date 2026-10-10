// 메뉴 창 틀 (`MenuScreen.tsx`) — 층 다섯 가운데 이 틀이 서는 셋과 DOM 순서 (SYSTEM §0 L1 · §2.2).
//
//   덮는 창   variant: 'screen'(기본)
//   가운데 창 variant: 'center'
//   연출      cinematic — 창 얼굴과 테두리가 없다
//
// ⚠️ **제목 글자로 가르지 않는다.** 한때 `title === '진화'`로 연출을 골라서 제목 문구를 다듬으면 그 화면의 3D가
// 조용히 불투명 창에 가려졌다. 가르는 것은 속성이고, 연출 화면들이 그 속성을 **실제로 단다**는 것도 여기서 잰다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MenuScreen } from './MenuScreen'
import * as chrome from './menuChrome.css'

const html = (props: Record<string, unknown>, body = '본문'): string =>
  renderToStaticMarkup(createElement(MenuScreen, { title: '시험', ...props } as never, body))

const read = (rel: string): string => readFileSync(resolve(import.meta.dirname, rel), 'utf8')

describe('층', () => {
  it('덮는 창이 기본이다', () => {
    const out = html({})
    expect(out).toContain(chrome.overlay)
    expect(out).toContain(chrome.screen)
    expect(out).not.toContain(chrome.cinematicOverlay)
    expect(out).not.toContain(chrome.centerWindow)
  })

  it('가운데 창은 덮개는 같고 창이 작은 꼴이다 — 폭은 인라인으로 준다', () => {
    const out = html({ variant: 'center', width: 420 })
    expect(out).toContain(chrome.overlay)
    expect(out).toContain(chrome.centerWindow)
    expect(out).toContain('width:420px')
  })

  it('연출은 창 얼굴이 없고 덮개가 뒤를 안 가린다', () => {
    const out = html({ cinematic: true })
    expect(out).toContain(chrome.cinematicOverlay)
    expect(out).toContain(chrome.cinematicScreen)
  })

  it('framed이면 연출이어도 창을 그린다 (무대가 비어 뒤로 비칠 것이 없을 때)', () => {
    const out = html({ cinematic: true, framed: true })
    expect(out).toContain(chrome.screen)
    expect(out).not.toContain(chrome.cinematicScreen)
    expect(out).toContain(chrome.overlay)
  })

  it('제목 글자로는 안 갈린다 — 「진화」「알」「명예의 전당」이라는 이름만으로는 연출이 아니다', () => {
    for (const title of ['진화', '알', '명예의 전당']) {
      const out = html({ title })
      expect(out, title).not.toContain(chrome.cinematicScreen)
      expect(out, title).toContain(chrome.screen)
    }
  })

  it('소스에도 제목 비교가 없다', () => {
    const src = read('MenuScreen.tsx').replace(/\/\/[^\n]*/g, '')
    expect(src).not.toMatch(/title\s*===/)
    expect(src).not.toContain("'진화'")
  })
})

describe('머리 · 바닥 · 글 띠', () => {
  it('머리에 제목이, 바닥에 안내가 있다', () => {
    const out = html({ foot: 'Z 결정 · X 닫기' })
    expect(out).toContain(chrome.head)
    expect(out).toContain('>시험<')
    expect(out).toContain(chrome.foot)
    expect(out.replace(/<[^>]+>/g, '')).toBe('시험본문Z 결정 · X 닫기')
  })

  it('bare는 머리와 바닥이 없다', () => {
    const out = html({ bare: true, foot: 'X 닫기' })
    expect(out).not.toContain(chrome.head)
    expect(out).not.toContain(chrome.foot)
    expect(out).toContain('본문')
  })

  it('foot이 빈 문자열이어도 바닥 띠는 그대로 선다 (옛 DOM과 같다)', () => {
    expect(html({ foot: '' })).toContain(chrome.foot)
    expect(html({})).not.toContain(chrome.foot)
  })

  it('message는 DOM에서 foot 뒤에 온다 — 파티 하네스(drive.mjs:3559)가 그 순서를 읽는다', () => {
    const out = html({ foot: 'X 닫기', message: createElement('div', { id: 'dock' }, '롬 글') })
    // 키캡이 `<kbd>X</kbd>`로 감싸므로 태그를 떼고 글의 차례를 본다
    expect(out.replace(/<[^>]+>/g, '')).toBe('시험본문X 닫기롬 글')
    expect(out.indexOf('id="dock"')).toBeGreaterThan(out.indexOf(chrome.foot))
  })

  it('보이는 자리는 CSS order다 — message(1) → foot(2)', () => {
    const css = read('menuChrome.css.ts')
    const foot = css.slice(css.indexOf('export const foot = style('))
    expect(foot.slice(0, foot.indexOf('})'))).toContain('order: 2')
    const dock = readFileSync(resolve(import.meta.dirname, '../common/parts.css.ts'), 'utf8')
    const at = dock.slice(dock.indexOf('export const dock = style('))
    expect(at.slice(0, at.indexOf('})'))).toContain('order: 1')
  })

  it('탭이 있으면 제목 자리에 서고 제목은 aria-label로 남는다', () => {
    const out = html({ tabs: { pages: [{ key: 'a', label: '정보' }, { key: 'b', label: '기술' }], at: 0 } })
    expect(out).toContain('role="tablist"')
    expect(out).toContain('aria-label="시험"')
    expect(out).not.toContain(chrome.crestText)
  })

  it('아이콘은 제목 앞의 칸이다', () => {
    const out = html({ icon: createElement('i', { id: 'ico' }) })
    expect(out.indexOf('id="ico"')).toBeLessThan(out.indexOf('>시험<'))
    expect(out).toContain(chrome.headIcon)
  })

  it('3D 구멍이 있으면 창에 구멍 클래스와 --hole 변수가 선다', () => {
    const out = html({ hole: { x: 10, y: 20, w: 240, h: 240 } })
    expect(out).toContain(chrome.screenHole)
    expect(out).toContain('--hole-x:10px')
    expect(out).toContain('--hole-w:240px')
    // 구멍이 없으면 안 선다
    expect(html({})).not.toContain(chrome.screenHole)
  })
})

describe('연출 화면이 속성을 단다 (제목 비교를 걷은 뒤에도 3D가 안 가려진다)', () => {
  it('진화 · 부화 · 교환 · PC 전당(기록이 있을 때와 없을 때)', () => {
    expect(read('EvolutionScreen.tsx')).toMatch(/<MenuScreen title="진화" cinematic/)
    expect(read('HatchScreen.tsx')).toMatch(/<MenuScreen title="알" cinematic/)
    expect(read('TradeScreen.tsx')).toMatch(/<MenuScreen title="교환" cinematic/)
    expect(read('HallOfFameScreen.tsx')).toMatch(/<MenuScreen title="명예의 전당" cinematic bare>/)
    const pc = read('PCHallOfFameScreen.tsx')
    // 제목은 세 언어 표(`PC_HALL_WORDS`)에서 온다 — 한국어 글은 표에 있다
    expect(pc).toMatch(/<MenuScreen title=\{words\.title\} foot=\{footWords\(locale\)\.close\} cinematic framed>/)
    expect(pc).toMatch(/<MenuScreen title=\{words\.title\} cinematic bare>/)
    expect(pc).toContain("title: '명예의 전당'")
  })
})
