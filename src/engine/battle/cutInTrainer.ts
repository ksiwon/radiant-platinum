// 트레이너 · 프런티어 · 더블 · 갤럭시 조무래기의 조우 컷인 (`overlay005/encounter_effect_core.c` EC:663-2123)
//
// 원작 표 `sEncounterEffectTaskFuncs`의 6~11 · 27 · 29 · 30번이다. 들판 여섯(0~5)과 같은 두 번 번쩍임으로 열고, 몬스터볼
// 스프라이트(`field_encounteffect.narc` 0 · 2~7)가 돌며 날고, 화면을 갈라 · 찢어 · 창 페이드로 닫는다:
//
//   6  풀숲 · 낮음   큰 공이 커지며 한 바퀴 → 위아래 두 조각으로 찢기(96줄 띠) · 공도 반으로 갈라 좌우로 · 카메라 −500
//   7  풀숲 · 높음   작은 공 둘이 엇갈려 두 바퀴 → 화면 가르기(왼위 · 오른아래 네모만 남는다) · 카메라 −500
//   8  물 · 낮음     물결(두 줄마다 뒤집기) · 큰 공이 반투명으로 들어와 한 바퀴 → 부풀었다 사라지며 가운데서 검은 네모가 자란다
//   9  물 · 높음     같은 물결 · 작은 공 셋이 솟으며 밑에서부터 검은 기둥 셋을 칠한다
//   10 굴 · 낮음     작은 공이 커지며 떨어지고 → 윗반원이 닫힌다 · 카메라 −1000
//   11 굴 · 높음     작은 공 셋이 떨어지고 → 32×32 칸 마흔여덟이 밑에서부터 한 칸씩 검어진다 · 카메라 −1000(64단 중 48)
//   27 갤럭시 조무래기  작은 공 여섯이 가운데로 모이며 작아진다 → X 닦기
//   29 프런티어      큰 공이 반투명으로 들어와 작아지며 → 원이 닫힌다
//   30 더블          작은 공 넷이 위 · 아래 · 좌 · 우로 흩어진다 → X 닦기
//
// **틱의 차례가 원작 태스크 그대로다**: 한 틱에 `switch` 한 칸(세우는 칸도 한 틱을 먹는다) → 그 뒤에 물체마다 보간 한 걸음 →
// 번쩍임 태스크 → 화면 페이드. 그래서 보간이 끝난 것은 **다음 틱의 `switch`가** 본다 — 끝나는 틱이 짐작이 아니라 세어져 나온다.
// 값은 원작 정수 셈이다(`cutInDs`). 스프라이트 자리는 DS 픽셀, 카메라는 원작 거리를 기본 팔(666.922)로 나눈 배율이다.
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)
import type { CutInDraw, CutInFrame, CutInSprite } from './encounterCutIn'
import { DsFlash, FX, fx, LinearFX, LinearS32, QuadFX, WindowFade } from './cutInDs'

/** 원작 필드 카메라 팔 (`CAMERA_TYPE_DEFAULT`) */
const ARM = 666.922119140625
const dollyOf = (units: number): number => Math.max(0.05, 1 + units / ARM)
const TURN = 0xffff
const BIG = 'ballBig', SMALL = 'ballSmall'

const empty = (): CutInDraw => ({ paint: [], sprites: [], mask: [], rows: null })
const frameOf = (): CutInFrame => ({
  flash: 0, slice: null, ripple: null, iris: 1, black: 0, dolly: 1, done: false, draw: empty(),
})
const allBlack = (): [number, number][][] => Array.from({ length: 192 }, () => [])

/** 한 컷인 — 틱마다 한 프레임 */
export interface SpecialCutIn { tick(): CutInFrame }

