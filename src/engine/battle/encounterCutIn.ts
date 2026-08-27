// 조우 컷인 (`enc_effects.h` · `overlay005/encounter_effect_core.c`)
//
// 풀숲을 밟으면 화면이 번쩍이고 찢어지고 나서 배틀이 열린다. 그 사이가 이
// 파일이다 — 원작이 `FieldTask_Encounter`의 **첫 걸음**에서 돌리고
// (`encounter.c` 169줄), 그것이 끝나야 맵을 내리고 배틀을 부른다.
//
// ⚠️ **31종 중 여섯만 여기 있다.** 지형 셋(풀숲·물·동굴) × 상대 레벨 높낮이
// 둘이고, 트레이너 여섯은 같은 여섯을 쓴다 — 원작 표에서 앞 열둘이 그 짝이다.
// 관장·사천왕 배너 스물은 롬 그림(`res/trainers/classes/field_encounteffect`)이
// 필요해서 추출기부터 붙어야 한다.
//
// ⚠️ **원작은 두 화면 256×192고 우리는 한 화면 3D다.** 그래서 화면에 얹는 값은
// 전부 **비율**로 옮긴다 — 픽셀은 화면 폭·높이로 나누고, 카메라 거리는 원작
// 기본값 666.922로 나눈 배율이다 (`field_camera.c`의 `CAMERA_TYPE_DEFAULT`).
// 그대로 못 옮긴 값은 그 자리에 원작 값과 우리 값을 같이 적어 두었다.
import { Terrain, type TerrainId } from './terrain'

/** `enum EncEffectCutIn` (`enc_effects.h`) 차례 그대로 */
export const CutIn = {
  TALL_GRASS_LOWER: 0,
  TALL_GRASS_HIGHER: 1,
  WATER_LOWER: 2,
  WATER_HIGHER: 3,
  CAVE_LOWER: 4,
  CAVE_HIGHER: 5,
  TRAINER_TALL_GRASS_LOWER: 6,
  TRAINER_TALL_GRASS_HIGHER: 7,
  TRAINER_WATER_LOWER: 8,
  TRAINER_WATER_HIGHER: 9,
  TRAINER_CAVE_LOWER: 10,
  TRAINER_CAVE_HIGHER: 11,
} as const

/**
 * 어느 컷인을 쓸 것인가 (`CutInEffects_ForBattle`,
 * `overlay005/encounter_effect.c` 1282줄).
 *
 * 원작의 셈이 세 줄이다:
 *
 * ```c
 * v2 = (trainer ? 1 : 0)                     // 야생 0 · 트레이너 1
 * v1 = (WATER ? 2 : CAVE ? 4 : 0)            // 지형 셋
 * if (foeLevel - myLevel > 0) v1++           // 상대가 더 높으면 한 칸
 * return v2 * 6 + v1
 * ```
 *
 * ⚠️ **레벨은 「싸울 수 있는 첫 마리」끼리 견준다** (`Party_FindFirstEligibleBattler`).
 * 선두가 쓰러져 있으면 기준이 뒤로 넘어간다 — 리펠과 같은 자다.
 *
 * ⚠️ **같으면 낮은 쪽이다.** 조건이 `> 0`이라 딱 같은 레벨은 안 오른다
 */
export function cutInForBattle(o: {
  trainer: boolean
  terrain: TerrainId
  /** 내 첫 마리의 레벨 */
  myLevel: number
  /** 상대 첫 마리의 레벨 */
  foeLevel: number
}): number {
  // ⚠️ **물과 굴 말고는 전부 풀숲 컷인이다.** 원작 `switch`가 나머지 열하나를
  // (평지·모래·풀·웅덩이·산·눈·얼음·실내·대습원·다리·MAX) 한 갈래에 몰아넣었다
  const terrain = o.terrain === Terrain.WATER ? 2 : o.terrain === Terrain.CAVE ? 4 : 0
  const higher = o.foeLevel - o.myLevel > 0 ? 1 : 0
  return (o.trainer ? 6 : 0) + terrain + higher
}

/** 그 컷인이 상대가 더 센 쪽인가. 번호가 홀수면 그렇다 */
export const isHigherLevel = (cutIn: number): boolean => cutIn % 2 === 1

/** 지형 갈래. 트레이너 여섯도 같은 연출을 쓴다 */
export const cutInShape = (cutIn: number): 'grass' | 'water' | 'cave' => {
  const at = cutIn % 6
  return at < 2 ? 'grass' : at < 4 ? 'water' : 'cave'
}

