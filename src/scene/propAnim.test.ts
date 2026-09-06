// 구운 것을 그대로 다시 읽어 **문이 실제로 얼마나 도는지** 잰다.
//
// 여기가 파이프라인 전체의 마지막 매듭이다 — 굽는 쪽이 실은 노드 기본 변환과
// 애니 바이트를 화면 쪽 코드로 풀어, `AnimatedProp`이 그룹에 넣을 바로 그
// 행렬을 낸다. 눈으로 「돌더라」 하지 않고 **각도로** 잰다.
import { expect, it, describe } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BufferAttribute, BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { propAnimsSchema, type PropAnimsFile } from '../data/schema'
import { readNsbca } from '../import/platinum/nsbca'
import { nodeMatrixAt, splitByNode } from './propAnim'
import type { ChunkMesh } from './chunkMesh'

const ROOT = resolve(__dirname, '../..')
const JSON_AT = resolve(ROOT, 'public/data/props/anims.json')
const BIN_AT = resolve(ROOT, 'public/data/props/anims.bin')
const has = existsSync(JSON_AT) && existsSync(BIN_AT)

const table = (): PropAnimsFile =>
  propAnimsSchema.parse(JSON.parse(readFileSync(JSON_AT, 'utf8')))
const bytes = (): Uint8Array => new Uint8Array(readFileSync(BIN_AT))

/** 소품의 클립 하나를 푼다 */
function clipOf(t: PropAnimsFile, b: Uint8Array, prop: number, slot: number) {
  const id = t.props[String(prop)]![slot]!
  const row = t.members[id]!
  return { row, anim: readNsbca(b.subarray(row.at, row.at + row.size))[0]! }
}

/** 그룹 행렬에서 Y축 회전각(도) */
function yawOf(m: Matrix4): number {
  const q = new Quaternion()
  m.decompose(new Vector3(), q, new Vector3())
  return (new Euler().setFromQuaternion(q, 'YXZ').y * 180) / Math.PI
}

