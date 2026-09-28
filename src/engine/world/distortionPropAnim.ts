// 깨어진 세계 소품이 스스로 움직이는 것 (`ov9_02249960.c`)
//
// 소품 스물다섯이 관리자 넷으로 갈린다 (`sPropAnimFuncsByKind`). 여기는 그중 **밟아서 나타나는 둘**과
// **늘 도는 하나**의 한 틱이다 — 승강 발판은 `scene/distortionCore`의 디딤돌이, 기라티나 그림자는
// `scene/distortionGiratina`가 맡는다.
//
//     발판 0~19   `DistWorldPlatformProp_*`   둥실거린다 · 알파가 한 틱에 1씩 · `SEQ_SE_PL_SYUWA3`
//     덩굴꽃 22 · 바위 23  `DistWorldObstacleProp_*`   BCA0를 ±2씩 · 알파를 2씩 · 제 소리
//     폭포 21 · 문 24  `DistWorldSimpleProp_*`   애니를 한 틱에 한 프레임, 돈다
//
// ⚠️ **한 틱이 60분의 1초다.** 필드는 매 V블랭크에 돈다 — 부르는 쪽이 경과 시간을 틱 수로 바꿔 넘긴다.

/** `GHOST_PROP_OPACITY_MIN` · `_MAX` — 원작 폴리곤 알파 0~31 */
export const GHOST_PROP_OPACITY_MAX = 31
const OPACITY_MIN = 0

const FX32_ONE = 4096
/** 월드 유닛 16이 한 칸이다 */
const UNITS_PER_TILE = 16

/** `PLATFORM_PROP_ANIM_DELTA` — 한 틱에 옮기는 진행 (fx32) */
const PLATFORM_DELTA = 0x800
/** 진행이 도는 폭 — `FX32_ONE * PLATFORM_PROP_ANIM_TIMING_COUNT` */
const PLATFORM_SPAN = FX32_ONE * 8

/** `sPlatformPropAnimOffsets` — 진행 여덟 칸마다의 높이 (fx32 유닛). 가장 깊이 6유닛(3/8칸) 가라앉는다 */
const PLATFORM_OFFSETS = [0x0, -0x1000, -0x2000, -0x4000, -0x5000, -0x5800, -0x5c00, -0x6000] as const

/** `OBSTACLE_PROP_ANIM_DELTA` — 덩굴꽃 · 바위가 한 틱에 옮기는 알파와 프레임 */
const OBSTACLE_DELTA = 2

type SoundState = 'none' | 'appear' | 'disappear'

/** 밟으면 나타나는 발판 하나 (`DistWorldPlatformProp`) */
export interface PlatformAnim {
  opacity: number
  /** 둥실거림 진행 (fx32, 0 ~ 8·FX32_ONE) */
  progress: number
  delta: number
  sound: SoundState
}

/**
 * 층에 들어설 때 (`DistWorldPlatformProp_AnimInit`). 숨은 무리면 알파 0에서, 아니면 다 보인 채로 선다.
 * 둥실거림은 제각각 — `LCRNG_Next() % (FX32_ONE * 8)`에서 시작하고, 그 값이 홀수면 거꾸로 간다
 */
export function platformAnimInit(hidden: boolean, lcrng: number): PlatformAnim {
  const progress = lcrng % PLATFORM_SPAN
  return {
    opacity: hidden ? OPACITY_MIN : GHOST_PROP_OPACITY_MAX,
    progress,
    delta: (progress & 1) !== 0 ? -PLATFORM_DELTA : PLATFORM_DELTA,
    sound: 'none',
  }
}

/**
 * 한 틱 (`DistWorldPlatformProp_AnimTick`).
 *
 * @param slowed 작은 발판(0)에 누가 서 있는가 — 서 있으면 가라앉는 폭이 반이다
 * @returns 이번 틱의 높이(칸)와 소리를 낼지. 소리는 나타나기 · 사라지기가 **바뀔 때 한 번**이다
 */
