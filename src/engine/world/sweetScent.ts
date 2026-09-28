// 달콤한향기 · 달콤한꿀 (`overlay005/ov5_021F007C.c`의 `ov5_021F0488`)
//
// 기술 창의 달콤한향기(`ov5_021F101C` — 컷인 뒤 이것을 부른다)와 가방의 달콤한꿀(`UseHoneyFromMenu` —
// 컷인 없이 곧바로 부르고 하나를 쓴다)이 **같은 과제**다. 단계가 원작 번호 그대로다:
//
//   0  날씨가 막으면 7로 (20프레임 뒤 `CommonScript_SweetScentFaded`)
//   1  화면에 분홍을 덮는다 — `GX_RGB(31, 10, 23)`을 BG2로 알파 0 → 10/16, 19프레임 (`SEQ_SE_DP_FW230`)
//   2  덮개가 다 차면 22프레임을 잰다
//   3  시간이 다 되면 선 칸에 출현률이 있는가 — 있으면 6(조우), 없으면 4.
//      맵에 야생이 아예 없으면 기다리지 않고 4로 간다
//   4·5 분홍을 걷는다 — 10 → 0, 15프레임
//   6  조우 (`WildEncounters_TrySweetScentEncounter` — 리펠·특성이 못 막는다)
//   8  `CommonScript_SweetScentNothingHere`
//
// ⚠️ **날씨 23만 칠하는 길이 다르다** (`ov5_021F03D8`). 그 날씨는 BG2가 날씨 판이라 알파 대신 그 판의
// 팔레트를 분홍 쪽으로 8/16 섞는다(19프레임씩 오가고 소리는 같다). 우리는 날씨 23의 판을 안 그리므로
// **같은 덮개에 8/16**으로 칠한다 — 몫과 프레임은 원작 값이다. 날씨 8(`ov5_021F0408`)은 BG2 팔레트를
// 가렸다 푸는 DS 사정뿐이라 화면에 차이가 없다

/** `ov5_021F0438`이 막는 날씨 열여덟 — 흐림·비·눈·모래·안개·어둠 따위 */
const BLOCKING_WEATHER: ReadonlySet<number> = new Set([2, 3, 4, 5, 6, 7, 10, 21, 22, 14, 15, 16, 1, 9, 13, 17, 24, 25])
/** `ov5_021F03D8` — 팔레트로 칠하는 날씨 */
const PALETTE_WEATHER = 23

export function sweetScentBlocked(weather: number): boolean {
  return BLOCKING_WEATHER.has(weather)
}

/** `SCRIPT_ID(COMMON_SCRIPTS, 28)` · `(…, 29)` */
export const SWEET_SCENT_SCRIPT = { nothingHere: 2028, faded: 2029 } as const
/** `SEQ_SE_DP_FW230` — 분홍이 덮이기 시작할 때 */
export const SWEET_SCENT_SE = 1608
/** `GX_RGB(31, 10, 23)` (RGB555) */
export const SWEET_SCENT_TINT = 31 | (10 << 5) | (23 << 10)

/** `ov5_021F02B8` / `ov5_021F02C8` — 정수 나눗셈으로 한 프레임씩 옮긴다 */
class Ramp {
  value: number
  private count = 0
  done = false
  constructor(private readonly from: number, private readonly to: number, private readonly frames: number) {
    this.value = from
  }
  tick(): void {
    if (this.done) return
    this.value = this.from + Math.trunc(((this.to - this.from) * this.count) / this.frames)
    if (this.count + 1 <= this.frames) { this.count++; return }
    this.count = this.frames
    this.done = true
  }
}

/** 이 프레임에 씬이 할 일 */
export interface SweetScentFrame {
  /** 분홍 덮개의 진하기 0~1 */
  tint: number
  /** 이 프레임에 낼 소리 */
  se: number | null
  /** 이 프레임에 돌릴 공용 스크립트 */
  script: number | null
  /** 이 프레임에 조우를 걸어라 */
  encounter: boolean
  done: boolean
}

interface SweetScentPlace {
  /** 지금 걸린 날씨 (`FieldOverworldState_GetWeather`) */
  weather: number
  /** 맵에 야생이 있는가 (`MapHeader_HasWildEncounters`) */
  hasWild: boolean
  /** 선 칸에 출현률이 있는가 (`WildEncounters_TileHasEncounterRate`). 그 프레임에 묻는다 */
  tileHasRate: () => boolean
}

export class SweetScentRun {
  private state = 0
  private timer = 0
  private ramp: Ramp | null = null
  private readonly palette: boolean
  private finished = false
  constructor(private readonly place: SweetScentPlace) {
    this.palette = place.weather === PALETTE_WEATHER
  }

  get done(): boolean { return this.finished }

  step(): SweetScentFrame {
    const out: SweetScentFrame = { tint: 0, se: null, script: null, encounter: false, done: false }
    // 덮개 과제는 제 틀로 돈다 — 필드 과제보다 먼저 한 칸 간다
    this.ramp?.tick()
    switch (this.state) {
      case 0:
        if (sweetScentBlocked(this.place.weather)) { this.state = 7; this.timer = 20; break }
        this.state = 1
        break
      case 1:
        // `ov5_021F01F0`(알파 0 → 10, 19) · `ov5_021F022C`(팔레트 0 → 8, 19). 둘 다 시작에 소리를 낸다
        this.ramp = this.palette ? new Ramp(0, 8, 19) : new Ramp(0, 10, 19)
        out.se = SWEET_SCENT_SE
        this.state = 2
        break
      case 2:
        if (this.ramp?.done === true) { this.timer = 22; this.state = 3 }
        break
      case 3:
        this.timer--
        if (!this.place.hasWild) { this.state = 4; break }
        if (this.timer < 0) this.state = this.place.tileHasRate() ? 6 : 4
        break
      case 4:
        // `ov5_021F0204`(알파 10 → 0, 15) · `ov5_021F0240`(팔레트 8 → 0, 19)
        this.ramp = this.palette ? new Ramp(8, 0, 19) : new Ramp(10, 0, 15)
        this.state = 5
        break
      case 5:
        if (this.ramp?.done === true) this.state = 8
        break
      case 6:
        // 덮개를 거두지 않고 곧바로 조우로 넘어간다 — 화면은 조우 연출이 가져간다
        out.encounter = true
        this.finished = true
        break
      case 7:
        this.timer--
        if (this.timer < 0) { out.script = SWEET_SCENT_SCRIPT.faded; this.state = 9 }
        break
      case 8:
        out.script = SWEET_SCENT_SCRIPT.nothingHere
        this.state = 9
        break
      case 9:
        this.ramp = null
        this.finished = true
        break
    }
    out.tint = (this.ramp?.value ?? 0) / 16
    out.done = this.finished
    return out
  }
}
