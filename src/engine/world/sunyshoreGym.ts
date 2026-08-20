// 물가시티 체육관 — 도는 톱니 (`gym_features.c`의 `SunyshoreGym_*`)
//
// 여덟째 뱃지의 방이다. 방 셋이 이어져 있고 각 방의 톱니가 **90도씩 돌면서
// 길을 여닫는다.** 없으면 첫 방에서 관장 쪽으로 한 걸음도 못 간다.
//
// ⚠️ **길이 격자에 없다.** 톱니의 살이 막는 자리는 맵 타일이 아니라 표다 —
// 방마다 상자 목록이 있고(12·18·40개), 회전 상태 넷마다 그중 어느 것이
// 막히는지가 또 표다(6·11·14개). 그래서 이 표 둘이 없으면 톱니는 돌지만
// 지나갈 수 있는 자리가 하나도 안 바뀐다.
//
// 단추가 셋이다: 보통(+1) · 거꾸로(−1) · 두 배(+2).
//
// ⚠️ **처음 회전 상태가 방마다 다르고, 들어온 문이 그것을 뒤집는다.**
// 앞 방에서 들어오면(그 방의 `entranceZ`) 0에서 시작하고, 뒤에서 돌아오면
// 방마다 2·1·0으로 선다 — 되돌아 나가는 길이 그때 열려 있어야 하기 때문이다

/** `SUNYSHORE_GYM_NUM_ROOMS` */
export const SUNYSHORE_ROOMS = 3
/** `SUNYSHORE_NUM_ROTATION_STATES` */
export const SUNYSHORE_STATES = 4

/** `SUNYSHORE_GYM_BUTTON_*` */
export const SUNYSHORE_BUTTON = { normal: 0, reverse: 1, double: 2 } as const
export type SunyshoreButton = typeof SUNYSHORE_BUTTON[keyof typeof SUNYSHORE_BUTTON]

/** 방마다의 맵 헤더 번호 */
export const SUNYSHORE_GYM_MAPS: readonly number[] = [154, 155, 156]

/**
 * 톱니 하나 (`SunyshoreGymGearSetup`).
 *
 * `turn`은 처음 각(90도 단위), `cw`면 시계 방향으로 돈다. `vertical`인 톱니는
 * 벽에 붙어 있어서 y가 아니라 **x축**으로 돈다
 */
interface SunyshoreGear {
  model: number
  x: number
  y: number
  z: number
  turn: number
  cw: boolean
  vertical: boolean
}

/**
 * `sSunyshoreRoom{1,2,3}Gears` 그대로. 모델 번호는
 * `res/field/props/models/meson.build`의 차례다 (458~464)
 */
export const SUNYSHORE_GEARS: readonly (readonly SunyshoreGear[])[] = [
  [
    { model: 459, x: 3, y: 0, z: 8, turn: 1, cw: false, vertical: false },
    { model: 460, x: 8, y: 0, z: 8, turn: 2, cw: true, vertical: false },
    { model: 459, x: 13, y: 0, z: 8, turn: 0, cw: false, vertical: false },
  ],
  [
    { model: 459, x: 6, y: 0, z: 8, turn: 1, cw: false, vertical: false },
    { model: 458, x: 11, y: 0, z: 8, turn: 3, cw: true, vertical: false },
    { model: 463, x: 15, y: 3, z: 8, turn: 1, cw: true, vertical: true },
    { model: 463, x: 2, y: 3, z: 13, turn: 1, cw: false, vertical: true },
    { model: 458, x: 6, y: 0, z: 13, turn: 2, cw: true, vertical: false },
    { model: 461, x: 11, y: 0, z: 13, turn: 2, cw: false, vertical: false },
  ],
  [
    { model: 461, x: 6, y: 6, z: 8, turn: 1, cw: false, vertical: false },
    { model: 460, x: 11, y: 6, z: 8, turn: 0, cw: true, vertical: false },
    { model: 462, x: 16, y: 6, z: 8, turn: 0, cw: false, vertical: false },
    { model: 463, x: 2, y: 3, z: 13, turn: 0, cw: true, vertical: true },
    { model: 460, x: 6, y: 6, z: 13, turn: 1, cw: true, vertical: false },
    { model: 461, x: 11, y: 6, z: 13, turn: 3, cw: false, vertical: false },
    { model: 462, x: 16, y: 6, z: 13, turn: 3, cw: true, vertical: false },
    { model: 463, x: 20, y: 3, z: 13, turn: 1, cw: false, vertical: true },
    { model: 464, x: 2, y: 3, z: 18, turn: 0, cw: false, vertical: true },
    { model: 459, x: 6, y: 0, z: 18, turn: 1, cw: true, vertical: false },
    { model: 462, x: 11, y: 0, z: 18, turn: 3, cw: false, vertical: false },
    { model: 461, x: 16, y: 0, z: 18, turn: 0, cw: true, vertical: false },
    { model: 464, x: 20, y: 3, z: 18, turn: 1, cw: true, vertical: true },
  ],
]

