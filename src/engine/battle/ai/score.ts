// 트레이너 AI 점수 (PLAN §7.7)
//
// 원작 4세대 AI는 **점수 매기기**다. 기술 네 칸을 전부 100에서 시작해, 트레이너에게
// 켜진 플래그마다 정해진 루틴을 돌려 점수를 더하고 빼고, 가장 높은 칸을 고른다.
// 같은 점수가 여럿이면 그중에서 무작위로 하나 뽑는다 — 그래서 같은 관장이라도
// 매번 똑같이 두지는 않는다.
//
// 이 파일은 pret/pokeplatinum의 `src/battle/trainer_ai/script.s`를 옮긴 것이다.
// 점수 폭(-12/-10/-8/-5/-3/-2/-1/+2/+3/+4)과 확률 문턱(`IfRandomLessThan 80` 등)은
// 전부 원본 값이다. 어림잡은 곳은 없다.
//
// ⚠️ **한 루틴 안에서 감점은 하나만 먹는다.** 원본의 `ScoreMinusN`은 점수를 더한 뒤
// 곧바로 그 기술의 평가를 끝낸다(`PopOrEnd`). 그래서 "잠들어 있고 + 방음이고 +
// 세이프가드"라도 -10이지 -30이 아니다. 여기서는 early return이 그 역할을 한다.
import type { AiMon, AiMove, AiTurn } from './context'
import { hpPercent } from './context'
import { allDamage, estimateDamage, isDamageScored, killsWithMaxRoll } from './damage'
import { ABILITY, EFFECT, RISKY_EFFECTS, SETUP_EFFECTS, SOUND_MOVES } from './rom'
import { effectivenessOf, TYPE } from './typeChart'

/** 트레이너 데이터의 AI 비트. 플래티넘이 실제로 쓰는 것은 아래 여섯 개뿐이다 */
export const AI_FLAG = {
  /** 헛수 거르기. 928명 중 927명이 갖고 있다 */
  BASIC: 1 << 0,
  /** 데미지·마무리 노리기 */
  EVAL_ATTACK: 1 << 1,
  /** 기술별 세부 판단 */
  EXPERT: 1 << 2,
  /** 첫 턴 셋업 */
  SETUP_FIRST_TURN: 1 << 3,
  /** 도박수 선호 */
  RISKY: 1 << 4,
  /** 변덕스러운 위력 선호 */
  PRIORITIZE_EXTREMES: 1 << 5,
} as const

/**
 * 챔피언이 켜고 나오는 것. `trainers.json`에서 난천(#267)의 `ai`가 정확히 7이다.
 *
 * ⚠️ **이 값을 모든 트레이너의 바닥으로 깐다** (`TrainerBrain`). 파티를 가진
 * 927명 중 289명만 EXPERT를 갖고 638명은 헛수만 거른다 — 그래서 잡트레이너는 반감되는
 * 기술을 그대로 내지른다. 잡트레이너라고 쉬울 이유가 없다는 것이 이 프로젝트의
 * 선택이고, 롬 값을 덮는 곳은 여기 하나뿐이다.
 *
 * 자료에 더 켜져 있으면 그쪽을 남긴다 — 오엽(#264)의 `SETUP_FIRST_TURN`이 그렇다
 */
export const CHAMPION_FLAGS = AI_FLAG.BASIC | AI_FLAG.EVAL_ATTACK | AI_FLAG.EXPERT

/** 원작에 있지만 플래티넘 트레이너 데이터에서 한 번도 안 켜지는 플래그 */
export const UNUSED_FLAGS = {
  BATON_PASS: 1 << 6,
  TAG_STRATEGY: 1 << 7,
  CHECK_HP: 1 << 8,
  WEATHER: 1 << 9,
  HARASSMENT: 1 << 10,
} as const

/** 모든 기술이 여기서 출발한다 */
export const BASE_SCORE = 100

// ── 원작 난수 ────────────────────────────────────────────────────────────────
// 원본은 `BattleSystem_RandNext() % 256`을 문턱과 비교한다. 예컨대
// `IfRandomLessThan 80`은 "0~79면 건너뛴다", 즉 **80/256 = 31.25%로 건너뛰고
// 68.75%로 점수를 준다**는 뜻이다. 확률을 다시 계산해 적으면 언젠가 어긋나므로
// 문턱값을 그대로 쓴다.

