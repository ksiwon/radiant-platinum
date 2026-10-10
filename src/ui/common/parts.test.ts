// 공용 부품의 순수한 부분과 DOM 계약 (SYSTEM §2.2 · §2.3).
//
// 화면 꾸러미 스무 개가 이 부품을 쓴다. 그래서 여기서 잠그는 것은 모양이 아니라 **계약**이다:
//   · 갈래 창 · 예/아니오는 `radiogroup`을 안 단다 (`group`이 참일 때만) — 하네스가 「첫 radiogroup」을 읽는다
//   · 배지 줄은 칸이 늘 같은 정사각이다 (사용자 지적 ①)
//   · 개수 · 탭 · 값 줄의 순수 계산
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { bandAt } from './pickBand'
import { placeChoice, type Box } from './choicePlace'
import { BadgeRail, badgeScale, BADGE_ART, hasBadge } from './BadgeRail'
import { ChoiceMenu } from './ChoiceMenu'
import { CountPicker, countText } from './CountPicker'
import { MessageDock } from './MessageDock'
import { MessageWindow } from './MessageWindow'
import { MonViewport, VIEWPORT_MAX } from './MonViewport'
import { PageTabs, tabLabelOk } from './PageTabs'
import { knobSpan, ScrollKnob } from './ScrollKnob'
import { natureMark, StatTable } from './StatTable'
import { ValueStrip } from './ValueStrip'
import { WaitDial } from './WaitDial'
import { YesNo } from './YesNo'
import { HpBar } from './HpBar'
import { GenderMark, MonIdentity } from './MonIdentity'
import { GroundShadow } from './GroundShadow'
import * as css from './parts.css'

const html = (el: Parameters<typeof renderToStaticMarkup>[0]): string => renderToStaticMarkup(el)

describe('금 띠가 앉는 자리', () => {
  it('세로 띠는 줄 번호 × 줄 높이만큼 내려간다', () => {
    expect(bandAt('y', 0)).toEqual({ transform: 'translateY(0px)', height: 32 })
    expect(bandAt('y', 3)).toEqual({ transform: 'translateY(96px)', height: 32 })
  })

  it('큰 줄(44)이나 가로 띠도 같은 식이다', () => {
    expect(bandAt('y', 2, 44)).toEqual({ transform: 'translateY(88px)', height: 44 })
    expect(bandAt('x', 2, 120, 100)).toEqual({ transform: 'translateX(240px)', width: 100 })
  })

  it('음수 번호는 0으로 막는다', () => {
    expect(bandAt('y', -4).transform).toBe('translateY(0px)')
  })
})

describe('뜨는 창의 자리 (placeChoice)', () => {
  const bounds: Box = { left: 0, top: 0, width: 960, height: 640 }
  const row: Box = { left: 100, top: 200, width: 300, height: 32 }
  const size = { width: 200, height: 120 }

  it('원인의 오른쪽 옆에 앉고 위끝이 원인에 맞는다', () => {
    const at = placeChoice(row, size, bounds, 'right')
    expect(at.side).toBe('right')
    expect(at.left).toBe(100 + 300 + 8)
    expect(at.top).toBe(200)
  })

  it('오른쪽에 자리가 없으면 왼쪽으로 뒤집는다', () => {
    const edge: Box = { left: 700, top: 100, width: 240, height: 32 }
    const at = placeChoice(edge, size, bounds, 'right')
    expect(at.side).toBe('left')
    expect(at.left).toBe(700 - 8 - 200)
  })

  it('양쪽 다 없으면 원하던 쪽에 둔다', () => {
    const narrow: Box = { left: 0, top: 0, width: 300, height: 640 }
    const at = placeChoice({ left: 10, top: 10, width: 280, height: 32 }, size, narrow, 'right')
    expect(at.side).toBe('right')
  })

  it('본문 아래로 나가면 위로 당긴다', () => {
    const low: Box = { left: 100, top: 600, width: 300, height: 32 }
    const at = placeChoice(low, size, bounds, 'right')
    expect(at.top).toBe(640 - 120)
  })

  it('본문 위로는 못 나간다', () => {
    const high: Box = { left: 100, top: -50, width: 300, height: 32 }
    expect(placeChoice(high, size, bounds, 'right').top).toBe(0)
  })

  it('꼭지는 원인 줄의 가운데를 가리키되 창 안에 머문다', () => {
    const at = placeChoice({ left: 0, top: 216, width: 100, height: 32 }, size, bounds, 'right')
    // 창 위끝 216, 원인 가운데 232 → 16
    expect(at.nibAt).toBe(16)
    const clamped = placeChoice({ left: 0, top: 600, width: 100, height: 32 }, size, bounds, 'right')
    expect(clamped.nibAt).toBeGreaterThanOrEqual(12)
    expect(clamped.nibAt).toBeLessThanOrEqual(120 - 12)
  })
})

