// 영원시티 체육관 — 꽃시계 (`gym_features.c`의 `EternaGym_*`)
//
// 둘째 뱃지의 방이다. 바닥에 지름 열세 칸짜리 꽃시계가 있고 **바늘 둘이 벽
// 노릇을 한다.** 트레이너를 하나씩 이길 때마다 시각이 바뀌고, 바늘이 돌면서
// 길이 열린다. 없으면 첫 트레이너에게도 못 간다.
//
//   처음        7시 25분
//   첫째를 이김  6시 15분
//   둘째를 이김  9시 15분
//   셋째를 이김  0시 45분
//   관장을 이김  0시 30분
//
// ⚠️ **막는 자리를 바늘 각으로 안 센다.** 원작이 상태 다섯마다 13×13 표를
// 통째로 구워 두었다 — 각으로 다시 세면 시계가 다른 방이 된다.
//
// ⚠️ **분침 자리는 뛰어넘는다.** 시침이 가로지르는 칸 하나가 상태마다 정해져
// 있고, 그 칸에서 **바늘과 직각인 쪽으로만** 뛴다 (`EternaGym_IsHourHandJumpTile`) —
// 뛰지 못하면 시계 한가운데가 막힌 채로 남는다.
//
// ⚠️ **분수 줄도 같이 열린다.** 방 남쪽 z = 19의 한 줄이 상태마다 따로
// 열리는데(`sEternaGymFountainCollision`), 셋째 트레이너를 이겨야 통째로 뚫린다

/** `enum EternaGymClockState` */
export const ETERNA_CLOCK = {
  initial: 0,
  firstTrainer: 1,
  secondTrainer: 2,
  thirdTrainer: 3,
  gymLeader: 4,
} as const

/** `ETERNA_CLOCK_MAX` */
export const ETERNA_CLOCK_STATES = 5

/** 영원시티 체육관의 맵 헤더 번호 */
export const ETERNA_GYM_MAP = 67

/**
 * 시계 상태를 담는 변수 (`VAR_ETERNA_GYM_FLOWER_CLOCK_STATE`).
 *
 * ⚠️ **줄 번호가 아니라 C 열거형으로 센 값이다** — `vars_flags.txt`에 별명
 * 줄이 여럿이라 줄로 세면 어긋난다 (깨어진 세계 쪽과 같은 셈이다)
 */
export const VAR_ETERNA_GYM_FLOWER_CLOCK_STATE = 16459

/** 시계 판의 자리 (`ETERNA_CLOCK_*_BOUND`). 지름 열세 칸이다 */
export const ETERNA_CLOCK_DIAMETER = 13
export const ETERNA_CLOCK_LEFT = 5
export const ETERNA_CLOCK_TOP = 7
export const ETERNA_CLOCK_CENTER_X = 11
export const ETERNA_CLOCK_CENTER_Z = 13

/** 분수 줄 (`ETERNA_GYM_FOUNTAIN_Z` · `ETERNA_GYM_WIDTH`) */
export const ETERNA_FOUNTAIN_Z = 19
export const ETERNA_GYM_WIDTH = 21

/** 시침·분침 소품 모델 번호 (`res/field/props/models/meson.build`의 차례) */
export const ETERNA_HAND_MODEL = { hour: 537, minute: 536 } as const

/** 바늘이 서는 자리. 시침이 y 12칸, 분침이 13칸으로 한 칸 위다 */
export const ETERNA_HAND_Y = { hour: 12, minute: 13 } as const

/** 상태마다의 시각 (`sEternaGymClockTimes`) */
export const ETERNA_CLOCK_TIMES: readonly { hour: number; minute: number }[] = [
  { hour: 7, minute: 25 },
  { hour: 6, minute: 15 },
  { hour: 9, minute: 15 },
  { hour: 0, minute: 45 },
  { hour: 0, minute: 30 },
]

/**
 * 시계 판 13×13의 통행 (`sEternaGymClockCollision`). 1이 막힌 칸이다.
 *
 * ⚠️ **처음 상태는 판 전체가 막혀 있다** — 맨 아랫줄만 뚫려 있고, 그 줄이
 * 방을 가로지르는 길이다. 트레이너를 이길수록 안쪽이 열린다
 */
export const ETERNA_CLOCK_COLLISION: readonly (readonly number[])[] = [
  [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
  ],
  [
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
  ],
  [
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
  ],
  [
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
  ],
  [
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1,
    0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0,
  ],
]

/** 분수 줄 (`sEternaGymFountainCollision`). z = 19의 스물한 칸이다 */
export const ETERNA_FOUNTAIN_COLLISION: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
]

/**
 * 시침을 뛰어넘는 칸 (`sEternaGymHourHandJumpTiles`).
 *
 * `null`이면 그 상태에는 뛸 자리가 없다. `northSouth`면 남북으로만 뛴다 —
 * 바늘과 직각인 쪽이다
 */
export const ETERNA_JUMP_TILES: readonly ({ x: number; z: number; northSouth: boolean } | null)[] = [
  null,
  { x: 11, z: 18, northSouth: true },
  { x: 6, z: 13, northSouth: false },
  { x: 11, z: 8, northSouth: true },
  { x: 11, z: 8, northSouth: true },
]

/**
 * 그 칸이 지금 막혔는가 (`EternaGym_DynamicMapFeaturesCheckCollision`).
 *
 * ⚠️ **「뚫렸다」는 답이 없다** — 막혔으면 참이고 아니면 `null`이라 격자
 * 판정으로 내려간다. 원작도 통행 가능일 때 `FALSE`를 내서 격자에 넘긴다
 */
