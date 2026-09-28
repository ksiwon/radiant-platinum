// 슬롯머신 (PARITY §7.6 · `overlay101/ov101_021D1A28.c`)
//
// 원작 상태 기계 64칸을 **같은 번호로** 옮겼다 — 판마다 무엇이 맞을지 먼저 뽑고(`ov101_021D40A8`), 릴을 멈출 때
// 그 기호를 열린 줄에 끌어오며(최대 네 칸, 확정이면 스물한 칸), 못 끌어오면 **안 맞게** 민다. 보너스는 둘이다:
//
//   「세븐을 맞춰라」(25~40) — 3코인씩 넣고 세븐을 줄에 맞출 때까지. 끌기가 네 칸뿐이라 사람이 노려야 한다
//   삐삐 보너스(41~58)       — 판마다 1코인 × 15번. 가운데 줄에 리플레이, 삐삐가 가리키는 차례로 누르면 확정이다
//
// 한 프레임의 차례: 상태 기계(맞으면 같은 프레임에 이어 돈다) → 릴 셋 → 코인 세기. 원작의 `SysTask` 우선순위
// (릴 129~131 · 코인 138)와 같다.
//
// ⚠️ **연출은 여기 없다.** 원작은 등불 · 삐삐 · 달 애니메이션이 끝나기를 상태가 기다린다(`ov101_021D47AC`) —
// 그 길이는 롬의 셀 애니메이션이 정하므로 화면 쪽(`SlotView`)이 「끝났다」를 알려 준다
import {
  BONUS_ORDERS, BONUS_PAYOUT, BONUS_TABLE, CONTINUE_CHANCE, CONTINUE_DECAY, CONTINUE_SHOW, ENTRY_SHOW, HIT_BITS,
  HIT_CHANCE, HIT_TABLE, MAX_COINS, MAX_STREAK, NOTICE_CHANCE, PAYOUT, PRE_BONUS_SMALL, PRE_BONUS_SMALL_CHANCE,
  RED_MOON_CHANCE, REEL_LENGTH, REELS, SlotSymbol, SURE_CONTINUE_CHANCE, SYMBOL_PX,
} from './slotTables'

/** DS 버튼 — 원작 판정이 버튼 이름으로 되어 있어 그대로 둔다. 화면이 자판을 이리로 옮긴다 */
export type SlotButton = 'a' | 'b' | 'x' | 'y' | 'down' | 'start'

interface SlotInput {
  /** 이번 프레임에 새로 눌린 것 */
  readonly pressed: ReadonlySet<SlotButton>
  /** A · B · X · Y 중 하나라도 누르고 있는가 — 코인이 두 배로 빨리 올라간다 */
  readonly held: boolean
}

/** 원작 연출 모드 (`ov101_021D4798`의 인자) */
export const enum SlotMode {
  IDLE = 0, NOTICE = 1, AFTER = 2, BONUS_ENTRY = 3, CONTINUE_BIG = 5, BONUS_GUIDE = 6, BONUS_IDLE = 7,
  BONUS_END = 8, PRE_BONUS = 9, PRE_BONUS_WIN = 10, WIN = 11, CONTINUE_MID = 12,
}

/** 원작 곡 (`ov101_021D1894`) */
export const enum SlotMusic { FIELD = 0, PRE_BONUS = 1, BONUS = 2 }

/** 원작 글 (`TEXT_BANK_UNK_0544`) — 0 「세 개가 없다」 · 1 「5만 개가 됐다」 · 2 「코인이 없다」 */
export type SlotMessage = 0 | 1 | 2

/** 소리 — `public/data/sound/index.json`의 `songs[]`에서 이름으로 찾은 번호 */
export const SLOT_SOUND = {
  /** `SEQ_SE_DP_ZUKAN02` — 코인 넣기 */
  bet: 1517,
  /** `SEQ_SE_DP_OPEN2` — 레버 */
  spin: 1518,
  /** `SEQ_SE_DP_UG_022` — 릴 멈춤 */
  stop: 1574,
  /** `SEQ_SE_DP_SELECT_SLOT` — 삐삐 보너스의 멈춤 */
  bonusStop: 1525,
  /** `SEQ_SE_DP_DENSI16` — 코인 하나 */
  coin: 1581,
  /** `SEQ_SE_DP_025` — 빨간 달 · 확정 */
  flash: 1520,
} as const

/** 곡 — `SEQ_SLOT_ATARI`(세븐을 맞춰라) · `SEQ_SLOT_OOATARI`(삐삐 보너스) */
export const SLOT_BGM = { preBonus: 1184, bonus: 1185 } as const

/** 화면 쪽. 상태가 기다리는 연출의 끝을 알려 주고, 소리와 글을 맡는다 */
export interface SlotView {
  mode(mode: SlotMode, info: { notice: number, show: number }): void
  /** 지금 모드의 연출이 끝났는가 (`ov101_021D47AC`) */
  modeDone(): boolean
  /** 이긴 줄 등불 — 줄 비트와 코인 수. 번쩍이기 시작했으면 참 (`ov101_021D4714` · `ov101_021D505C`) */
  flashLines(lines: number, payout: number): void
  linesReady(): boolean
  endLines(): void
  sound(seq: number): void
  cry(species: number): void
  music(which: SlotMusic): void
  message(which: SlotMessage): void
  closeMessage(): void
  /** 삐삐 보너스 판 안의 번쩍임 — 0 확정 · 1 빨간 달 (`ov101_021D53F8`) */
  bonusFlash(kind: 0 | 1): void
  /** 삐삐 보너스 판이 시작하고 끝났다 (`ov101_021D47B4` · `ov101_021D53D4`) */
  bonusShow(on: boolean): void
  /** 연속 판 수 (`ov101_021D79BC`) */
  streak(n: number): void
  /** 멈춤 단추 등불 — 켜짐 팔레트 6 · 꺼짐 5 (`ov101_021D58F4` · `_5938`) */
  button(reel: number, lit: boolean): void
  /** 줄 등불 — 원래 색 · 넣을 때(10/16) · 보너스 가운데 줄(12/16) (`_4FF8` · `_5010` · `_4FB8`) */
  lines(kind: 'base' | 'bet' | 'bonus'): void
  /** 기다리는 동안 도는 줄 등불 대본 (`_5200` 켬 · `_5244` 끔 — 끄면 원래 색으로) */
  attract(on: boolean): void
  /** 아래 화면 달밤 줄 1을 팔레트 5 쪽으로 · 되돌리기 (`_53B0` · `_53D4`) */
  subFade(on: boolean): void
  /** 세븐이 맞았다 — 그 줄의 기호가 떨어지고 깜빡인다 (`_7B08`). 끝나면 거둔다 */
  sevens(on: boolean, symbol: SlotSymbol, lines: number): void
}

