// 배틀팩토리에서 배틀로 넘어가는 두 연출 (`overlay104/frscrcmd.c` · `ov104_0223DC7C.c`)
//
// 시설 안의 배틀은 필드의 조우 컷인을 안 거친다 — 시설 스크립트가 제 명령으로 곡을 틀고 화면을 닫는다
// (`frontier_scripts_battle_factory.s` `_0A41`):
//
//   보통 상대   `FrontierScrCmd_3F 3` — 트레이너 곡 · 흰 번쩍임 두 번 → 배경 판이 두 줄 띠마다 제 속도로 밀리며(`ov104_02231720`)
//               마흔 틱에 검어진다
//   수철        `FrontierScrCmd_47 2` — 프런티어 브레인 곡 · 흰 번쩍임 → 띠가 가운데 줄(y 80)에서 위아래로 열리고 → VS 표 넷 →
//               검은 얼굴이 오른쪽에서 (208, 80)으로 → 흰 번쩍임에 제 색 · 방과 사람이 14/16 어두워지며 이름 → 희게 닫힌다
//
// ⚠️ **띠는 줄마다 「볼 줄」을 적는다.** 배경 판이 아핀 확장 BG라 H블랭크에 기준점(`BGxX · BGxY`)을 다시 쓰면 그 줄은 **적은 그 줄을**
// 그린다(줄 번호가 안 더해진다). 그래서 첫 틱에 방 그림 윗줄(0~12)이 가운데에서 위아래로 늘어나 보이고 틱마다 더 벌어진다 —
// 같은 표의 다음 칸(`ov104_02231864`)이 둘째 틱에 제 그림으로 돌아오는 것이 그 셈을 확인해 준다. 음수 줄은 부호를 뗀다(모드 1).
// 원작은 세로 자리를 `Bg_GetXOffset2`로 읽는다(가로 자리를 두 번 읽는 원작 실수) — 방에서는 둘 다 0이다.
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)
import type { CutInDraw, CutInSprite } from '../battle/encounterCutIn'
import { BrightnessFade, DsFlash, VsStamp } from '../battle/cutInDs'

/** 한 틱의 모습 */
export interface FactoryTransitionFrame {
  /** 화면 밝기 −1~1 — 양수가 흰색 */
  flash: number
  /** 배경 판(BG2 · BG3)의 두 줄 띠 아흔여섯 — 띠마다 보는 가로 자리 · 볼 줄. 없으면 제자리 */
  bands: { x: Int16Array, y: Int16Array } | null
  /** 배경 · 사람이 검어진 몫 0~1 (`BrightnessController_StartTransition(40, −16, …)`) */
  dim: number
  /** 브레인 컷인의 그림 (DS 좌표) */
  draw: CutInDraw | null
  done: boolean
}

const BANDS = 192 / 2

/** `FrontierScrCmd_3F 3` → `ov104_02231720` — 보통 상대 */
export class FactoryBattleWipe {
  private state = 0
  private flash: DsFlash | null = null
  private dimStep = -1
  private readonly dx = new Int16Array(BANDS)
  private readonly dy = new Int16Array(BANDS)
  private readonly ax = new Int16Array(BANDS)
  private readonly ay = new Int16Array(BANDS)
  private bandsOn = false
  private bandTicks = -1

  constructor() {
    for (let v = 0; v < BANDS; v++) {
      // `((96 / 2 − v) + 1) % 8` · `/ 4` — C의 나머지 · 나눗셈은 0 쪽으로 자른다(JS와 같다)
      this.dx[v] = (BANDS / 2 - v + 1) % 8
      this.dy[v] = Math.trunc((BANDS / 2 - v + 1) / 4)
    }
  }

  tick(): FactoryTransitionFrame {
    switch (this.state) {
      case 0:
        this.flash = new DsFlash(16, 2)
        this.state = 1
        break
      case 1:
        if (!this.flash!.done) break
        this.dimStep = 0
        this.bandsOn = true
        this.state = 2
        break
      case 2:
        if (this.dimStep >= 40) this.state = 3
        break
      default:
        return { flash: 0, bands: null, dim: 1, draw: null, done: true }
    }
    // 띠 태스크(건 다음 틱부터) · 번쩍임 태스크 · 밝기
    if (this.bandsOn) {
      if (this.bandTicks >= 0) {
        for (let v = 0; v < BANDS; v++) { this.ax[v] += this.dx[v]!; this.ay[v] += this.dy[v]! }
      }
      this.bandTicks++
    }
    this.flash?.tick()
    if (this.dimStep >= 0 && this.dimStep < 40 && this.state === 2) this.dimStep++
    let bands: FactoryTransitionFrame['bands'] = null
    if (this.bandsOn && this.bandTicks > 0) {
      const x = new Int16Array(BANDS), y = new Int16Array(BANDS)
      for (let v = 0; v < BANDS; v++) {
        let px = this.ax[v]!
        if (px < 0) px += 256
        x[v] = px % 256
        y[v] = Math.abs(this.ay[v]!)
      }
      bands = { x, y }
    }
    return {
      flash: (this.flash?.value ?? 0) / 16,
      bands,
      dim: this.dimStep < 0 ? 0 : Math.trunc((16 * this.dimStep) / 40) / 16,
      draw: null,
      done: false,
    }
  }
}

