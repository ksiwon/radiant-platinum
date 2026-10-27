// BDSP 지역에 **없거나 다르게 지은** 원작 지형을 그 상자만 원작 그림으로 세운다
//
// 걷는 칸 · 사람 · 워프 · 높이(BDHC)는 원작 자료가 쥔다. BDSP가 그 자리를 아예 안 지었거나(평평한 판 + 채움 나무) 다른 높이로
// 지었으면 주인공이 BDSP 나무 꼭대기에 서거나 BDSP 땅 밑에 묻힌다 — 고칠 쪽은 그림이다(`bdspLayoutFixes`와 같은 원칙).
//
// 예지호수근처(L03 · 맵 340): 원작은 x 302~323 · z 224~237이 높이 6인 고원이고 호수 입구 워프(308·309, 229)와 사람 둘,
// 계단(x 310 · z 238~241, 높이 6 → 3)이 그 위에 있다. BDSP `area009`는 이 고원을 없애고 높이 2의 평평한 `Ground_03`에
// 눈 나무(`Tree_03b` · `TreeSeam_01`)를 두 칸 간격으로 깔았다 — 입구는 계단 아래 (310, 240)으로 옮겼다(`MapInfo` 존 351의 Locators).
// 그래서 주인공(높이 6)이 BDSP 땅(2) 위 나무 꼭대기에 섰다 (2026-10-27 점검 · `.audit/holes-20261027/lakefront-l03.png`).
// 고치는 법: 상자 안 BDSP 나무를 걷고(`bdspLayoutFixes`의 `hide`), 원작 지형 가운데 **BDSP 땅보다 높은 삼각형만** 세운다 —
// 고원 윗면과 절벽 · 계단이다. BDSP 땅과 같은 높이의 원작 바닥은 안 세운다(같은 높이에 두 바닥이 겹쳐 깜빡인다).
//
// 하드마운틴 바깥(D16 · 맵 262 · 청크 (736, 224)): 원작은 동굴 입구(750, 231)를 둘러 높이 4~9의 길이 미로처럼 돈다 —
// 고리 길 6 · 가운데 막힌 구덩이 4 · 동쪽 고원 9. BDSP `area012`는 같은 자리를 높이 11의 평평한 판(`Ground_04c`)에
// 풀숲 · 바위 오르기 벽 · 바위(`RockTop_04` 12)로 다시 지었고 길 모양도 다르다 — 원작 길 칸 (745, 244)에 BDSP 바위가 선다.
// 주인공(4~9)이 BDSP 땅(11~14) 밑에 묻혀 카메라가 땅 밑 바닥만 비췄다 (`.audit/holes-20261027/stark-d16-*.png`).
// 높이를 BDSP에 맞추면 길이 바위를 뚫으므로, 상자 안 BDSP를 **통째로** 걷고(`bdspLayoutFixes`의 `cut`) 원작 지형 전부와
// 원작 소품(584 · 585)을 세운다. BDSP는 z 250 줄에 땅이 없고(절벽만) z 251부터 땅(5)이 원작(5)과 같아, 상자를 z 250 줄까지 잡아 남쪽 이음매를 맞춘다
import { BufferAttribute, BufferGeometry, Matrix4, Vector3 } from 'three'

export interface DsBox {
  /** 월드 칸 좌표 상자 (끝 포함 안 함) */
  x0: number
  z0: number
  x1: number
  z1: number
  /** 이 높이보다 높은 꼭짓점이 하나라도 있는 삼각형만 세운다 — BDSP 땅 높이 + 여유. 상자를 통째로 세우면 `-Infinity` */
  above: number
}

/** 행렬 번호 → 원작 지형을 세울 상자 */
export const DS_TERRAIN_OVER_BDSP: ReadonlyMap<number, readonly DsBox[]> = new Map([
  [0, [
    // 오버월드 — 예지호수근처 고원 (위 머리말)
    { x0: 300, z0: 218, x1: 327, z1: 243, above: 2.3 },
    // 하드마운틴 바깥 — 통째로 (위 머리말 · `bdspLayoutFixes` area012의 `cut`과 같은 상자)
    { x0: 736, z0: 224, x1: 768, z1: 251, above: -Infinity },
  ]],
])

/**
 * 원작 소품 가운데 BDSP 위에도 세울 것 — 행렬 번호 → 모델 번호.
 * 하드마운틴 바깥의 584 · 585는 오버월드에서 그 청크(233)에만 놓인다
 */
export const DS_PROPS_OVER_BDSP: ReadonlyMap<number, ReadonlySet<number>> = new Map([
  [0, new Set([584, 585])],
])

/** 그 행렬에서 BDSP 위에 세울 원작 지형 상자. 없으면 null */
export function dsTerrainBoxes(matrix: number): readonly DsBox[] | null {
  return DS_TERRAIN_OVER_BDSP.get(matrix) ?? null
}

/** 그 행렬에서 BDSP 위에도 세울 원작 소품 번호. 없으면 null */
export function dsPropsOverBdsp(matrix: number): ReadonlySet<number> | null {
  return DS_PROPS_OVER_BDSP.get(matrix) ?? null
}

