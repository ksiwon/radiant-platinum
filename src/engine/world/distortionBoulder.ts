// 깨어진 세계의 **바위 수수께끼** (PARITY §6.10) — `DistWorldFallingBoulder_*`
//
// B5F의 바위 셋을 구멍으로 밀어 떨어뜨리면 한 층 아래 B6F에 떨어지고, 거기서
// 다시 밀어 저마다의 웅덩이에 넣으면 갇혀 있던 유크시·엠라이트·아그놈이
// 풀린다. 셋을 다 넣어야 시로나가 아래로 가는 발판을 내준다.
//
// 밀린 바위가 「떨어지는 자리」에 닿았는가만 표가 정한다 —
// **열네 자리뿐이고 나머지는 그냥 못 민다.**
//
//   B5F 세 자리   자리표가 `INVALID`  → 한 층 아래로 떨어진다
//   B6F 웅덩이 셋 저마다의 자리 번호   → 아직 안 찼으면 **맞는 웅덩이**
//   B6F 나머지 여덟                     → **틀린 웅덩이** (바위가 사라진다)
//
// ⚠️ **「틀린 웅덩이」에 빠진 바위는 B5F로 되돌아간다.** 없어지는 것이 아니라
// 처음 자리에 다시 놓인다 (`..._TickToWrongPit`이 B5F 자리를 세운다) —
// 안 그러면 수수께끼를 영영 못 푼다
import { MAP } from './distortion'
import { DIST_OBJ } from './distortionElevator'

/** `DistWorldPersistedBoulderPuzzleFlag` — 세이브의 열일곱 자리 */
export const PUZZLE_FLAG = {
  mespritBoulderInB5F: 0,
  azelfBoulderInB5F: 1,
  uxieBoulderInB5F: 2,
  mespritBoulderInB6FOutside: 3,
  azelfBoulderInB6FOutside: 4,
  uxieBoulderInB6FOutside: 5,
  mespritBoulderInB6FPit: 6,
  azelfBoulderInB6FPit: 7,
  uxieBoulderInB6FPit: 8,
  dummy9: 9,
  uxieTutoSeen: 10,
  azelfTutoSeen: 11,
  mespritTutoSeen: 12,
  uxieInB6F: 13,
  azelfInB6F: 14,
  mespritInB6F: 15,
  giratinaRoomPlatformsVisible: 16,
} as const

/** `DIST_WORLD_PUZZLE_FLAG_COUNT` = `..._INVALID` */
export const PUZZLE_FLAG_NONE = 17

/**
 * 새 판의 바위 자리 (`InitPersistedData`).
 *
 * 수수께끼를 이미 푼 세이브로 다시 들어오면 바위가 B5F가 아니라 **웅덩이에**
 * 들어 있고 안내 연출도 다 본 것으로 친다
 */
export function initialPuzzleFlags(finished: boolean): number {
  if (!finished) {
    return (1 << PUZZLE_FLAG.mespritBoulderInB5F) | (1 << PUZZLE_FLAG.azelfBoulderInB5F)
      | (1 << PUZZLE_FLAG.uxieBoulderInB5F)
  }
  return (1 << PUZZLE_FLAG.uxieTutoSeen) | (1 << PUZZLE_FLAG.azelfTutoSeen)
    | (1 << PUZZLE_FLAG.mespritTutoSeen) | (1 << PUZZLE_FLAG.mespritBoulderInB6FPit)
    | (1 << PUZZLE_FLAG.azelfBoulderInB6FPit) | (1 << PUZZLE_FLAG.uxieBoulderInB6FPit)
}

/**
 * 원작의 `-1`. 어떤 자리 번호도 아니라서 늘 「틀린 웅덩이」로 간다.
 *
 * `PUZZLE_FLAG_NONE`(17)과 **다른 값이어야 한다** — 원작이 `u32` 칸에 −1을
 * 넣어 두어 0xFFFFFFFF가 되고, 그래서 `switch`의 어느 `case`에도 안 걸린다
 */
export const WRONG_PIT = -1

