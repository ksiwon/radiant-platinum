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
  /**
   * 파티 전원의 **맨 뒤 칸**에 붙어 있는 빈 턴 기술의 아이디 (`IDLE_MOVE_ID`).
   *
   * ⚠️ **`hiddenSlot`으로는 이걸 못 가린다.** 그 번호는 `|request|`의
   * `active[0].moves`에서 나오므로 **지금 나와 있는 한 마리**에만 맞는데, 빈 턴
   * 칸은 우리 팀 **전원**에게 붙는다(`session.toSet`이 여섯 마리 다 `idle: true`로
   * 만든다). 그래서 교체 화면에서 벤치의 잉어킹이 `물장구·몸통박치기·물장구`
   * 세 칸으로 떴다 — 아는 것은 둘인데.
   *
   * 칸 번호가 아니라 **아이디**로 받는 이유는 마리마다 아는 기술 수가 달라서다.
   * 그 칸은 언제나 맨 뒤다(`session.ts`) — 진짜 물장구를 아는 애도 그 뒤에
   * 한 칸이 더 붙으므로 맨 뒤만 떼면 맞는다
   */
  hiddenLast?: string | null
}

/**
 * 파티 한 칸의 **지금 상태**. 교체 화면이 여섯 칸을 다 그리는 데 쓴다.
 *
 * ⚠️ **`roster`로는 못 그린다.** 거기엔 종족·이름·레벨만 있어서, 벤치에 있는
 * 애가 체력이 얼마고 무슨 기술을 갖고 있는지가 없다. 그 값은 요청(`|request|`)의
 * `side.pokemon`에 다 실려 온다 — 나와 있지 않은 애들 것까지.
 */
export interface PartySlot {
  /** 파티 칸 번호(1부터). `switch` 행동의 `index`와 같다 */
  index: number
  key: string
  hp: number
  maxHp: number
  /** 프로토콜의 상태이상 약자 (`brn`·`psn`·`slp`…). 없으면 null */
  status: string | null
  active: boolean
  fainted: boolean
  /** 특성. 프로토콜 아이디(`sandstream`)라 이름은 화면이 푼다 */
  ability: string
  /** 기술. 프로토콜 아이디와 우리가 푼 롬 번호 */
  moves: { id: string; move: number | null }[]
}

/**
 * 파티 여섯 칸. 요청이 없으면 빈 목록.
 *
 * `condition`은 `"26/26"` · `"0 fnt"` · `"12/26 brn"` 꼴이다
 */
export function partySummary(
  request: BattleRequest | null, options: ActionOptions = {},
): PartySlot[] {
  if (!request) return []
  const moveId = options.moveId ?? (() => null)
  return request.side.pokemon.map((p, i) => {
    // ⚠️ **빈 턴 칸은 감춘다.** 볼·도망이 턴을 쓰려고 끼워 넣은 기술이라
    // (`session.ts`의 `IDLE_MOVE`) 파티에 다섯 번째 기술로 뜨면 안 된다.
    //
    // 그 칸은 나와 있는 한 마리가 아니라 **우리 팀 전원**에게 붙어 있다
    // (`hiddenLast` 참조). 맨 뒤 한 칸만 떼면 맞는다
    const last = p.moves.length
    const trailing = options.hiddenLast != null && last >= 2
      && p.moves[last - 1] === options.hiddenLast
    const hidden = trailing ? last : p.active ? options.hiddenSlot ?? null : null
    const [gauge, mark] = p.condition.split(' ')
    const [now, max] = (gauge ?? '').split('/')
    const fainted = mark === 'fnt' || Number(now) === 0
    return {
      index: i + 1,
      key: p.ident.replace(/^p[1-4][a-c]?:\s*/, ''),
      hp: Number(now) || 0,
      maxHp: Number(max) || 0,
      status: fainted ? null : (mark ?? null),
      active: p.active,
      fainted,
      ability: p.baseAbility,
      moves: p.moves
        .filter((_, at) => at + 1 !== hidden)
        .map((id) => ({ id, move: moveId(id) })),
    }
  })
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
