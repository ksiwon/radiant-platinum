// AI_FLAG_EXPERT — 기술별 세부 판단 (PLAN §7.7)
//
// 플래티넘 트레이너 928명 중 289명이 이 플래그를 갖고 있다. 관장·사천왕·라이벌은
// 전부 여기 들어간다.
//
// ⚠️ **부분 이식이다.** 원작 스크립트의 EXPERT 분기표는 효과 177가지를 루틴 136개로
// 보내는데, 그 대부분은 우리가 아직 안 들고 있는 상태(골로피 횟수, 도구 소지,
// 예약된 미래예지, 더블 배틀의 파트너)를 봐야 한다. 여기서는 **실제로 자주 걸리는
// 루틴부터** 옮겼다 — `sim/brain.test.ts`가 928명의 실제 파티를 훑어 적용률을
// 재고(실측 42.0% · 1,261/3,004 · 원작 분기표가 닿는 51.8%의 여덟 할), 그 값이
// 떨어지면 실패한다. 안 옮긴 효과는 점수를 안 건드린다.
//
// 옮긴 것이 **실제로 이기는 수를 고르는가**는 다른 질문이고 `ai/strength.test.ts`가
// 잰다 — 난천의 편성끼리 붙여 무작위·탐욕 상대로 40판씩.
//
// 원작 주석의 확률(`~80.5%` 등)은 문턱값 `n/256`을 사람이 읽기 좋게 옮긴 것이다.
// 여기서는 문턱값을 그대로 쓴다 — 확률을 다시 적으면 반올림이 끼어든다.
import type { AiMon, AiMove, AiTurn } from './context'
import { boosted, hpPercent } from './context'
import { isDamageScored } from './damage'
import { ABILITY, EFFECT } from './rom'
import { effectivenessOf, TYPE } from './typeChart'

/** `IfRandomLessThan n`이 분기하는가 (= 점수를 **안** 주는가) */
function skip(random: () => number, threshold: number): boolean {
  return Math.floor(random() * 256) < threshold
}

/** 랭크를 먹인 스피드로 비교한다. 같으면 "느리다" 쪽이 아니다 */
function isSlower(turn: AiTurn): boolean {
  const mine = boosted(turn.self.stats.spe, turn.self.boosts.spe)
  const theirs = boosted(turn.foe.stats.spe, turn.foe.boosts.spe)
  return mine < theirs
}

function eff(move: AiMove, foe: AiMon): number {
  return effectivenessOf(move.type, foe.types)
}

/** 상대가 반감하거나 아예 안 맞는가. EXPERT 루틴 다수가 이걸로 시작한다 */
function resisted(move: AiMove, foe: AiMon): boolean {
  return eff(move, foe) < 1
}

/** 내 기술칸에 이 효과를 가진 게 있는가 */
function knowsEffect(turn: AiTurn, effect: number): boolean {
  return turn.moves.some((m) => m.effect === effect)
}

/** 내 기술칸에 상대에게 효과가 굉장한 게 있는가 */
function hasSuperEffective(turn: AiTurn): boolean {
  return turn.moves.some((m) => isDamageScored(m) && eff(m, turn.foe) >= 2)
}

const MOVE_U_TURN = 369
const MOVE_ICY_WIND = 196
const MOVE_ROCK_TOMB = 317
const MOVE_MUD_SHOT = 341

// ── 개별 루틴 ────────────────────────────────────────────────────────────────

/** 급소율이 높은 기술. 효과가 좋을수록 쓸 값어치가 있다 */
function highCritical(turn: AiTurn, move: AiMove): number {
  const e = eff(move, turn.foe)
  if (e < 1) return 0
  // 굉장하면 50%, 보통이면 25%로 +1
  if (e >= 2) return skip(turn.random, 128) ? 0 : 1
  if (skip(turn.random, 128)) return 0
  return skip(turn.random, 128) ? 0 : 1
}

/** 반드시 맞는 기술. 상대 회피가 높거나 내 명중이 낮을수록 값어치가 오른다 */
function bypassAccuracy(turn: AiTurn): number {
  if (turn.foe.boosts.evasion > 4 || turn.self.boosts.accuracy < -4) return 1
  if (turn.foe.boosts.evasion > 2 || turn.self.boosts.accuracy < -2) {
    return skip(turn.random, 100) ? 0 : 1
  }
  return 0
}

