// 포켓몬 개체 (4세대)
//
// **성격·특성·성별·색이 전부 PID 하나에서 나온다.** 4세대가 실제로 그렇고, 그래서
// 이 값들은 서로 독립이 아니다 — 색이 다른 개체는 성격도 함께 정해진다. 따로 굴려
// 저장하면 그 상관이 사라져서, 원작과 "같은 씨앗이면 같은 개체"가 성립하지 않는다.
//
// 저장 크기도 덤이다. u32 하나가 네 값을 대신한다.
import type { Species, Stats } from '../../data/schema'
import { noOrigin, type Origin, type Trainer } from './origin'
import type { Mail } from '../world/mail'
import { computeStats } from './stats'
import { expForLevel, levelForExp } from './exp'
import { NATURE_COUNT } from './stats'

/** 4세대 상태이상. 코드는 Showdown과 같은 철자를 쓴다 — 배틀 브리지가 그대로 넘긴다 */
export type Status = 'ok' | 'slp' | 'psn' | 'tox' | 'brn' | 'frz' | 'par'

export type Gender = 'male' | 'female' | 'genderless'

export interface MoveSlot {
  move: number
  pp: number
  /** 포인트업 사용 횟수 0~3 */
  ppUps: number
}

export interface PokemonInstance {
  species: number
  /** 성격·특성·성별·색의 씨앗 (u32) */
  pid: number
  nickname: string | null
  /**
   * 누적 경험치가 정본이고 `level`은 그것을 풀어 둔 값이다.
   * 항상 `setExp`로 함께 바꾼다 — 따로 손대면 조용히 어긋난다
   */
  exp: number
  level: number
  ivs: Stats
  evs: Stats
  moves: MoveSlot[]
  /** 현재 HP. 최대 HP는 종족값에서 매번 계산한다(저장하면 어긋난다) */
  hp: number
  status: Status
  /** 잠듦·얼음이 남은 턴 */
  statusTurns: number
  heldItem: number
  /**
   * 친밀도 0~255.
   *
   * ⚠️ **알일 때는 이 칸이 남은 부화 걸음이다.** 원작이 칸을 하나로 쓴다
   * (`Egg_CreateEgg`가 `MON_DATA_FRIENDSHIP`에 `hatchCycles`를 넣는다) —
   * 칸을 따로 만들면 원작에 없는 상태가 하나 생기고, 두 값이 어긋날 자리가
   * 생긴다. 부화하면 **120**으로 세워진다 (종족의 기본 친밀도가 아니다)
   */
  friendship: number
  /**
   * 알인가 (`MON_DATA_IS_EGG`).
   *
   * 알은 배틀에 못 나가고, 걸음을 세도 친밀도가 안 오르고, 특성도 안 센다
   */
  isEgg: boolean
  /** 원래 트레이너. 경험치 보정과 말 안 듣기 판정이 쓴다 */
  otId: number
  otSecretId: number
  ball: number
  /**
   * 어디서 왔는가 (`origin.ts`). 요약 화면의 트레이너 메모가 이것만으로 쓰인다.
   *
   * ⚠️ **칸 차례를 지킨다.** 여기가 마지막 칸이고 `save/schema.ts`도 마지막이다 —
   * 리포트를 다시 읽으면 zod가 스키마 차례로 세우므로, 둘이 어긋나면
   * `JSON.stringify`가 다른 글을 내고 검사합이 깨진다
   */
  origin: Origin
  /**
   * 어느 모습인가 (`MON_DATA_FORM` · `engine/pokemon/form.ts`).
   *
   * ⚠️ **PID에서 다시 세지 않는다.** 4세대는 이 칸이 정본이고, 야생 안농의
   * 글자도 맵의 표에서 와서 PID와 아무 상관이 없다. 폼이 없는 종은 늘 0이다
   */
  form: number
  /**
   * 포켓루스 한 바이트 (`MON_DATA_POKERUS` · `engine/pokemon/pokerus.ts`).
   *
   * 아래 니블이 남은 날, 위 니블이 균주다. 0이면 한 번도 안 걸린 것이다.
   *
   * ⚠️ **`save/schema.ts`의 차례와 같아야 한다** — 새 칸은 양쪽 다 끝에 붙인다
   */
  pokerus: number
  /**
   * 지니고 있는 편지 (PARITY §4.8).
   *
   * ⚠️ **지닌 도구와 따로다.** 편지지는 `heldItem`으로도 잡히지만 **글은
   * 여기 있다** — 원작도 `Pokemon` 구조체에 `Mail`을 통째로 넣는다
   */
  mail: Mail | null
}

