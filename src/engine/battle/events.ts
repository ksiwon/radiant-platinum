// 배틀 도메인 이벤트 (PLAN §7.2 ②) — 프로토콜과 나머지 전부 사이의 벽.
//
// Showdown 프로토콜은 문자열이고 이름 체계다. 이 파일 위쪽(뷰·연출·UI)은 **번호
// 체계에 타입이 붙은 값만** 본다. 그래서 sim을 안 실어도 이벤트를 다룰 수 있고 —
// 이 파일에는 `@pkmn` import가 하나도 없다 — 지연 로딩 경계가 유지된다.
//
// 파싱은 `sim/protocol.ts`가 한다. 여기는 모양만 정의한다.
import type { Gender, Status } from '../pokemon/instance'

export type SideId = 'p1' | 'p2'

/**
 * 무대 위의 **자리**. 싱글은 `a` 둘, 더블은 넷이 다 선다 (PARITY §2.2).
 *
 * ⚠️ **쪽(`SideId`)으로는 못 센다.** 더블에서는 한쪽에 둘이 서 있어서, 뷰를
 * 쪽으로 접으면 둘째 마리의 체력이 첫째를 덮어쓴다. 프로토콜은 처음부터
 * `p1a`·`p1b`로 갈라 주고 있었고 우리가 그것을 버리고 있었다
 */
export type SlotId = 'p1a' | 'p1b' | 'p2a' | 'p2b'

/** 무대의 네 자리. 싱글에서도 순서는 같다 */
export const SLOTS: readonly SlotId[] = ['p1a', 'p1b', 'p2a', 'p2b']

/** 쪽 + 자리 번호 → 자리 표기 */
export function slotId(side: SideId, at = 0): SlotId {
  return `${side}${at === 0 ? 'a' : 'b'}`
}

/** 자리 표기 → 자리 번호(0·1) */
export function slotIndex(slot: SlotId): 0 | 1 {
  return slot.endsWith('a') ? 0 : 1
}

/** 그 쪽의 두 자리 */
export function slotsOf(side: SideId): readonly [SlotId, SlotId] {
  return [slotId(side, 0), slotId(side, 1)]
}

/** 상대 쪽 */
export function otherSide(side: SideId): SideId {
  return side === 'p1' ? 'p2' : 'p1'
}

/** 프로토콜의 `p1a: 별명`. 자리와 표시 이름을 같이 들고 다닌다 */
export interface Actor {
  /** `p1a`. 싱글은 늘 `a`고, 더블에서 둘째 자리가 `b`다 */
  slot: SlotId
  side: SideId
  /** 별명. 종족 이름이 아니다 */
  name: string
}

export type BoostStat = 'atk' | 'def' | 'spa' | 'spd' | 'spe' | 'accuracy' | 'evasion'

/** 프로토콜의 `58/62 par`를 푼 것. `maxHp`가 null이면 그 줄이 최대치를 안 알려준 것(`0 fnt`) */
export interface Condition {
  hp: number
  maxHp: number | null
  status: Status
}

/** `|request|`의 기술 한 칸 */
export interface RequestMove {
  id: string
  move: string
  pp: number
  maxpp: number
  disabled: boolean
  /**
   * 그 기술이 무엇을 겨누는가 (`normal`·`self`·`allAdjacentFoes`…).
   *
   * 더블에서 **다섯 갈래만** 대상을 따로 찍어야 한다. 눈으로 고른 목록이
   * 아니라 sim에 열넷을 다 던져 보고 거절당하는 것을 센 것이다
   * (`needsTarget`)
   */
  target?: string
}

/** `|request|`의 파티 한 마리 */
export interface RequestMon {
  ident: string
  details: string
  condition: string
  active: boolean
  stats: { atk: number; def: number; spa: number; spd: number; spe: number }
  moves: string[]
  baseAbility: string
  item: string
}

/**
 * 우리 차례가 왔다는 통보이자, 우리 쪽 정보의 정본.
 *
 * `wait`면 상대만 고를 게 있다는 뜻이라 아무것도 보내면 안 된다. `forceSwitch`면
 * 기술이 아니라 교체만 고를 수 있다 — 쓰러진 직후가 그렇다.
 */
export interface BattleRequest {
  wait?: boolean
  forceSwitch?: boolean[]
  active?: { moves: RequestMove[]; trapped?: boolean }[]
  side: { name: string; id: string; pokemon: RequestMon[] }
  rqid?: number
  noCancel?: boolean
}

