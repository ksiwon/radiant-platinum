// 대사창 인쇄기 (DATA.md §2.11) — `src/render_text.c`의 상태기계를 옮긴 것.
//
// 글자를 한 번에 다 뿌리지 않는다. 프레임마다 하나씩 나오고, 제어 부호를 만나면
// 거기서 무언가 한다. 원작의 상태 넷이 그대로 필요하다:
//
//   HANDLE_CHAR   글자 하나 찍고 `delay`만큼 쉰다
//   CLEAR         \r — 버튼을 기다렸다가 **창을 비우고** 첫 줄로
//   START_SCROLL  \f — 버튼을 기다렸다가 **한 줄 올리고** 이어서
//   PAUSE         {PAUSE n} — n 프레임 그냥 쉰다
//
// 창은 두 줄이다(`Window_Add(…, 27, 4, …)` — 27×4타일, 글꼴 높이로 두 줄).
// 그래서 \r과 \f가 다르다. \r은 두 줄을 다 지우고, \f는 아랫줄을 윗줄로 올린다.
import { fillSlots, parseMessage, type MessageSlots, type MessageToken } from './text'

/** 글자 하나에 걸리는 프레임 (`include/text.h`). 설정의 문자속도가 이걸 고른다 */
export const TEXT_SPEED = { instant: 0, fast: 1, quick: 2, normal: 4, slow: 8 } as const

/** 자동 넘김이 켜졌을 때 버튼 대신 기다리는 프레임 (`TextPrinter_WaitAutoMode`) */
const AUTO_SCROLL_FRAMES = 100

/** 창에 보이는 줄 수. 넘치는 줄은 원작에서도 창 밖으로 나간다 */
export const BOX_LINES = 2

export interface Run {
  text: string
  /** `{COLOR n}`. 0이 본문 색이다 */
  color: number
  /** `{SIZE n}`의 백분율. 200이면 두 배로 찍힌다 */
  size: number
}

export interface Line {
  runs: Run[]
  /** `{CURSOR_X n}` — 줄 머리를 픽셀 단위로 민다. 가운데 맞춤에 쓰인다 */
  indent: number
}

export interface PrinterOptions {
  /** 글자당 프레임. `TEXT_SPEED` 참조 */
  speed: number
  /** A/B로 인쇄를 빨리 감을 수 있나 (`canSkipDelay`) */
  canSkip: boolean
  /** 버튼 없이 스스로 넘어간다 (`autoScroll`) */
  autoScroll: boolean
}

export const DEFAULT_OPTIONS: PrinterOptions = {
  speed: TEXT_SPEED.normal,
  canSkip: true,
  autoScroll: false,
}

/** 한 프레임의 입력. `pressed`는 이번 프레임에 새로 눌린 것이다 */
export interface PrinterInput {
  pressed: boolean
  held: boolean
}

const NO_INPUT: PrinterInput = { pressed: false, held: false }

type Waiting = 'clear' | 'scroll' | null

export class MessagePrinter {
  /** 지금 창에 보이는 것 */
  readonly lines: Line[] = [emptyLine()]

  /** 다음 줄 바꿈을 기다리는 중인가. 화면에 화살표를 띄우는 신호이기도 하다 */
  waiting: Waiting = null
  private done = false

  private readonly tokens: MessageToken[]
  private index = 0
  /** 지금 글자 토큰에서 몇 자까지 찍었나 */
  private offset = 0

  private delay = 0
  private pauseFrames = 0
  private autoFrames = 0
  /** A/B를 한 번 누르면 그 글이 끝날 때까지 빨라진다 (`substruct->speedUp`) */
  private speedUp = false

  private color = 0
  private size = 100

  constructor(raw: string, slots: MessageSlots, readonly options: PrinterOptions = DEFAULT_OPTIONS) {
    this.tokens = fillSlots(parseMessage(raw), slots)
  }

  /** 글을 끝까지 찍었나. `Message`가 이걸 기다린다 */
  get finished(): boolean {
    return this.done
  }

