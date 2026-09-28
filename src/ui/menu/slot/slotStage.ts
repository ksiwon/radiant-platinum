// 슬롯머신의 무대 — 연출과 그리기 (PARITY §7.6 · `overlay101/ov101_021D59AC.c` · `ov101_021D1A28.c` 3180~4700줄)
//
// 엔진(`engine/gameCorner/slotMachine`)이 부르는 화면 약속(`SlotView`)을 여기서 채운다. 원작의 연출 모드 열셋을
// **같은 번호로** 생성기(`function*`)로 옮겼다 — 한 번 `next()`가 원작 한 프레임이다.
//
//   위 화면  배경색 → 릴 스프라이트 → BG2(릴 창 그늘, 알파 8:9로 릴 위에 섞인다) → BG1(기계 틀) → 숫자판 · 세븐
//   아래 화면 BG3(달밤) → 스프라이트(목록 우선순위가 큰 것부터 — 작을수록 앞이다)
//
// 배경은 색이 아니라 **색 번호 판**이라(`import/platinum/slots` 머리말) 프레임마다 지금 팔레트로 칠한다 —
// 이긴 줄 · 멈춤 단추 · 달밤이 원작처럼 팔레트 줄을 섞어 번쩍인다.
import type { SlotSprites } from '../../../data/schema'
import {
  SlotMode, SlotMusic, type SlotMessage, type SlotView,
} from '../../../engine/gameCorner/slotMachine'
import { SlotSymbol } from '../../../engine/gameCorner/slotTables'

export const SCREEN_W = 256
export const SCREEN_H = 192

/** 원작 연출이 내는 소리 — `songs[]`에서 이름으로 찾은 번호 */
const SE = {
  /** `SEQ_SE_DP_UG_020` — 예고가 튀어나온다 */
  noticeIn: 1572,
  /** `SEQ_SE_DP_SLOT01` — 예고가 한 번 더 */
  noticeHit: 1744,
  /** `SEQ_SE_DP_SLOT02` — 삐삐가 들어간다 */
  clefairyOut: 1745,
} as const

const SPECIES_CLEFAIRY = 35

/** 예고 묶음 — 종류 0 체리 · 1 리플레이 · 2 10 · 3 15 · 4 헛것 (`ov101_021D59AC.c:2514`) */
const NOTICE_SETS = ['notice24', 'notice28', 'notice32', 'notice36', 'notice40'] as const
/** 이긴 줄 → BG1 팔레트 줄 (`Unk_ov101_021D9E60`) · 원래 줄 (`ov101_021D4D38`) · 켬 줄 */
const LINE_ROW = [2, 3, 12, 4, 11] as const
const LINE_BASE = [2, 3, 3, 4, 4] as const
const LINE_LIT = ['l74', 'l75', 'l75', 'l76', 'l76'] as const
/** 멈춤 단추 칸 — 타일 (7,17) · (15,17) · (22,17)에서 3×2 (`Unk_ov101_021D8740`) */
const BUTTON_RECTS = [[7, 17], [15, 17], [22, 17]] as const
/** 기다리는 동안의 줄 등불 대본 (`Unk_ov101_021D8938`) — [줄 비트, 처음, 끝, 걸음] 또는 [대기 프레임] */
const ATTRACT: readonly (readonly number[])[] = [
  [30], [1, 0, 14], [2], [1, 14, 0], [8], [6, 0, 14], [2], [6, 14, 0], [8], [24, 0, 14], [2], [24, 14, 0], [16],
  [24, 0, 14], [2], [24, 14, 0], [8], [6, 0, 14], [2], [6, 14, 0], [8], [1, 0, 14], [2], [1, 14, 0], [16],
  [2, 0, 14], [2], [2, 14, 0], [8], [16, 0, 14], [2], [16, 14, 0], [8], [4, 0, 14], [2], [4, 14, 0], [8],
  [8, 0, 14], [2], [8, 14, 0], [8], [1, 0, 14], [2], [1, 14, 0], [16],
  [8, 0, 14], [1], [8, 14, 0], [2], [2, 0, 14], [1], [2, 14, 0], [2], [1, 0, 14], [1], [1, 14, 0], [2],
  [4, 0, 14], [1], [4, 14, 0], [2], [16, 0, 14], [1], [16, 14, 0], [8], [4, 0, 14], [1], [4, 14, 0], [2],
  [1, 0, 14], [1], [1, 14, 0], [2], [2, 0, 14], [1], [2, 14, 0], [2], [8, 0, 14], [1], [8, 14, 0], [16],
]