/** 흡수 기술. 반감당하면 회복량도 같이 줄어든다 */
function drainMove(turn: AiTurn, move: AiMove): number {
  if (!resisted(move, turn.foe)) return 0
  return skip(turn.random, 50) ? 0 : -3
}

/** 혼란. 상대 HP가 적을수록 굳이 혼란시킬 이유가 줄어든다 */
function statusConfuse(turn: AiTurn): number {
  const hp = hpPercent(turn.foe)
  if (hp > 70) return 0
  let delta = 0
  if (!skip(turn.random, 128)) delta -= 1
  if (hp > 50) return delta
  delta -= 1
  if (hp > 30) return delta
  return delta - 1
}

/** 반동 기술. 돌머리·매직가드면 반동이 없으니 값어치가 오른다 */
function recoilMove(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return 0
  // 돌머리는 우리 특성 표에 없다. 매직가드만 본다
  return turn.self.ability === ABILITY.MAGIC_GUARD ? 1 : 0
}

/** 인파이트처럼 자기 방어를 깎는 기술. 체력이 얼마 안 남았으면 안 쓴다 */
function closeCombat(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  const hp = hpPercent(turn.self)
  // 느리면 맞고 나서 방어가 깎이므로 더 조심한다
  return isSlower(turn) ? (hp > 80 ? 0 : -1) : (hp > 60 ? 0 : -1)
}

/** 맹독·씨뿌리기. 서로 체력이 적으면 지속 데미지를 기다릴 여유가 없다 */
function toxicLeechSeed(turn: AiTurn): number {
  let delta = 0
  if (turn.moves.some(isDamageScored)) {
    if (hpPercent(turn.self) <= 50 && !skip(turn.random, 50)) delta -= 3
    if (hpPercent(turn.foe) <= 50 && !skip(turn.random, 50)) delta -= 3
  }
  // 특수방어를 올리거나 방어하는 기술이 있으면 버티면서 깎을 수 있다
  if (knowsEffect(turn, EFFECT.SP_DEF_UP) || knowsEffect(turn, EFFECT.PROTECT)) {
    if (!skip(turn.random, 60)) delta += 2
  }
  return delta
}

/** 잠들게 하기. 꿈먹기·악몽을 갖고 있으면 재우는 값어치가 오른다 */
function statusSleep(turn: AiTurn): number {
  const combo = knowsEffect(turn, EFFECT.RECOVER_DAMAGE_SLEEP)
    || knowsEffect(turn, EFFECT.STATUS_NIGHTMARE)
  if (!combo) return 0
  return skip(turn.random, 128) ? 0 : 1
}

/** 파괴광선처럼 다음 턴을 버리는 기술. 체력이 넉넉하면 굳이 안 쓴다 */
function rechargeTurn(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  const hp = hpPercent(turn.self)
  return isSlower(turn) ? (hp < 60 ? 0 : -1) : (hp > 40 ? -1 : 0)
}

/** 깨트리기. 상대가 벽을 쳐 놨으면 값어치가 오른다 */
function brickBreak(turn: AiTurn): number {
  return turn.foe.side.has('reflect') || turn.foe.side.has('lightscreen') ? 1 : 0
}

/**
 * 회복기.
 *
 * **내가 빠르면 -8이다.** 먼저 회복해 봐야 그 턴에 다시 맞기 때문이고, 이 한 줄이
 * "회복기만 쓰다 지는 AI"를 막는다
 */
function recovery(turn: AiTurn): number {
  const hp = hpPercent(turn.self)
  if (hp === 100) return -3
  if (!isSlower(turn)) return -8
  if (hp >= 70) {
    if (!skip(turn.random, 30)) return -3
  }
  // 상대가 훔치기를 아는지까지는 안 본다 — 4세대 트레이너 중 아무도 안 갖고 있다
  return skip(turn.random, 20) ? 0 : 2
}

/** 스피드를 깎는 공격기. 반감당하면 의미가 없다 */
function speedDownOnHit(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return 0
  // 이 셋만 "스피드를 깎는 변화기"처럼 다시 판정한다
  if (move.id === MOVE_ICY_WIND || move.id === MOVE_ROCK_TOMB || move.id === MOVE_MUD_SHOT) {
    return statusSpeedDown(turn)
  }
  return 0
}

