// 크레딧 두루마리 (PARITY §8.12)
//
// ⚠️ **표는 디컴프에서 구운 것이다** (`pnpm gen:credits`). 여기서 못 박는 것은
// **모양과 규칙**이지 자리 하나하나가 아니다 — 값은 굽는 쪽이 책임진다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  creditsAt, creditsFrames, creditsRows, creditsScene,
  CREDITS_BANK, CREDITS_FRAMES, CREDITS_TAIL_GAP,
} from './credits'
import {
  CREDIT_INDENT, CREDIT_LINE_HEIGHT, CREDIT_LINES, CREDIT_ROWS,
  CREDIT_SCROLL_PER_FRAME, CREDIT_SCROLL_START, CREDIT_VIEW_HEIGHT,
} from './creditsTable'
import { DATA, withData } from '../../data/romData.testkit'

describe('표의 모양', () => {
  it('237줄이고 자리가 늘기만 한다', () => {
    expect(CREDIT_LINES).toBe(237)
    expect(CREDIT_ROWS).toHaveLength(CREDIT_LINES)
    for (let i = 1; i < CREDIT_ROWS.length; i++) {
      expect(CREDIT_ROWS[i]!.at, `${String(i)}번째`).toBeGreaterThanOrEqual(CREDIT_ROWS[i - 1]!.at)
    }
  })

  it('⚠️ 가운데 정렬은 표지 두 줄뿐이다 — 나머지는 다 들여쓰기다', () => {
    const centered = CREDIT_ROWS.flatMap((r, i) => (r.centered ? [i] : []))
    expect(centered).toEqual([0, 1])
    expect(CREDIT_INDENT).toBe(32)
  })

  it('원작 속도로 두 마디쯤 흐른다', () => {
    expect(CREDIT_SCROLL_PER_FRAME).toBe(1)
    expect(CREDIT_LINE_HEIGHT).toBe(16)
    // 60fps에서 130초. 늘리거나 줄이면 이 수부터 움직인다
    expect(Math.round(CREDITS_FRAMES / 60)).toBe(131)
  })
})

describe('흐르는 자리', () => {
  it('시작하자마자는 아무것도 안 뜬다 — 240픽셀이 빈다', () => {
    expect(creditsAt(0)).toEqual([])
    expect(CREDIT_SCROLL_START).toBe(-240)
  })

  it('⚠️ 화면보다 아래에서 미리 그린다 — 뜨는 판정이 화면 높이만큼 앞선다', () => {
    // 첫 줄의 자리가 0이므로 두루마리가 −192에 닿는 프레임에 처음 걸린다
    const first = CREDIT_ROWS[0]!.at
    const frame = first - CREDIT_SCROLL_START - CREDIT_VIEW_HEIGHT
    expect(creditsAt(frame - 1)).toEqual([])
    expect(creditsAt(frame)).toEqual([{ index: 0, y: CREDIT_VIEW_HEIGHT, centered: true }])
  })

  it('한 프레임에 한 픽셀씩 올라온다', () => {
    const frame = CREDIT_ROWS[0]!.at - CREDIT_SCROLL_START - CREDIT_VIEW_HEIGHT
    expect(creditsAt(frame + 50)[0]?.y).toBe(CREDIT_VIEW_HEIGHT - 50)
  })

  it('⚠️ 줄 높이만큼 지나야 사라진다 — 위쪽이 −16에서 닫힌다', () => {
    const at = CREDIT_ROWS[0]!.at
    const gone = at - CREDIT_SCROLL_START + CREDIT_LINE_HEIGHT
    expect(creditsAt(gone - 1).some((l) => l.index === 0)).toBe(true)
    expect(creditsAt(gone).some((l) => l.index === 0)).toBe(false)
  })

  it('다 흐르면 아무것도 안 남는다', () => {
    expect(creditsAt(CREDITS_FRAMES)).toEqual([])
  })

  it('한 화면에 열두 줄까지 선다 — 192픽셀에 16픽셀 줄이다', () => {
    let most = 0
    for (let f = 0; f < CREDITS_FRAMES; f += 7) most = Math.max(most, creditsAt(f).length)
    expect(most).toBeGreaterThan(0)
    expect(most).toBeLessThanOrEqual(CREDIT_VIEW_HEIGHT / CREDIT_LINE_HEIGHT + 1)
  })
})

