// 관장 · 갤럭시 간부의 조우 컷인 (`overlay005/encounter_effect_core.c` EC:2125-2251 · EC:2767-3126)
//
// 원작 표 `sEncounterEffectTaskFuncs`의 12~19 · 28번이다:
//
//   12~19 관장   흰 번쩍임 한 번 → 띠(BG3)가 오른쪽에서 톱니 창으로 드러나며 왼쪽으로 흐른다(한 틱 30px) → VS 표 넷이
//                (72, 74)에 차례로 앉고 → 검은 그림자 얼굴이 오른쪽에서 들어와 (214, 66)에 선다 → 흰 번쩍임에 얼굴이 제 색이 되고
//                3D가 어두워지며(`G2_SetBlendBrightness(BG0 | BD, −14)`) 이름이 뜬다 → 스물일곱 틱 뒤 희게 닫힌다
//   28    갤럭시 간부 · 보스   흰 번쩍임 두 번 → 「G」가 반투명으로 들어와 → 모자이크가 굵어지며 가운데 띠와 날개 여덟이 검게 닫는다
//   25    환상   흰 번쩍임 한 번 → 잔상(새 3 · 앞 15)을 켜고 카메라를 열여섯 번 홱홱 돌려 세운다 → 열 단에 희게
//   26    전설   흰 번쩍임 한 번 → 잔상(새 5 · 앞 13) · 화각이 마흔 틱에 걸쳐 0x100 넓어지고 → 카메라가 겨눔점으로 돌진 → 예순 단에 희게
//
// 카메라 값은 원작 절대값을 **기본 카메라에서 옮긴 만큼**으로 바꿔 싣는다 — 기본은 거리 0x29AEC1 · 각 (0xD602, 0) · 반화각 0x5C1이고
// (`field_camera.c`의 `CAMERA_TYPE_DEFAULT`) 표의 거리는 열여섯 다 그 기본값이다. 각은 도, 화각은 반각 tan의 비(확대율)다.
//
// 뼈대와 틱 차례는 트레이너 컷인과 같다(`cutInTrainer`의 `CutInBase`). V블랭크 뒤 태스크(창 톱니 · 밝기)는 효과 태스크 뒤,
// 화면 페이드 앞에서 돈다 — 그 틱의 그림에 바로 선다.
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)
import { CutInBase, type SpecialCutIn } from './cutInTrainer'
import type { CutInSprite } from './encounterCutIn'
import { BrightnessFade, FX, fx, fxDiv, fxMul, LinearS32, QuadFX, VsStamp } from './cutInDs'
import type { SplFile } from './spl/resource'
import { cosIdx, sinIdx } from './spl/fx'

/** 컷인이 화면에 적는 것 — 이름은 롬 트레이너 이름이다 (`EncounterEffect_GetGymLeaderName` · `TEXT_BANK_UNK_0359` 0번 = 이름 하나) */
export interface CutInContext {
  /** 트레이너 번호 → 이름 */
  trainerName(id: number): string
  /** 주인공 성별 — 0 남 · 1 여 (`TrainerInfo_Gender`) */
  playerGender: number
  /** 사천왕전의 입자 (1 · 2 = `elite_particle_1 · 2`) — 못 받았으면 null이고 입자 없이 돈다 */
  particles(n: 1 | 2): SplFile | null
}

/** 관장 여덟의 트레이너 번호 (`sGymLeaderEncounterParams` · EC:2607) — 이름이 여기서 온다 */
const LEADER_TRAINER = [246, 315, 316, 317, 318, 319, 250, 320] as const
/** 띠를 드러내는 톱니 (`ov5_021DED20(…, 6, 8, 16, …)`) — 여덟 줄마다 0→14 · 16→2로 오르내린다 */
const TEETH = Array.from({ length: 192 }, (_, y) => {
  const v = Math.trunc(((y % 8) * 16) / 8)
  return Math.trunc(y / 8) % 2 === 0 ? v : 16 - v
})
/** 띠가 서는 줄 (BG 배치의 5~12줄) */
const BANNER_TOP = 40, BANNER_ROWS = 64