/** 스피드를 깎는 변화기. 이미 내가 빠르면 깎을 이유가 없다 */
function statusSpeedDown(turn: AiTurn): number {
  if (!isSlower(turn)) return -3
  const hp = hpPercent(turn.self)
  if (hp < 60) return -2
  return skip(turn.random, 70) ? 0 : 2
}

/** 마비. 내가 느릴 때 값어치가 가장 크다 */
function statusParalyze(turn: AiTurn): number {
  if (isSlower(turn)) return skip(turn.random, 20) ? 0 : 3
  return hpPercent(turn.self) > 70 ? 0 : -1
}

/** 맑은하늘. 다른 날씨를 덮어쓰는 값어치가 있다 */
function sunnyDay(turn: AiTurn): number {
  if (hpPercent(turn.self) < 40) return -1
  if (turn.weather === 'Hail' || turn.weather === 'RainDance' || turn.weather === 'Sandstorm') {
    return 1
  }
  // 원작은 여기서 "리프가드 + 상태이상"이면 +1을 준다. 리프가드는 상태이상을
  // 막는 특성이라 이미 걸린 뒤에는 소용이 없다 — 원본의 조건이 뒤집혀 있다.
  // 그대로 옮긴다
  if (turn.self.ability === ABILITY.LEAF_GUARD && turn.self.status !== 'ok') return 1
  return 0
}

/** 벽. 체력이 넉넉할 때 깔아야 값어치가 있다 */
function screen(turn: AiTurn, want: 'physical' | 'special'): number {
  const hp = hpPercent(turn.self)
  if (hp < 50) return -2
  let delta = 0
  if (hp >= 90 && !skip(turn.random, 128)) delta += 1
  if (turn.foeLastMoveCategory === want && !skip(turn.random, 64)) delta += 1
  return delta
}

/**
 * 유턴.
 *
 * 원작은 여기서 "벤치에 더 센 애가 있나"까지 본다. 우리는 벤치의 데미지를 안
 * 재므로 **있다고 치고** 그 감점을 건너뛴다 — 없다고 치면 유턴을 과하게 깎는다
 */
function uTurn(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  if (turn.self.bench === 0) return 0
  let delta = 0
  if (hasSuperEffective(turn) && !skip(turn.random, 64)) delta -= 2

  const foeHp = hpPercent(turn.foe)
  let plus = false
  if (foeHp > 70) {
    if (!skip(turn.random, 64)) delta += 1
    plus = true
  } else if (foeHp > 30) {
    plus = true
  } else if (!skip(turn.random, 128)) {
    plus = true
  }
  if (plus && !skip(turn.random, 128)) delta += 1

  if (!isSlower(turn)) return delta + 1
  return skip(turn.random, 128) ? delta : delta + 1
}

/** 追い討ち(추격). 상대가 도망갈 것 같을수록 값어치가 오른다 */
function pursuit(turn: AiTurn): number {
  let delta = 0
  const likelyToSwitch = turn.turn === 0
    || turn.foe.types.includes(TYPE.GHOST)
    || turn.foe.types.includes(TYPE.PSYCHIC)
  if (likelyToSwitch && !skip(turn.random, 128)) delta += 1
  if (turn.foeKnownMoves.has(MOVE_U_TURN) && !skip(turn.random, 128)) delta += 1
  return delta
}

/** 리벤지·설붕처럼 맞고 나서 세지는 기술 */
function revenge(turn: AiTurn): number {
  // 상대가 못 움직일 것 같으면 반격 조건이 안 선다
  if (turn.foe.status === 'slp') return -2
  if (turn.foe.volatiles.has('attract') || turn.foe.volatiles.has('confusion')) return -2
  return skip(turn.random, 180) ? -2 : 2
}

/** 잠자기. 회복기와 같은 논리인데 문턱이 다르다 */
function rest(turn: AiTurn): number {
  const hp = hpPercent(turn.self)
  if (isSlower(turn)) {
    if (hp >= 60) {
      if (hp > 70) return -3
      if (!skip(turn.random, 50)) return -3
    }
  } else {
    if (hp === 100) return -8
    if (hp >= 40) {
      if (hp > 50) return -3
      if (!skip(turn.random, 70)) return -3
    }
  }
  return skip(turn.random, 10) ? 0 : 3
}

/** 오버히트처럼 자기 특공을 깎는 기술 */
function overheat(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  const hp = hpPercent(turn.self)
  return isSlower(turn) ? (hp > 80 ? 0 : -1) : (hp > 60 ? 0 : -1)
}

