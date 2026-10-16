// 깃발을 천으로 다시 걸기 검증 (`cloth.ts`)
//
// 겁나는 것은 **매인 변을 짐작하는 것**이다. 위가 매였다고 못 박으면 옆으로 매단 깃발이 나와도 그대로 위에 묶는다.
// 여기서 보는 것은 셋이다 — 곧은 변 · 가까운 변 잣대가 그 둘로만 고르는가, 원작 D32 깃발 열두 장이 실제로 가로대에
// 매였다고 재지는가, 그리고 계획(`planChunk`)이 그 판을 걷고 천을 세우는가.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { CLOTH_ALONG, CLOTH_AWAY, clothGeometry, clothPanel, hoistEdge, pointTriangleDistance } from './cloth'
import { planChunk } from './visual/chunkPlan'
import { VISUAL_RECIPES } from './visual/recipes'
import type { ChunkMesh, TexSheet } from './chunkMesh'
import { withData } from '../data/romData.testkit'

describe('매인 변 고르기', () => {
  const straight = { u0: 1, u1: 1, v0: 1, v1: 0.23 }
  it('곧은 변 중 다른 면에 제일 가까운 것', () => {
    expect(hoistEdge(straight, { u0: 0.232, u1: 0.885, v0: 0.075, v1: 0.761 })).toBe('v0')
    expect(hoistEdge(straight, { u0: 0.05, u1: 0.885, v0: 0.075, v1: 0.761 })).toBe('u0')
  })
  it('나부끼는 끝(제비꼬리)은 아무리 가까워도 안 매인다', () => {
    expect(hoistEdge(straight, { u0: 0.4, u1: 0.4, v0: 0.4, v1: 0.01 })).toBe('u0')
  })
  it('매달 데가 없으면 안 바꾼다', () => {
    expect(hoistEdge(straight, { u0: 0.6, u1: Infinity, v0: 0.9, v1: 0.01 })).toBeNull()
  })
})

describe('점 · 삼각형 거리', () => {
  const a = [0, 0, 0], b = [1, 0, 0], c = [0, 1, 0]
  it('면 위 · 모서리 · 꼭짓점', () => {
    expect(pointTriangleDistance([0.2, 0.2, 0.5], a, b, c)).toBeCloseTo(0.5, 9)
    expect(pointTriangleDistance([0.5, -0.3, 0], a, b, c)).toBeCloseTo(0.3, 9)
    expect(pointTriangleDistance([2, 0, 0], a, b, c)).toBeCloseTo(1, 9)
    expect(pointTriangleDistance([1, 1, 0], a, b, c)).toBeCloseTo(Math.SQRT1_2, 9)
  })
})

describe('천 한 폭', () => {
  // 손으로 그린 4×4 깃발 — 위 · 양옆이 곧고 아래가 뚫렸다. 위에 가로대(다른 서브메시)가 있다
  const rows = ['####', '####', '####', '#..#']
  const sheet: TexSheet = {
    width: 4, height: 4, items: [{ tex: 'flag', pal: '', x: 0, y: 0, w: 4, h: 4 }],
    pixels: new Uint8ClampedArray(rows.flatMap((r) => [...r].flatMap((ch) => [40, 80, 200, ch === '#' ? 255 : 0]))),
  }
  // 깃발 x 0~1 · y 1~2 (v 0이 위) · z 0, 가로대 x −0.2~1.2 · y 2.05 · z −0.1~0.1
  const position = [0, 2, 0, 1, 2, 0, 1, 1, 0, 0, 1, 0, -0.2, 2.05, -0.1, 1.2, 2.05, -0.1, 1.2, 2.05, 0.1, -0.2, 2.05, 0.1]
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]
  const index = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7]
  const around = { index, position, groups: [[0, 0, 6], [1, 6, 6]] as [number, number, number][] }
  const panel = clothPanel(around, uv, undefined, [0, 3], 0, sheet, sheet.items[0]!, 0)!

  it('가로대 밑 위 변에 매인다', () => {
    expect(panel.hoist).toBe('v0')
    expect(panel.measured.distance.v0).toBeCloseTo(0.05, 6)
    expect(panel.measured.straight.v1).toBeCloseTo(0.5, 6)
  })
  it('매인 변의 정점은 안 움직일 자리(거리 0)이고 끝은 천 길이다', () => {
    const cols = CLOTH_ALONG + 1
    for (let i = 0; i < cols; i++) {
      expect(panel.wave[i * 4]).toBe(0)
      expect(panel.position[i * 3 + 1]).toBeCloseTo(2, 6)
      const last = (CLOTH_AWAY * cols + i) * 4
      expect(panel.wave[last]).toBeCloseTo(1, 6)
    }
    // 멀어지는 쪽은 아래(−y)다
    expect([...panel.away.slice(0, 3)].map((x) => +x.toFixed(6))).toEqual([0, -1, 0])
  })
  it('기하 하나로 모으면 삼각형이 폭마다 마디 수 × 2', () => {
    const g = clothGeometry([panel, panel])!
    expect(g.getIndex()!.count / 3).toBe(2 * CLOTH_ALONG * CLOTH_AWAY * 2)
    expect(g.getAttribute('clothWave').itemSize).toBe(4)
  })
})

