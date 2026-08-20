// 배치 기록에서 **지금 맵의** 소품을 찾는다
//
// 소품 자체가 장치인 것들이 있다 — 꿀 나무(PARITY §6.6)와 갤럭시단아지트의
// 감금장치(§1.25)가 그렇다. 둘 다 BG 이벤트가 하나도 안 붙어 있어서 배치
// 기록의 **모델 번호만이** 그것을 가린다.
//
// ⚠️ **행렬 전체를 보면 안 된다.** 신오 행렬 하나에 꿀 나무 스무 그루가 같이
// 들어 있어서, 모델 번호만으로 찾으면 어느 도로에서나 첫 그루(205번도로)가
// 나온다.
//
// ⚠️ **그렇다고 맵 번호로 거르기만 해도 안 된다.** 제 행렬을 따로 쓰는 맵은
// 청크의 `zone`이 **−1**이라(행렬에 헤더 표가 없다) 맵 번호와 영영 안 맞는다 —
// 그렇게 걸렀더니 꽃향기의 꽃밭(256)의 나무와 갤럭시단아지트(494)의 감금장치가
// 통째로 안 그려졌다. **표식이 있을 때만 거른다.**
import type { MatrixMeta } from './grid'

/** 배치 하나. `Building`에서 우리가 쓰는 칸만 */
interface PropPlacement {
  x: number
  y: number
  z: number
}

/**
 * 지금 맵의 그 모델 배치 전부. 없으면 빈 목록.
 *
 * 차례는 배치 기록 그대로다 — 감금장치 셋처럼 여럿일 때 그 차례가 곧 번호다
 */
export function propPlacements(
  meta: MatrixMeta, mapId: number, model: number,
): PropPlacement[] {
  const out: PropPlacement[] = []
  for (const chunk of meta.chunks) {
    // 표식이 없는 행렬(제 맵 전용)은 거를 것이 없다
    if (chunk.zone >= 0 && chunk.zone !== mapId) continue
    for (const b of meta.buildings[String(chunk.i)] ?? []) {
      if (b.model === model) out.push({ x: b.x, y: b.y, z: b.z })
    }
  }
  return out
}

/** 하나뿐인 소품. 없으면 null */
export function propPlacement(
  meta: MatrixMeta, mapId: number, model: number,
): PropPlacement | null {
  return propPlacements(meta, mapId, model)[0] ?? null
}