/** 능력을 올리는 변화기. 체력이 넉넉할 때만 값어치가 있다 */
function statusRaise(turn: AiTurn, stat: keyof AiMon['boosts']): number {
  let delta = 0
  const hp = hpPercent(turn.self)
  if (turn.self.boosts[stat] >= 3) {
    if (!skip(turn.random, 100)) delta -= 1
  } else if (hp === 100 && !skip(turn.random, 128)) {
    delta += 2
  }
  if (hp > 70) return delta
  if (hp < 40) return delta - 2
  return skip(turn.random, 40) ? delta : delta - 2
}

/** 회피율 올리기. 지속 데미지를 깔아 놨을수록 값어치가 크다 */
function statusEvasionUp(turn: AiTurn): number {
  let delta = 0
  const hp = hpPercent(turn.self)
  if (hp >= 90 && !skip(turn.random, 100)) delta += 3
  if (turn.self.boosts.evasion >= 3 && !skip(turn.random, 128)) delta -= 1

  if (turn.foe.status === 'tox') {
    if (hp > 50 || !skip(turn.random, 80)) {
      if (!skip(turn.random, 50)) delta += 3
    }
  }
  if (turn.foe.volatiles.has('leechseed') && !skip(turn.random, 70)) delta += 3
  if (turn.self.volatiles.has('ingrain') || turn.self.volatiles.has('aquaring')) {
    if (!skip(turn.random, 128)) delta += 2
  }
  if (turn.foe.volatiles.has('curse') && !skip(turn.random, 70)) delta += 3

  if (hp > 70) return delta
  if (turn.self.boosts.evasion === 0) return delta
  if (hp < 40 || hpPercent(turn.foe) < 40) return delta - 2
  return skip(turn.random, 70) ? delta : delta - 2
}

/** 자폭·대폭발. 체력이 얼마 안 남았을 때만 값어치가 있다 */
function explosion(turn: AiTurn): number {
  let delta = 0
  // 상대 회피가 올라 있으면 빗나갈 위험이 커진다
  if (turn.foe.boosts.evasion >= 1) {
    delta -= 1
    if (turn.foe.boosts.evasion >= 4 && !skip(turn.random, 128)) delta -= 1
  }
  const hp = hpPercent(turn.self)
  if (hp >= 80) {
    if (!isSlower(turn)) return skip(turn.random, 50) ? delta : delta - 3
    return skip(turn.random, 50) ? delta : delta - 1
  }
  if (hp > 50) return skip(turn.random, 50) ? delta : delta - 1
  if (hp > 30) return skip(turn.random, 128) ? delta : delta + 1
  // 30% 이하. 어차피 다음 턴에 쓰러진다면 같이 데려가는 게 낫다
  if (!skip(turn.random, 128)) delta += 1
  return skip(turn.random, 50) ? delta : delta + 1
}

/** 저주. 고스트면 체력을 깎는 기술이고, 아니면 방어를 올리는 기술이다 */
function curse(turn: AiTurn): number {
  if (turn.self.types.includes(TYPE.GHOST)) {
    return hpPercent(turn.self) > 80 ? 0 : -1
  }
  if (turn.self.boosts.def >= 4) return 0
  let delta = 0
  // 자이로볼·트릭룸을 갖고 있으면 느려지는 것이 오히려 이득이다
  const slowIsGood = turn.moves.some((m) => m.effect === EFFECT.TRICK_ROOM || m.effect === 219)
  if (slowIsGood && !skip(turn.random, 32)) delta += 1
  else if (!skip(turn.random, 128)) delta += 1
  if (turn.self.boosts.def >= 2) return delta
  if (!skip(turn.random, 128)) delta += 1
  if (turn.self.boosts.def >= 1) return delta
  return skip(turn.random, 128) ? delta : delta + 1
}

/** 용의춤처럼 공격과 스피드를 같이 올리는 기술 */
function dragonDance(turn: AiTurn): number {
  if (isSlower(turn)) return skip(turn.random, 128) ? 0 : 1
  if (hpPercent(turn.self) > 50) return 0
  return skip(turn.random, 70) ? 0 : -1
}