/** 수철 (`sFrontierBrainsEncounterParams[1]` — 트레이너 이름 뱅크의 `factory_head_thorton`) */
const BRAIN = { mug: 'factoryHead', banner: 'factoryHeadBanner' } as const
/** 띠가 열리는 가운데 줄과 반 높이 (`(10 × 8)` · `(8 × 8 + 4) / 2`) */
const BAND_MID = 80, BAND_HALF = 34

/** `FrontierScrCmd_47 2` → `ov104_0223DDE4` — 팩토리헤드 */
export class BrainIntro {
  private state = 0
  private counter = 0
  private fade: BrightnessFade | null = null
  private ticks = 0
  private win: { top: number, bottom: number, stage: number } | null = null
  private winFlag = false
  private readonly vs = new VsStamp(72, 82)
  private vsOn = false
  private mugX: number | null = null
  private mugStage = 0
  private lit = false

  constructor(private readonly name: string) {}

  tick(): FactoryTransitionFrame {
    this.step()
    if (this.state > 18) return { flash: 1, bands: null, dim: 0, draw: null, done: true }
    // 띠의 팔레트 돌리기(`ov104_0223E6BC`) · 창 태스크(`ov104_0223E740`)는 효과 태스크 뒤에 돈다
    this.ticks++
    if (this.win) {
      // 건 틱에는 안 돈다
      if (this.win.stage === -1) this.win.stage = 0
      else if (this.win.stage === 0) {
        this.win.top -= 8
        this.win.bottom += 8
        if (this.win.top <= BAND_MID - BAND_HALF) { this.win.top = BAND_MID - BAND_HALF; this.win.bottom = BAND_MID + BAND_HALF; this.win.stage = 1 }
      } else this.winFlag = true
    }
    this.fade?.exec()
    return { flash: (this.fade?.value ?? 0) / 16, bands: null, dim: 0, draw: this.compose(), done: false }
  }

  private step(): void {
    switch (this.state) {
      case 0: this.state = 1; break
      case 1: this.fade = new BrightnessFade(16, 3); this.state = 2; break
      case 2: if (this.fade!.done) this.state = 3; break
      case 3: this.fade = new BrightnessFade(0, 3, 16); this.state = 4; break
      case 4: if (this.fade!.done) this.state = 5; break
      case 5:
        // 창 태스크는 다음 틱부터 돈다 — 그때까지는 높이 0이다
        this.win = { top: BAND_MID, bottom: BAND_MID, stage: -1 }
        this.state = 6
        break
      case 6:
        if (this.winFlag) { this.state = 7; this.counter = 10 }
        break
      case 7:
        if (--this.counter >= 0) break
        this.vsOn = true
        if (this.vs.step()) this.state = 8
        break
      case 8: this.state = 9; break
      case 9:
        // `ov104_0223E804` — 256에서 한 틱에 15픽셀(3840 ÷ 256)씩 208까지
        if (this.mugStage === 0) { this.mugX = 256; this.mugStage = 1 } else if (this.mugStage === 1) {
          this.mugX = Math.max(208, this.mugX! - 15)
          if (this.mugX === 208) this.mugStage = 2
        } else this.state = 10
        break
      case 10: this.counter = 10; this.state = 11; break
      case 11:
        if (--this.counter >= 0) break
        this.fade = new BrightnessFade(16, 3)
        this.state = 12
        break
      case 12:
        if (this.fade!.done) { this.lit = true; this.state = 13 }
        break
      case 13: this.fade = new BrightnessFade(0, 3, 16); this.state = 14; break
      case 14: if (this.fade!.done) { this.counter = 26; this.state = 15 } break
      case 15: if (--this.counter < 0) this.state = 16; break
      case 16: this.fade = new BrightnessFade(16, 15); this.state = 17; break
      case 17: if (this.fade!.done) this.state = 18; break
      default: this.state = 19
    }
  }

  private compose(): CutInDraw {
    const draw: CutInDraw = { paint: [], sprites: [], mask: [], rows: null }
    if (this.win) {
      const { top, bottom } = this.win
      // 창 둘(0~255 · 1~0이 줄 전체)의 안에서만 BG1(띠)이 보인다
      draw.banner = {
        img: `${BRAIN.banner}${String(this.ticks % 8)}`,
        scroll: 0,
        reveal: Array.from({ length: 192 }, (_, y) => (y >= top && y < bottom ? 0 : 256)),
      }
    }
    const sprites: CutInSprite[] = []
    if (this.vsOn) {
      sprites.push(...this.vs.sprites().map((s) => ({ ...s, img: s.img === 'vsSolid' ? 'frontierVsSolid' : 'frontierVsOutline', front: true })))
    }
    if (this.mugX !== null) sprites.push({ img: BRAIN.mug, x: this.mugX, y: 80, dark: this.lit ? 0 : 14 / 16, front: true })
    draw.sprites = sprites
    if (this.lit) {
      draw.darken = 14 / 16
      draw.name = { text: this.name, x: 208 - 92, y: 11 * 8 - 8, w: 88 }
    }
    return draw
  }
}