/** 데리고 다닐 수 있는 수 (`MAX_PARTY_SIZE`). 넘치면 박스로 간다 */
export const PARTY_MAX = 6

export type Rng = () => number

const U32 = 0x100000000

/** 0 ~ 2³²−1 난수. Rng는 [0,1)만 주므로 두 번 굴려 상위·하위를 채운다 */
export function randomPid(rng: Rng): number {
  const hi = Math.floor(rng() * 0x10000) & 0xffff
  const lo = Math.floor(rng() * 0x10000) & 0xffff
  return (hi * 0x10000 + lo) % U32
}

/** PID → 성격 번호 */
export function natureOf(pid: number): number {
  return pid % NATURE_COUNT
}

/** PID → 특성 슬롯. 4세대는 최하위 비트 하나로 두 특성 중 하나를 고른다 */
export function abilitySlotOf(pid: number): 0 | 1 {
  return (pid & 1) as 0 | 1
}

/**
 * 이 개체의 특성 (`BoxPokemon_CalcAbility`).
 *
 * ⚠️ **둘째 칸이 비어 있으면 첫 칸이다.** 원작이 `if (monAbility2 != ABILITY_NONE)`로
 * 먼저 거른다 — 비트만 보고 고르면 특성이 하나뿐인 종의 **절반이 특성 0**을
 * 갖게 되고, 그러면 싱크로도 정전기도 안 걸리고 요약 화면에는 " -"가 뜬다.
 * 0은 `undefined`가 아니라서 `??`로는 안 걸러진다
 */
export function abilityOf(pid: number, abilities: readonly [number, number]): number {
  return abilities[abilitySlotOf(pid)] || abilities[0] || 0
}

/**
 * PID → 성별.
 *
 * 성비 바이트는 **암컷이 되는 문턱값**이다: `(pid & 0xFF) < 성비`면 암컷.
 * 다만 0·254·255는 문턱이 아니라 표식이라 먼저 걸러야 한다 — 254를 문턱으로
 * 쓰면 254/256, 즉 99.2%만 암컷이 되어 "항상 암컷"이 깨진다
 */
export function genderOf(pid: number, genderRatio: number): Gender {
  if (genderRatio === 255) return 'genderless'
  if (genderRatio === 0) return 'male'
  if (genderRatio === 254) return 'female'
  return (pid & 0xff) < genderRatio ? 'female' : 'male'
}

/**
 * 색이 다른가.
 *
 * `(트레이너ID ^ 비밀ID ^ PID상위 ^ PID하위) < 8`. 트레이너마다 다르게 나오는 게
 * 원작의 핵심이라 트레이너 ID를 받는다
 */
export function isShiny(pid: number, otId: number, otSecretId: number): boolean {
  const hi = (pid >>> 16) & 0xffff
  const lo = pid & 0xffff
  return ((otId ^ otSecretId ^ hi ^ lo) & 0xffff) < 8
}

/**
 * **반드시 색이 다른** 성격값을 만든다 (`Pokemon_FindShinyPersonality`).
 *
 * ⚠️ **다시 굴리는 것이 아니라 지어내는 것이다.** 원작은 색이 나올 때까지
 * 굴리지 않고, 트레이너 번호에서 답을 거꾸로 짓는다:
 *
 * 1. 트레이너 번호 32비트의 위·아래를 xor하고 **아래 세 비트를 버린다**(13비트)
 * 2. 성격값 위·아래의 **아래 세 비트는 아무 값**이나 넣는다 — `< 8` 판정이
 *    그 세 비트를 안 보기 때문이다
 * 3. 남은 13비트는, 트레이너 쪽 비트가 1이면 성격값 **둘 중 하나만** 1로,
 *    0이면 **둘 다 같게** 놓는다. 그러면 네 값의 xor이 0이 된다
 *
 * 레이더 사슬이 색을 못 박는 자리에서만 쓴다 (PARITY §6.5)
 */
