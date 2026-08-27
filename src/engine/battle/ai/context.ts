// AI가 아는 것 (PLAN §7.7)
//
// 원작 AI는 배틀 구조체를 통째로 들여다본다 — 상대의 실능력치까지 안다. 다만
// **모르는 것도 정해져 있다**: 상대의 특성은 드러나기 전까지 두 후보 중 하나를
// 동전 던져 찍고, 상대의 기술은 한 번 본 것만 안다.
//
// 그 경계를 여기서 못박는다. 정책 함수는 이 구조체 밖을 안 본다.
import type { Stats } from '../../../data/schema'
import type { Gender, Status } from '../../pokemon/instance'
import type { Boosts } from '../view'

/** 배틀에 나와 있는 한 마리를 AI가 보는 모습 */
export interface AiMon {
  species: number
  /** 롬 타입 번호 둘. 단일 타입은 같은 값이 두 번 온다 */
  types: readonly number[]
  level: number
  hp: number
  maxHp: number
  status: Status
  boosts: Boosts
  /**
   * AI가 **믿고 있는** 특성. 자기 것은 진짜고, 상대 것은 드러났으면 진짜,
   * 아니면 종족의 두 후보 중 찍은 값이다
   */
  ability: number
  /** 랭크 보정 전 실능력치 */
  stats: Stats
  heldItem: number
  /**
   * 그 도구의 홀드 효과 번호와 값 (`items.json`의 `holdEffect`·`effectParam`).
   *
   * ⚠️ **`ai/`는 표를 안 읽는다.** 표를 읽는 쪽(`sim/brain`)이 값을 채워 넘긴다 —
   * 그 성질이 이 묶음의 시험을 판 없이 돌게 하는 것이라 깨면 안 된다
   */
  itemEffect: number
  itemParam: number
  /**
   * 지닌 열매의 자연의은혜 위력과 타입. 열매가 아니면 0과 −1이다
   * (`ITEM_PARAM_NATURAL_GIFT_POWER`·`…_TYPE`)
   */
  naturalGiftPower: number
  naturalGiftType: number
  /** 헥토그램. 안다리걸기·풀묶기가 본다 (`species.json`의 `weightHg`) */
  weightHg: number
  gender: Gender
  /** 아직 안 쓰러진 후발 주자 수. 자폭·날려버리기 판단이 쓴다 */
  bench: number
  volatiles: ReadonlySet<string>
  /** 이 쪽 진영에 걸린 것과 층수. `reflect`, `lightscreen`, `safeguard`, `spikes` */
  side: ReadonlyMap<string, number>
}

/** AI가 고를 수 있는 기술 한 칸 */
export interface AiMove {
  /** `|request|`의 칸 번호(1부터). 고른 뒤 그대로 행동이 된다 */
  slot: number
  /**
   * 더블에서 이 후보가 겨눈 자리 (`p2 move 1 2`의 뒤 숫자). 싱글은 없다.
   *
   * ⚠️ **칸 번호만으로는 후보를 못 되찾는다** — 같은 기술이 상대 둘을 겨눈
   * 후보 둘로 갈라져 있고, 원작도 그 둘을 **따로 점수 매긴다**
   * (`TrainerAI_MainDoubles`가 자리마다 `AI_CONTEXT.defender`를 바꿔 가며 돈다)
   */
  target?: number
  /** 롬 기술 번호 */
  id: number
  /** 롬 기술 효과 번호(`moves.json`의 `effect`) */
  effect: number
  power: number
  type: number
  category: 'physical' | 'special' | 'status'
  accuracy: number
  priority: number
}

/** 한 번의 판단에 필요한 전부 */
export interface AiTurn {
  self: AiMon
  foe: AiMon
  /** 이번에 **점수를 매길** 후보. 더블에서는 겨눈 자리 하나 몫이다 */
  moves: readonly AiMove[]
  /**
   * 이 마리가 이번 턴에 고를 수 있는 것 **전부**. 안 주면 `moves`와 같다.
   *
   * ⚠️ **「내가 무엇을 아는가」는 이쪽으로 묻는다.** 더블에서 후보가 겨눈
   * 자리별로 갈리는데(`sim/brain.buildTurns`) 그 조각으로 물으면 배턴터치처럼
   * **대상을 안 찍는 기술**이 다른 조각에 있어서 「모른다」가 된다.
   * 싱글은 조각이 하나라 둘이 같다
   */
  all?: readonly AiMove[]
  weather: string | null
  field: ReadonlySet<string>
  /**
   * 이 개체가 나온 뒤 몇 턴이 지났는가. 0이면 나온 첫 턴이다.
   *
   * 원작의 `LoadTurnCount`는 **개체별 턴 수**다 — 교체로 새로 나온 애도 0이라
   * 셋업 보너스를 다시 받는다
   */
  turn: number
  /**
   * 상대가 지금까지 **써 보인** 기술 번호. 원작의 `IfMoveKnown`이 보는 것과 같다.
   *
   * 상대의 기술칸을 통째로 아는 게 아니다 — 한 번 나온 것만 안다. 그래서 첫 턴에는
   * 비어 있고, 배틀이 길어질수록 AI가 유리해진다
   */
  foeKnownMoves: ReadonlySet<number>
  /** 상대가 직전에 쓴 기술의 분류. 리플렉터·빛의장막을 언제 깔지 판단한다 */
  foeLastMoveCategory: 'physical' | 'special' | 'status' | null
  /**
   * 방어·판별을 연속으로 쓴 횟수. 원작의 `LoadProtectChain`이다.
   *
   * 이게 없으면 AI가 방어만 무한히 쓴다 — 원작이 굳이 세는 이유가 그것이다
   */
  protectChain: number
  random: () => number
}

/** 랭크 → 배수. 4세대는 능력치와 명중/회피의 표가 다르다 */
function stageMultiplier(stage: number): number {
  const s = stage < -6 ? -6 : stage > 6 ? 6 : stage
  return s >= 0 ? (2 + s) / 2 : 2 / (2 - s)
}

/** 랭크를 먹인 능력치. 4세대는 곱한 뒤 버린다 */
export function boosted(base: number, stage: number): number {
  return Math.floor(base * stageMultiplier(stage))
}

/** 이 마리가 고를 수 있는 것 전부. 「내가 무엇을 아는가」를 묻는 자리가 쓴다 */
export function knownMoves(turn: AiTurn): readonly AiMove[] {
  return turn.all ?? turn.moves
}

/** HP 백분율. 원작 AI의 `IfHPPercentLessThan`이 보는 값과 같은 반올림이다 */
export function hpPercent(mon: AiMon): number {
  if (mon.maxHp <= 0) return 0
  return Math.floor((mon.hp * 100) / mon.maxHp)
}
