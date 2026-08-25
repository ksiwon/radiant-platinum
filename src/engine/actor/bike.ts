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
 * BDSP 자전거(`Characters/objects/ob1004_00`)의 자리들 — **번들에서 잰 값**이다.
 * 단위는 BDSP 것이라 게임 단위로 쓰려면 `BDSP_TO_WORLD`를 곱한다.
 *
 * ⚠️ **오래 다른 자전거를 굽고 있었다.** `ob1003_00`은 안장·손잡이·경적이 따로
 * 달린 상세한 것이고 뼈가 54개라 자리를 집기 편했는데, **원작이 주인공을 태우는
 * 것은 `ob1004_00`**이다 — 주인공 옷 번들 `fc0001_11`이 그 메시
 * (`ob1004_00_bicycleSkin`)를 제 리그에 묶어 들고 클립 `bike_wait/walk/run_f`가
 * 그 둘을 함께 돌린다. 실측으로 둘은 다른 물건이다:
 *
 * |            | ob1003 | ob1004 |
 * |---|---:|---:|
 * | 키          | 0.9364 | 0.7661 |
 * | 손잡이 높이  | 0.9037 | 0.6770 |
 * | 앞바퀴 z    | 0.4458 | 0.5738 |
 * | 크랭크 반지름 | 0.17  | 0.084  |
 *
 * ⚠️ **원점이 땅이다.** 붙이는 자리를 가리키는 `loc_attach`가 (0, 0, 0)이고
 * 메시의 제일 아래도 0.0013이라, **주인공 발밑에 그대로 놓으면 된다** —
 * 자리를 눈으로 맞출 것이 없다.
 *
 * 앞은 +Z다(앞바퀴 z +0.574 · 뒷바퀴 −0.293). 우리 사람도 +Z를 보므로 자전거를
 * 돌릴 일이 없다.
 */
export const BIKE = {
  /**
   * 골반이 갈 자리. **원작이 앉힌 자리 그대로다.**
   *
   * ⚠️ **`ob1004_00`에는 안장 뼈가 없다.** 대신 원작이 `bike_walk_f`에서 골반을
   * 어디에 두는지를 잰다 — 여덟 점 평균으로 y 0.6498 · z 0.0212다
   * (`.audit/bikePose.py`). 메시의 안장 꼭대기는 y 0.5722 · z −0.0200이라
   * 그 위 7.8cm이고, 사람 골반은 방석 위에 그만큼 뜨는 것이 맞다.
   *
   * 단마다 조금씩 다르다 — `bike_run_f`가 y 0.6650 · z 0.0305고, 멈춰 선
   * `bike_wait_f`는 y 0.5352다. 멈춤 자세는 **한 발을 땅에 내리고 안장에서
   * 엉덩이를 떼는 것**이라 우리 자세(두 발이 페달에 남는다)와 다른 물건이다.
   * 그래서 달리는 쪽 하나로 둔다
   */
  saddle: { y: 0.6498, z: 0.0212 },
  /**
   * 크랭크 축(`Gear`)과 반지름. 반지름은 페달 둘의 자리에서 나온다 —
   * `LPedal`이 z −0.014, `RPedal`이 +0.154이고 축이 +0.070이라 둘 다 0.084이고
   * **서로 반대편**이다
   */
  crank: { x: 0.1020, y: 0.2100, z: 0.0700, r: 0.084 },
  /**
   * 손잡이 끝. 여기를 잡는다.
   *
   * ⚠️ **끝 뼈가 없다.** `Handle` 뼈에 매달린 정점 중 제일 바깥을 잰다 —
   * x 0.3481 언저리 18점이 y 0.6345~0.6863 · z 0.2542~0.2797에 모여 있다
   * (`.audit/bikeAnchor.mjs`). **손잡이가 뒤로 휜다** — 뼈 `Handle` 자체는
   * z 0.393인데 끝은 0.265다.
   *
   * ⚠️ **원작 치비는 여기까지 못 잡는다.** 실측으로 그 손이 x 0.207 · y 0.673 ·
   * z 0.210에 있어 손잡이 끝보다 14cm 안쪽이다 — 팔이 짧아서다. 우리 등신은
   * 팔이 닿으므로 진짜 끝을 잡는다
   */
  grip: { x: 0.3481, y: 0.6588, z: 0.2653 },
  /**
   * 바퀴 축과 반지름.
   *
   * 반지름은 축 높이(0.2673·0.2670)가 아니라 **뼈에 매달린 정점의 위아래 절반**
   * 이다 — 앞 0.2648 · 뒤 0.2661. 굴러가는 것은 뒷바퀴라 그쪽을 쓴다
   */
  wheel: { front: 0.5738, back: -0.2930, y: 0.2670, r: 0.2661 },
} as const

/**
 * 페달 한쪽의 자리. `phase`는 크랭크가 돈 각(라디안)이고 `side`는 왼쪽이 +1이다.
 *
 * 0에서 왼쪽 페달이 **뒤**에 있다 — 번들이 그 자세로 서 있다(`LPedal` z −0.014,
 * 크랭크 축이 +0.070이다).
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
type BikeBlock = 'grass' | 'surf' | 'map' | 'stuck'

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

/**
 * 상체가 앞으로 숙는 각(라디안). **원작은 단마다 다르게 숙인다.**
 *
 * 골반→목 벡터가 곧게 선 데서 얼마나 기울었나를 클립 셋에서 여덟 점씩 재서
 * 평균했다 (`.audit/bikePose.py`):
 *
 * | 클립 | 기울기 | 폭 |
 * |---|---:|---|
 * | `bike_wait_f` | 0.2438rad (14.0°) | 0.2433~0.2461 |
 * | `bike_walk_f` | 0.5307rad (30.4°) | 0.4341~0.5895 |
 * | `bike_run_f`  | 0.7110rad (40.7°) | 0.6051~0.7695 |
 *
 * ⚠️ **오래 0.30 하나로 돌고 있었다.** 그 값으로는 `ob1004_00`의 낮고 먼
 * 손잡이(y 0.60 · z 0.36)에 손이 10.9cm 모자란다 — 어깨가 안 나가기 때문이다
 */
const BIKE_LEAN = { still: 0.2438, walk: 0.5307, run: 0.7110 } as const

/**
 * 지금 속도에서 숙일 각. `walkSpeed`는 걷는 속도(m/s)다.
 *
 * 단은 걷기의 몇 배인가로 정해진다(`BIKE_GEARS`) — 1단이 2배, 3단이 4배다.
 * 그 사이를 곧게 잇는다
 */
export function bikeLean(speed: number, walkSpeed: number): number {
  const first = BIKE_GEARS[0]!
  const last = BIKE_GEARS[BIKE_GEARS.length - 1]!
  const times = walkSpeed > 1e-6 ? speed / walkSpeed : 0
  const at = (a: number, b: number, k: number): number =>
    a + (b - a) * Math.max(0, Math.min(1, k))
  return times <= first
    ? at(BIKE_LEAN.still, BIKE_LEAN.walk, times / first)
    : at(BIKE_LEAN.walk, BIKE_LEAN.run, (times - first) / (last - first))
}