/** `IfRandomLessThan n`이 분기하는가 (= 점수를 **안** 주는가) */
function rollSkips(random: () => number, threshold: number): boolean {
  return Math.floor(random() * 256) < threshold
}

// ── 상태 질의 ────────────────────────────────────────────────────────────────

function hasType(mon: AiMon, type: number): boolean {
  return mon.types.includes(type)
}

/** 상대가 이 기술에 완전히 안 맞는가 (타입 상성만) */
function immuneByType(move: AiMove, foe: AiMon): boolean {
  return effectivenessOf(move.type, foe.types) === 0
}

/** 틀깨기면 상대 특성을 없는 셈 친다 — 원작이 모든 특성 검사 앞에 이걸 둔다 */
function foeAbility(turn: AiTurn): number {
  return turn.self.ability === ABILITY.MOLD_BREAKER ? ABILITY.NONE : turn.foe.ability
}

/** 랭크가 꼭대기인가. 단순한 마음이면 +2에서 이미 꼭대기 취급이다 */
function atMaxStage(mon: AiMon, stat: keyof AiMon['boosts']): boolean {
  return mon.ability === ABILITY.SIMPLE ? mon.boosts[stat] > 2 : mon.boosts[stat] === 6
}

// ═════════════════════════════════════════════════════════════════════════════
// AI_FLAG_BASIC — 헛수 거르기
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 특성으로 흡수당하는가. 흡수면 -12로, 단순 무효(-10)보다 더 깎는다.
 *
 * 원본에는 여기 버그가 하나 있다. 건조피부 자리에 부유를 한 번 더 적어 놔서
 * **건조피부의 물 무효는 영영 확인되지 않는다.** 고치지 않고 그대로 옮긴다 —
 * 고치면 원작보다 똑똑해져서, 원작을 아는 사람이 "이건 뭔가 다르다"고 느낀다
 */
function absorbedByAbility(move: AiMove, ability: number): boolean {
  switch (ability) {
    case ABILITY.VOLT_ABSORB:
    case ABILITY.MOTOR_DRIVE:
      return move.type === TYPE.ELECTRIC
    case ABILITY.WATER_ABSORB:
      return move.type === TYPE.WATER
    case ABILITY.FLASH_FIRE:
      return move.type === TYPE.FIRE
    case ABILITY.LEVITATE:
      return move.type === TYPE.GROUND
    default:
      return false
  }
}

function basicImmunity(turn: AiTurn, move: AiMove): number | null {
  if (immuneByType(move, turn.foe)) return -10
  const ability = foeAbility(turn)
  if (ability === ABILITY.WONDER_GUARD) {
    return effectivenessOf(move.type, turn.foe.types) >= 2 ? null : -12
  }
  return absorbedByAbility(move, ability) ? -12 : null
}

/** 방음. 원작은 기술 데이터에 소리 표시가 없어 번호를 열한 개 나열한다 */
function basicSoundproof(turn: AiTurn, move: AiMove): number | null {
  if (foeAbility(turn) !== ABILITY.SOUNDPROOF) return null
  return SOUND_MOVES.has(move.id) ? -10 : null
}

/** 상대에게 상태이상을 새로 걸 수 없는 공통 조건 */
function statusBlocked(turn: AiTurn): boolean {
  return turn.foe.status !== 'ok' || turn.foe.side.has('safeguard')
}

/**
 * 능력 랭크를 올리는 기술이 무용한가.
 *
 * 스피드만 트릭룸을 따로 보고, 명중·회피만 노가드를 따로 본다
 */
function basicRaise(turn: AiTurn, stat: keyof AiMon['boosts']): number | null {
  if (stat === 'spe' && turn.field.has('trickroom')) return -10
  if (stat === 'accuracy' || stat === 'evasion') {
    if (turn.foe.ability === ABILITY.NO_GUARD) return -10
    if (turn.self.ability === ABILITY.NO_GUARD) return -10
  }
  return atMaxStage(turn.self, stat) ? -10 : null
}