// ── 팔레트 ──────────────────────────────────────────────────────────────────

/** BGR555 두 색을 `t/16`만큼 섞는다 (`ov101_021D4EC0` — 채널마다 `a + ((b − a)·t >> 4)`) */
function mix555(a: number, b: number, t: number): number {
  const k = Math.min(t, 16)
  const ch = (shift: number): number => {
    const x = (a >> shift) & 31, y = (b >> shift) & 31
    return (x + (((y - x) * k) >> 4)) & 31
  }
  return ch(0) | (ch(5) << 5) | (ch(10) << 10)
}

const mixRow = (a: readonly number[], b: readonly number[], t: number): number[] =>
  a.map((c, i) => mix555(c, b[i] ?? c, t))

/** 5비트 → 8비트 (`(c << 3) | (c >> 2)`) */
const up = (c: number): number => ((c & 31) << 3) | ((c & 31) >> 2)

// ── 셀 애니 ─────────────────────────────────────────────────────────────────

interface Sprite {
  set: string
  anim: number
  frame: number
  /** 이 프레임에 머문 시간 (배속을 곱한다) */
  t: number
  speed: number
  /** 멈춰 두고 손으로 넘긴다 (`Sprite_SetAnimateFlag(…, 0)`) */
  paused: boolean
  ended: boolean
  x: number
  y: number
  scale: number
  rot: number
  hflip: boolean
  visible: boolean
  /** 목록 우선순위 — 작을수록 앞 */
  prio: number
}

function sprite(set: string, x: number, y: number, prio: number): Sprite {
  return {
    set, anim: 0, frame: 0, t: 0, speed: 1, paused: false, ended: false, x, y, scale: 1, rot: 0, hflip: false,
    visible: true, prio,
  }
}

type Gen = Generator<void, void, void>

function* wait(frames: number): Gen {
  for (let i = 0; i < frames; i++) yield
}

function* until(ok: () => boolean): Gen {
  while (!ok()) yield
}

/** 한 배우 — 그림 하나와 그것을 움직이는 동작 하나 */
class Actor {
  motion: Gen | null = null
  constructor(public s: Sprite) {}
  run(g: Gen): void { this.motion = g }
  get idle(): boolean { return this.motion === null }
  step(): void {
    if (this.motion && this.motion.next().done === true) this.motion = null
  }
}

// ── 무대 ────────────────────────────────────────────────────────────────────

interface StageHooks {
  sound(seq: number): void
  cry(species: number): void
  music(which: SlotMusic): void
  message(which: SlotMessage): void
  closeMessage(): void
}

export class SlotStage implements SlotView {
  // 엔진이 읽는 것
  private done = false
  private linesUp = false

  // 팔레트 — 위 화면 BG1 · BG2는 `main`, 아래 화면 BG3는 `sub`
  private readonly main: number[][]
  private readonly sub: number[][]
  private buttonRow = [5, 5, 5]

  // 배우
  private notice: Actor | null = null
  private clefairy: Actor | null = null
  private poof: Actor | null = null
  private pair: [Actor, Actor] | null = null
  private streakDigits: { value: number, left: number } | null = null
  private endBoard: { streak: number, coins: number, left: number } | null = null
  private hud = false
  private sevenShow: { symbol: SlotSymbol, rows: [number, number, number], y: number, hidden: boolean, gen: Gen } | null = null

  private modeGen: Gen | null = null
  private lineGens: Gen[] = []
  private lineRelease = false
  private attractGen: Gen | null = null
  private subGens: Gen[] = []
  private noticeType = 4
  private show = 0
  /** 삐삐의 손가락 — 엔진이 알려 준다 */
  pointing: { order: readonly number[], stopped: () => number } | null = null

  // 숫자판 — 엔진 값을 매 프레임 받아 둔다
  credit = 0
  payoutShown = 0
  spinsLeft = 0
  bonusCoins = 0

  constructor(private readonly data: SlotSprites, private readonly hooks: StageHooks) {
    this.main = data.palettes.bg.map((r) => [...r])
    this.sub = data.palettes.bg.map((r) => [...r])
  }

  // ── SlotView ──────────────────────────────────────────────────────────────

  mode(mode: SlotMode, info: { notice: number, show: number }): void {
    this.done = false
    this.noticeType = info.notice
    this.show = info.show
    this.modeGen = this.modeScript(mode)
  }

  modeDone(): boolean { return this.done }