describe('짧은 뱅크', () => {
  it('⚠️ 일본 롬은 184줄이다 — 없는 줄은 안 흐르고 그만큼 일찍 끝난다', () => {
    const ja = 184
    const rows = creditsRows(ja)
    expect(rows).toHaveLength(ja)
    expect(creditsFrames(rows)).toBeLessThan(CREDITS_FRAMES)
    for (let f = 0; f < CREDITS_FRAMES; f += 37) {
      for (const line of creditsAt(f, rows)) expect(line.index).toBeLessThan(ja)
    }
  })

  it('표보다 긴 수를 줘도 표에서 멈춘다', () => {
    expect(creditsRows(9999)).toHaveLength(CREDIT_LINES)
    expect(creditsFrames(creditsRows(9999))).toBe(CREDITS_FRAMES)
  })
})

describe('우리 몫', () => {
  it('⚠️ 롬의 마지막 줄과 화면 하나만큼 떨어진다 — 두 목록이 같이 안 보인다', () => {
    const tail = [true, false, false]
    const rows = creditsRows(CREDIT_LINES, tail)
    expect(rows).toHaveLength(CREDIT_LINES + tail.length)
    const lastRom = rows[CREDIT_LINES - 1]!.at
    const firstOurs = rows[CREDIT_LINES]!.at
    expect(firstOurs - lastRom).toBe(CREDITS_TAIL_GAP)
    expect(CREDITS_TAIL_GAP).toBeGreaterThan(CREDIT_VIEW_HEIGHT)
    // 어느 프레임에도 둘이 같이 서 있지 않다
    for (let f = 0; f < creditsFrames(rows); f += 5) {
      const on = creditsAt(f, rows)
      const rom = on.some((l) => l.index < CREDIT_LINES)
      const ours = on.some((l) => l.index >= CREDIT_LINES)
      expect(rom && ours, `프레임 ${String(f)}`).toBe(false)
    }
  })

  it('가운데 정렬 표시가 그대로 실린다', () => {
    const rows = creditsRows(CREDIT_LINES, [true, false])
    expect(rows[CREDIT_LINES]!.centered).toBe(true)
    expect(rows[CREDIT_LINES + 1]!.centered).toBe(false)
  })
})

describe('배경 넘기기', () => {
  it('⚠️ 우리가 정한 값이다 — 세 장을 똑같이 나눈다', () => {
    expect(creditsScene(0, 3)).toBe(0)
    expect(creditsScene(Math.floor(CREDITS_FRAMES / 2), 3)).toBe(1)
    expect(creditsScene(CREDITS_FRAMES - 1, 3)).toBe(2)
    // 범위를 넘겨도 마지막 장에서 멈춘다
    expect(creditsScene(CREDITS_FRAMES * 2, 3)).toBe(2)
    expect(creditsScene(0, 0)).toBe(0)
  })
})

const maybe = withData('dialogue/index.json')

maybe('롬의 글과 맞댄다', () => {
  const lines: string[] = JSON.parse(
    readFileSync(resolve(DATA, 'dialogue/ko', `${String(CREDITS_BANK)}.json`), 'utf8'),
  )

  it('⚠️ 뱅크의 줄 수가 표와 같다 — 어긋나면 빈 줄이 흐른다', () => {
    expect(lines).toHaveLength(CREDIT_LINES)
  })

  it('가운데 정렬인 두 줄이 표지다 — 첫 줄에 색 부호가 붙어 있다', () => {
    expect(lines[0]).toMatch(/^\{COLOR 1\}/)
    expect(lines[1]!.length).toBeGreaterThan(0)
  })
})
