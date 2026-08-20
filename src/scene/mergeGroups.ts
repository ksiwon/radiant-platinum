// 같은 재질 배열을 쓰는 메시 여럿을 **한 기하로** 합친다 (REPAIR §8.2)
//
// 드로우콜은 메시 수가 아니라 **재질 그룹 수**로 난다. 그런데 청크 하나가
// 같은 재질 배열을 쓰는 메시를 둘씩 세우고 있었다:
//
//   지형 230칸 / 23메시  ·  메운 바닥 226칸 / 21메시   (`poketch` 실측)
//   소품 124칸 / 36메시  ·  소품 채운 면 113칸 / 32메시
//
// 「메운 바닥」은 숲 바닥의 구멍을 메우는 판인데 재질을 지형과 **그대로
// 공유한다.** 그래서 청크마다 지형 10콜 + 바닥 10콜이 따로 나갔다.
//
// ⚠️ **이어 붙이는 것만으로는 안 준다.** 그룹을 그냥 잇대면 같은 재질이
// 두 구간으로 남아 콜도 둘 그대로다. **재질별로 색인을 모아** 재질 하나가
// 구간 하나가 되게 다시 써야 준다.
//
// ⚠️ **같은 `Material` 객체로 풀리는 칸도 함께 묶는다.** 구운 파일은 서브메시
// 하나에 재질 칸 하나를 주는데(`chunkMesh.loadChunkMesh`), 두 서브메시가 같은
// 그림·팔레트를 쓰면 `materialsFor`가 **같은 객체**를 돌려준다. 그 둘은 원래
// 콜 하나로 그릴 수 있는 것이었다.
import { BufferAttribute, BufferGeometry, type Material } from 'three'

/** 이 기하들이 함께 쓰는 정점 속성. 하나라도 없으면 그 자리를 0으로 채운다 */
const ATTRS: readonly (readonly [string, number])[] = [
  ['position', 3], ['normal', 3], ['uv', 2], ['color', 3],
]

/**
 * `parts`를 한 기하로 합친다. `materials`는 **그대로 쓴다** — 그룹의 재질
 * 번호가 그 배열을 가리키므로 배열을 건드리면 색이 어긋난다.
 *
 * 합친 기하는 재질 하나당 그룹 하나다. 돌려주는 것이 새 기하이므로 **부르는
 * 쪽이 버려야 한다** (`geometry.dispose()`).
 */
export function mergeByMaterial(
  parts: readonly (BufferGeometry | null | undefined)[],
  materials: readonly Material[],
): BufferGeometry | null {
  const list = parts.filter((g): g is BufferGeometry => g != null)
  if (list.length === 0) return null

  // 같은 객체로 풀리는 재질 칸은 제일 앞 칸 하나로 모은다
  const slotOf = new Map<number, number>()
  const first = new Map<Material, number>()
  for (const [i, m] of materials.entries()) {
    const seen = first.get(m)
    if (seen === undefined) { first.set(m, i); slotOf.set(i, i) } else slotOf.set(i, seen)
  }

  let verts = 0
  for (const g of list) verts += g.getAttribute('position').count

  const merged = new Map<string, Float32Array>()
  for (const [name, size] of ATTRS) merged.set(name, new Float32Array(verts * size))

  /** 재질 칸 → 그 재질로 그릴 색인들 */
  const bySlot = new Map<number, number[]>()
  let base = 0
  for (const g of list) {
    const count = g.getAttribute('position').count
    // ⚠️ 법선이 없는 조각이 섞이면 그 삼각형만 새까맣게 그려진다 — 합친
    // 기하는 속성이 하나뿐이라 빈 자리가 (0,0,0)으로 남는다
    if (g.getAttribute('normal') === undefined) g.computeVertexNormals()
    for (const [name, size] of ATTRS) {
      const src = g.getAttribute(name)
      if (src === undefined) continue
      const dst = merged.get(name)!
      for (let i = 0; i < count; i++) {
        for (let a = 0; a < size; a++) dst[(base + i) * size + a] = src.getComponent(i, a)
      }
    }
    const index = g.getIndex()
    const groups = g.groups.length > 0
      ? g.groups
      : [{ start: 0, count: index?.count ?? count, materialIndex: 0 }]
    for (const grp of groups) {
      const slot = slotOf.get(grp.materialIndex ?? 0) ?? (grp.materialIndex ?? 0)
      let into = bySlot.get(slot)
      if (into === undefined) { into = []; bySlot.set(slot, into) }
      for (let k = grp.start; k < grp.start + grp.count; k++) {
        into.push(base + (index ? index.getX(k) : k))
      }
    }
    base += count
  }

  let total = 0
  for (const into of bySlot.values()) total += into.length
  // ⚠️ **u32다.** 조각 넷을 이으면 정점이 65,536을 넘을 수 있다 — u16으로
  // 두면 그 위의 삼각형이 화면 반대편으로 접힌다
  const indices = new Uint32Array(total)

  const out = new BufferGeometry()
  for (const [name, size] of ATTRS) {
    out.setAttribute(name, new BufferAttribute(merged.get(name)!, size))
  }
  let at = 0
  // 그룹 차례는 재질 칸 차례를 따른다 — 원래 그리던 차례가 그것이라
  // 반투명이 겹치는 자리의 앞뒤가 안 바뀐다
  for (const slot of [...bySlot.keys()].sort((a, b) => a - b)) {
    const into = bySlot.get(slot)!
    indices.set(into, at)
    out.addGroup(at, into.length, slot)
    at += into.length
  }
  out.setIndex(new BufferAttribute(indices, 1))
  out.computeBoundingSphere()
  return out
}