/** 상대 능력 랭크를 깎는 기술이 무용한가 */
function basicLower(turn: AiTurn, stat: keyof AiMon['boosts']): number | null {
  if (stat === 'spe' && turn.field.has('trickroom')) return -10
  if (turn.foe.boosts[stat] === -6) return -10
  const ability = turn.foe.ability
  if (stat === 'atk' && ability === ABILITY.HYPER_CUTTER) return -10
  if (stat === 'spe' && ability === ABILITY.SPEED_BOOST) return -10
  if (stat === 'accuracy') {
    if (turn.self.ability === ABILITY.NO_GUARD) return -10
    if (ability === ABILITY.KEEN_EYE || ability === ABILITY.NO_GUARD) return -10
  }
  if (stat === 'evasion') {
    if (turn.self.ability === ABILITY.NO_GUARD) return -10
    if (ability === ABILITY.NO_GUARD) return -10
  }
  return ability === ABILITY.CLEAR_BODY || ability === ABILITY.WHITE_SMOKE ? -10 : null
}

/** 흑안개·심리전처럼 "랭크를 되돌리는" 기술. 되돌릴 게 없으면 무용하다 */
function basicResetStages(turn: AiTurn): number | null {
  const stats = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const
  for (const s of stats) {
    if (turn.self.boosts[s] < 0) return null
    if (turn.foe.boosts[s] > 0) return null
  }
  return -10
}

/** 자폭·대폭발 */
function basicExplode(turn: AiTurn, move: AiMove): number | null {
  if (immuneByType(move, turn.foe)) return -10
  if (foeAbility(turn) === ABILITY.DAMP) return -10
  // 뒤에 남은 애가 있으면 자폭해도 된다
  if (turn.self.bench !== 0) return null
  // 나도 마지막인데 상대는 아니면 자폭은 곧 패배다
  return turn.foe.bench !== 0 ? -10 : -1
}

/** 독을 못 거는가 */
function basicCannotPoison(turn: AiTurn): number | null {
  if (hasType(turn.foe, TYPE.STEEL) || hasType(turn.foe, TYPE.POISON)) return -10
  const a = turn.foe.ability
  if (a === ABILITY.IMMUNITY || a === ABILITY.MAGIC_GUARD || a === ABILITY.POISON_HEAL) return -10
  if (a === ABILITY.LEAF_GUARD && turn.weather === 'SunnyDay') return -10
  if (a === ABILITY.HYDRATION && turn.weather === 'RainDance') return -10
  return statusBlocked(turn) ? -10 : null
}

/** 마비를 못 거는가. 전기자석파만 축전·전기엔진을 따로 본다 */
function basicCannotParalyze(turn: AiTurn, move: AiMove): number | null {
  if (immuneByType(move, turn.foe)) return -10
  const a = turn.foe.ability
  if (a === ABILITY.LIMBER || a === ABILITY.MAGIC_GUARD) return -10
  if (turn.self.ability !== ABILITY.MOLD_BREAKER && move.id === THUNDER_WAVE) {
    if (a === ABILITY.MOTOR_DRIVE || a === ABILITY.VOLT_ABSORB) return -10
  }
  return statusBlocked(turn) ? -10 : null
}

/** 전기자석파. 원작이 이 기술 하나만 특별히 본다 */
const THUNDER_WAVE = 86

/** 화상을 못 입히는가 */
function basicCannotBurn(turn: AiTurn): number | null {
  const a = turn.foe.ability
  if (a === ABILITY.WATER_VEIL || a === ABILITY.MAGIC_GUARD) return -10
  if (turn.foe.status !== 'ok') return -10
  if (hasType(turn.foe, TYPE.FIRE)) return -10
  return turn.foe.side.has('safeguard') ? -10 : null
}

/** 매혹. 성별이 서로 달라야 걸린다 */
function basicCannotAttract(turn: AiTurn): number | null {
  if (turn.foe.volatiles.has('attract')) return -10
  if (turn.foe.ability === ABILITY.OBLIVIOUS) return -10
  if (turn.self.gender === 'male') return turn.foe.gender === 'female' ? null : -10
  if (turn.self.gender === 'female') return turn.foe.gender === 'male' ? null : -10
  return -10
}

/** 저주. 고스트 타입이면 전혀 다른 기술이 된다 */
function basicCurse(turn: AiTurn): number | null {
  if (hasType(turn.self, TYPE.GHOST)) {
    if (turn.foe.volatiles.has('curse')) return -10
    return turn.foe.ability === ABILITY.MAGIC_GUARD ? -10 : null
  }
  if (turn.self.ability === ABILITY.SIMPLE) {
    return turn.self.boosts.atk > 2 || turn.self.boosts.def > 2 ? -10 : null
  }
  if (turn.self.boosts.atk === 6) return -10
  // 방어만 꼭대기면 -8이다. 저주는 공격도 같이 올리므로 완전히 헛수는 아니다
  return turn.self.boosts.def === 6 ? -8 : null
}