export type Effectiveness = 'super' | 'resisted' | 'immune'

/**
 * 배틀이 끝난 시점의 개체 하나. `key`는 `SideMon.key`와 같다.
 *
 * 프로토콜에는 벤치에 있던 애들의 최종 HP가 안 나온다. 이건 sim의 배틀 객체에서
 * 직접 읽은 값이고, 세이브에 되돌릴 정본이다
 */
export interface FinalMon {
  key: string
  hp: number
  maxHp: number
  status: Status
  fainted: boolean
  /**
   * 남은 PP. 세이브에 그대로 덮어쓴다.
   *
   * 이게 성립하는 것은 배틀을 열 때 `session.syncPp`가 세이브의 남은 PP를 sim에
   * 밀어 넣기 때문이다. 안 그러면 sim은 포인트업 3회를 먹인 최대치로 굴리므로
   * (10 → 16, 20 → 32) 이 숫자를 옮기는 순간 PP가 배틀마다 늘어난다.
   *
   * 기술 번호로 짝짓는다 — sim은 우리가 넣은 칸 순서를 지켜 주지 않는다
   */
  pp: { move: number; pp: number }[]
}

/**
 * `[from]`이 가리키는 원인. `ability: Sand Stream`, `move: Leech Seed`, `psn`처럼 온다.
 *
 * 이름을 그대로 두지 않고 번호까지 풀어 둔다 — 문구도 연출도 번호로 골라야 하고,
 * 이 변환은 sim을 아는 파서만 할 수 있다.
 */
export interface Cause {
  kind: 'ability' | 'item' | 'move' | 'status' | 'other'
  /** 기술·특성이면 롬 번호. 못 찾으면 null */
  id: number | null
  /** 번호가 없을 때 쓸 원문 (`psn`, `Sandstorm`) */
  name: string
}

/**
 * 한 줄에서 뽑아낸 사건 하나.
 *
 * `other`는 아직 모양을 안 준 줄이다 — **버리지 않는다.** 조용히 사라지면 연출이
 * 빠진 것을 눈치챌 방법이 없어서, 남겨 두고 `protocol.test.ts`가 실전 배틀에서
 * 무엇이 여기로 떨어지는지 목록으로 못박는다.
 */
