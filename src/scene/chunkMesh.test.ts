// 청크 파일 검증 (DATA.md §2.2)
//
// 지오메트리가 맞는지는 추출기가 증명한다 — MDL0 헤더가 적어 둔 정점·삼각형
// 수와 666/666 일치한다. 여기서는 **싣는 파일**이 그 결과와 어긋나지 않았는지,
// 그리고 읽는 쪽이 같은 규격을 보고 있는지를 본다.
//
// 규격이 어긋나면 화면이 조용히 이상해진다 — 정점 폭을 하나 틀리면 좌표가
// 밀리면서 삼각형이 가시처럼 찢어지는데, 개수는 그대로 맞는다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DATA = resolve(__dirname, '../../public/data/chunks')
const present = existsSync(resolve(DATA, 'index.json')) && existsSync(resolve(DATA, '0.bin'))
const maybe = present ? describe : describe.skip

interface ChunkMeta {
  verts: number
  indices: number
  materials: { tex: string | null, pal: string | null, rep: number, a: number, f: number }[]
  submeshes: [number, number, number][]
}

/** 파일 앞머리를 읽는다. 읽는 쪽(`chunkMesh.ts`)과 같은 규격이어야 한다 */
function open(index: number): { meta: ChunkMeta, head: number, bytes: Buffer } {
  const bytes = readFileSync(resolve(DATA, `${String(index)}.bin`))
  expect(bytes.subarray(0, 4).toString('ascii')).toBe('PT3C')
  const metaLen = bytes.readUInt32LE(4)
  const meta = JSON.parse(bytes.subarray(8, 8 + metaLen).toString('utf8')) as ChunkMeta
  return { meta, head: 8 + metaLen + ((4 - (metaLen % 4)) % 4), bytes }
}

maybe('청크 파일', () => {
  const format = JSON.parse(readFileSync(resolve(DATA, 'index.json'), 'utf8')) as {
    posScale: number, vertexBytes: number, unitsPerTile: number, count: number
  }

  it('규격이 읽는 쪽과 같다', () => {
    // 이 넷이 `chunkMesh.ts`의 오프셋 계산을 통째로 정한다
    expect(format.vertexBytes).toBe(24)
    expect(format.posScale).toBe(256)
    expect(format.unitsPerTile).toBe(16)
    expect(format.count).toBe(666)
  })

  it('파일 크기가 정점·색인 수와 정확히 맞는다', () => {
    // 한 바이트라도 남거나 모자라면 규격이 어긋난 것이다
    for (const i of [0, 1, 177, 300, 665]) {
      const { meta, head, bytes } = open(i)
      expect(bytes.length).toBe(head + meta.verts * format.vertexBytes + meta.indices * 2)
    }
  })

  it('서브메시가 색인 전부를 빈틈없이 덮는다', () => {
    const { meta } = open(0)
    let at = 0
    for (const [material, start, count] of meta.submeshes) {
      expect(start).toBe(at)
      expect(material).toBeLessThan(meta.materials.length)
      at += count
    }
    expect(at).toBe(meta.indices)
    expect(meta.indices % 3).toBe(0)
  })

  it('색인이 정점 범위 안에 있다', () => {
    // u16으로 담으므로 65536을 넘으면 조용히 감긴다. 실측 최대가 4757이다
    const { meta, head, bytes } = open(0)
    expect(meta.verts).toBeLessThan(65536)
    const at = head + meta.verts * format.vertexBytes
    for (let k = 0; k < meta.indices; k++) {
      expect(bytes.readUInt16LE(at + k * 2)).toBeLessThan(meta.verts)
    }
  })

  it('좌표가 청크 한 칸 안에 든다', () => {
    // 모델은 −16~+16 타일로 가운데 정렬돼 있다. 유닛(16유닛 = 한 타일)을
    // 타일로 안 옮기면 여기서 16배로 튄다
    const { meta, head, bytes } = open(0)
    let minY = Infinity, maxXZ = 0
    for (let k = 0; k < meta.verts; k++) {
      const o = head + k * format.vertexBytes
      const x = bytes.readInt16LE(o) / format.posScale
      const y = bytes.readInt16LE(o + 2) / format.posScale
      const z = bytes.readInt16LE(o + 4) / format.posScale
      maxXZ = Math.max(maxXZ, Math.abs(x), Math.abs(z))
      minY = Math.min(minY, y)
    }
    expect(maxXZ).toBeLessThan(24)
    expect(maxXZ).toBeGreaterThan(15)
    expect(minY).toBeGreaterThan(-8)
  })

  it('재질이 텍스처와 팔레트를 이름으로 가리킨다', () => {
    const { meta } = open(0)
    expect(meta.materials.length).toBeGreaterThan(0)
    for (const m of meta.materials) {
      expect(typeof m.tex).toBe('string')
      // 반복 비트 4개 · 알파 0~31 · 그리는 면 0~3
      expect(m.rep).toBeLessThanOrEqual(0xf)
      expect(m.a).toBeLessThanOrEqual(31)
      expect(m.f).toBeLessThanOrEqual(3)
    }
  })
})

const TEX = resolve(__dirname, '../../public/data/tex/index.json')
const texPresent = existsSync(TEX)
const maybeTex = texPresent ? describe : describe.skip

maybeTex('맵 텍스처 시트', () => {
  const index = JSON.parse(readFileSync(TEX, 'utf8')) as {
    sheetWidth: number
    sets: { w: number, h: number, items: [string, string, number, number, number, number][] }[]
  }

  it('묶음 74벌이고 조각이 시트 안에 든다', () => {
    expect(index.sets).toHaveLength(74)
    let total = 0
    for (const set of index.sets) {
      expect(set.w).toBe(index.sheetWidth)
      for (const [, , x, y, w, h] of set.items) {
        expect(x + w).toBeLessThanOrEqual(set.w)
        expect(y + h).toBeLessThanOrEqual(set.h)
        // NDS 텍스처는 변이 전부 2의 거듭제곱이다 (8~128)
        expect(Math.log2(w) % 1).toBe(0)
        expect(Math.log2(h) % 1).toBe(0)
        total++
      }
    }
    expect(total).toBe(2736)
  })

  it('한 묶음 안에서 조각이 안 겹친다', () => {
    // 겹치면 두 텍스처가 서로의 픽셀을 물어 온다. 눈으로는 "색이 이상하다"로만 보인다
    for (const set of index.sets) {
      const seen: [number, number, number, number][] = []
      for (const [, , x, y, w, h] of set.items) {
        for (const [ox, oy, ow, oh] of seen) {
          const apart = x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y
          expect(apart).toBe(true)
        }
        seen.push([x, y, w, h])
      }
    }
  })
})