  flashLines(lines: number, payout: number): void {
    // `ov101_021D4714` — 켜진 줄을 둘까지
    this.lineGens = []
    this.linesUp = false
    this.lineRelease = false
    let started = 0
    for (let bit = 0; bit < 5 && started < 2; bit++) {
      if (lines & (1 << bit)) { this.lineGens.push(this.lineFlash(bit, payout !== 0)); started++ }
    }
  }

  linesReady(): boolean { return this.linesUp }

  endLines(): void {
    this.lineRelease = true
  }

  sound(seq: number): void { this.hooks.sound(seq) }
  cry(species: number): void { this.hooks.cry(species) }
  music(which: SlotMusic): void { this.hooks.music(which) }
  message(which: SlotMessage): void { this.hooks.message(which) }
  closeMessage(): void { this.hooks.closeMessage() }

  bonusFlash(kind: 0 | 1): void {
    // `ov101_021D54EC` — 8에서 +1씩 16까지, 그다음 −0.25씩 0까지. 팔레트 5 → 6(확정) · 7(빨간 달)
    this.subGens.push(this.flashScript(kind === 0 ? this.data.palettes.m6 : this.data.palettes.m7))
  }

  private *flashScript(to: readonly number[]): Gen {
    const from = this.data.palettes.m5
    let t = 8
    for (;;) { t = Math.min(16, t + 1); this.sub[1] = mixRow(from, to, t); yield; if (t === 16) break }
    for (;;) { t = Math.max(0, t - 0.25); this.sub[1] = mixRow(from, to, Math.floor(t)); yield; if (t === 0) break }
  }

  bonusShow(on: boolean): void {
    // `ov101_021D47B4` — 「BONUS」 · 남은 판 · 「GET」 · 번 코인
    this.hud = on
  }

  streak(n: number): void {
    // `ov101_021D79BC` — 60프레임 뒤에 거둔다
    this.streakDigits = { value: Math.min(n, 999), left: 60 }
  }

  button(reel: number, lit: boolean): void {
    this.buttonRow[reel] = lit ? 6 : 5
  }

  lines(kind: 'base' | 'bet' | 'bonus'): void {
    const t = kind === 'base' ? 0 : kind === 'bet' ? 10 : 12
    const bits = kind === 'bonus' ? [0] : [0, 1, 2, 3, 4]
    if (kind === 'base') this.lineGens = []
    for (const bit of bits) this.paintLine(bit, t)
  }

  attract(on: boolean): void {
    if (on) { this.attractGen = this.attractScript(); return }
    this.attractGen = null
    for (let bit = 0; bit < 5; bit++) this.paintLine(bit, 0)
  }

  subFade(on: boolean): void {
    // `ov101_021D542C` · `_548C` — 0.5씩 32프레임
    this.subGens.push(this.fadeScript(on))
  }

  private *fadeScript(on: boolean): Gen {
    const base = this.data.palettes.bg[1]!
    const m5 = this.data.palettes.m5
    for (let t = 0.5; ; t += 0.5) {
      const k = Math.min(16, Math.floor(t))
      this.sub[1] = on ? mixRow(base, m5, k) : mixRow(m5, base, k)
      yield
      if (k === 16) break
    }
  }

  sevens(on: boolean, symbol: SlotSymbol, lines: number): void {
    if (!on) { this.sevenShow = null; return }
    // 첫 줄의 세 칸 (`ov101_021D7B08`)
    const ROWS: readonly [number, number, number][] = [[2, 2, 2], [1, 1, 1], [3, 3, 3], [1, 2, 3], [3, 2, 1]]
    let bit = 0
    while (bit < 5 && (lines & (1 << bit)) === 0) bit++
    this.sevenShow = { symbol, rows: ROWS[Math.min(bit, 4)]!, y: 0, hidden: false, gen: this.sevensScript() }
  }

  // ── 줄 등불 ───────────────────────────────────────────────────────────────

  private paintLine(bit: number, t: number): void {
    const base = this.data.palettes.bg[LINE_BASE[bit]!]!
    const lit = this.data.palettes[LINE_LIT[bit]!]
    this.main[LINE_ROW[bit]!] = mixRow(base, lit, t)
  }

  /** `ov101_021D5098` — 4씩 오르내리기 네 번(32프레임), 코인이 있으면 끝날 때까지 8씩 빠르게 */
  private *lineFlash(bit: number, fast: boolean): Gen {
    let t = 0
    for (let n = 0; n < 4; n++) {
      while (t < 16) { t = Math.min(16, t + 4); this.paintLine(bit, t); yield }
      while (t > 0) { t = Math.max(0, t - 4); this.paintLine(bit, t); yield }
    }
    this.linesUp = true
    if (!fast) return
    while (!this.lineRelease) {
      while (t < 16 && !this.lineRelease) { t = Math.min(16, t + 8); this.paintLine(bit, t); yield }
      while (t > 0 && !this.lineRelease) { t = Math.max(0, t - 8); this.paintLine(bit, t); yield }
    }
    this.paintLine(bit, 0)
  }

