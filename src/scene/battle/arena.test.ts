// 배틀 무대 검증 (DATA.md §7.4)
//
// 무대는 BDSP 롬에서 구워 온 glb다(`tools/extract/bdspArena.py`). 여기서 재는
// 것은 **두 포켓몬이 설 자리에 땅이 있는가**다 — 좌표계를 한 번만 잘못 옮겨도
// (X 뒤집기, 월드 행렬 굽기) 무대가 통째로 어긋나는데, 눈으로는 "이상하다"까지
// 밖에 알 수 없다.
//
// 파일은 `public/models/`이라 리포에 안 들어간다(§14.1). 없으면 건너뛴다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SLOT } from '../../engine/battle/shots'

const GLB = resolve(__dirname, '../../../public/models/arena/field.glb')
const maybe = existsSync(GLB) ? describe : describe.skip

interface Gltf {
  accessors: { bufferView: number; componentType: number; count: number; type: string }[]
  bufferViews: { byteOffset: number; byteLength: number }[]
  meshes: { primitives: { attributes: Record<string, number>; indices: number; material?: number }[] }[]
  materials: { name: string; alphaMode?: string; doubleSided?: boolean }[]
}

/** glb 한 덩이를 편다. JSON 청크 + BIN 청크 둘뿐이다 */
function read(): { gltf: Gltf; blob: DataView } {
  const buf = readFileSync(GLB)
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const view = new DataView(ab)
  const jsonLen = view.getUint32(12, true)
  const gltf = JSON.parse(
    new TextDecoder().decode(new Uint8Array(ab, 20, jsonLen)),
  ) as Gltf
  const binAt = 20 + jsonLen
  const binLen = view.getUint32(binAt, true)
  return { gltf, blob: new DataView(ab, binAt + 8, binLen) }
}

/** 접근자 하나를 수 배열로. 우리가 굽는 것은 float32 · uint16 · uint32뿐이다 */
function values(gltf: Gltf, blob: DataView, index: number): number[] {
  const acc = gltf.accessors[index]!
  const view = gltf.bufferViews[acc.bufferView]!
  const lanes = { SCALAR: 1, VEC2: 2, VEC3: 3 }[acc.type] ?? 1
  const out: number[] = []
  const size = { 5126: 4, 5123: 2, 5125: 4 }[acc.componentType]!
  for (let i = 0; i < acc.count * lanes; i++) {
    const at = view.byteOffset + i * size
    out.push(acc.componentType === 5126
      ? blob.getFloat32(at, true)
      : acc.componentType === 5123
        ? blob.getUint16(at, true)
        : blob.getUint32(at, true))
  }
  return out
}

maybe('배틀 무대', () => {
  const { gltf, blob } = read()

  /** 무대 전체의 삼각형 `[a, b, c]` 좌표 목록 */
  const triangles = (): number[][][] => {
    const out: number[][][] = []
    for (const prim of gltf.meshes[0]!.primitives) {
      const pos = values(gltf, blob, prim.attributes.POSITION!)
      const idx = values(gltf, blob, prim.indices)
      for (let t = 0; t + 2 < idx.length; t += 3) {
        out.push([0, 1, 2].map((j) => {
          const i = idx[t + j]!
          return [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!]
        }))
      }
    }
    return out
  }

  /** (x, z) 바로 아래·위의 면 높이들 */
  const groundAt = (tris: number[][][], x: number, z: number): number[] => {
    const hit: number[] = []
    for (const [a, b, c] of tris as [number[], number[], number[]][]) {
      const bu = b[0]! - a[0]!, bv = b[2]! - a[2]!
      const cu = c[0]! - a[0]!, cv = c[2]! - a[2]!
      const area = bu * cv - cu * bv
      if (Math.abs(area) < 1e-9) continue
      const px = x - a[0]!, pz = z - a[2]!
      const w1 = (px * cv - cu * pz) / area
      const w2 = (bu * pz - px * bv) / area
      if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
      hit.push(a[1]! + w1 * (b[1]! - a[1]!) + w2 * (c[1]! - a[1]!))
    }
    return hit
  }

  it('두 포켓몬이 설 자리에 땅이 하나씩 있다', () => {
    // ⚠️ **이것이 좌표계를 잡아 주는 자리다.** Unity는 왼손이고 glTF는
    // 오른손이라 X를 뒤집어 굽는데, 뒤집기를 빠뜨리거나 두 번 하면 무대가
    // 좌우로 뒤집힌다. 이 무대는 x −19~25 · z −18~27로 **비대칭**이라
    // 뒤집히면 여기서 걸린다
    const tris = triangles()
    for (const [side, at] of Object.entries(SLOT)) {
      const y = groundAt(tris, at.x, at.z)
      // 땅이 딱 한 겹이어야 한다. 여럿이면 어느 높이에 세워야 할지가 안 정해진다
      expect(y, `${side} (${String(at.x)}, ${String(at.z)})`).toHaveLength(1)
      // `BattleStage`의 `GROUND`가 이 값이다
      expect(y[0]!).toBeCloseTo(0.001, 3)
    }
    // 그리고 발밑만 있으면 안 된다 — 둘레로 넉넉히 퍼져야 카메라가 돌 수 있다
    for (const [x, z] of [[-15, -12], [18, 20], [-15, 20], [18, -12]]) {
      expect(groundAt(tris, x!, z!).length, `(${String(x)}, ${String(z)})`).toBeGreaterThan(0)
    }
  }, 30_000)

  it('나무와 풀은 오려 낸 그림이라 양면·알파컷이다', () => {
    // 불투명으로 두면 잎 사이가 사각형으로 막히고, 단면으로 두면 뒤에서 사라진다
    expect(gltf.materials.length).toBeGreaterThan(3)
    for (const m of gltf.materials) {
      expect(m.alphaMode, m.name).toBe('MASK')
      expect(m.doubleSided, m.name).toBe(true)
    }
    // 재질별로 합쳐 둔다 — 원본은 메시 158개라 그대로 두면 드로우콜이 158개다
    expect(gltf.meshes[0]!.primitives.length).toBe(gltf.materials.length)
  })
})
