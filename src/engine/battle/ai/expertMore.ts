// AI_FLAG_EXPERT — 나머지 루틴 (`trainer_ai/script.s` 1623~6340, PLAN §7.7.9)
//
// `expert.ts`가 앞서 옮긴 것 말고 분기표(`Expert_Main` 1623)에 남은 루틴을 **전부** 옮겼다.
// 한 루틴이 한 함수고, 함수 머리에 원작 줄 번호를 적었다. 문턱 `n`은 `IfRandomLessThan n`
// 그대로다 — `skip(random, n)`이 참이면 **점수를 안 준다**.
//
// ⚠️ **원작의 버그와 주석·코드 불일치를 고치지 않는다** (`score.ts` 머리말과 같은 방침이다).
// 주석에 BUG로 적힌 것(예언의 상대 타입 대신 제 타입을 봄 · 얼굴로 보는 곳이 상대 상태 ·
// 물회오리의 제 체력 대신 상대 체력)과, 주석은 「그렇다」는데 코드는 다른 곳(벌점 사슬이
// 한 줄로 끝나지 않고 아래로 **흘러** 합쳐지는 것 · 마지막 발악 · 쓸 수 없는 지압)은 **코드대로**다.
//
// ⚠️ **우리 sim이 안 들고 있는 상태는 원작이 0일 때의 값으로 읽는다.** 재활용 도구
// (`LoadRecycleItem`)가 그렇다 — 없으면 −2다. 무엇이 안 닿는지는 PLAN §7.7.9에 목록으로 있다
import type { AiMon, AiMove, AiTurn } from './context'
import { allDamage, estimateDamage } from './damage'
import { hpPercent, knownMoves } from './context'
import { AB, E, HE, IT, MV } from './expertIds'
import {
  anyHigh, anyLow, eff, foeKnowsEffect, foeLastPower, hasSuperEffective, isFaster, isSlower,
  lastClass, resisted, skip, statusConfuse, turnCount,
} from './expertKit'
import { TYPE } from './typeChart'

type Stat = keyof AiMon['boosts']
const OFF_STATS: readonly Stat[] = ['atk', 'def', 'spa', 'spd', 'evasion']

const hp = hpPercent

/** 상대가 그 기술을 써 보였는가 (`IfMoveKnown AI_BATTLER_DEFENDER`) */
function foeKnows(turn: AiTurn, move: number): boolean {
  return turn.foeKnownMoves.has(move)
}

/** 내가 그 기술을 가졌는가 (`IfMoveKnown AI_BATTLER_ATTACKER`) */
function selfKnows(turn: AiTurn, move: number): boolean {
  return knownMoves(turn).some((m) => m.id === move)
}

const hasType = (mon: AiMon, type: number): boolean => mon.types.includes(type)
const statused = (mon: AiMon): boolean => mon.status !== 'ok'

/** 내가 나온 첫 턴인가 (`LoadIsFirstTurnInBattle AI_BATTLER_ATTACKER`) */
const firstTurn = (turn: AiTurn): boolean => turn.turn === 0

/** 상대가 못 움직일 것 같은가 — 잠듦·헤롱헤롱·혼란 (카운터류가 맨 앞에서 묻는다) */
function foeUnreliable(turn: AiTurn): boolean {
  return turn.foe.status === 'slp' || turn.foe.volatiles.has('attract')
    || turn.foe.volatiles.has('confusion')
}

const foeTaunted = (turn: AiTurn): boolean => turn.foe.volatiles.has('taunt')

/** 상대 칸에서 제일 센 수를 나(내 기술)가 아니라 상대가 직전에 쓴 수가 넘는가 (`IfBattlerDealsMoreDamage`) */
function foeLastBeatsMe(turn: AiTurn): boolean {
  const last = turn.foeLast
  if (!last) return false
  const mine = Math.max(0, ...allDamage(knownMoves(turn), turn.self, turn.foe, turn.weather, 100))
  return estimateDamage(last, turn.foe, turn.self, turn.weather, 100) > mine
}

// ── 단순한 체력·속도 판 ──────────────────────────────────────────────────────

/** 꿈먹기 (1883) — 상대가 반감·무효면 −1, 잠든 상대면 80%로 +3 */
function dreamEater(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  if (turn.foe.status !== 'slp') return 0
  return skip(turn.random, 51) ? 0 : 3
}

/** 요술거울류 따라하기의 값어치가 큰 기술 표 (`Expert_MirrorMove_MoveTable` 1928) */
const COPY_WORTHY: ReadonlySet<number> = new Set([
  MV.SLEEP_POWDER, MV.LOVELY_KISS, MV.SPORE, MV.HYPNOSIS, MV.SING, MV.GRASS_WHISTLE,
  MV.SHADOW_PUNCH, MV.SAND_ATTACK, MV.SMOKE_SCREEN, MV.TOXIC, MV.GUILLOTINE, MV.HORN_DRILL,
  MV.FISSURE, MV.SHEER_COLD, MV.CROSS_CHOP, MV.AEROBLAST, MV.CONFUSE_RAY, MV.SWEET_KISS,
  MV.SCREECH, MV.COTTON_SPORE, MV.SCARY_FACE, MV.FAKE_TEARS, MV.METAL_SOUND, MV.THUNDER_WAVE,
  MV.GLARE, MV.POISON_POWDER, MV.SHADOW_BALL, MV.DYNAMIC_PUNCH, MV.HYPER_BEAM, MV.EXTREME_SPEED,
  MV.THIEF, MV.COVET, MV.ATTRACT, MV.SWAGGER, MV.TORMENT, MV.FLATTER, MV.TRICK, MV.SUPERPOWER,
  MV.SKILL_SWAP, MV.PSYCHO_SHIFT, MV.POWER_SWAP, MV.GUARD_SWAP, MV.SUCKER_PUNCH, MV.HEART_SWAP,
  MV.SWITCHEROO, MV.CAPTIVATE, MV.DARK_VOID,
])

/** 앵무새 (1904) */
function mirrorMove(turn: AiTurn): number {
  const worthy = COPY_WORTHY.has(turn.foeLast?.id ?? 0)
  const tryMinus1 = (): number => (worthy || skip(turn.random, 80) ? 0 : -1)
  if (isSlower(turn) || !worthy) return tryMinus1()
  return skip(turn.random, 128) ? 0 : 2
}

/** 안개·흑안개 (2517) — 이쪽이 올려 놨으면 지우지 말고, 저쪽이 올려 놨으면 지운다. 두 갈래가 겹친다 */
function haze(turn: AiTurn): number {
  const { self, foe, random } = turn
  let delta = 0
  if (anyHigh(self, OFF_STATS) || anyLow(foe, [...OFF_STATS.slice(0, 4), 'accuracy'])) {
    if (!skip(random, 50)) delta -= 3
  }
  if (anyHigh(foe, OFF_STATS) || anyLow(self, [...OFF_STATS.slice(0, 4), 'accuracy'])) {
    if (!skip(random, 50)) delta += 3
  } else if (!skip(random, 50)) {
    delta -= 1
  }
  return delta
}

/** 참기 (2563) */
function bide(turn: AiTurn): number {
  return hp(turn.self) > 90 ? 0 : -2
}

/** 울부짖기·날려버리기 (2571) */
function forceSwitch(turn: AiTurn): number {
  const { foe, random } = turn
  const rocks = foe.side.has('spikes') || foe.side.has('stealthrock') || foe.side.has('toxicspikes')
  const boosted = anyHigh(foe, OFF_STATS)
  const fifty = (): number => (skip(random, 128) ? 0 : 2)
  if ((turn.foeTurn ?? 0) > 3) return (skip(random, 64) ? 0 : 2) + fifty()
  if (rocks || boosted) return fifty()
  return -3
}

/** 일격필살 (2789) — 25%로 +1 */
function ohko(turn: AiTurn): number {
  return skip(turn.random, 192) ? 0 : 1
}

/** 분노의앞니 (2797) */
function superFang(turn: AiTurn): number {
  return hp(turn.foe) > 50 ? 0 : -1
}