/** 번쩍임 · 끝 검정 · 틱 셈이 같은 뼈대 */
abstract class Base implements SpecialCutIn {
  protected state = 0
  protected flash: DsFlash | null = null
  protected fade: WindowFade | null = null
  protected f: CutInFrame = frameOf()
  protected dolly = 1
  protected sprites: CutInSprite[] = []
  private finished = false
  constructor(private readonly flashColor: number) {}
  tick(): CutInFrame {
    this.f = frameOf()
    if (this.finished) { this.f.black = 1; this.f.done = true; return this.f }
    // 0 자리 잡기 → 1 번쩍임 → 2 끝나기를 기다린다 (F24에 보고 3으로)
    if (this.state === 0) this.state = 1
    else if (this.state === 1) { this.flash = new DsFlash(this.flashColor, 2); this.state = 2 } else if (this.state === 2) {
      this.waiting()
      if (this.flash!.done) { this.opened(); this.state = 3 }
    } else this.step()
    if (!this.finished) this.after()
    this.flash?.tick()
    this.fade?.exec()
    this.f.flash = (this.flash?.value ?? 0) / 16
    this.f.draw!.sprites = this.sprites
    if (this.fade) this.f.draw!.rows = this.fade.rows()
    this.f.dolly = this.dolly
    if (this.finished) { this.f.black = 1; this.f.done = true }
    return this.f
  }
  /** 번쩍이는 동안 (`case 2`) */
  protected waiting(): void {}
  /** 번쩍임이 끝났다고 본 틱 */
  protected opened(): void {}
  /** 3번 칸부터 — `switch` 한 칸 */
  protected abstract step(): void
  /** `switch` 뒤의 물체 걸음 */
  protected after(): void {}
  /** 끝 — 두 화면을 검게 (`SetColorBrightness(BLACK)` · 또는 페이드 뒤 아래 화면) */
  protected finish(): void { this.finished = true }
}

/** 6 풀숲 · 낮음 (`EncounterEffect_Trainer_Grass_LowerLevel` · EC:663-825) */
class GrassLower extends Base {
  private scale: QuadFX | null = null
  private rot: LinearS32 | null = null
  private x: QuadFX | null = null
  private cam: QuadFX | null = null
  /** 찢기 태스크의 틱 — 세운 다음 틱부터 보간(7번), 그다음 틱에 끝 */
  private slice = -1
  constructor() { super(-16) }
  protected step(): void {
    switch (this.state) {
      case 3:
        this.scale = new QuadFX(fx(0.01), fx(1), 2, 10)
        this.rot = new LinearS32(0, TURN, 10)
        this.state = 4
        break
      case 4:
        if (this.scale!.update()) this.state = 5
        this.rot!.update()
        break
      case 5:
        this.x = new QuadFX(0, fx(255), fx(10), 6)
        this.cam = new QuadFX(0, fx(-500), fx(-10), 6)
        this.slice = 0
        this.state = 6
        break
      case 6:
        this.x!.update()
        this.cam!.update()
        this.dolly = dollyOf(this.cam!.value / FX)
        // 찢기의 끝 깃발은 마지막 보간 다음 틱에 서고(`ScreenSliceEffect_Finish`) 그다음 틱에 본다
        if (this.slice >= 9) this.state = 7
        break
      default: this.finish()
    }
  }
  protected after(): void {
    if (this.state < 4 || !this.scale) return
    if (this.x === null) {
      const k = this.scale.value / FX
      const r = this.rot!.value & 0xffff
      this.sprites = [
        { img: BIG, x: 128, y: 96, scaleX: k, scaleY: k, rot: r },
        { img: BIG, x: 128, y: 96, scaleX: k, scaleY: k, rot: (r - 0x100) & 0xffff },
      ]
      return
    }
    const X = this.x.value / FX
    this.sprites = [{ img: BIG, half: 'top', x: 128 - X, y: 96 }, { img: BIG, half: 'bottom', x: 128 + X, y: 96 }]
    // 찢기 (`ScreenSlice(96, 6, 0 → 255, 10)`) — 위 띠가 왼쪽 · 아래 띠가 오른쪽, 빈 자리는 검다. 끝나면 온통 검다
    if (this.slice >= 0) this.slice++
    this.f.slice = this.slice >= 9 ? { band: 0.5, offset: 1 } : { band: 0.5, offset: Math.floor(X) / 256 }
  }
}