  /** `ov101_021D5268` — 대본을 한 줄씩. 오르내림은 4씩, 기다림은 프레임 */
  private *attractScript(): Gen {
    const level = [0, 0, 0, 0, 0]
    for (;;) {
      for (const step of ATTRACT) {
        if (step.length === 1) { yield* wait(step[0]!); continue }
        const [bits, from, to] = step as [number, number, number]
        for (let bit = 0; bit < 5; bit++) if (bits & (1 << bit)) level[bit] = from
        for (;;) {
          let moving = false
          for (let bit = 0; bit < 5; bit++) {
            if (!(bits & (1 << bit))) continue
            level[bit] = from < to ? Math.min(to, level[bit]! + 4) : Math.max(to, level[bit]! - 4)
            if (level[bit] !== to) moving = true
            this.paintLine(bit, level[bit]!)
          }
          yield
          if (!moving) break
        }
      }
    }
  }

  /** 세븐 — 떨어지고(4씩, 아래 화면 48까지) · 30 · 깜빡임 셋(11 숨김 · 19 보임) · 30 (`ov101_021D7B08`) */
  private *sevensScript(): Gen {
    const s = this.sevenShow
    if (!s) return
    while (s.y < 240) { s.y = Math.min(240, s.y + 4); yield }
    yield* wait(30)
    for (let n = 0; n < 3; n++) {
      for (let f = 0; f < 30; f++) { s.hidden = f < 11; yield }
    }
    s.hidden = false
    yield* wait(30)
  }

  // ── 예고 (`ov101_021D5D58`) ────────────────────────────────────────────────

  private makeNotice(): Actor {
    const a = new Actor(sprite(NOTICE_SETS[Math.min(this.noticeType, 4)]!, 0, 416 - 192, 7))
    this.notice = a
    return a
  }

  /** N1 — 두 배 크기로 아래에서 튀어나와 160에 선다 */
  private *n1(a: Actor): Gen {
    const s = a.s
    s.x = 128; s.y = 192; s.scale = 2; this.setAnim(s, 0)
    this.hooks.sound(SE.noticeIn)
    for (let i = 0; i < 9; i++) { s.y -= 4; s.scale -= 0x1c7 / 0x1000; yield }
    s.y = 160; s.scale = 1
    yield* wait(3)
  }

  private *n2(a: Actor): Gen {
    this.setAnim(a.s, 1)
    this.hooks.sound(SE.noticeHit)
    yield* wait(4)
  }

  private *n3(a: Actor): Gen {
    this.setAnim(a.s, 3)
    for (const dy of [-8, 0, -6, 0, -4, 0, -2, 0]) { a.s.y = 160 + dy; yield; yield }
    a.s.y = 160
  }

  private *n4(a: Actor): Gen {
    const s = a.s
    this.setAnim(s, 4)
    for (let i = 0; i < 10; i++) { s.y += 4; s.scale += 0x1c7 / 0x1000; yield }
    s.y = 256; s.scale = 1
  }

  /** N5 — 좌우로 흔들린다 (끝이 없다) */
  private *n5(a: Actor): Gen {
    const s = a.s
    this.setAnim(s, 2)
    const dx = [-2, 0, 2, 0, 2, 0, -2, 0], dr = [-16, 0, 16, 0, 16, 0, -16, 0], len = [4, 1, 4, 8, 4, 1, 4, 8]
    for (;;) {
      for (let p = 0; p < 8; p++) {
        for (let f = 0; f < len[p]!; f++) { s.x += dx[p]!; s.rot += dr[p]!; yield }
      }
    }
  }

  // ── 삐삐 (`ov101_021D6764`) ────────────────────────────────────────────────

  private makeClefairy(): Actor {
    const a = new Actor(sprite(`clefairy${String(Math.min(this.show, 2))}`, 128, 256, 6))
    this.clefairy = a
    return a
  }

  /** C1 — 4분의 1 크기에서 16프레임 동안 자라고 울고, 애니 1을 한 칸씩 아홉 번 */
  private *c1(a: Actor): Gen {
    const s = a.s
    s.x = 128; s.y = 128; s.scale = 0.25
    this.setAnim(s, 1); s.paused = true
    for (let i = 0; i < 16; i++) { s.scale = Math.min(1, s.scale + 0xc0 / 0x1000); yield }
    s.scale = 1
    this.hooks.cry(SPECIES_CLEFAIRY)
    for (let i = 0; i < 9; i++) { this.stepFrame(s); yield }
  }