/**
 * 톱니가 막는 상자들 (`sSunyshoreRoom{n}CollisionRegions`).
 *
 * `[x, z, sizeX, sizeZ]`다. 상자 자체는 안 움직인다 — **회전 상태가 그중
 * 어느 것을 켜는지**만 바꾼다
 */
export const SUNYSHORE_REGIONS: readonly (readonly (readonly [number, number, number, number])[])[] = [
  [[1, 8, 2, 1], [3, 6, 1, 2], [4, 8, 2, 1], [3, 9, 1, 2], [6, 8, 2, 1], [8, 6, 1, 2],
    [9, 8, 2, 1], [8, 9, 1, 2], [11, 8, 2, 1], [13, 6, 1, 2], [14, 8, 2, 1], [13, 9, 1, 2]],
  [[4, 8, 2, 1], [6, 6, 1, 2], [7, 8, 2, 1], [6, 9, 1, 2], [9, 8, 2, 1], [11, 6, 1, 2],
    [12, 8, 2, 1], [11, 9, 1, 2], [15, 6, 1, 5], [2, 11, 1, 5], [4, 13, 2, 1], [6, 11, 1, 2],
    [7, 13, 2, 1], [6, 14, 1, 2], [9, 13, 2, 1], [11, 11, 1, 2], [12, 13, 2, 1], [11, 14, 1, 2]],
  [[4, 8, 2, 1], [6, 6, 1, 2], [7, 8, 2, 1], [6, 9, 1, 2], [9, 8, 2, 1], [11, 6, 1, 2],
    [12, 8, 2, 1], [11, 9, 1, 2], [14, 8, 2, 1], [16, 6, 1, 2], [17, 8, 2, 1], [16, 9, 1, 2],
    [2, 11, 1, 5], [4, 13, 2, 1], [6, 11, 1, 2], [7, 13, 2, 1], [6, 14, 1, 2], [9, 13, 2, 1],
    [11, 11, 1, 2], [12, 13, 2, 1], [11, 14, 1, 2], [14, 13, 2, 1], [16, 11, 1, 2],
    [17, 13, 2, 1], [16, 14, 1, 2], [20, 11, 1, 5], [2, 16, 1, 5], [4, 18, 2, 1],
    [6, 16, 1, 2], [7, 18, 2, 1], [6, 19, 1, 2], [9, 18, 2, 1], [11, 16, 1, 2],
    [12, 18, 2, 1], [11, 19, 1, 2], [14, 18, 2, 1], [16, 16, 1, 2], [17, 18, 2, 1],
    [16, 19, 1, 2], [20, 16, 1, 5]],
]

/**
 * 회전 상태마다 켜지는 상자 번호 (`sSunyshoreRoom{n}State{s}Collisions`).
 *
 * ⚠️ **원작 표에 덧대기가 있다.** 2번 방의 상태 1·3이 아홉 개뿐인데 열한 칸을
 * 쓰려고 앞 번호를 두 번 더 적어 두었다(`0, 0`과 `2, 2`). 겹치는 것은 뜻이
 * 없으므로 지우고 옮긴다 — 켜진 상자 목록이라 두 번 켜도 결과가 같다
 */
export const SUNYSHORE_BLOCKED: readonly (readonly (readonly number[])[])[] = [
  [[1, 2, 4, 5, 10, 11], [0, 1, 5, 6, 9, 10], [0, 3, 6, 7, 8, 9], [2, 3, 4, 7, 8, 11]],
  [[1, 2, 4, 5, 7, 8, 9, 10, 11, 12, 15], [0, 1, 4, 5, 6, 11, 12, 13, 14],
    [0, 3, 5, 6, 7, 8, 9, 10, 12, 13, 17], [2, 3, 4, 6, 7, 10, 11, 13, 16]],
  [[2, 6, 7, 11, 14, 15, 17, 21, 25, 28, 29, 31, 38, 39],
    [1, 4, 7, 10, 12, 15, 16, 20, 22, 26, 29, 30, 34, 35],
    [0, 4, 5, 9, 13, 16, 19, 23, 25, 27, 30, 33, 36, 39],
    [3, 5, 6, 8, 12, 13, 14, 18, 24, 26, 27, 28, 32, 37]],
]

