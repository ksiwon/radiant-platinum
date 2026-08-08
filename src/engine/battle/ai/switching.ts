// 트레이너가 **바꿀지 말지** (PLAN §7.7)
//
// 점수 매기기(`score.ts`)가 "이 턴에 무엇으로 때릴까"라면 여기는 "지금 이 애로
// 계속 갈까"다. 원본은 `src/battle/trainer_ai/trainer_ai.c`의
// `TrainerAI_ShouldSwitch`와 `src/battle/battle_lib.c`의 `BattleAI_PostKOSwitchIn`이다.
//
// **이게 없으면 AI는 쓰러질 때까지 안 바꾸고, 쓰러진 뒤에는 아무나 내보낸다.**
// 실제로 그랬다 — 난천이 무쇠나이의 지진 앞에 전기 타입을 내보내고 있었다.
//
// ⚠️ **싱글만 옮겼다.** 원본은 더블·태그의 파트너 자리까지 보는데(`aiSlot2`,
// `BATTLER_PLAYER_2`) 우리는 싱글밖에 없다. 그리고 상대가 이번 턴에 무엇으로
// 때렸는지(`moveHit`)를 아직 안 들고 있어서, 그걸 보는 두 갈래
// (`AI_HasAbsorbAbilityInParty`, `AI_HasPartyMemberWithSuperEffectiveMove`)는
// 안 옮겼다. 옮긴 것과 안 옮긴 것을 섞어 쓰지 않게 여기 적어 둔다.
import type { AiMon, AiMove } from './context'
import { estimateDamage, isDamageScored } from './damage'
import { ABILITY } from './rom'
import { effectivenessOf, TYPE } from './typeChart'

/** 벤치에 앉아 있는 한 마리. AI가 교체 후보로 보는 만큼만 담는다 */
export interface BenchMon {
  /** `|request|`의 파티 칸 번호(1부터). 고른 뒤 그대로 명령이 된다 */
  index: number
  key: string
  /** 능력치·타입·특성. 나와 있지 않으므로 랭크는 전부 0이다 */
  mon: AiMon
  moves: readonly AiMove[]
}

export interface SwitchContext {
  self: AiMon
  foe: AiMon
  moves: readonly AiMove[]
  bench: readonly BenchMon[]
  weather: string | null
  random: () => number
}

/** 상대에게 효과가 굉장한 공격기를 갖고 있는가 */
function hasSuperEffective(moves: readonly AiMove[], foe: AiMon): boolean {
  return moves.some((m) => isDamageScored(m) && effectivenessOf(m.type, foe.types) >= 2)
}

/**
 * 상대에게 **조금이라도** 통하는 공격기를 갖고 있는가.
 *
 * 원본은 `MOVE_STATUS_INEFFECTIVE`(타입 무효)만 본다 — 반감은 통하는 것이다
 */
function canDamage(moves: readonly AiMove[], foe: AiMon): boolean {
  return moves.some((m) => isDamageScored(m) && effectivenessOf(m.type, foe.types) > 0)
}

/**
 * 상대를 아예 못 때리는가 (`AI_OnlyIneffectiveMoves`).
 *
 * **공격기가 둘 이상이어야 한다.** 하나뿐인데 그게 안 통한다고 바꾸면, 변화기만
 * 들고 나온 애가 매 턴 도망 다닌다 — 원본의 `numMoves < 2`가 그 자리다
 */
function onlyIneffective(ctx: SwitchContext): boolean {
  const attacks = ctx.moves.filter(isDamageScored)
  if (attacks.length < 2) return false
  if (canDamage(attacks, ctx.foe)) return false
  // 벤치에 통하는 애가 있어야 바꿀 값어치가 있다
  return ctx.bench.some((b) => canDamage(b.moves, ctx.foe))
}

/** 원더가드 앞에서 아무것도 못 하는가 (`AI_CannotDamageWonderGuard`) */
function stoppedByWonderGuard(ctx: SwitchContext): boolean {
  if (ctx.foe.ability !== ABILITY.WONDER_GUARD) return false
  if (hasSuperEffective(ctx.moves, ctx.foe)) return false
  // 66%로 바꾼다 — 원본 주석 그대로다
  if (!ctx.bench.some((b) => hasSuperEffective(b.moves, ctx.foe))) return false
  return ctx.random() < 2 / 3
}