  /** 한 프레임 진행한다 */
  tick(input: PrinterInput = NO_INPUT): void {
    if (this.done) return

    if (this.waiting !== null) {
      if (!this.release(input)) return
      if (this.waiting === 'clear') this.clearBox()
      else this.scrollBox()
      this.waiting = null
      return
    }

    if (this.pauseFrames > 0) {
      this.pauseFrames--
      return
    }

    // A/B를 누르고 있으면 쉬지 않는다 — 원작은 여기서 `delayCounter`를 0으로 만든다
    if (input.held && this.speedUp) this.delay = 0

    if (this.delay > 0 && this.options.speed > 0) {
      this.delay--
      if (this.options.canSkip && input.pressed) {
        this.speedUp = true
        this.delay = 0
      }
      return
    }
    this.delay = this.options.speed

    // 글자를 안 내는 부호는 프레임을 안 쓴다 (원작의 `RENDER_REPEAT`)
    while (this.consume() === 'repeat') { /* 다음 부호까지 이어서 */ }
  }

  /** 남은 것을 전부 찍는다. `MessageInstant`와 시험이 쓴다 */
  finish(): void {
    let guard = 0
    while (!this.done) {
      if (guard++ > this.tokens.length + totalChars(this.tokens) + 8) {
        throw new Error('인쇄가 안 끝난다 — 제어 부호가 제자리를 돈다')
      }
      if (this.waiting !== null) {
        if (this.waiting === 'clear') this.clearBox()
        else this.scrollBox()
        this.waiting = null
        continue
      }
      this.pauseFrames = 0
      this.consume()
    }
  }

  /** 기다림을 풀어도 되는가 */
  private release(input: PrinterInput): boolean {
    if (!this.options.autoScroll) return input.pressed
    if (this.autoFrames >= AUTO_SCROLL_FRAMES) {
      this.autoFrames = 0
      return true
    }
    this.autoFrames++
    return false
  }

  /**
   * 다음 한 조각.
   *
   * @returns 프레임을 써 버렸으면 `spent`, 글자를 안 냈으면 `repeat`
   */
  private consume(): 'spent' | 'repeat' {
    const token = this.tokens[this.index]
    if (token === undefined) {
      this.done = true
      return 'spent'
    }
    switch (token.kind) {
      case 'text': {
        const ch = [...token.text][this.offset]
        if (ch === undefined) {
          this.index++
          this.offset = 0
          return 'repeat'
        }
        this.offset++
        this.append(ch)
        return 'spent'
      }
      case 'break':
        this.index++
        if (token.how === 'line') {
          this.lines.push(emptyLine())
          return 'repeat'
        }
        this.waiting = token.how
        return 'spent'
      case 'pause':
        this.index++
        this.pauseFrames = token.frames
        return 'spent'
      case 'color':
        this.index++
        this.color = token.color
        return 'repeat'
      case 'size':
        this.index++
        this.size = token.percent
        return 'repeat'
      case 'cursorX':
        this.index++
        this.lines[this.lines.length - 1]!.indent = token.x
        return 'repeat'
      // 화면 표시자와 콜백은 글을 안 바꾼다. 자리만 지나간다
      case 'callback':
      case 'screen':
      case 'arg':
        this.index++
        return 'repeat'
    }
  }

  private append(ch: string): void {
    const line = this.lines[this.lines.length - 1]!
    const last = line.runs[line.runs.length - 1]
    if (last !== undefined && last.color === this.color && last.size === this.size) last.text += ch
    else line.runs.push({ text: ch, color: this.color, size: this.size })
  }

  private clearBox(): void {
    this.lines.length = 0
    this.lines.push(emptyLine())
  }

  /**
   * 한 줄 올린다.
   *
   * 창이 두 줄이라 **마지막 줄만 남고** 그 아래에서 이어 찍는다. 이게 \r과
   * 다른 점이다 — 앞말이 한 줄 남아 있어서 문장이 이어지는 느낌이 난다
   */
  private scrollBox(): void {
    const last = this.lines[this.lines.length - 1] ?? emptyLine()
    this.lines.length = 0
    this.lines.push(last, emptyLine())
  }
}

function emptyLine(): Line {
  return { runs: [], indent: 0 }
}

function totalChars(tokens: readonly MessageToken[]): number {
  return tokens.reduce((n, t) => n + (t.kind === 'text' ? [...t.text].length : 0), 0)
}

/** 창에 보이는 글. 시험과 접근성 문자열에 쓴다 */
export function printedText(printer: MessagePrinter): string {
  return printer.lines.map((l) => l.runs.map((r) => r.text).join('')).join('\n')
}
