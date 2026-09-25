// AI_FLAG_TAG_STRATEGY — 더블에서 짝을 셈에 넣는다 (PLAN §7.7 · PARITY §2.2 · REPAIR §121)
//
// `src/battle/trainer_ai/script.s` 6634~7691을 옮겼다. 더블이면 원작이 **자료와 무관하게**
// 이 비트를 켠다 (`trainer_ai.c` 252 — `BATTLE_TYPE_DOUBLES`면 `thinkingMask |=`).
//
// 루틴은 둘로 갈린다:
//
//   · **상대를 겨눈 벌** (`TagStrategy_Main`) — 반감이면 깎고, 짝의 기술까지 통틀어
//     제일 센 수면 얹고, 지진·파도타기·방전·분연처럼 **짝까지 맞는** 기술은 짝의
//     타입·특성을 보고, 날씨·중력·트릭룸·손가락질·미래예지는 두 마리를 같이 본다
//   · **짝을 겨눈 벌** (`TagStrategy_Partner`) — 짝에게 쓸 이유가 있는 것(저수에게 물,
//     타오르는불꽃에게 불, 근성에게 도깨비불, 도우미…)만 남기고 나머지는 −30이다.
//     다른 루틴은 전부 `IfTargetIsPartner Terminate`로 시작해서 **짝을 겨눈 벌에는 이
//     루틴 하나만 돈다** — `score.scoreMoves`가 그렇게 가른다
//
// ⚠️ **원작의 버그를 고치지 않는다.** 주석에 BUG로 적힌 셋(방전 앞의 땅 타입 검사 차례 ·
// 파도타기가 바위를 안 봄 · 독 갈래가 독·강철 타입을 안 봄)과, 주석과 코드가 어긋나는
// 곳(분연의 건조피부는 **−3**, 솔라파워는 +1 뒤에 **반드시** 50%로 −2를 한 번 더 굴린다,
// 도우미를 배운 짝이 있으면 전기·불꽃·물 기술은 +1을 못 받는다)은 **코드대로** 옮겼다.
// 고치면 원작보다 똑똑해진다 — `score.ts` 머리말과 같은 방침이다
import type { AiMon, AiMove, AiTurn } from './context'
import { hpPercent, knownMoves } from './context'
import { estimateDamage, isDamageScored, killsWithMaxRoll } from './damage'
import { ABILITY, EFFECT } from './rom'
import { effectivenessOf, TYPE } from './typeChart'

// 기술 번호 (`generated/moves.txt`의 줄 차례 −1)
const MOVE = {
  HYDRO_PUMP: 56, SURF: 57, BLIZZARD: 59, THUNDER_WAVE: 86, THUNDER: 87, EARTHQUAKE: 89,
  FIRE_BLAST: 126, ZAP_CANNON: 192, SANDSTORM: 201, SWAGGER: 207, MAGNITUDE: 222,
  DYNAMIC_PUNCH: 223, MEGAHORN: 224, CROSS_CHOP: 238, RAIN_DANCE: 240, SUNNY_DAY: 241,
  FUTURE_SIGHT: 248, HAIL: 258, WILL_O_WISP: 261, FOLLOW_ME: 266, HELPING_HAND: 270,
  TRICK: 271, SKILL_SWAP: 285, DOOM_DESIRE: 353, GRAVITY: 356, ACUPRESSURE: 367,
  FLING: 374, GASTRO_ACID: 380, FOCUS_BLAST: 411, SWITCHEROO: 415, TRICK_ROOM: 433,
  DISCHARGE: 435, LAVA_PLUME: 436, POWER_WHIP: 438, GUNK_SHOT: 441, HEAD_SMASH: 457,
  MAGMA_STORM: 463, SEED_FLARE: 465,
} as const

// 도구 번호 (`generated/items.txt`)
const ITEM_PERSIM_BERRY = 156
const ITEM_LUM_BERRY = 157
const ITEM_TOXIC_ORB = 272
const ITEM_FLAME_ORB = 273

/** 고정 데미지 다섯 — 상성 보정 갈래를 건너뛴다 (일격필살·용의분노·지구던지기·사이코웨이브·소닉붐) */
const FLAT_DAMAGE: ReadonlySet<number> = new Set([
  EFFECT.ONE_HIT_KO, EFFECT.FLAT_40, EFFECT.LEVEL_DAMAGE, EFFECT.RANDOM_LEVEL_DAMAGE, EFFECT.FLAT_20,
])

