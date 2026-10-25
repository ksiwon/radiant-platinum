import { describe, expect, it } from 'vitest'
import { drawnFloor, parseCoverBin, sealFloor, type FloorCover } from './floorSeal'
import { IMPASSABLE } from './zone'
import type { MatrixMeta } from './grid'

/** 청크 하나짜리 행렬 32×32 */
function oneChunk(land = 0): MatrixMeta {
  return {
    id: 1, name: 'test', width: 1, height: 1, tileWidth: 32, tileHeight: 32,
    chunks: [{ i: 0, mx: 0, my: 0, land, zone: -1 }],
    buildings: {},
  }
}

/** 그림 없는 표 하나 */
function blankCover(lands = 1): FloorCover {
  return { bits: new Uint8Array(lands * 128), boxes: [], posScale: 256 }
}

/** `land`의 사각형 칸에 「그려짐」 비트를 세운다 */
function paint(cover: FloorCover, land: number, x0: number, z0: number, x1: number, z1: number): void {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const at = land * 1024 + z * 32 + x
      cover.bits[at >> 3]! |= 1 << (at & 7)
    }
  }
}

/** 전부 걸을 수 있는 격자 */
const allOpen = (): Uint16Array => new Uint16Array(32 * 32)
const open = (t: Uint16Array, x: number, z: number): boolean => (t[z * 32 + x]! & IMPASSABLE) === 0

describe('발밑에 그려진 것', () => {
  it('청크 비트를 칸으로 편다', () => {
    const cover = blankCover()
    paint(cover, 0, 2, 3, 5, 7)
    const drawn = drawnFloor(oneChunk(), cover)
    expect(drawn[3 * 32 + 2]).toBe(1)
    expect(drawn[7 * 32 + 5]).toBe(1)
    expect(drawn[3 * 32 + 6]).toBe(0)
    expect(drawn.reduce<number>((s, v) => s + v, 0)).toBe(4 * 5)
  })

  it('소품 상자도 바닥으로 친다 — 챔피언 방은 바닥이 소품이다', () => {
    const cover = blankCover()
    cover.boxes = [[-2 * 256, -3 * 256, 1 * 256, 2 * 256]]
    const meta = oneChunk()
    meta.buildings = { 0: [{ model: 0, x: 10, y: 0, z: 10, rot: [0, 0, 0], scale: [1, 1, 1] }] }
    const drawn = drawnFloor(meta, cover)
    // x 8~10 · z 7~11 — 상자 오른쪽·아래 끝은 열린 구간이라 한 칸을 뺀다
    expect(drawn[10 * 32 + 8]).toBe(1)
    expect(drawn[7 * 32 + 10]).toBe(1)
    expect(drawn[10 * 32 + 7]).toBe(0)
    expect(drawn[6 * 32 + 10]).toBe(0)
  })
})

