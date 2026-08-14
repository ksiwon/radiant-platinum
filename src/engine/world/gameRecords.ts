// 게임 기록과 트레이너 스코어 (PARITY §7.5)
//
// 원작이 148칸짜리 계수기를 들고 있고, 스크립트와 코드 곳곳에서 하나씩 올린다.
// 랭킹 머신·TV·NPC들이 그 값을 읽고, **트레이너 카드의 점수**가 그중 한 칸이다.
//
// ⚠️ **암호화는 안 옮긴다.** 원작은 1번 칸부터를 XOR로 섞어 두고 읽을 때마다
// 푼다 (`EncodeGameRecords`) — 치트 도구가 리포트를 직접 고치는 것을 막으려는
// 장치인데, 우리 리포트는 브라우저 저장소의 JSON이라 섞어 봐야 뜻이 없다.
// 값과 상한만 원작 그대로 둔다.
//
// ⚠️ **트레이너 스코어는 따로 있는 칸이 아니다** — 기록 1번이 곧 그것이다
// (`RECORD_TRAINER_SCORE`). 새 칸을 만들면 두 값이 어긋난다
import {
  HIGH_LIMIT_U16, HIGH_LIMIT_U32, LOW_LIMIT_U16, LOW_LIMIT_U32,
  MAX_RECORDS, MAX_TRAINER_SCORE_EVENTS, NUM_U32_RECORDS,
  TRAINER_SCORE_INCREMENT, USES_HIGH_LIMIT,
} from './gameRecordsTable'

export { MAX_RECORDS, MAX_TRAINER_SCORE_EVENTS }

/** `RECORD_STEPS` — 걸은 수 */
export const RECORD_STEPS = 0
/** `RECORD_TRAINER_SCORE` — 트레이너 카드의 점수 */
export const RECORD_TRAINER_SCORE = 1
export const RECORD_BERRIES_PLANTED = 4
export const RECORD_WILD_BATTLES_FOUGHT = 7
export const RECORD_TRAINER_BATTLES_FOUGHT = 8
export const RECORD_CAUGHT_POKEMON = 9
export const RECORD_CAUGHT_FISH = 10
export const RECORD_EGGS_HATCHED = 11
export const RECORD_POKEMON_EVOLVED = 12
export const RECORD_BATTLE_TOWER_CHALLENGES = 15
/** `RECORD_FAINTED_IN_BATTLE` — 랭킹 일곱째 줄 */
export const RECORD_FAINTED_IN_BATTLE = 41

/** `TRAINER_SCORE_EVENT_*` 중 우리가 실제로 거는 것 */
export const SCORE_WON_WILD_BATTLE = 8
export const SCORE_CAPTURED_REGIONAL_MON = 9
export const SCORE_CAPTURED_NATIONAL_MON = 10
export const SCORE_WON_TRAINER_BATTLE = 11
export const SCORE_CAUGHT_SPECIES = 22
export const SCORE_BADGE_EARNED = 23
export const SCORE_HALL_OF_FAME_ENTRY = 24
export const SCORE_BATTLE_FACTORY_ROUND = 38

export type GameRecordsState = readonly number[]

export function newGameRecords(): number[] {
  return new Array<number>(MAX_RECORDS).fill(0)
}

/**
 * 그 기록의 상한 (`GetRecordLimit`).
 *
 * ⚠️ **폭과 상한이 따로다.** 앞 71칸이 u32고 나머지가 u16인데, 그 안에서 다시
 * 「높은 상한」 표가 갈린다 — u16 칸인데 0xFFFF까지 가는 것도, u32 칸인데
 * 999,999에서 멈추는 것도 있다
 */
export function recordLimit(id: number): number {
  const high = USES_HIGH_LIMIT[id] === true
  if (id < NUM_U32_RECORDS) return high ? HIGH_LIMIT_U32 : LOW_LIMIT_U32
  return high ? HIGH_LIMIT_U16 : LOW_LIMIT_U16
}

export function recordValue(records: GameRecordsState, id: number): number {
  return records[id] ?? 0
}

/**
 * 기록을 올린다 (`GameRecords_AddToRecordValue`). 상한에서 멈춘다.
 *
 * ⚠️ **넘칠 때도 상한을 「채운다」** — 원작이 넘치면 상한값을 넣지 0으로
 * 돌리지 않는다. 계수기가 한 바퀴 돌면 걸은 수가 갑자기 0이 된다
 */
export function addRecord(records: GameRecordsState, id: number, amount = 1): number[] {
  if (id < 0 || id >= MAX_RECORDS) return [...records]
  const next = [...records]
  next[id] = Math.min((next[id] ?? 0) + amount, recordLimit(id))
  return next
}

/**
 * 트레이너 스코어를 올린다 (`GameRecords_IncrementTrainerScore`).
 *
 * ⚠️ **사건마다 오르는 폭이 다르다** — 나무열매 수확 1, 뱃지 30, 명예의 전당 35,
 * **전국도감 상장 10,000**이다. 그래서 사건 번호를 그대로 값으로 쓰면 안 된다
 */
export function addTrainerScore(records: GameRecordsState, event: number): number[] {
  const step = TRAINER_SCORE_INCREMENT[event] ?? 0
  if (step === 0) return [...records]
  return addRecord(records, RECORD_TRAINER_SCORE, step)
}

/**
 * 랭킹 머신이 줄 세우는 열세 가지 (`GetRecordValues`).
 *
 * ⚠️ **다섯은 배틀프런티어 기록이고 셋은 콘테스트다** — 둘 다 §9라 늘 0이다.
 * 그래도 줄을 지우지 않는다: 원작에서도 그 사람이 안 해 봤으면 0이고, 줄을
 * 지우면 목록이 원작과 다른 모양이 된다.
 *
 * ⚠️ **두 줄은 계산값이다** — 배틀타워 승률(승/도전)과 콘테스트 우승률(우승×100/참가).
 * 나누는 값이 0이면 0이다
 */
export const RANKED_RECORDS: readonly number[] = [
  -1, -1, -1, -1, -1, -1,
  RECORD_FAINTED_IN_BATTLE, RECORD_CAUGHT_POKEMON, RECORD_EGGS_HATCHED, RECORD_CAUGHT_FISH,
  -1, -1, -1,
]

export function rankedValue(records: GameRecordsState, row: number): number {
  const id = RANKED_RECORDS[row] ?? -1
  return id < 0 ? 0 : recordValue(records, id)
}
