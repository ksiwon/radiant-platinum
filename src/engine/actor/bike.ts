// 자전거 (DATA.md §4.2)
//
// 원작에서 자전거가 하는 일은 셋이다: **빨라지고**, **조우가 잦아지고**, 탈 수
// 있는 자리가 정해져 있다. 셋 다 원작이 값으로 적어 두었다.
import type { MapHeader } from '../map/world'
import { isSurfable } from '../map/zone'
import { isBikeBridge, onElevatedBridge } from './bridge'

/** 자전거 (`items.ko.json` 450번). 열쇠도구라 쓰면 없어지지 않는다 */
export const BIKE_ITEM = 450

/**
 * BDSP 자전거(`Characters/objects/ob1003_00`)의 자리들 — **번들의 뼈를 잰 값**이다.
 * 단위는 BDSP 것이라 게임 단위로 쓰려면 `BDSP_TO_WORLD`를 곱한다.
 *
 * ⚠️ **원점이 땅이다.** 붙이는 자리를 가리키는 `loc_attach`가 (0, 0, 0)이고
 * 메시의 제일 아래도 −0.0006이라, **주인공 발밑에 그대로 놓으면 된다** —
 * 자리를 눈으로 맞출 것이 없다.
 *
 * 앞은 +Z다(앞바퀴 z +0.446 · 뒷바퀴 −0.433). 우리 사람도 +Z를 보므로 자전거를
 * 돌릴 일이 없다.
 */
export const BIKE = {
  /** 안장. 여기에 골반이 앉는다 */
  saddle: { y: 0.56, z: -0.20 },
  /**
   * 크랭크 축(`Gear`)과 반지름. 반지름은 페달 둘의 자리에서 나온다 —
   * `LPedal2`가 z −0.256, `RPedal2`가 +0.084이고 축이 −0.086이라 둘 다 0.17이고
   * **서로 반대편**이다
   */
  crank: { x: 0.095, y: 0.2907, z: -0.086, r: 0.17 },
  /** 손잡이 끝(`EndLHandle2`). 여기를 잡는다 */
  grip: { x: 0.3768, y: 0.8803, z: 0.1008 },
  /** 바퀴 축과 반지름. 축 높이가 곧 반지름이다 (땅이 y = 0) */
  wheel: { front: 0.4458, back: -0.4332, y: 0.2494, r: 0.2494 },
} as const

/**
 * 페달 한쪽의 자리. `phase`는 크랭크가 돈 각(라디안)이고 `side`는 왼쪽이 +1이다.
 *
 * 0에서 왼쪽 페달이 **뒤**에 있다 — 번들이 그 자세로 서 있다(`LPedal2` z −0.256).
 */
export function pedalPoint(phase: number, side: 1 | -1): { x: number, y: number, z: number } {
  const a = side > 0 ? phase : phase + Math.PI
  return {
    x: side * BIKE.crank.x,
    y: BIKE.crank.y + BIKE.crank.r * Math.sin(a),
    z: BIKE.crank.z - BIKE.crank.r * Math.cos(a),
  }
}

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

/**
 * 여기서 타거나 내릴 수 있는가 (`CanUseBicycle`).
 *
 * 원작의 차례 그대로다 — 자전거 다리 위면 **내리지도 못하고**, 긴 풀·진흙에서는
 * 타지 못하고, 맵 헤더가 금지하면 못 타고(`MapHeader_IsBikeAllowed`), 파도타는
 * 중에도 못 탄다
 */
export function bikeBlock(
  header: MapHeader | null, behavior: number | null, surfing: boolean, riding: boolean,
  onRoad = false,
): BikeBlock | null {
  // ⚠️ **자전거로드 위에서는 못 내린다** (`PlayerAvatar_SetOnCyclingRoad`).
  // 다리 거동으로도 걸리지만 스크립트가 따로 켜는 자리가 있다 — 206번도로의
  // 입구가 그렇고, 그때는 다리 타일 밖에서도 이 값이 서 있다
  if (riding && onRoad) return 'stuck'
  // ⚠️ **다리 **위**일 때만 못 내린다** (`MapObject_IsOnBikeBridge*`가 층을 같이 본다).
  // 밑을 지나가는 사람은 같은 칸에 서 있어도 자유롭게 타고 내린다 (PARITY §1.16).
  //
  // ⚠️ 거동값도 틀려 있었다 — 자전거 다리는 0x76~0x7d고, 0x74·0x75는
  // 모래·눈 위의 **보통 다리**다. 그 둘까지 묶으면 사막과 설원의 다리에서
  // 자전거가 안 내려진다
  if (behavior !== null && isBikeBridge(behavior) && onElevatedBridge()) {
    return riding ? 'stuck' : null
  }
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

/**
 * 자전거로드 위인가 (`PlayerAvatar_SetOnCyclingRoad`).
 *
 * 리포트에 안 남는다 — 원작도 아바타의 런타임 값이고, 맵을 옮기는 스크립트가
 * 켜고 끈다 (`ForceBicycling`)
 */
let onCyclingRoad = false

export function setOnCyclingRoad(on: boolean): void { onCyclingRoad = on }
export function isOnCyclingRoad(): boolean { return onCyclingRoad }
