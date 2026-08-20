// 연고시티 체육관 — 문 고르기 (`gym_features.c`의 `HearthomeGym_*`)
//
// 셋째 뱃지의 방이다. 안개가 자욱한 방 둘에 **같아 보이는 문이 여럿** 있고
// 그중 하나만 앞으로 간다. 나머지는 밟는 순간 입구로 되돌려진다.
//
// ⚠️ **문을 잠그는 것이 아니라 목적지를 갈아 끼운다.** 원작이 맵에 들어설
// 때 틀린 문들의 워프 목적지를 **입구 방**으로 바꿔 놓는다
// (`MapHeaderData_SetWarpEventDestHeaderID`) — 문 자체는 다 열려 있다.
// 이게 없으면 어느 문으로 나가도 앞으로 가서 방이 통째로 뜻이 없어진다.
//
// ⚠️ **들어설 때마다 다시 뽑는다.** 원작이 `initialized`를 두고 「한 번만」인
// 척하지만, 방에 들어설 때마다 도는 `InitPersistedMapFeaturesForHearthomeGym`이
// 그 자리를 통째로 0으로 지운다 — 그래서 그 값은 늘 거짓이고 문도 힌트도
// 매번 새로 뽑힌다. 나갔다 들어오면 답이 바뀐다.
//
// ⚠️ **힌트 그림은 아직 못 그린다.** 원작이 뽑은 칸의 바닥에 문 무늬를
// 띄우는데(`ov5_021F4CEC`), 그 자리에 세울 렌더러가 우리에게 없다. 뽑는
// 자리까지는 여기서 정해 두므로 붙일 때 이어 쓰면 된다

/** `HEARTHOME_DOOR_ID_*` */
const HEARTHOME_DOOR = {
  circle: 0, square: 1, triangle: 2,
  sun: 3, donut: 4, moon: 5, star: 6, heart: 7,
  exit: 8,
} as const

/** 문이 있는 방 둘의 맵 헤더 번호와, 되돌려 보낼 입구 방 */
export const HEARTHOME_TRAINER_ROOMS: readonly number[] = [89, 90]
export const HEARTHOME_ENTRANCE_ROOM = 88
/** 되돌려질 때 나오는 입구 방의 워프 번호 (`SetWarpEventDestWarpID(…, 1)`) */
export const HEARTHOME_ENTRANCE_ANCHOR = 1

interface HearthomeRoom {
  map: number
  /** 이 방의 첫 문 번호 */
  firstDoor: number
  /** 앞으로 가는 문이 될 수 있는 개수 */
  doors: number
  /** 힌트를 놓을 수 있는 상자 */
  offsetX: number
  offsetZ: number
  sizeX: number
  sizeZ: number
}

/** `sTrainerRoomLayouts` 그대로 */
export const HEARTHOME_ROOMS: readonly HearthomeRoom[] = [
  { map: 89, firstDoor: HEARTHOME_DOOR.circle, doors: 3, offsetX: 1, offsetZ: 3, sizeX: 15, sizeZ: 8 },
  { map: 90, firstDoor: HEARTHOME_DOOR.sun, doors: 5, offsetX: 1, offsetZ: 3, sizeX: 27, sizeZ: 20 },
]

/** `sTrainerRoom{1,2}Doors` — 문 번호와 그 문이 놓인 칸 */
const HEARTHOME_DOORS: readonly (readonly { id: number; x: number; z: number }[])[] = [
  [
    { id: HEARTHOME_DOOR.circle, x: 4, z: 2 },
    { id: HEARTHOME_DOOR.square, x: 8, z: 2 },
    { id: HEARTHOME_DOOR.triangle, x: 12, z: 2 },
  ],
  [
    { id: HEARTHOME_DOOR.sun, x: 4, z: 2 },
    { id: HEARTHOME_DOOR.donut, x: 9, z: 2 },
    { id: HEARTHOME_DOOR.moon, x: 14, z: 2 },
    { id: HEARTHOME_DOOR.star, x: 19, z: 2 },
    { id: HEARTHOME_DOOR.heart, x: 24, z: 2 },
  ],
]

export function hearthomeRoomOf(map: number): number | null {
  const at = HEARTHOME_ROOMS.findIndex((r) => r.map === map)
  return at < 0 ? null : at
}

/** 뽑은 결과 */
export interface HearthomePuzzle {
  /** 앞으로 가는 문 */
  correctDoor: number
  /** 힌트를 놓은 칸 */
  clueX: number
  clueZ: number
}

/**
 * 문과 힌트 자리를 뽑는다 (`HearthomeGym_DynamicMapFeaturesInit`).
 *
 * ⚠️ **힌트 자리는 「놓을 수 있는 칸」이 나올 때까지 다시 뽑는다.** 원작이
 * 벽·소품 칸을 거르는 표를 두고 `do…while`로 돈다. 그 표를 안 옮겨도 되게
 * `allowed`를 받는다 — 부르는 쪽이 격자로 판정하면 같은 결과가 나온다
 *
 * @param rng 0 이상 1 미만. 원작은 `MTRNG_Next() % n`이다
 * @param allowed 그 칸에 힌트를 놓아도 되는가
 */
export function rollHearthomePuzzle(
  room: HearthomeRoom, rng: () => number,
  allowed: (x: number, z: number) => boolean,
): HearthomePuzzle {
  const correctDoor = room.firstDoor + Math.floor(rng() * room.doors)
  for (let tries = 0; tries < 1000; tries++) {
    const clueX = room.offsetX + Math.floor(rng() * room.sizeX)
    const clueZ = room.offsetZ + Math.floor(rng() * room.sizeZ)
    if (allowed(clueX, clueZ)) return { correctDoor, clueX, clueZ }
  }
  // 원작에 없는 안전줄이다 — 놓을 칸이 하나도 없으면 영영 돈다
  return { correctDoor, clueX: room.offsetX, clueZ: room.offsetZ }
}

/** 그 방에서 되돌려 보내야 하는 문들 (고른 문만 빼고 전부) */
export function hearthomeWrongDoors(
  roomIndex: number, correctDoor: number,
): readonly { id: number; x: number; z: number }[] {
  return (HEARTHOME_DOORS[roomIndex] ?? []).filter((d) => d.id !== correctDoor)
}