/** 0 ~ 65535 (`LCRNG_Next`) */
type SlotRng = () => number

/** 원작 `SPECIES_CLEFAIRY` */
const SPECIES_CLEFAIRY = 35
const FX = 1
const REEL_SPAN = REEL_LENGTH * SYMBOL_PX

interface Reel {
  /** 0 멈춤 · 1 돈다 · 2 멈출 자리를 정한다 · 3 끌기 · 4 튕김 */
  state: number
  /** 아직 움직이는가 (`unk_04`) */
  moving: boolean
  bounce: number
  bounceCount: number
  /** 맞힐 줄 1 위 · 2 가운데 · 3 아래 (`unk_14`) */
  row: number
  /** 더 끌 칸 수 (`unk_18`) */
  slide: number
}

/** 한 번 놀고 나온 결과 — 필드가 코인과 기록에 옮긴다 */
export interface SlotOutcome {
  readonly coins: number
  /** 이 판에서 가장 길게 이은 삐삐 보너스 판 수 (`unk_20`) */
  readonly bestStreak: number
  /** 삐삐 보너스를 모두 몇 판 했나 (`unk_0C` → `RECORD_UNK_014`) */
  readonly bonusRounds: number
}

export class SlotMachine {
  /** 상태 (`unk_00`) · 글을 닫은 뒤 갈 곳 (`unk_04`) */
  state = 0
  private back = 0
  /** 삐삐 보너스 판 안인가 (`unk_08`) */
  inBonus = false
  private bonusRounds = 0
  /** 이번 판에 남은 돌림 (`unk_10`) */
  spinsLeft = 0
  /** 보너스에서 번 코인 (`unk_14`) */
  bonusCoins = 0
  /** 이어 갈 확률 (`unk_18`) */
  private continueChance = 0
  /** 이번 보너스의 연속 판 (`unk_1C`) · 가장 긴 것 (`unk_20`) */
  streak = 0
  bestStreak = 0
  /** 확정이 떴다 (`unk_24`) · 빨간 달 0 없음 1 떴다 2 리플레이 맞음 3 빗나감 (`unk_28`) · 이번 판 뒤 끝 (`unk_2C`) */
  private sure = false
  private redMoon = 0
  private endAfterRound = false
  /** 맞힐 것이 살아 있는가 (`unk_30`) */
  private hitLive = false
  /** 삐삐가 가리키는 차례 (`unk_34`) */
  bonusOrder = 0
  /** 맞은 기호 (`unk_44`) · 맞은 줄 (`unk_48`) */
  private result = SlotSymbol.NONE
  lines = 0
  /** 보너스 연출 갈래 (`unk_4C`) · 종류 (`unk_50`) */
  private variant = 0
  bonusType = 0
  /** 누른 차례 (`unk_54`) */
  private order: number[] = []
  coins: number
  /** 받을 코인 (`unk_64`) */
  payout = 0
  private timer = 0
  /** 끌기 확정 (`unk_70`) */
  private sureSlide = false
  /** 이번 판에 맞을 것 (`unk_74`) */
  flags = 0
  /** 릴마다 1 돈다 · 2 멈춤 눌림 (`unk_7C`) */
  private stopped = [0, 0, 0]
  private readonly setting: number
  private readonly speed = 16 * FX
  /** 릴 자리(픽셀, 21×32에서 돈다) (`unk_90`) · 튕김 (`unk_9C`) · 맨 위 칸 (`unk_A8`) */
  readonly pos = [0, 0, 0]
  readonly bounceY = [0, 0, 0]
  private readonly top = [0, 0, 0]
  private readonly reels: Reel[] = [0, 1, 2].map(() => ({
    state: 0, moving: false, bounce: 0, bounceCount: 0, row: 0, slide: 0,
  }))
  /** 코인 세기 (`unk_120`) */
  private pay = { state: 0, done: false, frames: 0 }
  private notice = 4
  private show = 0
  /** 끝났으면 참 */
  finished = false

  constructor(coins: number, setting: number, private readonly rng: SlotRng, private readonly view: SlotView) {
    this.coins = coins
    this.setting = setting
    // `ov101_021D1A68` — 릴 셋을 아무 자리에서
    for (let i = 0; i < 3; i++) {
      const at = this.rand() % REEL_LENGTH
      this.top[i] = at
      this.pos[i] = (REEL_SPAN - at * SYMBOL_PX) % REEL_SPAN
    }
  }

  outcome(): SlotOutcome {
    return { coins: Math.min(this.coins, MAX_COINS), bestStreak: this.bestStreak, bonusRounds: this.bonusRounds }
  }

  /** 멈춤을 누른 릴 수 — 삐삐가 이 수로 다음 릴을 가리킨다 (`ov101_021D59AC.c` 모드 6) */
  stoppedCount(): number {
    return this.stopped.filter((s) => s !== 1).length
  }

  /** 삐삐가 가리키는 누름 차례 — 0 왼쪽 · 1 가운데 · 2 오른쪽 */
  bonusOrderKeys(): readonly number[] {
    return BONUS_ORDERS[this.bonusOrder]!
  }

  /** 릴 스프라이트가 그리는 칸 (`ov101_021D55A4`) — 어긋남을 안 본다. 줄 0~4 */
  stripSymbol(reel: number, row: number): SlotSymbol {
    return REELS[reel]![(this.top[reel]! + row) % REEL_LENGTH]!
  }

  /** 릴 칸 하나 (`ov101_021D55D4`) — 줄 1 위 · 2 가운데 · 3 아래. 칸 사이에 걸쳐 있으면 한 칸 앞을 본다 */
  symbolAt(reel: number, row: number): SlotSymbol {
    const off = this.pos[reel]! % SYMBOL_PX !== 0 ? -1 : 0
    let at = (this.top[reel]! + row + off) % REEL_LENGTH
    if (at < 0) at += REEL_LENGTH
    return REELS[reel]![at]!
  }

