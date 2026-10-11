// AI_FLAG_EXPERT — 기술별 세부 판단 (PLAN §7.7)
//
// 플래티넘 트레이너 928명 중 289명이 이 플래그를 갖고 있다. 관장·사천왕·라이벌은
// 전부 여기 들어간다.
//
// 분기표(`Expert_Main` 1623)의 효과 177개를 **전부** 옮겼다 — 앞쪽 절반(능력 올리기·깎기, 회복,
// 날씨, 벽, 방어, 유턴 …)은 이 파일에, 나머지 74개는 `expertMore.ts`에 있다.
// `sim/brain.test.ts`가 928명의 실제 파티를 훑어 적용률을 재고(실측 51.8% · 1,555/3,004 =
// 분기표가 닿는 범위 전부), 그 값이 떨어지면 실패한다. 분기표에 없는 효과(공격기 대부분)는
// 원작도 점수를 안 건드린다.
//
// 옮긴 것이 **실제로 이기는 수를 고르는가**는 다른 질문이고 `ai/strength.test.ts`가
// 잰다 — 난천의 편성끼리 붙여 무작위·탐욕 상대로 40판씩.
//
// 원작 주석의 확률(`~80.5%` 등)은 문턱값 `n/256`을 사람이 읽기 좋게 옮긴 것이다.
// 여기서는 문턱값을 그대로 쓴다 — 확률을 다시 적으면 반올림이 끼어든다.
import type { AiMon, AiMove, AiTurn } from './context'
import { hpPercent, knownMoves } from './context'
import { isDamageScored } from './damage'
import { ABILITY, EFFECT } from './rom'
import { TYPE } from './typeChart'
import {
  eff, foeKnowsEffect, foeLastPower, hasSuperEffective, isFaster, isSlower, knowsEffect, lastClass, resisted, skip, statusConfuse,
} from './expertKit'
import { AB, E, IT } from './expertIds'
import { chargeWithInvuln, MORE_HANDLED, scoreExpertMore, synthesisWeather } from './expertMore'

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
  // ⚠️ +5·−5 이상이면 +1을 얹고 **아래 +3·−3 갈래의 굴림까지 흘러내린다** (`Expert_BypassAccuracyMove` 2253)
  const strong = turn.foe.boosts.evasion > 4 || turn.self.boosts.accuracy < -4
  if (strong || turn.foe.boosts.evasion > 2 || turn.self.boosts.accuracy < -2) {
    return (strong ? 1 : 0) + (skip(turn.random, 100) ? 0 : 1)
  }
  return 0
}

/** 흡수 기술. 반감당하면 회복량도 같이 줄어든다 */
function drainMove(turn: AiTurn, move: AiMove): number {
  if (!resisted(move, turn.foe)) return 0
  return skip(turn.random, 50) ? 0 : -3
}