/** 데미지 계산을 안 하는 기술의 무효 판정. 자폭·모으기·고정 데미지가 여기로 온다 */
function basicNonStandard(turn: AiTurn, move: AiMove): number | null {
  if (immuneByType(move, turn.foe)) return -10
  if (foeAbility(turn) !== ABILITY.WONDER_GUARD) return null
  return effectivenessOf(move.type, turn.foe.types) >= 2 ? null : -10
}

/**
 * 아직 못 옮긴 BASIC 루틴이 보는 효과 번호.
 *
 * 전부 **우리가 아직 안 들고 있는 상태**를 봐야 하는 것들이다: 골로피 사용 횟수,
 * 상대가 마지막에 쓴 기술(사슬묶기·앙코르), 도구 소지 여부(도둑질·재활용),
 * 미래예지 예약. 여기 걸리면 점수를 안 건드린다 — 잘못 깎느니 가만두는 게 낫다
 */
const BASIC_UNMODELLED: ReadonlySet<number> = new Set([
  EFFECT.DISABLE, EFFECT.ENCORE, EFFECT.NEXT_ATTACK_ALWAYS_HITS,
  EFFECT.ALL_FAINT_3_TURNS, EFFECT.STOCKPILE, EFFECT.SPIT_UP, EFFECT.SWALLOW,
  EFFECT.SWITCH_HELD_ITEMS, EFFECT.REMOVE_HELD_ITEM, EFFECT.RECYCLE,
  EFFECT.HIT_IN_3_TURNS, EFFECT.MAKE_SHARED_MOVES_UNUSEABLE, EFFECT.NATURAL_GIFT,
  EFFECT.FLING, EFFECT.TRANSFER_STATUS, EFFECT.PREVENT_ITEM_USE,
  EFFECT.FAIL_IF_NOT_USED_ALL_OTHER_MOVES, EFFECT.USE_LAST_USED_MOVE,
  EFFECT.SET_ABILITY_TO_INSOMNIA, EFFECT.SUPPRESS_ABILITY, EFFECT.CAMOUFLAGE,
  EFFECT.SWAP_ATK_DEF, EFFECT.SWAP_ATK_SP_ATK_STAT_CHANGES,
  EFFECT.SWAP_DEF_SP_DEF_STAT_CHANGES, EFFECT.BOOST_ALLY_POWER_BY_50_PERCENT,
])