  private rand(): number {
    return this.rng() & 0xffff
  }

  private percent(): number {
    return this.rand() % 100
  }

  /** 누적 무게에서 빼 가며 고른다 (`ov101_021D406C`) */
  private static take(weight: number, left: { v: number }): boolean {
    const before = left.v
    left.v = Math.max(0, left.v - weight)
    return before < weight
  }

  // ── 한 프레임 ──────────────────────────────────────────────────────────────

  tick(input: SlotInput): void {
    if (this.finished) return
    for (let guard = 0; guard < 64; guard++) {
      const r = this.step(input)
      if (r === 2) { this.finished = true; return }
      if (r !== 1) break
    }
    for (let i = 0; i < 3; i++) this.reelTick(i)
    this.payTick(input)
  }

  private anim(mode: SlotMode): void {
    this.view.mode(mode, { notice: this.notice, show: this.show })
  }

  private buttonsOff(): void {
    for (let i = 0; i < 3; i++) this.view.button(i, false)
  }

  private spinStart(): void {
    this.order = []
    for (let i = 0; i < 3; i++) this.startReel(i)
    this.stopped = [1, 1, 1]
    this.timer = 0
    this.view.sound(SLOT_SOUND.spin)
  }

  private startReel(i: number): void {
    const r = this.reels[i]!
    r.state = 1
    r.moving = true
  }

  /** 누른 차례를 적는다 (`ov101_021D5858`) */
  private press(reel: number): void {
    this.order.push(reel)
  }

  /** 지금까지 왼쪽 · 가운데 · 오른쪽 차례로 눌렀나 (`ov101_021D5880`) */
  private inOrder(): boolean {
    return this.order.every((reel, i) => reel === i)
  }

  /** 삐삐가 가리킨 차례로 눌렀나 (`ov101_021D58C0`) */
  private bonusInOrder(): boolean {
    const want = BONUS_ORDERS[this.bonusOrder]!
    return this.order.every((reel, i) => reel === want[i])
  }

  private handleStops(input: SlotInput, bonus: boolean): void {
    const keys: SlotButton[] = ['y', 'b', 'a']
    for (let i = 0; i < 3; i++) {
      if (this.stopped[i] === 1 && input.pressed.has(keys[i]!)) {
        this.stopped[i] = 2
        this.press(i)
        if (bonus ? !this.bonusInOrder() : !this.inOrder()) {
          this.sureSlide = false
          if (bonus) this.hitLive = false
        }
        this.view.button(i, true)
        this.reels[i]!.state = 2
        this.view.sound(bonus ? SLOT_SOUND.bonusStop : SLOT_SOUND.stop)
        // 원작은 한 프레임에 **하나만** 받는다 (`else if`)
        break
      }
    }
  }

  private allStopped(): boolean {
    return this.stopped.every((s) => s === 2)
  }

  private reelsMoving(): boolean {
    return this.reels.some((r) => r.moving)
  }

  /** 코인이 모자라면 글을 띄운다 (`ov101_021D1AD0` 끝) */
  private checkCoins(need: number, resume: number): boolean {
    if (this.coins === 0) { this.state = 60; this.back = 63; return true }
    if (this.coins < need) { this.state = need === 3 ? 59 : 60; this.back = 63; return true }
    if (this.coins >= MAX_COINS) { this.state = 61; this.back = resume; return true }
    return false
  }

  private startPay(): void {
    this.pay = { state: 1, done: false, frames: 0 }
  }

