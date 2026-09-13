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
  CREDIT_SCROLL_PER_FRAME, CREDIT_SCROLL_START, CREDIT_VIEW_HEIGHT, type CreditRow,
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

describe('짧은 판', () => {
  // ⚠️ **길이만 맞추는 것으로는 안 닫힌다.** 한동안 미국 표를 뱅크 길이로 잘라
  // 썼는데, 그것은 「범위를 안 넘는다」만 지키고 **자리는 안 지킨다** — 일본
  // 목록은 127번째 줄부터 아예 갈리므로 잘라낸 표의 간격이 그 뒤로 어긋난다
  it('짧은 표는 그만큼 일찍 끝난다', () => {
    const short = CREDIT_ROWS.slice(0, 184)
    const rows = creditsRows(short)
    expect(rows).toHaveLength(184)
    expect(creditsFrames(rows)).toBeLessThan(CREDITS_FRAMES)
    for (let f = 0; f < CREDITS_FRAMES; f += 37) {
      for (const line of creditsAt(f, rows)) expect(line.index).toBeLessThan(184)
    }
  })

  it('⚠️ 받은 표를 그대로 쓴다 — 미국 표를 섞지 않는다', () => {
    const own: CreditRow[] = [
      { at: 0, centered: true }, { at: 40, centered: false }, { at: 900, centered: false },
    ]
    expect(creditsRows(own)).toEqual(own)
    expect(creditsFrames(creditsRows(own))).toBe(900 + 16 + 240)
  })
})

describe('우리 몫', () => {
  it('⚠️ 롬의 마지막 줄과 화면 하나만큼 떨어진다 — 두 목록이 같이 안 보인다', () => {
    const tail = [true, false, false]
    const rows = creditsRows(CREDIT_ROWS, tail)
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
    const rows = creditsRows(CREDIT_ROWS, [true, false])
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

const LOCALES = ['en', 'ko', 'ja'] as const
const maybe = withData(
  'dialogue/index.json', ...LOCALES.map((l) => `credits.${l}.json`))

const read = <T,>(rel: string): T => JSON.parse(readFileSync(resolve(DATA, rel), 'utf8')) as T
const bank = (locale: string): string[] =>
  read<string[]>(`dialogue/${locale}/${String(CREDITS_BANK)}.json`)
const layout = (locale: string): CreditRow[] =>
  read<{ rows: CreditRow[] }>(`credits.${locale}.json`).rows

maybe('롬의 글과 맞댄다', () => {
  /**
   * ⚠️ **이것이 이 표가 맞다는 근거다.** 사용자 롬의 오버레이 #99에서 읽은 미국
   * 237줄과, 디컴프의 `Unk_ov99_021D4CE4`를 구운 `CREDIT_ROWS`가 **줄마다 같다.**
   * 자리를 그 하나로 못 박고 나면 나머지 두 판은 같은 자를 그대로 댄 것이 된다
   */
  it('⚠️ 미국 롬에서 읽은 표가 디컴프 표와 줄마다 같다', () => {
    expect(layout('en')).toEqual([...CREDIT_ROWS])
    expect(CREDIT_LINES).toBe(237)
  })

  // ⚠️ **판마다 다른 표다.** 「미국 것을 잘라 쓰면 된다」가 아니라는 것을 수로 못 박는다
  it('⚠️ 판마다 줄 수도 마지막 자리도 다르다', () => {
    const size = Object.fromEntries(
      LOCALES.map((l) => [l, layout(l).length]))
    expect(size).toEqual({ en: 237, ko: 209, ja: 184 })
    const last = Object.fromEntries(
      LOCALES.map((l) => [l, layout(l).at(-1)!.at]))
    expect(last).toEqual({ en: 7581, ko: 7530, ja: 7544 })
  })

  /**
   * ⚠️ **빈 줄을 흘리지 않는다.** 한국 롬의 뱅크는 237칸인데 **뒤 28칸이 빈 글**
   * 이다 — 뱅크 길이로 자르면 아무것도 없는 줄 스물여덟이 그대로 흐른다.
   * 배치표의 줄 수가 곧 「글이 있는 줄」의 수여야 한다
   */
  it.each(LOCALES)('%s — 배치표 줄 수가 글이 있는 줄 수와 같다', (locale) => {
    const lines = bank(locale)
    const rows = layout(locale)
    expect(rows.length).toBeLessThanOrEqual(lines.length)
    // 표가 세는 줄은 다 글이 있다
    expect(lines.slice(0, rows.length).filter((l) => l === '')).toEqual([])
    // 표 뒤는 다 빈 글이다 — 흘릴 것이 없다
    expect(lines.slice(rows.length).filter((l) => l !== '')).toEqual([])
  })

  it.each(LOCALES)('%s — 가운데 정렬인 두 줄이 표지다', (locale) => {
    const rows = layout(locale)
    expect(rows.flatMap((r, i) => (r.centered ? [i] : []))).toEqual([0, 1])
    expect(bank(locale)[0]).toMatch(/^\{COLOR 1\}/)
    expect(bank(locale)[1]!.length).toBeGreaterThan(0)
  })

  /**
   * ⚠️ **미국 표를 잘라 쓰면 몇 줄이 틀리는지를 수로 남긴다.**
   *
   * 세 판의 줄 간격 자체가 다르다 — 이름 줄이 미국 21 · 한국 22 · 일본 24픽셀이고
   * 마디 사이도 미국 56/130 · 한국 80/138 · 일본 48/64/168/280으로 갈린다.
   * 그래서 미국 표를 길이로 자르면 **두 번째 줄부터** 어긋난다
   */
  it.each([['ko', 209, 207], ['ja', 184, 182]] as const)(
    '⚠️ %s에 미국 표를 잘라 대면 %d줄 중 %d줄의 자리가 틀리다', (locale, all, wrong) => {
      const rows = layout(locale)
      expect(rows).toHaveLength(all)
      const bad = rows.flatMap((r, i) => (CREDIT_ROWS[i]!.at === r.at ? [] : [i]))
      expect(bad).toHaveLength(wrong)
      // 표지 두 줄만 자리가 같다 — 0픽셀과 16픽셀이라 어느 판이든 같은 자리다
      expect(bad[0]).toBe(2)
      // ⚠️ **가운데 정렬은 세 판이 같다.** 「잘라 써도 정렬은 맞더라」가
      // 「그러니 잘라 써도 된다」가 되지 않도록 그 사실을 여기 적어 둔다
      expect(rows.map((r) => r.centered)).toEqual(CREDIT_ROWS.slice(0, all).map((r) => r.centered))
    })

  /** 줄 간격이 판마다 다르다 — 「같은 표가 옮겨 앉은 것」이 아니라는 증거다 */
  it('⚠️ 이름 줄의 간격이 21 · 22 · 24로 갈린다', () => {
    const pitch = (locale: string): number => {
      const gaps = new Map<number, number>()
      const rows = layout(locale)
      for (let i = 1; i < rows.length; i++) {
        const g = rows[i]!.at - rows[i - 1]!.at
        gaps.set(g, (gaps.get(g) ?? 0) + 1)
      }
      return [...gaps].sort((a, b) => b[1] - a[1])[0]![0]
    }
    expect({ en: pitch('en'), ko: pitch('ko'), ja: pitch('ja') }).toEqual({ en: 21, ko: 22, ja: 24 })
  })
})
