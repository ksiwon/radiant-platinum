// 날마다 바뀌는 것 (PARITY §6.11) — `RecordMixedRNG` + `FieldSystem_HandleDailyEvents`.
//
// **씨앗 하나가 넷을 정한다.** 빈티나가 어느 칸에 있는지, 무리가 어느 도로에
// 뜨는지, 대습초원에 무엇이 나오는지, 트로피가든에 무엇이 있는지.
//
// 원작은 새 게임에서 `MTRNG_Next()`로 한 번 뽑아 두고
// (`game_start.c`), 날짜가 넘어갈 때마다 `daysPassed`번 굴린다
// (`unk_020559DC.c`의 `FieldSystem_HandleDailyEvents`). 그래서 **어제 뽑은 것을
// 오늘 다시 굴리면 어제와 다르다** — 매번 새로 난수를 뽑는 것과 다르다.
//
// ⚠️ **하루가 지나는 것을 흉내 내지 않는다.** 원작이 DS의 실제 시계를 보므로
// 우리도 사람의 달력을 본다. 게임 안 시각(`worldState.time.gameHour`)도 실제
// 시계에서 오므로 둘이 안 어긋난다.

/**
 * `ARNG_Next(seed) = seed * MT19937_F + 1` (`math_util.c`).
 *
 * `MT19937_F`가 1812433253이다. 32비트 곱이라 `Math.imul`이어야 한다 —
 * `*`로 쓰면 배정도에서 아래 비트가 날아가 **다른 수열**이 된다
 */
export const ARNG_MULT = 1812433253

export function arngNext(seed: number): number {
  return (Math.imul(seed >>> 0, ARNG_MULT) + 1) >>> 0
}

/** 씨앗을 세우면 `rand`는 그 한 걸음 뒤다 (`RecordMixedRNG_SetEntrySeed`) */
export function seedRand(seed: number): number {
  return arngNext(seed)
}

/** 하루에 한 걸음. 며칠이 지났으면 그만큼 (`RecordMixedRNG_AdvanceEntries`) */
export function advanceDays(rand: number, days: number): number {
  let at = rand >>> 0
  for (let i = 0; i < days; i++) at = arngNext(at)
  return at
}

/**
 * 이 순간이 며칠째인가 — 지역 시간대의 자정을 경계로 센다.
 *
 * UTC로 세면 한국에서 오전 아홉 시에 날이 바뀐다. 원작은 DS에 맞춰 둔 지역
 * 시계를 보므로 여기도 지역 자정이어야 한다
 */
export function dayNumber(at: Date): number {
  return Math.floor(
    (at.getTime() - at.getTimezoneOffset() * 60_000) / 86_400_000,
  )
}

/** 세이브가 들고 있는 날짜 상태 */
export interface DailyState {
  /** 지금 굴려져 있는 값. 빈티나·무리·대습초원이 이걸 본다 */
  rand: number
  /** 마지막으로 넘긴 날 (`dayNumber`) */
  day: number
  /** 무리가 열렸는가 (`SpecialEncounter_EnableSwarms`) */
  swarms: boolean
  /**
   * 트로피가든 두 자리. 표(16종)의 **자리 번호**고, 없으면 -1이다
   * (`TROPHY_GARDEN_SLOT_NONE`)
   */
  trophy: readonly [number, number]
}

export const TROPHY_SLOT_NONE = -1

export function newDaily(seed: number, day: number): DailyState {
  return { rand: seedRand(seed), day, swarms: false, trophy: [TROPHY_SLOT_NONE, TROPHY_SLOT_NONE] }
}

/**
 * 날이 바뀌었으면 굴린다. 안 바뀌었으면 **같은 값을 그대로** 돌려준다.
 *
 * ⚠️ 시계를 뒤로 돌린 경우도 원작과 같이 다룬다 — `v0 < v1`이면 굴리지 않고
 * 날짜만 맞춘다. 안 그러면 시계를 돌려 가며 빈티나 칸을 갈아 낼 수 있다
 */
export function rollOver(state: DailyState, today: number): DailyState {
  if (today === state.day) return state
  if (today < state.day) return { ...state, day: today }
  return { ...state, rand: advanceDays(state.rand, today - state.day), day: today }
}

// ── 빈티나 (PARITY §1.5) ─────────────────────────────────────────────────────

/** 빈티나가 사는 유일한 맵 (`MapHeader_HasFeebasTiles`) */
export const MAP_MT_CORONET_B1F = 219

/** 빈티나 레벨 (`LoadFeebasLevelRange` — 10~20) */
export const FEEBAS_LEVELS = { min: 10, max: 20 } as const

export interface FeebasData {
  species: number
  /** 구역별 칸 수. 합이 곧 전체 칸 수다 */
  groups: readonly number[]
  /** `z * 32 + x`로 적힌 낚시 칸 목록 */
  tiles: readonly number[]
}

/**
 * 오늘 빈티나가 있는 네 칸 (`PlayerAvatar_IsFacingFeebasTile`).
 *
 * 칸 목록을 넷으로 나누고 각 묶음에서 하나씩 뽑는다. 뽑는 값은 `rand`의
 * **바이트 넷**이다 — 위에서부터 차례로 하나씩.
 *
 * ⚠️ **나머지 칸도 버리지 않는다.** 전체 528칸은 4로 나누어떨어져서 원작에서는
 * `tileOverflow`가 한 번도 안 움직이지만, 나누어떨어지지 않는 표를 넣으면
 * 그 가지가 산다. 지우면 조용히 달라진다
 */
