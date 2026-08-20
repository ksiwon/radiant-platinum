// 이번 턴에 고를 수 있는 것 (PLAN §7.2) — `|request|`를 읽어 행동 목록을 만든다.
//
// UI(회색 처리된 기술 칸)와 AI(후보 목록)가 **같은 함수**를 본다. 둘이 각자
// 판단하면 UI에는 보이는데 sim이 거절하는 수가 생긴다.
//
// sim을 import 하지 않는다 — 요청 JSON은 평범한 객체다.
import type { BattleRequest } from './events'

/**
 * 더블에서 대상을 **따로 찍어야 하는** 기술의 겨냥 갈래.
 *
 * ⚠️ **눈으로 고른 목록이 아니다.** 4세대 기술이 쓰는 겨냥 갈래 열넷을 sim에
 * 하나씩 던져 보고 「needs a target」으로 거절당하는 것을 셌다 — 정확히 이 다섯이다.
 * 나머지 아홉(자기 자신·전체·양옆 전부·진영·팀·무작위·되받아치기)은 대상을
 * 붙이면 안 되는 것이 아니라 **안 붙여도 되는** 것들이라, 여기 없으면 안 붙인다
 */
const NEEDS_TARGET: ReadonlySet<string> = new Set([
  'normal', 'any', 'adjacentAlly', 'adjacentAllyOrSelf', 'adjacentFoe',
])

/** 그 기술이 더블에서 대상을 찍어야 하는가 */
export function needsTarget(targetType: string | undefined): boolean {
  return targetType !== undefined && NEEDS_TARGET.has(targetType)
}

/**
 * sim의 대상 번호. 상대는 1·2, 우리 편은 −1·−2다 (자리 `a`가 1).
 *
 * 우리 쪽 자리에서 보는 값이라 `p1`이 고르든 `p2`가 고르든 같은 규칙이다 —
 * 「상대 첫 자리」가 늘 1이다
 */
const TARGET_FOE_A = 1
const TARGET_FOE_B = 2
const TARGET_ALLY_A = -1
const TARGET_ALLY_B = -2

export type BattleAction =
  /** 기술 칸 번호. `|request|`의 순서대로 1부터 */
  | {
      type: 'move'
      slot: number
      /**
       * 명령을 내는 **자리 번호**(0·1). 싱글은 늘 0이다.
       *
       * 더블은 자리마다 따로 고르고 한 줄로 묶어 보낸다 —
       * `p1 move 1 1, move 2 -1`
       */
      at?: number
      /**
       * 겨누는 곳. 더블에서 `needsTarget`인 기술에만 붙는다.
       *
       * 싱글에서는 늘 없다 — 붙이면 sim이 "1vs1에는 대상이 없다"로 거절한다
       */
      target?: number
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
  | { type: 'switch'; index: number; key: string; at?: number }
  /**
   * 이 자리는 아무것도 안 한다 (`pass`).
   *
   * 더블에서 **한 자리만 쓰러졌을 때** 쓴다 — 나머지 한 자리는 교체를 안 고르고
   * 넘겨야 하는데, sim은 그 자리에 `pass`를 요구한다. 싱글에서는 안 쓴다
   */
  | { type: 'pass'; at?: number }

/** 기술 이름 → 롬 번호. sim을 아는 쪽만 줄 수 있어서 밖에서 받는다 */
type MoveResolver = (name: string) => number | null

interface ActionOptions {
  moveId?: MoveResolver
  /**
   * 몇 번째 자리의 명령을 뽑는가 (0·1). 싱글은 0.
   *
   * `forceSwitch`도 `active`도 자리마다 한 칸씩이라, 이 번호가 틀리면 더블에서
   * 둘째 자리가 첫째의 기술 목록을 받는다
   */
  at?: number
  /**
   * 더블인가. 참이면 `needsTarget`인 기술이 **자리마다 하나씩** 후보로 갈라진다
   */
  doubles?: boolean
  /** 상대 자리에 누가 서 있는가 (`[a, b]`). 쓰러진 자리는 겨눌 수 없다 */
  foeAlive?: readonly [boolean, boolean]
  /** 우리 자리에 짝이 서 있는가. 짝을 겨누는 기술이 이걸 본다 */
  allyAlive?: boolean
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
  if (action.type === 'pass') return 'pass'
  if (action.type === 'switch') return `switch ${action.index}`
  return action.target === undefined
    ? `move ${action.slot}`
    : `move ${action.slot} ${action.target}`
}

/**
 * 자리마다의 명령을 한 줄로 묶는다. sim은 쉼표로 가른다.
 *
 * ⚠️ **차례가 자리 번호다.** `at`을 안 보고 배열 순서대로 붙이면, 둘째 자리만
 * 다시 고른 판에서 그 명령이 첫째 자리에 들어간다
 */
export function encodeTurn(actions: readonly BattleAction[]): string {
  return [...actions]
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0))
    .map(encodeAction)
    .join(', ')
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
  const at = options.at ?? 0

  const switches = bench(request).map(
    ({ index, key }): BattleAction => ({ type: 'switch', index, key, at }),
  )

  // 쓰러져서 강제로 바꿔야 하는 턴. 기술은 못 고른다
  if (request.forceSwitch) {
    // ⚠️ **자리마다 따로 본다.** 더블에서 한 자리만 쓰러지면 그 자리만 참이고,
    // 멀쩡한 자리는 `pass`를 보내야 한다 — 거기에 교체 목록을 내주면 화면이
    // 안 쓰러진 마리를 바꾸라고 묻는다
    if (!request.forceSwitch[at]) return [{ type: 'pass', at }]
    return switches
  }

  const active = request.active?.[at]
  if (!active) return switches

  const moves = active.moves
    .map((m, i) => ({ m, base: { slot: i + 1, id: m.id, name: m.move, move: moveId(m.move) } }))
    // PP가 0이면 sim이 애초에 발버둥 하나만 담아 보낸다. 그래도 방어적으로 거른다
    .filter(({ m, base }) => {
      if (base.slot === options.hiddenSlot) return false
      return !m.disabled && (m.pp > 0 || active.moves.length === 1)
    })
    .flatMap(({ m, base }): BattleAction[] => {
      if (!options.doubles || !needsTarget(m.target)) {
        return [{ type: 'move', at, ...base }]
      }
      // 겨눌 수 있는 자리마다 후보 하나. 화면은 이걸 「기술 하나 + 대상 고르기」로
      // 다시 묶고, AI는 그냥 목록에서 뽑는다
      return targetsFor(m.target ?? 'normal', at, options)
        .map((target) => ({ type: 'move', at, target, ...base }))
    })

  // 그림자밟기·바다물기에 걸리면 교체 자체가 후보에서 빠진다
  return active.trapped ? moves : [...moves, ...switches]
}

