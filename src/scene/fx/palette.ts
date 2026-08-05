// 타일 팔레트 (PLAN §4.2 — 아트는 자체 제작이고 롬은 배치의 정본이다)
//
// 전에는 모르는 거동값을 `HSL(hash)`로 칠했다. 그러면 화면이 무지개가 되고,
// **틀린 색과 모르는 색이 구분되지 않는다.** 아는 것은 정해진 색으로, 모르는
// 것은 전부 같은 중립색으로 칠한다 — 그래야 "아직 안 밝힌 자리"가 눈에 보인다.
//
// 색조는 신오의 낮 기준이다. 채도를 낮게 잡는 이유는 3D로 옮긴 포켓몬(BDSP·
// Legends 계열)이 전부 파스텔 쪽이라서다 — 원색으로 칠하면 장난감처럼 보인다.
import { Color } from 'three'
import { Behavior, isWater } from '../../engine/map/zone'

/** 워프 칸 무리. 유력하지만 미확정이라 색만 따로 준다 (DATA.md §2.2) */
const WARP_LO = 0x5e
const WARP_HI = 0x6f

const COLORS = {
  plain: '#8fa86a',
  grass: '#5d8f45',
  water: '#4a7fa8',
  warp: '#b8a06a',
  /** 아직 의미를 모르는 거동. 하나로 묶어서 "안 밝힌 자리"가 보이게 한다 */
  unknown: '#7c8a76',
  /** 통행 불가 면. 절벽·건물 옆면이다 */
  cliff: '#6b6355',
} as const

const cache = new Map<number, Color>()

/** 거동값 → 바닥 색. 같은 값은 같은 Color 객체를 돌려준다 */
export function tileColor(behavior: number): Color {
  const hit = cache.get(behavior)
  if (hit) return hit
  let hex: string = COLORS.unknown
  if (behavior === Behavior.NORMAL) hex = COLORS.plain
  else if (behavior === Behavior.TALL_GRASS) hex = COLORS.grass
  else if (isWater(behavior)) hex = COLORS.water
  else if (behavior >= WARP_LO && behavior <= WARP_HI) hex = COLORS.warp
  const color = new Color(hex)
  cache.set(behavior, color)
  return color
}

export const CLIFF_COLOR = COLORS.cliff