/** 랭크가 넷 넘게 올라 있는가 (`AI_IsHeavilyStatBoosted`). 그러면 안 바꾼다 */
function heavilyBoosted(mon: AiMon): boolean {
  let n = 0
  for (const v of Object.values(mon.boosts)) if (v > 0) n += v
  return n >= 4
}

/** 그림자밟기·개미지옥·자석끌기에 잡혀 있는가. 잡혀 있으면 바꿀 수가 없다 */
function trapped(ctx: SwitchContext): boolean {
  if (ctx.self.volatiles.has('trapped') || ctx.self.volatiles.has('partiallytrapped')) return true
  if (ctx.self.volatiles.has('ingrain')) return true
  const a = ctx.foe.ability
  if (a === ABILITY.SHADOW_TAG || a === ABILITY.ARENA_TRAP) return true
  return a === ABILITY.MAGNET_PULL && ctx.self.types.includes(TYPE.STEEL)
}

/**
 * 지금 바꿀 것인가 (`TrainerAI_ShouldSwitch`).
 *
 * 순서가 곧 우선순위다. 원본과 같은 차례로 묻는다
 */
export function shouldSwitch(ctx: SwitchContext): boolean {
  if (ctx.bench.length === 0) return false
  if (trapped(ctx)) return false

  // 다음 턴에 멸망의노래로 쓰러진다
  if (ctx.self.volatiles.has('perish1') || ctx.self.volatiles.has('perish0')) return true
  if (stoppedByWonderGuard(ctx)) return true
  if (onlyIneffective(ctx)) return true
  // 자다가 깨면 낫는다 — 나와 있는 동안은 못 낫는다
  if (ctx.self.status === 'slp' && ctx.self.ability === ABILITY.NATURAL_CURE) return true

  // 효과가 굉장한 기술이 있으면 안 바꾼다. 다만 기술마다 10%로 이 판단을 흘린다
  for (const m of ctx.moves) {
    if (!isDamageScored(m) || effectivenessOf(m.type, ctx.foe.types) < 2) continue
    if (Math.floor(ctx.random() * 10) !== 0) return false
  }
  if (heavilyBoosted(ctx.self)) return false

  return false
}

/**
 * 쓰러진 뒤 누구를 내보낼까 (`BattleAI_PostKOSwitchIn`).
 *
 * 두 걸음이다.
 *
 * **첫째, 몸으로 재는 상성.** 자기 타입 둘이 상대 타입 둘에게 몇 배인지 더한다 —
 * 기술이 아니라 **제 타입**이다. 그렇게 뽑힌 애가 상대에게 효과가 굉장한 기술을
 * 실제로 갖고 있으면 그 애를 내보낸다. 없으면 후보에서 빼고 다시 뽑는다.
 *
 * **둘째, 아무도 못 뽑히면 데미지로 재서** 제일 세게 때릴 수 있는 애를 낸다.
 *
 * ⚠️ 원본은 이 점수를 `u8`에 담아서 320이 64로 접힌다(디컴프가 버그로 표시해
 * 뒀다). 여기서는 안 접는다 — 접으면 4배 상성을 가진 애가 뒤로 밀린다
 */
export function postKoSwitchIn(
  bench: readonly BenchMon[],
  foe: AiMon,
  weather: string | null,
): BenchMon | null {
  if (bench.length === 0) return null

  const skip = new Set<string>()
  for (;;) {
    let best: BenchMon | null = null
    let top = 0
    for (const b of bench) {
      if (skip.has(b.key)) continue
      // 40이 등배다. `BattleSystem_TypeMatchupMultiplier`가 40에서 시작한다
      let score = 0
      for (const t of b.mon.types) score += 40 * effectivenessOf(t, foe.types)
      if (score > top) { top = score; best = b }
    }
    if (!best) break
    if (hasSuperEffective(best.moves, foe)) return best
    skip.add(best.key)
  }

  let best: BenchMon | null = null
  let top = -1
  for (const b of bench) {
    const hit = Math.max(0, ...b.moves.map((m) => estimateDamage(m, b.mon, foe, weather, 100)))
    if (hit > top) { top = hit; best = b }
  }
  return best
}
