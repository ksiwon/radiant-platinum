// 표의 「형」 하나를 실제 개체로 (PARITY §9.3)
//
// `FrontierPokemon_Init` + `FrontierPokemon_InitPokemon` 둘을 합친 자리다.
// 원작이 두 단계로 나눈 것은 통신으로 형만 주고받기 때문인데, 통신이 §9라
// 여기서는 한 번에 만든다.
//
// ⚠️ **개체값도 노력치도 표에 없다.** 개체값은 뽑은 층이 정한 값을 여섯에 똑같이
// 넣고, 노력치는 `evFlags`가 켠 능력에 **510을 나눠** 넣는다 — 능력 둘이면 255가
// 아니라 **252**다(한 능력 상한). 셋이면 170씩이다.
//
// ⚠️ **성격이 표에 있고 PID는 그 성격이 나올 때까지 굴린다.** 4세대는 PID가
// 성격·특성·성별·색을 다 정하므로(`engine/pokemon/instance`), 성격만 따로 저장할
// 칸이 없다. 원작도 똑같이 굴린다 — 색이 나오면 그것도 버린다
import type { Species } from '../../data/schema'
import { expForLevel } from '../pokemon/exp'
import { natureOf, randomPid, type PokemonInstance, type Rng } from '../pokemon/instance'
import { isShiny } from '../pokemon/instance'
import { noOrigin } from '../pokemon/origin'
import { NATURE_COUNT } from '../pokemon/stats'
import type { FrontierSet } from '../../data/schema'

/** `ITEM_POKE_BALL` — 빌린 개체도 몬스터볼에 들어 있다 */
const ITEM_POKE_BALL = 4

/** `MAX_EVS_ALL_STATS` · `MAX_EVS_SINGLE_STAT` */
const EV_TOTAL = 510
const EV_SINGLE_MAX = 252

/** `MOVE_FRUSTRATION` — 이 기술을 가진 형은 친밀도가 0이다 */
const MOVE_FRUSTRATION = 218

/** `MAX_FRIENDSHIP_VALUE` */
const FRIENDSHIP_MAX = 255

/**
 * 노력치를 넣을 능력. **원작의 차례 그대로다** — HP·공격·방어·**스피드**·특공·특방.
 *
 * ⚠️ 요약 화면 차례(hp·atk·def·spa·spd·spe)와 다르다. 비트 3이 특공이 아니라
 * 스피드라 뒤집어 읽으면 엉뚱한 능력에 노력치가 들어간다
 */
const EV_BITS = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'] as const

/** `Pokemon_IsPersonalityShiny`를 만족하지 않을 때까지 굴리는 상한 */
const PID_TRIES = 1000

/**
 * 그 형에게 성격이 맞는 PID.
 *
 * 원작은 `do…while`로 조건이 맞을 때까지 무한히 굴린다. 성격 25가지 중 하나를
 * 맞추는 것이라 평균 25번이면 나오지만, **상한을 두고 마지막 값을 쓴다** —
 * `createWild`의 `biasedPid`와 같은 약속이다
 */
export function factoryPid(nature: number, otId: number, otSecretId: number, rng: Rng): number {
  let pid = randomPid(rng)
  for (let i = 0; i < PID_TRIES; i++) {
    if (natureOf(pid) === nature % NATURE_COUNT && !isShiny(pid, otId, otSecretId)) return pid
    pid = randomPid(rng)
  }
  return pid
}

/** `evFlags`가 켠 능력에 나눠 넣은 노력치 */
export function factoryEvs(evFlags: number): PokemonInstance['evs'] {
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }
  const on = EV_BITS.filter((_, i) => (evFlags & (1 << i)) !== 0)
  if (on.length === 0) return evs
  const each = Math.min(Math.floor(EV_TOTAL / on.length), EV_SINGLE_MAX)
  for (const stat of on) evs[stat] = each
  return evs
}

export interface FactoryMonOptions {
  readonly set: FrontierSet
  readonly species: Species
  readonly level: number
  /** 뽑은 층이 정한 값. 여섯 능력에 똑같이 들어간다 */
  readonly ivs: number
  readonly rng: Rng
  /** 기술 하나의 최대 PP. 없으면 5로 둔다 */
  readonly maxPp: (move: number) => number
  /** 종족 이름. 빌린 개체는 **늘 종족 이름을 별명으로 달고 있다** */
  readonly speciesName: string
  /** 원트레이너 이름. 뱅크 363의 한 줄("?????")이다 */
  readonly otName: string
}

/**
 * 빌리는 개체 하나를 만든다.
 *
 * ⚠️ **원트레이너가 매번 다른 난수다** (`BattleFrontier_LoadOpponentMonData`가
 * `LCRNG_Next()`를 두 번 이어 붙인다). 그래서 색 판정도 이 값으로 하고,
 * 리포트에 남으면 남의 마리로 보인다 — 팩토리는 리포트에 안 남긴다
 */
export function createFactoryMon(
  { set, species, level, ivs, rng, maxPp, speciesName, otName }: FactoryMonOptions,
): PokemonInstance {
  const otId = Math.floor(rng() * 0x10000)
  const otSecretId = Math.floor(rng() * 0x10000)
  const pid = factoryPid(set.nature, otId, otSecretId, rng)
  const frustrated = set.moves.includes(MOVE_FRUSTRATION)
  return {
    species: set.species,
    pid,
    // 원작이 `setSpeciesAsNickname`으로 종족 이름을 넣는다 — 별명 칸이 비면
    // 요약 화면이 종족 이름을 대신 쓰므로 보이는 것은 같지만, 칸의 값이 다르다
    nickname: speciesName,
    exp: expForLevel(species.growthRate, level),
    level,
    ivs: { hp: ivs, atk: ivs, def: ivs, spa: ivs, spd: ivs, spe: ivs },
    evs: factoryEvs(set.evFlags),
    moves: set.moves.map((move) => ({ move, pp: maxPp(move), ppUps: 0 })),
    // 부르는 쪽이 `statsOf`로 채운다 — `createWild`와 같은 약속이다
    hp: 0,
    status: 'ok',
    statusTurns: 0,
    heldItem: set.item ?? 0,
    friendship: frustrated ? 0 : FRIENDSHIP_MAX,
    isEgg: false,
    otId,
    otSecretId,
    ball: ITEM_POKE_BALL,
    origin: noOrigin({ name: otName, gender: 'male' }),
    form: set.form ?? 0,
    pokerus: 0,
  }
}
