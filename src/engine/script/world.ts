// 스크립트가 만지는 바깥 세계 (DATA.md §2.10)
//
// VM은 명령을 읽고 뛰는 것까지만 한다. 창을 열고 글을 찍고 버튼을 받는 일은
// 여기 모아 둔다 — 원작의 `ScriptManager`가 들고 있던 것들이다:
//
//   isMsgBoxOpen · window     대사창이 떠 있는가
//   messageID                 지금 찍는 중인 글
//   strTemplate               `Buffer…` 명령이 채우는 8칸
//   ctrlUI                    예/아니오 같은 메뉴
//
// 한 프레임의 흐름은 이렇다. `ctx.step()`이 명령을 돌리다 `Message`에서 멈추고,
// `world.tick()`이 글자를 한 자 찍고, 다음 프레임에 다시 `step()`이 "다 찍었나"를
// 묻는다. 그래서 이 객체는 **프레임마다 정확히 한 번** tick 되어야 한다.
import {
  DEFAULT_OPTIONS, MessagePrinter, type PrinterInput, type PrinterOptions,
} from './printer'
import { MessageSlots } from './text'
import type { VarStore } from './vars'

/** `constants/menu.h` */
export const MENU_YES = 0
export const MENU_NO = 1
export const MENU_NOTHING_CHOSEN = -1

/** 지금 답을 기다리는 메뉴 */
export interface PendingMenu {
  kind: 'yesno'
  /** 고른 값이 들어갈 변수 번호 */
  dest: number
}

export interface WorldInit {
  vars: VarStore
  /** 지금 스크립트가 읽는 뱅크. 없는 번호는 빈 글로 나온다 */
  messages?: readonly string[]
  options?: PrinterOptions
  /** 이번 프레임의 A/B. 대사창이 이걸로 넘어간다 */
  input?: () => PrinterInput
}

const NO_INPUT = (): PrinterInput => ({ pressed: false, held: false })

export class FieldWorld {
  readonly vars: VarStore
  readonly slots = new MessageSlots()

  /** 창이 떠 있는가 (`isMsgBoxOpen`). 닫는 명령까지 계속 떠 있는다 */
  boxOpen = false
  /** 지금 찍는 글. 다 찍어도 창을 닫기 전까지 남아 있다 */
  printer: MessagePrinter | null = null
  /**
   * 마지막으로 올린 글의 번호 (`SCRIPT_MANAGER_MESSAGE_ID`).
   *
   * 창을 닫아도 안 지운다 — 원작도 이 칸은 스크립트가 끝날 때까지 남는다.
   * 화면은 이 값이 바뀌는 것으로 "새 글이 시작됐다"를 안다
   */
  lastMessage: number | null = null
  menu: PendingMenu | null = null

  private messages: readonly string[]
  private readonly options: PrinterOptions
  private readonly input: () => PrinterInput

  constructor(init: WorldInit) {
    this.vars = init.vars
    this.messages = init.messages ?? []
    this.options = init.options ?? DEFAULT_OPTIONS
    this.input = init.input ?? NO_INPUT
  }

  /** 맵이 바뀌면 읽을 뱅크도 바뀐다 */
  setMessages(messages: readonly string[]): void {
    this.messages = messages
  }

  /**
   * 글 하나를 창에 올린다 (`ScriptMessage_Show`).
   *
   * 창이 닫혀 있으면 **먼저 연다** — `OpenMessage` 없이 `Message`만 쓰는
   * 스크립트가 훨씬 많다
   */
  showMessage(id: number, canSkip = true): void {
    this.boxOpen = true
    this.lastMessage = id
    this.printer = new MessagePrinter(this.messages[id] ?? '', this.slots, {
      ...this.options, canSkip,
    })
  }

  /** `MessageInstant` — 한 프레임에 다 찍는다 */
  showInstant(id: number): void {
    this.showMessage(id)
    this.printer?.finish()
  }

  /** `ScriptContext_WaitForFinishedPrinting` */
  get printed(): boolean {
    return this.printer === null || this.printer.finished
  }

  openBox(): void {
    this.boxOpen = true
  }

  /** @param erase 창 안의 글까지 지우는가 (`CloseMessageWithoutErasing`은 안 지운다) */
  closeBox(erase: boolean): void {
    this.boxOpen = false
    if (erase) this.printer = null
  }

  openYesNo(dest: number): void {
    this.menu = { kind: 'yesno', dest }
  }

  /** 메뉴에 답한다. 화면이 부르기도 하고 시험이 부르기도 한다 */
  choose(value: number): void {
    if (this.menu === null || value === MENU_NOTHING_CHOSEN) return
    this.vars.set(this.menu.dest, value)
    this.menu = null
  }

  /** 이번 프레임에 A나 B가 눌렸는가 */
  get pressed(): boolean {
    return this.input().pressed
  }

  /** 한 프레임. 인쇄기를 돌린다 */
  tick(): void {
    this.printer?.tick(this.input())
  }
}