/** 독 (2926) */
function statusPoison(turn: AiTurn): number {
  return hp(turn.self) < 50 || hp(turn.foe) <= 50 ? -1 : 0
}

/** 뽐내기 (2842) — 심술 짝이 있으면 그 갈래, 없으면 부추기기와 같다 */
function swagger(turn: AiTurn): number {
  if (selfKnows(turn, MV.PSYCH_UP)) {
    // `IfStatStageGreaterThan … 3` — 단계 3(= −3)보다 **위**, 곧 −2 이상이면 −5다 (주석은 「−3 이상」)
    if (turn.foe.boosts.atk > -3) return -5
    let delta = 3
    if (turnCount(turn) === 0) delta += 2
    return delta
  }
  return flatter(turn)
}

/** 부추기기 (2851) */
function flatter(turn: AiTurn): number {
  return (skip(turn.random, 128) ? 0 : 1) + statusConfuse(turn)
}

/**
 * 대타출동 (2973) — 내 체력이 낮을수록 더 깎고, 내가 더 빠를 때 상대가 걸어 둔 상태를 보고 올린다.
 * 체력 판은 문턱마다 한 번씩 굴려 **쌓인다** (53%면 최대 −2)
 */
function substitute(turn: AiTurn): number {
  const { self, foe, random } = turn
  let delta = 0
  if (selfKnows(turn, MV.FOCUS_PUNCH) && !skip(random, 96)) delta += 1
  const mine = hp(self)
  if (mine <= 90) {
    const rolls = mine > 70 ? 1 : mine > 50 ? 2 : 3
    for (let i = 0; i < rolls; i++) if (!skip(random, 100)) delta -= 1
  }
  if (isSlower(turn)) return delta
  const e = turn.foeLast?.effect
  const plus = (): number => (skip(random, 100) ? 0 : 1)
  switch (e) {
    case E.STATUS_SLEEP: case E.STATUS_BADLY_POISON: case E.STATUS_POISON:
    case E.STATUS_PARALYZE: case E.STATUS_BURN:
      return statused(foe) ? delta : delta + plus()
    case E.STATUS_CONFUSE:
      return foe.volatiles.has('confusion') ? delta : delta + plus()
    case E.STATUS_LEECH_SEED:
      return foe.volatiles.has('leechseed') ? delta : delta + plus()
    default:
      return delta
  }
}

/** 사슬묶기 (3072) */
function disable(turn: AiTurn): number {
  if (isSlower(turn)) return 0
  if (foeLastPower(turn) === 0) return skip(turn.random, 100) ? 0 : -1
  return 1
}

/** 카운터가 물리로 읽는 타입 (`Expert_Counter_PhysicalTypes` 3162) */
const PHYSICAL_TYPES: readonly number[] = [
  TYPE.NORMAL, TYPE.FIGHTING, TYPE.FLYING, TYPE.POISON, TYPE.GROUND, TYPE.ROCK, TYPE.BUG,
  TYPE.GHOST, TYPE.STEEL,
]

/** 미러코트가 특수로 읽는 타입 (`Expert_MirrorCoat_SpecialTypes` 3980) */
const SPECIAL_TYPES: readonly number[] = [
  TYPE.FIRE, TYPE.WATER, TYPE.GRASS, TYPE.ELECTRIC, TYPE.PSYCHIC, TYPE.ICE, TYPE.DRAGON, TYPE.DARK,
]

/**
 * 카운터(3092)·미러코트(3849). 둘이 거울이라 한 함수다 — 맞받을 분류만 다르다.
 * 상대가 직전에 위력 있는 수를 썼으면 그 분류를, 변화기였으면 상대 타입을 본다
 */
function counterOrCoat(turn: AiTurn, want: 'physical' | 'special'): number {
  const { self, foe, random } = turn
  if (foeUnreliable(turn)) return -1
  let delta = 0
  const mine = hp(self)
  if (mine <= 30 && !skip(random, 10)) delta -= 1
  if (mine <= 50 && !skip(random, 100)) delta -= 1
  const mirror = want === 'physical' ? MV.MIRROR_COAT : MV.COUNTER
  const plus4 = (): number => (skip(random, 100) ? delta : delta + 4)
  if (selfKnows(turn, mirror)) return plus4()
  const taunt = (): void => {
    if (foeTaunted(turn) && !skip(random, 100)) delta += 1
  }
  if (foeLastPower(turn) === 0) {
    taunt()
    const types = want === 'physical' ? PHYSICAL_TYPES : SPECIAL_TYPES
    if (types.includes(foe.types[0]!) || types.includes(foe.types[1] ?? foe.types[0]!)) return delta
    if (skip(random, 50)) return delta
    return plus4()
  }
  taunt()
  if (lastClass(turn) !== want) return delta - 1
  return skip(random, 100) ? delta : delta + 1
}

/** 앙코르가 부추기는 기술 효과 (`Expert_Encore_EncouragedMoveEffects` 3239) */
const ENCOURAGED: ReadonlySet<number> = new Set([
  E.RECOVER_DAMAGE_SLEEP, E.ATK_UP, E.DEF_UP, E.SPEED_UP, E.SP_ATK_UP, E.RESET_STAT_CHANGES,
  E.FORCE_SWITCH, E.CONVERSION, E.STATUS_BADLY_POISON, E.SET_LIGHT_SCREEN, E.REST, E.HALVE_HP,
  E.SP_DEF_UP_2, E.STATUS_CONFUSE, E.STATUS_POISON, E.STATUS_PARALYZE, E.STATUS_LEECH_SEED,
  E.DO_NOTHING, E.ATK_UP_2, E.ENCORE, E.CONVERSION2, E.NEXT_ATTACK_ALWAYS_HITS,
  E.CURE_PARTY_STATUS, E.PREVENT_ESCAPE, E.STATUS_NIGHTMARE, E.PROTECT, E.SWITCH_ABILITIES,
  E.FORESIGHT, E.ALL_FAINT_3_TURNS, E.WEATHER_SANDSTORM, E.SURVIVE_WITH_1_HP,
  E.ATK_UP_2_STATUS_CONFUSION, E.INFATUATE, E.PREVENT_STATUS, E.WEATHER_RAIN, E.WEATHER_SUN,
  E.MAX_ATK_LOSE_HALF_MAX_HP, E.COPY_STAT_CHANGES, E.HIT_IN_3_TURNS,
  E.ALWAYS_FLINCH_FIRST_TURN_ONLY, E.STOCKPILE, E.SPIT_UP, E.SWALLOW, E.WEATHER_HAIL, E.TORMENT,
  E.STATUS_BURN, E.MAKE_GLOBAL_TARGET, E.SP_DEF_UP_DOUBLE_ELECTRIC_POWER, E.SWITCH_HELD_ITEMS,
  E.COPY_ABILITY, E.GROUND_TRAP_USER_CONTINUOUS_HEAL, E.RECYCLE, E.REMOVE_HELD_ITEM,
  E.MAKE_SHARED_MOVES_UNUSEABLE, E.HEAL_STATUS, E.REMOVE_ALL_PP_ON_DEFEAT, E.CONFUSE_ALL,
  E.HALVE_ELECTRIC_DAMAGE, E.HALVE_FIRE_DAMAGE, E.ATK_SPD_UP, E.CAMOUFLAGE, E.GRAVITY,
  E.IGNORE_EVATION_REMOVE_DARK_IMMUNE, E.FAINT_AND_FULL_HEAL_NEXT_MON, E.NATURAL_GIFT,
  E.REMOVE_PROTECT, E.DOUBLE_SPEED_3_TURNS, E.RANDOM_STAT_UP_2, E.FLING, E.TRANSFER_STATUS,
  E.PREVENT_HEALING, E.SWAP_ATK_DEF, E.SUPRESS_ABILITY, E.PREVENT_CRITS,
  E.SWAP_ATK_SP_ATK_STAT_CHANGES, E.SWAP_DEF_SP_DEF_STAT_CHANGES, E.SET_ABILITY_TO_INSOMNIA,
  E.SWAP_STAT_CHANGES, E.RESTORE_HP_EVERY_TURN, E.GIVE_GROUND_IMMUNITY, E.TRICK_ROOM,
])

