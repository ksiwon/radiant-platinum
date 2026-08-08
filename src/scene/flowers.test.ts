// 화단이 실제로 몇 칸이나 있는가.
//
// `Flowers`는 자리를 못 찾으면 **아무 일도 안 하고 조용하다** — 화면은 원작
// 그대로라 아무도 눈치 못 챈다. 그래서 원작 청크를 직접 열어 칸 수를 못박는다.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { BufferAttribute, BufferGeometry } from 'three'
import { flowerSites, splitFoliage } from './plates'
import type { ChunkMesh } from './chunkMesh'

const DATA = resolve(__dirname, '../../public/data')

interface ChunkMeta {
  verts: number
  indices: number
  materials: { tex: string | null; pal: string | null; rep: number; a: number; f: number }[]
  submeshes: [number, number, number][]
}

const format = JSON.parse(readFileSync(resolve(DATA, 'chunks/index.json'), 'utf8')) as {
  posScale: number
  vertexBytes: number
}

/** 청크 파일 하나를 연다. `chunkMesh.build`와 같은 형식이다 */
function readChunk(id: number): ChunkMesh {
  const buf = readFileSync(resolve(DATA, `chunks/${String(id)}.bin`))
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const metaLen = view.getUint32(4, true)
  const meta = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buf.buffer, buf.byteOffset + 8, metaLen)),
  ) as ChunkMeta
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)
  const n = meta.verts
  const position = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const o = head + i * format.vertexBytes
    for (let a = 0; a < 3; a++) {
      position[i * 3 + a] = view.getInt16(o + a * 2, true) / format.posScale
    }
  }
  const index = new Uint16Array(
    buf.buffer.slice(
      buf.byteOffset + head + n * format.vertexBytes,
      buf.byteOffset + head + n * format.vertexBytes + meta.indices * 2,
    ),
  )
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setIndex(new BufferAttribute(index, 1))
  meta.submeshes.forEach(([, start, count], i) => { geometry.addGroup(start, count, i) })
  return {
    geometry,
    materials: meta.submeshes.map(([mat]) => meta.materials[mat]!),
    groups: meta.submeshes,
  }
}

describe('화단', () => {
  it('오버월드에 꽃 그림이 깔린 칸이 실제로 있다', () => {
    const ids = readdirSync(resolve(DATA, 'chunks'))
      .filter((f) => f.endsWith('.bin'))
      .map((f) => Number(f.replace('.bin', '')))
      .sort((a, b) => a - b)

    let cells = 0
    let chunks = 0
    for (const id of ids) {
      const mesh = readChunk(id)
      const split = splitFoliage(mesh, mesh.materials.map(() => false))
      const sites = flowerSites(mesh, split)
      if (sites.length > 0) { chunks++; cells += sites.length }
    }
    // 실측: 청크 666개 중 96개에 화단이 있고 꽃 칸이 8,140개다.
    // 0으로 떨어지면 `Flowers`가 통째로 안 도는 것이고, 그때도 화면은
    // 원작 그대로라 아무도 눈치 못 챈다
    expect(chunks, `화단이 든 청크 ${String(chunks)}개`).toBe(96)
    expect(cells, `꽃 칸 ${String(cells)}개`).toBe(8140)
  }, 60_000)

  it('서 있는 판은 화단으로 안 센다', () => {
    // 세로로 선 꽃 그림(화단 울타리)에 송이를 얹으면 공중에 뜬다
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([
      // 세로 판 — z가 한 점이다
      0, 0, 0, 1, 0, 0, 1, 1, 0,
      // 바닥 판 — 칸 (2,0)
      2, 0, 0, 3, 0, 0, 3, 0, 1,
    ]), 3))
    geometry.setIndex([0, 1, 2, 3, 4, 5])
    const mesh: ChunkMesh = {
      geometry,
      materials: [
        { tex: 'nhana', pal: '', rep: 0, a: 31, f: 0 },
        { tex: 'nhana', pal: '', rep: 0, a: 31, f: 0 },
      ],
      groups: [[0, 0, 3], [1, 3, 3]],
    }
    const split = splitFoliage(mesh, [false, false])
    const sites = flowerSites(mesh, split)
    expect(sites.map((s) => [s.x, s.z])).toEqual([[2, 0]])
  })
})
