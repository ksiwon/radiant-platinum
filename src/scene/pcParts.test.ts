// 파도타기 몸의 자리 검증 (`pcParts`).
//
// ⚠️ **여기서 지키는 것은 「자리를 지어내지 않았다」이다.** `SURF_MOUNT`의 넷은
// 전부 구운 glb에서 잰 값이라, 굽는 쪽이 바뀌면 여기서 걸려야 한다 — 안 그러면
// 사람이 물속에 잠기거나 몸 위 허공에 앉는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect } from 'vitest'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import { PC_PART, SURF_MOUNT } from './pcParts'
import { withModels } from '../data/romData.testkit'

const GLB = resolve(__dirname, '../../public/models/pcParts.glb')
const maybe = withModels('pcParts.glb')

interface Gltf {
  nodes: { name: string, mesh?: number, skin?: number, children?: number[],
    translation?: number[], rotation?: number[], scale?: number[], matrix?: number[] }[]
  meshes: { name: string, primitives: { attributes: Record<string, number> }[] }[]
  skins: { joints: number[], inverseBindMatrices: number }[]
  accessors: { bufferView: number, byteOffset?: number, componentType: number,
    count: number, type: string }[]
  bufferViews: { byteOffset?: number }[]
}

const KIND: Record<number, new (b: ArrayBuffer, o: number, n: number) => ArrayLike<number>> = {
  5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
}
const WIDE: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

/** glb 하나를 열어 JSON과 이진 덩이로 가른다 */
function openGlb(path: string): { json: Gltf, bin: Buffer } {
  const file = readFileSync(path)
  const jsonLen = file.readUInt32LE(12)
  return {
    json: JSON.parse(file.toString('utf8', 20, 20 + jsonLen)) as Gltf,
    bin: file.subarray(20 + jsonLen + 8),
  }
}

maybe('주인공이 타고 드는 것들', () => {
  it('파도타기 몸이 적어 둔 자리에 그려진다', () => {
    const { json, bin } = openGlb(GLB)
    const read = (at: number): ArrayLike<number> => {
      const a = json.accessors[at]!
      const view = json.bufferViews[a.bufferView]!
      const off = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
      return new KIND[a.componentType]!(
        bin.buffer as ArrayBuffer, bin.byteOffset + off, a.count * WIDE[a.type]!)
    }
    const parent = new Map<number, number>()
    json.nodes.forEach((n, i) => { for (const c of n.children ?? []) parent.set(c, i) })
    const cache = new Map<number, Matrix4>()
    const world = (i: number): Matrix4 => {
      const hit = cache.get(i)
      if (hit) return hit
      const n = json.nodes[i]!
      const m = n.matrix
        ? new Matrix4().fromArray(n.matrix)
        : new Matrix4().compose(
          new Vector3(...(n.translation ?? [0, 0, 0])),
          new Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
          new Vector3(...(n.scale ?? [1, 1, 1])))
      const up = parent.get(i)
      const out = up === undefined ? m : world(up).clone().multiply(m)
      cache.set(i, out)
      return out
    }
    const byName = new Map(json.nodes.map((n, i) => [n.name, i]))

    // 여섯이 다 들어 있다
    for (const name of Object.values(PC_PART)) expect(byName.has(name), name).toBe(true)

    // 스킨을 먹인 뒤의 상자 — 정점을 실제로 옮겨서 잰다
    const at = byName.get(PC_PART.surf)!
    const skin = json.skins[json.nodes[at]!.skin!]!
    const ibm = read(skin.inverseBindMatrices)
    const bones = skin.joints.map((j, k) => world(j).clone()
      .multiply(new Matrix4().fromArray(Array.from(ibm).slice(k * 16, k * 16 + 16))))
    const prim = json.meshes[json.nodes[at]!.mesh!]!.primitives[0]!
    const pos = read(prim.attributes.POSITION!)
    const joint = read(prim.attributes.JOINTS_0!)
    const weight = read(prim.attributes.WEIGHTS_0!)
    const box = new Box3()
    const v = new Vector3(), t = new Vector3(), sum = new Vector3()
    for (let i = 0; i < pos.length / 3; i++) {
      v.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!)
      sum.set(0, 0, 0)
      for (let k = 0; k < 4; k++) {
        const w = weight[i * 4 + k]!
        if (w === 0) continue
        sum.addScaledVector(t.copy(v).applyMatrix4(bones[joint[i * 4 + k]!]!), w)
      }
      box.expandByPoint(sum)
    }

    // 번들 원점을 물 높이로 올린 뒤의 자리 (`SURF_MOUNT.lift`)
    const lifted = { min: box.min.y + SURF_MOUNT.lift, max: box.max.y + SURF_MOUNT.lift }
    expect(-lifted.min).toBeCloseTo(SURF_MOUNT.draft, 3)
    expect(lifted.max - lifted.min).toBeCloseTo(SURF_MOUNT.height, 3)

    // 사람이 앉는 자리는 번들이 적어 둔 것이다
    const seat = new Vector3().setFromMatrixPosition(world(byName.get('scaffold_Attach')!))
    expect(seat.y + SURF_MOUNT.lift).toBeCloseTo(SURF_MOUNT.seat, 3)

    // ⚠️ **앉는 자리가 몸 안이어야 한다.** 위로 벗어나면 사람이 뜨고, 밑으로
    // 벗어나면 몸에 파묻힌다
    expect(seat.y + SURF_MOUNT.lift).toBeGreaterThan(lifted.min)
    expect(seat.y + SURF_MOUNT.lift).toBeLessThan(lifted.max)

    // 앞이 +z다 — 우리 사람과 같은 쪽이라 돌릴 것이 없다
    expect(box.max.z).toBeGreaterThan(0)
    expect(box.min.z).toBeLessThan(-box.max.z)
  })
})