  private step(input: SlotInput): 0 | 1 | 2 {
    const p = input.pressed
    switch (this.state) {
      case 0:
        this.payout = 0
        this.flags = 0
        this.inBonus = false
        this.state = 1
        this.buttonsOff()
        this.view.lines('base')
        this.view.attract(true)
        this.checkCoins(3, 1)
        return 1
      case 1:
        if (p.has('start')) { this.view.attract(false); this.state = 63; return 0 }
        if (p.has('x')) {
          this.coins -= 3
          this.state = 2
          this.view.sound(SLOT_SOUND.bet)
          this.view.attract(false)
          this.view.lines('bet')
        }
        return 0
      case 2:
        if (p.has('start')) { this.coins += 3; this.state = 63; return 0 }
        if (p.has('down') || p.has('x')) { this.state = 3; return 1 }
        return 0
      case 3:
        this.draw()
        this.sureSlide = (this.flags & 0b110011) !== 0
        this.hitLive = false
        if (this.flags !== 0) {
          this.notice = this.percent() < NOTICE_CHANCE[this.setting]! ? noticeOf(this.flags) : 4
          this.hitLive = true
          this.anim(SlotMode.NOTICE)
        }
        this.buttonsOff()
        this.view.lines('bet')
        this.spinStart()
        this.state = 4
        return 1
      case 4:
        if (++this.timer >= 8) { this.timer = 0; this.state = 5; return 1 }
        return 0
      case 5:
        this.handleStops(input, false)
        if (this.allStopped()) this.state = 6
        return 0
      case 6:
        if (this.reelsMoving()) return 0
        this.view.lines('base')
        this.state = 7
        return 1
      case 7: {
        const got = this.judge()
        if (got === SlotSymbol.NONE) {
          if (this.flags & BONUS_BITS) { this.state = 16; return 1 }
          if (this.flags !== 0) { this.state = 10; return 1 }
          this.state = 8
          return 1
        }
        if (this.flags & BONUS_BITS) { this.state = this.flags & (1 << 1) ? 21 : 19; return 1 }
        this.state = got === SlotSymbol.REPLAY ? 14 : 12
        return 1
      }
      case 8:
        this.view.lines('base')
        this.timer = 0
        this.state = 9
        return 1
      case 9:
        if (++this.timer >= 8) { this.timer = 0; this.state = 0 }
        return 0
      case 10:
        this.view.lines('base')
        this.anim(SlotMode.AFTER)
        this.state = 11
        return 0
      case 11:
        if (this.view.modeDone()) { this.anim(SlotMode.IDLE); this.state = 0; return 1 }
        return 0
      case 12:
        this.payout = this.linePayout(PAYOUT)
        this.timer = 0
        this.state = 13
        this.startPay()
        this.anim(SlotMode.WIN)
        return 0
      case 13:
        this.timer++
        if (this.timer === 30) this.anim(SlotMode.AFTER)
        else if (this.timer > 30 && this.pay.done && this.view.modeDone()) {
          this.anim(SlotMode.IDLE); this.timer = 0; this.state = 0; return 1
        }
        return 0
      case 14:
        this.payout = 0
        this.timer = 0
        this.state = 15
        this.startPay()
        this.anim(SlotMode.WIN)
        return 0
      case 15:
        this.timer++
        if (this.timer === 15) this.anim(SlotMode.AFTER)
        else if (this.timer > 15 && this.pay.done && this.view.modeDone()) {
          this.anim(SlotMode.IDLE); this.timer = 0; this.state = 3; return 1
        }
        return 0
      case 16:
        this.view.lines('base')
        this.drawBonus()
        this.anim(SlotMode.WIN)
        this.timer = 0
        this.state = 17
        return 0
      case 17:
        if (++this.timer >= 8) {
          this.anim(SlotMode.BONUS_ENTRY)
          this.view.music(SlotMusic.PRE_BONUS)
          this.state = 18
        }
        return 0
      case 18:
        if (this.view.modeDone()) { this.state = 23; return 1 }
        return 0
      case 19:
        this.payout = this.linePayout(PAYOUT)
        this.timer = 0
        this.state = 20
        this.startPay()
        this.drawBonus()
        this.anim(SlotMode.WIN)
        return 0
      case 20:
        this.timer++
        if (this.timer === 30) { this.view.music(SlotMusic.PRE_BONUS); this.anim(SlotMode.BONUS_ENTRY) }
        else if (this.timer >= 30 && this.pay.done && this.view.modeDone()) { this.timer = 0; this.state = 23; return 1 }
        return 0
      case 21:
        this.timer = 0
        this.state = 22
        this.startPay()
        this.anim(SlotMode.WIN)
        this.drawBonus()
        return 0
      case 22:
        this.timer++
        if (this.timer === 8) { this.anim(SlotMode.BONUS_ENTRY); this.view.music(SlotMusic.PRE_BONUS) }
        else if (this.timer >= 8 && this.pay.done && this.view.modeDone()) { this.timer = 0; this.state = 24; return 1 }
        return 0
      case 23:
        this.state = 25
        return 1
      case 24:
        this.state = 28
        return 1
      // ── 「세븐을 맞춰라」 ────────────────────────────────────────────────────
      case 25:
        this.payout = 0
        this.state = 26
        this.flags = 0
        this.buttonsOff()
        this.view.lines('base')
        this.view.attract(true)
        this.anim(SlotMode.BONUS_IDLE)
        this.checkCoins(3, 26)
        return 1
      case 26:
        if (p.has('start')) { this.view.attract(false); this.state = 63; return 0 }
        if (p.has('x')) {
          this.coins -= 3; this.state = 27; this.view.sound(SLOT_SOUND.bet)
          this.view.attract(false)
          this.view.lines('bet')
        }
        return 0
      case 27:
        if (p.has('start')) { this.coins += 3; this.state = 63; return 0 }
        if (p.has('down') || p.has('x')) { this.state = 28; return 1 }
        return 0
      case 28:
        this.drawPreBonus()
        this.sureSlide = (this.flags & 0b110011) !== 0
        this.hitLive = this.flags !== 0
        this.buttonsOff()
        this.view.lines('bet')
        this.spinStart()
        this.anim(SlotMode.PRE_BONUS)
        this.state = 29
        return 1
      case 29:
        if (++this.timer >= 8) { this.timer = 0; this.state = 30; return 1 }
        return 0
      case 30:
        this.handleStops(input, false)
        if (this.allStopped()) this.state = 31
        return 0
      case 31:
        if (this.reelsMoving()) return 0
        this.view.lines('base')
        this.state = 32
        return 1
      case 32: {
        const got = this.judge()
        if (got === SlotSymbol.NONE) { this.state = 33; return 1 }
        if (this.flags & ((1 << 8) | (1 << 9))) { this.state = 39; return 1 }
        this.state = got === SlotSymbol.REPLAY ? 37 : 35
        return 1
      }
      case 33:
        this.view.lines('base')
        this.anim(SlotMode.BONUS_IDLE)
        this.timer = 0
        this.state = 34
        return 1
      case 34:
        if (++this.timer >= 8) { this.timer = 0; this.state = 25; return 1 }
        return 0
      case 35:
        this.payout = this.linePayout(PAYOUT)
        this.timer = 0
        this.state = 36
        this.startPay()
        this.anim(SlotMode.PRE_BONUS_WIN)
        return 0
      case 36:
        if (this.pay.done) { this.anim(SlotMode.BONUS_IDLE); this.state = 25; return 1 }
        return 0
      case 37:
        this.payout = 0
        this.timer = 0
        this.state = 38
        this.startPay()
        this.anim(SlotMode.PRE_BONUS_WIN)
        return 0
      case 38:
        if (++this.timer > 15 && this.pay.done) {
          this.anim(SlotMode.BONUS_IDLE); this.view.lines('base'); this.timer = 0; this.state = 28; return 1
        }
        return 0
      case 39:
        this.payout = this.linePayout(PAYOUT)
        this.timer = 0
        this.state = 40
        this.startPay()
        this.anim(SlotMode.PRE_BONUS_WIN)
        this.view.subFade(true)
        this.view.music(SlotMusic.BONUS)
        this.view.sevens(true, this.result, this.lines)
        return 0
      case 40:
        if (this.pay.done) { this.view.sevens(false, this.result, 0); this.anim(SlotMode.BONUS_IDLE); this.state = 41; return 1 }
        return 0
      // ── 삐삐 보너스 ─────────────────────────────────────────────────────────
      case 41:
        this.view.bonusShow(true)
        this.streak = 0
        this.bonusCoins = 0
        this.inBonus = true
        this.state = 42
        return 1
      case 42:
        this.bonusRounds++
        this.streak = Math.min(this.streak + 1, MAX_STREAK)
        this.view.streak(this.streak)
        this.spinsLeft = 15 + 1
        this.inBonus = true
        this.sure = false
        this.redMoon = 0
        this.endAfterRound = this.percent() >= this.continueChance
        this.state = 43
        return 1
      case 43:
        this.spinsLeft--
        this.buttonsOff()
        this.view.lines('base')
        this.view.attract(true)
        this.anim(SlotMode.BONUS_IDLE)
        this.state = 44
        if (this.coins === 0 || this.coins < 1) { this.state = 60; this.back = 63 }
        else if (this.coins >= MAX_COINS) { this.state = 61; this.back = 44 }
        return 1
      case 44:
        if (p.has('start')) { this.state = 63; return 0 }
        if (p.has('x')) {
          this.coins -= 1
          this.bonusCoins = Math.max(0, this.bonusCoins - 1)
          this.state = 45
          this.view.sound(SLOT_SOUND.bet)
          this.view.attract(false)
          this.view.lines('bonus')
        }
        return 0
      case 45:
        if (p.has('start')) { this.coins += 1; this.state = 63; return 0 }
        if (p.has('down') || p.has('x')) { this.state = 46; return 1 }
        return 0
      case 46:
        this.flags = 1 << 0
        this.hitLive = true
        this.sureSlide = true
        this.buttonsOff()
        this.view.lines('bonus')
        this.spinStart()
        this.bonusOrder = this.rand() % 6
        if (!this.sure && this.redMoon === 0) {
          if (this.percent() < RED_MOON_CHANCE[this.setting]!) this.redMoon = 1
          if (this.redMoon === 1) { this.view.bonusFlash(1); this.view.sound(SLOT_SOUND.flash) }
        }
        if (!this.sure && this.redMoon === 0) {
          if (this.percent() < SURE_CONTINUE_CHANCE[this.setting]!) this.sure = true
          if (this.sure) { this.view.bonusFlash(0); this.view.sound(SLOT_SOUND.flash) }
        }
        this.state = 47
        return 1
      case 47:
        if (++this.timer >= 8) { this.timer = 0; this.state = 48; this.anim(SlotMode.BONUS_GUIDE); return 1 }
        return 0
      case 48:
        this.handleStops(input, true)
        if (this.allStopped()) this.state = 49
        return 0
      case 49:
        if (this.reelsMoving()) return 0
        this.view.lines('base')
        this.state = 50
        return 1
      case 50: {
        const got = this.judgeMiddle()
        if (got === SlotSymbol.NONE) {
          if (this.redMoon === 1) this.redMoon = 3
          this.state = 51
          return 1
        }
        if (this.redMoon === 1) this.redMoon = 2
        this.result = got
        this.state = 52
        return 1
      }
      case 51:
        this.view.lines('base')
        this.anim(SlotMode.BONUS_IDLE)
        this.state = this.spinsLeft <= 1 ? 54 : 43
        return 0
      case 52:
        this.payout = BONUS_PAYOUT[this.result]!
        this.startPay()
        this.anim(SlotMode.PRE_BONUS_WIN)
        this.timer = 0
        this.state = 53
        return 0
      case 53:
        if (!this.pay.done) return 0
        this.anim(SlotMode.BONUS_IDLE)
        this.state = this.spinsLeft <= 1 ? 54 : 43
        return 1
      case 54:
        this.spinsLeft--
        if (this.endAfterRound && !this.sure) { this.anim(SlotMode.BONUS_END); this.state = 58; return 0 }
        this.state = 55
        return 1
      case 55: {
        this.decay()
        let show = this.continueShow()
        if (this.sure) show = 2
        if (show === 2) { this.anim(SlotMode.CONTINUE_BIG); this.state = 56; return 0 }
        if (show === 1) { this.anim(SlotMode.CONTINUE_MID); this.state = 57; return 0 }
        this.view.cry(SPECIES_CLEFAIRY)
        this.state = 42
        return 0
      }
      case 56:
      case 57:
        if (!this.view.modeDone()) return 0
        this.state = 42
        return 1
      case 58:
        if (!this.view.modeDone()) return 0
        if (this.streak > this.bestStreak) this.bestStreak = this.streak
        this.view.music(SlotMusic.FIELD)
        this.view.subFade(false)
        this.state = 0
        return 1
      // ── 글 ──────────────────────────────────────────────────────────────────
      case 59: this.view.message(0); this.state = 62; return 0
      case 60: this.view.message(2); this.state = 62; return 0
      case 61: this.view.message(1); this.state = 62; return 0
      case 62:
        if (p.has('a') || p.has('b')) { this.view.closeMessage(); this.state = this.back }
        return 0
      case 63:
        this.view.attract(false)
        return 2
    }
    return 0
  }