const DATA = resolve(__dirname, '../../public/data')
const maybe = withData('chunks/584.bin', 'tex/72.png')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

function readChunk(index: number): ChunkMesh {
  const fmt = read('chunks/index.json') as { posScale: number, vertexBytes: number }
  const buf = readFileSync(resolve(DATA, `chunks/${String(index)}.bin`))
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  const view = new DataView(ab)
  const metaLen = view.getUint32(4, true)
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 8, metaLen))) as {
    verts: number, indices: number
    materials: { tex: string | null, pal: string | null, rep: number, a: number, f: number }[]
    submeshes: [number, number, number][]
  }
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)
  const position = new Float32Array(meta.verts * 3), uvs = new Float32Array(meta.verts * 2)
  for (let i = 0; i < meta.verts; i++) {
    const o = head + i * fmt.vertexBytes
    for (let a = 0; a < 3; a++) position[i * 3 + a] = view.getInt16(o + a * 2, true) / fmt.posScale
    for (let a = 0; a < 2; a++) uvs[i * 2 + a] = view.getFloat32(o + 8 + a * 4, true)
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex([...new Uint16Array(ab, head + meta.verts * fmt.vertexBytes, meta.indices)])
  return { geometry, materials: meta.submeshes.map(([m]) => meta.materials[m]!), groups: meta.submeshes }
}

function sheetFor(set: number): TexSheet {
  const { decodePng } = createRequire(import.meta.url)('../../tools/spike/png-decode.js') as {
    decodePng: (f: string) => { width: number, height: number, pixels: Uint8Array }
  }
  const png = decodePng(resolve(DATA, `tex/${String(set)}.png`))
  const info = (read('tex/index.json') as { sets: { items: [string, string, number, number, number, number][] }[] }).sets[set]!
  return {
    width: png.width, height: png.height,
    items: info.items.map(([tex, pal, x, y, w, h]) => ({ tex, pal, x, y, w, h })),
    pixels: new Uint8ClampedArray(png.pixels.buffer, png.pixels.byteOffset, png.pixels.length),
  }
}

/** D32(배틀프런티어 바깥 · 행렬 256 · 묶음 72)에서 깃발이 선 청크 */
const FLAG_CHUNKS = [584, 585, 586, 591, 592]

maybe('원작 자료 — D32 깃발', () => {
  it('열두 장이 다 가로대 밑 위 변에 매인다', () => {
    const sheet = sheetFor(72)
    const item = sheet.items.find((s) => s.tex === 'bf_hata02.1')!
    let n = 0
    for (const land of FLAG_CHUNKS) {
      const mesh = readChunk(land)
      const g = mesh.materials.findIndex((m) => m.tex === 'bf_hata02.1')
      const [, start, count] = mesh.groups[g]!
      for (let t = start; t < start + count; t += 6) {
        const p = clothPanel(
          { index: mesh.geometry.getIndex()!.array, position: mesh.geometry.getAttribute('position').array, groups: mesh.groups },
          mesh.geometry.getAttribute('uv').array, undefined, [t, t + 3], g, sheet, item, 3)!
        expect(p.hoist).toBe('v0')
        // 머리말의 실측 — 위 0.075(가로대) · 왼 0.232(기둥) · 아래 0.761 · 오른 0.885 · 제비꼬리 0.23
        expect(+p.measured.distance.v0.toFixed(3)).toBe(0.075)
        expect(+p.measured.distance.u0.toFixed(3)).toBe(0.232)
        expect(+p.measured.straight.v1.toFixed(3)).toBe(0.231)
        // 천은 불투명 상자(26×29텍셀)만큼 — 2.0타일 길이
        expect(p.wave[2]).toBeCloseTo(2, 3)
        n++
      }
    }
    expect(n).toBe(12)
  })

  it('계획이 판을 걷고 천을 건다 — 테두리(옆면)도 같이 빠진다', () => {
    const sheet = sheetFor(72)
    let cloths = 0, removed = 0
    for (const land of FLAG_CHUNKS) {
      const mesh = readChunk(land)
      const vp = planChunk(mesh, sheet, 72, land, VISUAL_RECIPES, 'verified')!
      const flags = vp.plan.decisions.filter((d) => d.recipeId === 'bf-hata02-cloth')
      expect(flags.every((d) => d.status === 'ready'), JSON.stringify(flags.map((d) => d.reason))).toBe(true)
      cloths += vp.cloths.length
      for (const d of flags) removed += d.removeOffsets.length
    }
    expect(cloths).toBe(12)
    // 걷는 원작 삼각형 = 깃발 판 열두 장 × 2
    expect(removed).toBe(24)
  })
})