/** 명중이 낮은 열넷. 짝에게 복안·노가드를 넘길 이유가 된다 (`PartnerHasInaccurateMove`) */
const INACCURATE: readonly number[] = [
  MOVE.FIRE_BLAST, MOVE.THUNDER, MOVE.CROSS_CHOP, MOVE.HYDRO_PUMP, MOVE.DYNAMIC_PUNCH,
  MOVE.BLIZZARD, MOVE.ZAP_CANNON, MOVE.MEGAHORN, MOVE.FOCUS_BLAST, MOVE.GUNK_SHOT,
  MOVE.MAGMA_STORM, MOVE.POWER_WHIP, MOVE.SEED_FLARE, MOVE.HEAD_SMASH,
]

/** `IfRandomLessThan n`이 분기하는가 */
function below(random: () => number, n: number): boolean {
  return Math.floor(random() * 256) < n
}

/** 체력 백분율. 빈 자리는 0이다 — 원작 자리의 `curHP`가 0이다 */
function hp(mon: AiMon | null): number {
  return mon ? hpPercent(mon) : 0
}

/** 특성을 봉인당했으면 없는 셈이다 (`MOVE_EFFECT_ABILITY_SUPPRESSED` · 위액) */
function suppressed(mon: AiMon | null): boolean {
  return mon?.volatiles.has('gastroacid') === true
}

/**
 * 우리 편의 특성 (`LoadBattlerAbility AI_BATTLER_ATTACKER` · `CheckBattlerAbility
 * AI_BATTLER_ATTACKER_PARTNER`). 같은 편이라 진짜 값이다
 */
function own(mon: AiMon | null): number {
  if (!mon || suppressed(mon)) return ABILITY.NONE
  return mon.ability
}

/** 우리 편이 그 특성인가 */
function ownHas(mon: AiMon | null, ability: number): boolean {
  return own(mon) === ability
}

/**
 * 맞는 쪽이 그 특성인가 (`CheckBattlerAbility AI_BATTLER_DEFENDER(_PARTNER)`).
 * 찍지 않는다 — 규칙은 `AiMon.hasAbility`에 있다
 */
function foeHas(mon: AiMon | null, ability: number): boolean {
  if (!mon || suppressed(mon)) return false
  return mon.hasAbility ? mon.hasAbility(ability) : mon.ability === ability
}

/** `FlagBattlerIsType` — 타입 칸 둘 중 하나 */
function isType(mon: AiMon | null, type: number): boolean {
  return mon?.types.includes(type) === true
}

/** 전자부유 중인가 (`MOVE_EFFECT_MAGNET_RISE`) */
function rising(mon: AiMon | null): boolean {
  return mon?.volatiles.has('magnetrise') === true
}

/** 상태 이상인가 (`MON_CONDITION_ANY`) */
function statused(mon: AiMon | null): boolean {
  return mon !== null && mon.status !== 'ok'
}

/** 타오르는불꽃이 켜졌는가 (`moveEffectsData.flashFire`) */
function flashFired(mon: AiMon | null): boolean {
  return mon?.volatiles.has('flashfire') === true
}

/** 짝이 그 기술을 가졌는가. **서 있을 때만** 참이다 (`IfMoveKnown` 1653) */
function allyKnows(turn: AiTurn, move: number): boolean {
  const d = turn.doubles!
  if (hp(d.ally) === 0) return false
  return d.allyMoves.some((m) => m.id === move)
}

/** 내가 그 기술을 가졌는가 (`IfMoveKnown AI_BATTLER_ATTACKER`) */
function selfKnows(turn: AiTurn, move: number): boolean {
  return knownMoves(turn).some((m) => m.id === move)
}

/** 상성 (`IfMoveEffectivenessEquals`) */
function eff(move: AiMove, foe: AiMon): number {
  return effectivenessOf(move.type, foe.types)
}

/**
 * 이 기술이 **우리 쪽 네 칸·여덟 칸 통틀어** 제일 센가 (`CheckIfHighestDamageWithPartner`
 * · `trainer_ai.c` 2369). 내 네 칸을 먼저 보고, 거기서 지면 짝은 안 본다.
 * 짝의 칸도 같은 `defender`를 향해 최대 난수로 계산한다
 */