/** 7 풀숲 · 높음 (EC:827-969) */
class GrassHigher extends Base {
  private x: LinearFX | null = null
  private rot: LinearS32 | null = null
  private sx: QuadFX | null = null
  private sy: QuadFX | null = null
  private cam: QuadFX | null = null
  private split = -1
  constructor() { super(16) }
  protected step(): void {
    switch (this.state) {
      case 3:
        this.x = new LinearFX(fx(-192), fx(192), 8)
        this.rot = new LinearS32(0, TURN * 2, 8)
        this.state = 4
        break
      case 4:
        if (this.x!.update()) this.state = 5
        this.rot!.update()
        break
      case 5:
        this.sx = new QuadFX(0, fx(255), fx(1), 8)
        this.sy = new QuadFX(0, fx(96), fx(1), 8)
        this.cam = new QuadFX(0, fx(-500), fx(-10), 8)
        this.split = 0
        this.state = 6
        break
      case 6:
        this.cam!.update()
        this.dolly = dollyOf(this.cam!.value / FX)
        if (this.split >= 11) this.state = 7
        break
      default: this.finish()
    }
  }
  protected after(): void {
    if (this.x) {
      const X = this.x.value / FX, r = this.rot!.value
      this.sprites = [{ img: SMALL, x: 128 - X, y: 64, rot: r & 0xffff }, { img: SMALL, x: 128 + X, y: 128, rot: -r & 0xffff }]
    }
    if (this.split < 0) return
    // 가르기 태스크 — 세운 다음 틱부터 9번 (`ScreenSplitEffect`), 그다음 틱에 끝
    this.split++
    if (this.split >= 2 && this.split <= 10) { this.sx!.update(); this.sy!.update() }
    if (this.split >= 11) { this.f.draw!.rows = allBlack(); return }
    const x = Math.floor(this.sx!.value / FX), y = Math.floor(this.sy!.value / FX)
    // 왼위 (0, 0, 255 − x, 96 − y) · 오른아래 (x, 96 + y, 255, 192)만 보인다
    this.f.draw!.rows = Array.from({ length: 192 }, (_, line) => (line <= 96
      ? (line < 96 - y ? [[0, 255 - x] as [number, number]] : [])
      : (line >= 96 + y ? [[x, 255] as [number, number]] : [])))
  }
}

/** 물결 — 두 줄마다 뒤집고 한 틱에 여덟 줄씩 흐른다 (`ScreenShakeEffect_Start(0, 191, 682, 12, 800 …)` + `InvertBuffer(2)`) */
class Shake {
  phase = 0
  started = -1
  tick(): void {
    // 흔들기 태스크(우선순위 4)는 건 다음 틱부터 돈다
    if (this.started >= 0) { if (this.started > 0) this.phase = (this.phase + 8) % 192; this.started++ }
  }
  frame(): CutInFrame['ripple'] {
    return this.started > 0 ? { amplitude: 12 / 256, cycles: 2, phase: this.phase, interleave: true } : null
  }
}

/** 8 물 · 낮음 (EC:971-1141) */
class WaterLower extends Base {
  private counter = 12
  private shake = new Shake()
  private alpha: LinearS32 | null = null
  private rot: LinearS32 | null = null
  private prevRot = 0
  private scale: QuadFX | null = null
  private cam: QuadFX | null = null
  constructor() { super(-16) }
  protected waiting(): void { if (--this.counter === 0) this.shake.started = 0 }
  protected step(): void {
    switch (this.state) {
      case 3:
        this.alpha = new LinearS32(0, 16, 8)
        this.rot = new LinearS32(0, TURN, 8)
        this.state = 4
        break
      case 4: {
        this.prevRot = this.rot!.value
        if (this.alpha!.update()) this.state = 5
        this.rot!.update()
        break
      }
      case 5:
        this.scale = new QuadFX(fx(1), fx(0.01), fx(0.1), 8)
        this.cam = new QuadFX(0, fx(-500), fx(-10), 8)
        this.fade = new WindowFade('box', 8)
        this.state = 6
        break
      case 6: {
        const done = this.scale!.update()
        this.cam!.update()
        this.dolly = dollyOf(this.cam!.value / FX)
        if (done && this.fade!.done) this.state = 7
        break
      }
      default: this.finish()
    }
  }
  protected after(): void {
    this.shake.tick()
    this.f.ripple = this.shake.frame()
    if (this.scale) {
      const k = this.scale.value / FX
      this.sprites = [{ img: BIG, x: 128, y: 96, scaleX: k, scaleY: k }, { img: BIG, x: 128, y: 96, scaleX: k, scaleY: k }]
    } else if (this.alpha) {
      const a = this.alpha.value / 16
      this.sprites = [{ img: BIG, x: 128, y: 96, rot: this.rot!.value & 0xffff, alpha: a }, { img: BIG, x: 128, y: 96, rot: this.prevRot & 0xffff, alpha: a }]
    }
  }
}

