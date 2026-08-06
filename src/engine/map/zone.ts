// 존(맵) 데이터와 충돌 질의 (PLAN §4.2 / Phase 1)
// tools/extract/maps.js가 뽑은 JSON을 평평한 타일 격자로 펴서 O(1) 질의를 제공한다.
// React를 모르는 순수 TS 계층이다 — 씬 연결은 src/scene이 담당한다.

/** 타일 u16의 최상위 비트가 통행 불가 플래그 */
export const IMPASSABLE = 0x8000
/**
 * 나머지 비트가 타일 거동.
 *
 * 어휘 크기는 세 가지가 있고 헷갈리면 안 된다 (DATA.md §2.2):
 * 오버월드의 원시 u16 54종 · 오버월드의 거동값 47종 · 전체 거동값 **94종**
 */
export const BEHAVIOR_MASK = 0x7fff

/**
 * 확인된 거동 값. 나머지는 아직 의미를 특정하지 않았다 — 원시값으로 다룬다.
 *
 * 풀숲은 인카운터 표와의 교차검증으로 확정했다: 오버월드 67개 존에서
 * "육상 인카운터가 있다 ⟺ 0x0002 타일이 있다"가 오탐·누락 0으로 성립한다.
 * 완전히 독립된 두 자료(타일 격자와 pl_enc_data)의 대조라 우연히 맞을 수 없다.
 *
 * ⚠️ 처음엔 0x0015를 풀숲으로 봤다. 빈도 2위에 넓은 덩어리 분포라는 이유였는데,
 * 같은 교차검증에서 33:34로 깨졌다 — 231번**수로**에 0x0015가 6912칸인데 육상
 * 출현률이 0이고, 217번도로는 출현률 30인데 0x0015가 하나도 없었다. 물이었다.
 * 빈도와 분포 모양은 의미의 근거가 되지 못한다.
 */
export const Behavior = {
  NORMAL: 0x0000,
  TALL_GRASS: 0x0002,
  /** 넓은 수면. 수로(W) 존을 채운다 — W231에만 6912칸 */
  WATER_OPEN: 0x0015,
  /** 작은 물. 13개 존에 1114칸뿐이고 트윈리프의 연못이 여기다 */
  WATER_POND: 0x0010,
  /**
   * 갈색 턱. 한쪽으로만 뛰어넘을 수 있다 (`actor/ledge`).
   *
   * 셋 다 통행 불가로 표시돼 있으면서 **양옆이 다 걸을 수 있는** 유일한 값들이고,
   * 셋 다 `allpeak` 그림을 쓴다. 남쪽 것이 305칸으로 압도적이다 — 원작에서
   * 턱은 대개 아래로 뛰어내리는 것이다
   */
  LEDGE_SOUTH: 0x003b,
  LEDGE_WEST: 0x0039,
  LEDGE_EAST: 0x0038,
} as const

/**
 * 물 판정.
 *
 * 두 값을 합쳐야 맞다 — 파도타기가 있는 36개 존 중 **35개**를 덮고 누락은 1개다.
 * 하나씩 보면 어느 쪽도 결정적이지 않다: 0x0015는 오탐 11(수면은 있는데 파도타기
 * 표가 없는 존), 0x0010은 오탐 0이지만 누락 23이다.
 *
 * ⚠️ 처음엔 0x0015만 물로 적었다. 트윈리프 연못이 파랗게 렌더되지 않아서 들켰다 —
 * 그 연못은 0x0010이다. 하나를 찾았다고 그게 전부라고 볼 근거는 없었다.
 */
export function isWater(behavior: number): boolean {
  return behavior === Behavior.WATER_OPEN || behavior === Behavior.WATER_POND
}

/**
 * 이동 시스템이 필요로 하는 것의 전부. 존 격자든 오버월드 전역 격자든
 * 이것만 만족하면 갈아 끼울 수 있다 — 실내(존)와 실외(오버월드)는 격자의
 * 크기와 출처가 다를 뿐 이동 코드에는 같은 것이다.
 */
export interface CollisionGrid {
  /** 월드 좌표(1타일 = 1유닛) 기준 */
  isBlockedAtWorld(x: number, z: number): boolean
  /**
   * 그 자리의 지면 높이(타일 단위). 높이 데이터가 없으면 null.
   *
   * `near`는 지금 높이다 — 다리와 그 밑처럼 판이 겹치는 자리에서 어느 층인지
   * 가르는 유일한 단서라 이동 코드가 반드시 넘겨야 한다 (DATA.md §2.2)
   */
  heightAtWorld(x: number, z: number, near?: number): number | null
}

export interface Building {
  model: number
  x: number
  y: number
  z: number
  rot: [number, number, number]
  scale: [number, number, number]
}

/** 현재 이동 판정에 쓰이는 격자. 씬이 넣고 이동 시스템이 읽는다 */
export const activeZone: { grid: CollisionGrid | null } = { grid: null }