/** 조이기·검은눈빛. 상대가 지속 피해를 받고 있으면 묶어 두는 값어치가 있다 */
function bindingMove(turn: AiTurn): number {
  const stuck = turn.foe.status === 'tox'
    || turn.foe.volatiles.has('curse')
    || turn.foe.volatiles.has('perish3')
    || turn.foe.volatiles.has('attract')
  if (!stuck) return 0
  return skip(turn.random, 128) ? 0 : 1
}

/**
 * 모으기 기술.
 *
 * 파워풀허브(한 턴에 끝내는 도구)는 아직 도구 데이터가 없어 못 본다.
 * 상대가 방어를 아는지는 써 보인 기술로만 안다
 */
function chargeTurn(turn: AiTurn, move: AiMove, invulnerable: boolean): number {
  if (!invulnerable) {
    if (resisted(move, turn.foe)) return -2
    // 솔라빔은 맑은하늘이면 모으기가 없어진다
    if (move.effect === 151 && turn.weather === 'SunnyDay') return 2
    if (turn.foeKnownMoves.has(MOVE_PROTECT) || turn.foeKnownMoves.has(MOVE_DETECT)) return -2
    return hpPercent(turn.self) > 38 ? 0 : -1
  }
  // 하늘로 날거나 땅으로 숨는 기술은 그 턴 동안 안 맞는다 — 계산이 반대다
  if (turn.foeKnownMoves.has(MOVE_PROTECT) || turn.foeKnownMoves.has(MOVE_DETECT)) return -1
  let delta = 0
  if (resisted(move, turn.foe)) delta += 1
  if (turn.foe.status === 'tox') delta += 1
  if (turn.foe.volatiles.has('curse') || turn.foe.volatiles.has('leechseed')) delta += 1
  if (!isSlower(turn) && !skip(turn.random, 80)) delta += 1
  return delta
}

/**
 * 방어·판별.
 *
 * **연속으로 쓴 횟수가 핵심이다.** 두 번 넘게 이어 쓰면 -2로 잘라 낸다 —
 * 이게 없으면 AI가 방어만 쓰다 배틀이 안 끝난다
 */
function protect(turn: AiTurn): number {
  if (turn.protectChain > 1) return -2
  const foeSuffering = turn.foe.status === 'tox'
    || turn.foe.volatiles.has('curse')
    || turn.foe.volatiles.has('perish3')
    || turn.foe.volatiles.has('attract')
    || turn.foe.volatiles.has('leechseed')
    || turn.foe.volatiles.has('yawn')
  const selfSuffering = turn.self.status === 'tox'
    || turn.self.volatiles.has('curse')
    || turn.self.volatiles.has('perish3')
    || turn.self.volatiles.has('attract')
    || turn.self.volatiles.has('leechseed')
    || turn.self.volatiles.has('yawn')
  if (selfSuffering) return -2

  let delta = 0
  if (foeSuffering || !skip(turn.random, 85)) delta += 2
  if (!skip(turn.random, 128)) delta -= 1
  if (turn.protectChain === 0) return delta
  delta -= 1
  return skip(turn.random, 128) ? delta : delta - 1
}

const MOVE_PROTECT = 182
const MOVE_DETECT = 197

/** 상대 능력을 깎는 변화기. 원작은 능력마다 조금씩 다르다 */
function statusLower(turn: AiTurn, stat: keyof AiMon['boosts']): number {
  if (stat === 'spe') return statusSpeedDown(turn)
  // 공격·방어 깎기는 체력이 넉넉할 때만 값어치가 있다
  const hp = hpPercent(turn.self)
  if (hp < 70) return -1
  return 0
}

/**
 * 옮긴 루틴이 처리하는 효과 → 루틴.
 *
 * 표에 없는 효과는 점수를 안 건드린다. 원작 분기표의 177개 중 몇 개를 덮는지는
 * `expert.test.ts`가 실제 트레이너 파티로 잰다
 */
