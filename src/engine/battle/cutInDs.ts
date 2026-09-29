// 조우 컷인이 함께 쓰는 원작 셈 — fx32 보간 · 번쩍임 · 창 페이드 (`overlay005/encounter_effect.c` · `screen_fade_funcs.c`)
//
// 트레이너 · 관장 · 사천왕 · 갤럭시 · 전설 컷인(`cutInTrainer` · `cutInBanner`)이 이것을 쓴다. 들판 여섯(`encounterCutIn`)은 먼저 만든
// 소수 보간을 그대로 쓴다.
//
// 틱 차례는 원작 본 루프다: 효과 태스크 → (같은 우선순위로 뒤에 걸린) 번쩍임 태스크 → V블랭크 → 화면 페이드(`ExecScreenFade`).
// 새로 건 태스크는 **다음 틱부터** 돈다(`sys_task_manager.c:140-165`).
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)
import type { CutInSprite } from './encounterCutIn'

/** `FX_Mul` — 반올림 (`+0x800 >> 12`) */
export const fxMul = (a: number, b: number): number => Math.floor((a * b + 0x800) / 4096)
/** `FX_Div` — 반올림 */
export const fxDiv = (a: number, b: number): number => Math.round((a * 4096) / b)
export const FX = 4096
/** `FX32_CONST` */
export const fx = (v: number): number => Math.trunc(v * FX + (v >= 0 ? 0.5 : -0.5))

/** `LinearInterpolationTaskS32` — n+1번 부르고, 첫 값이 시작이다 */
export class LinearS32 {
  private t = 0
  value: number
  constructor(private readonly start: number, private readonly end: number, private readonly n: number) { this.value = start }
  update(): boolean {
    this.value = this.start + Math.trunc(((this.end - this.start) * this.t) / this.n)
    if (this.t >= this.n) return true
    this.t++
    return false
  }
}

/** `LinearInterpolationTaskFX32` */
export class LinearFX {
  private t = 0
  value: number
  constructor(private readonly start: number, private readonly end: number, private readonly n: number) { this.value = start }
  update(): boolean {
    this.value = this.start + fxDiv(fxMul(this.end - this.start, this.t * FX), this.n * FX)
    if (this.t >= this.n) return true
    this.t++
    return false
  }
}

/** `QuadraticInterpolationTaskFX32` — 처음 속도 v0로 n번째에 끝값에 닿는다 */
export class QuadFX {
  private t = 0
  private readonly a: number
  value: number
  constructor(private readonly start: number, end: number, private readonly v0: number, private readonly n: number) {
    this.value = start
    this.a = fxDiv(fxMul(end - start - fxMul(v0, n * FX), 2 * FX), n * n * FX)
  }
  update(): boolean {
    const t = this.t
    this.value = this.start + fxMul(this.v0, t * FX) + fxDiv(fxMul(this.a, t * t * FX), 2 * FX)
    if (t >= this.n) return true
    this.t++
    return false
  }
}

/**
 * 번쩍임 (`EncounterEffect_Flash(SCREEN_TOP, c, −16, …, n)` · EE:200-273) — 위 화면 밝기(−16~16).
 * 거는 틱에는 안 돈다. 한 번에 [켜기 · 0 → c 네 틱 · 켜기 · c → 0 네 틱], n번 뒤 끝내기 틱에 `done`
 */
export class DsFlash {
  private state = 0
  private count = 0
  private task: LinearS32 | null = null
  private born = true
  value = 0
  done = false
  constructor(private readonly c: number, private readonly n: number) {}
  tick(): void {
    if (this.born) { this.born = false; return }
    switch (this.state) {
      case 0: this.state = 1; break // 아래 화면 페이드를 건다 — 우리는 화면이 하나다
      case 1: this.task = new LinearS32(0, this.c, 3); this.state = 2; break
      case 2: if (this.task!.update()) this.state = 3; this.value = this.task!.value; break
      case 3: this.task = new LinearS32(this.c, 0, 3); this.state = 4; break
      case 4:
        if (this.task!.update()) { this.count++; this.state = this.count >= this.n ? 5 : 1 }
        this.value = this.task!.value
        break
      default: this.done = true
    }
  }
}

/** 창 페이드의 모양 (`screen_fade_funcs.c`) */
type WindowFadeKind = 'circle' | 'topHalfCircle' | 'box' | 'x'

/** 한 줄의 보이는 칸 */
type Spans = [number, number][]

/**
 * 창 페이드 (`StartScreenFade(FADE_MAIN_ONLY, …)`) — 거는 틱에 첫 단이 돈다. 칸을 다 닫은 뒤 한 틱 더 가서 풀리고, 그다음 틱에
 * 끝났다고 본다(`IsScreenFadeDone`). X 닦기(`UNK_34`)는 한 단이 더 길다
 */
