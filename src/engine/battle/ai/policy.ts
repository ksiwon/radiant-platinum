// 트레이너 정책 (PLAN §7.7) — 롬의 AI 바이트 하나가 여기서 행동이 된다.
//
// `BattleController`가 상대 차례마다 이걸 부른다. 점수 매기기는 `score.ts`가 하고,
// 여기서는 **무엇을 점수 매길 수 있는지**를 가른다:
//
//   - 기술을 고를 수 있는 턴이면 → 점수를 매겨 가장 높은 것
//   - 쓰러져서 교체만 골라야 하면 → 다음 마리 고르기
//
// "이 판이 불리하니 교체하자"는 판단(`TrainerAI_ShouldSwitch`)은 `ai/switching`에
// 있고 `sim/brain`이 `wantsSwitch`·`chooseSwitch`로 물려 준다. **여기는 그 둘을
// 안 주면 안 바꾼다** — 시험이 기술 고르기만 보려고 부를 때가 그 자리다.
import type { BattleAction } from '../choice'
import { legalActions } from '../choice'
import type { BattleRequest } from '../events'
import type { AiMove, AiTurn } from './context'
import { scoreExpert } from './expert'
import { pickBest, scoreMoves } from './score'

/**
 * 판마다 바뀌는 값. 컨트롤러가 매번 새로 만들어 넣는다.
 *
 * 담긴 `moves`는 `AiTurn.moves`와 달리 **요청에 실제로 담긴 순서**여야 한다 —
 * 골라 낸 뒤 `slot`(과 더블이면 `target`)을 그대로 명령으로 보내기 때문이다.
 *
 * ⚠️ **여러 벌이 온다.** 더블에서 원작은 겨눌 수 있는 자리마다 점수를 따로
 * 매긴다(`TrainerAI_MainDoubles`가 `AI_CONTEXT.defender`를 바꿔 가며 돈다).
 * 그래서 「상대 A를 겨눈 네 칸」과 「상대 B를 겨눈 네 칸」이 각각 한 벌이고,
 * 고르는 것은 그 전부를 한 줄로 세운 뒤의 최고점이다. 싱글은 늘 한 벌이다
 */
type TurnBuilder = (request: BattleRequest, at: number) => AiTurn[]

/** 교체할 때 다음 마리를 고르는 것. 안 주면 첫 번째 후보 */
type SwitchChooser = (options: BattleAction[], request: BattleRequest, at: number) => BattleAction

interface PolicyOptions {
  /** 트레이너 데이터의 AI 비트 (`trainers.json`의 `ai`) */
  flags: number
  build: TurnBuilder
  random: () => number
  chooseSwitch?: SwitchChooser
  /**
   * 후보를 뽑는 함수. 안 주면 `legalActions` 그대로.
   *
   * 상대 팀에도 **빈 턴 칸**이 붙어 있다(도구를 쓰는 턴에 기술을 안 쓰려고).
   * AI가 그 칸을 고르면 물장구만 치므로 부르는 쪽이 빼고 넘긴다
   */
  list?: (request: BattleRequest, at: number) => BattleAction[]
  /**
   * 쓰러지기 전에 스스로 바꿀 것인가 (`TrainerAI_ShouldSwitch`).
   *
   * 안 주면 안 바꾼다 — 쓰러질 때까지 버틴다
   */
  wantsSwitch?: (request: BattleRequest, at: number) => boolean
}

/**
 * 점수가 가장 높은 기술을 고른다. 점수를 못 매기면 무작위로 떨어진다.
 *
 * 못 매기는 경우는 둘이다: 교체만 골라야 하는 턴이거나, 요청의 기술 칸을 우리
 * 데이터로 못 푼 경우. 둘 다 아무것도 안 보내는 것보다는 아무거나 보내는 게 낫다 —
 * 안 보내면 배틀이 그 자리에서 멈춘다
 */
export function trainerPolicy(options: PolicyOptions) {
  const { flags, build, random } = options
  const chooseSwitch = options.chooseSwitch
    ?? ((opts: BattleAction[]) => opts[Math.floor(random() * opts.length)] ?? opts[0]!)
  const list = options.list ?? ((r: BattleRequest) => legalActions(r))

  return (request: BattleRequest, at = 0): BattleAction | null => {
    const actions = list(request, at)
    if (!actions.length) return null

    const moves = actions.filter((a): a is Extract<BattleAction, { type: 'move' }> =>
      a.type === 'move')
    if (!moves.length) return chooseSwitch(actions, request, at)

    // 쓰러지기 전에 물러설 것인가. 원작은 기술 점수를 매기기 **전에** 이걸 묻는다
    // (`TrainerAI_PickCommand`가 `ShouldSwitch`를 맨 앞에 둔다)
    const bench = actions.filter((a) => a.type === 'switch')
    if (bench.length > 0 && options.wantsSwitch?.(request, at) === true) {
      return chooseSwitch(bench, request, at)
    }

    const turns = build(request, at)
    if (turns.length > 0 && turns.every((t) => t.doubles !== undefined)) {
      return pickDoubles(turns, moves, flags, random)
    }
    // 한 벌이라도 어긋나면 점수를 못 매긴다 — 아무것도 안 보내는 것보다는 낫다
    const counted = turns.reduce((n, t) => n + t.moves.length, 0)
    if (turns.length === 0 || counted !== moves.length) {
      return moves[Math.floor(random() * moves.length)] ?? moves[0]!
    }

    const scored = turns.flatMap((turn) => scoreMoves(turn, flags, scoreExpert))
    const best = pickBest(scored, random)
    if (!best) return moves[0]!
    // `AiMove.slot`은 요청의 칸 번호이고 `target`은 겨눈 자리다. 둘로 되찾는다 —
    // 더블에서 칸 번호만 보면 상대 A를 겨눈 후보가 늘 먼저 걸린다
    return moves.find((m) => m.slot === best.slot && m.target === best.target)
      ?? moves.find((m) => m.slot === best.slot)
      ?? moves[0]!
  }
}