function highestWithAlly(turn: AiTurn, move: AiMove): boolean {
  const mine = estimateDamage(move, turn.self, turn.foe, turn.weather, 100)
  for (const m of knownMoves(turn)) {
    if (estimateDamage(m, turn.self, turn.foe, turn.weather, 100) > mine) return false
  }
  const ally = turn.doubles?.ally ?? null
  if (!ally) return true
  for (const m of turn.doubles!.allyMoves) {
    if (estimateDamage(m, ally, turn.foe, turn.weather, 100) > mine) return false
  }
  return true
}

// ═════════════════════════════════════════════════════════════════════════════
// 상대를 겨눈 벌 (`TagStrategy_Main`)
// ═════════════════════════════════════════════════════════════════════════════

/** 데미지 기술의 앞머리. 반감 −1·−2, 제일 센 수 +1, 효과가 굉장하면 +1 */
function damageHead(turn: AiTurn, move: AiMove): number {
  const { random } = turn
  const foeAlly = turn.doubles?.foeAlly ?? null
  let delta = 0
  const flat = FLAT_DAMAGE.has(move.effect)
  if (!flat) {
    const e = eff(move, turn.foe)
    // `TagStrategy_TryScoreMinus1`·`…Minus2` — 맞는 쪽의 **짝이 없으면**(0%) 안 깎는다
    const cut = e === 0.5 ? 1 : e === 0.25 ? 2 : 0
    if (cut > 0 && !killsWithMaxRoll(move, turn.self, turn.foe, turn.weather)
      && hp(foeAlly) !== 0 && !below(random, 64)) {
      delta -= cut
    }
  }
  // `TagStrategy_ScoreMove`
  if (highestWithAlly(turn, move)) {
    if (move.effect === EFFECT.HALVE_DEFENSE) return delta
    if (move.effect === EFFECT.PRIORITY_1) {
      if (!below(random, 50)) return delta + 1
    } else if (!below(random, 128)) {
      return delta + 1
    }
  }
  // `TagStrategy_CheckBeforeScoring`
  if (flat) return delta
  const e = eff(move, turn.foe)
  if (e === 2 && !below(random, 100)) return delta + 1
  if (e === 4 && !below(random, 64)) return delta + 1
  return delta
}

/** 비바라기 — 촉촉바디(상태 이상일 때)·건조피부면 +2, 나와 짝을 따로 센다 */
function rainDance(turn: AiTurn): number {
  const { self } = turn
  const ally = turn.doubles!.ally
  let delta = 0
  const a = own(self)
  if ((a === ABILITY.HYDRATION && statused(self)) || a === ABILITY.DRY_SKIN) delta += 2
  if (ownHas(ally, ABILITY.HYDRATION)) {
    if (statused(ally)) delta += 2
  } else if (ownHas(ally, ABILITY.DRY_SKIN)) {
    delta += 2
  }
  return delta
}

/**
 * 쾌청의 한 마리 몫.
 *
 * ⚠️ **솔라파워는 코드대로다** — 체력 50% 이상이면 +1을 얹은 **뒤에** 아래 줄로 흘러
 * 50%로 −2를 또 굴린다(주석은 「50% 이상이면 +1」이라고만 적었다)
 */
function sunnyOne(turn: AiTurn, mon: AiMon | null, ability: number): number {
  const { random } = turn
  switch (ability) {
    case ABILITY.LEAF_GUARD:
      return statused(mon) || hp(mon) < 30 ? 0 : 2
    case ABILITY.FLOWER_GIFT:
      return 2
    case ABILITY.DRY_SKIN:
      return -2
    case ABILITY.SOLAR_POWER: {
      let d = hp(mon) < 50 ? 0 : 1
      if (!below(random, 128)) d -= 2
      return d
    }
    default:
      return 0
  }
}

function sunnyDay(turn: AiTurn): number {
  const ally = turn.doubles!.ally
  // 짝은 `CheckBattlerAbility`로 하나씩 묻는다 — 잎가드 → 플라워기프트 → 건조피부 → 솔라파워
  const allyAbility = [ABILITY.LEAF_GUARD, ABILITY.FLOWER_GIFT, ABILITY.DRY_SKIN, ABILITY.SOLAR_POWER]
    .find((a) => ownHas(ally, a)) ?? ABILITY.NONE
  return sunnyOne(turn, turn.self, own(turn.self)) + sunnyOne(turn, ally, allyAbility)
}

