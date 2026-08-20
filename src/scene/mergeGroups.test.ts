// 합치기가 **삼각형을 하나도 안 잃고 콜만 줄이는가** (REPAIR §8.2)
import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, MeshBasicMaterial } from 'three'
import { mergeByMaterial } from './mergeGroups'

/** 정점 셋짜리 삼각형 `n`개. 재질 그룹은 부르는 쪽이 준다 */
function tris(n: number, groups: [number, number, number][]): BufferGeometry {
  const g = new BufferGeometry()
  const verts = n * 3
  g.setAttribute('position', new BufferAttribute(new Float32Array(verts * 3), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(verts * 3), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(verts * 2), 2))
  g.setAttribute('color', new BufferAttribute(new Float32Array(verts * 3), 3))
  g.setIndex(new BufferAttribute(Uint16Array.from({ length: verts }, (_, i) => i), 1))
  for (const [start, count, mat] of groups) g.addGroup(start, count, mat)
  return g
}

const mats = (n: number) => Array.from({ length: n }, () => new MeshBasicMaterial())

describe('mergeByMaterial', () => {
  it('아무것도 없으면 아무것도 안 만든다', () => {
    expect(mergeByMaterial([null, undefined], mats(2))).toBeNull()
  })

  it('같은 재질을 쓰는 두 메시가 그룹 하나가 된다', () => {
    const a = tris(2, [[0, 6, 0]])
    const b = tris(3, [[0, 9, 0]])
    const merged = mergeByMaterial([a, b], mats(1))!
    expect(merged.groups).toHaveLength(1)
    expect(merged.getIndex()!.count).toBe(15)
    expect(merged.getAttribute('position').count).toBe(15)
  })

  it('색인이 뒤 조각의 정점을 가리키게 밀린다', () => {
    const a = tris(1, [[0, 3, 0]])
    const b = tris(1, [[0, 3, 0]])
    const merged = mergeByMaterial([a, b], mats(1))!
    const idx = merged.getIndex()!
    expect([...Array.from({ length: 6 }, (_, i) => idx.getX(i))]).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('재질이 다르면 그룹도 갈린다', () => {
    const a = tris(2, [[0, 3, 0], [3, 3, 1]])
    const merged = mergeByMaterial([a], mats(2))!
    expect(merged.groups.map((g) => g.materialIndex)).toEqual([0, 1])
  })

  it('**같은 객체**로 풀리는 두 칸은 한 그룹으로 모인다', () => {
    // 구운 파일은 서브메시마다 재질 칸을 주지만 `materialsFor`가 같은 그림·
    // 팔레트를 같은 객체로 돌려준다 — 그 둘은 콜 하나로 그릴 수 있었다
    const same = new MeshBasicMaterial()
    const a = tris(2, [[0, 3, 0], [3, 3, 1]])
    const merged = mergeByMaterial([a], [same, same])!
    expect(merged.groups).toHaveLength(1)
    expect(merged.groups[0]!.materialIndex).toBe(0)
    expect(merged.groups[0]!.count).toBe(6)
  })

  it('색인은 u32다 — 조각을 이으면 65,536을 넘는다', () => {
    const merged = mergeByMaterial([tris(1, [[0, 3, 0]])], mats(1))!
    expect(merged.getIndex()!.array).toBeInstanceOf(Uint32Array)
  })

  it('삼각형 수는 그대로다', () => {
    const parts = [tris(4, [[0, 6, 0], [6, 6, 1]]), tris(5, [[0, 15, 1]])]
    const before = parts.reduce((a, g) => a + g.getIndex()!.count, 0)
    const merged = mergeByMaterial(parts, mats(2))!
    expect(merged.getIndex()!.count).toBe(before)
    const inGroups = merged.groups.reduce((a, g) => a + g.count, 0)
    expect(inGroups).toBe(before)
  })
})