type MoveAction = Extract<BattleAction, { type: 'move' }>

/** 짝을 겨눈 벌의 최고점이 이보다 낮으면 그 벌은 −1로 친다 (`TrainerAI_MainDoubles` 431) */
const ALLY_FLOOR = 100

/**
 * 더블의 고르기 (`TrainerAI_MainDoubles` · `trainer_ai.c` 356).
 *
 * 겨눌 자리마다 한 벌이다(상대 둘과 짝). 원작의 차례 그대로 두 번 뽑는다:
 *
 *   1. 벌마다 최고점 칸들 중 **하나를 무작위로** 고르고 그 벌의 점수로 삼는다.
 *      짝을 겨눈 벌의 최고점이 100 미만이면 −1로 내린다 — 「짝에게는 쓸 이유가
 *      없으면 안 쓴다」가 이 한 줄이다
 *   2. 벌들의 점수 중 최고인 것들에서 **다시 무작위로** 겨눌 자리를 고른다
 *
 * ⚠️ **(칸, 자리) 쌍을 한 줄로 세워 뽑는 것과 다르다.** 동점 칸 수가 벌마다 다르면
 * 자리마다 뽑힐 몫이 달라진다 — 원작은 자리를 먼저 공평하게 고른다.
 *
 * 고른 (칸, 자리)를 명령으로 되돌리는 법:
 *
 *   · 그 칸에 그 자리를 겨누는 후보가 있으면 그것 (단일 대상 기술)
 *   · 없으면 그 칸의 후보 아무거나 (전체기·자기 자신 — 대상을 안 찍는다. 도우미처럼
 *     짝만 찍는 기술은 상대를 겨눈 벌에서 골라도 짝에게 간다. 원작도 쏠 때 사거리로
 *     대상을 다시 잡는다)
 *   · ⚠️ **지압(`RANGE_USER_OR_ALLY`)은 고른 자리가 플레이어 쪽이면 자기 자신이다**
 *     (`trainer_ai.c` 462 — `GetBattlerSide(target) == 0`). 그래서 우리 편 AI는 지압을
 *     플레이어에게 못 쓴다 — 원작 그대로다
 */
function pickDoubles(
  turns: readonly AiTurn[], moves: readonly MoveAction[], flags: number, random: () => number,
): BattleAction {
  const perTarget = turns.map((turn) => {
    const scored = scoreMoves(turn, flags, scoreExpert)
    let max = -Infinity
    for (const s of scored) max = Math.max(max, s.score)
    const tied = scored.filter((s) => s.score === max)
    const pick = tied[Math.floor(random() * tied.length)] ?? tied[0]
    const score = turn.doubles!.targetIsAlly && max < ALLY_FLOOR ? -1 : max
    return { turn, move: pick?.move ?? null, score }
  })
  let best = -Infinity
  for (const p of perTarget) best = Math.max(best, p.score)
  const top = perTarget.filter((p) => p.score === best && p.move !== null)
  const chosen = top[Math.floor(random() * top.length)] ?? top[0]
  if (!chosen?.move) return moves[0]!
  const slot = chosen.move.slot
  const target = chosen.turn.doubles!.target
  const same = moves.filter((m) => m.slot === slot)
  // 지압 — 자기 자신을 겨누는 후보가 있으면 사거리가 「나 또는 짝」이다
  const selfTarget = moves[0]?.at === 1 ? -2 : -1
  const self = same.find((m) => m.target === selfTarget)
  if (self && chosen.turn.doubles!.defenderOnPlayerSide) return self
  return same.find((m) => m.target === target)
    ?? same.find((m) => m.target === undefined)
    ?? same[0]
    ?? moves[0]!
}

/** 점수를 밖에서 들여다볼 때 쓴다. 테스트와 디버깅용이다 */
export function explain(turn: AiTurn, flags: number): { move: AiMove; score: number }[] {
  return scoreMoves(turn, flags, scoreExpert)
}
