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
export const MENU_CANCEL = -2

/**
 * `list_menu.h`의 `LIST_MENU_NO_SELECTION_YET`.
 *
 * 메뉴를 열 때 결과 변수를 이 값으로 채워 두고, `ShowMenu`는 값이 바뀔 때까지
 * 선다. 0이나 −1을 쓰면 "예를 골랐다"·"아직이다"와 구분이 안 된다
 */
export const LIST_MENU_NO_SELECTION_YET = 0xeeee

/** 목록 메뉴 항목 하나 */
export interface MenuEntry {
  text: string
  /** 고르면 결과 변수에 들어갈 값. 나열 순서와 다를 수 있다 */
  value: number
  /** 커서를 올리면 아래에 따로 뜨는 설명 (`AddListMenuEntry`의 셋째 인자) */
  alt: string | null
}

/** 지금 답을 기다리는 메뉴 */
export interface PendingMenu {
  /** `yesno`는 창 안에 붙고, `list`는 따로 뜬다 */
  kind: 'yesno' | 'list'
  /** 고른 값이 들어갈 변수 번호 */
  dest: number
  entries: readonly MenuEntry[]
  /** B로 빠져나갈 수 있는가. 못 나가는 메뉴가 실제로 있다 */
  canCancel: boolean
  /** `ShowMenuMultiColumn`. 보통은 1이다 */
  columns: number
}

/**
 * 짓는 중인 메뉴 (`FieldMenuManager`).
 *
 * `Init…`이 만들고 `Add…`가 채우고 `Show…`가 띄운다. 세 명령이 나뉘어 있어서
 * 중간 상태를 어딘가 들고 있어야 한다
 */
interface MenuBuilder {
  dest: number
  cursor: number
  canCancel: boolean
  /** 항목 글을 어디서 읽는가. 지역이면 지금 스크립트의 뱅크다 */
  scope: 'local' | 'global'
  entries: MenuEntry[]
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
  /** 가방. 주머니 번호는 아이템 자료가 정하므로 여기서 물어본다 */
  bag?: {
    pocketOf: (item: number) => number
    add: (item: number, count: number) => boolean
    remove: (item: number, count: number) => boolean
    canFit: (item: number, count: number) => boolean
    quantity: (item: number) => number
    pocketHasItems: (pocket: number) => boolean
    name: (item: number) => string
  }
  money?: {
    get: () => number
    add: (amount: number) => void
    spend: (amount: number) => boolean
  }
  /** 시작 메뉴를 연다 (`ShowStartMenu`) */
  openStartMenu?: () => void
  /** 메뉴가 아직 떠 있는가 */
  menuOpen?: () => boolean
  /**
   * 상점을 연다 (`Shop_Start`). `items`는 파는 물건의 아이템 번호다.
   *
   * 재고를 스크립트가 안 준다 — 명령이 뱃지 수나 상점 번호만 주고 실제 목록은
   * 코드에 박혀 있다 (`include/data/mart_items.h`). 그 표를 푸는 것은 붙이는
   * 쪽 일이다
   */
  openShop?: (items: readonly number[]) => void
  /**
   * 보관 시스템을 연다 (`ScrCmd_OpenPokemonStorage`).
   *
   * 갈래는 원작의 인자 그대로다 — 0 맡긴다 · 1 꺼낸다 · 2 옮긴다 · 3 도구 옮긴다
   * · 4 비교한다. 어느 갈래로 들어왔는지가 화면의 첫 손짓을 정한다
   */
  openStorage?: (mode: number) => void
  /** 박스에 남은 자리 수 (`GetPCBoxesFreeSlotCount`) */
  boxFreeSlots?: () => number
  /** 파티에서 싸울 수 있는 수 + 박스에 든 수 (`CountAliveMonsAndBoxMons`) */
  aliveAndBoxMons?: () => number
  /** 상점 재고표 (`include/data/mart_items.h`). 일반 상점은 뱃지 수로 늘어난다 */
  martStock?: {
    common: () => number[]
    specialties: (martID: number) => number[]
  }
  /**
   * 비전머신 자격 (`FieldMoves_Check*`).
   *
   * 원작이 보는 것이 정확히 둘이다 — `PlayerHasRequiredBadge`와
   * `Party_HasMonWithMove`. 둘 다 세이브에 있어서 여기로 받는다
   */
  fieldMoves?: {
    /** 뱃지 비트마스크 */
    badges: () => number
    /** 이 기술을 아는 파티원이 있는가 */
    knows: (move: number) => boolean
  }
  /** 파티 전원 회복 (`ScrCmd_HealParty`). 종족값 표가 필요해서 바깥 일이다 */
  healParty?: () => void
  /** 부활 지점을 옮긴다 (`ScrCmd_SetBlackOutWarpId`). `spawns.json`의 번호다 */
  setHealSpot?: (index: number) => void
  /** 전멸 — 회복하고 부활 지점으로 옮긴다 (`ScrCmd_BlackOutFromBattle`) */
  blackOut?: () => void
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
  /** 구역 스크립트가 얹은 뱅크. null이면 맵 뱅크다 */
  private override: readonly string[] | null = null
  /**
   * 인쇄기 기본값. **글자 속도는 여기 안 굳는다** — 설정에서 바꾼 값이 다음
   * 대사부터 바로 먹어야 하므로 창을 열 때마다 `speed()`에 물어본다
   */
  private readonly options: PrinterOptions
  /** 지금 설정의 글자당 프레임. 설정 화면이 이걸 갈아 끼운다 */
  speed: () => number = () => this.options.speed
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
   * 잠깐 다른 뱅크를 읽는다 (`ScriptContext_Load`).
   *
   * ⚠️ **구역 스크립트는 글 뱅크가 맵과 다르다.** 간판은 2500번대라
   * `bg_events`를, 공용 스크립트는 그 구역 뱅크를 읽는다 — 맵 뱅크로 읽으면
   * 같은 번호의 **엉뚱한 문장**이 나온다. 글자는 나오므로 눈으로는 넘어간다.
   *
   * 맵 뱅크를 덮어쓰지 않고 위에 얹는다. `null`이면 맵 뱅크로 돌아간다
   */
  useBank(messages: readonly string[] | null): void {
    this.override = messages
  }

