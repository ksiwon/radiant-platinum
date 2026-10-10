// 체력판이 그리는 것의 **순수한 규칙** — 공 모양 · 도감 공 · 변화 줄 · 날씨 띠 (`HudPlates` · `FieldStrip`이 쓴다).
//
// 화면 파일에서 규칙만 꺼냈다. 그림은 브라우저로 봐야 하지만 **무엇을 그릴지**는 여기서 시험한다.
import type { BoostStat } from '../../engine/battle/events'
import type { ViewMon } from '../../engine/battle/view'
import { WEATHER_MOVE, type BattleNames } from './messages'
import { STAT_SLOT } from './romText'

/** 공 한 칸의 모양 — 색이 아니라 모양으로 갈린다 */
type BallShape = 'alive' | 'status' | 'fainted' | 'empty'

/**
 * 공 줄의 한 칸. 키가 없으면 빈 칸, 재생기가 보여 준 기절이면 회색 공, 상태 이상이면 귀퉁이에 점이 붙은 공이다.
 * **기절 판정은 `down`(재생기가 보여 준 만큼)이 정한다** — 정본을 보면 쓰러지는 연출보다 공이 먼저 꺼진다
 */
export function ballShape(
  key: string | undefined, down: readonly string[], status: string | null,
): BallShape {
  if (key === undefined) return 'empty'
  if (down.includes(key)) return 'fainted'
  return status !== null ? 'status' : 'alive'
}

/**
 * 상대 판에 도감 공이 뜨는가. **야생에만 뜬다** (`healthbox.c:664` — 트레이너전에는 안 그린다).
 * 사파리도 야생이다
 */
export function showsCaughtMark(trainerSide: boolean, caught: boolean): boolean {
  return !trainerSide && caught
}

/** 내 판에 EXP 줄이 서는가 — **단식만이다** (`healthbox.c:643-644`가 더블 내 판에서 뺀다) */
export function showsExp(mine: boolean, doubles: boolean): boolean {
  return mine && !doubles
}

/** 변화 줄의 한 칸. `dir`이 있으면 ▲▼와 `amount`가 붙는다 */
interface ChangeItem {
  key: string
  text: string
  dir: 'up' | 'down' | null
  amount: number
}

/** 랭크가 보이는 순서 — 공격 · 방어 · 특공 · 특방 · 스피드 · 명중 · 회피 */
const BOOST_ORDER: readonly BoostStat[] = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']

/** 상태 이름표(뱅크 219)에서 혼란의 자리 (`MSGCOND_CONFUSION`) */
const COND_CONFUSION = 5
/** 기술 이름표에서 씨뿌리기 · 대타출동 */
const MOVE_LEECH_SEED = 73
const MOVE_SUBSTITUTE = 164

/**
 * 그 마리에게 걸린 **능력 변화와 혼란 · 씨뿌리기 · 대타**. 없으면 빈 배열이다 (줄을 안 그린다).
 * 이름은 전부 롬 이름표다 — 랭크 이름 뱅크 551 · 상태 이름 219 · 기술 이름. 이름표가 아직 안 왔으면 그 칸을 건너뛴다
 * (지어낸 글로 채우지 않는다)
 */
export function changeItems(mon: ViewMon, names: BattleNames | null): ChangeItem[] {
  if (names === null) return []
  const out: ChangeItem[] = []
  for (const stat of BOOST_ORDER) {
    const amount = mon.boosts[stat]
    const text = names.stats[STAT_SLOT[stat]]
    if (amount === 0 || text === undefined || text === '') continue
    out.push({ key: stat, text, dir: amount > 0 ? 'up' : 'down', amount: Math.abs(amount) })
  }
  const flags: [string, string | undefined][] = [
    ['confusion', names.conditions?.[COND_CONFUSION]],
    ['leechseed', names.moves[MOVE_LEECH_SEED]],
    ['substitute', names.moves[MOVE_SUBSTITUTE]],
  ]
  for (const [id, text] of flags) {
    if (mon.volatiles.has(id) && text !== undefined && text !== '') out.push({ key: id, text, dir: null, amount: 0 })
  }
  return out
}

/** 필드 → 기술 번호. 트릭룸 433 · 중력 356 */
const FIELD_STRIP_MOVE: Readonly<Record<string, number>> = { trickroom: 433, gravity: 356 }

/** 띠의 한 칸 */
export interface StripCell {
  key: string
  kind: 'weather' | 'field'
  /** `WEATHER_MOVE`의 날씨 이름이거나 필드 이름 */
  id: string
  text: string
}

/**
 * 날씨 · 필드 띠의 칸. 이름은 기술 이름이다. 칸이 없으면 빈 배열 — 띠를 안 그린다.
 * 남은 턴 수는 뷰에 없으므로 **안 적는다**
 */
export function stripCells(
  weather: string | null, field: ReadonlySet<string>, moveNames: readonly string[],
): StripCell[] {
  const out: StripCell[] = []
  const w = weather === null ? undefined : WEATHER_MOVE[weather]
  if (weather !== null && w !== undefined && moveNames[w]) {
    out.push({ key: `w-${weather}`, kind: 'weather', id: weather, text: moveNames[w]! })
  }
  for (const [id, move] of Object.entries(FIELD_STRIP_MOVE)) {
    if (field.has(id) && moveNames[move]) out.push({ key: `f-${id}`, kind: 'field', id, text: moveNames[move]! })
  }
  return out
}