/** 화면 한 프레임의 모습. 그리는 것은 `scene/encounterCutIn`이 한다 */
interface CutInFrame {
  /**
   * 화면을 덮는 밝기. **+1이 흰색 · −1이 검정**이다.
   *
   * 원작의 마스터 밝기가 −16~+16이고 컷인이 쓰는 값이 ±16 하나뿐이라
   * (`EncounterEffect_Flash(1, ±16, -16, …)`) 16으로 나눈 것이 그대로 이 값이다
   */
  flash: number
  /**
   * 가로로 찢기. `band`는 조각 하나의 높이(화면 높이의 몫), `offset`은 조각이
   * 밀리는 거리(화면 폭의 몫)다. 홀짝 조각이 **서로 반대로** 밀린다.
   *
   * 원작은 주사선마다 BG를 밀고 창으로 잘라 낸다
   * (`ScreenSliceEffect_HBlankCallback`) — 우리는 후처리에서 UV를 민다
   */
  slice: { band: number, offset: number } | null
  /**
   * 물결. `amplitude`는 화면 폭의 몫, `cycles`는 화면 세로로 사인이 몇 번 도는가다.
   *
   * 원작 `ScreenShakeEffect_Start(…, (0xffff / 192) * n, FX32_CONST(a), …)`에서
   * n이 곧 도는 횟수고(주사선 192줄에 0xffff가 한 바퀴다) a가 픽셀 진폭이다
   */
  ripple: { amplitude: number, cycles: number } | null
  /** 조리개. 1이면 다 보이고 0이면 다 닫혔다 (`FADE_TYPE_CIRCLE_OUT`) */
  iris: number
  /** 검게 덮은 정도. 0~1 (`FADE_TYPE_BRIGHTNESS_OUT`과 마지막 검정) */
  black: number
  /** 카메라 팔에 곱할 값. 1이면 그대로다 (`Camera_SetDistance`) */
  dolly: number
  /** 이 프레임에 끝났는가. 참이면 배틀을 연다 */
  done: boolean
}

/**
 * 지금 도는 컷인의 한 프레임. 안 돌면 null이다.
 *
 * **미는 것은 `scene/encounterCutIn` 하나**고, 보는 자리가 넷이다 —
 * 덮개(`ui/field/CutInOverlay`) · 카메라(`actor/camera`) · 후처리(`scene/fx/post`) ·
 * 걸음 묶기(`actor/player`). 프레임마다 바뀌는 값이라 스토어가 아니라 읽기용
 * 싱글톤이다 (`state/worldState`와 같은 이유다)
 */
export const cutInFrame: { now: CutInFrame | null } = { now: null }

const CLEAR: CutInFrame = {
  flash: 0, slice: null, ripple: null, iris: 1, black: 0, dolly: 1, done: false,
}

// ── 원작의 보간 두 가지 ────────────────────────────────────────────────────

/**
 * 곧은 보간 (`LinearInterpolationTaskS32`, `encounter_effect.c` 279줄).
 *
 * ⚠️ **`update()`가 참을 돌려주는 것은 `numSteps`번째 값을 낸 프레임이다** —
 * 곧 `n`단 보간이 **n+1 프레임**을 먹는다. 3단 밝기 변화가 네 프레임인 까닭이고,
 * 번쩍임 전체 길이가 여기서 나온다
 */
class Linear {
  private step = 0
  value: number

  constructor(private readonly start: number, end: number, private readonly steps: number) {
    this.value = start
    this.delta = end - start
  }

  private readonly delta: number

  update(): boolean {
    this.value = this.start + (this.delta * this.step) / this.steps
    if (this.step + 1 <= this.steps) { this.step++; return false }
    return true
  }
}

/**
 * 굽은 보간 (`QuadraticInterpolationTaskFX32`, 329줄) — `f(t) = f₀ + v₀t + ½at²`.
 *
 * 처음 속도 `v0`을 주면 `numSteps`에 딱 `end`에 닿도록 가속도를 역산한다:
 * `a = 2(거리 − v₀·n) / n²`. 원작이 카메라를 이 곡선으로 민다 — 훅 당겼다가
 * 늦추거나, 늦게 시작해 홱 당기거나가 그 `v₀` 하나로 갈린다
 */
class Quadratic {
  private step = 0
  private readonly accel: number
  value: number