/**
 * 바위가 떨어지는 자리 (`sBoulderFallLocations`).
 *
 * ⚠️ **`flag`가 −1인 여덟 자리는 `PUZZLE_FLAG_NONE`이 아니다.** 원작이
 * `u32`에 −1을 넣어 두어서 0xFFFFFFFF가 되고, `switch`의 `INVALID`(17)에도
 * 세 웅덩이에도 안 걸려 **`default`로 떨어진다** — 그것이 「틀린 웅덩이」다.
 * 둘을 같은 값으로 합치면 B6F의 엉뚱한 구멍이 전부 정답이 된다
 */
export const BOULDER_FALL_LOCATIONS: readonly {
  map: number; x: number; z: number; flag: number
}[] = [
  { map: MAP.b5f, x: 0x4c, z: 0x44, flag: PUZZLE_FLAG_NONE },
  { map: MAP.b5f, x: 0x61, z: 0x43, flag: PUZZLE_FLAG_NONE },
  { map: MAP.b5f, x: 0x56, z: 0x39, flag: PUZZLE_FLAG_NONE },
  { map: MAP.b6f, x: 0x44, z: 0x43, flag: PUZZLE_FLAG.mespritBoulderInB6FPit },
  { map: MAP.b6f, x: 0x4b, z: 0x43, flag: WRONG_PIT },
  { map: MAP.b6f, x: 0x4f, z: 0x43, flag: WRONG_PIT },
  { map: MAP.b6f, x: 0x60, z: 0x44, flag: PUZZLE_FLAG.azelfBoulderInB6FPit },
  { map: MAP.b6f, x: 0x64, z: 0x44, flag: WRONG_PIT },
  { map: MAP.b6f, x: 0x69, z: 0x44, flag: WRONG_PIT },
  { map: MAP.b6f, x: 0x55, z: 0x3c, flag: PUZZLE_FLAG.uxieBoulderInB6FPit },
  { map: MAP.b6f, x: 0x55, z: 0x38, flag: WRONG_PIT },
  { map: MAP.b6f, x: 0x55, z: 0x39, flag: WRONG_PIT },
  { map: MAP.b6f, x: 0x55, z: 0x34, flag: WRONG_PIT },
  { map: MAP.b6f, x: 0x55, z: 0x35, flag: WRONG_PIT },
]

export const FALL_DEST = { b6f: 0, correctPit: 1, wrongPit: 2 } as const

/** 그 칸이 떨어지는 자리인가 (`FindBoulderFallLocationFlag`) */
export function fallLocationAt(map: number, x: number, z: number): number | null {
  for (const l of BOULDER_FALL_LOCATIONS) {
    if (l.map === map && l.x === x && l.z === z) return l.flag
  }
  return null
}

/**
 * 밀면 떨어지는가 (`DistWorld_WillBoulderBeAtFallLocation`).
 *
 * 미는 쪽의 **한 칸 앞**을 본다 — 원작이 밀기 전에 이걸 물어서 「떨어지는
 * 연출」과 「그냥 미는 연출」을 가른다
 */
export function willFall(
  map: number, x: number, z: number, step: { x: number; z: number },
): boolean {
  return fallLocationAt(map, x + step.x, z + step.z) !== null
}

/**
 * 떨어진 바위가 어디로 가는가 (`DistWorldFallingBoulder_New`).
 *
 * ⚠️ **이미 찬 웅덩이도 「틀린 웅덩이」다** — 같은 구멍에 둘째 바위를 밀어
 * 넣으면 그냥 사라진다. 원작의 `switch`가 `break` 없이 흘러내려 `default`에
 * 닿는 자리다
 */
export function fallDestination(flag: number, puzzleFlags: number): number {
  if (flag === PUZZLE_FLAG_NONE) return FALL_DEST.b6f
  if (flag === PUZZLE_FLAG.mespritBoulderInB6FPit || flag === PUZZLE_FLAG.azelfBoulderInB6FPit
    || flag === PUZZLE_FLAG.uxieBoulderInB6FPit) {
    if ((puzzleFlags & (1 << flag)) === 0) return FALL_DEST.correctPit
  }
  return FALL_DEST.wrongPit
}

