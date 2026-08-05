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
import { MovementRunner, type Movable, type MovementStep, type MovementTable } from './movement'
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

/**
 * 대사에 끼워 넣을 이름.
 *
 * 함수로 받는 이유: 주인공 이름은 세이브가 로드된 뒤에 정해지는데, 세계는
 * 그보다 먼저 만들어진다
 */
export interface NameSource {
  player(): string
  rival(): string
  counterpart(): string
}

const UNNAMED: NameSource = {
  player: () => '',
  rival: () => '',
  counterpart: () => '',
}

/**
 * 세계가 혼자 못 하는 일. 배틀 화면·저장된 파티처럼 **엔진 바깥**에 있는 것들이다.
 *
 * 전부 선택이다 — 안 붙으면 그 명령이 조용히 아무 일도 안 하는 것이 아니라,
 * `unsupported`에 이름이 쌓여서 무엇이 빠졌는지 보인다
 */
export interface FieldServices {
  /** 트레이너전을 연다 */
  startTrainerBattle?: (trainerID: number) => void
  /** 배틀이 끝났으면 결과, 아직이면 `null` */
  battleResult?: () => 'win' | 'loss' | null
  /** 트레이너 자료 (더블 여부·대사 색인) */
  trainer?: (id: number) => { double: boolean, msg: Record<string, number> } | null
  /** `TEXT_BANK_NPC_TRAINER_MESSAGES`의 글 하나 */
  trainerMessage?: (index: number) => string
  /** 싸울 수 있는 포켓몬 수 */
  aliveMons?: () => number
}

export interface WorldInit {
  vars: VarStore
  /** 지금 스크립트가 읽는 뱅크. 없는 번호는 빈 글로 나온다 */
  messages?: readonly string[]
  options?: PrinterOptions
  /** 이번 프레임의 A/B. 대사창이 이걸로 넘어간다 */
  input?: () => PrinterInput
  names?: NameSource
  /** 이동 동작 표 (`scripts.json`의 `movements`) */
  movements?: MovementTable
  /** 번호로 움직일 것을 찾는다. NPC는 맵마다 갈리므로 함수로 받는다 */
  objects?: (localID: number) => Movable | null
  services?: FieldServices
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
  /** 예/아니오에서 지금 가리키는 칸. 원작도 "예"에서 시작한다 */
  menuCursor = MENU_YES

  readonly names: NameSource

  /**
   * 지금 말을 걸고 있는 상대 (`SCRIPT_MANAGER_TARGET_OBJECT`).
   *
   * `FacePlayer`가 이 사람을 돌려세운다
   */
  target: Movable | null = null

  /** 주인공. `FacePlayer`가 어느 쪽인지 알려면 필요하다 */
  player: Movable | null = null

  /**
   * 지금 도는 스크립트의 scriptID (`SCRIPT_MANAGER_SCRIPT_ID`).
   *
   * 트레이너전이 이걸 쓴다 — 3000번대 번호에서 1을 빼면 트레이너 번호다
   */
  scriptID = 0

  /** 바깥이 붙여 주는 것들. 안 붙으면 그 명령은 아무 일도 안 한다 */
  services: FieldServices = {}

  /**
   * 도는 중인 이동 (`SCRIPT_MANAGER_MOVEMENT_COUNT`).
   *
   * `WaitMovement`는 이게 0이 될 때까지 선다. 여럿을 동시에 걷게 하고 한 번에
   * 기다리는 스크립트가 많아서 개수로 센다
   */
  private readonly runners: MovementRunner[] = []

  private messages: readonly string[]
  private readonly options: PrinterOptions
  private readonly input: () => PrinterInput

  constructor(init: WorldInit) {
    this.vars = init.vars
    this.messages = init.messages ?? []
    this.options = init.options ?? DEFAULT_OPTIONS
    this.input = init.input ?? NO_INPUT
    this.names = init.names ?? UNNAMED
    this.movements = init.movements ?? []
    this.objects = init.objects ?? (() => null)
    this.services = init.services ?? {}
  }

  readonly movements: MovementTable
  readonly objects: (localID: number) => Movable | null

  /** `ApplyMovement` — 그 번호의 대상에게 목록을 건다 */
  applyMovement(localID: number, steps: readonly MovementStep[]): boolean {
    const target = this.objects(localID)
    if (target === null) return false
    this.runners.push(new MovementRunner(target, steps, this.movements))
    return true
  }

  /** 아직 걷고 있는 것이 있는가 */
  get moving(): boolean {
    return this.runners.length > 0
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

  /** 트레이너 대사처럼 뱅크가 아니라 다른 데서 온 글을 올린다 */
  showText(text: string): void {
    this.boxOpen = true
    this.printer = new MessagePrinter(text, this.slots, this.options)
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
    this.menuCursor = MENU_YES
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

  /** 한 프레임. 인쇄기와 걷는 것들을 돌린다 */
  tick(): void {
    this.printer?.tick(this.input())
    for (let i = this.runners.length - 1; i >= 0; i--) {
      const runner = this.runners[i]!
      runner.tick()
      if (runner.done) this.runners.splice(i, 1)
    }
  }

  /** 스크립트 한 판이 끝났다. 걷다 만 것은 남기지 않는다 */
  reset(): void {
    this.runners.length = 0
    this.target = null
    this.slots.clear()
  }
}
