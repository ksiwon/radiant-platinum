// 동굴 입구 틀이 뒤 절벽까지 닿는다 (지시서 R5 · 천관산 흰 띠).
//
// `dhole` 틀은 바닥과 옆벽이 타일 경계 1/8칸 앞에서 끝나고, 뒤를 막는 절벽은
// 옆 청크에서 경계에 선다. 1인칭으로 내려다보면 그 1/8칸 사이로 하늘이 보였다
// (맵 220 실측 — `chunkMesh`의 `closeCaveMouths` 머리말). 실제 청크로 잰다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { closeCaveMouths, type Sill } from './chunkMesh'
import { withData } from '../data/romData.testkit'

const DATA = resolve(__dirname, '../../public/data/chunks')
const maybe = withData('chunks/index.json', 'chunks/377.bin')

/** 그 틀이 찍힌 청크 다섯. 같은 모양이 똑같이 찍혀 있다 */
const MOUTHS = [377, 381, 578, 637, 641]

interface Meta {
  verts: number
  indices: number
  materials: { tex: string | null, pal: string | null, rep: number, a: number, f: number }[]
  submeshes: [number, number, number][]
}

function load(index: number) {
  const fmt = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as {
    posScale: number, vertexBytes: number
  }
  const buf = readFileSync(resolve(DATA, `${String(index)}.bin`))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const view = new DataView(ab)
  const metaLen = view.getUint32(4, true)
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, metaLen))) as Meta
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)
  const n = meta.verts
  const position = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    const o = head + i * fmt.vertexBytes
    for (let a = 0; a < 3; a++) position[i * 3 + a] = view.getInt16(o + a * 2, true) / fmt.posScale
    for (let a = 0; a < 2; a++) uv[i * 2 + a] = view.getFloat32(o + 8 + a * 4, true)
  }
  const indices = new Uint16Array(ab, head + n * fmt.vertexBytes, meta.indices)
  return { meta, position, uv, indices }
}

/** 틀의 정점 번호 */
function mouthVerts(meta: Meta, indices: Uint16Array): number[] {
  const out = new Set<number>()
  for (const [mat, start, count] of meta.submeshes) {
    if (meta.materials[mat]?.tex !== 'dhole') continue
    for (let t = start; t < start + count; t++) out.add(indices[t]!)
  }
  return [...out]
}

