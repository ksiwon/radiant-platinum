// 트레이너 카드 엿보기 — 배지 줄이 창 안쪽을 넘지 않는다
import { describe, expect, it } from 'vitest'
import { BADGE_ART } from '../common/BadgeRail'
import { GAP } from '../theme/scale'
import { PEEK_BADGE, PEEK_INNER } from './startMenu.css'

describe('엿보기의 배지 줄', () => {
  it('안쪽 폭은 창 220에서 테두리와 안쪽 여백을 뺀 190이다', () => {
    expect(PEEK_INNER).toBe(190)
  })

  it('줄 폭(여덟 칸 + 틈 일곱) ≤ 안쪽 폭', () => {
    const rail = BADGE_ART.cols * PEEK_BADGE + (BADGE_ART.cols - 1) * GAP.tight
    expect(rail).toBeLessThanOrEqual(PEEK_INNER)
    // 한 칸 더 키우면 넘친다 — 거꾸로 정한 값이 가장 큰 정수다
    expect(BADGE_ART.cols * (PEEK_BADGE + 1) + (BADGE_ART.cols - 1) * GAP.tight).toBeGreaterThan(PEEK_INNER)
  })
})