/** 싸라기눈 — 아이스바디·눈숨기·눈보라를 가진 쪽마다 +2 */
function hail(turn: AiTurn): number {
  const ally = turn.doubles!.ally
  let delta = 0
  const a = own(turn.self)
  if (a === ABILITY.ICE_BODY || a === ABILITY.SNOW_CLOAK || selfKnows(turn, MOVE.BLIZZARD)) delta += 2
  if (ownHas(ally, ABILITY.ICE_BODY) || ownHas(ally, ABILITY.SNOW_CLOAK)
    || allyKnows(turn, MOVE.BLIZZARD)) {
    delta += 2
  }
  return delta
}

/** 모래바람 — 모래숨기거나 바위 타입인 쪽마다 +2 */
function sandstorm(turn: AiTurn): number {
  const ally = turn.doubles!.ally
  let delta = 0
  if (own(turn.self) === ABILITY.SAND_VEIL || isType(turn.self, TYPE.ROCK)) delta += 2
  if (ownHas(ally, ABILITY.SAND_VEIL) || isType(ally, TYPE.ROCK)) delta += 2
  return delta
}

/** 떠 있는가 — 부유·비행 타입·전자부유. `own`/`foeHas` 중 무엇으로 특성을 묻는지가 쪽마다 다르다 */
function airborne(mon: AiMon | null, levitate: boolean): boolean {
  return levitate || isType(mon, TYPE.FLYING) || rising(mon)
}

/**
 * 중력 — 이미 걸렸으면 −30. 우리 편이 떠 있으면 마리마다 −5, 상대가 떠 있으면
 * 마리마다 75%로 +3
 */
function gravity(turn: AiTurn): number {
  if (turn.field.has('gravity')) return -30
  const { random } = turn
  const d = turn.doubles!
  let delta = 0
  if (airborne(turn.self, own(turn.self) === ABILITY.LEVITATE)) delta -= 5
  if (airborne(d.ally, ownHas(d.ally, ABILITY.LEVITATE))) delta -= 5
  if (airborne(turn.foe, foeHas(turn.foe, ABILITY.LEVITATE)) && !below(random, 64)) delta += 3
  if (airborne(d.foeAlly, foeHas(d.foeAlly, ABILITY.LEVITATE)) && !below(random, 64)) delta += 3
  return delta
}

/**
 * 트릭룸 — 한쪽이라도 한 마리만 남았으면 −30. 아니면 **우리 둘이 다 느릴 때만**
 * 75%로 +5고 그 밖에는 −5·−30이다
 */
function trickRoom(turn: AiTurn): number {
  const d = turn.doubles!
  if (hp(d.ally) === 0 || hp(d.foeAlly) === 0 || hp(turn.foe) === 0) return -30
  const { random } = turn
  const self = d.speedRank('self')
  const tryPlus = () => (below(random, 64) ? -5 : 5)
  switch (self) {
    case 0: {
      const ally = d.speedRank('ally')
      return ally === 1 || ally === 0 ? -30 : -5
    }
    case 1:
      return d.speedRank('ally') === 0 ? -30 : -5
    case 2:
      return d.speedRank('ally') !== 3 ? -5 : tryPlus()
    case 3:
      return d.speedRank('ally') !== 2 ? -5 : tryPlus()
    default:
      return 0
  }
}

/** 손가락질 — 내 체력과 짝의 체력으로 가른 표 (`TagStrategy_FollowMe`) */
function followMe(turn: AiTurn): number {
  const { random } = turn
  const ally = hp(turn.doubles!.ally)
  const me = hpPercent(turn.self)
  const tryAdd = (n: number) => (below(random, 64) ? 0 : n)
  if (me > 90) {
    if (ally > 90) return tryAdd(-1)
    if (ally > 50) return tryAdd(1)
    if (ally > 30) return tryAdd(2)
    return tryAdd(3)
  }
  if (me > 50) {
    if (ally > 90) return tryAdd(-2)
    if (ally > 50) return tryAdd(-1)
    if (ally > 30) return tryAdd(1)
    return tryAdd(2)
  }
  if (me > 30) {
    if (ally > 90) return tryAdd(-2)
    if (ally > 50) return tryAdd(-2)
    if (ally > 30) return tryAdd(1)
    return tryAdd(2)
  }
  return tryAdd(-5)
}

