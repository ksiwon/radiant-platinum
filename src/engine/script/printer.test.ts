// 대사창 인쇄기 검증 (DATA.md §2.11)
//
// 이 파일이 못 박는 것은 하나다 — **버튼 없이는 아무것도 안 넘어간다.**
// 화면으로는 절대 안 보이는 성질이라 여기서만 잡힌다: 대사가 「속사포로
// 지나갔다」고 할 때 밖에서 보이는 것은 결과뿐이고, 원인은 늘 「어딘가가
// 누름을 안 기다렸다」다.
//
// 나머지 하나는 **\r과 \f의 차이** — 둘 다 "버튼 누르면 넘어간다"라서 섞어
// 써도 굴러가지만, \f는 앞줄이 한 줄 남아야 문장이 이어진다.
import { describe, expect, it } from 'vitest'
import { MessagePrinter, printedText } from './printer'
import { MessageSlots } from './text'

const EMPTY = new MessageSlots()

const make = (raw: string): MessagePrinter => new MessagePrinter(raw, EMPTY)

/** 아무 입력 없이 n 프레임 */
const idle = (p: MessagePrinter, n: number): void => {
  for (let i = 0; i < n; i++) p.tick()
}

const press = (p: MessagePrinter): void => { p.tick({ pressed: true, held: true }) }

describe('쪽을 통째로 올린다', () => {
  it('만들어진 그 자리에서 글이 다 보인다', () => {
    // 글자를 한 자씩 찍지 않는다 — 창이 뜨는 프레임에 이미 다 있다
    const p = make('가나다')
    expect(printedText(p)).toBe('가나다')
  })

  it('\\n은 줄만 바꾸고 같은 쪽에 남는다', () => {
    const p = make('첫 줄\n둘째 줄')
    expect(printedText(p)).toBe('첫 줄\n둘째 줄')
  })

  it('쪽 넘김 앞까지만 올라온다', () => {
    const p = make('첫 쪽\r둘째 쪽')
    expect(printedText(p)).toBe('첫 쪽')
  })
})

describe('⚠️ 버튼 없이는 아무것도 안 넘어간다', () => {
  it('글 끝에서 기다린다 — 눌러야 끝난다', () => {
    // 예전에는 마지막 글자를 찍는 순간 끝났다. 원작 글 중에 끝에 `\r`이 없는
    // 것이 많아서(`res/text/…json` 실측) 그런 창은 뜨자마자 사라졌다
    const p = make('가나다')
    idle(p, 600)
    expect(p.finished).toBe(false)
    press(p)
    expect(p.finished).toBe(true)
  })

  it('아무리 오래 둬도 스스로 안 간다', () => {
    const p = make('첫 쪽\r둘째 쪽')
    idle(p, 10_000)
    expect(printedText(p)).toBe('첫 쪽')
    expect(p.finished).toBe(false)
  })

  it('한 번 누르면 한 자리만 간다', () => {
    // 이것이 「속사포」의 뿌리였다 — 누르고 있으면 여러 쪽이 한꺼번에 밀렸다
    const p = make('하나\r둘\r셋')
    press(p)
    expect(printedText(p)).toBe('둘')
    press(p)
    expect(printedText(p)).toBe('셋')
    expect(p.finished).toBe(false)
    press(p)
    expect(p.finished).toBe(true)
  })

  it('누르고 있는 것으로는 안 간다 — 새로 눌려야 한다', () => {
    const p = make('하나\r둘')
    // `pressed`는 **이번 프레임에 새로 눌린 것**이다. 손을 대고 있는 동안은 거짓
    for (let i = 0; i < 300; i++) p.tick({ pressed: false, held: true })
    expect(printedText(p)).toBe('하나')
  })
})

describe('줄 바꿈', () => {
  it('\\r은 버튼을 기다렸다가 창을 비운다', () => {
    const p = make('첫 쪽\r둘째 쪽')
    press(p)
    // 두 줄이 다 지워지고 첫 줄부터다
    expect(printedText(p)).toBe('둘째 쪽')
  })

  it('\\f는 마지막 줄을 남기고 이어 찍는다', () => {
    const p = make('윗줄\n아랫줄\f이어서')
    expect(printedText(p)).toBe('윗줄\n아랫줄')
    press(p)
    // 아랫줄이 위로 올라오고 그 아래에서 이어진다
    expect(printedText(p)).toBe('아랫줄\n이어서')
  })

  it('⚠️ 글이 쪽 넘김으로 끝나면 빈 창을 한 번 더 안 띄운다', () => {
    // `\r`이 이미 버튼을 한 번 받았다. 거기서 또 기다리면 사람은 빈 창을 보고
    // 한 번 더 눌러야 한다 — 원작 글 상당수가 `\r`로 끝난다
    const p = make('할 말\r')
    expect(printedText(p)).toBe('할 말')
    expect(p.finished).toBe(false)
    press(p)
    expect(p.finished).toBe(true)
  })

  it('빈 글은 안 기다린다', () => {
    // 뱅크에 없는 번호는 빈 글로 온다. 거기서 멈추면 게임이 선다
    const p = make('')
    expect(p.finished).toBe(true)
  })
})

describe('제어 부호', () => {
  it('{PAUSE n}은 이제 아무것도 안 한다', () => {
    // 글자를 한 자씩 찍던 때의 뜸이다. 쪽을 통째로 올리면 쉬는 동안 이미 다 보인다
    const p = make('앞{PAUSE 60}뒤')
    expect(printedText(p)).toBe('앞뒤')
  })

  it('{COLOR}가 구간을 가른다', () => {
    const p = make('보통{COLOR 2}빨강')
    const runs = p.lines[0]!.runs
    expect(runs.map((r) => r.text)).toEqual(['보통', '빨강'])
    expect(runs.map((r) => r.color)).toEqual([0, 2])
  })

  it('{SIZE}와 {CURSOR_X}가 남는다', () => {
    const p = make('{CURSOR_X 24}{SIZE 200}큼')
    expect(p.lines[0]!.indent).toBe(24)
    expect(p.lines[0]!.runs[0]!.size).toBe(200)
  })
})

describe('끝', () => {
  it('finish()는 기다림까지 건너뛴다', () => {
    // 배틀 글과 `MessageInstant`가 쓴다. 사람이 누르는 자리에는 안 쓴다
    const p = make('하나\r둘\f셋')
    p.finish()
    expect(p.finished).toBe(true)
    expect(printedText(p)).toContain('셋')
  })
})
