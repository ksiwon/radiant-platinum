// 시설 화면 셋(팩토리 · 슬롯 · 교환)의 순수 규칙 — 바닥 안내 · 머리 note · 슬롯 확대 식.
//
// 화면이 그리는 글과 숫자를 화면 밖에서 시험할 수 있게 뗐다 (`facilitiesFoot.test.ts`).
// 바닥 동사는 SYSTEM §0 L6의 한 벌이다 — 「X 닫기」 하나, 뜻이 다른 「중지」 · 「한 마리 되돌리기」는 그대로 둔다.
import { ChallengeType } from '../../engine/frontier/factory'
import { fillMenuText, FRONTIER_TEXT } from '../../data/uiText'

/** 팩토리가 지금 무엇을 묻고 있나 — `FactoryScreen`의 `Ask`와 같은 이름이다 */
export type FactoryAsk = 'list' | 'options' | 'confirm' | 'receive' | 'accept' | 'cancelTrade' | 'done'

/**
 * 팩토리 바닥 안내.
 *
 * 빌리기 목록의 X는 **아무 일도 안 한다** — 셋을 골라야 나간다. 안 되는 키를 약속하지 않는다.
 * 바꾸기 목록의 X는 「포켓몬 교환을 중지하겠습니까?」를 연다(`중지`). 확인(`confirm`)의 X는 마지막 한 마리를 되돌린다
 */
export function factoryFoot(phase: 'rental' | 'trade', ask: FactoryAsk): string {
  switch (ask) {
    case 'list': return phase === 'trade' ? '↑↓ 고르기 · Z 결정 · X 중지' : '↑↓ 고르기 · Z 결정'
    case 'receive': return '↑↓ 고르기 · Z 결정 · X 중지'
    case 'options':
    case 'accept': return '↑↓ 고르기 · Z 결정 · X 닫기'
    case 'confirm': return '↑↓ 고르기 · Z 결정 · X 한 마리 되돌리기'
    // X가 아무 일도 안 한다 — 「중지하겠습니까?」에는 예 · 아니오로만 답한다
    case 'cancelTrade': return '↑↓ 고르기 · Z 결정'
    case 'done': return 'Z · X 닫기'
  }
}

/** 프런티어 기록 뱅크(16)의 「더블」 · 「멀티」 — `FRONTIER_TEXT`에는 「싱글」만 있다 */
const CHALLENGE_LINE: Readonly<Record<number, number>> = {
  [ChallengeType.SINGLE]: FRONTIER_TEXT.single,
  [ChallengeType.DOUBLE]: 2,
  [ChallengeType.MULTI]: 3,
  [ChallengeType.MULTI_WFC]: 3,
}

/**
 * 팩토리 머리 오른쪽 한 줄 — 「싱글 · 레벨 50 · 0연승」. 글은 전부 뱅크 16이고 값은 실제 라운드다.
 * 뱅크가 아직 안 왔으면 빈 글이다(지어내지 않는다)
 */
export function factoryNote(
  round: { challenge: number, openLevel: boolean, streak: number } | null, bank: readonly string[],
): string {
  if (round === null) return ''
  const kind = bank[CHALLENGE_LINE[round.challenge] ?? FRONTIER_TEXT.single]
  const level = bank[round.openLevel ? FRONTIER_TEXT.openLevel : FRONTIER_TEXT.level50]
  const streak = bank[FRONTIER_TEXT.streak]
  if (kind === undefined || level === undefined || streak === undefined) return ''
  return [kind, level, fillMenuText(streak, [String(round.streak)])].join(' · ')
}

/** 슬롯 바닥 안내 — 조작 → 닫기 차례다 (L6) */
export const SLOT_FOOT = 'C 동전 · S 레버 · F X Space 릴 멈춤 · Esc 그만두기'

/** 슬롯 기계 그림(원작 한 판)의 크기 — `slot/slotStage`의 `SCREEN_W` · `SCREEN_H`와 같다 */
const SLOT_W = 256
const SLOT_H = 192
/** 기계 아래 키 안내 줄과 여백 */
const SLOT_BELOW = 56
/** 오른쪽 달밤 열이 먹는 폭 — 달밤 256 + 판독부 여백 + 기계 열의 양옆 여백 */
const SLOT_SIDE = 304

/**
 * 슬롯 기계의 확대 배수 — **정수**다. 비정수배는 픽셀 열이 고르지 않아 쓰지 않는다.
 *
 * 본문 칸 크기에서 거꾸로 정한다: 세로는 기계 아래 키 안내 줄을 빼고, 가로는 오른쪽 달밤 열을 뺀다.
 * 960×640(본문 약 954×568)에서 2배이고 1040×648 상한에서도 2배다(3배는 576px라 본문 528을 넘는다)
 */
export function slotScale(bodyW: number, bodyH: number): 1 | 2 | 3 | 4 {
  const byH = Math.floor((bodyH - SLOT_BELOW) / SLOT_H)
  const byW = Math.floor((bodyW - SLOT_SIDE) / SLOT_W)
  return Math.min(4, Math.max(1, Math.min(byH, byW))) as 1 | 2 | 3 | 4
}

/**
 * 기계의 릴 셋 아래 키 안내 자리 — 원작 단추(Y · B · A) 칸의 가운데 x (원작 256 기준).
 * 단추 칸 타일 (7,17) · (15,17) · (22,17)의 3×2에서 나왔다
 */
export const SLOT_KEY_X = [68, 132, 188] as const

/** 릴 아래 키 안내 — 왼쪽(F) · 가운데(X) · 오른쪽(Space) */
export const SLOT_REEL_KEYS = ['F', 'X', 'Space'] as const
