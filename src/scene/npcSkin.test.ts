// 구운 사람의 스킨 배열 길이 (DATA.md §2.16)
//
// ⚠️ **정점 하나에 뼈가 넷이라고 두면 안 된다.** BDSP 메시마다 다르다 —
// 주인공의 손목시계(`pc0001_00_watchSkin`)는 **둘**이고 나머지는 넷이다.
// 굽는 쪽이 `reshape(-1, 4)`로 접고 있어서 정점 둘이 한 줄로 겹쳤고,
// `JOINTS_0`이 정점 수의 절반(178 대 89)으로 나왔다.
//
// 파일은 멀쩡히 열린다. 터지는 곳은 화면이다 — three가 짧은 배열 밖을 읽어
// **없는 번호의 뼈**를 집고, `Box3.setFromObject`가 매 프레임 던진다
// (`applyBoneTransform`: `skeleton.bones[boneIndex].matrixWorld`). 그러면 그
// 사람만 안 서는 것이 아니라 **NPC 모델 회전 전체가 프레임마다 끊긴다.**
// 광휘도 용식도 그래서 화면에 없었다.
//
// 그런데 시험 1,056개가 전부 초록이었다. 키를 재는 시험(`npcScale`)은
// `POSITION`의 min/max만 보므로 이 어긋남을 못 본다. 그래서 여기서는
// **한 프리미티브의 속성 길이가 서로 같은지**를 직접 잰다.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { withModels } from '../data/romData.testkit'

const NPC = resolve(__dirname, '../../public/models/npc')
const maybe = withModels('npc')

interface Gltf {
  meshes: { name?: string, primitives: { attributes: Record<string, number> }[] }[]
  accessors: { count: number }[]
  skins: { joints: number[] }[]
  nodes: { name?: string, mesh?: number, skin?: number }[]
}

/** glb의 JSON 덩이만 꺼낸다 */
function gltfOf(file: string): Gltf {
  const buf = readFileSync(file)
  let at = 12
  while (at < buf.length) {
    const len = buf.readUInt32LE(at)
    const type = buf.readUInt32LE(at + 4)
    if (type === 0x4e4f534a) {
      return JSON.parse(buf.subarray(at + 8, at + 8 + len).toString('utf8')) as Gltf
    }
    at += 8 + len
  }
  throw new Error(`JSON 덩이가 없다: ${file}`)
}

maybe('구운 사람의 스킨', () => {
  const files = readdirSync(NPC).filter((f) => f.endsWith('.glb'))

  it('한 프리미티브의 속성 길이가 모두 같다', () => {
    expect(files.length).toBeGreaterThan(30)
    const off: string[] = []
    for (const file of files) {
      const g = gltfOf(resolve(NPC, file))
      for (const mesh of g.meshes) {
        for (const prim of mesh.primitives) {
          const counts = Object.entries(prim.attributes)
            .map(([name, acc]) => [name, g.accessors[acc]!.count] as const)
          const verts = counts.find(([name]) => name === 'POSITION')![1]
          for (const [name, n] of counts) {
            if (n !== verts) off.push(`${file} ${mesh.name ?? '?'} ${name} ${String(n)}≠${String(verts)}`)
          }
        }
      }
    }
    expect(off).toEqual([])
  })

  it('관절 번호가 그 스킨의 관절 수 안에 있다', () => {
    // 넘으면 같은 자리에서 같은 식으로 터진다. `JOINTS_0`은 노드 번호가 아니라
    // **그 스킨의 `joints` 배열 안 자리**다 (`bdspGlb.py`)
    const off: string[] = []
    for (const file of files) {
      const g = gltfOf(resolve(NPC, file))
      const buf = readFileSync(resolve(NPC, file))
      for (const node of g.nodes) {
        if (node.mesh === undefined || node.skin === undefined) continue
        const room = g.skins[node.skin]!.joints.length
        for (const prim of g.meshes[node.mesh]!.primitives) {
          const acc = prim.attributes.JOINTS_0
          if (acc === undefined) continue
          const max = maxUShort(buf, g, acc)
          if (max >= room) off.push(`${file} ${node.name ?? '?'} ${String(max)}≥${String(room)}`)
        }
      }
    }
    expect(off).toEqual([])
  })

  /** 접근자 하나의 최댓값. USHORT VEC4만 다룬다 */
  function maxUShort(buf: Buffer, g: Gltf, acc: number): number {
    const a = g.accessors[acc] as unknown as { bufferView: number, byteOffset?: number, count: number }
    const views = (g as unknown as { bufferViews: { byteOffset?: number }[] }).bufferViews
    // BIN 덩이는 JSON 덩이 바로 뒤다
    const json = buf.readUInt32LE(12)
    const bin = 12 + 8 + json + 8
    let at = bin + (views[a.bufferView]!.byteOffset ?? 0) + (a.byteOffset ?? 0)
    let max = 0
    for (let i = 0; i < a.count * 4; i++, at += 2) max = Math.max(max, buf.readUInt16LE(at))
    return max
  }
})