/** 반동 기술 (`Expert_RecoilMove` 6286). 돌머리·매직가드면 반동이 없으니 값어치가 오른다 */
function recoilMove(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return 0
  return turn.self.ability === AB.ROCK_HEAD || turn.self.ability === ABILITY.MAGIC_GUARD ? 1 : 0
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
  if (knownMoves(turn).some(isDamageScored)) {
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
  // 게으름이면 쉬는 턴이 어차피 오니 쓸 만하다 (`Expert_RechargeTurn` 3041)
  if (turn.self.ability === ABILITY.TRUANT) return skip(turn.random, 80) ? 0 : 1
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
  // 상대가 가로챔을 알면 먼저 56%로 건너뛴다 (`Expert_Recovery_CheckForSnatch` 2238)
  if (foeKnowsEffect(turn, E.STEAL_STATUS_MOVE) && skip(turn.random, 100)) return 0
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
  if (turn.self.ability === ABILITY.FLOWER_GIFT) return 1
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
  if (lastClass(turn) === want && !skip(turn.random, 64)) delta += 1
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
  // 후발 중에 더 센 마리가 없으면 75%로 −2를 얹고 끝낸다. 판 밖(시험)에서는 있다고 친다
  if (!(turn.partyDealsMore?.() ?? true) && !skip(turn.random, 64)) return delta - 2

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

  if (isFaster(turn)) return delta + 1
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
  // 상대가 가로챔을 알면 먼저 20%로 건너뛴다 (`Expert_Rest_CheckForSnatch` 2755)
  if (foeKnowsEffect(turn, E.STEAL_STATUS_MOVE) && skip(turn.random, 50)) return 0
  return skip(turn.random, 10) ? 0 : 3
}

/** 오버히트처럼 자기 특공을 깎는 기술 */
function overheat(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -1
  const hp = hpPercent(turn.self)
  return isSlower(turn) ? (hp > 80 ? 0 : -1) : (hp > 60 ? 0 : -1)
}

/**
 * 능력을 올리는 변화기의 공통 앞머리 — 이미 +3 이상이면 ~60.9%로 −1, 아니면 체력이
 * 가득일 때 50%로 +2 (`Expert_Status{Attack,SpAttack,Defense,SpDefense}Up` 첫 석 줄)
 */
function raiseHead(turn: AiTurn, stat: keyof AiMon['boosts']): number {
  if (turn.self.boosts[stat] >= 3) return skip(turn.random, 100) ? 0 : -1
  return hpPercent(turn.self) === 100 && !skip(turn.random, 128) ? 2 : 0
}

/**
 * 공격·특공 올리기 (`Expert_StatusAttackUp` 1975 · `StatusSpAttackUp` 2075). 체력 70% 초과면
 * 끝, 40% 미만이면 −2, 그 사이는 문턱 `n` 밖이면 −2 (공격 40 · 특공 70)
 */
function attackRaise(turn: AiTurn, stat: 'atk' | 'spa'): number {
  const delta = raiseHead(turn, stat)
  const hp = hpPercent(turn.self)
  if (hp > 70) return delta
  if (hp < 40) return delta - 2
  return skip(turn.random, stat === 'atk' ? 40 : 70) ? delta : delta - 2
}

/**
 * 방어·특방 올리기 (`Expert_StatusDefenseUp` 2006 · `StatusSpDefenseUp` 2109). 체력 70% 이상이면
 * 78%로 끝, 40% 미만이면 −2. 그 사이는 상대가 **직전에 쓴 기술**을 본다 — 위력이 없었으면
 * (없음·변화기) 60/256만 넘기고, 방어는 특수기 · 특방은 물리기를 맞았으면 곧장 −2,
 * 그 밖에는 60/256만 넘긴다
 */
function defenseRaise(turn: AiTurn, stat: 'def' | 'spd'): number {
  let delta = raiseHead(turn, stat)
  const hp = hpPercent(turn.self)
  if (hp >= 70 && skip(turn.random, 200)) return delta
  if (hp >= 40) {
    if (foeLastPower(turn) === 0) {
      if (skip(turn.random, 60)) return delta
    } else if (lastClass(turn) !== (stat === 'def' ? 'special' : 'physical') && skip(turn.random, 60)) {
      return delta
    }
  }
  delta -= 2
  return delta
}

/** 스피드 올리기 (`Expert_StatusSpeedUp` 2057) — 내가 더 빠르면 −3, 느리면 ~72.7%로 +3 */
function speedRaise(turn: AiTurn): number {
  if (!isSlower(turn)) return -3
  return skip(turn.random, 70) ? 0 : 3
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
  const slowIsGood = knownMoves(turn).some((m) => m.effect === EFFECT.TRICK_ROOM || m.effect === 219)
  // 두 굴림이 **따로** 쌓인다 (`Expert_Curse_HighChanceScorePlus1` 3465 → `FlipCoinScorePlus1`)
  if (slowIsGood && !skip(turn.random, 32)) delta += 1
  if (!skip(turn.random, 128)) delta += 1
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
 * 모으는 턴이 있는 기술 중 **안 맞는 턴이 없는 것** (`Expert_ChargeTurnNoInvuln` 3930) —
 * 칼바람·불새·로케트박치기·솔라빔. 하늘·땅속·물속은 `expertMore.chargeWithInvuln`이다
 */
function chargeTurn(turn: AiTurn, move: AiMove): number {
  if (resisted(move, turn.foe)) return -2
  // 솔라빔은 맑은하늘이면 모으기가 없어진다
  if (move.effect === SKIP_CHARGE_TURN_IN_SUN && turn.weather === 'SunnyDay') return 2
  if (turn.self.heldItem === IT.POWER_HERB) return 2
  if (foeKnowsProtect(turn)) return -2
  return hpPercent(turn.self) > 38 ? 0 : -1
}

/**
 * 방어·판별.
 *
 * **연속으로 쓴 횟수가 핵심이다.** 두 번 넘게 이어 쓰면 -2로 잘라 낸다 —
 * 이게 없으면 AI가 방어만 쓰다 배틀이 안 끝난다
 */
function protect(turn: AiTurn): number {
  const { self, foe, random } = turn
  let delta = 0
  // 상대가 페인트·그림자꿈을 알면 방어가 뚫린다 (`Expert_Protect` 3499)
  if ((turn.foeKnownMoves.has(MOVE_FEINT) || turn.foeKnownMoves.has(MOVE_SHADOW_FORCE))
    && !skip(random, 128)) {
    delta -= 2
  }
  if (turn.protectChain > 1) return delta - 2
  const suffering = (m: AiMon): boolean => m.status === 'tox' || m.volatiles.has('curse')
    || [...m.volatiles].some((v) => v.startsWith('perish')) || m.volatiles.has('attract')
    || m.volatiles.has('leechseed') || m.volatiles.has('yawn')
  // 록온을 당한 판은 방어가 소용없지만 감점도 없다. 우리 sim의 뷰에는 그 표지가 안 올라와서
  // 상대 쪽 `lockon`만 본다 — 안 보이면 걸려 있지 않은 것으로 읽는다
  const lockedOnto = foe.volatiles.has('lockon')
  if (suffering(self) || foeKnowsEffect(turn, E.RESTORE_HALF_HP)
    || foeKnowsEffect(turn, E.DEF_UP_DOUBLE_ROLLOUT_POWER)) {
    return lockedOnto ? delta : delta - 2
  }
  if (suffering(foe) || turn.doubles !== undefined || lockedOnto || skip(random, 85)) delta += 2
  if (!skip(random, 128)) delta -= 1
  if (turn.protectChain === 0) return delta
  delta -= 1
  return skip(random, 128) ? delta : delta - 1
}

const MOVE_FEINT = 364
const MOVE_SHADOW_FORCE = 467
const MOVE_PROTECT = 182
const MOVE_DETECT = 197

/** 상대가 방어 효과의 기술을 써 보였는가 (`IfMoveEffectKnown AI_BATTLER_DEFENDER … PROTECT`) */
function foeKnowsProtect(turn: AiTurn): boolean {
  return turn.foeKnownEffects?.has(E.PROTECT)
    ?? (turn.foeKnownMoves.has(MOVE_PROTECT) || turn.foeKnownMoves.has(MOVE_DETECT))
}

/**
 * 공격·특공 깎기 (`Expert_StatusAttackDown` 2274 · `StatusSpAttackDown` 2365). 상대 단계가
 * ±0이 아니면 −1, 내 체력이 90% 이하면 −1 더, 상대가 −3 이하면 ~80.5%로 −2.
 * 상대 체력 70% 이하면 −2, 직전에 쓴 기술이 (공격은 특수 · 특공은 물리)면 50%로 −2
 */
function attackLower(turn: AiTurn, stat: 'atk' | 'spa'): number {
  let delta = 0
  if (turn.foe.boosts[stat] !== 0) {
    delta -= 1
    if (hpPercent(turn.self) <= 90) delta -= 1
    if (turn.foe.boosts[stat] <= -3 && !skip(turn.random, 50)) delta -= 2
  }
  if (hpPercent(turn.foe) <= 70) delta -= 2
  const want = stat === 'atk' ? 'special' : 'physical'
  if (lastClass(turn) === want && !skip(turn.random, 128)) delta -= 2
  return delta
}

/**
 * 방어·특방·회피 깎기 (`Expert_StatusDefenseDown` 2315 · `StatusSpDefenseDown` 2408 ·
 * `StatusEvasionDown` 2497 — 셋이 같다). 내 체력이 70% 미만이거나 상대가 −3 이하면
 * ~80.5%로 −2, 상대 체력 70% 이하면 −2
 */
function defenseLower(turn: AiTurn, stat: 'def' | 'spd' | 'evasion'): number {
  let delta = 0
  if (hpPercent(turn.self) < 70 || turn.foe.boosts[stat] <= -3) {
    if (!skip(turn.random, 50)) delta -= 2
  }
  if (hpPercent(turn.foe) <= 70) delta -= 2
  return delta
}

/**
 * 명중 깎기 (`Expert_StatusAccuracyDown` 2428). 독독·씨뿌리기·저주로 깎아 두었으면 +2,
 * 뿌리박기·아쿠아링이면 50%로 +1. 체력이 바닥이면 −
 */
function accuracyLower(turn: AiTurn): number {
  const { random, self, foe } = turn
  let delta = 0
  const mine = hpPercent(self)
  const theirs = hpPercent(foe)
  if ((mine < 70 || theirs <= 70) && !skip(random, 100)) delta -= 1
  if (self.boosts.accuracy <= -2 && !skip(random, 80)) delta -= 2
  if (foe.status === 'tox' && !skip(random, 70)) delta += 2
  if (foe.volatiles.has('leechseed') && !skip(random, 70)) delta += 2
  if ((self.volatiles.has('ingrain') || self.volatiles.has('aquaring')) && !skip(random, 128)) delta += 1
  if (foe.volatiles.has('curse') && !skip(random, 70)) delta += 2
  if (mine > 70 || foe.boosts.accuracy === 0) return delta
  if (mine < 40 || theirs < 40) return delta - 2
  return skip(random, 70) ? delta : delta - 2
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
    case E.HIGH_CRITICAL_BURN_HIT:
    case E.HIGH_CRITICAL_POISON_HIT:
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
    case EFFECT.HEAL_HALF_REMOVE_FLYING_TYPE:
    case EFFECT.UNUSED_157:
    case E.SWALLOW:
      return recovery(turn)
    // 광합성류는 회복기에 날씨 감점이 얹힌다 (`Expert_Synthesis` 2625 — 마지막 줄이 `Expert_Recovery`로 흘러든다)
    case EFFECT.HEAL_HALF_MORE_IN_SUN:
    case E.UNUSED_133:
    case E.UNUSED_134:
      return synthesisWeather(turn) + recovery(turn)
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
      return attackRaise(turn, 'atk')
    case EFFECT.DEF_UP: case EFFECT.DEF_UP_2: case EFFECT.ATK_DEF_UP:
      return defenseRaise(turn, 'def')
    case EFFECT.SPEED_UP: case EFFECT.SPEED_UP_2:
      return speedRaise(turn)
    case EFFECT.SP_ATK_UP: case EFFECT.SP_ATK_UP_2:
      return attackRaise(turn, 'spa')
    // 명상(특공·특방)과 철벽류(방어·특방)도 원작은 특방 루틴으로 보낸다
    case EFFECT.SP_DEF_UP: case EFFECT.SP_DEF_UP_2:
    case EFFECT.SP_ATK_SP_DEF_UP: case EFFECT.DEF_SPD_UP:
      return defenseRaise(turn, 'spd')
    case EFFECT.EVA_UP: case EFFECT.EVA_UP_2: case EFFECT.EVA_UP_2_MINIMIZE:
      return statusEvasionUp(turn)

    case EFFECT.ATK_DOWN: case EFFECT.ATK_DOWN_2:
      return attackLower(turn, 'atk')
    case EFFECT.SP_ATK_DOWN: case EFFECT.SP_ATK_DOWN_2:
      return attackLower(turn, 'spa')
    case EFFECT.DEF_DOWN: case EFFECT.DEF_DOWN_2: case EFFECT.ATK_DEF_DOWN:
      return defenseLower(turn, 'def')
    case EFFECT.SP_DEF_DOWN: case EFFECT.SP_DEF_DOWN_2:
      return defenseLower(turn, 'spd')
    case EFFECT.EVA_DOWN: case EFFECT.ACC_DOWN_2:
      // ⚠️ 원작은 회피 깎기(63)와 명중 깎기(64)의 루틴을 서로 바꿔 달았다 (1675~1676)
      return defenseLower(turn, 'evasion')
    case EFFECT.ACC_DOWN: case EFFECT.EVA_DOWN_2:
      return accuracyLower(turn)
    case EFFECT.SPEED_DOWN: case EFFECT.SPEED_DOWN_2:
      return statusSpeedDown(turn)

    case EFFECT.HALVE_DEFENSE:
    case E.FAINT_AND_ATK_SP_ATK_DOWN_2:
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
      return chargeTurn(turn, move)
    case FLY: case DIG: case DIVE:
      return chargeWithInvuln(turn, move, false)
    // 자이로볼은 원작에서도 점수를 안 건드린다. 그래도 분기표에는 있다
    case GYRO_BALL:
      return 0

    default:
      return scoreExpertMore(turn, move) ?? 0
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
const GYRO_BALL = 219

/** EXPERT가 실제로 판단하는 효과 번호 전부. 적용률 측정이 이걸 쓴다 */
export const EXPERT_HANDLED: ReadonlySet<number> = new Set([
  ...MORE_HANDLED, E.SWALLOW, E.UNUSED_133, E.UNUSED_134, E.FAINT_AND_ATK_SP_ATK_DOWN_2,
  E.HIGH_CRITICAL_BURN_HIT, E.HIGH_CRITICAL_POISON_HIT,
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
  EFFECT.EVA_UP_2_MINIMIZE, EFFECT.ATK_DOWN, EFFECT.ATK_DOWN_2, EFFECT.SP_ATK_DOWN, EFFECT.SP_ATK_DOWN_2,
  EFFECT.SP_DEF_DOWN, EFFECT.SP_DEF_DOWN_2, EFFECT.ACC_DOWN, EFFECT.ACC_DOWN_2,
  EFFECT.EVA_DOWN, EFFECT.EVA_DOWN_2, EFFECT.ATK_DEF_DOWN, EFFECT.DEF_SPD_UP,
  EFFECT.ATK_DEF_UP, EFFECT.SP_ATK_SP_DEF_UP,
  EFFECT.DEF_DOWN, EFFECT.DEF_DOWN_2, EFFECT.SPEED_DOWN, EFFECT.SPEED_DOWN_2,
  EFFECT.HALVE_DEFENSE, EFFECT.CURSE, EFFECT.ATK_SPD_UP, BIND_HIT,
  EFFECT.PREVENT_ESCAPE, EFFECT.PROTECT, EFFECT.ALWAYS_FLINCH_FIRST_TURN_ONLY,
  CHARGE_TURN_HIGH_CRIT, CHARGE_TURN_HIGH_CRIT_FLINCH, CHARGE_TURN_DEF_UP,
  SKIP_CHARGE_TURN_IN_SUN, FLY, DIG, DIVE, GYRO_BALL,
])