/**
 * 풀숲 포기(`[x, y, z, 길이]` 넷씩) 가운데 **통째로 세우는 상자**(`above`가 `-Infinity`) 안의 것만. 없으면 null.
 * 높이만 고르는 상자(예지호수근처)는 BDSP 땅이 남아 그쪽 풀이 선다
 */
export function spotsInBoxes<T extends { spots: Float32Array }>(field: T | null, boxes: readonly DsBox[]): T | null {
  if (field === null) return null
  const whole = boxes.filter((b) => b.above === -Infinity)
  if (whole.length === 0) return null
  const out: number[] = []
  const s = field.spots
  for (let i = 0; i + 3 < s.length; i += 4) {
    const x = s[i]!, z = s[i + 2]!
    if (whole.some((b) => x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1)) out.push(s[i]!, s[i + 1]!, s[i + 2]!, s[i + 3]!)
  }
  return out.length === 0 ? null : { ...field, spots: new Float32Array(out) }
}

/** 청크 원점(ox, oz)에 놓인 지형이 상자와 겹치는가 — 청크는 32칸이다 */
export function landTouches(ox: number, oz: number, boxes: readonly DsBox[], size = 32): boolean {
  return boxes.some((b) => ox < b.x1 && ox + size > b.x0 && oz < b.z1 && oz + size > b.z0)
}

/**
 * 삼각형을 골라 남긴 **새 색인**의 기하를 만든다. 다 남으면 원본을, 남는 것이 없으면 null을 돌려준다.
 *
 * ⚠️ 꼭짓점 버퍼를 **베껴 쓴다.** 원본과 같이 쓰면 이 기하를 버릴 때(`dispose`) 렌더러가 원본의 GPU 버퍼까지 놓는다 — 상자에 걸치는
 * 기하는 몇 개뿐이라 베끼는 값이 작다
 *
 * @param keep 세 꼭짓점(`xf`를 건 자리)을 받아 남길지 고른다
 * @param xf 꼭짓점을 고르는 좌표계로 옮기는 행렬. 없으면 기하 좌표 그대로
 */
export function keepTriangles(
  geometry: BufferGeometry,
  keep: (a: Vector3, b: Vector3, c: Vector3) => boolean,
  xf?: Matrix4,
): BufferGeometry | null {
  const pos = geometry.getAttribute('position')
  if (!pos) return geometry
  const index = geometry.getIndex()
  const triCount = index ? index.count / 3 : pos.count / 3
  const at = (t: number, k: number): number => (index ? index.getX(t * 3 + k) : t * 3 + k)
  const v = [new Vector3(), new Vector3(), new Vector3()] as const
  const kept = (t: number): boolean => {
    for (let k = 0; k < 3; k++) {
      v[k].fromBufferAttribute(pos, at(t, k))
      if (xf) v[k].applyMatrix4(xf)
    }
    return keep(v[0], v[1], v[2])
  }
  const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count: triCount * 3, materialIndex: 0 }]
  const out: number[] = []
  const outGroups: { start: number, count: number, materialIndex: number }[] = []
  let dropped = false
  for (const g of groups) {
    const start = out.length
    const end = Math.min(g.start + g.count, triCount * 3)
    for (let t = g.start / 3; t < end / 3; t++) {
      if (kept(t)) out.push(at(t, 0), at(t, 1), at(t, 2))
      else dropped = true
    }
    if (out.length > start) outGroups.push({ start, count: out.length - start, materialIndex: g.materialIndex ?? 0 })
  }
  if (!dropped) return geometry
  if (out.length === 0) return null
  const picked = new BufferGeometry()
  for (const [name, attr] of Object.entries(geometry.attributes)) picked.setAttribute(name, attr.clone())
  const big = pos.count > 0xffff
  picked.setIndex(new BufferAttribute(big ? Uint32Array.from(out) : Uint16Array.from(out), 1))
  for (const g of outGroups) picked.addGroup(g.start, g.count, g.materialIndex)
  picked.computeBoundingBox()
  picked.computeBoundingSphere()
  picked.name = geometry.name
  return picked
}

/**
 * 지형 기하에서 상자 안 · 높은 삼각형만 남긴 기하. 남는 것이 없으면 null.
 *
 * @param ox 이 기하가 놓인 청크 원점 x (월드 칸)
 * @param oz 이 기하가 놓인 청크 원점 z (월드 칸)
 */
export function clipToBoxes(geometry: BufferGeometry, ox: number, oz: number, boxes: readonly DsBox[]): BufferGeometry | null {
  const clipped = keepTriangles(geometry, (a, b, c) => {
    const x = ox + (a.x + b.x + c.x) / 3
    const z = oz + (a.z + b.z + c.z) / 3
    const top = Math.max(a.y, b.y, c.y)
    return boxes.some((q) => x >= q.x0 && x < q.x1 && z >= q.z0 && z < q.z1 && top > q.above)
  })
  if (clipped === null) return null
  // 다 남았어도 새 기하로 돌려준다 — 부르는 쪽이 이것을 버린다
  const out = clipped === geometry ? geometry.clone() : clipped
  out.name = '원작 지형 (BDSP 위)'
  return out
}