/** 9 물 · 높음 (EC:1143-1354) — 기둥 셋: 공 x · 돌림 방향 · 다음까지 기다림 (`case 3~5`의 `unk_2A0`) */
const WATER_COLUMNS = [{ x: 43, sign: 1, wait: 4 }, { x: 215, sign: -1, wait: 2 }, { x: 129, sign: 1, wait: 0 }] as const
class WaterHigher extends Base {
  private counter = 14
  private shake = new Shake()
  private launched = 0
  private cols: { ball: LinearS32, paint: LinearS32, rot: LinearS32, x: number, running: boolean }[] = []
  private paint: [number, number, number, number][] = []
  private cam: QuadFX | null = null
  constructor() { super(16) }
  protected waiting(): void { if (--this.counter === 0) this.shake.started = 0 }
  protected opened(): void { this.counter = 6 }
  protected step(): void {
    if (this.state === 3) {
      // `case 3 · 4 · 5` — 셈이 0 밑으로 내려간 틱에 기둥 하나 (F31 · F36 · F39)
      if (--this.counter >= 0) return
      const c = WATER_COLUMNS[this.launched]!
      if (this.launched === 0) this.cam = new QuadFX(0, fx(-500), fx(-10), 16)
      this.cols.push({ ball: new LinearS32(231, -32, 6), paint: new LinearS32(312, 0, 6), rot: new LinearS32(0, c.sign * TURN, 6), x: c.x, running: true })
      this.counter = c.wait
      if (++this.launched === 3) this.state = 4
    } else if (this.state === 4) {
      // `case 6` — 카메라는 여기서만 민다
      this.cam!.update()
      this.dolly = dollyOf(this.cam!.value / FX)
      if (this.cols.every((c) => !c.running)) this.state = 5
    } else this.finish()
  }
  protected after(): void {
    this.shake.tick()
    this.f.ripple = this.shake.frame()
    this.sprites = []
    for (const c of this.cols) {
      if (c.running) {
        // 86×64 칸을 가운데에 칠한다 — 안 지워서 자국이 쌓인다 (`ov5_021DE71C`)
        if (c.paint.update()) c.running = false
        this.paint.push([c.x - 43, c.paint.value - 32, 86, 64])
        c.ball.update()
        c.rot.update()
      }
      this.sprites.push({ img: SMALL, x: c.x, y: c.ball.value, rot: c.rot.value & 0xffff })
    }
    this.f.draw!.paint = this.paint
  }
}

