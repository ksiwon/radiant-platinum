// 갈래 창 · 레벨업 창이 앉는 자리 (순수 함수).
//
// 명판 여섯이 두 열로 빈틈 없이 서 있어서, 판 **옆**에 창을 띄우면 이웃 열의 이름과 HP 막대를 덮는다. 그래서
// **고른 판이 선 열 안에** 앉힌다 — 판의 오른쪽 끝에 맞추고 세로는 판의 가운데에 맞춘다. 이름 · 원반 · 그림은 왼쪽에
// 남고, 덮이는 것은 그 판 자신의 Lv · HP 숫자 쪽이다. 세로로 판보다 큰 창(갈래 여섯 줄)은 위아래로 고르게 삐져나가는데,
// 그 자리는 이웃 판의 띠 바깥(띠 위 · 아래의 빈 자리)이라 이웃의 글을 안 덮는다. 본문 위아래 끝에서는 당긴다.
// 갈래가 넷(요약 · 순서 · 도구 · 그만둔다)이면 판 안에 다 든다.
import type { Box } from '../common/choicePlace'

interface PartyPlacement {
  left: number
  top: number
}

/** 창이 판 오른쪽 끝에서 안쪽으로 들어오는 여백(px) */
export const INSET = 8

/**
 * @param plate 고른 판의 사각형 (본문 기준 좌표)
 * @param size 창의 크기
 * @param bounds 본문의 사각형 (같은 좌표계). 창은 이 안에 머문다
 */
export function placeInColumn(
  plate: Box, size: { width: number, height: number }, bounds: Box,
): PartyPlacement {
  const left = Math.min(
    plate.left + plate.width - size.width - INSET,
    bounds.left + bounds.width - size.width,
  )
  const centered = plate.top + plate.height / 2 - size.height / 2
  const top = Math.max(bounds.top, Math.min(centered, bounds.top + bounds.height - size.height))
  return { left: Math.max(bounds.left, left), top }
}

/** 갈래 창의 높이 어림 — 줄 수 × 줄 높이 + 창 안 여백과 테두리 (`choiceMenu.css`의 `root`) */
export function choiceHeight(rows: number, rowHeight: number, pad: number, edge: number): number {
  return rows * rowHeight + 2 * (pad + edge)
}