  constructor(
    private readonly start: number, end: number,
    private readonly rate: number, private readonly steps: number,
  ) {
    this.value = start
    this.accel = (2 * (end - start - rate * steps)) / (steps * steps)
  }

  update(): boolean {
    this.value = this.start + this.rate * this.step + (this.accel * this.step * this.step) / 2
    if (this.step + 1 <= this.steps) { this.step++; return false }
    return true
  }
}

/**
 * 번쩍임 (`EncounterEffect_FlashTask`, 218줄).
 *
 * 원작 그대로 **한 프레임에 상태 하나**를 밟는다. 그래서 길이가 짐작이 아니라
 * 세어져 나온다 — 켜기 1 + (밝히기 1 + 네 프레임) + (되돌리기 1 + 네 프레임)을
 * `numFlashes`번 하고 끝내기 1이다.
 *
 * ⚠️ **아래 화면 것은 안 옮긴다.** 원작이 같은 자리에서 아래 화면을 여덟
 * 프레임에 걸쳐 검게 덮는데(`otherScreenFlashColor`) 우리는 화면이 하나다
 */
class Flash {
  private state = 0
  private fades = 0
  private task: Linear | null = null
  /** −1~+1 */
  value = 0
  done = false

  constructor(private readonly color: number, private readonly times: number) {}

  tick(): void {
    switch (this.state) {
      case 0: // 아래 화면 쪽. 우리는 화면이 하나라 한 프레임만 먹고 지나간다
        this.state = 1
        break
      case 1:
        this.task = new Linear(0, this.color, 3)
        this.state = 2
        break
      case 2:
        if (this.task?.update() === true) this.state = 3
        break
      case 3:
        this.task = new Linear(this.color, 0, 3)
        this.state = 4
        break
      case 4:
        if (this.task?.update() === true) {
          this.fades += 1
          this.state = this.fades === this.times ? 5 : 1
        }
        break
      default:
        this.done = true
    }
    this.value = (this.task?.value ?? 0) / FLASH_FULL
  }
}

/** 마스터 밝기의 끝값. 원작이 컷인에서 쓰는 것은 ±16 하나뿐이다 */
const FLASH_FULL = 16
/** 번쩍임 횟수. 여섯이 다 둘이다 */
const FLASH_TIMES = 2

// ── 화면 크기와 카메라 (원작 값 → 우리 비율) ──────────────────────────────

/** 원작 화면. 두 화면 중 위 화면 하나의 크기다 */
const DS_WIDTH = 256
const DS_HEIGHT = 192
/**
 * 원작 필드 카메라의 팔 길이 (`field_camera.c`의 `CAMERA_TYPE_DEFAULT.distance`).
 *
 * 칸 하나가 16이므로 41.68칸이다. 컷인이 더하는 거리를 이 값으로 나누면 **배율**이
 * 되고, 우리 카메라 팔(`actor/camera`의 `THIRD`)에 그 배율을 곱한다
 */
const DS_CAMERA_ARM = 666.922119140625

/**
 * 카메라를 뒤로 못 빼는 한계.
 *
 * ⚠️ **원작 값을 그대로 못 쓰는 자리가 하나 있다.** 굴 · 상대가 더 셀 때가
 * −800이고 그것은 팔 길이의 **−119.9%**다 — 원작에서는 거리가 음수가 되어
 * 카메라가 겨눔점을 지나 반대편으로 나간다. 그때 화면은 이미 조리개가 닫혀
 * 검으므로 원작에서는 안 보이지만, 우리는 3D라 그 프레임이 실제로 그려진다.
 * 그래서 **0.05까지만** 당긴다 — 원작 값은 위 상수에 그대로 남겨 두었다
 */
const DOLLY_MIN = 0.05

/** DS 픽셀 → 화면 폭의 몫 */
const acrossOf = (px: number): number => px / DS_WIDTH
/** DS 주사선 → 화면 높이의 몫 */
const downOf = (lines: number): number => lines / DS_HEIGHT
/** DS 카메라 거리 → 우리 팔에 곱할 배율 */
const dollyOf = (units: number): number =>
  Math.max(DOLLY_MIN, 1 + units / DS_CAMERA_ARM)
/**
 * DS 카메라 거리 → 배율의 **변화량**. 처음 속도에 쓴다.
 *
 * ⚠️ **`dollyOf`를 빼서 쓰면 안 된다** — 그쪽은 아래끝을 자르므로, 자르는 자리에
 * 걸린 속도가 조용히 다른 값이 된다
 */
const dollyRateOf = (units: number): number => units / DS_CAMERA_ARM

