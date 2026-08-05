// 대사창 인쇄기 검증 (DATA.md §2.11)
//
// 눈으로 못 보는 것 둘을 잡는다. 하나는 **프레임 수** — 글자당 몇 프레임인지가
// 틀리면 대사가 미묘하게 빠르거나 느린데 스크린샷으로는 안 보인다. 다른 하나는
// **\r과 \f의 차이** — 둘 다 "버튼 누르면 넘어간다"라서 섞어 써도 굴러가지만,
// \f는 앞줄이 한 줄 남아야 문장이 이어진다.
import { describe, expect, it } from 'vitest'
import { MessagePrinter, printedText, TEXT_SPEED, type PrinterOptions } from './printer'
import { MessageSlots } from './text'

const EMPTY = new MessageSlots()

const make = (raw: string, options?: Partial<PrinterOptions>): MessagePrinter =>
  new MessagePrinter(raw, EMPTY, {
    speed: TEXT_SPEED.normal, canSkip: true, autoScroll: false, ...options,
  })

/** 아무 입력 없이 n 프레임 */
const idle = (p: MessagePrinter, n: number): void => {
  for (let i = 0; i < n; i++) p.tick()
}

const press = (p: MessagePrinter): void => { p.tick({ pressed: true, held: true }) }

describe('인쇄 속도', () => {
  it('보통 속도는 글자 하나에 다섯 프레임이다', () => {
    // `delayCounter = textSpeedBottom`을 두고 프레임마다 하나씩 깎으므로
    // 글자 사이가 speed 프레임이다. TEXT_SPEED_NORMAL이 4니까 5프레임에 한 자
    const p = make('가나다')
    p.tick()
    expect(printedText(p)).toBe('가')
    idle(p, 4)
    expect(printedText(p)).toBe('가')
    p.tick()
    expect(printedText(p)).toBe('가나')
  })

  it('빠름은 두 프레임에 한 자다', () => {
    const p = make('가나다', { speed: TEXT_SPEED.fast })
    p.tick()
    p.tick()
    expect(printedText(p)).toBe('가')
    p.tick()
    expect(printedText(p)).toBe('가나')
  })

  it('A를 한 번 누르면 그 글이 끝날 때까지 빨라진다', () => {
    // 원작의 `substruct->speedUp` — 한 번 서면 안 내려간다
    const p = make('가나다라마')
    p.tick()
    press(p)
    for (let i = 0; i < 4; i++) p.tick({ pressed: false, held: true })
    expect(printedText(p)).toBe('가나다라마')
  })

  it('빨리 감기를 막으면 A를 눌러도 안 빨라진다', () => {
    // `MessageNoSkip`이 이걸 쓴다 — 중요한 안내를 건너뛰지 못하게 한다
    const p = make('가나다라마', { canSkip: false })
    p.tick()
    for (let i = 0; i < 4; i++) p.tick({ pressed: true, held: true })
    expect(printedText(p)).toBe('가')
  })
})

describe('줄 바꿈', () => {
  it('\\n은 프레임을 안 쓰고 줄만 바꾼다', () => {
    // 원작이 `RENDER_REPEAT`을 돌려주므로 같은 프레임에 다음 글자까지 간다
    const p = make('가\n나', { speed: TEXT_SPEED.instant })
    p.tick()
    p.tick()
    expect(printedText(p)).toBe('가\n나')
  })

  it('\\r은 버튼을 기다렸다가 창을 비운다', () => {
    const p = make('가\r나', { speed: TEXT_SPEED.instant })
    p.tick()
    p.tick()
    expect(p.waiting).toBe('clear')
    expect(printedText(p)).toBe('가')
    idle(p, 30)
    expect(p.waiting).toBe('clear') // 버튼을 안 누르면 안 넘어간다
    press(p)
    expect(printedText(p)).toBe('')
    p.tick()
    expect(printedText(p)).toBe('나')
  })

  it('\\f는 마지막 줄을 남기고 이어 찍는다', () => {
    // 창이 두 줄이라 아랫줄이 윗줄로 올라온다. \r과 갈리는 지점이다
    const p = make('가\n나\f다', { speed: TEXT_SPEED.instant })
    for (let i = 0; i < 3; i++) p.tick()
    expect(p.waiting).toBe('scroll')
    press(p)
    expect(printedText(p)).toBe('나\n')
    p.tick()
    expect(printedText(p)).toBe('나\n다')
  })

  it('자동 넘김은 버튼 없이 100프레임 뒤에 간다', () => {
    const p = make('가\r나', { speed: TEXT_SPEED.instant, autoScroll: true })
    p.tick()
    p.tick()
    expect(p.waiting).toBe('clear')
    idle(p, 99)
    expect(p.waiting).toBe('clear')
    idle(p, 2)
    expect(p.waiting).toBeNull()
  })
})

describe('제어 부호', () => {
  it('{PAUSE n}은 n 프레임 쉰다', () => {
    const p = make('가{PAUSE 10}나', { speed: TEXT_SPEED.instant })
    p.tick()
    expect(printedText(p)).toBe('가')
    p.tick() // 부호를 집는 프레임
    idle(p, 10) // 쉬는 열 프레임
    expect(printedText(p)).toBe('가')
    p.tick()
    expect(printedText(p)).toBe('가나')
  })

  it('{COLOR}가 구간을 가른다', () => {
    const p = make('가{COLOR 2}나{COLOR 0}다', { speed: TEXT_SPEED.instant })
    p.finish()
    expect(p.lines[0]!.runs).toEqual([
      { text: '가', color: 0, size: 100 },
      { text: '나', color: 2, size: 100 },
      { text: '다', color: 0, size: 100 },
    ])
  })

  it('{SIZE}와 {CURSOR_X}가 남는다', () => {
    // 떡잎마을 0번 글이 `{SIZE 200}꽈당!!{SIZE 100}`이다. 크기를 버리면
    // "꽈당!!"이 본문 크기로 나와서 연출이 죽는다
    const p = make('{CURSOR_X 70}{SIZE 200}꽈당!!{SIZE 100}', { speed: TEXT_SPEED.instant })
    p.finish()
    expect(p.lines[0]!.indent).toBe(70)
    expect(p.lines[0]!.runs.map((r) => r.size)).toEqual([200])
  })
})

describe('끝', () => {
  it('마지막 글자를 찍으면 끝난다 — 버튼을 더 안 기다린다', () => {
    // `Message`는 인쇄가 끝나면 바로 돌아온다. 마지막 장을 붙잡아 두는 것은
    // 뒤따라오는 `WaitButton`의 몫이다
    const p = make('가나', { speed: TEXT_SPEED.instant })
    p.tick()
    p.tick()
    expect(p.finished).toBe(false)
    p.tick()
    expect(p.finished).toBe(true)
  })

  it('finish()는 기다림까지 건너뛴다', () => {
    const p = make('가\r나\f다')
    p.finish()
    expect(p.finished).toBe(true)
    expect(printedText(p)).toBe('나\n다')
  })
})