  private *c2(a: Actor): Gen {
    const s = a.s
    this.hooks.sound(SE.clefairyOut)
    for (let i = 0; i < 8; i++) { s.scale = Math.max(0, s.scale - 0x180 / 0x1000); yield }
    s.y = 272
  }

  private pose(a: Actor, anim: number, speed = 1, paused = false): void {
    this.setAnim(a.s, anim)
    a.s.speed = speed
    a.s.paused = paused
    a.motion = null
  }

  /** C8 — 애니 5를 손으로 넘기고, 끝나면 8프레임 쉬었다 다시 */
  private *c8(a: Actor): Gen {
    for (;;) {
      this.setAnim(a.s, 5); a.s.paused = true
      const n = this.animOf(a.s)?.frames.length ?? 1
      for (let f = 0; f < n; f++) {
        const time = this.animOf(a.s)?.frames[a.s.frame]?.[1] ?? 1
        for (let k = 0; k < time; k++) yield
        this.stepFrame(a.s)
      }
      yield* wait(8)
    }
  }

  // ── 연기 · 양옆 ───────────────────────────────────────────────────────────

  private makePoof(): Actor {
    const a = new Actor(sprite('anim44', 128, 144, 5))
    this.poof = a
    return a
  }

  /** 양옆의 피카츄 둘 (`ov101_021D6DF0`) — 들어와서 번갈아 두 번 · 같이 두 번 꾸벅하고 나간다 */
  private *pairScript(a: Actor, b: Actor): Gen {
    b.s.hflip = true
    let px = 0, py = 0
    const place = (): void => { a.s.x = -32 + px; a.s.y = 228 - py; b.s.x = 288 - px; b.s.y = 228 - py }
    place()
    while (px < 64) { px = Math.min(64, px + 8); py = Math.min(64, py + 8); place(); yield }
    yield* wait(8)
    const dip = function* (who: Sprite[]): Gen {
      for (let i = 0; i < 4; i++) { for (const s of who) { s.x += s.hflip ? 2 : -2; s.y -= 4 } yield }
      for (let i = 0; i < 4; i++) { for (const s of who) { s.x -= s.hflip ? 2 : -2; s.y += 4 } yield }
    }
    for (let n = 0; n < 2; n++) { yield* dip([a.s]); yield* dip([b.s]) }
    yield* wait(8)
    for (let n = 0; n < 2; n++) yield* dip([a.s, b.s])
    px -= 8; py -= 8; place(); yield
  }

  // ── 모드 (`Unk_ov101_021D8774`) ────────────────────────────────────────────