// ── 지형 셋의 값 (`encounter_effect_core.c` 44~80줄의 #define 그대로) ──────

const GRASS = {
  higher: {
    pixelsPerSlice: 2, frames: 6,
    from1: 0, to1: -3, rate1: -12, camera1: 50, cameraRate1: 30,
    from2: -3, to2: 255, rate2: 30, camera2: -50, cameraRate2: -255,
  },
  lower: {
    pixelsPerSlice: 5, frames: 6,
    from1: 0, to1: -2, rate1: -12, camera1: 50, cameraRate1: 30,
    from2: -2, to2: 255, rate2: 30, camera2: -30, cameraRate2: -100,
  },
} as const

const WATER = {
  // `ScreenShakeEffect_Start(…, (0xffff / 192) * n, FX32_CONST(a), 800, …)`
  higher: { cycles: 3, amplitude: 15 },
  lower: { cycles: 2, amplitude: 12 },
} as const

const CAVE = {
  higher: { frames: 12, camera: -800, cameraRate: -5 },
  lower: { frames: 12, camera: -400, cameraRate: -2 },
} as const

/** 물 컷인이 번쩍임과 **따로** 세는 프레임 둘 (`case 1`·`case 2`) */
const WATER_BEFORE_SHAKE = 10
const WATER_SHAKE = 12
/** `StartScreenFade(…, 8, 1, …)` — 여덟 프레임에 검어진다 */
const WATER_FADE = 8
/** `StartScreenFade(…, FADE_TYPE_CIRCLE_OUT, …, 12, 1, …)` */
const CAVE_IRIS = 12

/**
 * 컷인 하나를 프레임마다 굴리는 자.
 *
 * 원작의 태스크가 **한 프레임에 상태 하나**를 밟으므로 그대로 옮겼다 —
 * 길이를 상수로 적지 않고 세어져 나오게 두는 편이 표와 어긋날 자리가 없다.
 */
export class EncounterCutIn {
  private state = 0
  private readonly flash: Flash
  private readonly higher: boolean
  private readonly shape: 'grass' | 'water' | 'cave'
  private slice: Quadratic | null = null
  private camera: Quadratic | null = null
  private counter = 0
  private band = 0
  private dolly = 1
  private frame: CutInFrame = { ...CLEAR }

  constructor(readonly effect: number) {
    this.higher = isHigherLevel(effect)
    this.shape = cutInShape(effect)
    // 상대가 더 세면 **흰색**, 아니면 **검정**이다 — 원작이 그 한 인자로 갈라 놓았다
    // (`EncounterEffect_Flash(1, 16, …)` ↔ `(1, -16, …)`)
    this.flash = new Flash(this.higher ? FLASH_FULL : -FLASH_FULL, FLASH_TIMES)
  }

  /** 한 프레임 민다. 돌려주는 것이 이 프레임에 그릴 것이다 */
  tick(): CutInFrame {
    this.frame = { ...CLEAR }
    // 번쩍임은 **따로 도는 태스크**다 (`SysTask_Start`). 걸어 둔 뒤로는 지형
    // 연출이 무엇을 하든 프레임마다 제 상태를 밟는다 — 물이 그것을 안 기다리고
    // 세기 시작하는 것이 그래서 성립한다
    if (this.state >= 1 && !this.flash.done) this.flash.tick()
    switch (this.shape) {
      case 'grass': this.grass(); break
      case 'water': this.water(); break
      default: this.cave()
    }
    this.frame.flash = this.flash.value
    return this.frame
  }