  // ── 추첨 ───────────────────────────────────────────────────────────────────

  /** 보통 판 (`ov101_021D40A8`) */
  private draw(): void {
    this.flags = 0
    if (!(HIT_CHANCE[this.setting]! > this.percent())) return
    const left = { v: this.percent() }
    const row = HIT_TABLE[this.setting]!
    for (let i = 0; i < row.length; i++) {
      if (SlotMachine.take(row[i]!, left)) { this.flags |= 1 << HIT_BITS[i]!; return }
    }
    this.flags |= 1 << 0
  }

  /** 보너스 종류와 갈래 · 들어가기 연출 (`ov101_021D4210` · `ov101_021D42D0`) */
  private drawBonus(): void {
    const table = BONUS_TABLE[this.setting]!
    const left = { v: this.percent() }
    let pick = table[table.length - 1]!
    for (const entry of table) {
      if (SlotMachine.take(entry[0], left)) { pick = entry; break }
    }
    this.bonusType = pick[1]
    this.variant = pick[2]
    this.continueChance = CONTINUE_CHANCE[this.bonusType]!
    const shows = ENTRY_SHOW[this.variant]!
    const left2 = { v: this.percent() }
    // 셋 다 안 걸리면 원작은 1로 떨어진다 (`ov101_021D42D0` 끝)
    this.show = 1
    for (const [weight, show] of shows) {
      if (SlotMachine.take(weight, left2)) { this.show = show; return }
    }
  }

