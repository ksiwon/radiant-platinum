// 링 옆줄을 세운다 — 장막 체육관 링 셋 (REPAIR §170)
//
// 원작 링은 **앞뒤 줄만 입체다.** 줄 그림 `gym07rope`(16×16 · 4텍셀 줄 셋)를 붙인 세로 판이 링마다 앞(z 작은 쪽)과 뒤에 한 장씩 서고,
// 옆줄(x 쪽 두 변)은 없다. 대신 `gym07rope2`(64×128 · 위에서 내려다본 옆줄 그림)를 붙인 띠가 옆줄 자리에 **누워**(y 1.25 · 1.38) 있거나
// 카메라 쪽으로 기울어(수직에서 59~70°) 있다 — 위에서 비스듬히 보는 고정 카메라에서만 옆줄로 읽히는 그림이다. 3인칭에서는 옆줄이 누운
// 띠 · 바닥으로 비스듬히 꽂힌 검은 선이었다.
//
// 그래서 옆줄을 **앞뒤 줄 판을 그대로 본떠** 세운다: 링마다 앞 판과 뒤 판(같은 x 범위 · 다른 z)을 짝 짓고, 앞 판의 네 꼭짓점을 x 끝 두 자리로
// 돌려 놓아 z 방향 판 둘을 만든다. 그림 · UV · 정점 색은 앞 판 그대로다. 누운 띠는 그리지 않는다.
// 판에 몸통을 주는 것(`cards`의 `gym07rope` · 줄 높이 ¼)은 새 판에도 그대로 걸린다 — 청크를 읽는 자리에서 끼우기 때문이다
import type { ChunkMeta, Sill } from './chunkMesh'

/** 링 줄 그림과 그 옆줄 자리에 누워 있는 그림 */
export const RING_ROPES = { rope: 'gym07rope', flat: 'gym07rope2' } as const

/** 앞뒤 판을 짝 짓는 x 범위 오차 (타일) */
const SAME = 0.02

interface Plate {
  /** 네 꼭짓점 번호 — 원본 정점 배열 자리 */
  verts: number[]
  x0: number
  x1: number
  z: number
}

/**
 * 옆줄 판(서브메시 `rope`에 붙일 면)과 안 그릴 서브메시(`flat`). 링이 없는 청크면 둘 다 비었다.
 * `indices`는 파일 그대로의 색인이다 (`withSills` 전)
 */
export function ringSideRopes(
  position: Float32Array, uv: Float32Array, color: Float32Array, indices: ArrayLike<number>, meta: ChunkMeta,
): { sills: Sill[], drop: Set<number> } {
  const sills: Sill[] = []
  const drop = new Set<number>()
  const subOf = (tex: string): number[] =>
    meta.submeshes.flatMap(([mat], i) => (meta.materials[mat]?.tex === tex ? [i] : []))
  const ropes = subOf(RING_ROPES.rope)
  const flats = subOf(RING_ROPES.flat)
  if (ropes.length === 0 || flats.length === 0) return { sills, drop }

  for (const sub of ropes) {
    const [, start, count] = meta.submeshes[sub]!
    // 사각형마다 정점 넷을 따로 갖는다(`build` 머리말) — 정점을 함께 쓰는 두 삼각형이 한 판이다
    const plates = new Map<number, Set<number>>()
    for (let t = 0; t < count; t += 3) {
      const tri = [indices[start + t]!, indices[start + t + 1]!, indices[start + t + 2]!]
      const key = Math.min(...tri)
      const hit = [...plates.entries()].find(([, s]) => tri.some((v) => s.has(v)))
      const into = hit?.[1] ?? new Set<number>()
      for (const v of tri) into.add(v)
      if (!hit) plates.set(key, into)
    }
    const faces: Plate[] = []
    for (const set of plates.values()) {
      const verts = [...set]
      if (verts.length !== 4) continue
      const zs = verts.map((v) => position[v * 3 + 2]!)
      const xs = verts.map((v) => position[v * 3]!)
      // z가 하나인 판만 — 앞뒤 줄이다
      if (Math.max(...zs) - Math.min(...zs) > SAME) continue
      faces.push({ verts, x0: Math.min(...xs), x1: Math.max(...xs), z: zs[0]! })
    }
    // 같은 x 범위의 판 둘이 한 링의 앞뒤다
    const used = new Set<Plate>()
    for (const a of faces) {
      if (used.has(a)) continue
      const b = faces.find((f) => f !== a && !used.has(f)
        && Math.abs(f.x0 - a.x0) < SAME && Math.abs(f.x1 - a.x1) < SAME && Math.abs(f.z - a.z) > 1)
      if (!b) continue
      used.add(a); used.add(b)
      const near = a.z < b.z ? a : b, far = a.z < b.z ? b : a
      for (const side of [near.x0, near.x1]) {
        const out = side === near.x0 ? -1 : 1
        const p: number[] = [], t: number[] = [], c: number[] = []
        for (const v of near.verts) {
          // 앞 판의 x 자리를 옆줄의 z 자리로 — 같은 비율로 펴서 그림이 늘지 않게 한다
          const f = (position[v * 3]! - near.x0) / (near.x1 - near.x0)
          p.push(side, position[v * 3 + 1]!, near.z + f * (far.z - near.z))
          t.push(uv[v * 2]!, uv[v * 2 + 1]!)
          c.push(color[v * 3]!, color[v * 3 + 1]!, color[v * 3 + 2]!)
        }
        // 링 바깥을 보게 감는다 — 몸통(`cards`)은 앞면의 반대(링 안쪽)로 민다
        sills.push({ submesh: sub, position: p, uv: t, color: c, order: quadOrder(p, out) })
      }
    }
  }
  if (sills.length > 0) for (const f of flats) drop.add(f)
  return { sills, drop }
}

/** 세 꼭짓점이 이루는 면의 x 법선 부호 */
function facing(p: readonly number[], a: number, b: number, c: number): number {
  const ay = p[a * 3 + 1]!, az = p[a * 3 + 2]!
  const uy = p[b * 3 + 1]! - ay, uz = p[b * 3 + 2]! - az
  const vy = p[c * 3 + 1]! - ay, vz = p[c * 3 + 2]! - az
  return Math.sign(uy * vz - uz * vy)
}

/**
 * 네 꼭짓점을 두 삼각형으로 — x 법선 부호가 `out`이 되게. 원본 정점 순서가 둘레 순서라는 보장이 없어서 (y, z) 평면에서 가운데를 두고
 * 각으로 줄 세운다
 */
export function quadOrder(p: readonly number[], out: number): number[] {
  const cy = (p[1]! + p[4]! + p[7]! + p[10]!) / 4, cz = (p[2]! + p[5]! + p[8]! + p[11]!) / 4
  const at = (i: number): number => Math.atan2(p[i * 3 + 1]! - cy, p[i * 3 + 2]! - cz)
  const [a, b, c, d] = [0, 1, 2, 3].sort((i, j) => at(i) - at(j)) as [number, number, number, number]
  return facing(p, a, b, c) === out ? [a, b, c, a, c, d] : [a, c, b, a, d, c]
}