  /**
   * 풀숲 (`EncounterEffect_Grass_*Level`).
   *
   * 번쩍인 뒤 화면이 **가로 조각으로 찢어지고**, 조각이 서로 반대로 밀리면서
   * 카메라가 당겼다 밀린다. 두 걸음이고 둘째 걸음이 조각을 화면 밖(255px)까지
   * 밀어 화면을 통째로 비운다
   */
  private grass(): void {
    const v = this.higher ? GRASS.higher : GRASS.lower
    switch (this.state) {
      case 0: // 원작이 여기서 자리를 잡는다 (`Heap_Alloc`). 한 프레임을 먹는다
        this.state = 1
        break
      case 1: // 번쩍임을 건다. 도는 것은 위에서 프레임마다 민다
        this.state = 2
        break
      case 2:
        if (this.flash.done) {
          this.state = 3
          this.band = downOf(v.pixelsPerSlice)
          // ⚠️ **첫 걸음만 단이 하나 많다** (`INTERPOLATION_FRAMES + 1`)
          this.slice = new Quadratic(v.from1, v.to1, v.rate1, v.frames + 1)
          this.camera = new Quadratic(
            1, 1 + dollyRateOf(v.camera1), dollyRateOf(v.cameraRate1), v.frames)
        }
        break
      case 3: {
        // 조각은 제 태스크로 프레임마다 돌고, 걸음을 넘기는 것은 카메라다
        const done = this.camera?.update() ?? true
        this.dolly = this.camera?.value ?? this.dolly
        this.slice?.update()
        if (done) {
          this.state = 4
          this.slice = new Quadratic(v.from2, v.to2, v.rate2, v.frames)
          // ⚠️ **둘째 걸음의 출발은 방금 세운 거리다** — 원작이
          // `Camera_GetDistance`로 되읽어서 그것을 시작값으로 쓴다
          this.camera = new Quadratic(
            this.dolly, this.dolly + dollyRateOf(v.camera2),
            dollyRateOf(v.cameraRate2), v.frames)
        }
        break
      }
      case 4: {
        const camDone = this.camera?.update() ?? true
        this.dolly = this.camera?.value ?? this.dolly
        const sliceDone = this.slice?.update() ?? true
        if (camDone && sliceDone) this.state = 5
        break
      }
      default:
        this.frame.black = 1
        this.frame.done = true
        return
    }
    if (this.slice !== null) {
      this.frame.slice = { band: this.band, offset: acrossOf(this.slice.value) }
    }
    this.frame.dolly = this.dolly
  }

  /**
   * 물 (`EncounterEffect_Water_*Level`).
   *
   * ⚠️ **번쩍임이 끝나기를 안 기다린다.** 원작이 번쩍임을 걸어 놓고 그 자리에서
   * 열 프레임을 세기 시작한다 — 그래서 물결이 번쩍임 끝과 거의 붙는다
   */
  private water(): void {
    const v = this.higher ? WATER.higher : WATER.lower
    switch (this.state) {
      case 0:
        this.state = 1
        break
      case 1: // 번쩍임을 걸고 **기다리지 않는다** — 그 자리에서 세기 시작한다
        this.counter = WATER_BEFORE_SHAKE
        this.state = 2
        break
      case 2:
        this.counter -= 1
        if (this.counter < 0) { this.state = 3; this.counter = WATER_SHAKE }
        break
      case 3:
        this.counter -= 1
        this.frame.ripple = { amplitude: acrossOf(v.amplitude), cycles: v.cycles }
        if (this.counter < 0) { this.state = 4; this.counter = WATER_FADE }
        break
      case 4:
        // 물결은 검어지는 동안에도 돈다 — 원작이 `ScreenShakeEffect_Finish`를
        // 페이드가 **끝난 뒤**에 부른다 (`case 6`)
        this.frame.ripple = { amplitude: acrossOf(v.amplitude), cycles: v.cycles }
        this.frame.black = 1 - this.counter / WATER_FADE
        this.counter -= 1
        if (this.counter < 0) this.state = 5
        break
      default:
        this.frame.black = 1
        this.frame.done = true
    }
  }

  /**
   * 동굴 (`EncounterEffect_Cave_*Level`).
   *
   * 번쩍인 뒤 **조리개가 닫히면서** 카메라가 앞으로 돌진한다. 굴에서만 쓰는
   * 연출이고 여섯 중 제일 세다 — 상대가 셀 때는 팔이 원작에서 음수까지 간다
   */
  private cave(): void {
    const v = this.higher ? CAVE.higher : CAVE.lower
    switch (this.state) {
      case 0:
        this.state = 1
        break
      case 1:
        this.state = 2
        break
      case 2:
        if (this.flash.done) {
          this.state = 3
          this.counter = CAVE_IRIS
          this.camera = new Quadratic(1, dollyOf(v.camera), dollyRateOf(v.cameraRate), v.frames)
        }
        break
      case 3:
        this.camera?.update()
        this.dolly = this.camera?.value ?? 1
        this.frame.iris = Math.max(0, this.counter / CAVE_IRIS)
        this.counter -= 1
        if (this.counter < 0) this.state = 4
        break
      default:
        this.frame.iris = 0
        this.frame.black = 1
        this.frame.done = true
        this.frame.dolly = this.dolly
        return
    }
    this.frame.dolly = Math.max(DOLLY_MIN, this.dolly)
  }
}
