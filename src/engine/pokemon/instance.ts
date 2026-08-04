// 포켓몬 개체 (4세대)
//
// **성격·특성·성별·색이 전부 PID 하나에서 나온다.** 4세대가 실제로 그렇고, 그래서
// 이 값들은 서로 독립이 아니다 — 색이 다른 개체는 성격도 함께 정해진다. 따로 굴려
// 저장하면 그 상관이 사라져서, 원작과 "같은 씨앗이면 같은 개체"가 성립하지 않는다.
//
// 저장 크기도 덤이다. u32 하나가 네 값을 대신한다.
import type { Species, Stats } from '../../data/schema'
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
  friendship: number
  /** 원래 트레이너. 경험치 보정과 말 안 듣기 판정이 쓴다 */
  otId: number
  otSecretId: number
  ball: number
}

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
  return { ...mon, moves: mon.moves.map((s) => ({ ...s, pp: maxPp(s.move) })) }
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
 * 야생에서 들고 나오는 도구.
 *
 * 두 칸이 같으면 100%, 다르면 흔한 쪽 50% · 귀한 쪽 5%다.
 * 도구 데이터가 아직 없으므로 번호만 넣어 둔다
 */
export function wildHeldItem(species: Species, rng: Rng): number {
  const [common, rare] = species.heldItems
  if (common === 0 && rare === 0) return 0
  if (common === rare) return common
  const roll = rng() * 100
  if (roll < 5 && rare !== 0) return rare
  if (roll < 55 && common !== 0) return common
  return 0
}

export interface WildOptions {
  species: Species
  level: number
  rng: Rng
  /** 색 판정에 쓴다. 야생은 플레이어 ID로 굴린다 */
  otId: number
  otSecretId: number
}

/** 야생 개체를 만든다. PP는 기술 데이터를 아직 모르므로 호출자가 채운다 */
export function createWild({ species, level, rng, otId, otSecretId }: WildOptions): PokemonInstance {
  const iv = () => Math.floor(rng() * 32)
  return {
    species: species.id,
    pid: randomPid(rng),
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
    heldItem: wildHeldItem(species, rng),
    friendship: species.baseFriendship,
    otId,
    otSecretId,
    ball: 0,
  }
}