export function shinyPersonality(otId32: number, rand: (n: number) => number): number {
  const xored = ((((otId32 & 0xffff0000) >>> 16) ^ (otId32 & 0xffff)) >>> 3) & 0x1fff
  let low = rand(8)
  let high = rand(8)
  for (let i = 0; i < 13; i++) {
    const bit = 1 << (i + 3)
    if ((xored & (1 << i)) !== 0) {
      if (rand(2) === 1) low |= bit
      else high |= bit
    } else if (rand(2) === 1) {
      low |= bit
      high |= bit
    }
  }
  return ((low | (high << 16)) >>> 0)
}

/** 개체의 최대 HP를 포함한 여섯 실능력치 */
export function statsOf(mon: PokemonInstance, species: Species): Stats {
  return computeStats({
    base: species.stats,
    ivs: mon.ivs,
    evs: mon.evs,
    level: mon.level,
    nature: natureOf(mon.pid),
    speciesId: species.id,
  })
}

/** 최대 HP만 필요할 때 */
export function maxHp(mon: PokemonInstance, species: Species): number {
  return statsOf(mon, species).hp
}

/** 경험치를 정하고 레벨을 함께 맞춘다. 이 둘은 따로 바꾸지 않는다 */
export function setExp(mon: PokemonInstance, species: Species, exp: number): void {
  mon.exp = Math.max(0, Math.floor(exp))
  mon.level = levelForExp(species.growthRate, mon.exp)
}

/**
 * PP를 가득 채운다. 새 개체를 돌려준다.
 *
 * **개체를 만드는 쪽이 반드시 한 번은 불러야 한다.** `createWild`는 기술 데이터를
 * 모르므로 PP를 0으로 두는데, 그 상태로 세이브에 들어가면 "안 채운 0"과 "다 쓴 0"이
 * 구분이 안 된다 — 다 쓴 기술이 배틀마다 되살아난다
 */
export function fillPp(mon: PokemonInstance, maxPp: (move: number) => number): PokemonInstance {
  return { ...mon, moves: mon.moves.map((s) => ({ ...s, pp: maxPpOf(s, maxPp(s.move)) })) }
}

/**
 * 포인트업까지 반영한 그 칸의 최대 PP.
 *
 * 4세대는 기본 PP의 5분의 1씩 세 번까지 늘어난다. 지금은 `ppUps`를 올리는 길이
 * 없어서 항상 기본값이지만, 최대치를 두 군데서 따로 계산하면 어긋난다
 */
export function maxPpOf(slot: MoveSlot, basePp: number): number {
  return Math.floor((basePp * (5 + slot.ppUps)) / 5)
}

/** 쓰러졌는가 */
export function isFainted(mon: PokemonInstance): boolean {
  return mon.hp <= 0
}

/**
 * 그 레벨에서 알고 있을 기술 4개.
 *
 * 레벨 이하로 배우는 기술을 순서대로 훑어 **마지막 4개**를 남긴다 — 야생 포켓몬이
 * 실제로 그렇게 정해진다. 같은 기술을 두 번 배우는 종이 있으므로 중복을 없앤다
 */
export function wildMoves(species: Species, level: number): MoveSlot[] {
  const learned: number[] = []
  for (const l of species.learnset) {
    if (l.level > level) continue
    const dup = learned.indexOf(l.move)
    if (dup >= 0) learned.splice(dup, 1)
    learned.push(l.move)
  }
  return learned.slice(-4).map((move) => ({ move, pp: 0, ppUps: 0 }))
}

/**
 * 야생에서 들고 나오는 도구 (`Pokemon_GiveHeldItem`).
 *
 * 두 칸이 같으면 100%, 다르면 「없음 45 · 흔한 것 50 · 귀한 것 5」다.
 * `eyed`(복안)면 「20 · 60 · 20」으로 바뀐다
 */