/** 앙코르 (3174) */
function encore(turn: AiTurn): number {
  const plus3 = (): number => (skip(turn.random, 30) ? 0 : 3)
  if (turn.foe.volatiles.has('disable')) return plus3()
  if (isSlower(turn)) return -2
  const e = turn.foeLast?.effect
  if (e === undefined || !ENCOURAGED.has(e)) return -2
  return plus3()
}

/** 고통나누기 (3284) */
function painSplit(turn: AiTurn): number {
  if (hp(turn.foe) < 80) return -1
  const limit = isSlower(turn) ? 60 : 40
  return hp(turn.self) > limit ? -1 : 1
}

/** 악몽 (3311) */
const nightmare = (): number => 2

/** 록온 (3316) */
function lockOn(turn: AiTurn): number {
  return skip(turn.random, 128) ? 0 : 2
}

/** 길동무 (3332) */
function destinyBond(turn: AiTurn): number {
  const { random } = turn
  let delta = -1
  if (isSlower(turn)) return delta
  const mine = hp(turn.self)
  if (mine > 70) return delta
  if (!skip(random, 128)) delta += 1
  if (mine > 50) return delta
  if (!skip(random, 128)) delta += 1
  if (mine > 30) return delta
  if (!skip(random, 100)) delta += 2
  return delta
}

/** 기사회생 (3359) */
function reversal(turn: AiTurn): number {
  const mine = hp(turn.self)
  const tryPlus1 = (): number => (skip(turn.random, 100) ? 0 : 1)
  if (isSlower(turn)) {
    if (mine > 60) return -1
    if (mine > 40) return 0
    return tryPlus1()
  }
  if (mine > 33) return -1
  if (mine > 20) return 0
  if (mine < 8) return 1 + tryPlus1()
  return tryPlus1()
}

/** 치료방울 (3395) */
function healBell(turn: AiTurn): number {
  return statused(turn.self) || turn.partyStatused === true ? 0 : -5
}

/** 도둑질이 가져올 값어치가 있는 도구 효과 (`Expert_Thief_EncouragedItemEffects` 3418) */
const THIEF_ITEMS: ReadonlySet<number> = new Set([
  HE.SLP_RESTORE, HE.STATUS_RESTORE, HE.HP_RESTORE, HE.ACC_REDUCE, HE.HP_RESTORE_GRADUAL,
  HE.PIKA_SPATK_UP, HE.CUBONE_ATK_UP, HE.WEAKEN_SE_FIRE, HE.WEAKEN_SE_WATER,
  HE.WEAKEN_SE_ELECTRIC, HE.WEAKEN_SE_GRASS, HE.WEAKEN_SE_ICE, HE.WEAKEN_SE_FIGHT,
  HE.WEAKEN_SE_POISON, HE.WEAKEN_SE_GROUND, HE.WEAKEN_SE_FLYING, HE.WEAKEN_SE_PSYCHIC,
  HE.WEAKEN_SE_BUG, HE.WEAKEN_SE_ROCK, HE.WEAKEN_SE_GHOST, HE.WEAKEN_SE_DRAGON,
  HE.WEAKEN_SE_DARK, HE.WEAKEN_SE_STEEL, HE.WEAKEN_NORMAL, HE.HP_RESTORE_PSN_TYPE,
])

/** 도둑질 (3405) */
function thief(turn: AiTurn): number {
  if (!THIEF_ITEMS.has(turn.foe.itemEffect)) return -2
  return skip(turn.random, 50) ? 0 : 1
}

/**
 * 꿰뚫어보기 (3605).
 * ⚠️ **원작 BUG** — 상대 대신 **제** 타입을 본다 (주석이 그렇게 적었다)
 */
function foresight(turn: AiTurn): number {
  const { self, foe, random } = turn
  const ghost = hasType(self, TYPE.GHOST)
  if (!ghost && foe.boosts.evasion < 3) return -2
  if (ghost && skip(random, 80)) return 0
  return skip(random, 80) ? 0 : 2
}

/** 버티기 (3630) — 체력 35% 이상이면 −1로 **흘러내린다** (코드대로) */
function endure(turn: AiTurn): number {
  const mine = hp(turn.self)
  if (mine < 4) return -1
  if (mine < 35) return skip(turn.random, 70) ? 0 : 1
  return -1
}

/** 바톤터치 (3648) — 판단이 제일 높은 능력 하나에 매달린다 */
function batonPass(turn: AiTurn): number {
  const { self, random } = turn
  const mine = hp(self)
  const slower = isSlower(turn)
  if (anyHigh(self, OFF_STATS)) {
    if (!slower && mine > 60) return 0
    if (slower && mine > 70) return 0
    return skip(random, 80) ? 0 : 2
  }
  if (OFF_STATS.some((s) => self.boosts[s] >= 2)) {
    // ⚠️ 느릴 때는 체력 70% **미만**에서 0이고, 그 이상이 −2다 (주석과 반대)
    if (slower) return mine < 70 ? 0 : -2
    return mine > 60 ? -2 : 0
  }
  return -2
}

/** 비바라기 (3734) */
function rainDance(turn: AiTurn): number {
  const { self } = turn
  if (!isFaster(turn) && self.ability === AB.SWIFT_SWIM) return 1
  if (hp(self) < 40) return -1
  const w = turn.weather
  if (w === 'Hail' || w === 'SunnyDay' || w === 'Sandstorm') return 1
  if (self.ability === AB.RAIN_DISH) return 1
  if (self.ability === AB.HYDRATION && statused(self)) return 1
  return 0
}

/** 배북 (3800) */
function bellyDrum(turn: AiTurn): number {
  return hp(turn.self) < 90 ? -2 : 0
}

/** 자기암시 (3811) */
function psychUp(turn: AiTurn): number {
  const { self, foe, random } = turn
  if (!anyHigh(foe, OFF_STATS)) return -2
  if (['atk', 'def', 'spa', 'spd'].some((s) => self.boosts[s as Stat] < 0)) return 1
  if (self.boosts.evasion < 0) return 2
  return skip(random, 50) ? 0 : -2
}

/** 싸라기눈 (4086) */
function hail(turn: AiTurn): number {
  const { self } = turn
  if (hp(self) < 40) return -1
  const w = turn.weather
  if (w !== 'SunnyDay' && w !== 'RainDance' && w !== 'Sandstorm') return 0
  let delta = 1
  if (selfKnows(turn, MV.BLIZZARD)) delta += 2
  if (self.ability === AB.ICE_BODY) delta += 2
  return delta
}

/** 객기 (4117) — ⚠️ 원작 BUG: 제 상태가 아니라 **상대** 상태를 본다 */
function facade(turn: AiTurn): number {
  const s = turn.foe.status
  return s === 'psn' || s === 'tox' || s === 'brn' || s === 'par' ? 1 : 0
}

/** 병아리힘 — 쓰고 나서 제 공격·방어가 깎이는 기술 (4464) */
function superpower(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  if (turn.self.boosts.atk < 0) return -1
  const mine = hp(turn.self)
  if (isSlower(turn)) return mine >= 60 ? -1 : 0
  return mine > 40 ? -1 : 0
}

/** 죽기살기 (4580) */
function endeavor(turn: AiTurn): number {
  if (hp(turn.foe) < 70) return -1
  const limit = isSlower(turn) ? 50 : 40
  return hp(turn.self) > limit ? -1 : 1
}

/** 해수스파우트 (4607) — ⚠️ 원작 BUG: 제 체력 대신 **상대** 체력을 본다 */
function waterSpout(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  const limit = isSlower(turn) ? 70 : 50
  return hp(turn.foe) > limit ? 0 : -1
}

/** 봉인 (4631) */
function imprison(turn: AiTurn): number {
  if (firstTurn(turn)) return 0
  return skip(turn.random, 100) ? 0 : 2
}