describe.skipIf(!has)('소품 애니 — 구운 것으로', () => {
  it('여닫이 문이 여덟 프레임에 정확히 90도 돈다', () => {
    const t = table(), b = bytes()
    // 소품 66 `door01` — 노드 하나(`door`)고 기본 변환이 단위다
    const { row, anim } = clipOf(t, b, 66, 0)
    expect(row.kind).toBe('BCA0')
    expect(row.frames).toBe(8)
    const base = t.models['66']!.nodes[0]!
    // 첫 프레임은 닫힌 자리 — 그룹 행렬이 단위여야 한다
    expect(yawOf(nodeMatrixAt(base, anim, 0, 0))).toBeCloseTo(0, 4)
    // 마지막 프레임이 −90도다. 사이는 고르게 나뉜다
    expect(yawOf(nodeMatrixAt(base, anim, 0, 7))).toBeCloseTo(-90, 3)
    expect(yawOf(nodeMatrixAt(base, anim, 0, 4))).toBeCloseTo(-51.43, 1)
    // 닫는 클립은 거꾸로다
    const shut = clipOf(t, b, 66, 1)
    expect(yawOf(nodeMatrixAt(base, shut.anim, 0, 0))).toBeCloseTo(-90, 3)
    expect(yawOf(nodeMatrixAt(base, shut.anim, 0, 7))).toBeCloseTo(0, 4)
  })

  it('체육관 미닫이는 **안 돌고** 두 짝이 문틀로 들어간다', () => {
    // 소품 298 `gym_door` — 노드 셋(`null1`·`pCube1`·`pCube2`)에 짝이 둘이다.
    // 원작 클립이 X 크기를 0으로 누르면서 서로 반대쪽으로 16유닛 민다
    const t = table(), b = bytes()
    const { row, anim } = clipOf(t, b, 298, 0)
    expect(row.frames).toBe(10)
    expect(anim.tracks.map((tr) => tr.node)).toEqual([1, 2])
    const info = t.models['298']!
    const at = (node: number, frame: number): Matrix4 =>
      nodeMatrixAt(info.nodes[node]!, anim, node, frame)

    // ⚠️ **`decompose`로 재면 안 된다.** 마지막 프레임은 X 배율이 0이라 행렬이
    // 특이해지고, three의 `decompose`는 그때 배율을 (1,1,1)로 돌려준다 —
    // 실제로 그렇게 재다가 「문이 다시 커진다」를 못 볼 뻔했다. 열로 잰다
    const col = (m: Matrix4, i: number): Vector3 =>
      new Vector3(m.elements[i * 4]!, m.elements[i * 4 + 1]!, m.elements[i * 4 + 2]!)
    for (const node of [1, 2]) {
      expect(yawOf(at(node, 0)), `노드 ${String(node)}는 안 돈다`).toBeCloseTo(0, 4)
      // X 열만 0이 된다 — Y·Z를 같이 누르면 문짝이 점으로 사라진다
      expect(col(at(node, 9), 0).length(), `노드 ${String(node)} X`).toBeCloseTo(0, 4)
      expect(col(at(node, 9), 1).length()).toBeCloseTo(1, 4)
      expect(col(at(node, 9), 2).length()).toBeCloseTo(1, 4)
      // 여덟째 프레임까지는 온전한 크기로 밀린다
      expect(col(at(node, 8), 0).length()).toBeCloseTo(1, 4)
    }
    // 두 짝이 반대로 간다. 16유닛 = 한 타일이다
    expect(at(1, 9).elements[12]).toBeCloseTo(-1, 3)
    expect(at(2, 9).elements[12]).toBeCloseTo(1, 3)
  })

  it('기본 변환이 단위가 아닌 문도 제자리에서 돈다', () => {
    // 소품 441 `mansion_door`는 문짝 둘이 ±10유닛 밀려 있다. 그 값이 이미
    // 정점에 발려 있으므로(`placeByNode`) 그룹 행렬은 그것을 **되돌려** 곱한다 —
    // 안 되돌리면 문이 열릴 때 옆으로 순간이동한다
    const t = table(), b = bytes()
    const info = t.models['441']!
    expect(info.nodes[1]!.t[0]).toBeCloseTo(-10, 3)
    expect(info.nodes[2]!.t[0]).toBeCloseTo(10, 3)
    const { anim } = clipOf(t, b, 441, 0)
    // 첫 프레임은 제자리 — 그룹 행렬이 단위다
    const first = nodeMatrixAt(info.nodes[1]!, anim, 1, 0)
    expect(first.elements.map((v) => Math.round(v * 1000) / 1000))
      .toEqual(new Matrix4().elements.map((v) => v))
  })

  it('애니 있는 소품 112개가 다 노드 속살을 갖고 있다', () => {
    const t = table()
    expect(Object.keys(t.models)).toHaveLength(112)
    for (const [id, info] of Object.entries(t.models)) {
      expect(info.nodes.length, `소품 ${id}`).toBeGreaterThan(0)
      expect(info.submeshNodes.length, `소품 ${id}`).toBeGreaterThan(0)
      // 조각이 가리키는 노드가 실제로 있어야 한다
      for (const n of info.submeshNodes) expect(info.nodes[n], `소품 ${id} 노드 ${String(n)}`).toBeDefined()
      expect(info.materials).toHaveLength(info.uv.length)
    }
  })
})

describe('splitByNode', () => {
  it('색인만 쪼개고 정점은 나눠 쓴다', () => {
    // 조각 셋이 노드 둘에 나뉜 소품을 흉내 낸다
    const geometry = new BufferGeometry()
    const pos = new BufferAttribute(new Float32Array(12 * 3), 3)
    geometry.setAttribute('position', pos)
    geometry.setIndex(new BufferAttribute(new Uint16Array([
      0, 1, 2, /**/ 3, 4, 5, /**/ 6, 7, 8,
    ]), 1))
    const mesh = {
      geometry,
      materials: [],
      groups: [[0, 0, 3], [1, 3, 3], [0, 6, 3]] as [number, number, number][],
    } as unknown as ChunkMesh

    const parts = splitByNode(mesh, [0, 1, 0])
    expect([...parts.keys()]).toEqual([0, 1])
    // 노드 0은 조각 둘을 가지므로 색인 여섯 · 그룹 둘이다
    const zero = parts.get(0)!
    expect(zero.getIndex()!.count).toBe(6)
    expect(zero.groups.map((g) => [g.start, g.count, g.materialIndex]))
      .toEqual([[0, 3, 0], [3, 3, 0]])
    expect([...(zero.getIndex()!.array as Uint16Array)]).toEqual([0, 1, 2, 6, 7, 8])
    // 정점은 **같은 것**을 가리킨다 — GPU에 두 벌 안 올린다
    expect(zero.getAttribute('position')).toBe(pos)
    expect(parts.get(1)!.getAttribute('position')).toBe(pos)
    expect(parts.get(1)!.getIndex()!.count).toBe(3)
  })
})