/** 12~19 관장 (`EncounterEffect_GymLeader` · EC:2895-3126) */
class GymLeader extends CutInBase {
  private wipe: LinearS32 | null = null
  /** 톱니 창 — 건 틱에 H블랭크가 서고(값 255) 다음 틱부터 보간, 끝난 다음 틱에 창을 끈다 */
  private wipeStage: 'none' | 'run' | 'end' | 'off' = 'none'
  private wipeTicked = false
  private hblankFlag = false
  private scrolling = false
  private scroll = 0
  private counter = 0
  private readonly vs = new VsStamp(72, 74)
  private vsOn = false
  private x: QuadFX | null = null
  private bri: LinearS32 | null = null
  private lit = false
  private whiteOut: BrightnessFade | null = null
  constructor(private readonly leader: number, private readonly name: string) {
    super(16, 1)
    this.endWhite = true
  }
  protected step(): void {
    switch (this.state) {
      case 3:
        this.wipe = new LinearS32(255, 0, 6)
        this.wipeStage = 'run'
        this.scrolling = true
        this.state = 4
        break
      case 4:
        if (this.hblankFlag) { this.state = 5; this.counter = 10 }
        break
      case 5:
        if (--this.counter >= 0) break
        this.vsOn = true
        if (this.vs.step()) this.state = 6
        break
      case 6:
        this.x = new QuadFX(fx(272), fx(214), fx(-64), 4)
        this.state = 7
        break
      case 7:
        if (this.x!.update()) this.state = 8
        break
      case 8:
        this.bri = new LinearS32(0, 16, 3)
        this.counter = 10
        this.state = 9
        break
      case 9: {
        if (--this.counter >= 0) break
        const done = this.bri!.update()
        this.bright = this.bri!.value
        // 얼굴이 제 색 · 3D와 바탕이 14/16 어두워진다 · 이름 판(BG2)이 −(214 − 92) = −122만큼 밀려 x 122에 선다
        if (done) { this.lit = true; this.state = 10 }
        break
      }
      case 10:
        this.bri = new LinearS32(16, 0, 3)
        this.state = 11
        break
      case 11:
        if (this.bri!.update()) { this.state = 12; this.counter = 26 }
        this.bright = this.bri!.value
        break
      case 12:
        if (--this.counter < 0) this.state = 13
        break
      case 13:
        this.whiteOut = new BrightnessFade(16, 15)
        this.state = 14
        break
      case 14:
        if (this.whiteOut!.done) this.state = 15
        break
      default: this.finish()
    }
  }
  protected after(): void {
    const draw = this.f.draw!
    // V블랭크 뒤의 톱니 창 (`ov5_021DEE24` · `ov5_021DEE84`)
    let reveal: number[] | null = null
    if (this.wipeStage === 'end') {
      this.hblankFlag = true
      this.wipeStage = 'off'
    } else if (this.wipeStage === 'run') {
      // 건 틱의 H블랭크는 처음 값(255)을 쓴다 — 보간은 다음 틱부터고, 끝값(0)을 낸 틱에도 창은 아직 선다
      if (this.wipeTicked && this.wipe!.update()) this.wipeStage = 'end'
      this.wipeTicked = true
      const cur = this.wipe!.value
      reveal = Array.from({ length: BANNER_ROWS }, (_, r) => Math.max(0, cur - TEETH[BANNER_TOP + r]!))
    }
    if (this.scrolling) {
      draw.banner = { img: `leader${String(this.leader)}Banner`, scroll: this.scroll, reveal }
      this.scroll = (this.scroll + 30) % 512
    }
    const sprites: CutInSprite[] = []
    // 얼굴은 우선순위 0으로 올린다(`Sprite_SetExplicitPriority(…, 0)`) · VS도 0 — 이름 판(BG2 · 0) 위다
    if (this.x) sprites.push({ img: `leader${String(this.leader)}`, x: this.x.value / FX, y: 66, dark: this.lit ? 0 : 14 / 16, front: true })
    if (this.vsOn) sprites.push(...this.vs.sprites().map((s) => ({ ...s, front: true })))
    this.sprites = sprites
    if (this.lit) {
      draw.darken = 14 / 16
      draw.name = { text: this.name, x: 122, y: 80, w: 128 }
    }
    if (this.whiteOut) { this.whiteOut.exec(); this.bright = this.whiteOut.value }
  }
}

/** 날개 여덟 (`Unk_ov5_021F9A2C` — 도) */
const BLADES = [[0, 23], [45, 22], [45, 68], [90, 67], [91, 113], [135, 112], [135, 158], [180, 157]] as const
const tanIdx = (a: number): number => fxDiv(sinIdx(a), cosIdx(a))