/** 리프레시 (4641) */
function refresh(turn: AiTurn): number {
  return hp(turn.foe) < 50 ? -1 : 0
}

/** 가로챔 (4652) */
function snatch(turn: AiTurn): number {
  const { random } = turn
  const tryMinus2 = (): number => (skip(random, 30) ? 0 : -2)
  const tryPlus2 = (): number => (skip(random, 150) ? 0 : 2)
  if (firstTurn(turn)) return tryPlus2()
  if (skip(random, 30)) return 0
  if (isSlower(turn)) {
    if (hp(turn.foe) > 25) return tryMinus2()
    if (foeKnowsEffect(turn, E.RESTORE_HALF_HP) || foeKnowsEffect(turn, E.DEF_UP_DOUBLE_ROLLOUT_POWER)) {
      return tryPlus2()
    }
    return skip(random, 230) ? tryMinus2() : 1
  }
  if (hp(turn.self) !== 100 || hp(turn.foe) < 70) return tryMinus2()
  if (skip(random, 60)) return 0
  return tryMinus2()
}

/** 물놀이 (4741) */
function waterSport(turn: AiTurn): number {
  if (hp(turn.self) < 50) return -1
  return hasType(turn.foe, TYPE.FIRE) ? 1 : -1
}

/** 진흙놀이 (4698) */
function mudSport(turn: AiTurn): number {
  if (hp(turn.self) < 50) return -1
  return hasType(turn.foe, TYPE.ELECTRIC) ? 1 : -1
}

/** 중력 (4779) */
function gravity(turn: AiTurn): number {
  const { foe, random } = turn
  const airborne = foe.ability === AB.LEVITATE || foe.volatiles.has('magnetrise') || hasType(foe, TYPE.FLYING)
  const tryPlus1 = (): number => (skip(random, 64) ? 0 : 1)
  if (airborne) return tryPlus1()
  if (hp(turn.self) < 60) return 0
  return skip(random, 128) ? tryPlus1() : 0
}

/** 미라클아이 (4802) */
function miracleEye(turn: AiTurn): number {
  const { foe, random } = turn
  if (hasType(foe, TYPE.DARK)) {
    if (skip(random, 80)) return 0
  } else if (foe.boosts.evasion < 3) {
    return -2
  }
  return skip(random, 80) ? 0 : 2
}

/** 깨우기싸다귀 (4826) */
function wakeUpSlap(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  return turn.foe.status === 'slp' ? 1 : 0
}

/** 해머암 (4846) */
function hammerArm(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  return isSlower(turn) ? 1 : 0
}

/** 소금물 (4870) */
function brine(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  if (hp(turn.foe) > 50) return 0
  return skip(turn.random, 128) ? 1 : 2
}

/** 회복 효과를 가진 도구 (`Expert_Feint_GradualRecoveryItems` 4945) */
const GRADUAL_ITEMS: ReadonlySet<number> = new Set([HE.HP_RESTORE_GRADUAL, HE.HP_RESTORE_PSN_TYPE])

/** 페인트 (4889) */
function feint(turn: AiTurn): number {
  const { self, foe, random } = turn
  if (!foeKnowsEffect(turn, E.PROTECT) && !skip(random, 64)) return 0
  let delta = 0
  const suffering = self.status === 'tox' || self.volatiles.has('curse')
    || self.volatiles.has('perish3') || self.volatiles.has('attract')
    || self.volatiles.has('leechseed') || self.volatiles.has('yawn')
  if (suffering || (hp(foe) !== 100 && GRADUAL_ITEMS.has(foe.itemEffect))) {
    if (!skip(random, 128)) delta += 1
  }
  const chain = turn.foeProtectChain ?? 0
  // 연속 횟수가 정확히 2면 어느 갈래에도 안 걸려 첫 갈래로 흘러든다 (코드대로)
  if (chain > 2) return delta - 2
  if (chain === 1) return skip(random, 192) ? delta : delta + 1
  return skip(random, 128) ? delta : delta + 1
}

/** 쪼기 (4954) */
function pluck(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  let delta = 0
  if (firstTurn(turn) && !skip(turn.random, 64)) delta += 1
  if (!skip(turn.random, 128)) delta += 1
  return delta
}

/** 순풍 (4979) */
function tailwind(turn: AiTurn): number {
  if (skip(turn.random, 64)) return 0
  const mine = hp(turn.self)
  if (isFaster(turn) || mine < 31) return -1
  if (mine > 75) return 1
  return skip(turn.random, 64) ? 0 : 1
}

/** 메탈버스트 (5026) */
function metalBurst(turn: AiTurn): number {
  const { self, random } = turn
  if (foeUnreliable(turn)) return -1
  if (foeKnowsEffect(turn, E.DOUBLE_POWER_IF_HIT) || foeKnowsEffect(turn, E.HIT_LAST_WHIFF_IF_HIT)
    || foeKnowsEffect(turn, E.PRIORITY_NEG_1_BYPASS_ACCURACY)) {
    return -1
  }
  let delta = 0
  const mine = hp(self)
  if (mine <= 30 && !skip(random, 10)) delta -= 1
  if (mine <= 50 && !skip(random, 100)) delta -= 1
  if (!skip(random, 192)) delta += 1
  if (foeLastPower(turn) !== 0 && foeTaunted(turn) && !skip(random, 100)) delta += 1
  if (foeTaunted(turn) && !skip(random, 100)) delta += 1
  return delta
}

/** 보복 (5166) */
function payback(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  if (isFaster(turn) || hp(turn.self) < 30 || skip(turn.random, 64)) return 0
  return 1
}

/** 확인사살 (5186) */
function assurance(turn: AiTurn, move: AiMove): number {
  const { self, random } = turn
  if (resisted(move, turn.foe)) return -1
  if (isFaster(turn)) return 0
  if (self.ability === AB.ROUGH_SKIN || self.heldItem === IT.JABOCA_BERRY
    || self.heldItem === IT.ROWAP_BERRY) {
    return skip(random, 128) ? 0 : 1
  }
  return skip(random, 128) ? (skip(random, 128) ? 0 : 1) : 0
}

/** 입막음 (5220) */
function embargo(turn: AiTurn): number {
  return skip(turn.random, 128) ? 0 : 1
}

/** 내던지기에서 아깝지 않은 도구 (`Expert_Fling_DesirableFlingEffects` 5278) */
const FLING_ITEMS: ReadonlySet<number> = new Set([
  HE.SOMETIMES_FLINCH, HE.STRENGTHEN_POISON, HE.PSN_USER, HE.BRN_USER, HE.PIKA_SPATK_UP,
])

/** 내던지기 (5228) */
function fling(turn: AiTurn, move: AiMove): number {
  const { self, foe, random } = turn
  if (resisted(move, foe)) return FLING_ITEMS.has(self.itemEffect) ? 0 : -1
  const power = self.flingPower ?? 0
  const tryPlus1 = (): number => (skip(random, 64) ? 0 : 1)
  if (power < 30) return -2
  if (power > 90) {
    const e = eff(move, foe)
    if (e === 2 || e === 4) return 4 + tryPlus1()
    return (skip(random, 128) ? 0 : 1) + tryPlus1()
  }
  if (power > 60) return tryPlus1()
  return skip(random, 128) ? 0 : -1
}

/** 비장의카드 (5305) */
function trumpCard(turn: AiTurn, move: AiMove): number {
  const { self, foe, random } = turn
  if (resisted(move, foe)) return -1
  const plus1 = (): number => (skip(random, 100) ? 0 : 1)
  const plus1Maybe2 = (): number => 1 + plus1()
  const pp = move.pp ?? 99
  if (pp === 1) return 3
  if (pp === 2) return plus1Maybe2()
  if (pp === 3) return plus1()
  let delta = 0
  if (foe.ability === AB.PRESSURE && !skip(random, 30)) delta += 1
  if (foe.boosts.evasion >= 5 || self.boosts.accuracy <= -5) return delta + plus1Maybe2()
  if (foe.boosts.evasion >= 3 || self.boosts.accuracy <= -3) return delta + plus1()
  return delta
}

