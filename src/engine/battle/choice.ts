// 이번 턴에 고를 수 있는 것 (PLAN §7.2) — `|request|`를 읽어 행동 목록을 만든다.
//
// UI(회색 처리된 기술 칸)와 AI(후보 목록)가 **같은 함수**를 본다. 둘이 각자
// 판단하면 UI에는 보이는데 sim이 거절하는 수가 생긴다.
//
// sim을 import 하지 않는다 — 요청 JSON은 평범한 객체다.
import type { BattleRequest } from './events'

export type BattleAction =
  /** 기술 칸 번호. `|request|`의 순서대로 1부터 */
  | {
      type: 'move'
      slot: number
      id: string
      /** 프로토콜이 준 영어 이름. 번호를 못 찾았을 때의 대비책이다 */
      name: string
      /** 롬 기술 번호. 화면의 한국어 이름·연출이 이걸로 돈다 */
      move: number | null
      /**
       * 남은 PP와 최대 PP. **sim의 값이 아니라 우리 세이브 기준이다** —
       * sim은 모든 기술에 포인트업을 다 먹인 최대치를 쓴다(10짜리가 16).
       *
       * 못 풀면 둘 다 없다. 발버둥과 빈 턴 칸이 그렇다
       */
      pp?: number
      maxPp?: number
    }
  /** 파티 칸 번호. 1부터 */
  | { type: 'switch'; index: number; key: string }

/** 기술 이름 → 롬 번호. sim을 아는 쪽만 줄 수 있어서 밖에서 받는다 */
export type MoveResolver = (name: string) => number | null

export interface ActionOptions {
  moveId?: MoveResolver
  /**
   * 화면에서 감출 기술 칸 번호(1부터). 볼·도망이 쓰는 빈 턴 칸이다
   * (`session.ts`의 `IDLE_MOVE` 참고). 플레이어가 이걸 직접 고르면 안 된다
   */
  hiddenSlot?: number | null
}

/** sim이 알아듣는 명령 꼬리. `p1 ` 같은 쪽 표시는 부르는 쪽이 붙인다 */
export function encodeAction(action: BattleAction): string {
  return action.type === 'move' ? `move ${action.slot}` : `switch ${action.index}`
}

/**
 * 쓰러지지 않았고 지금 나와 있지도 않은 파티원.
 *
 * `ident`는 `p1: <키>` 꼴이다. 쪽 표시를 떼어 우리가 넣은 키만 남긴다 —
 * 화면이 이름을 찾는 것도, 배틀 뒤 세이브에 되돌리는 것도 그 키로 한다
 */
function bench(request: BattleRequest): { index: number; key: string }[] {
  return request.side.pokemon
    .map((p, i) => ({ p, index: i + 1 }))
    .filter(({ p }) => !p.active && !p.condition.endsWith(' fnt'))
    .map(({ p, index }) => ({ index, key: p.ident.replace(/^p[1-4][a-c]?:\s*/, '') }))
}

/**
 * 지금 보낼 수 있는 행동 전부.
 *
 * 빈 배열은 두 가지 뜻이다: `wait`(상대만 고를 게 있다)이거나 정말 아무것도 못 하는
 * 경우. 어느 쪽이든 **아무것도 보내면 안 된다** — 보내면 sim이 거절한다
 */
export function legalActions(
  request: BattleRequest | null,
  options: ActionOptions = {},
): BattleAction[] {
  if (!request || request.wait) return []
  const moveId = options.moveId ?? (() => null)

  const switches = bench(request).map(
    ({ index, key }): BattleAction => ({ type: 'switch', index, key }),
  )

  // 쓰러져서 강제로 바꿔야 하는 턴. 기술은 못 고른다
  if (request.forceSwitch?.[0]) return switches

  const active = request.active?.[0]
  if (!active) return switches

  const moves = active.moves
    .map((m, i): BattleAction => ({
      type: 'move', slot: i + 1, id: m.id, name: m.move, move: moveId(m.move),
    }))
    // PP가 0이면 sim이 애초에 발버둥 하나만 담아 보낸다. 그래도 방어적으로 거른다
    .filter((a, i) => {
      const m = active.moves[i]!
      if (a.type === 'move' && a.slot === options.hiddenSlot) return false
      return !m.disabled && (m.pp > 0 || active.moves.length === 1)
    })

  // 그림자밟기·바다물기에 걸리면 교체 자체가 후보에서 빠진다
  return active.trapped ? moves : [...moves, ...switches]
}

/**
 * 아무거나 하나. 야생 포켓몬의 행동이다 — 원작도 야생은 사실상 무작위다.
 *
 * 트레이너 AI는 이걸 안 쓴다 (PLAN §7.7).
 */
export function chooseRandom(
  request: BattleRequest | null,
  random: () => number,
  hide: ActionOptions = {},
): BattleAction | null {
  // 상대 행동은 이름을 화면에 안 쓰므로 번호를 풀 필요가 없다
  const options = legalActions(request, hide)
  if (!options.length) return null
  return options[Math.floor(random() * options.length)] ?? options[0]!
}