describe('그린 것이 없는 칸을 막는다', () => {
  it('방 밖을 막고 방은 그대로 둔다', () => {
    const cover = blankCover()
    paint(cover, 0, 4, 4, 9, 9)
    const tiles = allOpen()
    const sealed = sealFloor(oneChunk(), tiles, cover, [])
    expect(sealed).toBe(32 * 32 - 36)
    expect(open(tiles, 4, 4)).toBe(true)
    expect(open(tiles, 9, 9)).toBe(true)
    expect(open(tiles, 10, 9)).toBe(false)
    expect(open(tiles, 0, 0)).toBe(false)
  })

  it('두 번 막아도 같다', () => {
    const cover = blankCover()
    paint(cover, 0, 4, 4, 9, 9)
    const tiles = allOpen()
    sealFloor(oneChunk(), tiles, cover, [])
    const again = sealFloor(oneChunk(), tiles, cover, [])
    expect(again).toBe(0)
  })

  it('원래 막힌 칸은 안 센다', () => {
    const cover = blankCover()
    paint(cover, 0, 4, 4, 9, 9)
    const tiles = allOpen()
    tiles[0] = IMPASSABLE
    expect(sealFloor(oneChunk(), tiles, cover, [])).toBe(32 * 32 - 36 - 1)
  })

  it('바닥에 **닿은** 행사 칸은 남긴다 — 문턱은 모델 밖으로 한 칸 나온다', () => {
    const cover = blankCover()
    paint(cover, 0, 4, 4, 9, 9)
    const tiles = allOpen()
    sealFloor(oneChunk(), tiles, cover, [[6, 10]])
    expect(open(tiles, 6, 10)).toBe(true)
    // 그 옆은 그대로 막힌다 — 문턱 한 칸만 남는다
    expect(open(tiles, 8, 10)).toBe(false)
  })

  it('바닥에서 떨어진 행사 칸은 안 남긴다 — 연고 관장 방의 죽은 문 셋이 그렇다', () => {
    const cover = blankCover()
    paint(cover, 0, 4, 4, 9, 9)
    const tiles = allOpen()
    sealFloor(oneChunk(), tiles, cover, [[6, 13]])
    expect(open(tiles, 6, 13)).toBe(false)
    // 거기로 가는 길도 안 난다
    for (let z = 10; z <= 13; z++) expect(open(tiles, 6, z)).toBe(false)
  })

  it('막아서 길이 끊기면 안 된다 — 배틀프런티어 동쪽 날개가 두 칸으로 이어져 있었다', () => {
    const cover = blankCover()
    paint(cover, 0, 2, 5, 5, 8)    // 서쪽 방
    paint(cover, 0, 8, 5, 11, 8)   // 동쪽 방 — 사이 x 6~7이 안 그려져 있다
    const tiles = allOpen()
    sealFloor(oneChunk(), tiles, cover, [])
    // 두 방을 잇는 한 줄이 남는다
    const bridged = [6, 7].every((x) => open(tiles, x, 5) || open(tiles, x, 6)
      || open(tiles, x, 7) || open(tiles, x, 8))
    expect(bridged).toBe(true)
    // 그래도 방 바깥은 막힌다
    expect(open(tiles, 0, 0)).toBe(false)
    expect(open(tiles, 20, 20)).toBe(false)
  })

  it('이어 붙이는 길은 **제일 짧은** 것 하나다', () => {
    const cover = blankCover()
    paint(cover, 0, 2, 2, 4, 4)
    paint(cover, 0, 7, 2, 9, 4)
    const tiles = allOpen()
    sealFloor(oneChunk(), tiles, cover, [])
    let extra = 0
    for (let z = 0; z < 32; z++) {
      for (let x = 5; x <= 6; x++) if (open(tiles, x, z)) extra++
    }
    expect(extra).toBe(2)
  })

  it('두 칸을 넘는 다리는 안 놓는다 — 길게 놓으면 허공에 길이 난다', () => {
    const cover = blankCover()
    paint(cover, 0, 2, 2, 4, 4)
    // 사이가 세 칸(x 5~7)이라 한도를 넘는다
    paint(cover, 0, 8, 2, 10, 4)
    const tiles = allOpen()
    sealFloor(oneChunk(), tiles, cover, [])
    for (let x = 5; x <= 7; x++) {
      for (let z = 0; z < 32; z++) expect(open(tiles, x, z), `(${String(x)},${String(z)})`).toBe(false)
    }
    // 두 방은 그대로 남는다 — 잇지 못했다고 막지는 않는다
    expect(open(tiles, 3, 3)).toBe(true)
    expect(open(tiles, 9, 3)).toBe(true)
  })
})