  private *modeScript(mode: SlotMode): Gen {
    switch (mode) {
      case SlotMode.IDLE: return
      case SlotMode.NOTICE: {
        const n = this.makeNotice()
        yield
        n.run(this.n1(n))
        yield* until(() => n.idle)
        n.run(this.n5(n))
        this.done = true
        return
      }
      case SlotMode.AFTER: {
        const n = this.notice
        if (n) { n.run(this.n4(n)); yield* until(() => n.idle) }
        this.notice = null
        this.done = true
        return
      }
      case SlotMode.BONUS_ENTRY: {
        const n = this.notice
        if (n) { n.run(this.n2(n)); yield* until(() => n.idle) }
        this.makePoof()
        const c = this.makeClefairy()
        c.run(this.c1(c))
        if (n) n.s.visible = false
        yield* until(() => c.idle)
        this.poof = null
        this.done = true
        return
      }
      case SlotMode.CONTINUE_BIG: {
        const c = this.clefairy
        if (c) this.pose(c, 0, 1, true)
        const a = new Actor(sprite('anim56', -32, 228, 4)), b = new Actor(sprite('anim56', 288, 228, 4))
        this.pair = [a, b]
        a.run(this.pairScript(a, b))
        yield* wait(48)
        this.hooks.cry(SPECIES_CLEFAIRY)
        if (c) this.pose(c, 2, 0.5)
        yield* until(() => a.idle)
        this.pair = null
        if (c) this.pose(c, 0, 1, true)
        this.done = true
        return
      }
      case SlotMode.BONUS_GUIDE: {
        const c = this.clefairy
        const POSE = [4, 5, 3]
        for (;;) {
          const p = this.pointing
          if (c && p) {
            const n = Math.min(p.stopped(), 2)
            const want = POSE[p.order[n] ?? 0]!
            if (c.s.anim !== want) this.pose(c, want)
          }
          yield
        }
      }
      case SlotMode.BONUS_IDLE: {
        if (this.clefairy) this.pose(this.clefairy, 0, 1, true)
        return
      }
      case SlotMode.BONUS_END: {
        this.hud = false
        const c = this.clefairy
        this.makePoof()
        if (c) { c.run(this.c2(c)); yield* until(() => c.idle) }
        this.clefairy = null
        this.poof = null
        const n = this.notice ?? this.makeNotice()
        n.s.visible = true; n.s.x = 128; n.s.y = 160; n.s.scale = 1
        n.run(this.n3(n))
        this.endBoard = { streak: this.streakValue(), coins: this.bonusCoins, left: 45 }
        yield* wait(45)
        n.run(this.n4(n))
        yield* until(() => n.idle)
        this.notice = null
        this.done = true
        return
      }
      case SlotMode.PRE_BONUS: {
        if (this.clefairy) this.pose(this.clefairy, 2, 0.5)
        this.done = true
        return
      }
      case SlotMode.PRE_BONUS_WIN: {
        if (this.clefairy) this.clefairy.run(this.c8(this.clefairy))
        this.done = true
        return
      }
      case SlotMode.WIN: {
        const n = this.notice
        if (n) { this.setAnim(n.s, 2); n.motion = null }
        this.done = true
        return
      }
      case SlotMode.CONTINUE_MID: {
        const c = this.clefairy
        this.makePoof()
        this.hud = false
        if (c) { c.run(this.c2(c)); yield* until(() => c.idle) }
        const n = this.notice ?? this.makeNotice()
        n.s.visible = true; n.s.x = 128; n.s.y = 160; n.s.scale = 1
        n.run(this.n3(n)); yield* until(() => n.idle)
        yield* wait(30)
        n.run(this.n2(n)); yield* until(() => n.idle)
        this.makePoof()
        const c2 = this.makeClefairy()
        this.hud = true
        c2.run(this.c1(c2))
        n.s.visible = false
        yield* until(() => c2.idle)
        this.poof = null
        this.done = true
        return
      }
    }
  }

  private lastStreak = 0
  private streakValue(): number { return this.lastStreak }

  // ── 한 프레임 ─────────────────────────────────────────────────────────────

  tick(streak: number): void {
    this.lastStreak = streak
    if (this.modeGen && this.modeGen.next().done === true) this.modeGen = null
    this.lineGens = this.lineGens.filter((g) => g.next().done !== true)
    if (this.attractGen) this.attractGen.next()
    this.subGens = this.subGens.filter((g) => g.next().done !== true)
    for (const a of this.actors()) { a.step(); this.animate(a.s) }
    if (this.sevenShow && this.sevenShow.gen.next().done === true) this.sevenShow = null
    if (this.streakDigits && --this.streakDigits.left <= 0) this.streakDigits = null
    if (this.endBoard && --this.endBoard.left <= 0) this.endBoard = null
  }

  private actors(): Actor[] {
    const out: Actor[] = []
    if (this.notice) out.push(this.notice)
    if (this.clefairy) out.push(this.clefairy)
    if (this.poof) out.push(this.poof)
    if (this.pair) out.push(...this.pair)
    return out
  }

  private animOf(s: Sprite) {
    return this.data.sets[s.set]?.anims[s.anim]
  }

  private setAnim(s: Sprite, anim: number): void {
    s.anim = anim; s.frame = 0; s.t = 0; s.ended = false; s.speed = 1; s.paused = false
  }

  private stepFrame(s: Sprite): void {
    const a = this.animOf(s)
    if (!a) return
    s.frame++
    if (s.frame >= a.frames.length) {
      if (a.mode === 1) { s.frame = a.frames.length - 1; s.ended = true } else s.frame = a.loop
    }
  }

  private animate(s: Sprite): void {
    if (s.paused) return
    const a = this.animOf(s)
    if (!a || a.frames.length === 0) return
    s.t += s.speed
    const time = a.frames[s.frame]?.[1] ?? 1
    if (s.t >= time) { s.t -= time; this.stepFrame(s) }
  }

  // ── 그리기 ────────────────────────────────────────────────────────────────

