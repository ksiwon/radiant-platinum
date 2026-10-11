// 원작 DS 대본이 전용 태스크로만 그리는 몸 연출의 시간표 — 선견 · 도우미 · 슬쩍 · 냄새맡기 (순수 함수).
//
// 이 기술들은 BDSP에 연출이 없고(소드실드에서 빠진 기술 — `moveAnimFuncs` 머리말) DS 대본의 입자도 없다. 원작은 2D 스프라이트(눈 · 발바닥)나
// 몸 스프라이트 복사본으로 그렸다. 우리는 그 **움직임**(디컴프의 값 그대로)을 3D 몸 복제 · 입체 메시에 옮긴다.
// 모든 시각은 DS 프레임(60fps)이고, 길이는 DS 화면 픽셀이다 — 장면이 `pxToM`(몸 키 / 80)으로 미터에 옮긴다.
//
// 값의 출처: `raw/decomp/src/battle_anim/script_funcs_{0,1,2,4}.c`. ⚠️ 위치의 기준(스프라이트 좌표 → 우리 몸 기준)과 몸 복사본의
// 겹침은 우리 해석이다 — 각 함수에 적었다.

/** DS 스프라이트 한 변(px) — 몸 키를 이것으로 나눠 `px`을 미터로 옮긴다 (`MON_SPRITE_FRAME_WIDTH` 80) */
export const DS_SPRITE_PX = 80

// ─── 선견 (`BattleAnimTask_ForesightSprite`) ───────────────────────────────

/** 눈이 지나는 점들 (DS px, y는 아래가 +). 구간 여섯 — 각 구간의 `PosLerpContext_Init(0, dx, 0, dy)`를 쌓은 것 */
const FORESIGHT_POINTS: readonly (readonly [number, number])[] = [[0, 0], [40, 40], [40, -40], [-40, 40], [-40, -40], [40, 40], [0, 0]]
const FORESIGHT_START_DELAY = 5
const FORESIGHT_MOVE_FRAMES = 8
const FORESIGHT_SEGMENT = FORESIGHT_START_DELAY + FORESIGHT_MOVE_FRAMES
const FORESIGHT_FADE_FRAMES = 16
const FORESIGHT_FLASH_RAMP = 10

/** 선견의 전체 길이(프레임): 눈이 여섯 구간을 지나고 사라지는 동안 맞는 몸이 하얗게 번쩍였다 돌아온다 */
export const FORESIGHT_FRAMES = FORESIGHT_SEGMENT * 6 + FORESIGHT_FADE_FRAMES + FORESIGHT_FLASH_RAMP

interface ForesightState {
  /** 눈의 자리 (px, y는 위가 +로 뒤집었다) */
  x: number
  y: number
  /** 0~1 불투명도 */
  alpha: number
  /** 맞는 몸의 하얀 덮기 0~1 (`PokemonSprite_StartFade` 0 → 10 → 0, 최대 10/16) */
  flash: number
}

export function foresightAt(f: number): ForesightState {
  const moveEnd = FORESIGHT_SEGMENT * 6
  if (f >= moveEnd) {
    const k = Math.min(1, (f - moveEnd) / FORESIGHT_FADE_FRAMES)
    const t = f - moveEnd
    const up = Math.min(1, t / FORESIGHT_FLASH_RAMP)
    const down = Math.max(0, Math.min(1, (t - FORESIGHT_FADE_FRAMES) / FORESIGHT_FLASH_RAMP))
    return { x: 0, y: 0, alpha: 1 - k, flash: (10 / 16) * up * (1 - down) }
  }
  const seg = Math.max(0, Math.floor(f / FORESIGHT_SEGMENT))
  const into = f - seg * FORESIGHT_SEGMENT - FORESIGHT_START_DELAY
  const a = FORESIGHT_POINTS[seg]!
  const b = FORESIGHT_POINTS[seg + 1]!
  const k = Math.max(0, Math.min(1, into / FORESIGHT_MOVE_FRAMES))
  return { x: a[0] + (b[0] - a[0]) * k, y: -(a[1] + (b[1] - a[1]) * k), alpha: 1, flash: 0 }
}