export function wildHeldItem(species: Species, rng: Rng, eyed = false): number {
  const [common, rare] = species.heldItems
  if (common === 0 && rare === 0) return 0
  if (common === rare) return common
  const [none, upTo] = eyed ? [20, 80] : [45, 95]
  const roll = rng() * 100
  if (roll < none) return 0
  return roll < upTo ? common : rare
}

/**
 * 야생의 PID를 어느 쪽으로 몰 것인가 (`engine/battle/encounterLead`).
 *
 * 싱크로는 성격을, 헤롱헤롱바디는 성별을 정한다. **둘이 같이 걸릴 일은 없다** —
 * 한 마리에 특성이 하나뿐이라, 원작도 `else if`로 갈라 둔다
 */
export interface PidBias {
  nature: number | null
  gender: 'male' | 'female' | null
}

/**
 * 조건에 맞는 PID가 나올 때까지 다시 굴린다.
 *
 * ⚠️ **상한을 둔다.** 성비가 한쪽뿐인 종에게 반대 성별을 요구하면 영영 안
 * 나온다 — 원작은 그런 종을 미리 걸러서 `while (TRUE)`로 돌지만, 걸러진다는
 * 보장을 여기서 다시 만들지 않고 그냥 포기하고 마지막 값을 쓴다
 */
const PID_TRIES = 1000

export interface WildOptions {
  species: Species
  level: number
  rng: Rng
  /** 색 판정에 쓴다. 야생은 플레이어 ID로 굴린다 */
  otId: number
  otSecretId: number
  /** 선두 특성이 미는 방향. 없으면 그냥 굴린다 */
  bias?: PidBias
  /** 복안 — 도구를 들고 나올 확률이 오른다 */
  compoundEyes?: boolean
  /**
   * 원래 트레이너의 이름과 성별. 안 주면 **빈 출신**으로 만든다 —
   * 야생 개체는 아직 아무의 것도 아니라서, 잡는 자리가 `caughtAt`으로 새긴다
   */
  trainer?: Trainer
}

/** 야생 개체를 만든다. PP는 기술 데이터를 아직 모르므로 호출자가 채운다 */
export function createWild(
  { species, level, rng, otId, otSecretId, bias, compoundEyes, trainer }: WildOptions,
): PokemonInstance {
  const iv = () => Math.floor(rng() * 32)
  return {
    species: species.id,
    pid: biasedPid(rng, species, bias),
    nickname: null,
    exp: expForLevel(species.growthRate, level),
    level,
    ivs: { hp: iv(), atk: iv(), def: iv(), spa: iv(), spd: iv(), spe: iv() },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: wildMoves(species, level),
    // 호출자가 statsOf로 채운다. 여기서 넣으면 종족 데이터를 두 번 훑는다
    hp: 0,
    status: 'ok',
    statusTurns: 0,
    heldItem: wildHeldItem(species, rng, compoundEyes ?? false),
    friendship: species.baseFriendship,
    isEgg: false,
    otId,
    otSecretId,
    ball: 0,
    origin: noOrigin(trainer ?? { name: '', gender: 'male' }),
    // 폼은 여기서 안 정한다 — 야생은 맵의 표가(`AddWildMonToParty`), 그 밖은
    // 주는 자리가 정한다. 기본값 0이 곧 "보통 모습"이다
    form: 0,
    // 야생은 포켓루스를 안 달고 나온다. 걸리는 자리는 배틀이 끝나는 순간뿐이다
    pokerus: 0,
    // 편지는 사람이 써서 붙이는 것뿐이다 — 야생이 들고 나오는 길이 없다
    mail: null,
  }
}

/** 조건이 맞을 때까지 다시 굴린 PID. 조건이 없으면 한 번만 굴린다 */
function biasedPid(rng: Rng, species: Species, bias: PidBias | undefined): number {
  if (!bias || (bias.nature === null && bias.gender === null)) return randomPid(rng)
  let pid = randomPid(rng)
  for (let i = 0; i < PID_TRIES; i++) {
    const natureOk = bias.nature === null || natureOf(pid) === bias.nature
    const genderOk = bias.gender === null || genderOf(pid, species.genderRatio) === bias.gender
    if (natureOk && genderOk) return pid
    pid = randomPid(rng)
  }
  return pid
}
