// 자전거 (DATA.md §4.2)
//
// 원작에서 자전거가 하는 일은 셋이다: **빨라지고**, **조우가 잦아지고**, 탈 수
// 있는 자리가 정해져 있다. 셋 다 원작이 값으로 적어 두었다.
//
// ⚠️ **아직 자전거가 안 그려진다.** 타면 주인공이 빨라질 뿐 몸 밑에 자전거가
// 없다. BDSP의 자전거는 주인공 프리팹 쪽에 붙어 있고 우리 주인공(`dawn.glb`)은
// 다른 길로 왔다 — 모델을 잇는 것은 다음 걸음이다 (PLAN §16.2).
import type { MapHeader } from '../map/world'
import { isSurfable } from '../map/zone'

/** 자전거 (`items.ko.json` 450번). 열쇠도구라 쓰면 없어지지 않는다 */
export const BIKE_ITEM = 450

/**
 * 자전거의 속도 단계 (걷기의 몇 배인가).
 *
 * ⚠️ **실측이다.** 원작의 이동 동작이 `InitWalk(방향, 프레임당 픽셀, 프레임 수)`
 * 꼴이라 한 칸(16px)에 걸리는 시간이 그대로 나온다
 * (`unk_020655F4.c`):
 *
 * | 동작 | 픽셀×프레임 | 걷기 대비 |
 * |---|---|---|
 * | 보통 걷기 | 2 × 8 | 1배 |
 * | 빠른 걷기 (자전거 1단) | 4 × 4 | **2배** |
 * | 조금 더 빠르게 (2단) | 16/3 × 3 | **2.67배** |
 * | 더 빠르게 (3단) | 8 × 2 | **4배** |
 *
 * 원작은 페달을 밟을 때마다 한 단씩 오른다(`PlayerAvatar_AccelerateBike`,
 * 최대 3). 우리 이동은 연속이라 시간으로 올린다
 */
export const BIKE_GEARS: readonly number[] = [2, 8 / 3, 4]

/** 한 단 오르는 데 걸리는 시간(초). 원작은 한 칸에 한 단이고 1단이 0.13초다 */
export const GEAR_TIME = 0.5

/**
 * 지금 속도 배수. `t`는 페달을 밟기 시작한 뒤 흐른 시간(초)
 */
export function bikeSpeedAt(t: number): number {
  const gear = Math.min(BIKE_GEARS.length - 1, Math.floor(t / GEAR_TIME))
  return BIKE_GEARS[gear]!
}

/** 왜 못 타는가. `null`이면 탈 수 있다 */
export type BikeBlock = 'grass' | 'surf' | 'map' | 'stuck'

// 타일 거동값 (`map_tile_behaviors.h`, §2.2)
const VERY_TALL_GRASS = 0x03
const MUD = new Set([0xa4, 0xa5, 0xa6, 0xa7])
/** 자전거 다리. **여기서는 내릴 수 없다** — 내리면 다리 아래로 떨어진다 */
const BIKE_BRIDGE = new Set([0x74, 0x75, 0x76, 0x77])

/**
 * 여기서 타거나 내릴 수 있는가 (`CanUseBicycle`).
 *
 * 원작의 차례 그대로다 — 자전거 다리 위면 **내리지도 못하고**, 긴 풀·진흙에서는
 * 타지 못하고, 맵 헤더가 금지하면 못 타고(`MapHeader_IsBikeAllowed`), 파도타는
 * 중에도 못 탄다
 */
export function bikeBlock(
  header: MapHeader | null, behavior: number | null, surfing: boolean, riding: boolean,
): BikeBlock | null {
  if (behavior !== null && BIKE_BRIDGE.has(behavior)) return riding ? 'stuck' : null
  if (riding) return null
  if (behavior !== null && (behavior === VERY_TALL_GRASS || MUD.has(behavior))) return 'grass'
  if (surfing) return 'surf'
  if (behavior !== null && isSurfable(behavior)) return 'surf'
  if (header !== null && header.bike === 0) return 'map'
  return null
}

/** 왜 안 되는지를 사람 말로. 원작의 글은 아직 안 옮겼다 */
export const BIKE_WHY: Readonly<Record<BikeBlock, string>> = {
  grass: '여기서는 자전거를 탈 수 없다!',
  surf: '물 위에서는 자전거를 탈 수 없다!',
  map: '여기서는 자전거를 탈 수 없다!',
  stuck: '지금은 내릴 수 없다!',
}