/** 미래예지·파멸의소원 — 짝도 가졌고 짝이 먼저(같으면 반반) 움직이면 −3 */
function futureSight(turn: AiTurn): number {
  const d = turn.doubles!
  if (hp(d.ally) === 0) return 0
  if (!allyKnows(turn, MOVE.FUTURE_SIGHT) && !allyKnows(turn, MOVE.DOOM_DESIRE)) return 0
  const { random } = turn
  switch (d.speedRank('self')) {
    case 3:
      return -3
    case 2: {
      const ally = d.speedRank('ally')
      if (ally === 0 || ally === 1) return -3
      if (below(random, 128)) return 0
      return d.speedRank('ally') === 2 ? -3 : 0
    }
    case 1:
      if (d.speedRank('ally') === 0) return -3
      if (below(random, 128)) return 0
      return d.speedRank('ally') === 1 ? -3 : 0
    case 0:
      if (below(random, 128)) return 0
      return d.speedRank('ally') === 0 ? -3 : 0
    default:
      return 0
  }
}

/** 스킬스왑 (상대에게) — 내 게으름·슬로스타트·마이페이스·서투름을 넘기면 +5, 상대의 좋은 특성을 받으면 +2 */
function skillSwapFoe(turn: AiTurn): number {
  const mine = own(turn.self)
  if (mine === ABILITY.TRUANT || mine === ABILITY.SLOW_START || mine === ABILITY.STALL
    || mine === ABILITY.KLUTZ) {
    return 5
  }
  // `LoadBattlerAbility AI_BATTLER_DEFENDER` — 모르면 찍은 값이다 (`turn.foe.ability`)
  const theirs = suppressed(turn.foe) ? ABILITY.NONE : turn.foe.ability
  const good: readonly number[] = [
    ABILITY.SHADOW_TAG, ABILITY.PURE_POWER, ABILITY.HUGE_POWER, ABILITY.MOLD_BREAKER,
    ABILITY.SOLID_ROCK, ABILITY.FILTER, ABILITY.FLOWER_GIFT,
  ]
  return good.includes(theirs) ? 2 : 0
}

/** 지진·매그니튜드 — 짝이 떠 있으면 +2, 약점이면 −10, 그 밖에는 −3. **짝이 서 있는지는 안 본다** */
function earthquake(turn: AiTurn): number {
  const ally = turn.doubles!.ally
  if (rising(ally)) return 2
  if (ownHas(ally, ABILITY.LEVITATE)) return 2
  if (isType(ally, TYPE.FLYING)) return 2
  for (const t of [TYPE.FIRE, TYPE.ELECTRIC, TYPE.POISON, TYPE.ROCK]) {
    if (isType(ally, t)) return -10
  }
  return -3
}

/** 전기 기술. 방전은 짝까지 맞으니 따로 본다 */
function electric(turn: AiTurn, move: AiMove): number {
  const d = turn.doubles!
  if (move.id === MOVE.DISCHARGE) return spreadElectric(turn)
  let delta = 0
  // 맞는 쪽의 짝이 피뢰침이면 −1, 그 짝이 땅 타입이기까지 하면 −8 더
  if (foeHas(d.foeAlly, ABILITY.LIGHTNING_ROD)) {
    delta -= 1
    if (isType(d.foeAlly, TYPE.GROUND)) delta -= 8
  }
  if (ownHas(d.ally, ABILITY.LIGHTNING_ROD)) return delta - 10
  return delta
}

/**
 * 방전 — 짝이 전기엔진·축전이면 +3, 물·비행이면 −10, 땅이면 +3, 그 밖에는 −3.
 * ⚠️ 땅 검사가 물·비행 **뒤에** 있다(원작 BUG) — 대짱이·글라이온은 −10이다
 */
function spreadElectric(turn: AiTurn): number {
  const ally = turn.doubles!.ally
  if (ownHas(ally, ABILITY.MOTOR_DRIVE) || ownHas(ally, ABILITY.VOLT_ABSORB)) return 3
  if (isType(ally, TYPE.WATER) || isType(ally, TYPE.FLYING)) return -10
  if (isType(ally, TYPE.GROUND)) return 3
  return -3
}

/** 물 기술. 파도타기는 짝까지 맞으니 따로 본다 */
function water(turn: AiTurn, move: AiMove): number {
  const d = turn.doubles!
  if (move.id === MOVE.SURF) return spreadWater(turn)
  let delta = 0
  if (foeHas(d.foeAlly, ABILITY.STORM_DRAIN)) delta -= 1
  if (ownHas(d.ally, ABILITY.STORM_DRAIN)) return delta - 10
  return delta
}

