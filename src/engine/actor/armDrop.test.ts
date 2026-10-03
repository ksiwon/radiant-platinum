// 몸마다 팔 내림 보정(`armDrop`의 `ARM_DROP_BIAS`)을 **같은 자로 다시 잰다**.
//
// 자는 `locomotion.test.ts`의 「팔이 몸통을 파고들지도, 몸통에서 뜨지도 않는다」와 같다 — 서 있는 자세에서 팔꿈치가 몸통 겉에서
// 팔 반지름의 몇 배인지. 거기는 주인공 한 몸을 재고 여기는 보정이 붙은 몸 전부와 주인공을 잰다. 몸통 · 팔 정점은 바인드 스킨의
// 지배 본으로 가르고, 창의 폭은 상완 길이(`L`)로 잡아 번들마다 단위가 달라도 같은 뜻으로 잰다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { Matrix4, Object3D, Vector3 } from 'three'
import { withModels } from '../../data/romData.testkit'
import { ARM_DROP_BIAS, armDropBiasOf } from './armDrop'
import { createRig, updateLocomotion } from './locomotion'

const DIR = resolve(__dirname, '../../../public/models/npc')

interface GlbNode { name?: string, children?: number[], translation?: number[], rotation?: number[], scale?: number[], mesh?: number, skin?: number }
function parts(path: string) {
  const buf = readFileSync(path)
  const jsonLen = buf.readUInt32LE(12); const binOff = 20 + jsonLen
  return { g: JSON.parse(buf.toString('utf8', 20, 20 + jsonLen)), bin: buf.subarray(binOff + 8, binOff + 8 + buf.readUInt32LE(binOff)) }
}
function profile(path: string) {
  const { g, bin } = parts(path)
  const CT: Record<number, [string, number]> = { 5121: ['UInt8', 1], 5123: ['UInt16', 2], 5125: ['UInt32', 4], 5126: ['Float', 4] }
  const NC: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }
  const read = (ai: number) => {
    const a = g.accessors[ai]; const [ty, sz] = CT[a.componentType]!; const n = NC[a.type]!
    const v = g.bufferViews[a.bufferView]; const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0); const stride = v.byteStride || sz * n
    const fn = (sz === 1 ? `read${ty}` : `read${ty}LE`) as 'readFloatLE'
    const out: number[][] = []
    for (let k = 0; k < a.count; k++) { const o = base + k * stride; const row: number[] = []; for (let c = 0; c < n; c++) row.push(bin[fn](o + c * sz)); out.push(row) }
    return out
  }
  const objs: Object3D[] = []; const nodes = new Map<string, Object3D>()
  const build = (i: number): Object3D => {
    const n = g.nodes[i] as GlbNode; const o = new Object3D(); o.name = n.name ?? `n${i}`
    if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale)
    objs[i] = o; if (!nodes.has(o.name)) nodes.set(o.name, o)
    for (const c of n.children ?? []) o.add(build(c))
    return o
  }
  const root = new Object3D(); for (const i of g.scenes[0].nodes as number[]) root.add(build(i)); root.updateMatrixWorld(true)
  let skinAt = 0; for (let i = 1; i < g.skins.length; i++) if (g.skins[i].joints.length > g.skins[skinAt].joints.length) skinAt = i
  const skin = g.skins[skinAt]
  const bodyMeshes = new Set<number>((g.nodes as GlbNode[]).filter((n) => n.skin === skinAt && n.mesh !== undefined).map((n) => n.mesh!))
  const ibm = read(skin.inverseBindMatrices); const names: string[] = skin.joints.map((i: number) => g.nodes[i].name)
  const bindMat = (skin.joints as number[]).map((ni, k) => objs[ni]!.matrixWorld.clone().multiply(new Matrix4().fromArray(ibm[k]!)))
  const TORSO = new Set(['Waist', 'Spine1', 'Spine2', 'Spine3', 'Hips']); const ARM = new Set(['LArm', 'LArmEX', 'LForeArm', 'LForeArmEX'])
  const torso: Vector3[] = []; const arm: Vector3[] = []
  for (const [mi, m] of (g.meshes as { primitives: { attributes: Record<string, number> }[] }[]).entries()) {
    if (!bodyMeshes.has(mi)) continue
    for (const p of m.primitives) {
      if (p.attributes.JOINTS_0 === undefined) continue
      const pos = read(p.attributes.POSITION!); const jt = read(p.attributes.JOINTS_0); const wt = read(p.attributes.WEIGHTS_0!)
      for (let k = 0; k < pos.length; k++) {
        let best = 0, bi = 0; for (let c = 0; c < 4; c++) if (wt[k]![c]! > best) { best = wt[k]![c]!; bi = jt[k]![c]! }
        const nm = names[bi]!; if (!TORSO.has(nm) && !ARM.has(nm)) continue
        const v = new Vector3().fromArray(pos[k]!).applyMatrix4(bindMat[bi]!); (TORSO.has(nm) ? torso : arm).push(v)
      }
    }
  }
  const sh = new Vector3().setFromMatrixPosition(objs[skin.joints[names.indexOf('LArm')]!]!.matrixWorld)
  const el = new Vector3().setFromMatrixPosition(objs[skin.joints[names.indexOf('LForeArm')]!]!.matrixWorld)
  const L = el.distanceTo(sh)
  const radii = arm.filter((p) => p.x - sh.x > 0.3 * L && p.x - sh.x < 1.8 * L).map((p) => Math.hypot(p.y - sh.y, p.z - sh.z)).sort((a, b) => a - b)
  return { root, nodes, armRadius: radii[Math.floor(radii.length * 0.75)] ?? NaN, L,
    halfWidth(y: number, z: number) { const near = torso.filter((p) => Math.abs(p.y - y) < 0.4 * L && Math.abs(p.z - z) < 0.5 * L); return near.length ? Math.max(...near.map((p) => Math.abs(p.x))) : 0 } }
}
function gapAt(path: string) {
  const b = profile(path)
  const rig = createRig(b.root, new Object3D(), path)!
  const gap = (speed: number, frames: number) => {
    let min = Infinity
    for (let i = 0; i < frames; i++) {
      updateLocomotion(rig, 1 / 240, speed, 4.5, 8); b.root.updateMatrixWorld(true)
      const p = b.nodes.get('LForeArm')!.getWorldPosition(new Vector3())
      min = Math.min(min, (p.x - b.halfWidth(p.y, p.z)) / b.armRadius)
    }
    return min
  }
  return { idle: gap(0, 2), walk: gap(4.5, 240), run: gap(8, 240) }
}

