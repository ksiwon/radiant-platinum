// 이번 턴에 고를 수 있는 것 (PLAN §7.2) — `|request|`를 읽어 행동 목록을 만든다.
//
// UI(회색 처리된 기술 칸)와 AI(후보 목록)가 **같은 함수**를 본다. 둘이 각자
// 판단하면 UI에는 보이는데 sim이 거절하는 수가 생긴다.
//
// sim을 import 하지 않는다 — 요청 JSON은 평범한 객체다.
import type { BattleRequest } from './events'

export type BattleAction =
  /** 기술 칸 번호. `|request|`의 순서대로 1부터 */
  | { type: 'move'; slot: number; id: string; name: string }
  /** 파티 칸 번호. 1부터 */
  | { type: 'switch'; index: number; ident: string }

/** sim이 알아듣는 명령 꼬리. `p1 ` 같은 쪽 표시는 부르는 쪽이 붙인다 */
export function encodeAction(action: BattleAction): string {
  return action.type === 'move' ? `move ${action.slot}` : `switch ${action.index}`
}

/** 쓰러지지 않았고 지금 나와 있지도 않은 파티원 */
function bench(request: BattleRequest): { index: number; ident: string }[] {
  return request.side.pokemon
    .map((p, i) => ({ p, index: i + 1 }))
    .filter(({ p }) => !p.active && !p.condition.endsWith(' fnt'))
    .map(({ p, index }) => ({ index, ident: p.ident }))
}

/**
 * 지금 보낼 수 있는 행동 전부.
 *
 * 빈 배열은 두 가지 뜻이다: `wait`(상대만 고를 게 있다)이거나 정말 아무것도 못 하는
 * 경우. 어느 쪽이든 **아무것도 보내면 안 된다** — 보내면 sim이 거절한다
 */
export function legalActions(request: BattleRequest | null): BattleAction[] {
  if (!request || request.wait) return []

  const switches = bench(request).map(
    ({ index, ident }): BattleAction => ({ type: 'switch', index, ident }),
  )

  // 쓰러져서 강제로 바꿔야 하는 턴. 기술은 못 고른다
  if (request.forceSwitch?.[0]) return switches

  const active = request.active?.[0]
  if (!active) return switches

  const moves = active.moves
    .map((m, i): BattleAction => ({ type: 'move', slot: i + 1, id: m.id, name: m.move }))
    // PP가 0이면 sim이 애초에 발버둥 하나만 담아 보낸다. 그래도 방어적으로 거른다
    .filter((_, i) => {
      const m = active.moves[i]!
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
): BattleAction | null {
  const options = legalActions(request)
  if (!options.length) return null
  return options[Math.floor(random() * options.length)] ?? options[0]!
}