/** 효과별 무용 판정. 원작 `Basic_ScoreMoveEffect`의 분기표다 */
function basicEffect(turn: AiTurn, move: AiMove): number | null {
  const { self, foe } = turn
  switch (move.effect) {
    case EFFECT.STATUS_SLEEP:
    case EFFECT.STATUS_SLEEP_NEXT_TURN:
      if (statusBlocked(turn)) return -10
      return foe.ability === ABILITY.INSOMNIA || foe.ability === ABILITY.VITAL_SPIRIT ? -10 : null

    case EFFECT.HALVE_DEFENSE:
      return basicExplode(turn, move)

    case EFFECT.RECOVER_DAMAGE_SLEEP:
      if (foe.status !== 'slp') return -8
      return immuneByType(move, foe) ? -10 : null

    case EFFECT.ATK_UP: case EFFECT.ATK_UP_2:
      return basicRaise(turn, 'atk')
    case EFFECT.DEF_UP: case EFFECT.DEF_UP_2: case EFFECT.DEF_UP_DOUBLE_ROLLOUT_POWER:
      return basicRaise(turn, 'def')
    case EFFECT.SPEED_UP: case EFFECT.SPEED_UP_2:
      return basicRaise(turn, 'spe')
    case EFFECT.SP_ATK_UP: case EFFECT.SP_ATK_UP_2:
      return basicRaise(turn, 'spa')
    case EFFECT.SP_DEF_UP: case EFFECT.SP_DEF_UP_2:
      return basicRaise(turn, 'spd')
    case EFFECT.ACC_UP: case EFFECT.ACC_UP_2:
      return basicRaise(turn, 'accuracy')
    case EFFECT.EVA_UP: case EFFECT.EVA_UP_2: case EFFECT.EVA_UP_2_MINIMIZE:
      return basicRaise(turn, 'evasion')

    case EFFECT.ATK_DOWN: case EFFECT.ATK_DOWN_2:
      return basicLower(turn, 'atk')
    case EFFECT.DEF_DOWN: case EFFECT.DEF_DOWN_2:
      return basicLower(turn, 'def')
    case EFFECT.SPEED_DOWN: case EFFECT.SPEED_DOWN_2:
      return basicLower(turn, 'spe')
    case EFFECT.SP_ATK_DOWN: case EFFECT.SP_ATK_DOWN_2:
      return basicLower(turn, 'spa')
    case EFFECT.SP_DEF_DOWN: case EFFECT.SP_DEF_DOWN_2:
      return basicLower(turn, 'spd')
    // 원작이 여기서 명중과 회피를 바꿔 넣는다(EVA_DOWN_2 → 명중 루틴). 그대로 둔다
    case EFFECT.ACC_DOWN: case EFFECT.EVA_DOWN_2:
      return basicLower(turn, 'accuracy')
    case EFFECT.EVA_DOWN: case EFFECT.ACC_DOWN_2:
      return basicLower(turn, 'evasion')

    case EFFECT.RESET_STAT_CHANGES:
    case EFFECT.COPY_STAT_CHANGES:
    case EFFECT.SWAP_STAT_CHANGES:
      return basicResetStages(turn)

    case EFFECT.FORCE_SWITCH:
      if (foe.bench === 0) return -10
      return foeAbility(turn) === ABILITY.SUCTION_CUPS ? -10 : null

    case EFFECT.RESTORE_HALF_HP:
    case EFFECT.HEAL_HALF_MORE_IN_SUN:
    case EFFECT.UNUSED_133:
    case EFFECT.UNUSED_134:
    case EFFECT.UNUSED_157:
    case EFFECT.HEAL_HALF_REMOVE_FLYING_TYPE:
      return hpPercent(self) === 100 ? -8 : null

    case EFFECT.STATUS_BADLY_POISON:
    case EFFECT.STATUS_POISON:
      return basicCannotPoison(turn)

    case EFFECT.SET_LIGHT_SCREEN:
      return self.side.has('lightscreen') ? -8 : null
    case EFFECT.SET_REFLECT:
      return self.side.has('reflect') ? -8 : null
    case EFFECT.PREVENT_STAT_REDUCTION:
      return self.side.has('mist') ? -8 : null
    case EFFECT.PREVENT_STATUS:
      return self.side.has('safeguard') ? -8 : null

    case EFFECT.ONE_HIT_KO:
      if (immuneByType(move, foe)) return -10
      if (foeAbility(turn) === ABILITY.STURDY) return -10
      return self.level < foe.level ? -10 : null

    case EFFECT.CRIT_UP_2:
      return self.volatiles.has('focusenergy') ? -10 : null

    case EFFECT.STATUS_CONFUSE:
    case EFFECT.ATK_UP_2_STATUS_CONFUSION:
    case EFFECT.SP_ATK_UP_CAUSE_CONFUSION:
      if (foe.volatiles.has('confusion')) return -5
      if (foe.ability === ABILITY.OWN_TEMPO) return -10
      return foe.side.has('safeguard') ? -10 : null

    case EFFECT.STATUS_PARALYZE:
      return basicCannotParalyze(turn, move)
    case EFFECT.STATUS_BURN:
      return basicCannotBurn(turn)

    case EFFECT.SET_SUBSTITUTE:
      if (self.volatiles.has('substitute')) return -8
      return hpPercent(self) < 26 ? -10 : null

    case EFFECT.STATUS_LEECH_SEED:
      if (foe.volatiles.has('leechseed')) return -10
      if (hasType(foe, TYPE.GRASS)) return -10
      return foe.ability === ABILITY.MAGIC_GUARD ? -10 : null

    case EFFECT.DAMAGE_WHILE_ASLEEP:
    case EFFECT.USE_RANDOM_LEARNED_MOVE_SLEEP:
      return self.status !== 'slp' ? -8 : null

    case EFFECT.PREVENT_ESCAPE:
      return foe.volatiles.has('meanlook') ? -10 : null

    case EFFECT.STATUS_NIGHTMARE:
      if (foe.volatiles.has('nightmare')) return -10
      if (foe.status !== 'slp') return -8
      return foe.ability === ABILITY.MAGIC_GUARD ? -10 : null

    case EFFECT.CURSE:
      return basicCurse(turn)

    case EFFECT.SET_SPIKES:
      if ((foe.side.get('spikes') ?? 0) === 3) return -10
      return foe.bench === 0 ? -10 : null
    case EFFECT.TOXIC_SPIKES:
      if ((foe.side.get('toxicspikes') ?? 0) === 2) return -10
      return foe.bench === 0 ? -10 : null
    case EFFECT.STEALTH_ROCK:
      if (foe.side.has('stealthrock')) return -10
      return foe.bench === 0 ? -10 : null

    case EFFECT.FORESIGHT:
      return foe.volatiles.has('foresight') ? -10 : null
    case EFFECT.IGNORE_EVASION_REMOVE_DARK_IMMUNE:
      return foe.volatiles.has('miracleeye') ? -10 : null
    case EFFECT.TORMENT:
      return foe.volatiles.has('torment') ? -10 : null

    case EFFECT.WEATHER_SANDSTORM:
      return turn.weather === 'Sandstorm' ? -8 : null
    case EFFECT.WEATHER_HAIL:
      return turn.weather === 'Hail' ? -8 : null
    case EFFECT.WEATHER_RAIN:
      return turn.weather === 'RainDance' ? -8 : null
    case EFFECT.WEATHER_SUN:
      return turn.weather === 'SunnyDay' ? -8 : null

    case EFFECT.INFATUATE:
      return basicCannotAttract(turn)

    case EFFECT.MAGNITUDE:
      // 매그니튜드는 땅 기술이라 부유에 안 통한다. 원작이 이 자리만 따로 확인한다
      if (foeAbility(turn) === ABILITY.LEVITATE) return -10
      return basicNonStandard(turn, move)

    case EFFECT.MAX_ATK_LOSE_HALF_MAX_HP:
      // 배북. HP 절반 이하면 못 쓴다
      if (hpPercent(self) < 51) return -10
      return basicRaise(turn, 'atk')

    case EFFECT.PASS_STATS_AND_STATUS:
      return self.bench === 0 ? -10 : null

    case EFFECT.FAINT_AND_ATK_SP_ATK_DOWN_2:
      if (foeAbility(turn) === ABILITY.CLEAR_BODY) return -10
      if (foeAbility(turn) === ABILITY.WHITE_SMOKE) return -10
      if (foe.boosts.atk === -6) return -10
      if (foe.boosts.spa === -6) return -8
      return self.bench === 0 ? -10 : null

    case EFFECT.FAINT_AND_FULL_HEAL_NEXT_MON:
    case EFFECT.FAINT_FULL_RESTORE_NEXT_MON:
      // 남은 애가 없거나, 있는 애가 전부 멀쩡하면 목숨을 버릴 이유가 없다
      return self.bench === 0 ? -10 : null

    case EFFECT.ALWAYS_FLINCH_FIRST_TURN_ONLY:
      return turn.turn !== 0 ? -10 : null

    case EFFECT.GROUND_TRAP_USER_CONTINUOUS_HEAL:
      return self.volatiles.has('ingrain') ? -10 : null
    case EFFECT.RESTORE_HP_EVERY_TURN:
      return self.volatiles.has('aquaring') ? -10 : null
    case EFFECT.GIVE_GROUND_IMMUNITY:
      return self.volatiles.has('magnetrise') ? -10 : null
    case EFFECT.PREVENT_HEALING:
      return foe.volatiles.has('healblock') ? -10 : null
    case EFFECT.PREVENT_CRITS:
      return self.side.has('luckychant') ? -10 : null
    case EFFECT.DOUBLE_SPEED_3_TURNS:
      return self.side.has('tailwind') ? -10 : null
    case EFFECT.GRAVITY:
      return turn.field.has('gravity') ? -10 : null
    case EFFECT.TRICK_ROOM:
      return turn.field.has('trickroom') ? -10 : null

    case EFFECT.HEAL_STATUS:
      return self.status === 'ok' ? -10 : null

    case EFFECT.SP_ATK_DOWN_2_OPPOSITE_GENDER:
      return basicCannotAttract(turn)

    case EFFECT.HALVE_ELECTRIC_DAMAGE:
      return self.volatiles.has('mudsport') ? -10 : null
    case EFFECT.HALVE_FIRE_DAMAGE:
      return self.volatiles.has('watersport') ? -10 : null

    // 두 능력을 같이 올리고 내리는 것들. 원작은 각 능력의 랭크 루틴을 이어 붙인다
    case EFFECT.ATK_DEF_DOWN:
      return basicLower(turn, 'atk') ?? basicLower(turn, 'def')
    case EFFECT.DEF_SPD_UP:
      return basicRaise(turn, 'def') ?? basicRaise(turn, 'spd')
    case EFFECT.ATK_DEF_UP:
      return basicRaise(turn, 'atk') ?? basicRaise(turn, 'def')
    case EFFECT.SP_ATK_SP_DEF_UP:
      return basicRaise(turn, 'spa') ?? basicRaise(turn, 'spd')
    case EFFECT.ATK_SPD_UP:
      return basicRaise(turn, 'atk') ?? basicRaise(turn, 'spe')

    case EFFECT.REMOVE_HAZARDS_SCREENS_EVA_DOWN:
      return basicLower(turn, 'evasion')

    case EFFECT.FLEE_FROM_WILD_BATTLE:
      // 트레이너전에서 도망 기술은 그냥 실패한다
      return -10

    default:
      return isDamageScored(move) ? null : basicNonStandardIfListed(turn, move)
  }
}