export function eternaBlocked(state: number, tileX: number, tileZ: number): boolean | null {
  const clock = ETERNA_CLOCK_COLLISION[state]
  if (clock !== undefined
    && tileZ >= ETERNA_CLOCK_TOP && tileZ <= ETERNA_CLOCK_TOP + ETERNA_CLOCK_DIAMETER - 1
    && tileX >= ETERNA_CLOCK_LEFT && tileX <= ETERNA_CLOCK_LEFT + ETERNA_CLOCK_DIAMETER - 1) {
    const at = (tileZ - ETERNA_CLOCK_TOP) * ETERNA_CLOCK_DIAMETER + (tileX - ETERNA_CLOCK_LEFT)
    if (clock[at] === 1) return true
  }
  // ⚠️ **시계가 먼저고, 시계에 안 걸린 칸만 분수 줄을 본다** (원작의
  // `isColliding == FALSE &&`). 두 상자는 실제로 **겹친다** — 시계 판의 맨
  // 아랫줄이 z = 19이고 분수 줄도 z = 19다. 그래서 셋째 트레이너를 이겨
  // 분수 줄이 통째로 열려도 시계 판의 아랫줄에 걸린 칸(x = 5·6·7·14·15·17)은
  // 그대로 막혀 있다. 차례를 뒤집으면 그 자리가 뚫려 시계를 안 풀고 지나간다
  const fountain = ETERNA_FOUNTAIN_COLLISION[state]
  if (fountain !== undefined && tileZ === ETERNA_FOUNTAIN_Z
    && tileX >= 1 && tileX <= ETERNA_GYM_WIDTH) {
    if (fountain[tileX - 1] === 1) return true
  }
  return null
}

/** `DIR_*` — 원작의 방향 번호 */
const DIR_NORTH = 0
const DIR_SOUTH = 1
const DIR_WEST = 2
const DIR_EAST = 3

/**
 * 그 칸에서 그 쪽으로 시침을 뛰어넘는가 (`EternaGym_IsHourHandJumpTile`).
 *
 * ⚠️ **바늘과 직각인 쪽으로만 뛴다.** 아무 쪽으로나 뛰게 두면 바늘을 따라
 * 걸어 나갈 수 있어서 수수께끼가 없어진다
 */
export function eternaJumpsHourHand(
  state: number, tileX: number, tileZ: number, dir: number,
): boolean {
  const jump = ETERNA_JUMP_TILES[state]
  if (jump === null || jump === undefined) return false
  if (jump.x !== tileX || jump.z !== tileZ) return false
  return jump.northSouth
    ? dir === DIR_NORTH || dir === DIR_SOUTH
    : dir === DIR_WEST || dir === DIR_EAST
}

/** 시각을 넘긴 뒤의 상태. 관장까지 이겼으면 더 안 간다 */
export function eternaNextState(state: number): number | null {
  return state >= ETERNA_CLOCK.gymLeader ? null : state + 1
}

/**
 * 그 시각의 시침·분침 각(라디안).
 *
 * ⚠️ **12시가 0이 아니다.** 원작이 분침에서 90도를 빼고 시침에 180도를 더한다 —
 * 모델이 각각 다른 쪽을 보고 서 있어서다. 그리고 y는 마지막에 뒤집는다
 * (`EternaGym_UpdateHandPropRotation`의 `MAX - y`)
 *
 * ⚠️ **시각 12분의 1이 딱 30도가 아니다.** 원작 표가 3·6·9·12시만 정확한
 * 값(0x4000·0x8000·0xC000·0)을 쓰고 나머지는 0x1559씩 쌓는다 — 0x1559는
 * 65536/12 = 5461.33의 가장 가까운 정수가 **아니다**(5465). 눈에 안 보일 만큼
 * 작지만 우리가 고르지 않은 값이라 그대로 옮긴다
 */
const ETERNA_ONE_HOUR = 0x1559
const ETERNA_FULL = 0x10000

function hourAngleIndex(hour: number): number {
  if (hour === 3) return ETERNA_FULL / 4
  if (hour === 6) return ETERNA_FULL / 2
  if (hour === 9) return (ETERNA_FULL * 3) / 4
  if (hour === 0) return 0
  return ETERNA_ONE_HOUR * hour
}

/** 각 색인(0~0x10000)을 라디안으로. 원작이 65536을 한 바퀴로 센다 */
function toRadians(index: number): number {
  return ((((index % ETERNA_FULL) + ETERNA_FULL) % ETERNA_FULL) / ETERNA_FULL) * Math.PI * 2
}

export function eternaHandAngles(hour: number, minute: number): { hour: number; minute: number } {
  // 분침: 15분 단위면 「시」 표를 그대로 쓰고 아니면 1분에 6도씩이다
  // `DEG_TO_IDX(6) + 1` — 원작 매크로가 `(6 * 0xFFFF) / 360`을 정수로 자르고
  // 거기에 1을 더한다. 65536이 아니라 **0xFFFF**를 쓰는 것까지 그대로다
  const perMinute = Math.floor((6 * 0xffff) / 360) + 1
  const minuteIndex = minute % 15 === 0
    ? hourAngleIndex(minute / 5)
    : minute * perMinute
  const hourIndex = hourAngleIndex(hour % 12)
  return {
    // 원작이 마지막에 `MAX - y`로 뒤집는다
    minute: toRadians(-(minuteIndex - ETERNA_FULL / 4)),
    hour: toRadians(-(hourIndex + ETERNA_FULL / 2)),
  }
}

/** `SEQ_SE_PL_TOKEI21` — 바늘이 도는 동안 난다 */
export const ETERNA_CLOCK_SFX = 1355