export function scoreExpert(turn: AiTurn, move: AiMove): number {
  switch (move.effect) {
    case EFFECT.HIGH_CRITICAL:
      return highCritical(turn, move)
    case EFFECT.BYPASS_ACCURACY:
      return bypassAccuracy(turn)
    case EFFECT.RECOVER_HALF_DAMAGE_DEALT:
      return drainMove(turn, move)
    case EFFECT.STATUS_CONFUSE:
      return statusConfuse(turn)
    case EFFECT.RECOIL_QUARTER:
    case RECOIL_THIRD:
    case RECOIL_BURN_HIT:
    case RECOIL_PARALYZE_HIT:
    case RECOIL_HALF:
      return recoilMove(turn, move)
    case DEF_SPD_DOWN_HIT:
      return closeCombat(turn, move)
    case EFFECT.STATUS_BADLY_POISON:
    case EFFECT.STATUS_LEECH_SEED:
      return toxicLeechSeed(turn)
    case EFFECT.STATUS_SLEEP:
      return statusSleep(turn)
    case EFFECT.RECHARGE_AFTER:
      return rechargeTurn(turn, move)
    case BRICK_BREAK_EFFECT:
      return brickBreak(turn)
    case EFFECT.RESTORE_HALF_HP:
    case EFFECT.HEAL_HALF_MORE_IN_SUN:
    case EFFECT.HEAL_HALF_REMOVE_FLYING_TYPE:
    case EFFECT.UNUSED_157:
      return recovery(turn)
    case LOWER_SPEED_HIT:
      return speedDownOnHit(turn, move)
    case EFFECT.STATUS_PARALYZE:
      return statusParalyze(turn)
    case EFFECT.WEATHER_SUN:
      return sunnyDay(turn)
    case EFFECT.SET_LIGHT_SCREEN:
      return screen(turn, 'special')
    case EFFECT.SET_REFLECT:
      return screen(turn, 'physical')
    case SWITCH_HIT:
      return uTurn(turn, move)
    case HIT_BEFORE_SWITCH:
      return pursuit(turn)
    case DOUBLE_POWER_IF_HIT:
      return revenge(turn)
    case EFFECT.REST:
      return rest(turn)
    case SP_ATK_DOWN_2_SELF:
      return overheat(turn, move)

    case EFFECT.ATK_UP: case EFFECT.ATK_UP_2:
      return statusRaise(turn, 'atk')
    case EFFECT.DEF_UP: case EFFECT.DEF_UP_2:
      return statusRaise(turn, 'def')
    case EFFECT.SPEED_UP: case EFFECT.SPEED_UP_2:
      return statusRaise(turn, 'spe')
    case EFFECT.SP_ATK_UP: case EFFECT.SP_ATK_UP_2:
      return statusRaise(turn, 'spa')
    case EFFECT.SP_DEF_UP: case EFFECT.SP_DEF_UP_2:
      return statusRaise(turn, 'spd')
    case EFFECT.EVA_UP: case EFFECT.EVA_UP_2: case EFFECT.EVA_UP_2_MINIMIZE:
      return statusEvasionUp(turn)

    case EFFECT.ATK_DOWN: case EFFECT.ATK_DOWN_2:
      return statusLower(turn, 'atk')
    case EFFECT.DEF_DOWN: case EFFECT.DEF_DOWN_2:
      return statusLower(turn, 'def')
    case EFFECT.SPEED_DOWN: case EFFECT.SPEED_DOWN_2:
      return statusLower(turn, 'spe')

    case EFFECT.HALVE_DEFENSE:
      return explosion(turn)
    case EFFECT.CURSE:
      return curse(turn)
    case EFFECT.ATK_SPD_UP:
      return dragonDance(turn)
    case BIND_HIT: case EFFECT.PREVENT_ESCAPE:
      return bindingMove(turn)
    case EFFECT.PROTECT:
      return protect(turn)
    case EFFECT.ALWAYS_FLINCH_FIRST_TURN_ONLY:
      // 属性 없이 그냥 +2다. 첫 턴에만 쓸 수 있는 것은 BASIC이 이미 거른다
      return 2
    case CHARGE_TURN_HIGH_CRIT: case CHARGE_TURN_HIGH_CRIT_FLINCH:
    case CHARGE_TURN_DEF_UP: case SKIP_CHARGE_TURN_IN_SUN:
      return chargeTurn(turn, move, false)
    case FLY: case DIG: case DIVE: case DOUBLE_DAMAGE_DIG:
      return chargeTurn(turn, move, true)
    // 자이로볼은 원작에서도 점수를 안 건드린다. 그래도 분기표에는 있다
    case GYRO_BALL:
      return 0

    default:
      return 0
  }
}