describe('역할 계약 (§2.3)', () => {
  const items = [{ label: '쓴다' }, { label: '버린다' }, { label: '그만둔다' }]

  it('ChoiceMenu는 radiogroup을 안 단다', () => {
    const out = html(createElement(ChoiceMenu, { items, anchor: null, onPick: () => undefined }))
    expect(out).not.toContain('radiogroup')
    expect(out).not.toContain('role="radio"')
  })

  it('박스는 rootProps로 menu를, itemRole로 menuitem과 aria-selected를 받는다', () => {
    const out = html(createElement(ChoiceMenu, {
      items, anchor: null, onPick: () => undefined, initial: 1,
      rootProps: { role: 'menu', 'data-box-menu': 'mon' }, itemRole: 'menuitem',
    }))
    expect(out).toContain('role="menu"')
    expect(out).toContain('data-box-menu="mon"')
    expect(out.match(/role="menuitem"/g)).toHaveLength(3)
    expect(out).toContain('aria-selected="true"')
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(out.match(/aria-selected="false"/g)).toHaveLength(2)
  })

  it('항목 글이 그대로다 (textContent) — 하네스가 글로 읽는다', () => {
    const out = html(createElement(ChoiceMenu, { items, anchor: null, onPick: () => undefined }))
    const text = out.replace(/<[^>]+>/g, '')
    expect(text).toBe('쓴다버린다그만둔다')
  })

  it('YesNo는 group일 때만 radiogroup이다', () => {
    const plain = html(createElement(YesNo, { labels: ['예', '아니오'], initial: 0, onPick: () => undefined }))
    expect(plain).not.toContain('radiogroup')
    const grouped = html(createElement(YesNo, { labels: ['예', '아니오'], initial: 0, group: true, onPick: () => undefined }))
    expect(grouped).toContain('role="radiogroup"')
    expect(grouped.match(/role="radio"/g)).toHaveLength(2)
    expect(grouped).toContain('aria-checked="true"')
  })

  it('YesNo의 처음 칸은 부르는 쪽이 정한다 — 예(0)나 아니오(1)', () => {
    const at = (initial: 0 | 1): string => html(createElement(YesNo, {
      labels: ['예', '아니오'], initial, group: true, onPick: () => undefined,
    }))
    expect(at(0)).toMatch(/aria-checked="true"[^>]*>예</)
    expect(at(1)).toMatch(/aria-checked="true"[^>]*>아니오</)
  })

  it('ValueStrip은 radiogroup이고 key가 자리다 — 값 글이 바뀌어도 칸이 그대로다', () => {
    const out = html(createElement(ValueStrip, { values: ['느림', '보통', '빠름'], at: 1, label: '속도' }))
    expect(out).toContain('role="radiogroup"')
    expect(out.match(/role="radio"/g)).toHaveLength(3)
    expect(out).toMatch(/aria-checked="true"[^>]*>보통</)
  })

  it('메뉴 부품 어디에도 radiogroup을 새로 심지 않았다 (MessageDock · MessageWindow · PageTabs · BadgeRail · 막대)', () => {
    const outs = [
      html(createElement(MessageDock, { lines: ['대사'] })),
      html(createElement(MessageWindow, { lines: ['대사'], dial: true })),
      html(createElement(PageTabs, { pages: [{ key: 'a', label: '가' }], at: 0 })),
      html(createElement(BadgeRail, { badges: 0b101 })),
      html(createElement(HpBar, { hp: 10, max: 20 })),
      html(createElement(StatTable, { stats: [{ name: 'HP', value: 20 }] })),
    ]
    for (const out of outs) expect(out).not.toContain('radiogroup')
  })
})