/** 파도타기 — 짝이 건조피부·저수면 +3, 땅·불꽃이면 −10(바위는 안 본다 · 원작 BUG), 그 밖에는 −3 */
function spreadWater(turn: AiTurn): number {
  const ally = turn.doubles!.ally
  if (ownHas(ally, ABILITY.DRY_SKIN) || ownHas(ally, ABILITY.WATER_ABSORB)) return 3
  if (isType(ally, TYPE.GROUND) || isType(ally, TYPE.FIRE)) return -10
  return -3
}

/**
 * 불꽃 기술 — 내 타오르는불꽃이 켜졌으면 +1. 분연이면 짝을 본다:
 * 건조피부 **−3**(주석은 +3 · 코드는 `ScoreMinus3`), 타오르는불꽃 +3,
 * 풀·강철·얼음·벌레 −10, 그 밖에는 −3
 */
function fire(turn: AiTurn, move: AiMove): number {
  let delta = flashFired(turn.self) ? 1 : 0
  if (move.id !== MOVE.LAVA_PLUME) return delta
  const ally = turn.doubles!.ally
  if (ownHas(ally, ABILITY.DRY_SKIN)) return delta - 3
  if (ownHas(ally, ABILITY.FLASH_FIRE)) return delta + 3
  for (const t of [TYPE.GRASS, TYPE.STEEL, TYPE.ICE, TYPE.BUG]) {
    if (isType(ally, t)) return delta - 10
  }
  delta -= 3
  return delta
}

/** 짝이 도우미를 가졌으면 데미지 기술(고정 데미지 빼고) +1 */
function allyHelpingHand(move: AiMove): number {
  if (FLAT_DAMAGE.has(move.effect)) return 0
  return isDamageScored(move) ? 1 : 0
}

/** `TagStrategy_CheckSpecialScoring` */
function special(turn: AiTurn, move: AiMove): number {
  switch (move.id) {
    case MOVE.SKILL_SWAP: return skillSwapFoe(turn)
    case MOVE.EARTHQUAKE:
    case MOVE.MAGNITUDE: return earthquake(turn)
    case MOVE.FUTURE_SIGHT:
    case MOVE.DOOM_DESIRE: return futureSight(turn)
    case MOVE.RAIN_DANCE: return rainDance(turn)
    case MOVE.SUNNY_DAY: return sunnyDay(turn)
    case MOVE.HAIL: return hail(turn)
    case MOVE.SANDSTORM: return sandstorm(turn)
    case MOVE.GRAVITY: return gravity(turn)
    case MOVE.TRICK_ROOM: return trickRoom(turn)
    case MOVE.FOLLOW_ME: return followMe(turn)
    default: break
  }
  // 타입은 기술 자료의 타입이다 (`LOAD_MOVE_TYPE`)
  if (move.type === TYPE.ELECTRIC) return electric(turn, move)
  if (move.type === TYPE.FIRE) return fire(turn, move)
  if (move.type === TYPE.WATER) return water(turn, move)
  if (allyKnows(turn, MOVE.HELPING_HAND)) return allyHelpingHand(move)
  return 0
}

function scoreFoe(turn: AiTurn, move: AiMove): number {
  const head = isDamageScored(move) ? damageHead(turn, move) : 0
  return head + special(turn, move)
}

// ═════════════════════════════════════════════════════════════════════════════
// 짝을 겨눈 벌 (`TagStrategy_Partner`)
// ═════════════════════════════════════════════════════════════════════════════

/** 짝의 타오르는불꽃 — 아직 안 켜졌으면 +3, 아니면 −30 */
function allyFireAbsorb(ally: AiMon | null): number {
  if (!ownHas(ally, ABILITY.FLASH_FIRE)) return -30
  return flashFired(ally) ? -30 : 3
}

/** 체력이 낮을수록 +3이 잘 붙는 사다리. 가득이면 −10 (축전·저수·건조피부) */
function absorbLadder(turn: AiTurn, ally: AiMon | null): number {
  const { random } = turn
  const p = hp(ally)
  if (p === 100) return -10
  if (p > 90) return 0
  if (p > 75) return below(random, 64) ? 3 : 0
  if (p > 50) return below(random, 128) ? 3 : 0
  return below(random, 192) ? 3 : 0
}