  /**
   * 위 · 아래 화면을 그린다.
   * @param bg 배경 색 번호 판 (256×576 RGBA — 빨강 번호 · 초록 줄 · 알파)
   * @param atlas 스프라이트 아틀라스
   * @param reel 릴 자리 · 튕김 · 맨 위 칸 · 기호
   */
  draw(
    mainCtx: CanvasRenderingContext2D, subCtx: CanvasRenderingContext2D,
    bg: Uint8ClampedArray, atlas: CanvasImageSource, reelLayer: HTMLCanvasElement,
    reel: { pos: readonly number[], bounce: readonly number[], symbol: (reel: number, row: number) => number },
  ): void {
    // ── 위 화면 ──
    const rl = reelLayer.getContext('2d', { willReadFrequently: true })!
    rl.clearRect(0, 0, SCREEN_W, SCREEN_H)
    const cells = this.data.sets.reels?.cells ?? []
    for (let r = 0; r < 3; r++) {
      const cx = 68 + r * 60
      for (let k = 0; k < 5; k++) {
        const yraw = (reel.pos[r]! + k * 32) % 160
        const y = yraw + 16 + reel.bounce[r]!
        const sym = reel.symbol(r, Math.floor(yraw / 32))
        const c = cells[sym]
        if (!c) continue
        rl.drawImage(atlas, c[0], c[1], c[2], c[3], cx + c[4], y + c[5], c[2], c[3])
      }
    }
    const obj = rl.getImageData(0, 0, SCREEN_W, SCREEN_H).data
    const img = mainCtx.createImageData(SCREEN_W, SCREEN_H)
    const out = img.data
    const back = this.main[0]![0]!
    for (let y = 0; y < SCREEN_H; y++) {
      for (let x = 0; x < SCREEN_W; x++) {
        const o = (y * SCREEN_W + x) * 4
        let r5 = back & 31, g5 = (back >> 5) & 31, b5 = (back >> 10) & 31
        const hasObj = obj[o + 3]! > 0
        if (hasObj) { r5 = obj[o]! >> 3; g5 = obj[o + 1]! >> 3; b5 = obj[o + 2]! >> 3 }
        const i2 = (SCREEN_H * SCREEN_W + y * SCREEN_W + x) * 4
        if (bg[i2 + 3]! > 0) {
          const c = this.main[bg[i2 + 1]!]?.[bg[i2]!] ?? 0
          const cr = c & 31, cg = (c >> 5) & 31, cb = (c >> 10) & 31
          if (hasObj) {
            // `G2_SetBlendAlpha(BG2, OBJ, 8, 9)` — 5비트 채널마다 (위·8 + 아래·9) >> 4, 31에서 자른다
            r5 = Math.min(31, (cr * 8 + r5 * 9) >> 4)
            g5 = Math.min(31, (cg * 8 + g5 * 9) >> 4)
            b5 = Math.min(31, (cb * 8 + b5 * 9) >> 4)
          } else { r5 = cr; g5 = cg; b5 = cb }
        }
        const i1 = (y * SCREEN_W + x) * 4
        if (bg[i1 + 3]! > 0) {
          let row = bg[i1 + 1]!
          const tx = x >> 3, ty = y >> 3
          for (let b = 0; b < 3; b++) {
            const [bx, by] = BUTTON_RECTS[b]!
            if (tx >= bx && tx < bx + 3 && ty >= by && ty < by + 2) row = this.buttonRow[b]!
          }
          const c = this.main[row]?.[bg[i1]!] ?? 0
          r5 = c & 31; g5 = (c >> 5) & 31; b5 = (c >> 10) & 31
        }
        out[o] = up(r5); out[o + 1] = up(g5); out[o + 2] = up(b5); out[o + 3] = 255
      }
    }
    mainCtx.putImageData(img, 0, 0)
    // 숫자판 — CREDIT 다섯(앞 0은 숨긴다) · PAYOUT 다섯(0이면 없다) (`ov101_021D5AF0` · `_5C28`)
    this.digits(mainCtx, atlas, 'mainDigits', this.credit, 108, 180, 8, true)
    this.digits(mainCtx, atlas, 'mainDigits', this.payoutShown, 180, 180, 8, false)
    const sv = this.sevenShow
    if (sv && !sv.hidden && sv.y < 192) {
      const set = sv.symbol === SlotSymbol.SEVEN_A ? 'over14' : 'over17'
      const c = this.data.sets[set]?.cells[0]
      if (c) {
        for (let r = 0; r < 3; r++) {
          const y = 16 + 32 * sv.rows[r]! + sv.y
          mainCtx.drawImage(atlas, c[0], c[1], c[2], c[3], 68 + r * 60 + c[4], y + c[5], c[2], c[3])
        }
      }
    }

    // ── 아래 화면 ──
    const sub = subCtx.createImageData(SCREEN_W, SCREEN_H)
    const so = sub.data
    for (let i = 0; i < SCREEN_W * SCREEN_H; i++) {
      const i3 = (SCREEN_H * 2 * SCREEN_W + i) * 4
      const c = bg[i3 + 3]! > 0 ? this.sub[bg[i3 + 1]!]?.[bg[i3]!] ?? 0 : this.sub[0]![0]!
      so[i * 4] = up(c); so[i * 4 + 1] = up(c >> 5); so[i * 4 + 2] = up(c >> 10); so[i * 4 + 3] = 255
    }
    subCtx.putImageData(sub, 0, 0)
    const list = this.actors().map((a) => a.s).filter((s) => s.visible).sort((a, b) => b.prio - a.prio)
    for (const s of list) this.drawSprite(subCtx, atlas, s)
    if (sv && !sv.hidden && sv.y >= 192) {
      const set = sv.symbol === SlotSymbol.SEVEN_A ? 'over14' : 'over17'
      const c = this.data.sets[set]?.cells[0]
      if (c) {
        for (let r = 0; r < 3; r++) {
          const y = 16 + 32 * sv.rows[r]! + sv.y - 192
          subCtx.drawImage(atlas, c[0], c[1], c[2], c[3], 68 + r * 60 + c[4], y + c[5], c[2], c[3])
        }
      }
    }
    if (this.hud) {
      this.cell(subCtx, atlas, 'sub6', 0, 24, 8)
      this.cell(subCtx, atlas, 'sub7', 0, 200, 184)
      const left = Math.min(this.spinsLeft, 99)
      if (left >= 10) { this.cell(subCtx, atlas, 'subDigits8', Math.floor(left / 10), 52, 8); this.cell(subCtx, atlas, 'subDigits8', left % 10, 60, 8) }
      else this.cell(subCtx, atlas, 'subDigits8', left, 52, 8)
      const coins = String(Math.min(this.bonusCoins, 99999)).padStart(5, '0')
      for (let i = 0; i < 5; i++) this.cell(subCtx, atlas, 'subDigits8', Number(coins[i]), 220 + i * 8, 184)
    }
    if (this.streakDigits) {
      const t = String(this.streakDigits.value)
      const x0 = t.length === 3 ? 112 : t.length === 2 ? 120 : 128
      for (let i = 0; i < t.length; i++) this.cell(subCtx, atlas, 'subDigits9', Number(t[i]), x0 + i * 16, 32)
    }
    if (this.endBoard) {
      this.cell(subCtx, atlas, 'sub6', 0, 84, 112, 2)
      this.cell(subCtx, atlas, 'sub7', 0, 68, 80, 2)
      const s = String(this.endBoard.streak), c = String(this.endBoard.coins)
      for (let i = 0; i < s.length; i++) this.cell(subCtx, atlas, 'subDigits8', Number(s[s.length - 1 - i]), 200 - i * 16, 112, 2)
      for (let i = 0; i < c.length; i++) this.cell(subCtx, atlas, 'subDigits8', Number(c[c.length - 1 - i]), 200 - i * 16, 80, 2)
    }
  }