/**
 * 분기표에 없는 효과의 뒤처리.
 *
 * 원작은 `Basic_CheckNonStandardDamageOrChargeTurn`에 스물네 개 효과를 몰아 넣는데,
 * 그 목록은 곧 `NO_DAMAGE_CALC` ∪ `ALT_POWER`와 거의 같다. 데미지 계산 대상이
 * 아닌 기술은 여기로 흘려 무효만 확인한다
 */
function basicNonStandardIfListed(turn: AiTurn, move: AiMove): number | null {
  if (BASIC_UNMODELLED.has(move.effect)) return null
  if (move.category === 'status') return null
  return basicNonStandard(turn, move)
}

/** BASIC 한 기술분 */
function scoreBasic(turn: AiTurn, move: AiMove): number {
  // 일격필살 둘은 데미지 비교를 건너뛰고 곧바로 무효 판정으로 간다.
  // 가위자르기가 빠져 있는 것은 원작 그대로다
  const skipsDamage = move.id === FISSURE || move.id === HORN_DRILL
  if (skipsDamage || isDamageScored(move)) {
    const immunity = basicImmunity(turn, move)
    if (immunity !== null) return immunity
  }
  const sound = basicSoundproof(turn, move)
  if (sound !== null) return sound
  return basicEffect(turn, move) ?? 0
}