it('이름이나 경로에서 몸을 찾는다', () => {
  expect(armDropBiasOf('models/npc/tr1073_00.glb')).toBe(ARM_DROP_BIAS.tr1073_00)
  expect(armDropBiasOf('tr1073_00')).toBe(ARM_DROP_BIAS.tr1073_00)
  expect(armDropBiasOf('pc0002_00')).toBe(0)
  expect(armDropBiasOf(undefined)).toBe(0)
})

const BODIES = ['pc0002_00', ...Object.keys(ARM_DROP_BIAS)]
withModels(...BODIES.map((b) => `npc/${b}.glb`))('보정이 붙은 몸은 팔이 옆구리에 붙는다', () => {
  for (const body of BODIES) {
    it(`${body} — 정지에서 뜨지 않고, 걷고 뛸 때 파고들지 않는다`, () => {
      const g = gapAt(resolve(DIR, `${body}.glb`))
      expect(g.idle, `정지 ${g.idle.toFixed(2)}배`).toBeGreaterThan(0.9)
      expect(g.idle, `정지 ${g.idle.toFixed(2)}배 — A자로 뜬다`).toBeLessThan(1.4)
      expect(g.walk, `걷기 ${g.walk.toFixed(2)}배`).toBeGreaterThan(0.65)
      expect(g.run, `달리기 ${g.run.toFixed(2)}배`).toBeGreaterThan(0.55)
    }, 30_000)
  }
})
