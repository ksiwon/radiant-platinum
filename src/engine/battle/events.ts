// 배틀 도메인 이벤트 (PLAN §7.2 ②) — 프로토콜과 나머지 전부 사이의 벽.
//
// Showdown 프로토콜은 문자열이고 이름 체계다. 이 파일 위쪽(뷰·연출·UI)은 **번호
// 체계에 타입이 붙은 값만** 본다. 그래서 sim을 안 실어도 이벤트를 다룰 수 있고 —
// 이 파일에는 `@pkmn` import가 하나도 없다 — 지연 로딩 경계가 유지된다.
//
// 파싱은 `sim/protocol.ts`가 한다. 여기는 모양만 정의한다.
import type { Gender, Status } from '../pokemon/instance'

export type SideId = 'p1' | 'p2'

/** 프로토콜의 `p1a: 별명`. 자리와 표시 이름을 같이 들고 다닌다 */
export interface Actor {
  /** `p1a`. 4세대 싱글은 자리가 늘 `a`지만 프로토콜 원문을 그대로 둔다 */
  slot: string
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
      speciesName: string
      level: number
      gender: Gender
      shiny: boolean
      condition: Condition
      /** 흔들기·날려버리기처럼 본인 의사와 무관하게 끌려나온 경우 */
      forced: boolean
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
  | { kind: 'damage'; actor: Actor; condition: Condition; from: Cause | null }
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
  | { kind: 'win'; winner: string }
  | { kind: 'tie' }
  | { kind: 'request'; request: BattleRequest | null }
  | { kind: 'other'; cmd: string; args: string[] }

/** `p1a: 별명` → 자리와 이름. 자리 표기가 아니면 null */
export function parseActor(raw: string): Actor | null {
  const colon = raw.indexOf(':')
  const slot = (colon < 0 ? raw : raw.slice(0, colon)).trim()
  if (!/^p[12][a-c]?$/.test(slot)) return null
  return {
    slot,
    side: slot.slice(0, 2) as SideId,
    name: colon < 0 ? '' : raw.slice(colon + 1).trim(),
  }
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
