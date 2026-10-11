// 행렬 도우미 — 유니티 월드 행렬(행 우선 4×4)을 glTF 노드로 (`field.ts` · `arena.ts`가 같이 쓴다)
//
// ⚠️ 맵은 x를 뒤집어 굽는다 — 정점은 제 좌표에서 x만 뒤집고, 행렬은 `F·W·F` (F = diag(−1, 1, 1))로 옮긴다
export type Mat4 = Float64Array

/** Unity 월드 행렬 → 원작 좌표(x 뒤집기)의 행렬. `F·W·F` (F = diag(−1, 1, 1)) */
export function flipped(w: Mat4): Mat4 {
  const m = Float64Array.from(w)
  // 행 0과 열 0의 부호를 바꾼다(교차 칸 [0]은 두 번 바뀌어 그대로)
  for (let c = 1; c < 4; c++) m[c] = -m[c]!
  for (let r = 1; r < 4; r++) m[r * 4] = -m[r * 4]!
  return m
}

/** 행 우선 4×4 → 이동 · 회전(사원수) · 배율. 밀림(shear)은 버린다 */
export function decompose(m: Mat4): { t: number[], r: number[], s: number[] } {
  const col = (c: number): number[] => [m[c]!, m[4 + c]!, m[8 + c]!]
  const cx = col(0), cy = col(1), cz = col(2)
  let sx = Math.hypot(...cx); const sy = Math.hypot(...cy); const sz = Math.hypot(...cz)
  const det = cx[0]! * (cy[1]! * cz[2]! - cy[2]! * cz[1]!) - cy[0]! * (cx[1]! * cz[2]! - cx[2]! * cz[1]!)
    + cz[0]! * (cx[1]! * cy[2]! - cx[2]! * cy[1]!)
  if (det < 0) sx = -sx
  const r00 = cx[0]! / sx, r10 = cx[1]! / sx, r20 = cx[2]! / sx
  const r01 = cy[0]! / sy, r11 = cy[1]! / sy, r21 = cy[2]! / sy
  const r02 = cz[0]! / sz, r12 = cz[1]! / sz, r22 = cz[2]! / sz
  const trace = r00 + r11 + r22
  let x: number, y: number, z: number, w: number
  if (trace > 0) {
    const k = 0.5 / Math.sqrt(trace + 1)
    w = 0.25 / k; x = (r21 - r12) * k; y = (r02 - r20) * k; z = (r10 - r01) * k
  } else if (r00 > r11 && r00 > r22) {
    const k = 2 * Math.sqrt(1 + r00 - r11 - r22)
    w = (r21 - r12) / k; x = 0.25 * k; y = (r01 + r10) / k; z = (r02 + r20) / k
  } else if (r11 > r22) {
    const k = 2 * Math.sqrt(1 + r11 - r00 - r22)
    w = (r02 - r20) / k; x = (r01 + r10) / k; y = 0.25 * k; z = (r12 + r21) / k
  } else {
    const k = 2 * Math.sqrt(1 + r22 - r00 - r11)
    w = (r10 - r01) / k; x = (r02 + r20) / k; y = (r12 + r21) / k; z = 0.25 * k
  }
  const len = Math.hypot(x, y, z, w) || 1
  return { t: [m[3]!, m[7]!, m[11]!], r: [x / len, y / len, z / len, w / len], s: [sx, sy, sz] }
}

/** glTF 노드 행렬(열 우선) */
export function columnMajor(m: Mat4): number[] {
  const out: number[] = []
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out.push(m[r * 4 + c]!)
  return out
}