// ─── 슬쩍 (`BattleAnimTask_Snatch`) ────────────────────────────────────────

const SNATCH_LEG_FRAMES = 15
export const SNATCH_FRAMES = SNATCH_LEG_FRAMES * 3

interface SnatchLeg {
  /** 0 나가기(가장자리로) · 1 가로지르기(맞는 쪽 뒤) · 2 돌아오기 */
  leg: 0 | 1 | 2
  /** 0~1 진행 */
  k: number
}

/** 세 구간(15프레임씩). 끝나면 `null` — 몸이 제자리에 돌아와 있다 */
export function snatchAt(f: number): SnatchLeg | null {
  if (f < 0 || f >= SNATCH_FRAMES) return null
  const leg = Math.min(2, Math.floor(f / SNATCH_LEG_FRAMES)) as 0 | 1 | 2
  return { leg, k: (f - leg * SNATCH_LEG_FRAMES) / SNATCH_LEG_FRAMES }
}

// ─── 냄새맡기 (`BattleAnimTask_OdorSleuth`) ───────────────────────────────

/** 가로 흔들림 폭(px) · 횟수 (`ODOR_SLEUTH_ATTACKER_SHAKE_*`) */
const ODOR_EXTENT = 20
const ODOR_COUNT = 10
export const ODOR_FRAMES = 52

/**
 * 맞는 몸의 복사본 둘이 서로 반대로 흔들린다 (대본 `Func_Shake -20 · +20`). 폭은 `ShakeContext`처럼 프레임마다 부호가 바뀌고
 * 횟수가 다 되면 멎는다 — 줄어드는 것은 없다(`ShakeContext_Init`의 extent 고정)
 */
export function odorShakeAt(f: number): number {
  if (f < 0 || f >= ODOR_COUNT * 2) return 0
  return (f % 2 === 0 ? 1 : -1) * ODOR_EXTENT
}

// ─── 도우미 (`BattleAnimTask_AssistSprite` · `AssistPaw`) ─────────────────

export const ASSIST_PAWS = 12
export const ASSIST_FRAMES = 100
const ASSIST_GROW_STEPS = 3
const ASSIST_BASE_DELAY = 10
const ASSIST_RANDOM_DELAY = 10
const ASSIST_MOVE_DELAY = 30
const ASSIST_MOVE_BASE = 10
const ASSIST_MOVE_RANDOM = 10

/** 결정적 의사난수 0~1 — 같은 발바닥이 매번 같은 값 */
function unit(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

interface PawState {
  /** 0 아직 안 나옴 · 1 나왔다 */
  shown: boolean
  /** 크기 배율 (1 → 1.3 → 1, `ASSIST_SPRITE_PAW_SCALE_STEP` 0.1 × 3 오르고 내린다) */
  scale: number
  /** 0~1 날아가는 진행. 0이면 제자리 */
  fly: number
  /** 어느 도착 칸으로 가는가 0~5 (`sAssistPawSpriteDestinations` 6칸) */
  dest: number
  /** 제자리 (−1~1 로 무대 가로 · 세로 비율) */
  at: readonly [number, number]
}

export function pawAt(i: number, f: number): PawState {
  const appear = ASSIST_BASE_DELAY + unit(i * 7 + 1) * ASSIST_RANDOM_DELAY + i * 2
  const shown = f >= appear
  const grow = Math.max(0, f - appear - 3)
  const scale = grow <= ASSIST_GROW_STEPS ? 1 + 0.1 * grow : Math.max(1, 1 + 0.1 * (2 * ASSIST_GROW_STEPS - grow))
  const flyStart = appear + 3 + ASSIST_GROW_STEPS * 2 + ASSIST_MOVE_DELAY
  const dur = ASSIST_MOVE_BASE + unit(i * 13 + 5) * ASSIST_MOVE_RANDOM
  return {
    shown,
    scale,
    fly: f < flyStart ? 0 : Math.min(1, (f - flyStart) / dur),
    dest: i % 6,
    at: [unit(i * 3 + 11) * 2 - 1, unit(i * 5 + 17) * 2 - 1],
  }
}