/** 회복을 막으면 값어치가 있는 상대의 기술 효과 (`Expert_HealBlock` 5358) */
const HEALING_EFFECTS: readonly number[] = [
  E.RECOVER_DAMAGE_SLEEP, E.RESTORE_HALF_HP, E.HEAL_HALF_REMOVE_FLYING_TYPE, E.UNUSED_157,
  E.HEAL_HALF_MORE_IN_SUN, E.REST, E.SWALLOW, E.RECOVER_HALF_DAMAGE_DEALT,
  E.GROUND_TRAP_USER_CONTINUOUS_HEAL, E.RESTORE_HP_EVERY_TURN, E.STATUS_LEECH_SEED,
  E.FAINT_AND_FULL_HEAL_NEXT_MON, E.FAINT_FULL_RESTORE_NEXT_MON,
]

/** 회복봉인 (5358) */
function healBlock(turn: AiTurn): number {
  const { self, foe, random } = turn
  const sure = HEALING_EFFECTS.some((e) => foeKnowsEffect(turn, e))
    || self.volatiles.has('leechseed') || foe.volatiles.has('aquaring') || foe.volatiles.has('ingrain')
  if (!sure && !skip(random, 96)) return 0
  return skip(random, 25) ? 0 : 1
}

/** 쥐어짜기 (5402) */
function wringOut(turn: AiTurn, move: AiMove): number {
  const { foe, random } = turn
  if (resisted(move, foe) || hp(foe) < 50) return -1
  const tryPlus1 = (): number => (skip(random, 25) ? 0 : 1)
  if (hp(foe) === 100) return (isSlower(turn) ? 1 : 2) + tryPlus1()
  if (hp(foe) > 85) return tryPlus1()
  return 0
}

/** 위액 (5468) */
function gastroAcid(turn: AiTurn): number {
  const { foe, random } = turn
  if (skip(random, 64)) return 0
  let delta = 1
  const theirs = hp(foe)
  if (theirs > 70) return delta
  if (!skip(random, 128)) delta -= 1
  if (theirs > 50) return delta
  delta -= 1
  if (theirs > 30) return delta
  return delta - 1
}

/** 행운의주문 (5493) */
function luckyChant(turn: AiTurn): number {
  if (hp(turn.self) < 70) return -1
  if (foeKnowsEffect(turn, E.HIGH_CRITICAL) || foeKnowsEffect(turn, E.HIGH_CRITICAL_BURN_HIT)
    || foeKnowsEffect(turn, E.HIGH_CRITICAL_POISON_HIT)) {
    return 1
  }
  return skip(turn.random, 64) ? 0 : 1
}

/**
 * 파워스왑(5629)·가드스왑(5763). 둘이 같은 표고 둘째 능력만 다르다.
 * 첫 능력의 차이로 열을 고르고, 둘째 능력의 차이로 시작 줄을 고른다. 줄마다 50%로 그 값에서
 * 멈추고 아니면 한 칸 아래로 내려간다
 */
function swapStages(turn: AiTurn, a: 'atk' | 'def', b: 'spa' | 'spd'): number {
  const first = turn.foe.boosts[a] - turn.self.boosts[a]
  const second = turn.foe.boosts[b] - turn.self.boosts[b]
  const pick = (hi: number, mid: number, zero: number, low: number): number => {
    if (second > 3) return hi
    if (second > 1) return mid
    if (second === 0) return zero
    return low
  }
  let start: number
  if (first > 3) start = pick(5, 4, 3, 0)
  else if (first > 1) start = pick(4, 3, 2, 0)
  else if (first > 0) start = pick(3, 2, 1, 0)
  else if (first === 0) start = second > 3 ? 3 : second > 1 ? 2 : second > 0 ? 1 : 0
  else return 0
  for (let n = start; n >= 1; n--) if (!skip(turn.random, 128)) return n
  return 0
}

/** 벌주기 (5897) */
function punishment(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return 0
  let sum = 0
  for (const s of ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const) {
    if (turn.foe.boosts[s] > 0) sum += turn.foe.boosts[s]
  }
  const entry = sum > 6 ? 4 : sum > 5 ? 3 : sum > 4 ? 2 : sum > 2 ? 1 : 0
  // ⚠️ 줄마다 **따로** 굴려 합친다 — 주석은 한 줄만 받는 것처럼 적었다 (코드대로)
  let delta = 0
  for (let n = entry; n >= 1; n--) if (!skip(turn.random, 128)) delta += n
  return delta
}

/** 마지막발악 (5950) */
function lastResort(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  return turn.lastResort === true ? 1 : 0
}

/** 불면증씨 (5970) */
function worrySeed(turn: AiTurn): number {
  let delta = 0
  if (foeKnows(turn, MV.REST)) delta += 1
  if (hp(turn.self) >= 50 && !skip(turn.random, 128)) delta += 1
  if (!skip(turn.random, 64)) delta += 1
  return delta
}

/** 기습 (5992) */
function suckerPunch(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  return skip(turn.random, 64) ? 0 : 1
}

/** 독압정 · 압정 · 스텔스록 (3588 · 6009 · 6265) — 세 갈래가 똑같다 */
function hazard(turn: AiTurn): number {
  if (skip(turn.random, 128)) return 0
  let delta = 1
  if ((selfKnows(turn, MV.ROAR) || selfKnows(turn, MV.WHIRLWIND)) && !skip(turn.random, 64)) {
    delta += 1
  }
  return delta
}

/** 아쿠아링 (6078) */
function aquaRing(turn: AiTurn): number {
  if (hp(turn.self) < 30 || skip(turn.random, 128)) return 0
  return 1
}

/** 자기부상 (6087) */
function magnetRise(turn: AiTurn): number {
  const { foe } = turn
  if (hp(turn.self) < 50) return 0
  let delta = 0
  if (foeKnows(turn, MV.EARTHQUAKE) || foeKnows(turn, MV.EARTH_POWER) || foeKnows(turn, MV.FISSURE)) {
    delta += 1
  }
  if (hasType(foe, TYPE.GROUND) || !skip(turn.random, 128)) delta += 1
  return delta
}

/** 눈보라 (6213) */
function blizzard(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return skip(turn.random, 50) ? 0 : -3
  return turn.weather === 'Hail' ? 1 : 0
}

/** 유혹 (6233) */
function captivate(turn: AiTurn): number {
  const { foe } = turn
  let delta = 0
  if (foe.boosts.spa !== 0) {
    delta -= 1
    if (hp(turn.self) <= 90) delta -= 1
    if (foe.boosts.spa <= -3 && !skip(turn.random, 50)) delta -= 2
  }
  if (hp(foe) <= 70) delta -= 2
  if (lastClass(turn) === 'physical' && !skip(turn.random, 64)) delta -= 1
  return delta
}

/** 치유의소원 (6304) */
function healingWish(turn: AiTurn): number {
  const { random } = turn
  const mine = hp(turn.self)
  if (mine >= 80 && !isSlower(turn)) return skip(random, 192) ? 0 : -5
  let delta = 0
  if (mine > 50) return skip(random, 50) ? 0 : -1
  if (!skip(random, 192)) {
    delta += 1
    if (!hasSuperEffective(turn) && !skip(random, 192)) delta += 1
    if (turn.partyDealsMore?.() === true && !skip(random, 128)) delta += 1
  }
  if (mine <= 30 && !skip(random, 128)) delta += 1
  return delta
}

/** 토해내기 (4076) */
function spitUp(turn: AiTurn): number {
  const count = turn.stockpile ?? Math.max(
    0, ...['stockpile1', 'stockpile2', 'stockpile3']
      .map((v, i) => (turn.self.volatiles.has(v) ? i + 1 : 0)),
  )
  if (count < 2) return 0
  return skip(turn.random, 80) ? 0 : 2
}

/** 변신 (2610) */
function conversion(turn: AiTurn): number {
  let delta = hp(turn.self) > 90 ? 0 : -2
  if (turnCount(turn) !== 0 && skip(turn.random, 200)) delta -= 2
  return delta
}

