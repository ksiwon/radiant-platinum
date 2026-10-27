// BDSP 지역에 **없는** 원작 지형을 그 상자만 원작 그림으로 세운다
//
// 걷는 칸 · 사람 · 워프 · 높이(BDHC)는 원작 자료가 쥔다. BDSP가 그 자리를 아예 안 지었으면(평평한 판 + 채움 나무) 주인공이
// BDSP 나무 꼭대기에 선다 — 고칠 쪽은 그림이다(`bdspLayoutFixes`와 같은 원칙).
//
// 예지호수근처(L03 · 맵 340): 원작은 x 302~323 · z 224~237이 높이 6인 고원이고 호수 입구 워프(308·309, 229)와 사람 둘,
// 계단(x 310 · z 238~241, 높이 6 → 3)이 그 위에 있다. BDSP `area009`는 이 고원을 없애고 높이 2의 평평한 `Ground_03`에
// 눈 나무(`Tree_03b` · `TreeSeam_01`)를 두 칸 간격으로 깔았다 — 입구는 계단 아래 (310, 240)으로 옮겼다(`MapInfo` 존 351의 Locators).
// 그래서 주인공(높이 6)이 BDSP 땅(2) 위 나무 꼭대기에 섰다 (2026-10-27 점검 · `.audit/holes-20261027/lakefront-l03.png`).
//
// 고치는 법: 상자 안 BDSP 나무를 걷고(`bdspLayoutFixes`의 `hide`), 원작 지형 가운데 **BDSP 땅보다 높은 삼각형만** 세운다 —
// 고원 윗면과 절벽 · 계단이다. BDSP 땅과 같은 높이의 원작 바닥은 안 세운다(같은 높이에 두 바닥이 겹쳐 깜빡인다)
import { BufferAttribute, BufferGeometry } from 'three'

export interface DsBox {
  /** 월드 칸 좌표 상자 (끝 포함 안 함) */
  x0: number
  z0: number
  x1: number
  z1: number
  /** 이 높이보다 높은 꼭짓점이 하나라도 있는 삼각형만 세운다 — BDSP 땅 높이 + 여유 */
  above: number
}

/** 행렬 번호 → 원작 지형을 세울 상자 */
export const DS_TERRAIN_OVER_BDSP: ReadonlyMap<number, readonly DsBox[]> = new Map([
  // 오버월드 — 예지호수근처 고원 (위 머리말)
  [0, [{ x0: 300, z0: 218, x1: 327, z1: 243, above: 2.3 }]],
])

/** 그 행렬에서 BDSP 위에 세울 원작 지형 상자. 없으면 null */
export function dsTerrainBoxes(matrix: number): readonly DsBox[] | null {
  return DS_TERRAIN_OVER_BDSP.get(matrix) ?? null
}

/** 청크 원점(ox, oz)에 놓인 지형이 상자와 겹치는가 — 청크는 32칸이다 */
export function landTouches(ox: number, oz: number, boxes: readonly DsBox[], size = 32): boolean {
  return boxes.some((b) => ox < b.x1 && ox + size > b.x0 && oz < b.z1 && oz + size > b.z0)
}

/**
 * 지형 기하에서 상자 안 · 높은 삼각형만 남긴 **새 색인**의 기하를 만든다. 남는 것이 없으면 null.
 *
 * ⚠️ 꼭짓점 버퍼를 **베껴 쓴다.** 원본과 같이 쓰면 이 기하를 버릴 때(`dispose`) 렌더러가 원본의 GPU 버퍼까지 놓는다 — 상자에 걸치는
 * 청크는 몇 개뿐이라 베끼는 값이 작다
 *
 * @param ox 이 기하가 놓인 청크 원점 x (월드 칸)
 * @param oz 이 기하가 놓인 청크 원점 z (월드 칸)
 */
export function clipToBoxes(geometry: BufferGeometry, ox: number, oz: number, boxes: readonly DsBox[]): BufferGeometry | null {
  const pos = geometry.getAttribute('position')
  if (!pos) return null
  const index = geometry.getIndex()
  const triCount = index ? index.count / 3 : pos.count / 3
  const at = (t: number, k: number): number => (index ? index.getX(t * 3 + k) : t * 3 + k)
  const keep = (t: number): boolean => {
    let cx = 0, cz = 0, top = -Infinity
    for (let k = 0; k < 3; k++) {
      const i = at(t, k)
      cx += pos.getX(i); cz += pos.getZ(i)
      top = Math.max(top, pos.getY(i))
    }
    const x = ox + cx / 3
    const z = oz + cz / 3
    return boxes.some((b) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1 && top > b.above)
  }
  const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: triCount * 3, materialIndex: 0 }]
  const out: number[] = []
  const outGroups: { start: number, count: number, materialIndex: number }[] = []
  for (const g of groups) {
    const start = out.length
    for (let t = g.start / 3; t < (g.start + g.count) / 3; t++) {
      if (keep(t)) out.push(at(t, 0), at(t, 1), at(t, 2))
    }
    if (out.length > start) outGroups.push({ start, count: out.length - start, materialIndex: g.materialIndex ?? 0 })
  }
  if (out.length === 0) return null
  const clipped = new BufferGeometry()
  for (const [name, attr] of Object.entries(geometry.attributes)) clipped.setAttribute(name, attr.clone())
  const big = pos.count > 0xffff
  clipped.setIndex(new BufferAttribute(big ? Uint32Array.from(out) : Uint16Array.from(out), 1))
  for (const g of outGroups) clipped.addGroup(g.start, g.count, g.materialIndex)
  clipped.computeBoundingBox()
  clipped.computeBoundingSphere()
  clipped.name = '원작 지형 (BDSP 위)'
  return clipped
}