  /** 지금 읽는 글. 구역 뱅크가 얹혀 있으면 그쪽이다 */
  private get bank(): readonly string[] {
    return this.override ?? this.messages
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
    this.printer = new MessagePrinter(this.bank[id] ?? '', this.slots, {
      ...this.options, speed: this.speed(), canSkip,
    })
  }

  /** 트레이너 대사처럼 뱅크가 아니라 다른 데서 온 글을 올린다 */
  showText(text: string): void {
    this.boxOpen = true
    this.printer = new MessagePrinter(text, this.slots, { ...this.options, speed: this.speed() })
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
    this.menu = {
      kind: 'yesno',
      dest,
      entries: [{ text: '예', value: MENU_YES, alt: null }, { text: '아니오', value: MENU_NO, alt: null }],
      canCancel: true,
      columns: 1,
    }
    this.menuCursor = MENU_YES
  }

  // ── 목록 메뉴 ──────────────────────────────────────────────────────────────

  /** 짓는 중인 메뉴. `Init…`과 `Show…` 사이에만 있다 */
  private builder: MenuBuilder | null = null

  /** 전역 메뉴가 읽는 뱅크 (`TEXT_BANK_MENU_ENTRIES`). 없으면 빈 글이 나온다 */
  menuEntryTexts: readonly string[] = []

  /** `InitLocalTextMenu` · `InitGlobalTextMenu` 계열 */
  initMenu(dest: number, cursor: number, canCancel: boolean, scope: 'local' | 'global'): void {
    // 아직 안 골랐다는 표시를 먼저 박는다. `ShowMenu`가 이 값으로 기다린다
    this.vars.set(dest, LIST_MENU_NO_SELECTION_YET)
    this.builder = { dest, cursor, canCancel, scope, entries: [] }
  }

  /** `AddMenuEntry` · `AddListMenuEntry`. `alt`는 목록 메뉴에만 있다 */
  addMenuEntry(stringID: number, value: number, altID: number | null = null): void {
    if (this.builder === null) return
    const bank = this.builder.scope === 'global' ? this.menuEntryTexts : this.bank
    this.builder.entries.push({
      text: bank[stringID] ?? '',
      value,
      alt: altID === null ? null : bank[altID] ?? null,
    })
  }

  /** `ShowMenu` · `ShowListMenu` 계열. 여기서부터 답을 기다린다 */
  showMenu(kind: 'list', columns = 1): void {
    if (this.builder === null) return
    const { dest, cursor, canCancel, entries } = this.builder
    this.builder = null
    this.menu = { kind, dest, entries, canCancel, columns }
    this.menuCursor = Math.min(cursor, Math.max(0, entries.length - 1))
  }

  /** 지금 메뉴가 정말 떠 있는가. 항목이 하나도 없으면 띄울 것이 없다 */
  get menuOpen(): boolean {
    return this.menu !== null && this.menu.entries.length > 0
  }

  /** 메뉴에 답한다. 화면이 부르기도 하고 시험이 부르기도 한다 */
  choose(value: number): void {
    if (this.menu === null || value === MENU_NOTHING_CHOSEN) return
    if (value === MENU_CANCEL && !this.menu.canCancel) return
    this.vars.set(this.menu.dest, value)
    this.menu = null
  }

  /** 커서 자리의 항목을 고른다 */
  chooseAtCursor(): void {
    const entry = this.menu?.entries[this.menuCursor]
    this.choose(entry === undefined ? MENU_NOTHING_CHOSEN : entry.value)
  }

  /** 커서를 움직인다. 끝에서 돌지 않는다 — 원작도 안 돈다 */
  moveCursor(delta: number): void {
    if (this.menu === null) return
    const last = this.menu.entries.length - 1
    this.menuCursor = Math.max(0, Math.min(last, this.menuCursor + delta))
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
    this.menu = null
    this.builder = null
  }
}