/**
 * 방마다의 처음 회전 상태와, 그것을 0으로 되돌리는 입구 z
 * (`PersistedMapFeatures_InitForSunyshoreGym`).
 *
 * 앞 방에서 걸어 들어오면 0에서 시작하고, 뒤에서 돌아오면 이 값으로 선다
 */
export const SUNYSHORE_ENTRY: readonly { state: number; entranceZ: number }[] = [
  { state: 2, entranceZ: 14 },
  { state: 1, entranceZ: 21 },
  { state: 0, entranceZ: 25 },
]

/** 소품이 칸 한가운데에 선다 (`SUNYSHORE_PROP_OFFSET` = 8/16칸) */
export const SUNYSHORE_PROP_OFFSET = 0.5

/**
 * 한 프레임에 도는 각(라디안). `SUNYSHORE_ROTATION_STEP`이 5.625도다 —
 * 90도가 열여섯 프레임이고 180도가 서른둘이다
 */
export const SUNYSHORE_STEP = (5.625 * Math.PI) / 180

/** `SEQ_SE_DP_GAGAGA` — 도는 동안 난다 */
export const SUNYSHORE_SFX = 1599

export function sunyshoreRoomOf(map: number): number | null {
  const at = SUNYSHORE_GYM_MAPS.indexOf(map)
  return at < 0 ? null : at
}

/** 들어설 때의 회전 상태 */
export function sunyshoreStateOnEnter(room: number, enterZ: number): number {
  const entry = SUNYSHORE_ENTRY[room]
  if (entry === undefined) return 0
  return enterZ === entry.entranceZ ? 0 : entry.state
}

/** 단추를 누른 뒤의 회전 상태 (`SunyshoreGym_PressButton`) */
export function sunyshoreNextState(state: number, button: SunyshoreButton): number {
  if (button === SUNYSHORE_BUTTON.normal) return (state + 1) % SUNYSHORE_STATES
  if (button === SUNYSHORE_BUTTON.reverse) return (state + SUNYSHORE_STATES - 1) % SUNYSHORE_STATES
  return (state + 2) % SUNYSHORE_STATES
}

/** 그 단추가 몇 도를 도는가(라디안) */
export function sunyshoreTurnAngle(button: SunyshoreButton): number {
  return button === SUNYSHORE_BUTTON.double ? Math.PI : Math.PI / 2
}

/**
 * 그 칸이 톱니에 막혔는가 (`SunyshoreGym_DynamicMapFeaturesCheckCollision`).
 *
 * 막힌 상자에 들면 참, 아니면 `null` — **거짓이 아니다.** 원작이 안 걸린
 * 칸에서는 아예 「이 장치는 이 칸을 모른다」를 내고 평소 격자 판정으로 내려간다
 */
export function sunyshoreBlocked(
  room: number, state: number, tileX: number, tileZ: number,
): boolean | null {
  const regions = SUNYSHORE_REGIONS[room]
  const on = SUNYSHORE_BLOCKED[room]?.[state]
  if (regions === undefined || on === undefined) return null
  for (const index of on) {
    const r = regions[index]
    if (r === undefined) continue
    const [x, z, sizeX, sizeZ] = r
    if (tileX >= x && tileX < x + sizeX && tileZ >= z && tileZ < z + sizeZ) return true
  }
  return null
}

/**
 * 톱니 하나가 지금 향한 각(라디안).
 *
 * ⚠️ **처음 각과 회전 방향이 따로다.** 처음 각은 늘 더하고, 상태만큼의 각은
 * 시계 방향 톱니에서 **뺀다** (`SunyshoreGym_SetGearRotation`) — 맞물린 톱니
 * 둘이 서로 반대로 돌기 때문이다
 */
export function sunyshoreGearAngle(gear: SunyshoreGear, state: number): number {
  const quarter = Math.PI / 2
  return quarter * gear.turn + (gear.cw ? -1 : 1) * quarter * state
}