  /** 「세븐을 맞춰라」 한 판 (`ov101_021D4394`) — 원작의 `v1[1]` 두 번 읽기까지 그대로 */
  private drawPreBonus(): void {
    this.flags = 0
    const left = { v: this.percent() }
    if (!(this.percent() < PRE_BONUS_SMALL_CHANCE[this.setting]!)) {
      this.flags |= this.bonusType <= 2 ? 1 << 9 : 1 << 8
      return
    }
    if (SlotMachine.take(PRE_BONUS_SMALL[0], left)) { this.flags |= 1 << 2; return }
    if (SlotMachine.take(PRE_BONUS_SMALL[1], left)) { this.flags |= 1 << 6; return }
    if (SlotMachine.take(PRE_BONUS_SMALL[1], left)) { this.flags |= 1 << 4; return }
    this.flags = 1 << 0
  }

  /** 판이 끝날 때 이어 갈 확률을 깎는다 (`ov101_021D44FC`) */
  private decay(): void {
    let v = this.continueChance
    const left = { v: this.percent() }
    const [ten, five] = CONTINUE_DECAY[this.setting]!
    if (this.redMoon === 2) v -= 10
    else if (SlotMachine.take(ten, left)) v -= 10
    else if (SlotMachine.take(five, left)) v -= 5
    this.continueChance = Math.max(0, v)
  }

  /** 이어 갈 때의 연출 (`ov101_021D4550`) — 0 삐삐 울음 · 1 중간 · 2 큰 것 */
  private continueShow(): 0 | 1 | 2 {
    const left = { v: this.percent() }
    for (const [threshold, mid, small] of CONTINUE_SHOW) {
      if (this.continueChance >= threshold) {
        if (SlotMachine.take(mid, left)) return 1
        if (SlotMachine.take(small, left)) return 0
        return 2
      }
    }
    return 0
  }

  // ── 판정 ───────────────────────────────────────────────────────────────────

  /** 다섯 줄을 본다 (`ov101_021D5778`) — 왼쪽이 체리면 그 줄은 맞다 */
  private judge(): SlotSymbol {
    this.lines = 0
    let got = SlotSymbol.NONE
    const lines: [number, [number, number, number]][] = [
      [1, [1, 1, 1]], [0, [2, 2, 2]], [2, [3, 3, 3]], [3, [1, 2, 3]], [4, [3, 2, 1]],
    ]
    for (const [bit, rows] of lines) {
      const s = this.lineSymbol(rows)
      if (s !== SlotSymbol.NONE) { got = s; this.lines |= 1 << bit }
    }
    this.result = got
    return got
  }

  /** 삐삐 보너스는 가운데 줄만 (`ov101_021D57EC`) */
  private judgeMiddle(): SlotSymbol {
    this.lines = 0
    const s = this.lineSymbol([2, 2, 2])
    if (s !== SlotSymbol.NONE) this.lines |= 1
    return s
  }

  private lineSymbol(rows: readonly [number, number, number]): SlotSymbol {
    const a = this.symbolAt(0, rows[0]), b = this.symbolAt(1, rows[1]), c = this.symbolAt(2, rows[2])
    return a === SlotSymbol.CHERRY || (a === b && a === c) ? a : SlotSymbol.NONE
  }

  /** 맞은 줄마다 코인 (`ov101_021D597C`) */
  private linePayout(table: readonly number[]): number {
    let sum = 0
    for (let bit = 0; bit < 5; bit++) if (this.lines & (1 << bit)) sum += table[this.result]!
    return sum
  }

  // ── 릴 ────────────────────────────────────────────────────────────────────

  private advance(i: number, px: number): void {
    this.pos[i] = (this.pos[i]! + px) % REEL_SPAN
    this.top[i] = REEL_LENGTH - Math.floor(this.pos[i]! / SYMBOL_PX)
  }

  /** 칸 사이면 그 칸 끝까지 민다 (`ov101_021D4024`) — 남은 어긋남을 돌려준다 */
  private settle(i: number, px: number): number {
    let off = this.pos[i]! % SYMBOL_PX
    if (off) {
      this.advance(i, Math.min(px, off))
      off = this.pos[i]! % SYMBOL_PX
    }
    return off
  }

  private reelTick(i: number): void {
    const r = this.reels[i]!
    for (let guard = 0; guard < 8; guard++) {
      switch (r.state) {
        case 0: return
        case 1: this.advance(i, this.speed); return
        case 2:
          r.state = 3
          r.row = 0
          r.slide = 0
          if (this.hitLive) {
            if (this.inBonus ? !this.bonusControl(i) : !this.hitControl(i)) {
              if (this.inBonus) this.bonusMiss(i); else this.missControl(i)
              this.hitLive = false
            }
          } else if (this.inBonus) {
            this.bonusMiss(i)
          } else {
            this.missControl(i)
          }
          continue
        case 3: {
          let off = this.pos[i]! % SYMBOL_PX
          let moved = false
          if (off) {
            moved = true
            off = this.settle(i, Math.min(this.speed, off))
          } else if (r.slide) {
            moved = true
            r.slide--
            this.advance(i, this.speed)
            off = this.pos[i]! % SYMBOL_PX
          }
          if (off === 0 && r.slide === 0) {
            const amp = [4, 8, 8, 8, 16]
            r.bounce = amp[Math.min(r.slide, 4)]!
            r.bounceCount = 0
            r.state = 4
            if (!moved) continue
          }
          return
        }
        case 4:
          this.bounceY[i] = r.bounce
          r.bounce = -r.bounce
          r.bounceCount++
          if ((r.bounceCount & 1) === 0) r.bounce = Math.trunc(r.bounce / 4)
          if (r.bounce === 0) { r.state = 0; r.moving = false; this.bounceY[i] = 0 }
          return
      }
    }
  }

  // ── 끌기 (`ov101_021D2D88` ~ `ov101_021D3FA0`) ─────────────────────────────

  private targetSymbol(): SlotSymbol {
    const f = this.flags
    if (f & 0b11) return SlotSymbol.REPLAY
    if (f & 0b1100) return SlotSymbol.CHERRY
    if (f & 0b110000) return SlotSymbol.TEN
    if (f & 0b11000000) return SlotSymbol.FIFTEEN
    if (f & (1 << 8)) return SlotSymbol.SEVEN_B
    if (f & (1 << 9)) return SlotSymbol.SEVEN_A
    return SlotSymbol.NONE
  }

