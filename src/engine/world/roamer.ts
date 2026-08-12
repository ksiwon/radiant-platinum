// 배회 포켓몬 (PARITY §6.3) — `roaming_pokemon.c` · `roamer_after_battle.c`
//
// 여섯 자리가 있고 신오에서 실제로 도는 것은 **엠라이트와 크레세리아** 둘이다.
// 나머지 넷(다크라이·파이어·썬더·프리져)은 자리와 레벨까지 다 적혀 있지만 그
// 자리를 여는 스크립트가 원작에 없다 — 배포 이벤트용이다. **지우지 않는다.**
//
// 이 파일은 순수하다. 세이브도 맵도 안 읽고, 받은 값으로 다음 값을 낸다
// (PLAN §3.2). 무엇이 언제 부르는지는 `scene/fieldServices`가 안다.

import type { Stats } from '../../data/schema'
import type { Status } from '../pokemon/instance'

/** `generated/roaming_slots.txt` 차례 그대로 */
export const RoamerSlot = {
  MESPRIT: 0,
  CRESSELIA: 1,
  DARKRAI: 2,
  MOLTRES: 3,
  ZAPDOS: 4,
  ARTICUNO: 5,
} as const

export const ROAMER_SLOT_COUNT = 6

/** 자리마다 정해진 종족과 레벨 (`RoamingPokemon_ActivateSlot`) */
export const ROAMER_SPECIES: readonly number[] = [481, 488, 491, 146, 145, 144]
export const ROAMER_LEVEL: readonly number[] = [50, 50, 40, 60, 60, 60]

/**
 * 잡았는가·쓰러뜨렸는가를 적어 두는 스크립트 변수
 * (`SystemVars_SetRoamingSpeciesState`).
 *
 * ⚠️ **다크라이는 칸이 없다.** 원작 `switch`에 다섯만 있다 — 자리는 있는데
 * 결말을 적을 데가 없는 것이고, 이야기가 그 자리를 안 열기 때문이다.
 * 없는 칸을 만들어 채우지 않는다
 */
export const ROAMER_STATE_VAR: readonly (number | null)[] = [
  0x4059, // 엠라이트
  0x4058, // 크레세리아
  null, // 다크라이
  0x405e, // 파이어
  0x405f, // 썬더
  0x4060, // 프리져
]

export const RoamerState = {
  ROAMING: 0,
  CAPTURED: 1,
  DEFEATED: 2,
  RESET: 3,
} as const

/**
 * 배회 포켓몬이 돌 수 있는 스물아홉 곳 (`RoamingPokemonRoutes`).
 *
 * 본토의 야외 조우 지역 전부에서 트로피가든·대습초원·나루터시티 동쪽을 뺀 것이다.
 * 마지막 둘이 도로가 아니라는 것이 이 표의 특징이다 — 무연시티 발전소 앞과
 * 후에고 제철소 앞
 */
export const ROAMER_ROUTES: readonly number[] = [
  342, 343, 344, 345, 346, 347, 349, 350, 353, 354, 356, 362, 363, 365, 366,
  367, 371, 373, 380, 382, 383, 385, 388, 391, 467, 392, 395, 200, 204,
]

/**
 * 옆 도로들 (`sNearbyRoutes`). 맞닿은 도로뿐 아니라 **사이의 마을에 붙은
 * 도로까지** 담는다 — 202번은 모래사장마을과 잣나무시티 쪽을 다 갖는다.
 *
 * ⚠️ **205번 북쪽의 셋째 칸이 208번이다.** 영원시티에 실제로 붙어 있는 것은
 * 211번 서쪽인데 원작 표에는 `9`(=208번)가 그대로 박혀 있다. 고치면 배회가
 * 도는 모양이 달라지므로 **그대로 옮긴다**
 */
export const NEARBY_ROUTES: readonly (readonly number[])[] = [
  /* 0  201번   */[1, 23],
  /* 1  202번   */[0, 2, 3, 22, 23],
  /* 2  203번   */[1, 3, 8, 22],
  /* 3  204남   */[1, 2, 4, 22],
  /* 4  204북   */[3, 5],
  /* 5  205남   */[4, 6, 27, 28],
  /* 6  205북   */[5, 7, 9],
  /* 7  206번   */[6, 8, 13],
  /* 8  207번   */[2, 7, 9],
  /* 9  208번   */[8, 10, 15],
  /* 10 209번   */[9, 11, 15],
  /* 11 210남   */[10, 12, 19],
  /* 12 210북   */[11, 14],
  /* 13 211서   */[6, 7, 14, 20],
  /* 14 211동   */[12, 13, 20],
  /* 15 212북   */[9, 10, 16],
  /* 16 212남   */[15, 17],
  /* 17 213번   */[16, 18, 26],
  /* 18 214번   */[17, 19, 26],
  /* 19 215번   */[11, 18],
  /* 20 216번   */[13, 14, 21],
  /* 21 217번   */[20],
  /* 22 218번   */[1, 2, 3],
  /* 23 219번   */[0, 1, 24],
  /* 24 220번   */[23, 25],
  /* 25 221번   */[24],
  /* 26 222번   */[17, 18],
  /* 27 발전소앞 */[5],
  /* 28 제철소앞 */[5],
]