/** 짝의 전기엔진·축전 */
function allyElectricAbsorb(turn: AiTurn, ally: AiMon | null): number {
  if (ownHas(ally, ABILITY.MOTOR_DRIVE)) {
    if (below(turn.random, 160)) return 0
    return (ally?.boosts.spe ?? 0) === 6 ? -30 : 3
  }
  if (ownHas(ally, ABILITY.VOLT_ABSORB)) return absorbLadder(turn, ally)
  return -30
}

/** 짝의 저수·건조피부 */
function allyWaterAbsorb(turn: AiTurn, ally: AiMon | null): number {
  if (ownHas(ally, ABILITY.WATER_ABSORB) || ownHas(ally, ABILITY.DRY_SKIN)) {
    return absorbLadder(turn, ally)
  }
  return -30
}

/**
 * 스킬스왑 (짝에게). 짝의 게으름·슬로스타트를 가져오면 +10, 부유를 전기 타입 짝에게
 * 주면 +1(순수 전기면 +2), 복안·노가드를 명중 낮은 기술을 가진 짝에게 주면 +3.
 * ⚠️ 전기/다른 타입인 짝에게 부유를 줄 때는 +1 뒤에 복안 갈래로 흘러 **−30**을 더
 * 받는다 — 코드대로다
 */
function allySkillSwap(turn: AiTurn): number {
  // `LoadBattlerAbility AI_BATTLER_DEFENDER` — 짝이어도 맞는 쪽 자리로 읽는다
  const theirs = suppressed(turn.foe) ? ABILITY.NONE : turn.foe.ability
  if (theirs === ABILITY.TRUANT || theirs === ABILITY.SLOW_START) return 10
  const mine = own(turn.self)
  const accuracy = (): number => {
    if (mine !== ABILITY.COMPOUND_EYES && mine !== ABILITY.NO_GUARD) return -30
    return INACCURATE.some((m) => allyKnows(turn, m)) ? 3 : -30
  }
  if (mine !== ABILITY.LEVITATE) return accuracy()
  if (theirs === ABILITY.LEVITATE) return -30
  const [t1, t2] = [turn.foe.types[0], turn.foe.types[1] ?? turn.foe.types[0]]
  if (t1 !== TYPE.ELECTRIC) return accuracy()
  if (t2 !== TYPE.ELECTRIC) return 1 + accuracy()
  return 2
}

/** 도깨비불 (짝에게) — 타오르는불꽃이면 불 흡수와 같고, 근성 짝이 멀쩡할 때만 +5 */
function allyWillOWisp(turn: AiTurn, ally: AiMon | null): number {
  if (ownHas(ally, ABILITY.FLASH_FIRE)) return allyFireAbsorb(ally)
  if (!ownHas(ally, ABILITY.GUTS)) return -30
  if (statused(ally)) return -30
  if (isType(turn.foe, TYPE.FIRE)) return -30
  if (ally?.heldItem === ITEM_FLAME_ORB || ally?.heldItem === ITEM_TOXIC_ORB) return -30
  if (hp(ally) < 81) return -30
  return 5
}

/** 전기자석파 (짝에게) — 땅 타입이면 −30, 전기엔진·축전이면 전기 흡수와 같다 */
function allyThunderWave(turn: AiTurn, ally: AiMon | null): number {
  if (isType(turn.foe, TYPE.GROUND)) return -30
  if (ownHas(ally, ABILITY.MOTOR_DRIVE) || ownHas(ally, ABILITY.VOLT_ABSORB)) {
    return allyElectricAbsorb(turn, ally)
  }
  return -30
}

/**
 * 독 (짝에게) — 포이즌힐 짝이 멀쩡하고 독구슬이 없을 때 +5.
 * ⚠️ 체력 조건이 **91% 초과면 −30**이다 — 주석의 「81% 이상」과 반대다. 코드대로다
 */
function allyPoison(turn: AiTurn, ally: AiMon | null): number {
  if (!ownHas(ally, ABILITY.POISON_HEAL)) return -30
  if (statused(turn.foe)) return -30
  if (ally?.heldItem === ITEM_TOXIC_ORB) return -30
  if (hp(ally) > 91) return -30
  return 5
}