/** 광합성류 (2625) — 회복기와 같은데 날씨가 나쁘면 −2를 더 깎는다 */
export function synthesisWeather(turn: AiTurn): number {
  const w = turn.weather
  return w === 'Hail' || w === 'RainDance' || w === 'Sandstorm' ? -2 : 0
}

/** 명중 올리기 (2166) */
function accuracyUp(turn: AiTurn): number {
  let delta = 0
  if (turn.self.boosts.accuracy >= 3 && !skip(turn.random, 50)) delta -= 2
  if (hp(turn.self) <= 70) delta -= 2
  return delta
}

/** 필살의일격 (2953) */
function vitalThrow(turn: AiTurn): number {
  const { random } = turn
  if (isSlower(turn)) return 0
  const mine = hp(turn.self)
  if (mine > 60) return 0
  if (mine >= 40 && skip(random, 180)) return 0
  return skip(random, 50) ? 0 : -1
}

/** 잠꼬대 (3324) */
function sleepTalk(turn: AiTurn): number {
  return turn.self.status === 'slp' ? 10 : -5
}

/**
 * 하늘·땅속·물속 기술 (`Expert_ChargeTurnWithInvuln` 3989 · `Expert_ShadowForce` 4011).
 *
 * ⚠️ 상대가 방어를 **모를 때** 원작은 그림자꿈 갈래로 뛴다 — 반감이어도 **+1로 끝난다**
 * (주석이 「Bug?」라고 적었다). 방어를 알면 −1로 끝난다
 */
export function chargeWithInvuln(turn: AiTurn, move: AiMove, shadowForce: boolean): number {
  const { self, foe, random } = turn
  const plus1 = (): number => (skip(random, 80) ? 0 : 1)
  if (!shadowForce) {
    if (self.heldItem === IT.POWER_HERB) return 2
    if (foeKnowsEffect(turn, E.PROTECT)) return -1
  }
  if (resisted(move, foe)) return 1
  if (shadowForce && self.heldItem === IT.POWER_HERB) return 1
  return chargeConditions(turn, plus1)
}

/**
 * 하늘·땅속 기술의 나머지 조건 (`Expert_ChargeTurnWithInvuln_CheckConditions` 4025).
 * ⚠️ 반감이어도 **+1**이다 (주석이 「Bug?」라고 적었다) — 위에서 함수가 이미 얹었다
 */
function chargeConditions(turn: AiTurn, plus1: () => number): number {
  const { self, foe } = turn
  if (foe.status === 'tox' || foe.volatiles.has('curse') || foe.volatiles.has('leechseed')) {
    return plus1()
  }
  const w = turn.weather
  if (w === 'Sandstorm') {
    if (self.types.some((t) => t === TYPE.GROUND || t === TYPE.ROCK || t === TYPE.STEEL)) return plus1()
  } else if (w === 'Hail') {
    if (hasType(self, TYPE.ICE)) return plus1()
  }
  if (isSlower(turn)) return 0
  if (turn.foeLast?.effect === E.NEXT_ATTACK_ALWAYS_HITS) return 0
  return plus1()
}

/** 기합펀치 (4126) */
function focusPunch(turn: AiTurn, move: AiMove): number {
  const { self, foe, random } = turn
  if (resisted(move, foe)) return -1
  if (self.volatiles.has('substitute')) return 5
  if (foe.status === 'slp') return 1
  if (foe.volatiles.has('attract') || foe.volatiles.has('confusion')) {
    return skip(random, 100) ? 0 : 1
  }
  if (firstTurn(turn)) return 0
  return skip(random, 200) ? 0 : 1
}

/** 코고는소리 (4162) */
function smellingSalts(turn: AiTurn): number {
  return turn.foe.status === 'par' ? 1 : 0
}

/** 마법코트 (4489) */
function magicCoat(turn: AiTurn): number {
  const { foe, random } = turn
  let delta = 0
  if (hp(foe) <= 30 && !skip(random, 100)) delta -= 1
  if (!firstTurn(turn)) return skip(random, 30) ? delta : delta - 1
  return skip(random, 150) ? delta : delta + 1
}

/** 재활용 (4514). ⚠️ 우리 sim은 쓴 도구를 안 알려 준다 — 없을 때의 값(−2)으로 읽는다 */
function recycle(turn: AiTurn): number {
  const item = turn.recycleItem ?? 0
  if (item !== IT.CHESTO_BERRY && item !== IT.LUM_BERRY && item !== IT.STARF_BERRY) return -2
  return skip(turn.random, 50) ? 0 : 1
}

/** 탁쳐서떨구기 (4568) */
function knockOff(turn: AiTurn): number {
  if (hp(turn.foe) < 30 || firstTurn(turn)) return 0
  return skip(turn.random, 180) ? 0 : 1
}

/** 사이코시프트 (5293) */
function psychoShift(turn: AiTurn): number {
  if (!statused(turn.self)) return -10
  if (skip(turn.random, 128) || hp(turn.foe) < 30) return 0
  return 1
}

/** 파워트릭 (5439) */
function powerTrick(turn: AiTurn): number {
  const mine = hp(turn.self)
  if (mine > 90) return skip(turn.random, 96) ? 0 : 1
  if (mine > 60) return skip(turn.random, 128) ? 0 : 1
  if (mine > 30) return skip(turn.random, 164) ? 0 : 1
  return -2
}

/** 선수필승 (5516) */
function meFirst(turn: AiTurn): number {
  const { random } = turn
  if (isSlower(turn)) return -2
  let delta = 0
  const tryPlus1 = (): number => (skip(random, 64) ? 0 : 1)
  if (foeLastBeatsMe(turn) && !skip(random, 32)) delta += 1
  if (lastClass(turn) === 'status') return delta + tryPlus1()
  if (skip(random, 128)) return delta
  return delta + 1 + tryPlus1()
}

/** 따라하기 (5549) */
function copycat(turn: AiTurn): number {
  const { random } = turn
  const worthy = COPY_WORTHY.has(turn.foeLast?.id ?? 0)
  const dealsMore = foeLastBeatsMe(turn)
  const checkEncouraged = (): number => {
    if (dealsMore || worthy || skip(random, 80)) return 0
    return -1
  }
  if (isSlower(turn)) return checkEncouraged()
  if (dealsMore) return skip(random, 32) ? 0 : 2
  if (!worthy) return checkEncouraged()
  return skip(random, 128) ? 0 : 2
}

/** 하트스왑 (6028) */
function heartSwap(turn: AiTurn): number {
  const { self, foe, random } = turn
  const foeBoosted = OFF_STATS.some((s) => foe.boosts[s] >= 2) || foe.volatiles.has('focusenergy')
  if (!foeBoosted) return -2
  if (['atk', 'def', 'spa', 'spd'].some((s) => self.boosts[s as Stat] < 0)) return 1
  if (self.boosts.evasion < 0) return 2
  if (!self.volatiles.has('focusenergy')) return 1
  return skip(random, 50) ? 0 : -2
}

/** 고속스핀 (6122) */
function defog(turn: AiTurn): number {
  const { self, foe, random } = turn
  const hazards = foe.side.has('spikes') || foe.side.has('stealthrock') || foe.side.has('toxicspikes')
  const screens = foe.side.has('reflect') || foe.side.has('lightscreen')
  let delta = 0
  /** `Expert_Defog_CheckUserHPAndOpponentEvasion` 이후 */
  const tail = (): number => {
    if (hp(self) < 70 || foe.boosts.evasion <= -3) {
      if (!skip(random, 50)) delta -= 2
    }
    if (hp(foe) <= 70) delta -= 2
    return delta
  }
  if (screens) {
    if (hp(self) <= 30 && self.bench === 0) {
      // `Expert_Defog_TryScoreMinus2`로 곧장 뛰어 +1을 건너뛴다
      return tail()
    }
    delta += 1
    if (foe.bench === 0) return delta
    if (hazards && !skip(random, 128)) delta -= 1
    return tail()
  }
  if (hazards) delta -= 2
  return tail()
}

