// 화면에서 몇 픽셀인가로 LOD를 고른다 (FIRST_PERSON §10.2).
//
// ⚠️ **월드 거리로 고르면 화각과 창 크기를 모른다.** 예전 나무는 30타일에서
// 끊었는데, 같은 30타일이 창 높이 720에서는 나무 한 그루가 180픽셀이고 깨어진
// 세계의 8°짜리 화각에서는 화면을 다 덮는다. 보이는 크기가 곧 디테일의 필요다.
//
// ⚠️ **거리와 깊이도 다르다.** 화면 크기를 정하는 것은 카메라 앞쪽 축으로 잰
// 깊이다 — 화면 가장자리의 나무는 거리보다 깊이가 짧다.
//
// ⚠️ **경계에서 왕복하지 않게 한다.** 제자리에서 고개만 까딱여도 경계 바로 위의
// 나무가 매 프레임 두 모양을 오가면 그것 자체가 깜빡임이다. 위로 넘어갈 때와
// 아래로 넘어갈 때 문턱을 ±15% 벌린다.

/** 이만큼 크면 가까운 모양 (화면 픽셀) */
export const LOD_NEAR_PX = 120
/** 이보다 작으면 먼 모양 */
export const LOD_FAR_PX = 32
/** 문턱을 위아래로 벌리는 몫 */
export const LOD_HYSTERESIS = 0.15

/** 0 가까운 것 · 1 중간 · 2 먼 것 */
export type LodBand = 0 | 1 | 2

/**
 * 그 물체가 화면에서 차지하는 세로 픽셀.
 *
 * `objectHeight * viewportHeight / (2 * viewDepth * tan(fovY / 2))`.
 *
 * 카메라 뒤이거나 가까운 면 안쪽(`viewDepth`가 아주 작다)이면 무한대다 —
 * 코앞이면 제일 자세한 모양이 맞고, 뒤에 있는 것은 절두체가 이미 걸렀다
 */
export function screenPixels(
  objectHeight: number, viewportHeight: number, viewDepth: number, fovYDeg: number,
): number {
  if (!(viewDepth > 1e-3)) return Infinity
  const half = Math.tan((fovYDeg * Math.PI) / 360)
  if (!(half > 0)) return Infinity
  return (objectHeight * viewportHeight) / (2 * viewDepth * half)
}

/**
 * 픽셀 크기와 **지난번 고른 것**으로 이번 모양을 고른다.
 *
 * 지난번이 없으면(처음 보는 것) 벌림 없이 문턱 그대로 가른다. 있으면 그 쪽에
 * 머무르려는 힘을 준다 — 경계를 넘으려면 문턱을 15% 더 넘어야 한다
 */
export function pickLod(px: number, previous: LodBand | null): LodBand {
  const plain: LodBand = px >= LOD_NEAR_PX ? 0 : px >= LOD_FAR_PX ? 1 : 2
  if (previous === null || previous === plain) return plain
  const up = 1 + LOD_HYSTERESIS, down = 1 - LOD_HYSTERESIS
  switch (previous) {
    case 0:
      // 가까운 것에서 내려가려면 문턱 아래로 확실히
      if (px >= LOD_NEAR_PX * down) return 0
      return px >= LOD_FAR_PX * down ? 1 : 2
    case 1:
      if (px >= LOD_NEAR_PX * up) return 0
      if (px < LOD_FAR_PX * down) return 2
      return 1
    case 2:
      if (px >= LOD_NEAR_PX * up) return 0
      return px >= LOD_FAR_PX * up ? 1 : 2
  }
}