/** 도우미 — 짝이 있고 체력 50% 초과거나 제일 빠르면 75%로 +2, 25%로 −1 */
function helpingHand(turn: AiTurn, ally: AiMon | null): number {
  if (hp(ally) === 0) return -30
  const go = hp(ally) > 50 || turn.doubles!.speedRank('ally') < 1
  if (!go) return 0
  return below(turn.random, 64) ? -1 : 2
}

/** 뽐내기 (짝에게) — 시몬열매·리샘열매를 가졌을 때만. 공격 +2 미만이면 +3 */
function allySwagger(turn: AiTurn): number {
  const item = turn.foe.heldItem
  if (item !== ITEM_PERSIM_BERRY && item !== ITEM_LUM_BERRY) return -30
  return turn.foe.boosts.atk > 1 ? 0 : 3
}

/** 위액 (짝에게) — 이미 봉인이면 −30, 게으름·슬로스타트면 +5 */
function allyGastroAcid(ally: AiMon | null): number {
  if (suppressed(ally)) return -30
  if (ownHas(ally, ABILITY.TRUANT) || ownHas(ally, ABILITY.SLOW_START)) return 5
  return 0
}

const ACUPRESSURE_STATS = ['atk', 'def', 'spe', 'spa', 'spd', 'evasion', 'accuracy'] as const

/** 지압 (짝에게) */
function allyAcupressure(turn: AiTurn, ally: AiMon | null): number {
  const boosts = ally?.boosts
  if (ownHas(ally, ABILITY.SIMPLE)) {
    if (boosts && ACUPRESSURE_STATS.some((s) => boosts[s] > 2)) return -10
  } else if (boosts && ACUPRESSURE_STATS.some((s) => boosts[s] === 6)) {
    return -30
  }
  const { random } = turn
  const p = hp(ally)
  if (p < 51) return -1
  if (p <= 90 && below(random, 128)) return 0
  return below(random, 80) ? 0 : 2
}

/** 변화기를 짝에게 (`TagStrategy_PartnerStatusMove`) */
function allyStatus(turn: AiTurn, move: AiMove, ally: AiMon | null): number {
  switch (move.id) {
    case MOVE.SKILL_SWAP: return allySkillSwap(turn)
    case MOVE.WILL_O_WISP: return allyWillOWisp(turn, ally)
    case MOVE.THUNDER_WAVE: return allyThunderWave(turn, ally)
    default: break
  }
  if (move.effect === EFFECT.STATUS_BADLY_POISON || move.effect === EFFECT.STATUS_POISON) {
    return allyPoison(turn, ally)
  }
  switch (move.id) {
    case MOVE.HELPING_HAND: return helpingHand(turn, ally)
    case MOVE.SWAGGER: return allySwagger(turn)
    // 트릭·바꿔치기는 점수를 안 건드린다 (`TagStrategy_PartnerTrick`은 곧장 끝난다)
    case MOVE.TRICK:
    case MOVE.SWITCHEROO: return 0
    case MOVE.GASTRO_ACID: return allyGastroAcid(ally)
    case MOVE.ACUPRESSURE: return allyAcupressure(turn, ally)
    default: return -30
  }
}

function scoreAlly(turn: AiTurn, move: AiMove): number {
  // 짝을 겨눈 벌에서는 짝이 곧 맞는 쪽이다 (`AI_BATTLER_DEFENDER == ATTACKER_PARTNER`)
  const ally = turn.doubles!.ally ?? turn.foe
  if (!isDamageScored(move)) return allyStatus(turn, move, ally)
  if (move.type === TYPE.FIRE) return allyFireAbsorb(ally)
  if (move.type === TYPE.ELECTRIC) return allyElectricAbsorb(turn, ally)
  if (move.type === TYPE.WATER) return allyWaterAbsorb(turn, ally)
  // 내던지기는 점수를 안 건드린다 — 트릭 갈래로 간다
  if (move.id === MOVE.FLING) return 0
  return -30
}

/**
 * TAG_STRATEGY 한 기술분. 더블이 아니면 0이다 — 싱글에서는 원작이 이 비트를 안 켠다
 * (켜더라도 짝이 없는 싱글에서는 돌 자리가 없다)
 */
export function scoreTagStrategy(turn: AiTurn, move: AiMove): number {
  if (!turn.doubles) return 0
  return turn.doubles.targetIsAlly ? scoreAlly(turn, move) : scoreFoe(turn, move)
}
