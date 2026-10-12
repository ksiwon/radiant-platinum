// BDSP 수면의 높이 — 파도타기 몸이 그 위에 선다 (`FieldActionEffects`)
//
// 걸음 칸 높이(원작 BDHC)는 그대로고 **그리는 높이만** 맞춘다. 운하시티 수로는 원작 물 칸이 0.5인데 BDSP 바다 판(`SeaWater_03`)은 0.98이라
// 몸(높이 0.93 · 밑이 물 높이보다 0.058 아래)이 0.48 가라앉아 머리만 보였다. 호수(시린호 311 · 312)는 원작 물 칸 높이와 BDSP 호수 판이 같다(−0.5 ↔ −0.52 ·
// 0.5 ↔ 0.48) — 그쪽은 값이 0이다.
import type { Box3, Mesh, Object3D } from 'three'

interface Tracked { mesh: Mesh, x0: number, x1: number, z0: number, z1: number, y: number, key: string }

const tracked = new Map<Mesh, Tracked>()

/** `liveWater`가 갈아 끼운 물 메시를 등록한다 — 그 메시가 장면에서 떨어지면 저절로 빠진다 */
export function trackWater(mesh: Mesh): void {
  if (!tracked.has(mesh)) tracked.set(mesh, { mesh, x0: 0, x1: 0, z0: 0, z1: 0, y: 0, key: '' })
}

const attached = (o: Object3D): boolean => {
  for (let q: Object3D | null = o; q; q = q.parent) if ((q as { isScene?: boolean }).isScene === true) return true
  return false
}

/** 메시의 월드 상자. 메시가 옮겨 가면(던전 들어올림 · 물 가라앉힘) 다시 잰다 */
function boxOf(t: Tracked): Tracked {
  t.mesh.updateWorldMatrix(true, false)
  const e = t.mesh.matrixWorld.elements
  const key = `${String(e[12])},${String(e[13])},${String(e[14])},${String(e[0])},${String(e[10])}`
  if (key === t.key) return t
  const g = t.mesh.geometry
  if (g.boundingBox === null) g.computeBoundingBox()
  const b = (g.boundingBox as Box3).clone().applyMatrix4(t.mesh.matrixWorld)
  t.x0 = b.min.x; t.x1 = b.max.x; t.z0 = b.min.z; t.z1 = b.max.z; t.y = b.max.y
  t.key = key
  return t
}

/**
 * 그 자리 수면의 높이. 물 판이 없으면 `null`.
 * 판이 여럿 겹치면 `near`(지금 서는 높이)에 가장 가까운 것이다 — 바다 두 판이 겹친 곳(area014)은 같은 높이다
 */
export function waterLevelAt(x: number, z: number, near: number): number | null {
  let best: number | null = null
  for (const [m, t] of tracked) {
    if (!attached(m)) { tracked.delete(m); continue }
    const b = boxOf(t)
    if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue
    if (best === null || Math.abs(b.y - near) < Math.abs(best - near)) best = b.y
  }
  return best
}
