import { describe, expect, it } from 'vitest'
import { drawnFloor, sealFloor, type FloorCover } from './floorSeal'
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