/** 한 자리의 배회 포켓몬. `active`가 거짓이면 나머지는 뜻이 없다 */
export interface Roamer {
  active: boolean
  species: number
  level: number
  /** 개체값·성격값을 들고 다닌다 — **같은 개체가 도망치고 또 나온다** */
  pid: number
  ivs: Stats
  /** 남은 체력. 도망친 자리의 체력 그대로 다음에 나온다 */
  hp: number
  status: Status
  /** `ROAMER_ROUTES`의 색인이다. **맵 번호가 아니다** */
  at: number
}

export function emptyRoamer(): Roamer {
  return {
    active: false, species: 0, level: 0, pid: 0,
    ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    hp: 0, status: 'ok', at: 0,
  }
}

export function newRoamers(): Roamer[] {
  return Array.from({ length: ROAMER_SLOT_COUNT }, emptyRoamer)
}

/** 플레이어가 방금 어디에서 왔는가 (`PlayerRecentRoutes`) */
export interface RecentRoutes {
  current: number
  previous: number
}

export function newRecentRoutes(): RecentRoutes {
  return { current: 0, previous: 0 }
}

/**
 * 맵이 바뀔 때마다 두 칸을 민다 (`SpecialEncounter_UpdateRecentRoutes`).
 *
 * ⚠️ **같은 맵이면 안 민다.** 안 그러면 한 맵 안에서 격자를 옮길 때마다
 * 「방금 떠난 맵」이 지금 맵으로 덮여서, 배회가 내 발밑으로 못 오게 막는
 * 장치가 통째로 무력해진다
 */
export function trackRoute(at: RecentRoutes, newMap: number): RecentRoutes {
  if (at.current === newMap) return at
  return { previous: at.current, current: newMap }
}

export type Rng = () => number

const randMod = (rng: Rng, n: number): number => Math.floor(rng() * n) % n

/**
 * 아무 데로나 옮긴다 (`MoveRoamerRandom`).
 *
 * 방금 떠난 맵과 **지금 있는 자리**를 둘 다 피할 때까지 다시 굴린다 —
 * 그래서 "옮겼는데 제자리"가 없다
 */
export function moveRandom(at: number, previousMap: number, rng: Rng): number {
  const here = ROAMER_ROUTES[at]
  for (;;) {
    const next = randMod(rng, ROAMER_ROUTES.length)
    const map = ROAMER_ROUTES[next]!
    if (map !== previousMap && map !== here) return next
  }
}

/**
 * 옆 도로로 한 칸 옮긴다 (`MoveRoamerNearby`).
 *
 * ⚠️ **지금 자리를 안 피한다.** 갈 곳이 하나뿐인 막다른 도로(217번·221번)에서
 * 그 하나가 방금 떠난 맵이면 아무 데로나 뛰지만, 그 밖에는 옆 도로 중에서만
 * 고른다 — 옆 도로 목록에 자기 자신은 없으므로 결과적으로 늘 움직인다
 */
export function moveNearby(at: number, previousMap: number, rng: Rng): number {
  const near = NEARBY_ROUTES[at] ?? []
  if (near.length === 1) {
    const only = near[0]!
    return ROAMER_ROUTES[only] === previousMap
      ? moveRandom(at, previousMap, rng)
      : only
  }
  for (;;) {
    const next = near[randMod(rng, near.length)]!
    if (ROAMER_ROUTES[next] !== previousMap) return next
  }
}

/**
 * 걸어서 맵을 넘을 때마다 전부 움직인다 (`RoamingPokemon_MoveAllLocations`).
 *
 * **열여섯에 하나는 신오 어디로든 뛴다.** 나머지는 옆 도로로 한 칸이다 —
 * 이 둘이 섞여 있어서 "대충 이쪽에 있다"가 성립하면서도 가끔 놓친다
 */
export function moveAll(roamers: readonly Roamer[], previousMap: number, rng: Rng): Roamer[] {
  return roamers.map((r) => {
    if (!r.active) return r
    const at = randMod(rng, 16) === 0
      ? moveRandom(r.at, previousMap, rng)
      : moveNearby(r.at, previousMap, rng)
    return { ...r, at }
  })
}

/** 하늘을 날거나 순간이동하면 전부 아무 데로나 뛴다 (`FieldSystem_SetFlyFlags`) */
export function randomizeAll(
  roamers: readonly Roamer[], previousMap: number, rng: Rng,
): Roamer[] {
  return roamers.map((r) => (
    r.active ? { ...r, at: moveRandom(r.at, previousMap, rng) } : r
  ))
}