/** 28 갤럭시 간부 · 보스 (`EncounterEffect_GalacticBoss` · EC:2125-2251) */
class GalacticBoss extends CutInBase {
  private alpha: LinearS32 | null = null
  private xlu = false
  private counter = 0
  private mosaic: LinearS32 | null = null
  private blades: LinearS32[] = []
  /** BG3 창의 칠한 픽셀 — 줄마다 이어진 칸으로 묶어 낸다 (칠한 칸이 한 판에 2만 개를 넘는다) */
  private readonly cover = new Uint8Array(256 * 192)
  private black: [number, number, number, number][] = []
  private dirty = false
  constructor() { super(16) }
  protected step(): void {
    switch (this.state) {
      case 3:
        this.alpha = new LinearS32(0, 16, 15)
        this.xlu = true
        this.state = 4
        break
      case 4:
        if (this.alpha!.update()) { this.xlu = false; this.state = 5; this.counter = 16 }
        break
      case 5:
        if (--this.counter > 0) break
        this.mosaic = new LinearS32(0, 14, 16)
        this.blades = BLADES.map(([a, b]) => new LinearS32(Math.trunc((a * 0xffff) / 360), Math.trunc((b * 0xffff) / 360), 16))
        // 가운데 띠 (`ov5_021DEC38` — 93~98줄 온 폭)
        for (let y = 93; y < 99; y++) this.fill(y, 0, 256)
        this.state = 6
        break
      case 6: {
        this.mosaic!.update()
        let last = false
        for (const b of this.blades) {
          const prev = b.value & 0xffff
          last = b.update()
          this.wedge(prev, b.value & 0xffff)
        }
        if (last) this.state = 7
        break
      }
      default: this.finish()
    }
  }
  /** 날개 한 칸 — 윗줄은 가운데 왼쪽, 아랫줄은 오른쪽으로 거울 (`ov5_021DEB04`) */
  private wedge(prev: number, cur: number): void {
    const t7 = tanIdx(cur), t8 = tanIdx(prev)
    for (let r = 0; r < 96; r++) {
      const d = 95 - r
      const a = Math.floor(fxMul(t7, d * FX) / FX), b = Math.floor(fxMul(t8, d * FX) / FX)
      const top = [128 - b, 128 - a].sort((p, q) => p - q) as [number, number]
      const bottom = [128 + b, 128 + a].sort((p, q) => p - q) as [number, number]
      this.fill(r, top[0], top[1] + 1)
      this.fill(191 - r, bottom[0], bottom[1] + 1)
    }
  }
  /** `ov5_021DE89C` — 빈 칸은 안 칠하고 화면 안으로 자른다 */
  private fill(y: number, x1: number, x2: number): void {
    if (x2 <= 0 || x1 === x2) return
    const a = Math.max(0, x1), b = Math.min(256, x2)
    if (b > a) { this.cover.fill(1, y * 256 + a, y * 256 + b); this.dirty = true }
  }
  protected after(): void {
    if (!this.alpha) return
    // BG3 창이 우선순위 0 · 「G」가 1이라 검정이 위다
    this.sprites = [{
      img: 'galactic', x: 128, y: 96,
      alpha: this.xlu ? this.alpha.value / 16 : 1,
      mosaic: (this.mosaic?.value ?? 0) + 1,
    }]
    if (this.dirty) {
      this.dirty = false
      const runs: [number, number, number, number][] = []
      for (let y = 0; y < 192; y++) {
        for (let x = 0; x < 256;) {
          if (!this.cover[y * 256 + x]) { x++; continue }
          const from = x
          while (x < 256 && this.cover[y * 256 + x]) x++
          runs.push([from, y, x - from, 1])
        }
      }
      this.black = runs
    }
    this.f.draw!.mask = this.black
  }
}

/** 기본 카메라 (`CAMERA_TYPE_DEFAULT`) — 각 X · 반화각 */
const BASE_PITCH = 0xd602, BASE_FOV = 0x5c1
/** 원작 각(한 바퀴 0x10000)의 부호 있는 차 → 도 */
const turnDeg = (d: number): number => ((((d & 0xffff) << 16) >> 16) * 360) / 65536
const halfTan = (idx: number): number => Math.tan((idx * Math.PI * 2) / 65536)
/** 반화각 → 기본의 확대율 */
const zoomOf = (fov: number): number => halfTan(fov) / halfTan(BASE_FOV)

/** 카메라 컷 열여섯 (`sLegendaryEncounterCameraParams` · EC:2261-2374) — 각 X · 각 Y · 반화각 · 다음까지 기다림 */
const CAMERA_CUTS = [
  [0xd602, 0x0000, 0x5c1, 4], [0xcf02, 0xff00, 0x601, 4], [0xe602, 0x1000, 0x691, 4], [0xd602, 0x0a00, 0x711, 3],
  [0xe102, 0xf000, 0x780, 3], [0xc602, 0x0000, 0x751, 3], [0xe002, 0xf000, 0x800, 3], [0xd602, 0x0000, 0x802, 3],
  [0xd002, 0x1000, 0x800, 3], [0xd902, 0xf500, 0x751, 3], [0xd002, 0x0a00, 0x4c1, 2], [0xe002, 0xf000, 0x3c1, 2],
  [0xd002, 0xf000, 0x650, 1], [0xe002, 0xa000, 0x241, 1], [0xe1a2, 0x0500, 0x500, 1], [0xd602, 0x0000, 0x241, 1],
] as const

