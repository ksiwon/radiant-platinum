// 대사창 인쇄기 (DATA.md §2.11).
//
// **글자를 한 자씩 찍지 않는다.** 한 쪽을 통째로 올리고 거기서 버튼을
// 기다린다. 그래서 상태가 둘뿐이다 — *올렸다* 와 *기다린다*.
//
//   \r  쪽 넘김 — 버튼을 기다렸다가 **창을 비우고** 첫 줄로
//   \f  쪽 넘김 — 버튼을 기다렸다가 **한 줄 올리고** 이어서
//   끝  버튼을 기다렸다가 창을 닫는다
//
// 창은 두 줄이다(`Window_Add(…, 27, 4, …)` — 27×4타일, 글꼴 높이로 두 줄).
// 그래서 \r과 \f가 다르다. \r은 두 줄을 다 지우고, \f는 아랫줄을 윗줄로 올린다.
//
// ⚠️ **버튼 없이 넘어가는 길이 하나도 없어야 한다.** 원작에는 글자 사이 대기를
// 줄이는 길(`speedUp`)과 스스로 넘어가는 길(`autoScroll`)이 있었는데, 둘 다
// 「누르지 않았는데 다음이 진행된다」로 새는 자리였다 — 한 번 누른 것이 여러
// 쪽을 밀어 버려 대사가 속사포로 지나갔다. **그래서 두 길을 다 없앴다.**
// 넘어가는 자리는 `tick()`의 `input.pressed` 하나뿐이다.
//
// ⚠️ **끝에서 기다리는 것이 이 파일의 핵심이다.** 예전에는 마지막 글자를 찍는
// 순간 `finished`가 참이 되어서, 스크립트가 곧바로 다음 명령으로 갔다. 원작은
// 글 끝에 `\r`이 붙어 있어 거기서 멎었는데 그 부호가 없는 글도 많아
// (`res/text/…json`에서 실측) 그런 글은 창이 뜨자마자 사라졌다.
import { fillSlots, parseMessage, type MessageSlots, type MessageToken } from './text'

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

/** 한 프레임의 입력. `pressed`는 **이번 프레임에 새로 눌린 것**이다 */
export interface PrinterInput {
  pressed: boolean
  held: boolean
}

const NO_INPUT: PrinterInput = { pressed: false, held: false }

/**
 * 무엇을 기다리는가.
 *
 * `end`가 글 전체의 끝이다. 셋 다 **버튼 하나**로 풀린다
 */
type Waiting = 'clear' | 'scroll' | 'end' | null

export class MessagePrinter {
  /** 지금 창에 보이는 것 */
  readonly lines: Line[] = [emptyLine()]

  /** 무엇을 기다리는 중인가. 화면에 화살표를 띄우는 신호이기도 하다 */
  waiting: Waiting = null
  private done = false

  private readonly tokens: MessageToken[]
  private index = 0

  private color = 0
  private size = 100

  constructor(raw: string, slots: MessageSlots) {
    this.tokens = fillSlots(parseMessage(raw), slots)
    // 만들자마자 첫 쪽이 올라간다 — 창이 뜨는 프레임에 이미 다 보여야 한다
    this.fill()
  }

  /** 글을 다 보여 주고 **버튼까지 받았나.** `Message`가 이걸 기다린다 */
  get finished(): boolean {
    return this.done
  }

  /** 한 프레임 진행한다. 하는 일은 **누름을 받는 것**뿐이다 */
  tick(input: PrinterInput = NO_INPUT): void {
    if (this.done || this.waiting === null) return
    if (!input.pressed) return
    if (this.waiting === 'end') {
      this.waiting = null
      this.done = true
      return
    }
    if (this.waiting === 'clear') this.clearBox()
    else this.scrollBox()
    this.waiting = null
    this.fill()
  }

  /**
   * 기다리지 않고 끝까지 간다. `MessageInstant`와 시험이 쓴다.
   *
   * ⚠️ **사람이 누르는 자리에는 쓰지 않는다** — 이걸 대사에 쓰면 그 창은
   * 버튼을 안 받고 지나간다
   */
  finish(): void {
    let guard = 0
    while (!this.done) {
      if (guard++ > this.tokens.length + 8) {
        throw new Error('인쇄가 안 끝난다 — 제어 부호가 제자리를 돈다')
      }
      if (this.waiting === 'end') { this.waiting = null; this.done = true; break }
      if (this.waiting === 'clear') this.clearBox()
      else if (this.waiting === 'scroll') this.scrollBox()
      this.waiting = null
      this.fill()
    }
  }

  /**
   * 다음 멈춤까지 통째로 올린다.
   *
   * 멈춤은 쪽 넘김이거나 글의 끝이다. ⚠️ **끝에서 창이 비어 있으면 안 기다린다** —
   * 글이 `\r`로 끝나는 자리(원작에 흔하다)에서 그 부호가 이미 한 번 버튼을
   * 받았기 때문이다. 그걸 안 가르면 빈 창이 한 번 더 뜨고 또 눌러야 한다
   */
  private fill(): void {
    while (this.waiting === null && !this.done) {
      const token = this.tokens[this.index]
      if (token === undefined) {
        if (this.pageEmpty()) this.done = true
        else this.waiting = 'end'
        return
      }
      this.index++
      this.consume(token)
    }
  }

  private consume(token: MessageToken): void {
    switch (token.kind) {
      case 'text':
        for (const ch of token.text) this.append(ch)
        return
      case 'break':
        if (token.how === 'line') this.lines.push(emptyLine())
        else this.waiting = token.how
        return
      case 'color':
        this.color = token.color
        return
      case 'size':
        this.size = token.percent
        return
      case 'cursorX':
        this.lines[this.lines.length - 1]!.indent = token.x
        return
      // 글을 안 바꾸고 자리만 지나가는 것들.
      //
      // `{PAUSE n}`은 글자를 한 자씩 찍던 때의 뜸이라 쪽을 통째로 올리는 지금은
      // 뜻이 없다 — 쉬는 동안 이미 다 보이기 때문이다. 화면 표시자와 콜백은
      // 원래부터 글을 안 바꾼다
      case 'pause':
      case 'callback':
      case 'screen':
      case 'arg':
        return
    }
  }

  /** 창에 보이는 글자가 하나도 없는가 */
  private pageEmpty(): boolean {
    return this.lines.every((l) => l.runs.every((r) => r.text === ''))
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

/** 창에 보이는 글. 시험과 접근성 문자열에 쓴다 */
export function printedText(printer: MessagePrinter): string {
  return printer.lines.map((l) => l.runs.map((r) => r.text).join('')).join('\n')
}
