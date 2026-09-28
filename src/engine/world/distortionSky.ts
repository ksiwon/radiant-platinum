// 깨어진 세계의 하늘 — 규칙 (`ov9_02249960.c` · PARITY §8.6b · 그림은 `import/platinum/distortionSky`)
//
// 하늘은 두 겹이다. 뒤에 **배경 한 장**(BG2)이 화면에 붙어 있고, 그 위로 **구름 아홉**이 화면 한가운데를
// 소용돌이처럼 돈다. 3D 화면(BG0)은 그 위에 얹힌다.
//
//   어둡기    주인공 높이로 매 프레임 다시 잰다 (`RecalculateSkyBackgroundDarkness`) —
//             `(y − 65칸) ÷ (224칸 ÷ 12)`를 0~12로 자른다. **1층(289)이 가장 어둡고 아래로 갈수록 밝다.**
//             배경은 GX_RGB(4,4,8)로, 구름 팔레트 다섯은 GX_RGB(6,6,8)로 `base + ((tint − base) · level >> 4)`
//   구름      (중심 + (cos, sin) · 거리)에 서서 **제 각 + 덧각**만큼 돌아 있다. 무리 넷의 덧 빠르기가 하늘 갈래로 바뀌고
//             (`sSkyCloudsRotAngleDeltas`), 바뀔 때는 프레임당 0x200씩 따라간다
//   하늘 갈래 기라티나 방에서만 바뀐다 — 사천왕을 이기고(진행도 10)부터 둘째 그림자(12)까지 빨라지고, 내려설 때(13)
//             **거꾸로** 빨리 돈다. 그 뒤(14)는 도로 보통이다
//   내려서기  하늘이 0에서 12까지 136프레임에 어두워지고(`…_SKY_DARKNESS_DELTA`), 새까맣던 기라티나가 다 내려선 뒤
//             90프레임에 밝아진다(`…_SPRITE_DARKNESS_DECREMENT`). 내려선 방에 다시 들어오면 하늘이 처음부터 12다
import { MAP, PROGRESS, WORLD_MAX_Y, WORLD_MIN_Y } from './distortion'

const FX = 4096
/** 한 칸 = 16유닛 (`MAP_OBJECT_COORD_EDGE_TO_FX32`) */
const TILE_FX = 16 * FX

/** `SKY_BACKGROUND_MAX_DARKNESS` */
const SKY_MAX_DARKNESS = 12
/** `SPRITE_PALETTE_MAX_TINT_LEVEL` */
const MAX_TINT = 16

/** 배경 · 구름이 어두워지는 쪽 (5비트) */
export const SKY_TINT = [4, 4, 8] as const
export const CLOUD_TINT = [6, 6, 8] as const

/** 이 높이(세계 칸, 소수)에서 하늘 어둡기 — 0~12 */
export function skyDarkness(worldY: number): number {
  const y = Math.trunc(worldY * TILE_FX)
  const step = Math.trunc(((WORLD_MAX_Y - WORLD_MIN_Y) * TILE_FX) / SKY_MAX_DARKNESS)
  const level = Math.trunc((y - WORLD_MIN_Y * TILE_FX) / step)
  return Math.min(SKY_MAX_DARKNESS, Math.max(0, level))
}

/** 5비트 한 채널을 물들인다 (`CalculateTintedColor`) — 음수도 산술 밀기라 내림이다 */
export function tintChannel(base: number, tint: number, level: number): number {
  const l = Math.min(MAX_TINT, level)
  return (base + (((tint - base) * l) >> 4)) & 0x1f
}

/** `SKY_NORMAL` · `SKY_GIRATINA_ROOM` · `SKY_GIRATINA_ROOM_DARK` */
export type SkyKind = 0 | 1 | 2

/** 층에 들어설 때의 하늘 갈래 (`InitSkyCloudAnimators`) */
export function skyKindFor(map: number, progress: number): SkyKind {
  if (map !== MAP.giratinaRoom || progress < PROGRESS.wonCyrusBattle) return 0
  if (progress <= PROGRESS.giratinaRoomSecondShadow) return 1
  if (progress <= PROGRESS.giratinaArrived) return 2
  return 0
}

/** 층에 들어설 때 어둡기를 못 박는가 (`InitSkyBackgroundDarkness`) — 내려선 방이면 12로 */
export function skyDarknessPinned(map: number, progress: number): number | null {
  return map === MAP.giratinaRoom && progress === PROGRESS.giratinaArrived ? SKY_MAX_DARKNESS : null
}

/** `FX32_CONST` — 반올림 */
const fx = (v: number): number => Math.round(v * FX)

/** 무리마다 덧 빠르기 (`sSkyCloudsRotAngleDeltas[갈래][무리]`) */
const GROUP_DELTAS: readonly (readonly number[])[] = [
  [fx(0), fx(0), fx(0), fx(0)],
  [fx(0.5), fx(1.5), fx(3), fx(5)],
  [fx(-2), fx(-4.5), fx(-7), fx(-12.5)],
]
/** 덧 빠르기가 바뀔 때 한 프레임에 따라가는 만큼 */
const DELTA_EASE = 0x200

