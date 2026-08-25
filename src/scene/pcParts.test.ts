// 파도타기 몸의 자리 검증 (`pcParts`).
//
// ⚠️ **여기서 지키는 것은 「자리를 지어내지 않았다」이다.** `SURF_MOUNT`의 넷은
// 전부 구운 glb에서 잰 값이라, 굽는 쪽이 바뀌면 여기서 걸려야 한다 — 안 그러면
// 사람이 물속에 잠기거나 몸 위 허공에 앉는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect } from 'vitest'
import { Box3, Matrix4, Quaternion, Vector3 } from 'three'
import {
  FLY_MOUNT, FLY_PATH, ITEM_HAND, PC_PART, ROD_TIP, SURF_MOUNT, flyAt, flyTurnAt,
} from './pcParts'
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

    /** 스킨을 실제로 먹여 잰 상자 */
    const boxOf = (at: number): Box3 => {
      const s = json.skins[json.nodes[at]!.skin!]!
      const inv = read(s.inverseBindMatrices)
      const bones = s.joints.map((j, k) => world(j).clone()
        .multiply(new Matrix4().fromArray(Array.from(inv).slice(k * 16, k * 16 + 16))))
      const prim = json.meshes[json.nodes[at]!.mesh!]!.primitives[0]!
      const pos = read(prim.attributes.POSITION!)
      const joint = read(prim.attributes.JOINTS_0!)
      const weight = read(prim.attributes.WEIGHTS_0!)
      const out = new Box3()
      const a = new Vector3(), b = new Vector3(), acc = new Vector3()
      for (let i = 0; i < pos.length / 3; i++) {
        a.set(pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!)
        acc.set(0, 0, 0)
        for (let k = 0; k < 4; k++) {
          const w = weight[i * 4 + k]!
          if (w === 0) continue
          acc.addScaledVector(b.copy(a).applyMatrix4(bones[joint[i * 4 + k]!]!), w)
        }
        out.expandByPoint(acc)
      }
      return out
    }

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

    // ⚠️ **사람은 등판 **위**에 선다.** 몸 속으로 들어가면 다리가 파묻힌다
    expect(SURF_MOUNT.stand).toBeCloseTo(lifted.max, 3)
    // 번들이 적어 둔 `scaffold_Attach`는 몸 속이라 사람 자리가 아니다
    const scaffold = new Vector3().setFromMatrixPosition(world(byName.get('scaffold_Attach')!))
    expect(scaffold.y + SURF_MOUNT.lift).toBeLessThan(SURF_MOUNT.stand)
    expect(scaffold.y + SURF_MOUNT.lift).toBeGreaterThan(lifted.min)

    // 앞이 +z다 — 우리 사람과 같은 쪽이라 돌릴 것이 없다
    expect(box.max.z).toBeGreaterThan(0)
    expect(box.min.z).toBeLessThan(-box.max.z)

    // ── 공중날기 새도 같은 자로 잰다 ─────────────────────────────────────
    const birdAt = byName.get(PC_PART.fly)!
    const birdSkin = json.skins[json.nodes[birdAt]!.skin!]!
    const birdIbm = read(birdSkin.inverseBindMatrices)
    const birdBones = birdSkin.joints.map((j, k) => world(j).clone()
      .multiply(new Matrix4().fromArray(Array.from(birdIbm).slice(k * 16, k * 16 + 16))))
    const birdPrim = json.meshes[json.nodes[birdAt]!.mesh!]!.primitives[0]!
    const bp = read(birdPrim.attributes.POSITION!)
    const bj = read(birdPrim.attributes.JOINTS_0!)
    const bw = read(birdPrim.attributes.WEIGHTS_0!)
    const bird = new Box3()
    for (let i = 0; i < bp.length / 3; i++) {
      v.set(bp[i * 3]!, bp[i * 3 + 1]!, bp[i * 3 + 2]!)
      sum.set(0, 0, 0)
      for (let k = 0; k < 4; k++) {
        const w = bw[i * 4 + k]!
        if (w === 0) continue
        sum.addScaledVector(t.copy(v).applyMatrix4(birdBones[bj[i * 4 + k]!]!), w)
      }
      bird.expandByPoint(sum)
    }
    // `Origin_mf`가 땅 위 `hover`에 있다
    const hover = new Vector3().setFromMatrixPosition(world(byName.get('Origin_mf')!))
    expect(hover.y).toBeCloseTo(FLY_MOUNT.hover, 4)
    expect(bird.max.y - bird.min.y).toBeCloseTo(FLY_MOUNT.height, 3)
    expect(bird.max.x - bird.min.x).toBeCloseTo(FLY_MOUNT.wing, 3)

    // 사람 앉는 자리는 번들이 적어 둔 `attach_loc_mf`다
    const perch = new Vector3().setFromMatrixPosition(world(byName.get('attach_loc_mf')!))
    expect(perch.y - hover.y).toBeCloseTo(FLY_MOUNT.seat.y, 4)
    expect(perch.z - hover.z).toBeCloseTo(FLY_MOUNT.seat.z, 4)
    // 그 자리가 몸 안이다 — 위로 벗어나면 사람이 뜨고 밑이면 파묻힌다
    expect(perch.y).toBeGreaterThan(bird.min.y)
    expect(perch.y).toBeLessThan(bird.max.y)

    // ── 손에 드는 것 넷 ─────────────────────────────────────────────────
    // ⚠️ **번들 단위 그대로 걸므로 여기 크기가 곧 화면 크기다** (×1.019).
    // 치비 배수를 다시 곱하면 낚싯대가 3.4m가 된다 — `ITEM_HAND` 머리말
    const can = boxOf(byName.get(PC_PART.wateringCan)!)
    const canSize = can.getSize(new Vector3())
    expect(canSize.x).toBeCloseTo(0.2649, 3)
    expect(canSize.y).toBeCloseTo(0.3609, 3)
    expect(canSize.z).toBeCloseTo(0.4467, 3)
    // 왼손 부착 자리가 물뿌리개 안이다
    expect(ITEM_HAND.left.x).toBeGreaterThan(can.min.x)
    expect(ITEM_HAND.left.x).toBeLessThan(can.max.x)
    expect(ITEM_HAND.left.y).toBeGreaterThan(can.min.y)
    expect(ITEM_HAND.left.y).toBeLessThan(can.max.y)

    for (const [tag, name, long] of [
      ['낡은', PC_PART.rodOld, 1.7379],
      ['좋은', PC_PART.rodGood, 1.7973],
      ['대단한', PC_PART.rodSuper, 1.7083],
    ] as const) {
      const rod = boxOf(byName.get(name)!)
      expect(rod.getSize(new Vector3()).x, tag).toBeCloseTo(long, 3)
      // 낚싯대는 −x로 뻗고 오른손 부착 자리가 손잡이 쪽 끝 안이다
      expect(rod.max.x, tag).toBeLessThan(0)
      expect(ITEM_HAND.right.x, tag).toBeLessThan(rod.max.x)
      expect(ITEM_HAND.right.x - rod.min.x, tag).toBeGreaterThan(0)
    }
    // 줄이 나가는 끝 뼈가 손 반대쪽 끝에 있다
    const tip = new Vector3().setFromMatrixPosition(world(byName.get(ROD_TIP)!))
    expect(tip.x).toBeLessThan(ITEM_HAND.right.x - 1.3)
  })

  it('원작 길이 새를 뒤에서 앞으로 옮긴다 — 채는 때가 그 사이다', () => {
    // ⚠️ **여기서 지키는 것은 「길이 원작 것이다」이다.** 두 키가 뒤집히면
    // 새가 앞에서 와 뒤로 빠지고, 사람은 채이기도 전에 뜬다
    const at = (k: typeof FLY_PATH.onBird, t: number) => flyAt(k, t)
    // 탈 때: 뒤(−z)에서 와 앞(+z)으로 빠진다
    expect(at(FLY_PATH.onBird, 0).z).toBeLessThan(0)
    expect(at(FLY_PATH.onBird, FLY_MOUNT.clip).z).toBeGreaterThan(9)
    // 내릴 때: 앞에서 와 뒤로 빠진다
    expect(at(FLY_PATH.offBird, 0).z).toBeGreaterThan(9)
    expect(at(FLY_PATH.offBird, FLY_MOUNT.clip).z).toBeLessThan(0)
    // 채는 때에 새가 땅 가까이 내려온다 — 사람이 걸어 탈 높이다
    for (const keys of [FLY_PATH.onBird, FLY_PATH.offBird]) {
      const low = at(keys, FLY_MOUNT.pick).y + FLY_MOUNT.hover
      expect(low).toBeGreaterThan(0)
      expect(low).toBeLessThan(0.3)
    }
    // 돌리는 각은 길이가 1이다 — 안 그러면 새가 늘어난다
    for (const keys of [FLY_PATH.onTurn, FLY_PATH.offTurn]) {
      for (let t = 0; t <= FLY_MOUNT.clip; t += 0.05) {
        const q = flyTurnAt(keys, t)
        expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 5)
      }
    }
  })
})