export type BattleEvent =
  | { kind: 'start' }
  | { kind: 'turn'; turn: number }
  | {
      kind: 'switch'
      actor: Actor
      species: number | null
      form?: number
      speciesName: string
      level: number
      gender: Gender
      shiny: boolean
      condition: Condition
      /** 흔들기·날려버리기처럼 본인 의사와 무관하게 끌려나온 경우 */
      forced: boolean
    }
  | {
      kind: 'form'
      actor: Actor
      species: number | null
      speciesName: string
      form: number
    }
  | {
      kind: 'move'
      actor: Actor
      move: number | null
      moveName: string
      target: Actor | null
      /** `[miss]` — 빗나간 기술도 `|move|`는 나온다 */
      miss: boolean
      /** `[from] ability: Magic Bounce` 같은 유래 */
      from: Cause | null
    }
  /**
   * `hit`은 프로토콜에 없다 — **박자를 만들 때 붙인다**(`playback.ts`).
   *
   * 원작은 기술 연출 도중에 효과에 따라 다른 타격음을 낸다
   * (`BattleDisplay_FlyMoveHitSoundEffect`). 그런데 쇼다운은 `-supereffective`를
   * 데미지보다 **먼저** 보내고 **보통일 때는 아무 줄도 안 보낸다.** 그래서 그때까지
   * 모인 것을 데미지에 얹어 준다 — 없으면 보통이다.
   *
   * 기술에 맞은 것만 붙는다. 독·모래바람은 `from`이 차 있어서 안 붙는다
   */
  | {
      kind: 'damage'
      actor: Actor
      condition: Condition
      from: Cause | null
      hit?: { level: Effectiveness | 'normal'; crit: boolean }
    }
  | { kind: 'heal'; actor: Actor; condition: Condition; from: Cause | null }
  | { kind: 'faint'; actor: Actor }
  | { kind: 'status'; actor: Actor; status: Status }
  | { kind: 'curestatus'; actor: Actor; status: Status }
  /** 랭크 변화. 하락은 `amount`가 음수다 — `-boost`와 `-unboost`를 하나로 합친다 */
  | { kind: 'boost'; actor: Actor; stat: BoostStat; amount: number }
  | { kind: 'effectiveness'; actor: Actor; level: Effectiveness }
  | { kind: 'crit'; actor: Actor }
  /** 빗나감. `actor`는 **대상**이다 (`|-miss|공격자|대상`의 두 번째) */
  | { kind: 'miss'; actor: Actor | null }
  | { kind: 'fail'; actor: Actor | null }
  | { kind: 'cant'; actor: Actor; reason: string }
  | { kind: 'ability'; actor: Actor; ability: number | null; abilityName: string }
  | { kind: 'weather'; weather: string | null; upkeep: boolean }
  // ── 지속 효과 세 갈래 ────────────────────────────────────────────────────
  // 화면(리플렉터)·장(트릭룸)·개체(대타출동)는 걸리는 곳이 달라서 따로 접어야 한다.
  // 이름은 `reflect`, `trickroom`, `leechseed`처럼 sim의 id 꼴로 정규화된다 —
  // 원문(`move: Trick Room`)을 그대로 두면 비교할 때마다 접두사를 떼야 한다
  /** 한 쪽 진영 전체에 걸린 것. 리플렉터·빛의장막·압정뿌리기·신비의부적 */
  | { kind: 'sidecondition'; side: SideId; condition: string; start: boolean }
  /** 필드 전체에 걸린 것. 트릭룸·중력·매직룸 */
  | { kind: 'fieldcondition'; condition: string; start: boolean }
  /** 지금 나와 있는 한 마리에게 걸린 것. 대타출동·씨뿌리기·혼란·조이기 */
  | { kind: 'volatile'; actor: Actor; volatile: string; start: boolean }
  | { kind: 'win'; winner: string }
  | { kind: 'tie' }
  | { kind: 'request'; request: BattleRequest | null }
  | { kind: 'other'; cmd: string; args: string[] }
  // ── 아래 둘은 프로토콜에 없다 ──────────────────────────────────────────────
  // 포획과 도망은 대전 규칙 밖의 일이라 sim이 모른다. 컨트롤러가 직접 넣는다.
  // 그래도 같은 줄기에 섞어 흘리는 이유는, 연출과 텍스트가 이것들을 **순서대로**
  // 봐야 하기 때문이다 — 볼이 흔들린 뒤에 야생이 반격한다
  /** 볼을 던졌다. `shakes`는 0~3이고 잡히면 4다 */
  | { kind: 'ball'; actor: Actor; ball: number; shakes: number; caught: boolean }
  /**
   * 도망을 시도했다.
   *
   * `foe`가 서면 **상대가 달아난 것**이다 — 배회 포켓몬이 그렇다 (PARITY §6.3).
   * 그때는 `actor`가 달아난 마리이고 판이 그 자리에서 끝난다
   */
  | { kind: 'escape'; success: boolean; foe?: boolean; actor?: Actor }
  /**
   * 경험치를 받았다. `levels`는 새로 도달한 레벨.
   *
   * `learned`는 **실제로 들어간** 기술이고, `pending`은 칸이 없어서 못 넣은 것이다.
   * 둘을 나눠 두지 않으면 화면이 "배웠다"와 "배우고 싶어 한다"를 구분 못 한다
   */
  | {
      kind: 'reward'
      key: string
      exp: number
      levels: number[]
      learned: number[]
      pending: number[]
    }
  /** 트레이너전에서 상금을 받았다 */
  | { kind: 'prize'; money: number }
  /**
   * 시합규칙 「교체」 — 상대가 다음 마리를 내보내려 한다. 우리도 바꿀지 묻는다.
   *
   * `key`는 상대가 **내보내려는** 마리다. 아직 안 나왔으므로 화면의 자리에는 없다
   */
  | { kind: 'shift'; key: string }
  /** 트레이너가 도구를 썼다. `item`은 도구 번호, `key`는 먹인 마리 */
  | { kind: 'trainerItem'; key: string; item: number }
  /**
   * 우리가 가방에서 도구를 썼다.
   *
   * ⚠️ **원작 배틀 로그에는 이 줄이 없다** — `subscript_battle_item`이 통째로
   * 비어 있다. DS는 아래 화면(가방·파티)에서 도구 이름과 회복 애니메이션을
   * 보여 주고 위 화면은 가만히 있어서다. 우리는 화면이 하나라 그 자리에 원작이
   * 다른 데서 쓰는 문장을 놓는다 (`BattleStrings_Text_UsedTheItem`)
   */
  | { kind: 'bagItem'; key: string; item: number }
  /**
   * 명령을 안 들었다 (PARITY §2.18 · `battle/meta/obedience.ts`).
   *
   * 원작에서는 배틀 스크립트가 끼어드는 자리라 프로토콜에 대응하는 줄이 없다.
   * `flavor`는 아무것도 안 했을 때의 네 마디 중 몇 번째인지다
   */
  | {
      kind: 'disobey'
      actor: Actor
      reason: 'ignoredAsleep' | 'otherMove' | 'nap' | 'hitSelf' | 'nothing'
      flavor?: number
    }