export function feebasTiles(rand: number, data: FeebasData): number[] {
  const total = data.groups.reduce((a, b) => a + b, 0)
  const groupSize = Math.floor(total / 4)
  if (groupSize <= 0) return []
  let excess = total % 4
  let overflow = 0
  const out: number[] = []
  for (let i = 0; i < 4; i++) {
    const byte = (rand >>> (24 - i * 8)) & 0xff
    const index = groupSize * i + (byte % groupSize) + overflow
    out.push(data.tiles[index] ?? -1)
    if (excess !== 0) { overflow++; excess-- }
  }
  return out
}

/**
 * 지금 보고 있는 칸이 빈티나 칸인가.
 *
 * ⚠️ **절반은 그냥 떨어진다.** 원작이 함수 첫 줄에서 `LCRNG_RandMod(2)`로
 * 빠져나간다 — 빈티나가 "50% 확률로 나온다"는 것이 이 한 줄이다. 이걸 빼면
 * 칸만 찾으면 백발백중이 되어 찾는 맛이 사라진다
 */
export function facingFeebas(
  rand: number, data: FeebasData, matrixWidth: number, x: number, z: number,
  coin: () => boolean,
): boolean {
  if (!coin()) return false
  const here = matrixWidth * 32 * z + x
  return feebasTiles(rand, data).includes(here)
}

// ── 무리 (PARITY §1.7) ───────────────────────────────────────────────────────

/**
 * 무리가 뜰 수 있는 스물두 곳 (`sSwarmMapIdTable`).
 *
 * 마지막 둘이 도로가 아니라는 것이 이 표의 특징이다 — 골짜기발전소와
 * 영원의 숲. 도로만 골라 만들면 그 둘이 영영 안 뜬다
 */
export const SWARM_MAPS: readonly number[] = [
  342, 343, 344, 350, 353, 354, 356, 380, 382, 385, 388,
  392, 395, 399, 400, 469, 403, 406, 407, 471, 200, 203,
]

/** 오늘 무리가 뜬 맵. 아직 안 열렸으면 null */
export function swarmMap(state: DailyState): number | null {
  if (!state.swarms) return null
  return SWARM_MAPS[state.rand % SWARM_MAPS.length] ?? null
}

// ── 트로피가든 (PARITY §6.7) ─────────────────────────────────────────────────

/** 트로피가든 (`MapHeader_IsTrophyGarden`) */
export const MAP_TROPHY_GARDEN = 287

/**
 * 오늘의 한 마리를 더한다 (`TrophyGarden_AddNewMon`).
 *
 * ⚠️ **지금 있는 둘과 겹치지 않을 때까지 다시 굴린다.** 원작이 `while (TRUE)`로
 * 돌면서 그 조건을 본다 — 한 번만 굴리면 어제와 같은 것이 나와서 "매일 바뀐다"가
 * 깨진다. 새 것이 1번 자리로 오고 있던 것이 2번으로 밀린다
 */
export function addTrophyMon(
  state: DailyState, table: readonly number[], rng: () => number,
): DailyState {
  const [a, b] = state.trophy
  const now = [table[a] ?? -1, table[b] ?? -1]
  for (let guard = 0; guard < 1000; guard++) {
    const at = Math.floor(rng() * table.length)
    const species = table[at]
    if (species === undefined || now.includes(species)) continue
    return { ...state, trophy: [at, state.trophy[0]] }
  }
  return state
}

/**
 * 오늘 트로피가든에 얹히는 두 종족 (`WildEncounters_ReplaceTrophyGardenEncounters`).
 *
 * ⚠️ **전국도감을 켜기 전에는 안 바뀐다.** 원작이 `nationalDexObtained`로 감싼다
 */
export function trophySpecies(
  state: DailyState, table: readonly number[], nationalDex: boolean,
): [number | null, number | null] {
  if (!nationalDex) return [null, null]
  const at = (slot: number): number | null =>
    slot === TROPHY_SLOT_NONE ? null : table[slot] ?? null
  return [at(state.trophy[0]), at(state.trophy[1])]
}

// ── 대습초원 (PARITY §7.7) ───────────────────────────────────────────────────

/** 대습초원 여섯 구역 (`GreatMarsh_GetAreaNumFromMapId`) */
export const GREAT_MARSH_MAPS: readonly number[] = [504, 505, 506, 507, 508, 509]

/**
 * 오늘 그 구역에 얹히는 종족 (`ReplaceGreatMarshDailyEncounters`).
 *
 * 구역마다 `rand`의 **다른 5비트**를 본다. 여섯 구역이 30비트를 나눠 쓴다 —
 * 그래서 같은 날에도 구역마다 다른 것이 나온다
 */
export function marshDaily(
  state: DailyState, mapId: number, table: readonly number[],
): number | null {
  const area = GREAT_MARSH_MAPS.indexOf(mapId)
  if (area < 0) return null
  const index = ((state.rand >>> (5 * area)) & 0x1f) % table.length
  return table[index] ?? null
}