export function platformAnimTick(a: PlatformAnim, hidden: boolean, slowed: boolean): { y: number, sound: boolean } {
  let y: number = PLATFORM_OFFSETS[Math.floor(a.progress / FX32_ONE) % 8]!
  // 원작은 `yOffset >>= 1` — 음수의 산술 시프트라 반으로 줄되 음의 쪽으로 내린다
  if (slowed) y >>= 1
  a.progress += a.delta
  if (a.progress < 0) {
    a.progress = 0
    a.delta = PLATFORM_DELTA
  } else if (a.progress >= PLATFORM_SPAN) {
    a.progress = PLATFORM_SPAN - PLATFORM_DELTA
    a.delta = -PLATFORM_DELTA
  }
  let sound = false
  if (hidden) {
    if (a.opacity > OPACITY_MIN) {
      a.opacity--
      if (a.sound !== 'disappear') { a.sound = 'disappear'; sound = true }
    }
  } else if (a.opacity < GHOST_PROP_OPACITY_MAX) {
    a.opacity++
    if (a.sound !== 'appear') { a.sound = 'appear'; sound = true }
  }
  return { y: y / FX32_ONE / UNITS_PER_TILE, sound }
}

/** 덩굴꽃 · 바위 하나 (`DistWorldObstacleProp`) */
export interface ObstacleAnim {
  opacity: number
  /** BCA0 프레임 — 0 ~ 클립 길이. 끝에서 멈춘다(`Simple3D_UpdateAnim(…, FALSE)`) */
  frame: number
  sound: SoundState
}

/** 층에 들어설 때 — 보이는 무리면 **다 자란 채로**(마지막 프레임) 선다 (`DistWorldObstacleProp_AnimInit`) */
export function obstacleAnimInit(hidden: boolean, frames: number): ObstacleAnim {
  return hidden
    ? { opacity: OPACITY_MIN, frame: 0, sound: 'none' }
    : { opacity: GHOST_PROP_OPACITY_MAX, frame: frames, sound: 'none' }
}

/**
 * 한 틱 (`DistWorldObstacleProp_AnimTick`).
 *
 * 나타날 때는 알파와 클립이 같이 오른다. ⚠️ **사라질 때는 클립이 먼저 거꾸로 돈다** — 알파는 프레임이
 * 알파 밑으로 내려온 뒤에야 줄기 시작한다(`opacity >= animFrame`). 덩굴이 먼저 오므라들고 그다음 스러진다
 *
 * @returns 소리를 낼 갈래 — 나타나기 · 사라지기가 바뀔 때 한 번
 */
export function obstacleAnimTick(a: ObstacleAnim, hidden: boolean, frames: number): 'appear' | 'disappear' | null {
  let sound: 'appear' | 'disappear' | null = null
  if (hidden) {
    a.frame = Math.max(0, a.frame - OBSTACLE_DELTA)
    if (a.opacity >= a.frame) {
      if (a.opacity > OPACITY_MIN) {
        a.opacity = Math.max(OPACITY_MIN, a.opacity - OBSTACLE_DELTA)
        if (a.sound !== 'disappear') { a.sound = 'disappear'; sound = 'disappear' }
      } else {
        a.opacity = OPACITY_MIN
      }
    }
  } else {
    if (a.opacity < GHOST_PROP_OPACITY_MAX) {
      a.opacity = Math.min(GHOST_PROP_OPACITY_MAX, a.opacity + OBSTACLE_DELTA)
      if (a.sound !== 'appear') { a.sound = 'appear'; sound = 'appear' }
    }
    a.frame = Math.min(frames, a.frame + OBSTACLE_DELTA)
  }
  return sound
}

/** 소품 종류 (`enum PropKind`) — 이 파일이 갈래를 가르는 넷 */
const DISTORTION_PROP = { waterfall: 21, vineFlower: 22, rock: 23, portal: 24 } as const

/** `SEQ_SE_PL_*` — 바위는 나타나나 사라지나 `FW089_2`, 덩굴꽃은 `MEKI` · `MEKI2` (`DistWorldObstacleProp_AnimInit`) */
export function obstacleSound(kind: number, which: 'appear' | 'disappear'): number {
  if (kind === DISTORTION_PROP.rock) return 1483
  return which === 'appear' ? 1485 : 1486
}

/** 늘 도는 소품인가 — 폭포와 문 (`sSimplePropAnimFuncs`) */
export function isSimpleAnimated(kind: number): boolean {
  return kind === DISTORTION_PROP.waterfall || kind === DISTORTION_PROP.portal
}

/** 덩굴꽃 · 바위인가 (`sObstaclePropAnimFuncs`) */
export function isObstacle(kind: number): boolean {
  return kind === DISTORTION_PROP.vineFlower || kind === DISTORTION_PROP.rock
}