/**
 * 그 기술이 겨눌 수 있는 자리 번호들.
 *
 * ⚠️ **쓰러진 자리는 못 겨눈다.** sim이 거절하고, 우리는 이미 요청을 비운
 * 뒤라 배틀이 그 자리에 선다 — 싱글에서 볼·도망으로 겪은 것과 같은 굳음이다.
 * 겨눌 데가 하나도 없으면 상대 첫 자리를 남긴다(빈 목록을 내면 그 기술이
 * 화면에서 통째로 사라진다)
 */
function targetsFor(kind: string, at: number, options: ActionOptions): number[] {
  const [foeA, foeB] = options.foeAlive ?? [true, true]
  const foes: number[] = []
  if (foeA) foes.push(TARGET_FOE_A)
  if (foeB) foes.push(TARGET_FOE_B)

  // 도우미·마사지는 **짝만** 겨눈다. 짝이 없으면 쓸 데가 없다
  const ally = at === 0 ? TARGET_ALLY_B : TARGET_ALLY_A
  const self = at === 0 ? TARGET_ALLY_A : TARGET_ALLY_B
  if (kind === 'adjacentAlly') return options.allyAlive ? [ally] : [TARGET_FOE_A]
  if (kind === 'adjacentAllyOrSelf') {
    return options.allyAlive ? [self, ally] : [self]
  }
  // `any`는 짝까지 겨눌 수 있다 (원작도 아군을 때릴 수 있다)
  if (kind === 'any' && options.allyAlive) return [...foes, ally]
  return foes.length > 0 ? foes : [TARGET_FOE_A]
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

/**
 * 자리마다 하나씩 무작위로. 더블에서 야생·정책 없는 상대가 쓴다.
 *
 * ⚠️ **같은 마리를 두 자리가 같이 내보내면 안 된다.** sim이
 * "can't switch to a Pokémon already switching in"으로 거절한다 — 그래서
 * 앞 자리가 고른 교체 대상을 뒤 자리 후보에서 뺀다
 */
export function chooseRandomTurn(
  request: BattleRequest | null,
  random: () => number,
  hide: ActionOptions = {},
): BattleAction[] {
  if (!request || request.wait) return []
  const count = request.active?.length ?? request.forceSwitch?.length ?? 1
  const taken = new Set<number>()
  const out: BattleAction[] = []
  for (let at = 0; at < count; at++) {
    const options = legalActions(request, { ...hide, at })
      .filter((a) => a.type !== 'switch' || !taken.has(a.index))
    const pick = options[Math.floor(random() * options.length)] ?? options[0]
    if (!pick) return out
    if (pick.type === 'switch') taken.add(pick.index)
    out.push(pick)
  }
  return out
}