describe('이웃 청크로 번진 바닥 (cover.bin의 번진 칸)', () => {
  /** 가로로 이웃한 두 청크 행렬. land 0이 왼쪽, land 1이 오른쪽 */
  const twoChunks = (): MatrixMeta => ({
    id: 1, name: 'test', width: 2, height: 1, tileWidth: 64, tileHeight: 32,
    chunks: [
      { i: 0, mx: 0, my: 0, land: 0, zone: -1 },
      { i: 1, mx: 1, my: 0, land: 1, zone: -1 },
    ],
    buildings: {},
  })
  /** 번진 칸 항목 — r은 청크 기준 (lx+32, lz+32) */
  const entry = (lx: number, lz: number, mask: number): number =>
    (((lz + 32) * 96 + (lx + 32)) | (mask << 14)) >>> 0
  const withSpill = (lists: number[][]): FloorCover => {
    const starts = new Uint32Array(lists.length + 1)
    lists.forEach((l, i) => { starts[i + 1] = starts[i]! + l.length })
    return {
      bits: new Uint8Array(lists.length * 128), boxes: [], posScale: 256,
      spill: { starts, entries: Uint32Array.from(lists.flat()) },
    }
  }

  it('왼쪽 청크의 메시가 오른쪽 청크 칸으로 번진 것도 바닥이다', () => {
    // land 0의 로컬 x=33 → 행렬 x=33 (오른쪽 청크 안 로컬 1)
    const cover = withSpill([[entry(33, 5, 0xffff)], []])
    const drawn = drawnFloor(twoChunks(), cover)
    expect(drawn[5 * 64 + 33]).toBe(1)
    expect(drawn[5 * 64 + 34]).toBe(0)
  })

  it('왼쪽으로 번진 것은 청크 위치에 따라 이웃의 왼쪽 칸이다', () => {
    // land 1의 로컬 x=-2 → 행렬 x=30 (왼쪽 청크 안)
    const cover = withSpill([[], [entry(-2, 3, 0xffff)]])
    const drawn = drawnFloor(twoChunks(), cover)
    expect(drawn[3 * 64 + 30]).toBe(1)
  })

  it('반 칸이 안 되는 표본은 이웃의 표본과 합쳐서 센다', () => {
    // 같은 칸 (행렬 x=33)을 두 청크가 표본 4개씩 나눠 덮는다
    const cover = withSpill([[entry(33, 5, 0x000f)], [entry(1, 5, 0x00f0)]])
    const drawn = drawnFloor(twoChunks(), cover)
    // 4 + 4 = 8 → 바닥
    expect(drawn[5 * 64 + 33]).toBe(1)
    const half = withSpill([[entry(33, 5, 0x000f)], [entry(1, 5, 0x000f)]])
    // 같은 표본 4개가 겹쳐 4 → 바닥 아님
    expect(drawnFloor(twoChunks(), half)[5 * 64 + 33]).toBe(0)
  })

  it('행렬 밖으로 번진 칸은 버린다', () => {
    const cover = withSpill([[entry(-5, 5, 0xffff), entry(5, -3, 0xffff)], []])
    const drawn = drawnFloor(twoChunks(), cover)
    expect(drawn.reduce<number>((s, v) => s + v, 0)).toBe(0)
  })

  it('번진 칸을 칸 비트와 맞춰 `cover.bin` 모양에서 읽는다', () => {
    // 청크 둘: 비트 256B · 누적 개수 3×u32 · 항목 둘
    const buf = new ArrayBuffer(256 + 12 + 8)
    const v = new DataView(buf)
    new Uint8Array(buf)[3] = 0x10
    v.setUint32(256 + 4, 1, true)
    v.setUint32(256 + 8, 2, true)
    v.setUint32(256 + 12, entry(33, 5, 0xffff), true)
    v.setUint32(256 + 16, entry(-2, 3, 0x1234), true)
    const parsed = parseCoverBin(buf, 2)
    expect(parsed.bits.length).toBe(256)
    expect(parsed.bits[3]).toBe(0x10)
    expect([...parsed.spill!.starts]).toEqual([0, 1, 2])
    expect(parsed.spill!.entries[1]! >>> 14).toBe(0x1234)
    // 옛 모양(비트만)은 번짐 없이 읽는다
    expect(parseCoverBin(new ArrayBuffer(256), 2).spill).toBeUndefined()
  })
})
