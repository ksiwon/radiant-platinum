// 기술 되살리기의 글 쪽 · 칸 넣기 · 목록 창 (뱅크 645의 줄 번호는 굽는 대로다)
import { describe, expect, it } from 'vitest'
import { MOVES_MAX, REMINDER_LABEL, pagesOf, placeMove, reminderLines, windowTop } from './moveReminderFlow'

describe('줄 번호', () => {
  it('가르침은 0~10, 되살리기는 11~21에서 같은 차례로 선다', () => {
    const t = reminderLines(true)
    const r = reminderLines(false)
    for (const key of Object.keys(t) as (keyof typeof t)[]) {
      // 되살리기 줄은 가르침 줄보다 11 뒤다 — 가르침 10(확인)만 21로 11이 아니라 11 뒤가 맞다
      expect(r[key] - t[key], key).toBe(11)
    }
  })

  it('이름표 자리는 뱅크 끝쪽이다', () => {
    expect(REMINDER_LABEL).toEqual({ category: 22, power: 23, accuracy: 24, pp: 25, cancel: 32, none: 33 })
  })
})

describe('글 쪽', () => {
  it('뱅크가 없으면 쪽이 없다', () => {
    expect(pagesOf(undefined, ['모부기'])).toEqual([])
  })

  it('\r에서 쪽을 가르고 끝의 빈 쪽은 버린다', () => {
    const raw = '{STRVAR_1 1, 0, 1} 새로\n{STRVAR_1 6, 1, 2} 배우고 싶다...\r그러나 알고 있다!\r{STRVAR_1 6, 1, 0} 대신\n잊게 하겠습니까?'
    const pages = pagesOf(raw, ['모부기', '리프스톰'])
    expect(pages).toHaveLength(3)
    expect(pages[0]).toBe('모부기는 새로\n리프스톰을 배우고 싶다...')
    expect(pages[2]).toBe('리프스톰 대신\n잊게 하겠습니까?')
  })

  it('제어 부호는 글에 남지 않는다', () => {
    const raw = '1,{PAUSE 20} 2{PAUSE 20}... 짠!{CALLBACK 3}\r끝\r'
    const pages = pagesOf(raw, [])
    expect(pages).toEqual(['1, 2... 짠!', '끝'])
  })
})

describe('칸 넣기', () => {
  const four = [1, 2, 3, 4].map((move) => ({ move, pp: 5, ppUps: 0 }))

  it('빈 칸이면 덧붙인다', () => {
    const next = placeMove(four.slice(0, 2), 2, 9, 15)
    expect(next.map((m) => m.move)).toEqual([1, 2, 9])
    expect(next[2]).toEqual({ move: 9, pp: 15, ppUps: 0 })
  })

  it('넷이 찼으면 그 칸을 갈아 끼우고 나머지는 그대로다', () => {
    const next = placeMove(four, 1, 9, 15)
    expect(next.map((m) => m.move)).toEqual([1, 9, 3, 4])
    expect(four[1]!.move).toBe(2)
    expect(next).toHaveLength(MOVES_MAX)
  })
})

describe('목록 창', () => {
  it('창 안에서는 안 움직인다', () => {
    expect(windowTop(0, 6, 7, 12)).toBe(0)
  })

  it('아래로 나가면 끝에 닿게만 민다', () => {
    expect(windowTop(0, 7, 7, 12)).toBe(1)
  })

  it('위로 나가면 그 줄이 맨 위다', () => {
    expect(windowTop(3, 2, 7, 12)).toBe(2)
  })

  it('전체가 창보다 작으면 늘 0이다', () => {
    expect(windowTop(0, 3, 7, 4)).toBe(0)
  })
})
