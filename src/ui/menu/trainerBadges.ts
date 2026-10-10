// 트레이너 카드의 배지 표 — 배지 비트마다 관장 · 도시 · 배지 이름이 어디서 오는지.
//
// 원작 카드는 배지를 그림으로만 보인다. 이 화면은 고른 배지에 관장 그림 · 도시 · 배지 이름을 붙인다 (trainer.md §4.3).
// 우리 세이브에는 배지를 이긴 날짜가 없고(`badges`는 비트 여덟이다) 그 칸을 지어내지 않는다.
//
// ⚠️ **글은 롬에서만 뽑는다.** 관장 이름은 `names/trainers`, 도시는 `names/locations`, 그림은 `trainers/<갈래>.png`,
// 배지 이름은 리그 문지기 대사(`dialogue/*/184`)의 「…시티의 ○○배지!」 여덟 토막에서 뽑는다. 롬에 배지 이름만 있는 줄이
// 없기 때문이다. 못 뽑으면 이름 줄을 비운다 — 지어내지 않는다.

/** 배지 비트 하나의 출처 */
export interface BadgeLeader {
  /** `names/trainers.*`의 번호 (관장 이름) */
  trainer: number
  /** `trainers/<갈래>.png`의 갈래 번호 (`generated/trainer_classes.txt`의 `LEADER_*` 줄 − 1) */
  cls: number
  /** `names/locations.*`의 번호 (도시 이름) */
  place: number
}

/** 배지 비트 차례 (`BADGE_ID_COAL` … `_BEACON`) — 석탄 · 숲 · 광석 · 늪 · 유물 · 광산 · 고드름 · 등대 */
export const BADGE_COUNT = 8

/**
 * 비트 차례 여덟 줄. 번호는 `generated/trainer_classes.txt` · `names/*.ko.json`에서 잰 값이다.
 *
 *   콜 강석(246 · 갈래 62 · 무쇠시티 8) · 포리스트 유채(315 · 74 · 영원시티 9) · 코블 자두(317 · 76 · 장막시티 12) ·
 *   펜 맥실러(316 · 75 · 들판시티 11) · 레릭 멜리사(318 · 77 · 연고시티 10) · 마인 동관(250 · 64 · 운하시티 7) ·
 *   글레이셔 무청(319 · 78 · 선단시티 14) · 비컨 전진(320 · 79 · 물가시티 13)
 */
export const BADGE_LEADERS: readonly BadgeLeader[] = [
  { trainer: 246, cls: 62, place: 8 },
  { trainer: 315, cls: 74, place: 9 },
  { trainer: 317, cls: 76, place: 12 },
  { trainer: 316, cls: 75, place: 11 },
  { trainer: 318, cls: 77, place: 10 },
  { trainer: 250, cls: 64, place: 7 },
  { trainer: 319, cls: 78, place: 14 },
  { trainer: 320, cls: 79, place: 13 },
]

/**
 * 리그 문지기 대사에 배지가 나오는 차례(도전 차례)에서 배지 비트로.
 *
 * 대사는 콜 · 포리스트 · 레릭 · 코블 · 펜 · 마인 · 글레이셔 · 비컨 순이다(관장을 만나는 차례). 비트는 레릭과 코블 · 펜이
 * 다르다 — `[0, 1, 4, 2, 3, 5, 6, 7]`
 */
export const BADGE_BIT_OF_LINE: readonly number[] = [0, 1, 4, 2, 3, 5, 6, 7]

/**
 * 배지 한 칸(40×63) 안에서 도트가 서는 높이 — 정사각 40×40 창의 위 끝.
 *
 * 시트 한 칸은 위 줄 배지(0~3)와 아래 줄 배지(4~7)를 한 상자에 담느라 63이다. 도트는 위 줄이 y 0~40, 아래 줄이 y 25~63에
 * 선다(`badges.png` 알파로 잰 값). 칸 전체를 그대로 놓으면 아래 줄 배지가 홈 안에서 한 단 낮게 선다 — 창을 이 높이에서
 * 40만큼만 잘라 모든 배지가 **같은 정사각 칸의 같은 기준선**에 서게 한다 (DECISIONS 사용자 지적 ①)
 */