/** 10 굴 · 낮음 (EC:1356-1479) */
class CaveLower extends Base {
  private y: QuadFX | null = null
  private scale: QuadFX | null = null
  private rot: LinearS32 | null = null
  private cam: QuadFX | null = null
  private shown = false
  constructor() { super(-16) }
  protected step(): void {
    switch (this.state) {
      case 3:
        this.y = new QuadFX(0, fx(256), fx(2), 12)
        this.scale = new QuadFX(fx(0.1), fx(2), 0, 12)
        this.rot = new LinearS32(0, TURN, 12)
        this.shown = true
        this.state = 4
        break
      case 4:
        if (this.y!.update()) { this.shown = false; this.state = 5 }
        this.scale!.update()
        this.rot!.update()
        break
      case 5:
        this.cam = new QuadFX(0, fx(-1000), fx(10), 8)
        this.fade = new WindowFade('topHalfCircle', 8)
        this.state = 6
        break
      case 6:
        this.cam!.update()
        this.dolly = dollyOf(this.cam!.value / FX)
        if (this.fade!.done) this.state = 7
        break
      default: this.finish()
    }
  }
  protected after(): void {
    if (!this.shown || !this.y) { this.sprites = []; return }
    const k = this.scale!.value / FX
    this.sprites = [{ img: SMALL, x: 128, y: -32 + this.y.value / FX, scaleX: k, scaleY: k, rot: this.rot!.value & 0xffff }]
  }
}

/** 11 굴 · 높음 (EC:1481-1692) — 공 셋 (`case 3~5` — 셈 0 · 1 · 3) · 칸 마흔여덟의 열 차례 */
const CAVE_BALLS = [{ x: 128, sign: 1, wait: 1 }, { x: 208, sign: -1, wait: 3 }, { x: 48, sign: 1, wait: 0 }] as const
const CELL_COLUMNS = [0, 2, 5, 7, 1, 6, 3, 4] as const
class CaveHigher extends Base {
  private counter = 0
  private launched = 0
  private balls: { y: LinearS32, rot: LinearS32, x: number, running: boolean }[] = []
  private calls = 0
  private cam: QuadFX | null = null
  constructor() { super(16) }
  protected opened(): void { this.counter = 0 }
  protected step(): void {
    if (this.state === 3) {
      if (--this.counter > 0) return
      const b = CAVE_BALLS[this.launched]!
      this.balls.push({ y: new LinearS32(-32, 224, 5), rot: new LinearS32(0, b.sign * TURN, 5), x: b.x, running: true })
      this.counter = b.wait
      if (++this.launched === 3) this.state = 4
    } else if (this.state === 4) {
      if (this.balls.every((b) => !b.running)) { this.balls = []; this.state = 5 }
    } else if (this.state === 5) {
      this.cam = new QuadFX(0, fx(-1000), fx(10), 64)
      this.state = 6
    } else if (this.state === 6) {
      this.cam!.update()
      this.dolly = dollyOf(this.cam!.value / FX)
      // 부를 때마다 한 칸 (`ov5_021DE988`) — 49번째 부름이 참
      if (++this.calls >= 49) this.state = 7
    } else this.finish()
  }
  protected after(): void {
    this.sprites = []
    for (const b of this.balls) {
      if (b.running) {
        if (b.y.update()) b.running = false
        b.rot.update()
      }
      this.sprites.push({ img: SMALL, x: b.x, y: b.y.value, rot: b.rot.value & 0xffff })
    }
    // 새 칸은 화면 밖에서 시작해 두 번째 부름에 제자리에 선다 — 밑 줄부터
    for (let k = 0; k < Math.min(48, this.calls - 1); k++) {
      this.f.draw!.paint.push([CELL_COLUMNS[k % 8]! * 32, 160 - Math.floor(k / 8) * 32, 32, 32])
    }
  }
}

/** 29 프런티어 (EC:1710-1821) */
class Frontier extends Base {
  private alpha: LinearS32 | null = null
  private scale: QuadFX | null = null
  constructor() { super(16) }
  protected step(): void {
    switch (this.state) {
      case 3: this.alpha = new LinearS32(0, 16, 12); this.state = 4; break
      case 4: if (this.alpha!.update()) this.state = 5; break
      case 5:
        this.scale = new QuadFX(fx(1), fx(0.1), 1, 6)
        this.fade = new WindowFade('circle', 6)
        this.state = 6
        break
      case 6: if (this.scale!.update() && this.fade!.done) this.state = 7; break
      default: this.finish()
    }
  }
  protected after(): void {
    if (this.scale) {
      const k = this.scale.value / FX
      this.sprites = [{ img: BIG, x: 128, y: 96, scaleX: k, scaleY: k }]
    } else if (this.alpha) this.sprites = [{ img: BIG, x: 128, y: 96, alpha: this.alpha.value / 16 }]
  }
}