/** `p1a: 별명` → 자리와 이름. 자리 표기가 아니면 null */
export function parseActor(raw: string): Actor | null {
  const colon = raw.indexOf(':')
  const text = (colon < 0 ? raw : raw.slice(0, colon)).trim()
  if (!/^p[12][a-c]?$/.test(text)) return null
  const side = text.slice(0, 2) as SideId
  // ⚠️ 자리 글자가 없는 줄이 있다 (`|-sidestart|p1: 빛나`처럼 쪽만 쓰는 자리에서
  // 이 함수를 부르는 길). 그때는 첫 자리로 친다 — 세 번째 자리(`c`)는 3vs3
  // 형식의 것이라 4세대에는 없지만, 들어오면 둘째로 접는다
  const letter = text.length > 2 ? text[2] : 'a'
  return {
    slot: `${side}${letter === 'a' ? 'a' : 'b'}`,
    side,
    name: colon < 0 ? '' : raw.slice(colon + 1).trim(),
  }
}

/**
 * `move: Trick Room`, `Substitute`, `perish3` → `trickroom`, `substitute`, `perish3`.
 *
 * 프로토콜은 같은 효과를 자리마다 다른 꼴로 쓴다. 비교하는 쪽이 매번 접두사를
 * 신경 쓰면 언젠가 한 군데를 빠뜨리므로 들어오는 자리에서 한 번에 정규화한다
 */
export function conditionId(raw: string): string {
  const colon = raw.indexOf(':')
  const body = colon < 0 ? raw : raw.slice(colon + 1)
  return body.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** `p1: 빛나`, `p1a: 빛나` → `p1`. 쪽 표기가 아니면 null */
export function parseSide(raw: string): SideId | null {
  const m = /^(p[12])/.exec(raw.trim())
  return m ? (m[1] as SideId) : null
}

const STATUSES: Status[] = ['slp', 'psn', 'tox', 'brn', 'frz', 'par']

/**
 * `58/62 par`, `0 fnt`, `100/100` → 숫자.
 *
 * 쓰러진 줄은 `0 fnt`라 **최대치를 안 알려준다.** 그래서 null을 돌려주고 이전 값을
 * 유지하게 한다 — 0으로 채우면 HP 바가 0/0이 되어 나눗셈이 NaN이 된다
 */
export function parseCondition(raw: string): Condition {
  const [amount, ...rest] = raw.trim().split(' ')
  const [cur, max] = (amount ?? '').split('/')
  const hp = Number(cur)
  const maxHp = max === undefined ? null : Number(max)
  const tag = rest.find((t) => (STATUSES as string[]).includes(t))
  return {
    hp: Number.isFinite(hp) ? hp : 0,
    maxHp: maxHp !== null && Number.isFinite(maxHp) ? maxHp : null,
    status: (tag as Status) ?? 'ok',
  }
}

/** `Turtwig, L5, F` → 종족 이름·레벨·성별·이로치. 레벨이 없으면 100이다 */
export function parseDetails(raw: string): {
  speciesName: string
  level: number
  gender: Gender
  shiny: boolean
} {
  const parts = raw.split(',').map((p) => p.trim())
  const speciesName = parts[0] ?? ''
  let level = 100
  let gender: Gender = 'genderless'
  let shiny = false
  for (const p of parts.slice(1)) {
    if (p === 'shiny') shiny = true
    else if (p === 'M') gender = 'male'
    else if (p === 'F') gender = 'female'
    else if (/^L\d+$/.test(p)) level = Number(p.slice(1))
  }
  return { speciesName, level, gender, shiny }
}