/** 트릭룸 (6187) — 더블이면 TAG_STRATEGY가 맡는다 */
function trickRoom(turn: AiTurn): number {
  if (turn.doubles) return 0
  if (hp(turn.self) <= 30 && turn.self.bench === 0) return 0
  if (!isSlower(turn)) return -1
  return skip(turn.random, 64) ? 0 : 3
}

// ── 지닌 도구 · 특성을 바꾸는 기술 ──────────────────────────────────────────────

/** 트릭이 상대에게 떠넘기기 아쉬운 도구 (`Expert_Trick_BadOpponentItems` 1189) */
const BAD_TO_TRADE: ReadonlySet<number> = new Set([
  HE.EVS_UP_SPEED_DOWN, HE.CHOICE_ATK, HE.CHOICE_SPATK, HE.CHOICE_SPEED, HE.SPEED_DOWN_GROUNDED,
  HE.PRIORITY_DOWN, HE.DMG_USER_CONTACT_XFR, HE.LVLUP_ATK_EV_UP, HE.LVLUP_DEF_EV_UP,
  HE.LVLUP_SPATK_EV_UP, HE.LVLUP_SPDEF_EV_UP, HE.LVLUP_SPEED_EV_UP, HE.LVLUP_HP_EV_UP,
  HE.PSN_USER, HE.BRN_USER, HE.HP_RESTORE_PSN_TYPE,
])

/** 내가 쥔 것이 짐인 도구 (`Expert_Trick_DisruptiveItems` 1141). ⚠️ 원작 BUG: 힘의머리띠가 빠졌다 */
const DISRUPTIVE: ReadonlySet<number> = new Set([
  HE.CHOICE_ATK, HE.CHOICE_SPATK, HE.CHOICE_SPEED, HE.SPEED_DOWN_GROUNDED, HE.PRIORITY_DOWN,
  HE.DMG_USER_CONTACT_XFR, HE.LVLUP_ATK_EV_UP, HE.LVLUP_DEF_EV_UP, HE.LVLUP_SPATK_EV_UP,
  HE.LVLUP_SPDEF_EV_UP, HE.LVLUP_SPEED_EV_UP, HE.LVLUP_HP_EV_UP,
])

const FLAVOR_BERRIES: ReadonlySet<number> = new Set([
  HE.HP_RESTORE_SPICY, HE.HP_RESTORE_DRY, HE.HP_RESTORE_SWEET, HE.HP_RESTORE_BITTER,
  HE.HP_RESTORE_SOUR,
])

/** 트릭·바꿔치기 (4173) */
function trick(turn: AiTurn): number {
  const { self, foe } = turn
  const mine = self.itemEffect
  const theirs = foe.itemEffect
  const poisoned = (m: AiMon, side: ReadonlyMap<string, number>, klutz: boolean): boolean =>
    statused(m) || side.has('safeguard') || hasType(m, TYPE.STEEL) || hasType(m, TYPE.POISON)
    || m.ability === AB.IMMUNITY || m.ability === AB.MAGIC_GUARD || m.ability === AB.POISON_HEAL
    || (klutz && m.ability === AB.KLUTZ)
  const burnt = (m: AiMon, side: ReadonlyMap<string, number>, klutz: boolean): boolean =>
    m.ability === AB.WATER_VEIL || m.ability === AB.MAGIC_GUARD || statused(m)
    || side.has('safeguard') || hasType(m, TYPE.FIRE) || (klutz && m.ability === AB.KLUTZ)
  if (DISRUPTIVE.has(mine)) return BAD_TO_TRADE.has(theirs) ? -3 : 5
  if (mine === HE.PSN_USER) {
    if (BAD_TO_TRADE.has(theirs)) return -3
    if (poisoned(foe, foe.side, false)) return poisoned(self, self.side, true) ? -3 : 5
    return 5
  }
  if (mine === HE.BRN_USER) {
    if (BAD_TO_TRADE.has(theirs)) return -3
    if (burnt(foe, foe.side, false)) {
      if (self.ability === AB.KLUTZ) return -5
      return burnt(self, self.side, true) ? -3 : 5
    }
    return 5
  }
  if (mine === HE.HP_RESTORE_PSN_TYPE) {
    if (BAD_TO_TRADE.has(theirs)) return -3
    const foeOk = hasType(foe, TYPE.POISON)
    if (foeOk || foe.ability === AB.MAGIC_GUARD) {
      if (foeOk) {
        return hasType(self, TYPE.POISON) || self.ability === AB.MAGIC_GUARD
          || self.ability === AB.KLUTZ ? -3 : 5
      }
      return poisoned(self, self.side, true) ? -3 : 5
    }
    return 5
  }
  if (FLAVOR_BERRIES.has(mine)) {
    if (BAD_TO_TRADE.has(theirs) || FLAVOR_BERRIES.has(theirs)) return -3
    return skip(turn.random, 50) ? 0 : 2
  }
  return -3
}

/** 특성 가로채기·바꾸기에서 탐나는 특성 (`Expert_ChangeUserAbility_DesirableAbilities` 4435) */
const DESIRABLE: ReadonlySet<number> = new Set([
  AB.SPEED_BOOST, AB.BATTLE_ARMOR, AB.SAND_VEIL, AB.STATIC, AB.FLASH_FIRE, AB.WONDER_GUARD,
  AB.EFFECT_SPORE, AB.SWIFT_SWIM, AB.HUGE_POWER, AB.RAIN_DISH, AB.CUTE_CHARM, AB.SHED_SKIN,
  AB.MARVEL_SCALE, AB.PURE_POWER, AB.CHLOROPHYLL, AB.SHIELD_DUST, AB.ADAPTABILITY,
  AB.MAGIC_GUARD, AB.MOLD_BREAKER, AB.SUPER_LUCK, AB.UNAWARE, AB.TINTED_LENS, AB.FILTER,
  AB.SOLID_ROCK, AB.RECKLESS,
])

/** 특성 바꾸기 (4412) — 제 특성이 탐나면 −1, 아니고 상대 것이 탐나면 80%로 +2 */
function changeUserAbility(turn: AiTurn): number {
  if (DESIRABLE.has(turn.self.ability)) return -1
  if (DESIRABLE.has(turn.foe.ability)) return skip(turn.random, 50) ? 0 : 2
  return -1
}

type Routine = (turn: AiTurn, move: AiMove) => number

/**
 * 분기표에 있는 효과 → 이 파일의 루틴. 표에 없는 효과는 점수를 안 건드린다.
 * `Expert_Recovery`(2637)·`Expert_Explosion`(1838)·`Expert_HighCritical`(2824)·
 * `Expert_ChargeTurnNoInvuln`(3930)과 능력 올리기·깎기는 `expert.ts`에 있다
 */