/** 분기표에서 이름이 아니라 번호로만 쓰는 효과들 */
const BRICK_BREAK_EFFECT = 186 // 벽 부수기
const LOWER_SPEED_HIT = 70 // 맞히면서 스피드를 깎는 공격기
const SWITCH_HIT = 228 // 유턴
const HIT_BEFORE_SWITCH = 128 // 추격
const DOUBLE_POWER_IF_HIT = 185 // 리벤지·눈사태
const SP_ATK_DOWN_2_SELF = 204 // 오버히트·리프스톰
const RECOIL_THIRD = 198 // 돌진·플레어드라이브 계열
const RECOIL_BURN_HIT = 253 // 플레어드라이브
const RECOIL_PARALYZE_HIT = 262 // 볼트태클
const RECOIL_HALF = 269 // 양날박치기
const DEF_SPD_DOWN_HIT = 229 // 인파이트 — 맞히고 자기 방어·특방이 깎인다
const BIND_HIT = 42 // 조이기·불꽃소용돌이
const CHARGE_TURN_HIGH_CRIT = 39 // 칼바람
const CHARGE_TURN_HIGH_CRIT_FLINCH = 75 // 불새
const CHARGE_TURN_DEF_UP = 145 // 로케트박치기
const SKIP_CHARGE_TURN_IN_SUN = 151 // 솔라빔
const FLY = 155 // 공중날기
const DIG = 256 // 구멍파기
const DIVE = 255 // 다이빙
const DOUBLE_DAMAGE_DIG = 147 // 땅속에 숨은 상대에게 두 배
const GYRO_BALL = 219

/** EXPERT가 실제로 판단하는 효과 번호 전부. 적용률 측정이 이걸 쓴다 */
export const EXPERT_HANDLED: ReadonlySet<number> = new Set([
  EFFECT.HIGH_CRITICAL, EFFECT.BYPASS_ACCURACY, EFFECT.RECOVER_HALF_DAMAGE_DEALT,
  EFFECT.STATUS_CONFUSE, EFFECT.RECOIL_QUARTER, DEF_SPD_DOWN_HIT,
  RECOIL_THIRD, RECOIL_BURN_HIT, RECOIL_PARALYZE_HIT, RECOIL_HALF,
  EFFECT.STATUS_BADLY_POISON, EFFECT.STATUS_LEECH_SEED, EFFECT.STATUS_SLEEP,
  EFFECT.RECHARGE_AFTER, BRICK_BREAK_EFFECT, EFFECT.RESTORE_HALF_HP,
  EFFECT.HEAL_HALF_MORE_IN_SUN, EFFECT.HEAL_HALF_REMOVE_FLYING_TYPE,
  EFFECT.UNUSED_157, LOWER_SPEED_HIT, EFFECT.STATUS_PARALYZE, EFFECT.WEATHER_SUN,
  EFFECT.SET_LIGHT_SCREEN, EFFECT.SET_REFLECT, SWITCH_HIT, HIT_BEFORE_SWITCH,
  DOUBLE_POWER_IF_HIT, EFFECT.REST, SP_ATK_DOWN_2_SELF,
  EFFECT.ATK_UP, EFFECT.ATK_UP_2, EFFECT.DEF_UP, EFFECT.DEF_UP_2,
  EFFECT.SPEED_UP, EFFECT.SPEED_UP_2, EFFECT.SP_ATK_UP, EFFECT.SP_ATK_UP_2,
  EFFECT.SP_DEF_UP, EFFECT.SP_DEF_UP_2, EFFECT.EVA_UP, EFFECT.EVA_UP_2,
  EFFECT.EVA_UP_2_MINIMIZE, EFFECT.ATK_DOWN, EFFECT.ATK_DOWN_2,
  EFFECT.DEF_DOWN, EFFECT.DEF_DOWN_2, EFFECT.SPEED_DOWN, EFFECT.SPEED_DOWN_2,
  EFFECT.HALVE_DEFENSE, EFFECT.CURSE, EFFECT.ATK_SPD_UP, BIND_HIT,
  EFFECT.PREVENT_ESCAPE, EFFECT.PROTECT, EFFECT.ALWAYS_FLINCH_FIRST_TURN_ONLY,
  CHARGE_TURN_HIGH_CRIT, CHARGE_TURN_HIGH_CRIT_FLINCH, CHARGE_TURN_DEF_UP,
  SKIP_CHARGE_TURN_IN_SUN, FLY, DIG, DIVE, DOUBLE_DAMAGE_DIG, GYRO_BALL,
])