export const BADGE_WINDOW_TOP: readonly number[] = [0, 0, 0, 0, 23, 23, 23, 23]
/** 창의 크기 — 위 · 아래 줄 도트가 다 든다 */
export const BADGE_WINDOW = 40
/** 받은 배지인가 */
export function hasBit(badges: number, bit: number): boolean {
  return (badges & (1 << bit)) !== 0
}

/** 받은 배지 비트들(작은 번호부터) */
export function earnedBits(badges: number): number[] {
  const out: number[] = []
  for (let i = 0; i < BADGE_COUNT; i++) if (hasBit(badges, i)) out.push(i)
  return out
}

/** 처음 열 때 고르는 배지 — 받은 것 중 가장 높은 번호. 하나도 없으면 null */
export function firstPick(badges: number): number | null {
  const got = earnedBits(badges)
  return got.length === 0 ? null : got[got.length - 1]!
}

/**
 * 배지 커서 한 걸음 — **받은 배지만 밟는다.** ←→는 받은 것을 하나씩, ↑↓는 받은 것을 두 칸씩(홈이 2열이라 한 줄) 감는다.
 *
 * 받은 것 사이를 빙 돈다(끝에서 처음으로). 받은 것이 하나뿐이면 제자리라 `null`을 돌려준다(소리를 안 낸다)
 */
export function stepBadge(badges: number, at: number | null, dir: 'left' | 'right' | 'up' | 'down'): number | null {
  const got = earnedBits(badges)
  if (got.length === 0) return null
  const delta = dir === 'right' ? 1 : dir === 'left' ? -1 : dir === 'down' ? 2 : -2
  const from = at === null ? -1 : got.indexOf(at)
  const base = from < 0 ? got.length - 1 : from
  const next = got[(((base + delta) % got.length) + got.length) % got.length]!
  return next === at ? null : next
}

/** 「…의 ○○배지!」 한 토막에서 배지 이름. 한국어 「의」 · 영어 「’s」 · 일본어 「の」 뒤가 이름이다 */
const NAME_AFTER_OWNER = /(?:의|['’]s|の)[\s\u3000]+(.+?)[!！]\s*$/u

/**
 * 리그 문지기 대사(`184`번 뱅크)에서 **배지 비트마다** 이름을 뽑는다. 뽑지 못한 비트는 `null`이다.
 *
 * 대사 한 줄에 `\r` 토막이 이어 붙어 있고(`무쇠시티의 콜배지!\r영원시티의 …`), 맨 뒤 여덟 토막이 배지다. 마지막은 앞에
 * 「그리고!\n」가 붙는다. 토막 차례는 `BADGE_BIT_OF_LINE`이다
 */
export function badgeNames(bank: readonly string[]): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: BADGE_COUNT }, () => null)
  for (const entry of bank) {
    const parts = entry.split('\r').map((s) => s.trim()).filter((s) => s !== '')
    if (parts.length < BADGE_COUNT) continue
    const tail = parts.slice(-BADGE_COUNT)
    const found = tail.map((p) => NAME_AFTER_OWNER.exec(p.slice(p.lastIndexOf('\n') + 1))?.[1]?.trim() ?? null)
    if (found.some((n) => n === null)) continue
    found.forEach((n, line) => { out[BADGE_BIT_OF_LINE[line]!] = n })
    return out
  }
  return out
}

/** 이름표 값이 비었거나 틀 부호가 남았으면(영어 판의 관장 이름은 `{TRNAME}` 부호다) 보이지 않는다 */
export function usableName(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const s = raw.trim()
  return s === '' || s.includes('{') ? null : s
}