const ROUTINES: ReadonlyMap<number, Routine> = new Map<number, Routine>([
  [E.RECOVER_DAMAGE_SLEEP, (turn, move) => dreamEater(turn, move)],
  [E.COPY_MOVE, (turn) => mirrorMove(turn)],
  [E.ACC_UP, (turn) => accuracyUp(turn)],
  [E.ACC_UP_2, (turn) => accuracyUp(turn)],
  [E.RESET_STAT_CHANGES, (turn) => haze(turn)],
  [E.BIDE, (turn) => bide(turn)],
  [E.FORCE_SWITCH, (turn) => forceSwitch(turn)],
  [E.CONVERSION, (turn) => conversion(turn)],
  [E.ONE_HIT_KO, (turn) => ohko(turn)],
  [E.HALVE_HP, (turn) => superFang(turn)],
  [E.STATUS_POISON, (turn) => statusPoison(turn)],
  [E.ATK_UP_2_STATUS_CONFUSION, (turn) => swagger(turn)],
  [E.SP_ATK_UP_CAUSE_CONFUSION, (turn) => flatter(turn)],
  [E.PRIORITY_NEG_1_BYPASS_ACCURACY, (turn) => vitalThrow(turn)],
  [E.SET_SUBSTITUTE, (turn) => substitute(turn)],
  [E.DISABLE, (turn) => disable(turn)],
  [E.COUNTER, (turn) => counterOrCoat(turn, 'physical')],
  [E.MIRROR_COAT, (turn) => counterOrCoat(turn, 'special')],
  [E.ENCORE, (turn) => encore(turn)],
  [E.AVERAGE_HP, (turn) => painSplit(turn)],
  [E.DAMAGE_WHILE_ASLEEP, () => nightmare()],
  [E.NEXT_ATTACK_ALWAYS_HITS, (turn) => lockOn(turn)],
  [E.USE_RANDOM_LEARNED_MOVE_SLEEP, (turn) => sleepTalk(turn)],
  [E.KO_MON_THAT_DEFEATED_USER, (turn) => destinyBond(turn)],
  [E.INCREASE_POWER_WITH_LESS_HP, (turn) => reversal(turn)],
  [E.CURE_PARTY_STATUS, (turn) => healBell(turn)],
  [E.STEAL_HELD_ITEM, (turn) => thief(turn)],
  [E.SET_SPIKES, (turn) => hazard(turn)],
  [E.TOXIC_SPIKES, (turn) => hazard(turn)],
  [E.STEALTH_ROCK, (turn) => hazard(turn)],
  [E.FORESIGHT, (turn) => foresight(turn)],
  [E.SURVIVE_WITH_1_HP, (turn) => endure(turn)],
  [E.PASS_STATS_AND_STATUS, (turn) => batonPass(turn)],
  [E.WEATHER_RAIN, (turn) => rainDance(turn)],
  [E.MAX_ATK_LOSE_HALF_MAX_HP, (turn) => bellyDrum(turn)],
  [E.COPY_STAT_CHANGES, (turn) => psychUp(turn)],
  [E.SPIT_UP, (turn) => spitUp(turn)],
  [E.WEATHER_HAIL, (turn) => hail(turn)],
  [E.DOUBLE_POWER_WHEN_STATUSED, (turn) => facade(turn)],
  [E.HIT_LAST_WHIFF_IF_HIT, (turn, move) => focusPunch(turn, move)],
  [E.DOUBLE_POWER_AND_CURE_PARALYSIS, (turn) => smellingSalts(turn)],
  [E.SWITCH_HELD_ITEMS, (turn) => trick(turn)],
  [E.COPY_ABILITY, (turn) => changeUserAbility(turn)],
  [E.SWITCH_ABILITIES, (turn) => changeUserAbility(turn)],
  [E.GROUND_TRAP_USER_CONTINUOUS_HEAL, () => 0],
  [E.LOWER_OWN_ATK_AND_DEF, (turn, move) => superpower(turn, move)],
  [E.APPLY_MAGIC_COAT, (turn) => magicCoat(turn)],
  [E.RECYCLE, (turn) => recycle(turn)],
  [E.REMOVE_HELD_ITEM, (turn) => knockOff(turn)],
  [E.SET_HP_EQUAL_TO_USER, (turn) => endeavor(turn)],
  [E.DECREASE_POWER_WITH_LESS_USER_HP, (turn, move) => waterSpout(turn, move)],
  [E.MAKE_SHARED_MOVES_UNUSEABLE, (turn) => imprison(turn)],
  [E.HEAL_STATUS, (turn) => refresh(turn)],
  [E.STEAL_STATUS_MOVE, (turn) => snatch(turn)],
  [E.HALVE_ELECTRIC_DAMAGE, (turn) => mudSport(turn)],
  [E.HALVE_FIRE_DAMAGE, (turn) => waterSport(turn)],
  [E.GRAVITY, (turn) => gravity(turn)],
  [E.IGNORE_EVATION_REMOVE_DARK_IMMUNE, (turn) => miracleEye(turn)],
  [E.DOUBLE_POWER_HEAL_SLEEP, (turn, move) => wakeUpSlap(turn, move)],
  [E.SPEED_DOWN_HIT, (turn, move) => hammerArm(turn, move)],
  [E.FAINT_AND_FULL_HEAL_NEXT_MON, (turn) => healingWish(turn)],
  [E.FAINT_FULL_RESTORE_NEXT_MON, (turn) => healingWish(turn)],
  [E.DOUBLE_POWER_WHEN_BELOW_HALF, (turn, move) => brine(turn, move)],
  [E.REMOVE_PROTECT, (turn) => feint(turn)],
  [E.EAT_BERRY, (turn, move) => pluck(turn, move)],
  [E.DOUBLE_SPEED_3_TURNS, (turn) => tailwind(turn)],
  [E.RANDOM_STAT_UP_2, (turn) => acupressure(turn)],
  [E.METAL_BURST, (turn) => metalBurst(turn)],
  [E.DOUBLE_POWER_IF_MOVING_SECOND, (turn, move) => payback(turn, move)],
  [E.DOUBLE_POWER_IF_TARGET_HIT, (turn, move) => assurance(turn, move)],
  [E.PREVENT_ITEM_USE, (turn) => embargo(turn)],
  [E.FLING, (turn, move) => fling(turn, move)],
  [E.TRANSFER_STATUS, (turn) => psychoShift(turn)],
  [E.HIGHER_POWER_WHEN_LOW_PP, (turn, move) => trumpCard(turn, move)],
  [E.PREVENT_HEALING, (turn) => healBlock(turn)],
  [E.INCREASE_POWER_WITH_MORE_HP, (turn, move) => wringOut(turn, move)],
  [E.SWAP_ATK_DEF, (turn) => powerTrick(turn)],
  [E.SUPRESS_ABILITY, (turn) => gastroAcid(turn)],
  [E.PREVENT_CRITS, (turn) => luckyChant(turn)],
  [E.USE_MOVE_FIRST, (turn) => meFirst(turn)],
  [E.USE_LAST_USED_MOVE, (turn) => copycat(turn)],
  [E.SWAP_ATK_SP_ATK_STAT_CHANGES, (turn) => swapStages(turn, 'atk', 'spa')],
  [E.SWAP_DEF_SP_DEF_STAT_CHANGES, (turn) => swapStages(turn, 'def', 'spd')],
  [E.INCREASE_POWER_WITH_MORE_STAT_UP, (turn, move) => punishment(turn, move)],
  [E.FAIL_IF_NOT_USED_ALL_OTHER_MOVES, (turn, move) => lastResort(turn, move)],
  [E.SET_ABILITY_TO_INSOMNIA, (turn) => worrySeed(turn)],
  [E.HIT_FIRST_IF_TARGET_ATTACKING, (turn, move) => suckerPunch(turn, move)],
  [E.SWAP_STAT_CHANGES, (turn) => heartSwap(turn)],
  [E.RESTORE_HP_EVERY_TURN, (turn) => aquaRing(turn)],
  [E.GIVE_GROUND_IMMUNITY, (turn) => magnetRise(turn)],
  [E.REMOVE_HAZARDS_SCREENS_EVA_DOWN, (turn) => defog(turn)],
  [E.TRICK_ROOM, (turn) => trickRoom(turn)],
  [E.BLIZZARD, (turn, move) => blizzard(turn, move)],
  [E.BOUNCE, (turn, move) => chargeWithInvuln(turn, move, false)],
  [E.SHADOW_FORCE, (turn, move) => chargeWithInvuln(turn, move, true)],
  [E.SP_ATK_DOWN_2_OPPOSITE_GENDER, (turn) => captivate(turn)],
]);

/** 이 파일이 판단하는 효과 번호 전부. 적용률 측정이 쓴다 */
export const MORE_HANDLED: ReadonlySet<number> = new Set(ROUTINES.keys())

/** 이 파일의 루틴으로 점수를 매긴다. 이 파일에 없는 효과는 `undefined`다 */
export function scoreExpertMore(turn: AiTurn, move: AiMove): number | undefined {
  return ROUTINES.get(move.effect)?.(turn, move)
}

/** 지압 (5005) */
function acupressure(turn: AiTurn): number {
  const mine = hp(turn.self)
  if (mine < 51) return -1
  if (mine <= 90 && skip(turn.random, 128)) return 0
  return skip(turn.random, 64) ? 0 : 1
}