  /** 이 릴이 첫 번째로 멈추는가 (`ov101_021D38FC`) */
  private firstStop(i: number): boolean {
    return [0, 1, 2].filter((k) => k !== i).every((k) => this.stopped[k] === 1)
  }

  private maxSlide(): number {
    return this.sureSlide ? 21 : 4
  }

  /** 왼쪽 릴에 체리가 **안** 보이게 n칸 끌 수 있는가 (`ov101_021D3AF0` 뒤집기) */
  private cherryVisibleAfter(n: number): boolean {
    return this.symbolAt(0, 1 - n) === SlotSymbol.CHERRY || this.symbolAt(0, 2 - n) === SlotSymbol.CHERRY
      || this.symbolAt(0, 3 - n) === SlotSymbol.CHERRY
  }

  /** 체리가 목표가 아니면 왼쪽 릴에 체리가 남으면 안 된다 (`ov101_021D3B34`) */
  private slideOk(n: number, want: SlotSymbol): boolean {
    return want === SlotSymbol.CHERRY || !this.cherryVisibleAfter(n)
  }

  private hitControl(i: number): boolean {
    if (this.flags === 0) return false
    const want = this.targetSymbol()
    if (want === SlotSymbol.NONE) return false
    if (i === 0) return this.firstStop(i) ? this.leftFirst(want) : this.leftLater(want)
    return this.firstStop(i) ? this.otherFirst(i, want) : this.otherLater(i, want)
  }

  /** 왼쪽을 먼저 (`ov101_021D2E94`) */
  private leftFirst(want: SlotSymbol): boolean {
    const r = this.reels[0]!
    for (let row = 1; row <= 3; row++) {
      if (this.symbolAt(0, row) !== want) continue
      for (let n = 0; row + n <= 3; n++) {
        if (this.slideOk(n, want)) { r.row = row + n; r.slide = n; return true }
      }
    }
    const top = this.top[0]!
    for (let k = 1; k <= this.maxSlide(); k++) {
      if (this.symbolAt(0, 1 - k) !== want) continue
      for (let n = 0; n < 3; n++) {
        if (!this.slideOk(k + n, want)) continue
        if (n === 0 && top % 4 === 0 && this.slideOk(k + 2, want)) { r.row = 3; r.slide = k + 2; return true }
        if (n === 1 && top % 6 < 2 && this.slideOk(k + 2, want)) { r.row = 3; r.slide = k + 2; return true }
        r.row = 1 + n
        r.slide = k + n
        return true
      }
    }
    return false
  }

  /** 먼저 멈춘 릴을 보고 이 릴이 맞출 수 있는 줄 (`ov101_021D394C`) */
  private openRows(i: number): [number, number, number] {
    const [s0, s1, s2] = this.stopped
    const [r0, r1, r2] = this.reels.map((r) => r.row) as [number, number, number]
    switch (i) {
      case 0:
        if (s1 !== 1 && s2 !== 1) return r1 === r2 ? [r1, 0, 0] : r2 === 1 ? [3, 0, 0] : [1, 0, 0]
        if (s1 !== 1) return r1 === 2 ? [1, 2, 3] : [r1, 0, 0]
        return r2 === 2 ? [r2, 0, 0] : [1, 3, 0]
      case 1:
        if (s0 !== 1 && s2 !== 1) return r0 === r2 ? [r0, 0, 0] : [2, 0, 0]
        if (s0 !== 1) return r0 === 2 ? [2, 0, 0] : r0 === 1 ? [1, 2, 0] : [2, 3, 0]
        return r2 === 2 ? [2, 0, 0] : r2 === 1 ? [1, 2, 0] : [2, 3, 0]
      default:
        if (s0 !== 1 && s1 !== 1) return r0 === r1 ? [r0, 0, 0] : r0 === 1 ? [3, 0, 0] : [1, 0, 0]
        if (s0 !== 1) return r0 === 2 ? [2, 0, 0] : [1, 3, 0]
        return r1 === 2 ? [1, 2, 3] : [r1, 0, 0]
    }
  }

  /** 왼쪽을 나중에 (`ov101_021D2FAC`) */
  private leftLater(want: SlotSymbol): boolean {
    const r = this.reels[0]!
    const [a, b, c] = this.openRows(0)
    if (this.slideOk(0, want)) {
      for (const row of [a, b, c]) {
        if (row !== 0 && this.symbolAt(0, row) === want) { r.row = row; r.slide = 0; return true }
      }
    }
    const max = this.maxSlide()
    const tryRow = (row: number, k: number): boolean => {
      if (this.symbolAt(0, row - k) !== want || !this.slideOk(k, want)) return false
      r.row = row; r.slide = k
      return true
    }
    if (b === 0) {
      for (let k = 1; k <= max; k++) if (tryRow(a, k)) return true
      return false
    }
    if (c === 0) {
      for (let k = 1; k <= max; k++) {
        const pair = k & 1 ? [a, b] : [b, a]
        for (const row of pair) if (tryRow(row, k)) return true
      }
      return false
    }
    for (let k = 1; k <= max; k++) {
      const m = k & 3
      const rows = m === 0 ? [a, b, c] : m === 1 ? [b, a] : [c, a, b]
      for (const row of rows) if (tryRow(row, k)) return true
    }
    return false
  }

  /** 가운데 · 오른쪽을 먼저 (`ov101_021D32EC`) */
  private otherFirst(i: number, want: SlotSymbol): boolean {
    const r = this.reels[i]!
    for (let row = 1; row <= 3; row++) {
      if (this.symbolAt(i, row) === want) { r.row = row; r.slide = 0; return true }
    }
    for (let k = 1; k <= this.maxSlide(); k++) {
      if (this.symbolAt(i, 1 - k) !== want) continue
      const m = k % 4
      if (m === 1) { r.row = 3; r.slide = k + 2; return true }
      if (m === 2 || m === 3) { r.row = 2; r.slide = k + 1; return true }
      r.row = 1
      r.slide = k
      return true
    }
    return false
  }