  private drawSprite(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, s: Sprite): void {
    const a = this.animOf(s)
    const f = a?.frames[s.frame]
    const cell = this.data.sets[s.set]?.cells[f?.[0] ?? 0]
    if (!cell) return
    ctx.save()
    ctx.translate(s.x + (f?.[2] ?? 0), s.y + (f?.[3] ?? 0))
    if (s.rot) ctx.rotate((s.rot / 65536) * Math.PI * 2)
    ctx.scale(s.hflip ? -s.scale : s.scale, s.scale)
    ctx.drawImage(atlas, cell[0], cell[1], cell[2], cell[3], cell[4], cell[5], cell[2], cell[3])
    ctx.restore()
  }

  /** 셀 하나를 그 자리에 (애니 없는 숫자 · 글자판) */
  private cell(ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, set: string, at: number, x: number, y: number, scale = 1): void {
    const c = this.data.sets[set]?.cells[at]
    if (!c) return
    ctx.drawImage(atlas, c[0], c[1], c[2], c[3], x + c[4] * scale, y + c[5] * scale, c[2] * scale, c[3] * scale)
  }

  private digits(
    ctx: CanvasRenderingContext2D, atlas: CanvasImageSource, set: string, value: number,
    onesX: number, y: number, step: number, keepOnes: boolean,
  ): void {
    let place = 1
    for (let i = 0; i < 5; i++, place *= 10) {
      const show = value >= place || (keepOnes && i === 0)
      if (!show) continue
      this.cell(ctx, atlas, set, Math.floor(value / place) % 10, onesX - i * step, y)
    }
  }
}