interface CloudTemplate {
  /** 구름 그림 (`sSkyCloudsResIDs`의 차례 = 굽힌 장의 구름 칸) */
  res: number
  group: number
  angle: number
  offset: number
  dist: number
  base: number
  cx: number
  cy: number
  scale: number
}

/** `sSkyCloudsTemplates` — 각은 fx32 도, 자리는 화면 픽셀 */
export const SKY_CLOUDS: readonly CloudTemplate[] = [
  { res: 6, group: 3, angle: fx(0), offset: fx(135), dist: 0x68, base: fx(1.25), cx: 128, cy: 108, scale: 2 },
  { res: 6, group: 3, angle: fx(180), offset: fx(135), dist: 0x68, base: fx(1.25), cx: 128, cy: 108, scale: 2 },
  { res: 6, group: 3, angle: fx(90), offset: fx(135), dist: 0x68, base: fx(1.25), cx: 128, cy: 108, scale: 2 },
  { res: 6, group: 3, angle: fx(270), offset: fx(135), dist: 0x68, base: fx(1.25), cx: 128, cy: 108, scale: 2 },
  { res: 1, group: 2, angle: fx(0), offset: fx(90), dist: 0x3c, base: fx(1), cx: 128, cy: 128, scale: 1 },
  { res: 2, group: 2, angle: fx(180), offset: fx(90), dist: 0x3c, base: fx(1), cx: 128, cy: 128, scale: 1 },
  { res: 3, group: 1, angle: fx(315), offset: fx(90), dist: 0x2a, base: fx(0.75), cx: 128, cy: 128, scale: 1 },
  { res: 4, group: 1, angle: fx(135), offset: fx(90), dist: 0x2a, base: fx(0.75), cx: 128, cy: 128, scale: 1 },
  { res: 5, group: 0, angle: fx(0), offset: fx(90), dist: 0, base: fx(0.5), cx: 128, cy: 128, scale: 1 },
]

export interface CloudState { angle: number, delta: number }

/** `ApplyRotationToTargetFx32` — 0 ≤ 각 < 360 */
function wrap(angle: number): number {
  let a = angle
  if (a < 0) { while (a < 0) a += 360 * FX } else a %= 360 * FX
  return a
}

/** 구름을 세운다 (`DistWorldSkyCloudAnimator_AnimInit`) — 덧 빠르기는 곧바로 그 갈래 값이다 */
export function initClouds(kind: SkyKind): CloudState[] {
  return SKY_CLOUDS.map((t) => ({ angle: t.angle, delta: GROUP_DELTAS[kind]![t.group]! }))
}

/** 한 프레임 (`DistWorldSkyCloudAnimator_AnimTick`) */
export function stepClouds(clouds: CloudState[], kind: SkyKind): void {
  for (const [i, c] of clouds.entries()) {
    const t = SKY_CLOUDS[i]!
    const want = GROUP_DELTAS[kind]![t.group]!
    if (want < c.delta) c.delta = Math.max(want, c.delta - DELTA_EASE)
    else if (want > c.delta) c.delta = Math.min(want, c.delta + DELTA_EASE)
    c.angle = wrap(c.angle + t.base + c.delta)
  }
}

/** `CalcSineDegrees` · `CalcCosineDegrees` — 정수 도, fx32 */
const sinDeg = (deg: number): number => Math.round(Math.sin((deg * Math.PI) / 180) * FX)
const cosDeg = (deg: number): number => Math.round(Math.cos((deg * Math.PI) / 180) * FX)

/**
 * 구름 하나가 화면 어디에 어떻게 서는가 — 셀 원점의 픽셀 자리 · 돈 각(도, 화면 y가 아래라 **시계 방향**이 양) · 배율
 */
export function cloudPose(i: number, c: CloudState): { x: number, y: number, deg: number, scale: number, res: number } {
  const t = SKY_CLOUDS[i]!
  const deg = Math.trunc(c.angle / FX)
  const x = t.cx * FX + cosDeg(deg) * t.dist
  const y = t.cy * FX + sinDeg(deg) * t.dist
  const turned = Math.trunc(wrap(c.angle + t.offset) / FX) % 360
  return { x: Math.floor(x / FX), y: Math.floor(y / FX), deg: turned, scale: t.scale, res: t.res }
}

/** `…_SKY_DARKNESS_DELTA` — 프레임당 fx */
export const ARRIVAL_SKY_STEP = Math.trunc((FX * 8) / (3 * 30))
/** `…_SPRITE_DARKNESS_DECREMENT` */
export const ARRIVAL_SPRITE_STEP = Math.trunc((FX * 16) / (3 * 30))
/** 하늘이 다 어두워진 fx */
export const ARRIVAL_SKY_TARGET = FX * SKY_MAX_DARKNESS
/** 기라티나가 처음 새까만 fx */
export const ARRIVAL_SPRITE_START = FX * MAX_TINT

/** fx 어둡기 → 단계 */
export const darknessLevel = (v: number): number => Math.trunc(v / FX)