export function withPuzzleFlag(flags: number, index: number, on: boolean): number {
  if (index >= PUZZLE_FLAG_NONE || index < 0) return flags
  return on ? flags | (1 << index) : flags & ~(1 << index)
}

/**
 * 한 층 아래로 떨어졌다 (`..._TickToB6F`).
 *
 * 바위는 지워지지 않고 **B6F 것으로 다시 등록된다** — 그래서 같은 번호(128~130)를
 * 그대로 쓰고 층만 바뀐다
 */
export function fellToB6F(flags: number, localID: number): number {
  const pair = BOULDER_BY_LOCAL_ID[localID]
  if (pair === undefined) return flags
  return withPuzzleFlag(withPuzzleFlag(flags, pair.outside, true), pair.inB5F, false)
}

/** 맞는 웅덩이에 들어갔다 (`..._TickToCorrectPit`의 1·2단계) */
export function fellIntoPit(
  flags: number, localID: number,
): { flags: number; localID: number; script: number } | null {
  const pair = BOULDER_BY_LOCAL_ID[localID]
  if (pair === undefined) return null
  let next = withPuzzleFlag(flags, pair.pit, true)
  next = withPuzzleFlag(next, pair.outside, false)
  // 웅덩이가 차면 그 위에 갇혀 있던 셋 중 하나가 풀린다
  next = withPuzzleFlag(next, pair.mon, false)
  return { flags: next, localID: pair.inPit, script: pair.script }
}

/** 틀린 웅덩이에 빠졌다 (`..._TickToWrongPit`). 바위가 B5F 자리로 되돌아간다 */
export function fellIntoWrongPit(flags: number, localID: number): number {
  const pair = BOULDER_BY_LOCAL_ID[localID]
  if (pair === undefined) return flags
  return withPuzzleFlag(withPuzzleFlag(flags, pair.inB5F, true), pair.outside, false)
}

/** 셋을 다 넣었는가 (`..._TickToCorrectPit`의 3단계) */
export function puzzleSolved(flags: number): boolean {
  const bits = (1 << PUZZLE_FLAG.mespritBoulderInB6FPit)
    | (1 << PUZZLE_FLAG.azelfBoulderInB6FPit) | (1 << PUZZLE_FLAG.uxieBoulderInB6FPit)
  return (flags & bits) === bits
}

/**
 * 바위 셋의 자리 번호 묶음.
 *
 * `script`는 웅덩이가 찼을 때 서는 스크립트다 — 엠라이트 5 · 유크시 6 ·
 * 아그놈 7 (`..._TickToCorrectPit`의 마지막 `switch`)
 */
const BOULDER_BY_LOCAL_ID: Readonly<Record<number, {
  inB5F: number; outside: number; pit: number; mon: number; inPit: number; script: number
}>> = {
  [DIST_OBJ.b6fMespritBoulderOutside]: {
    inB5F: PUZZLE_FLAG.mespritBoulderInB5F,
    outside: PUZZLE_FLAG.mespritBoulderInB6FOutside,
    pit: PUZZLE_FLAG.mespritBoulderInB6FPit,
    mon: PUZZLE_FLAG.mespritInB6F,
    inPit: DIST_OBJ.b6fMespritBoulderInPit,
    script: 5,
  },
  [DIST_OBJ.b6fAzelfBoulderOutside]: {
    inB5F: PUZZLE_FLAG.azelfBoulderInB5F,
    outside: PUZZLE_FLAG.azelfBoulderInB6FOutside,
    pit: PUZZLE_FLAG.azelfBoulderInB6FPit,
    mon: PUZZLE_FLAG.azelfInB6F,
    inPit: DIST_OBJ.b6fAzelfBoulderInPit,
    script: 7,
  },
  [DIST_OBJ.b6fUxieBoulderOutside]: {
    inB5F: PUZZLE_FLAG.uxieBoulderInB5F,
    outside: PUZZLE_FLAG.uxieBoulderInB6FOutside,
    pit: PUZZLE_FLAG.uxieBoulderInB6FPit,
    mon: PUZZLE_FLAG.uxieInB6F,
    inPit: DIST_OBJ.b6fUxieBoulderInPit,
    script: 6,
  },
}