describe('배지 줄 (사용자 지적 ①)', () => {
  const badges = 0b00101101

  it('받은 칸과 못 받은 칸이 같은 정사각이다', () => {
    for (const size of [24, 28, 32, 64, 128]) {
      const out = html(createElement(BadgeRail, { badges, size }))
      const cells = [...out.matchAll(/<span role="listitem"[^>]*style="([^"]*)"/g)].map((m) => m[1])
      expect(cells).toHaveLength(8)
      expect(new Set(cells).size, `size ${String(size)}`).toBe(1)
      expect(cells[0]).toBe(`width:${String(size)}px;height:${String(size)}px`)
    }
  })

  it('그림은 칸마다 같은 크기이고 위치만 다르다 — 같은 배지 그림이다', () => {
    const out = html(createElement(BadgeRail, { badges, size: 64 }))
    const arts = [...out.matchAll(/<span[^>]*style="(width:[^"]*background-position:[^"]*)"/g)].map((m) => m[1]!)
    expect(arts).toHaveLength(8)
    const sizes = new Set(arts.map((a) => a.replace(/background-position:[^;]*;?/, '').trim()))
    expect(sizes.size).toBe(1)
    const positions = arts.map((a) => /background-position:([^;]*)/.exec(a)![1])
    expect(new Set(positions).size).toBe(8)
  })

  it('못 받은 칸만 brightness(0)의 클래스가 붙는다', () => {
    const out = html(createElement(BadgeRail, { badges, size: 64 }))
    // 0b00101101은 네 개를 받았다 — 배지 0 · 2 · 3 · 5
    expect(out.split(css.badgeOff).length - 1).toBe(4)
    expect(out.match(/data-badge="on"/g)).toHaveLength(4)
    expect(out.match(/data-badge="off"/g)).toHaveLength(4)
  })

  it('비트마스크와 불리언 배열이 같다', () => {
    const flags = [true, false, true, true, false, true, false, false]
    for (let i = 0; i < 8; i++) expect(hasBadge(badges, i)).toBe(flags[i])
    expect(hasBadge(flags, 0)).toBe(true)
    expect(hasBadge(flags, 1)).toBe(false)
  })

  it('칸 안의 배율: 창(40) 이상이면 정수배(도트)이고 작으면 줄인다', () => {
    expect(badgeScale(40)).toBe(1)
    expect(badgeScale(63)).toBe(1)
    expect(badgeScale(80)).toBe(2)
    expect(badgeScale(32)).toBeCloseTo(32 / 40, 10)
    // 어떤 크기에서도 창(40×40)이 정사각 칸 안에 든다
    for (const size of [16, 24, 32, 40, 48, 64, 80, 128]) {
      const k = badgeScale(size)
      expect(40 * k).toBeLessThanOrEqual(size)
    }
  })

  it('그림 시트는 8×4이고 40×63이다', () => {
    expect(BADGE_ART).toMatchObject({ cellW: 40, cellH: 63, cols: 8, rows: 4 })
  })
})

describe('개수 · 탭 · 값', () => {
  it('개수는 ×와 세 자리다', () => {
    expect(countText(3)).toBe('×003')
    expect(countText(99)).toBe('×099')
    expect(countText(0)).toBe('×000')
    expect(countText(-5)).toBe('×000')
    const out = html(createElement(CountPicker, { value: 7, min: 1, max: 99 }))
    expect(out).toContain('×007')
    expect(out).toContain('aria-valuenow="7"')
  })

  it('끝에서는 그쪽 화살표가 꺼진 박자로 선다', () => {
    const atMax = html(createElement(CountPicker, { value: 99, min: 1, max: 99 }))
    const mid = html(createElement(CountPicker, { value: 50, min: 1, max: 99 }))
    expect(atMax.split(css.countOff).length - 1).toBe(1)
    expect(mid.includes(css.countOff)).toBe(false)
  })

  it('탭 글에 숫자와 /가 없어야 한다', () => {
    expect(tabLabelOk('정보')).toBe(true)
    expect(tabLabelOk('기술')).toBe(true)
    expect(tabLabelOk('1/4')).toBe(false)
    expect(tabLabelOk('쪽 2')).toBe(false)
  })

  it('탭은 role=tab이고 고른 것만 aria-selected다', () => {
    const out = html(createElement(PageTabs, {
      pages: [{ key: 'info', label: '정보' }, { key: 'skills', label: '능력치', mark: 'red' }, { key: 'moves', label: '기술' }],
      at: 1,
    }))
    expect(out).toContain('role="tablist"')
    expect(out.match(/role="tab"/g)).toHaveLength(3)
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(out).toMatch(/aria-selected="true"[^>]*>(<span[^>]*><\/span>)?능력치</)
  })

  it('손잡이는 보이는 줄이 전체보다 작을 때만 있다', () => {
    expect(knobSpan(0, 8, 8)).toBeNull()
    expect(knobSpan(0, 10, 8)).toBeNull()
    expect(knobSpan(0, 8, 0)).toBeNull()
    expect(knobSpan(0, 8, 40)).toEqual({ top: 0, size: 8 / 40 })
    // 끝까지 내리면 손잡이가 홈 끝에 닿는다
    const end = knobSpan(32, 8, 40)!
    expect(end.top + end.size).toBeCloseTo(1, 10)
    // 너무 작은 손잡이는 잡을 수 있는 크기로 키운다
    expect(knobSpan(0, 1, 1000)!.size).toBeCloseTo(0.08, 10)
    expect(html(createElement(ScrollKnob, { at: 0, visible: 8, total: 8 }))).toBe('')
  })

  it('성격 ▲▼는 올리는 칸과 내리는 칸에만 선다', () => {
    const nature = { up: 1, down: 3 }
    expect([0, 1, 2, 3, 4, 5].map((i) => natureMark(i, nature))).toEqual([0, 1, 0, -1, 0, 0])
    // 무보정 성격(올리는 쪽과 내리는 쪽이 같다)이나 성격이 없으면 없다
    expect(natureMark(2, { up: 2, down: 2 })).toBe(0)
    expect(natureMark(1, undefined)).toBe(0)
  })
})