const FISSURE = 90
const HORN_DRILL = 32

// ═════════════════════════════════════════════════════════════════════════════
// AI_FLAG_EVAL_ATTACK — 데미지와 마무리
// ═════════════════════════════════════════════════════════════════════════════

/** 마무리가 되는 기술에 붙는 보너스가 확률적인 효과들 */
const KILL_BONUS_MAYBE: ReadonlySet<number> = new Set([
  EFFECT.HIT_LAST_WHIFF_IF_HIT, // 기합구슬
  EFFECT.HIT_FIRST_IF_TARGET_ATTACKING, // 기습
  EFFECT.HIT_IN_3_TURNS, // 미래예지
])

/** 데미지 비교에서 손해를 보는 효과들. 자폭·기합구슬·기습 */
const DEPRIORITIZED: ReadonlySet<number> = new Set([
  EFFECT.HALVE_DEFENSE,
  EFFECT.HIT_LAST_WHIFF_IF_HIT,
  EFFECT.HIT_FIRST_IF_TARGET_ATTACKING,
])

function scoreEvalAttack(turn: AiTurn, move: AiMove, damages: readonly number[], i: number): number {
  if (killsWithMaxRoll(move, turn.self, turn.foe, turn.weather)) {
    // 자폭으로 마무리하는 것은 보너스를 안 준다
    if (move.effect === EFFECT.HALVE_DEFENSE) return 0
    if (KILL_BONUS_MAYBE.has(move.effect)) {
      // 170/256 = 66.4%로 건너뛴다. 즉 33.6%로만 +4
      return rollSkips(turn.random, 170) ? 0 : 4
    }
    // 선제공격 효과는 마무리 보너스에 +2가 더 붙는다
    return move.effect === EFFECT.PRIORITY_1 ? 6 : 4
  }

  let delta = 0
  // 제일 센 기술이 아니면 -1. 이것 하나가 "가장 아픈 걸 고른다"를 만든다
  const best = Math.max(...damages)
  if (isDamageScored(move) && damages[i]! < best) delta -= 1
  else if (!isDamageScored(move)) return 0

  if (DEPRIORITIZED.has(move.effect)) {
    // 51/256 = 19.9%로 건너뛴다. 즉 80.1%로 -2
    if (!rollSkips(turn.random, 51)) delta -= 2
  }
  // 4배로 들어가면 68.75%로 +2
  if (effectivenessOf(move.type, turn.foe.types) >= 4 && !rollSkips(turn.random, 80)) delta += 2
  return delta
}

