// 도트 시트 한 장의 칸 구성 (SYSTEM §2.2 `pixelSprite`).
//
// 아틀라스를 **칸 크기 · 칸 수 · 칸 사이 틈**으로만 적는다. 화면은 배경 위치를 손으로 셈하지 않고
// `ui/common/pixelSprite`에 (시트, 칸 번호, 정수 배율)을 넘긴다 — 한때 파티 아이콘의 칸 계산이
// 배율과 따로 놀아서 박스 파티 아이콘이 잘리고 옆 칸의 종이 나왔다.
//
// 그림 자체는 `providers/atlas`가 잡아 둔다. 여기는 **순수한 자료**라 시험이 흉내 내기 쉽다.

export interface SpriteSheet {
  /** 아틀라스의 논리 경로 (`data/…png`) — `atlasUrl`이 이 경로로 주소를 준다 */
  path: string
  /** 칸 하나의 원본 크기 (px) */
  cellW: number
  cellH: number
  cols: number
  rows: number
  /** 칸과 칸 사이의 빈 줄 (원본 px). 없으면 0 */
  gapX?: number
  gapY?: number
}

/** 시트 전체의 원본 크기 */
export function sheetSize(sheet: SpriteSheet): { w: number, h: number } {
  const gx = sheet.gapX ?? 0
  const gy = sheet.gapY ?? 0
  return {
    w: sheet.cols * sheet.cellW + (sheet.cols - 1) * gx,
    h: sheet.rows * sheet.cellH + (sheet.rows - 1) * gy,
  }
}
