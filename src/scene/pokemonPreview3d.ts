export const PREVIEW_BOTTOM = 108
export const PREVIEW_SIZE = 132

/** CSS 미리보기 창의 중심을 WebGL 카메라 NDC Y로 바꾼다. */
export function previewNdcY(viewHeight: number): number {
  if (!Number.isFinite(viewHeight) || viewHeight <= 0) return 0
  return -1 + (2 * (PREVIEW_BOTTOM + PREVIEW_SIZE / 2)) / viewHeight
}

/** 종마다 다른 실측 크기를 132px 창 안의 같은 높이로 맞춘다. */
export function previewModelScale(tall: number): number {
  if (!Number.isFinite(tall) || tall <= 0) return 0.5
  return Math.min(1.3, Math.max(0.08, 0.52 / tall))
}