maybe('동굴 입구 틀', () => {
  it('실측한 그 모양이다 — 바닥과 옆벽이 z 7.875에서 끝난다', () => {
    const { meta, position, indices } = load(377)
    const vs = mouthVerts(meta, indices)
    const zs = new Set(vs.map((i) => position[i * 3 + 2]))
    expect(zs.has(7.875), '틀이 바뀌었다 — 이 고침의 근거부터 다시 본다').toBe(true)
    expect(zs.has(8)).toBe(false)
  })

  for (const index of MOUTHS) {
    it(`청크 ${String(index)} — 안쪽 끝이 경계(z 8)에 닿는다`, () => {
      const { meta, position, uv, indices } = load(index)
      const before = Float32Array.from(position)
      const moved = closeCaveMouths(position, uv, indices, meta)
      expect(moved, '아무것도 안 옮겼다').toBeGreaterThan(0)
      const vs = mouthVerts(meta, indices)
      const zs = vs.map((i) => position[i * 3 + 2]!)
      // 7.875가 남지 않고 경계로 옮겨졌다
      expect(zs.some((z) => Math.abs(z - 7.875) < 1e-4)).toBe(false)
      expect(zs.some((z) => z === 8)).toBe(true)
      // 입구 쪽은 그대로다 — 반대편까지 끌면 입구가 절벽에서 떨어진다
      expect(zs.some((z) => Math.abs(z - 5.875) < 1e-4)).toBe(true)
      // 틀 밖의 정점은 하나도 안 움직였다
      const mine = new Set(vs)
      for (let i = 0; i < position.length / 3; i++) {
        if (mine.has(i)) continue
        expect(position[i * 3 + 2]).toBe(before[i * 3 + 2])
        expect(position[i * 3 + 1]).toBe(before[i * 3 + 1])
      }
    })
  }

  it('바닥은 기울기를 이어 간다 — 끝만 끌어 꺾지 않는다', () => {
    // 바닥은 z 5.875에서 y 0.875, z 7.875에서 y 0.9375 — 1/32씩 오르는 경사다
    const { meta, position, uv, indices } = load(377)
    closeCaveMouths(position, uv, indices, meta)
    const vs = mouthVerts(meta, indices)
    const farFloor = vs.filter((i) => position[i * 3 + 2] === 8 && position[i * 3 + 1]! < 1.0)
      .filter((i) => position[i * 3]! > 14.4 && position[i * 3]! < 16.6)
    expect(farFloor.length).toBeGreaterThan(0)
    const slope = (0.9375 - 0.875) / 2
    for (const i of farFloor) {
      const yy = position[i * 3 + 1]!
      // 벽 아랫단(y 0.875·0.938)은 그대로, 바닥 끝만 경사를 따라 1/8칸 더 오른다
      const onSlope = Math.abs(yy - (0.9375 + slope * 0.125)) < 1e-4
      const wallFoot = Math.abs(yy - 0.875) < 1e-4 || Math.abs(yy - 0.9375) < 1e-4
      expect(onSlope || wallFoot, `y ${String(yy)}`).toBe(true)
    }
    // 뒤 절벽의 아랫변(0.926)보다 바닥 끝이 높아야 틈이 닫힌다
    expect(0.9375 + slope * 0.125).toBeGreaterThan(0.926)
  })

  it('그림도 같은 비율로 이어 간다 — 마지막 6%를 늘이지 않는다', () => {
    const a = load(377)
    const b = load(377)
    closeCaveMouths(b.position, b.uv, b.indices, b.meta)
    const vs = mouthVerts(a.meta, a.indices)
    let checked = 0
    for (const i of vs) {
      if (Math.abs(a.position[i * 3 + 2]! - 7.875) > 1e-4) continue
      // 바닥 정점은 UV가 움직여야 한다 (벽의 키 큰 조각은 짝이 없어 그대로일 수 있다)
      const du = b.uv[i * 2]! - a.uv[i * 2]!
      const dv = b.uv[i * 2 + 1]! - a.uv[i * 2 + 1]!
      if (Math.hypot(du, dv) > 0) checked++
    }
    expect(checked, 'UV를 이어 붙인 정점이 없다').toBeGreaterThan(0)
  })

  it('안쪽 끝에 문턱 면이 선다 — 뒤 절벽 밑변(1.0)보다 높이까지', () => {
    // 늘리기만으로는 맵 220의 x 32~33 조각 앞이 계속 열려 있었다 — 그 조각에는
    // 절벽 아랫단(0.926~1)이 없어서 바닥 끝 0.941과 절벽 밑변 1.0 사이가 빈다
    const { meta, position, uv, indices } = load(377)
    const color = new Float32Array(position.length).fill(0.5)
    const sills: Sill[] = []
    closeCaveMouths(position, uv, indices, meta, color, sills)
    expect(sills.length).toBe(1)
    const sill = sills[0]!
    const ys = [1, 4, 7, 10].map((k) => sill.position[k]!)
    const zs = [2, 5, 8, 11].map((k) => sill.position[k]!)
    const xs = [0, 3, 6, 9].map((k) => sill.position[k]!)
    expect(new Set(zs), '문턱이 경계에 안 섰다').toEqual(new Set([8]))
    expect(Math.min(...xs)).toBeCloseTo(14.5, 4)
    expect(Math.max(...xs)).toBeCloseTo(16.5, 4)
    // 옆벽 아랫단의 꼭대기(1.0625)까지 — 절벽 밑변 1.0을 넘는다
    expect(Math.max(...ys)).toBeCloseTo(1.0625, 4)
    expect(Math.max(...ys)).toBeGreaterThan(1.0)
    expect(Math.min(...ys)).toBeLessThan(0.95)
  })

  it('문턱은 입구 쪽을 본다 — 감는 순서가 앞뒤를 정한다', () => {
    const { meta, position, uv, indices } = load(377)
    const sills: Sill[] = []
    closeCaveMouths(position, uv, indices, meta, undefined, sills)
    const sill = sills[0]!
    const P = (k: number) => [sill.position[k * 3]!, sill.position[k * 3 + 1]!, sill.position[k * 3 + 2]!]
    const [a, b, c] = [P(sill.order[0]!), P(sill.order[1]!), P(sill.order[2]!)]
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!]
    const nz = u[0]! * v[1]! - u[1]! * v[0]!
    // 입구는 z 5.875 — 경계(8)보다 작은 쪽이다. 법선이 −z를 봐야 한다
    expect(nz, '문턱이 뒤를 보고 있다').toBeLessThan(0)
  })

  it('문턱 그림은 바닥을 접어 올린 것이다 — 한 줄을 늘이지 않는다', () => {
    const { meta, position, uv, indices } = load(377)
    const sills: Sill[] = []
    closeCaveMouths(position, uv, indices, meta, undefined, sills)
    const t = sills[0]!.uv
    // 아랫변 둘은 가로로 다른 자리를, 윗변은 아랫변에서 높이만큼 옮겨 간 자리다
    const bottom = [[t[0]!, t[1]!], [t[2]!, t[3]!]]
    const upper = [[t[6]!, t[7]!], [t[4]!, t[5]!]]
    expect(Math.hypot(bottom[0]![0]! - bottom[1]![0]!, bottom[0]![1]! - bottom[1]![1]!)).toBeGreaterThan(0.01)
    for (const k of [0, 1]) {
      expect(Math.hypot(upper[k]![0]! - bottom[k]![0]!, upper[k]![1]! - bottom[k]![1]!)).toBeGreaterThan(0)
    }
  })

  it('모르는 모양은 안 건드린다', () => {
    // 틀이 없는 청크에서는 한 정점도 안 옮긴다
    const { meta, position, uv, indices } = load(0)
    expect(closeCaveMouths(position, uv, indices, meta)).toBe(0)
  })
})

describe('틀 고르기', () => {
  it('이 틀은 dhole 하나다', () => {
    const src = readFileSync(resolve(__dirname, 'chunkMesh.ts'), 'utf8')
    expect(src).toContain("const CAVE_MOUTH = 'dhole'")
  })
})