/** 전설 · 환상 — 3D만 만진다(스프라이트 없음). 카메라는 끝나도 안 되돌린다 */
abstract class Legend extends CutInBase {
  protected orbit: { pitch: number, yaw: number } | null = null
  protected zoom: number | null = null
  protected blur: { eva: number, evb: number } | null = null
  protected whiteOut: BrightnessFade | null = null
  constructor() {
    super(16, 1)
    this.endWhite = true
  }
  protected after(): void {
    if (this.orbit) this.f.orbit = this.orbit
    if (this.zoom !== null) this.f.fovScale = this.zoom
    if (this.blur) this.f.blur = this.blur
    if (this.whiteOut) { this.whiteOut.exec(); this.bright = this.whiteOut.value }
  }
}

/** 25 환상 (`EncounterEffect_Mythical` · EC:2404-2484) */
class Mythical extends Legend {
  private cut = 0
  private delay = 0
  protected step(): void {
    switch (this.state) {
      case 3:
        this.blur = { eva: 3, evb: 15 }
        this.cut = 0
        this.delay = CAMERA_CUTS[0][3]
        this.state = 4
        break
      case 4: {
        if (--this.delay >= 0) break
        const [ax, ay, fov] = CAMERA_CUTS[this.cut]!
        this.orbit = { pitch: turnDeg(ax - BASE_PITCH), yaw: turnDeg(ay) }
        this.zoom = zoomOf(fov)
        if (++this.cut >= CAMERA_CUTS.length) this.state = 5
        else this.delay = CAMERA_CUTS[this.cut]![3]
        break
      }
      case 5:
        this.whiteOut = new BrightnessFade(16, 10)
        this.state = 6
        break
      case 6:
        if (this.whiteOut!.done) this.state = 7
        break
      default: this.finish()
    }
  }
}

/** 26 전설 (`EncounterEffect_Legendary` · EC:2486-2583) */
class Legendary extends Legend {
  private fov: LinearS32 | null = null
  private dist: QuadFX | null = null
  private delay = 0
  protected step(): void {
    switch (this.state) {
      case 3:
        this.blur = { eva: 5, evb: 13 }
        this.fov = new LinearS32(BASE_FOV, BASE_FOV + 0x100, 40)
        this.state = 4
        break
      case 4: {
        const done = this.fov!.update()
        this.zoom = zoomOf(this.fov!.value)
        if (done) { this.state = 5; this.delay = 5 }
        break
      }
      case 5:
        if (--this.delay >= 0) break
        // 거리를 되읽어 거기서 −2350 — 기본 팔(666.9)의 3.5배라 원작은 겨눔점을 지나 땅 밑으로 빠진다. 우리는 `LEGEND_DOLLY_MIN`에서 멈춘다
        this.dist = new QuadFX(0, fx(-2350), fx(0.5), 8)
        this.state = 6
        break
      case 6: {
        const done = this.dist!.update()
        this.dolly = Math.max(LEGEND_DOLLY_MIN, 1 + this.dist!.value / FX / ARM)
        if (done) this.state = 7
        break
      }
      case 7:
        this.whiteOut = new BrightnessFade(16, 60)
        this.state = 8
        break
      case 8:
        if (this.whiteOut!.done) this.state = 9
        break
      default: this.finish()
    }
  }
}
/** 원작 필드 카메라 팔 (`CAMERA_TYPE_DEFAULT` · 0x29AEC1) */
const ARM = 666.922119140625
/**
 * 전설 컷인이 당기는 한계 — 팔의 25%.
 *
 * ⚠️ **원작 값을 그대로 못 쓴다.** 원작은 팔이 −2350(−252%)까지 가서 카메라가 겨눔점을 뚫고 땅 밑에서 올려다본다 — DS에서는
 * 뒷면이 안 그려져 빈 화면이 희게 바래는 것으로 보인다. 우리 3D에서 따라가면 땅 밑이 그려지고, 굴 컷인처럼 5%에서 멈추면
 * 주인공 다리가 화면을 채운 채 1초를 선다(실측 `pnpm shot --cutins=26:72`). 돌진이 읽히는 자리에서 멈춘다
 */
const LEGEND_DOLLY_MIN = 0.25

/** 원작 번호 → 띠 · 전설 컷인 (12~19 · 25 · 26 · 28). 없는 번호면 null */
export function bannerCutIn(effect: number, ctx: CutInContext): SpecialCutIn | null {
  if (effect >= 12 && effect <= 19) return new GymLeader(effect - 12, ctx.trainerName(LEADER_TRAINER[effect - 12]!))
  if (effect === 25) return new Mythical()
  if (effect === 26) return new Legendary()
  if (effect === 28) return new GalacticBoss()
  return null
}
