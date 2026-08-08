// 배틀 무대 검증 (DATA.md §7.4)
//
// 무대는 BDSP 롬에서 구워 온 glb다(`tools/extract/bdspArena.py`). 여기서 재는
// 것은 **두 포켓몬이 설 자리에 땅이 있는가**다 — 좌표계를 한 번만 잘못 옮겨도
// (X 뒤집기, 월드 행렬 굽기) 무대가 통째로 어긋나는데, 눈으로는 "이상하다"까지
// 밖에 알 수 없다.
//
// ⚠️ **열여덟 벌 전부 잰다.** 한 벌만 재던 시절에는 나머지가 어떤 높이에 깔려
// 있는지 아무도 몰랐다. 무대마다 지면 높이를 따로 들고 다닐 필요가 없다는 것도
// 여기서 나온 결론이다 (전부 y=0, `g001`만 0.001).
//
// 파일은 `public/models/`이라 리포에 안 들어간다(§14.1). 없으면 건너뛴다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SLOT } from '../../engine/battle/shots'
import { EVERY_ARENA } from '../../engine/battle/arena'
import { withModels } from '../../data/romData.testkit'

/** 표에 실린 무대 파일들. 같은 파일을 두 배경이 쓰기도 한다(도시·들판) */
const FILES = [...new Set(EVERY_ARENA.map((a) => a.file))].sort()

const maybe = withModels(...FILES.map((f) => `arena/${f}`))

interface Gltf {
  accessors: { bufferView: number; componentType: number; count: number; type: string }[]
  bufferViews: { byteOffset: number; byteLength: number }[]
  meshes: { primitives: { attributes: Record<string, number>; indices: number; material?: number }[] }[]
  materials: { name: string; alphaMode?: string; doubleSided?: boolean }[]
}

/** glb 한 덩이를 편다. JSON 청크 + BIN 청크 둘뿐이다 */
function read(file: string): { gltf: Gltf; blob: DataView } {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/arena', file))
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

/** 무대 전체의 삼각형 `[a, b, c]` 좌표 목록 */
function triangles(gltf: Gltf, blob: DataView): number[][][] {
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
function groundAt(tris: number[][][], x: number, z: number): number[] {
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

/** 여덟 방향. 반지름을 잴 때 이 방향 전부에 땅이 있어야 한다 */
const COMPASS = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => [
  Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4),
] as const)

maybe('배틀 무대', () => {
  // 파일을 한 번만 읽고 삼각형으로 펴 둔다. 열여덟 벌 × 두 시험이라
  // 시험마다 다시 읽으면 그만큼 두 배가 된다
  const stages = FILES.map((file) => {
    const { gltf, blob } = read(file)
    return { file, gltf, tris: triangles(gltf, blob) }
  })

  describe.each(stages)('$file', ({ file, gltf, tris }) => {
    it('두 포켓몬이 설 자리에 땅이 있다', () => {
      // ⚠️ **이것이 좌표계를 잡아 주는 자리다.** Unity는 왼손이고 glTF는
      // 오른손이라 X를 뒤집어 굽는데, 뒤집기를 빠뜨리거나 두 번 하면 무대가
      // 좌우로 뒤집힌다. 무대들이 좌우로 **비대칭**이라 뒤집히면 여기서 걸린다
      for (const [side, at] of Object.entries(SLOT)) {
        const y = groundAt(tris, at.x, at.z).filter((h) => h < 1)
        // 발밑에 땅이 있어야 한다. 겹은 여럿일 수 있다 — 무늬를 얇게 덧대
        // 깔아 둔 무대가 있다(사천왕 방은 아홉 겹이다)
        expect(y.length, `${side} (${String(at.x)}, ${String(at.z)})`).toBeGreaterThan(0)
        // ⚠️ **높이가 전부 0 언저리라서** `BattleStage`가 `GROUND` 하나로
        // 버틴다. 무대마다 다르면 포켓몬이 어떤 무대에서는 공중에 뜬다.
        // 1cm까지 봐준다 — 들판 체육관(g027)의 물가 발판이 6mm 올라와 있다
        for (const h of y) expect(Math.abs(h), `${file} ${side}`).toBeLessThan(0.01)
      }
    }, 30_000)

    it('표에 적힌 반지름까지 사방에 땅이 있다', () => {
      // ⚠️ **카메라가 이 안에서 돈다.** `arena.ts`의 `radius`가 여기서 나온 값이고
      // `cameraFit`이 그걸로 카메라를 당긴다 — 실제보다 크게 적어 두면 방에서
      // 카메라가 벽을 뚫는다. 무대를 다시 구웠을 때 걸리라고 여기서 잰다
      const r = EVERY_ARENA.find((a) => a.file === file)!.radius
      for (const [dx, dz] of COMPASS) {
        const at = [r * dx, r * dz] as const
        expect(
          groundAt(tris, at[0], at[1]).filter((h) => Math.abs(h) < 2).length,
          `${file} 반지름 ${String(r)} 방향 (${at[0].toFixed(1)}, ${at[1].toFixed(1)})`,
        ).toBeGreaterThan(0)
      }
    }, 30_000)

    it('오려 내거나 비치거나 — 둘 중 하나고 전부 양면이다', () => {
      // 불투명으로 두면 잎 사이가 사각형으로 막히고, 단면으로 두면 뒤에서 사라진다.
      // 비치는 것(`BLEND`)은 번들의 `RenderType`이 정한다 — 짐작이 아니다
      for (const m of gltf.materials) {
        expect(['MASK', 'BLEND'], m.name).toContain(m.alphaMode)
        expect(m.doubleSided, m.name).toBe(true)
      }
      // 재질별로 합쳐 둔다 — 원본은 메시가 수백 개라 그대로 두면 드로우콜이 그만큼이다
      expect(gltf.meshes[0]!.primitives.length).toBe(gltf.materials.length)
    })
  })

  it('방에 드는 창빛은 비친다', () => {
    // ⚠️ **전부 오려 내기로 굽던 자리다.** 그때 체육관 안 창빛이 흰 널빤지로
    // 섰다. 번들이 `RenderType: Transparent`라고 적어 둔 것을 안 읽어서다 —
    // 실내 셋에는 반드시 비치는 재질이 있어야 한다
    for (const file of ['g015.glb', 'g016.glb', 'g021.glb']) {
      const blend = stages.find((s) => s.file === file)!
        .gltf.materials.filter((m) => m.alphaMode === 'BLEND')
      expect(blend.length, file).toBeGreaterThan(0)
      for (const m of blend) expect(m.name).toMatch(/Light|Window/)
    }
    // 굴과 들판에는 없다. 있으면 벽이 비쳐 보인다
    for (const file of ['g001.glb', 'g006.glb', 'g056.glb', 'g070.glb']) {
      expect(
        stages.find((s) => s.file === file)!.gltf.materials
          .filter((m) => m.alphaMode === 'BLEND'),
        file,
      ).toHaveLength(0)
    }
  })

  it('하늘이 서는 무대는 카메라가 돌 만큼 넓다', () => {
    // ⚠️ 반대는 성립하지 않는다. 하늘 없는(`s006`) 무대 중에도 체육관처럼
    // **넓은 방**이 있다 — 하쿠타이 체육관이 24m다. 좁은 것은 민가 세 벌뿐이다
    for (const a of EVERY_ARENA) {
      if (a.sky !== 's006') expect(a.radius, a.file).toBeGreaterThanOrEqual(12)
      expect(a.radius, a.file).toBeGreaterThanOrEqual(6)
    }
  })
})