/** 30 더블 (EC:1823-1940) */
class Double extends Base {
  private a: QuadFX | null = null
  private b: QuadFX | null = null
  constructor() { super(16) }
  protected step(): void {
    switch (this.state) {
      case 3:
        this.a = new QuadFX(0, fx(128), fx(0.1), 4)
        this.b = new QuadFX(0, fx(160), fx(0.1), 4)
        this.state = 4
        break
      case 4: if (this.a!.update()) this.state = 5; this.b!.update(); break
      case 5: this.fade = new WindowFade('x', 8); this.state = 6; break
      case 6: if (this.fade!.done) this.state = 7; break
      default: this.finish()
    }
  }
  protected after(): void {
    if (!this.a) return
    const A = this.a.value / FX, B = this.b!.value / FX
    this.sprites = [
      { img: SMALL, x: 128, y: 96 - A }, { img: SMALL, x: 128, y: 96 + A },
      { img: SMALL, x: 128 - B, y: 96 }, { img: SMALL, x: 128 + B, y: 96 },
    ]
  }
}

/** 27 갤럭시 조무래기 (EC:1942-2123 · `Unk_ov5_021F9E94`) — {x0, x1, vx, y0, y1, vy, 기다림, 돌림(바퀴)} */
const GRUNT_ROWS = [
  [260, 128, -30, 0, 100, 20, 4, 2], [-16, 128, 30, 160, 100, -20, 3, 1], [0, 128, 30, -16, 100, 20, 4, -3],
  [140, 128, -10, 160, 100, -20, 2, -2], [260, 128, -30, 80, 100, 1, 3, -3], [0, 128, 30, 160, 100, -20, 3, 1],
] as const
class GalacticGrunt extends Base {
  private delay = 0
  private launched = 0
  private balls: { x: QuadFX, y: QuadFX, scale: QuadFX, rot: LinearS32, running: boolean }[] = []
  constructor() { super(-16) }
  protected opened(): void { this.delay = GRUNT_ROWS[0]![6] }
  protected step(): void {
    switch (this.state) {
      case 3: {
        if (--this.delay >= 0) break
        const [x0, x1, vx, y0, y1, vy, , turns] = GRUNT_ROWS[this.launched]!
        this.balls.push({
          x: new QuadFX(fx(x0), fx(x1), fx(vx), 8), y: new QuadFX(fx(y0), fx(y1), fx(vy), 8),
          scale: new QuadFX(fx(2), fx(0.01), fx(-0.4), 8), rot: new LinearS32(0, turns * TURN, 8), running: true,
        })
        this.delay = GRUNT_ROWS[++this.launched]?.[6] ?? 0
        if (this.launched === 6) this.state = 4
        break
      }
      case 4: if (!this.balls[5]!.running) this.state = 5; break
      case 5: this.fade = new WindowFade('x', 12); this.state = 6; break
      case 6: if (this.fade!.done) this.state = 7; break
      default: this.finish()
    }
  }
  protected after(): void {
    this.sprites = []
    for (const b of this.balls) {
      if (!b.running) continue
      if (b.x.update()) b.running = false
      b.y.update(); b.scale.update(); b.rot.update()
      const k = b.scale.value / FX
      if (b.running) this.sprites.push({ img: SMALL, x: b.x.value / FX, y: b.y.value / FX, scaleX: k, scaleY: k, rot: b.rot.value & 0xffff })
    }
  }
}

/** 원작 번호 → 컷인 (6~11 · 27 · 29 · 30). 없는 번호면 null */
export function trainerCutIn(effect: number): SpecialCutIn | null {
  switch (effect) {
    case 6: return new GrassLower()
    case 7: return new GrassHigher()
    case 8: return new WaterLower()
    case 9: return new WaterHigher()
    case 10: return new CaveLower()
    case 11: return new CaveHigher()
    case 27: return new GalacticGrunt()
    case 29: return new Frontier()
    case 30: return new Double()
    default: return null
  }
}