  /** 가운데 · 오른쪽을 나중에 (`ov101_021D3394`) */
  private otherLater(i: number, want: SlotSymbol): boolean {
    const r = this.reels[i]!
    const [a, b, c] = this.openRows(i)
    for (const row of [a, b, c]) {
      if (row !== 0 && this.symbolAt(i, row) === want) { r.row = row; r.slide = 0; return true }
    }
    const max = this.maxSlide()
    const scan = (row: number): boolean => {
      for (let k = 1; k <= max; k++) {
        if (this.symbolAt(i, row - k) === want) { r.row = row; r.slide = k; return true }
      }
      return false
    }
    if (b === 0) return scan(a)
    const top = this.top[i]!
    if (c === 0) return top & 1 ? scan(a) || scan(b) : scan(b) || scan(a)
    const m = top % 3
    const rows = m === 0 ? [a, b, c] : m === 1 ? [b, c, a] : [c, a, b]
    return rows.some(scan)
  }

  /** 삐삐 보너스 — 가운데 줄에 (`ov101_021D3738`) */
  private bonusControl(i: number): boolean {
    const want = this.targetSymbol()
    if (want === SlotSymbol.NONE) return false
    const r = this.reels[i]!
    for (let k = 0; k <= this.maxSlide(); k++) {
      if (this.symbolAt(i, 2 - k) === want) { r.row = 2; r.slide = k; return true }
    }
    return false
  }

  /** 눌린 릴 수 (`ov101_021D38E4`) */
  private stopsPressed(): number {
    return this.stopped.filter((s) => s !== 1).length
  }

  /** 안 맞게 (`ov101_021D3780`) */
  private missControl(i: number): void {
    const r = this.reels[i]!
    const n = this.stopsPressed()
    if (i !== 0 && n < 2) return
    if (i === 0 && n < 2) {
      for (let k = 0; k <= 21; k++) if (!this.cherryVisibleAfter(k)) { r.slide = k; return }
      return
    }
    for (let k = 1; k <= 21; k++) if (!this.winsAfter(i, k, false)) { r.slide = k; return }
  }

  /** 삐삐 보너스에서 안 맞게 (`ov101_021D3830`) — 가운데 줄만 본다 */
  private bonusMiss(i: number): void {
    const r = this.reels[i]!
    const n = this.stopsPressed()
    if (i !== 0 && n < 2) return
    if (i === 0 && n < 2) {
      for (let k = 0; k < 21; k++) if (this.symbolAt(0, 2 - k) !== SlotSymbol.CHERRY) { r.slide = k; return }
      return
    }
    // 왼쪽은 스물한 칸 **안**, 가운데 · 오른쪽은 스물한 칸까지 본다 (원작의 `<` · `<=` 그대로)
    const last = i === 0 ? 20 : 21
    for (let k = 0; k <= last; k++) if (!this.winsAfter(i, k, true)) { r.slide = k; return }
  }

  /**
   * 이 릴을 k칸 더 끌면 어느 줄이 맞나 (`ov101_021D3B50` · `_3C9C` · `_3DD4` · `_3F0C` · `_3F58` · `_3FA0`).
   * 다른 릴은 남은 끌기만큼 앞을 본다. 체리는 **왼쪽 릴에서만** 혼자 맞는다
   */
  private winsAfter(i: number, k: number, middleOnly: boolean): boolean {
    const shift = [0, 1, 2].map((reel) => (reel === i ? k : this.reels[reel]!.slide))
    const at = (reel: number, row: number): SlotSymbol => this.symbolAt(reel, row - shift[reel]!)
    const lines: readonly [number, number, number][] = middleOnly
      ? [[2, 2, 2]]
      : [[1, 1, 1], [2, 2, 2], [3, 3, 3], [1, 2, 3], [3, 2, 1]]
    for (const rows of lines) {
      const a = at(0, rows[0]), b = at(1, rows[1]), c = at(2, rows[2])
      if ((i === 0 && a === SlotSymbol.CHERRY) || (a === b && a === c)) return true
    }
    return false
  }

  // ── 코인 세기 (`ov101_021D4614`) ───────────────────────────────────────────

  private payTick(input: SlotInput): void {
    const t = this.pay
    switch (t.state) {
      case 0: return
      case 1:
        if (this.lines !== 0) this.view.flashLines(this.lines, this.payout)
        t.state = 2
        return
      case 2:
        if (this.lines !== 0 && !this.view.linesReady()) return
        t.state = 3
        this.payCount(input)
        return
      case 3:
        this.payCount(input)
    }
  }

  /** 세는 한 프레임 (`ov101_021D4614`의 3번) — 줄 등불이 서면 같은 프레임에 이어 돈다 */
  private payCount(input: SlotInput): void {
    const t = this.pay
    if (input.pressed.has('x') || this.payout === 0) {
      this.view.sound(SLOT_SOUND.coin)
      this.coins = Math.min(this.coins + this.payout, MAX_COINS)
      if (this.inBonus) this.bonusCoins += this.payout
      this.payout = 0
      this.view.endLines()
      t.done = true
      t.state = 0
      return
    }
    const mask = input.held ? 0x1 : 0x3
    t.frames++
    if ((t.frames & mask) === 0) {
      this.payout--
      this.coins = Math.min(this.coins + 1, MAX_COINS)
      this.view.sound(SLOT_SOUND.coin)
      if (this.inBonus) this.bonusCoins++
    }
  }
}

/** 보너스로 가는 비트 — 체리 · 10 · 15 · 리플레이의 「+보너스」 */
const BONUS_BITS = (1 << 1) | (1 << 3) | (1 << 5) | (1 << 7)

/** 예고 연출의 종류 (`ov101_021D5814`) — 0 체리 · 1 리플레이 · 2 10 · 3 15 · 4 없음 */
function noticeOf(flags: number): number {
  if (flags & 0b11) return 1
  if (flags & 0b1100) return 0
  if (flags & 0b110000) return 2
  if (flags & 0b11000000) return 3
  return 4
}

/**
 * 기계 열두 대의 설정 (`sub_0203E484`). 씨앗은 날마다 바뀌는 수(`RecordMixedRNG_GetRand`)라 **하루에 한 번** 섞인다
 */
export function slotSetting(dailyRand: number, machine: number): number {
  const v = [0, 5, 1, 1, 4, 4, 2, 2, 2, 3, 3, 3]
  let seed = dailyRand >>> 0
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 24691) >>> 0
    return seed >>> 16
  }
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      const slot = next() % 12
      const t = v[i]!
      v[i] = v[slot]!
      v[slot] = t
    }
  }
  return v[machine] ?? 0
}
