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
 * `moves`는 `AiTurn.moves`와 달리 **요청에 실제로 담긴 순서**여야 한다 —
 * 골라 낸 뒤 `slot`을 그대로 명령으로 보내기 때문이다
 */
type TurnBuilder = (request: BattleRequest) => AiTurn | null

/** 교체할 때 다음 마리를 고르는 것. 안 주면 첫 번째 후보 */
type SwitchChooser = (options: BattleAction[], request: BattleRequest) => BattleAction

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
  list?: (request: BattleRequest) => BattleAction[]
  /**
   * 쓰러지기 전에 스스로 바꿀 것인가 (`TrainerAI_ShouldSwitch`).
   *
   * 안 주면 안 바꾼다 — 쓰러질 때까지 버틴다
   */
  wantsSwitch?: (request: BattleRequest) => boolean
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

  return (request: BattleRequest): BattleAction | null => {
    const actions = list(request)
    if (!actions.length) return null

    const moves = actions.filter((a): a is Extract<BattleAction, { type: 'move' }> =>
      a.type === 'move')
    if (!moves.length) return chooseSwitch(actions, request)

    // 쓰러지기 전에 물러설 것인가. 원작은 기술 점수를 매기기 **전에** 이걸 묻는다
    // (`TrainerAI_PickCommand`가 `ShouldSwitch`를 맨 앞에 둔다)
    const bench = actions.filter((a) => a.type === 'switch')
    if (bench.length > 0 && options.wantsSwitch?.(request) === true) {
      return chooseSwitch(bench, request)
    }

    const turn = build(request)
    if (!turn || turn.moves.length !== moves.length) {
      return moves[Math.floor(random() * moves.length)] ?? moves[0]!
    }

    const scored = scoreMoves(turn, flags, scoreExpert)
    const best = pickBest(scored, random)
    if (!best) return moves[0]!
    // `AiMove.slot`은 요청의 칸 번호다. 같은 번호를 가진 행동을 되찾는다
    return moves.find((m) => m.slot === best.slot) ?? moves[0]!
  }
}

/** 점수를 밖에서 들여다볼 때 쓴다. 테스트와 디버깅용이다 */
export function explain(turn: AiTurn, flags: number): { move: AiMove; score: number }[] {
  return scoreMoves(turn, flags, scoreExpert)
}