describe('그 밖의 부품', () => {
  it('MessageDock은 when이 거짓이면 자리를 안 잡는다', () => {
    expect(html(createElement(MessageDock, { lines: ['말'], when: false }))).toBe('')
    expect(html(createElement(MessageDock, { lines: ['말'] }))).toContain('말')
  })

  it('MessageDock은 여러 줄을 줄바꿈으로 잇는다 (한꺼번에 올린다)', () => {
    expect(html(createElement(MessageDock, { lines: ['첫 줄', '둘째 줄'] }))).toContain('첫 줄\n둘째 줄')
  })

  it('MessageWindow는 두 줄 창이다', () => {
    const out = html(createElement(MessageWindow, { lines: '첫 줄\n둘째 줄' }))
    expect(out.match(/첫 줄|둘째 줄/g)).toHaveLength(2)
  })

  it('WaitDial은 점이 여덟이다', () => {
    const out = html(createElement(WaitDial, { running: true }))
    expect(out.match(/<span[^>]*--a:/g)).toHaveLength(8)
    expect(out).toContain('aria-hidden')
  })

  it('MonViewport는 글자 0 · aria-hidden이고 320을 안 넘는다', () => {
    const out = html(createElement(MonViewport, { species: 387, size: 999 }))
    expect(out.replace(/<[^>]+>/g, '')).toBe('')
    expect(out).toContain('aria-hidden')
    expect(out).toContain(`width:${String(VIEWPORT_MAX)}px`)
    expect(out).not.toContain('role=')
  })

  it('GenderMark는 ♂♀만 그리고 무성이면 비운다', () => {
    expect(html(createElement(GenderMark, { gender: 'male' }))).toContain('♂')
    expect(html(createElement(GenderMark, { gender: 'female' }))).toContain('♀')
    expect(html(createElement(GenderMark, { gender: 'none' }))).toBe('')
    expect(html(createElement(GenderMark, { gender: null }))).toBe('')
  })

  it('MonIdentity는 이름 · 성별 · 별 · Lv 차례다', () => {
    const out = html(createElement(MonIdentity, { name: '모부기', gender: 'male', shiny: true, level: 12 }))
    const plain = out.replace(/<[^>]+>/g, '')
    expect(plain).toBe('모부기♂★Lv12')
  })

  it('어두운 판 위의 성별은 성별 색 없이 ink.onDark다', () => {
    const dark = html(createElement(GenderMark, { gender: 'male', onDark: true }))
    const light = html(createElement(GenderMark, { gender: 'male' }))
    expect(dark).toContain(css.genderOnDark)
    expect(dark).not.toContain(css.genderMale)
    expect(light).toContain(css.genderMale)
  })

  it('HpBar는 비율 폭이고 숫자를 붙일 수 있다', () => {
    const out = html(createElement(HpBar, { hp: 10, max: 40, numbers: true }))
    expect(out).toContain('width:25%')
    expect(out).toContain('10 / 40')
    expect(html(createElement(HpBar, { hp: 0, max: 40 }))).toContain('width:0%')
    expect(html(createElement(HpBar, { hp: 99, max: 40 }))).toContain('width:100%')
  })

  it('GroundShadow는 타원 하나다', () => {
    expect(html(createElement(GroundShadow, { w: 96, h: 16 }))).toContain('width:96px;height:16px')
  })

  it('StatTable은 이름 · 값 · 성격 세모를 그린다', () => {
    const out = html(createElement(StatTable, {
      stats: [{ name: 'HP', value: 20 }, { name: '공격', value: 11 }, { name: '방어', value: 9 }],
      nature: { up: 1, down: 2 },
    }))
    expect(out).toContain('>공격<')
    expect(out).toContain(css.natureUp)
    expect(out).toContain(css.natureDown)
  })
})