/**
 * 한 자리를 연다 (`RoamingPokemon_ActivateSlot`). 스크립트가 부른다.
 *
 * ⚠️ **여기서 개체가 정해진다.** 원작이 이 자리에서 포켓몬을 한 마리 만들고
 * 개체값·성격값·최대 체력만 뽑아 적은 뒤 그 포켓몬을 버린다 — 그래서 배회는
 * 만날 때마다 능력치가 같고, 색이 다른 개체는 처음부터 색이 다르다.
 *
 * 열자마자 아무 데로나 뛴다. 그래서 이야기가 연 그 도로에 서 있지 않다
 */
export function activate(
  roamers: readonly Roamer[], slot: number, previousMap: number,
  { pid, ivs, maxHp }: { pid: number; ivs: Stats; maxHp: number },
): Roamer[] {
  const species = ROAMER_SPECIES[slot]
  const level = ROAMER_LEVEL[slot]
  if (species === undefined || level === undefined) return [...roamers]
  const next = [...roamers]
  const opened: Roamer = {
    active: true, species, level, pid, ivs, hp: maxHp, status: 'ok',
    at: roamers[slot]?.at ?? 0,
  }
  next[slot] = { ...opened, at: moveRandom(opened.at, previousMap, rngFromPid(pid)) }
  return next
}

/**
 * 여는 순간에 쓸 난수. 열쇠가 하나뿐인 자리라 **개체의 성격값에서 뽑는다**.
 *
 * 원작은 그냥 `LCRNG`를 굴리지만 우리는 이 함수가 순수해야 한다 — 어차피
 * 곧바로 첫 자리로 뛰는 한 번뿐이고, 성격값이 이미 무작위다
 */
function rngFromPid(pid: number): Rng {
  let x = pid >>> 0
  return () => {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0
    return x / 0x100000000
  }
}

/**
 * 지금 이 맵에 배회가 나오는가 (`TryEncounterRoamer`). 나오면 그 자리 번호.
 *
 * 여기 있어도 **절반은 안 나온다.** 둘 이상이 겹쳐 있으면 그중 하나를 고른다
 */
export function roamerHere(
  roamers: readonly Roamer[], mapId: number, rng: Rng,
): number | null {
  const here: number[] = []
  for (let slot = 0; slot < roamers.length; slot++) {
    const r = roamers[slot]!
    if (r.active && ROAMER_ROUTES[r.at] === mapId) here.push(slot)
  }
  if (here.length === 0) return null
  if (randMod(rng, 2) === 0) return null
  return here.length > 1 ? here[randMod(rng, here.length)]! : here[0]!
}

/**
 * 배틀이 끝난 뒤 (`RoamerAfterBattle_UpdateRoamers`).
 *
 * `met`이 방금 상대한 자리다(없으면 null). 쓰러뜨렸거나 잡았으면 그 자리를
 * 지우고, 아니면 남은 체력과 상태이상을 적어 둔다 — **도망친 배회는 맞은
 * 만큼을 그대로 들고 다음에 나온다.**
 *
 * ⚠️ **만난 판이 아니어도 옮긴다.** 원작이 100 중 30으로 굴린다 — 같은 도로에서
 * 야생만 계속 나오는 동안에도 배회는 슬금슬금 자리를 뜬다
 */
export function afterBattle(
  roamers: readonly Roamer[],
  { met, mapId, previousMap, hp, status, outcome, rng }: {
    met: number | null
    /** 지금 서 있는 맵. 여기 있는 배회들이 자리를 뜬다 */
    mapId: number
    /** 방금 떠나온 맵. **뛰어갈 곳을 고를 때 피하는 것은 이쪽이다** */
    previousMap: number
    hp: number
    status: Status
    outcome: 'win' | 'caught' | 'other'
    rng: Rng
  },
): { roamers: Roamer[]; cleared: number | null } {
  let next = [...roamers]
  let cleared: number | null = null

  if (met !== null && next[met]) {
    if (outcome === 'win' && hp === 0) {
      next[met] = emptyRoamer()
      cleared = RoamerState.DEFEATED
    } else if (outcome === 'caught') {
      next[met] = emptyRoamer()
      cleared = RoamerState.CAPTURED
    } else {
      next[met] = { ...next[met]!, hp, status }
    }
  }

  // 만났으면 반드시, 아니면 30%로 이 맵에 있는 것들이 자리를 뜬다
  if (met !== null || randMod(rng, 100) < 30) {
    next = next.map((r) => (
      r.active && ROAMER_ROUTES[r.at] === mapId
        ? { ...r, at: moveRandom(r.at, previousMap, rng) }
        : r
    ))
  }
  return { roamers: next, cleared }
}