// ═════════════════════════════════════════════════════════════════════════════
// 나머지 세 플래그
// ═════════════════════════════════════════════════════════════════════════════

/** 첫 턴이면 셋업 기술에 68.75%로 +2 */
function scoreSetupFirstTurn(turn: AiTurn, move: AiMove): number {
  if (turn.turn !== 0) return 0
  if (!SETUP_EFFECTS.has(move.effect)) return 0
  return rollSkips(turn.random, 80) ? 0 : 2
}

/** 도박수에 50%로 +2 */
function scoreRisky(turn: AiTurn, move: AiMove): number {
  if (!RISKY_EFFECTS.has(move.effect)) return 0
  return rollSkips(turn.random, 128) ? 0 : 2
}

/**
 * 위력이 들쭉날쭉하거나 아예 위력이 없는 기술에 61%로 +2.
 *
 * 판정은 "데미지 계산 대상이 **아닌가**"다 — 변화기와 자폭·고정 데미지가 한꺼번에
 * 여기 걸린다. 원작 주석이 그렇게 적어 놓았다
 */
function scorePrioritizeExtremes(turn: AiTurn, move: AiMove): number {
  if (isDamageScored(move)) return 0
  return rollSkips(turn.random, 100) ? 0 : 2
}

// ═════════════════════════════════════════════════════════════════════════════
// 합산
// ═════════════════════════════════════════════════════════════════════════════

export interface ScoredMove {
  move: AiMove
  score: number
}

/**
 * 기술 네 칸의 점수.
 *
 * 플래그는 **비트가 낮은 것부터** 돈다. 원작이 `thinkingMask >>= 1`로 훑기 때문인데,
 * 순서가 결과에 영향을 준다 — 확률 판정이 섞여 있어서다
 */
export function scoreMoves(turn: AiTurn, flags: number, expert?: ExpertScorer): ScoredMove[] {
  const damages = allDamage(turn.moves, turn.self, turn.foe, turn.weather)
  return turn.moves.map((move, i) => {
    let score = BASE_SCORE
    if (flags & AI_FLAG.BASIC) score += scoreBasic(turn, move)
    if (flags & AI_FLAG.EVAL_ATTACK) score += scoreEvalAttack(turn, move, damages, i)
    if (flags & AI_FLAG.EXPERT && expert) score += expert(turn, move, damages, i)
    if (flags & AI_FLAG.SETUP_FIRST_TURN) score += scoreSetupFirstTurn(turn, move)
    if (flags & AI_FLAG.RISKY) score += scoreRisky(turn, move)
    if (flags & AI_FLAG.PRIORITIZE_EXTREMES) score += scorePrioritizeExtremes(turn, move)
    return { move, score }
  })
}

/** EXPERT 루틴. 순환 import를 피하려고 밖에서 넣는다 */
export type ExpertScorer = (
  turn: AiTurn,
  move: AiMove,
  damages: readonly number[],
  index: number,
) => number

/**
 * 가장 높은 점수. 동점이면 그중 무작위.
 *
 * 원작도 정확히 이렇게 한다 — 그래서 같은 상황에서도 매번 같은 수가 나오지는 않는다
 */
export function pickBest(scored: readonly ScoredMove[], random: () => number): AiMove | null {
  if (!scored.length) return null
  let best = -Infinity
  const tied: AiMove[] = []
  for (const s of scored) {
    if (s.score > best) {
      best = s.score
      tied.length = 0
    }
    if (s.score === best) tied.push(s.move)
  }
  return tied[Math.floor(random() * tied.length)] ?? tied[0]!
}

export { estimateDamage }