export class WindowFade {
  k = 0
  constructor(readonly kind: WindowFadeKind, readonly n: number) {}
  /** `ExecScreenFade` — 효과 태스크 뒤에 한 번 */
  exec(): void { this.k++ }
  get done(): boolean { return this.k >= this.n + (this.kind === 'x' ? 2 : 1) }
  get black(): boolean { return this.k >= (this.kind === 'x' ? this.n + 1 : this.n) }
  /** 보이는 칸 — 줄마다 (검으면 빈 줄) */
  rows(): Spans[] | null {
    if (this.k === 0) return null
    if (this.black) return Array.from({ length: 192 }, () => [])
    const rows: Spans[] = []
    const k = this.k
    if (this.kind === 'circle' || this.kind === 'topHalfCircle') {
      const top = this.kind === 'topHalfCircle'
      const r = top ? 512 - 64 * k : Math.trunc((256 * 128 + k * Math.trunc((-256 * 128) / this.n)) / 128)
      const cy = top ? 288 : 96
      for (let y = 0; y < 192; y++) {
        const dy = Math.abs(y - cy)
        if (dy >= r) { rows.push([]); continue }
        const half = Math.floor(Math.sqrt(r * r - dy * dy))
        const x1 = Math.max(0, 128 - half)
        rows.push([[x1, Math.min(255, x1 + 2 * half)]])
      }
      return rows
    }
    if (this.kind === 'box') {
      // 가운데에서 자라는 검은 네모 — 안이 검다 (`sub_0200FCDC`)
      const x1 = 128 - Math.trunc((128 * k) / this.n), x2 = 128 + Math.trunc((128 * k) / this.n) - 1
      const y1 = 96 - Math.trunc((96 * k) / this.n), y2 = 96 + Math.trunc((96 * k) / this.n)
      for (let y = 0; y < 192; y++) rows.push(y >= y1 && y < y2 ? [[0, x1], [x2 + 1, 256]] : [[0, 256]])
      return rows
    }
    // X 닦기 (`sub_0200FF30`) — 45°로 닫히는 대각 쐐기 넷
    const a = Math.trunc((8191 * k) / this.n) / 65536 * Math.PI * 2
    const t1 = Math.tan(a), t2 = Math.tan(Math.PI / 2 - a)
    const half: Spans[] = []
    for (let v = 0; v < 96; v++) {
      const d = 96 - v
      const v3 = Math.min(127, Math.floor(t1 * d)), v4 = Math.min(127, Math.floor(t2 * d))
      half.push(v4 > v3 ? [[128 - v4, 128 - v3], [128 + v3, 128 + v4]] : [])
    }
    for (let y = 0; y < 192; y++) rows.push(y < 96 ? half[y]! : half[191 - y]!)
    return rows
  }
}

/**
 * 밝기 페이드 (`StartScreenFade(FADE_MAIN_ONLY, FADE_TYPE_BRIGHTNESS_OUT, …, 색, n, 1)` · `screen_fade_funcs.c` `sub_02010238` ·
 * `sub_02010318`) — 거는 틱에 0을 세우고, 다음 틱부터 한 단에 `trunc(16 × 128 ÷ n)`씩 (÷ 128로 내림) 오르다 n번째 단에 끝값.
 * 그다음 틱에 풀리고(`IsScreenFadeDone`) 그 뒤 틱의 `switch`가 본다
 */
export class BrightnessFade {
  private k = 0
  private acc: number
  value: number
  /** `from`은 `BRIGHTNESS_IN`의 시작 밝기다(흰색이면 16에서 0으로) */
  constructor(private readonly target: number, private readonly n: number, private readonly from = 0) {
    this.acc = from * 128
    this.value = from
  }
  exec(): void {
    this.k++
    if (this.k === 1) return
    if (this.k <= this.n) this.acc += Math.trunc(((this.target - this.from) * 128) / this.n)
    else this.acc = this.target * 128
    this.value = Math.trunc(this.acc / 128)
  }
  get done(): boolean { return this.k >= this.n + 2 }
}

/** VS 표 넷 (`ov5_021E5128` · `ov5_021E51B4`) — 테두리 셋이 2배에서 1배로 줄며 세 틱마다 하나씩, 넷째(속 찬 것)는 1배 */
export class VsStamp {
  private readonly scale = [0, 1, 2, 3].map((i) => new LinearFX(fx(i < 3 ? 2 : 1), fx(1), 6))
  private delay = 0
  count = 0
  constructor(private readonly x: number, private readonly y: number) {}
  /** 한 번 부른다 — 넷 다 제 크기면 참 */
  step(): boolean {
    let all = true
    if (this.count < 4) {
      all = false
      if (--this.delay <= 0) { this.delay = 3; this.count++ }
    }
    for (let i = 0; i < this.count; i++) if (!this.scale[i]!.update()) all = false
    return all
  }
  /** 목록 앞이 위 — 먼저 선 것이 앞이다 */
  sprites(): CutInSprite[] {
    return this.scale.slice(0, this.count).map((s, i) => {
      const k = s.value / FX
      return { img: i < 3 ? 'vsOutline' : 'vsSolid', x: this.x, y: this.y, scaleX: k, scaleY: k }
    })
  }
}
