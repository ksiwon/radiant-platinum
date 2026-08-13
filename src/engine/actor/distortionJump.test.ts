// 깨어진 세계의 **두 칸 건너뛰기** (PARITY §6.10) — `TILE_BEHAVIOR_JUMP_*_TWICE`
//
// ⚠️ **이게 없으면 그 세계는 통째로 끊긴 섬들이다.** 걷는 칸 5,086개가 112군데에서
// 두 칸씩 끊겨 있고, 그 두 칸은 통행 불가로 찍혀 있다. 1F에서 승강 발판이 있는
// 우묵한 자리(지역 x 17~21 · z 42~46)는 사방이 막혀 있어서, 뛰지 못하면 아래층으로
// 내려가는 길 자체가 없다 — 실제로 그래서 「블록이 안 떠서 못 간다」가 됐다.
//
// 여기서 재는 것은 두 가지다: 그 성질 값이 **깨어진 세계에만** 있다는 것과,
// 뛰는 거리가 **세 칸**이라는 것. 뒤엣것은 원작의 프레임 수에서 나오고
// (2/16타일 × 24프레임), 자료가 224칸 전부에서 그것을 뒷받침한다
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { Behavior, IMPASSABLE, BEHAVIOR_MASK } from '../map/zone'
import { distortionHop, distortionJump, HOP_TWICE_TILES } from './ledge'

const INDEX = 'public/data/matrices/interiors.json'
const BLOB = 'public/data/matrices/interiors.bin'
const real = existsSync(INDEX) && existsSync(BLOB)

/** 깨어진 세계 열 층의 행렬 번호 (`maps.json`의 `matrix`) */
const FLOORS: Readonly<Record<number, number>> = {
  573: 269, 574: 270, 575: 271, 576: 272, 577: 273,
  579: 275, 580: 276, 581: 277, 582: 278, 583: 279,
}

interface Sheet { w: number; h: number; tiles: Uint16Array }

function sheets(): { floors: Map<number, Sheet>; others: Sheet[] } {
  const idx = JSON.parse(readFileSync(INDEX, 'utf8')) as {
    matrices: Record<string, { tileWidth: number; tileHeight: number; byteOffset: number }>
  }
  const blob = readFileSync(BLOB)
  const floors = new Map<number, Sheet>()
  const others: Sheet[] = []
  const wanted = new Set(Object.values(FLOORS))
  for (const [key, m] of Object.entries(idx.matrices)) {
    const tiles = new Uint16Array(
      blob.buffer, blob.byteOffset + m.byteOffset, m.tileWidth * m.tileHeight)
    const sheet = { w: m.tileWidth, h: m.tileHeight, tiles }
    if (wanted.has(Number(key))) floors.set(Number(key), sheet)
    else others.push(sheet)
  }
  return { floors, others }
}

const TWICE: Readonly<Record<number, readonly [number, number]>> = {
  [Behavior.JUMP_TWICE_NORTH]: [0, -1],
  [Behavior.JUMP_TWICE_SOUTH]: [0, 1],
  [Behavior.JUMP_TWICE_WEST]: [-1, 0],
  [Behavior.JUMP_TWICE_EAST]: [1, 0],
}

describe('두 칸 뛰기', () => {
  it('네 방향 값만 뛰는 자리다', () => {
    expect(distortionJump(Behavior.JUMP_TWICE_NORTH)).toEqual([0, -1])
    expect(distortionJump(Behavior.JUMP_TWICE_SOUTH)).toEqual([0, 1])
    expect(distortionJump(Behavior.JUMP_TWICE_WEST)).toEqual([-1, 0])
    expect(distortionJump(Behavior.JUMP_TWICE_EAST)).toEqual([1, 0])
    // 턱은 두 칸 뛰기가 아니다 — 거리도 규칙도 다르다
    expect(distortionJump(Behavior.LEDGE_SOUTH)).toBeNull()
    expect(distortionJump(Behavior.NORMAL)).toBeNull()
  })

  it('가는 쪽으로만 뛴다. 옆에서 밀면 그냥 벽이다', () => {
    const at = (tx: number, tz: number) =>
      (tx === 4 && tz === 6 ? Behavior.JUMP_TWICE_SOUTH : Behavior.NORMAL)
    // (4,5)에서 남쪽으로 → (4,8)
    expect(distortionHop(at, 4.5, 5.5, 0, 1)).toEqual({ x: 4.5, z: 8.5 })
    // 같은 칸을 북쪽에서 보면 안 뛴다
    expect(distortionHop(at, 4.5, 7.5, 0, -1)).toBeNull()
    // 안 밀면 안 뛴다
    expect(distortionHop(at, 4.5, 5.5, 0, 0)).toBeNull()
  })

  describe.runIf(real)('실제 통행 자료', () => {
    it('그 값은 깨어진 세계에만 있다 — 열 층에 224칸', () => {
      const { floors, others } = sheets()
      let inside = 0
      for (const sheet of floors.values()) {
        for (const t of sheet.tiles) if (TWICE[t & BEHAVIOR_MASK]) inside++
      }
      let outside = 0
      for (const sheet of others) {
        for (const t of sheet.tiles) if (TWICE[t & BEHAVIOR_MASK]) outside++
      }
      expect(inside).toBe(224)
      expect(outside).toBe(0)
    })

    // ⚠️ **이 한 줄이 「세 칸」을 못 박는다.** 두 칸이면 착지가 나머지 한 짝
    // 위(통행 불가)가 되고, 네 칸이면 착지가 허공이다 — 224칸 전부에서
    // 세 칸일 때만 출발과 착지가 둘 다 걸을 수 있는 자리가 된다
    it('224칸 모두 출발 한 칸 뒤와 착지 세 칸 앞이 걸을 수 있는 자리다', () => {
      const { floors } = sheets()
      const bad: string[] = []
      let seen = 0
      for (const [matrix, s] of floors) {
        const open = (x: number, z: number) =>
          x >= 0 && z >= 0 && x < s.w && z < s.h && (s.tiles[z * s.w + x]! & IMPASSABLE) === 0
        for (let z = 0; z < s.h; z++) {
          for (let x = 0; x < s.w; x++) {
            const step = TWICE[s.tiles[z * s.w + x]! & BEHAVIOR_MASK]
            if (step === undefined) continue
            seen++
            const fx = x - step[0], fz = z - step[1]
            if (!open(fx, fz)) bad.push(`행렬 ${String(matrix)} 출발 (${String(fx)},${String(fz)})`)
            const lx = fx + step[0] * HOP_TWICE_TILES, lz = fz + step[1] * HOP_TWICE_TILES
            if (!open(lx, lz)) bad.push(`행렬 ${String(matrix)} 착지 (${String(lx)},${String(lz)})`)
          }
        }
      }
      expect(seen).toBe(224)
      expect(bad).toEqual([])
    })

    // 1F의 승강 발판 자리는 사방이 막힌 5×5 우묵한 자리다. 들어가는 길은
    // 북쪽에서 두 칸을 뛰는 것 하나뿐이라, 이 뜀이 없으면 아래층이 없다
    it('1F 승강 발판 자리에 들어가는 길은 두 칸 뛰기뿐이다', () => {
      const s = sheets().floors.get(FLOORS[573]!)!
      const open = (x: number, z: number) => (s.tiles[z * s.w + x]! & IMPASSABLE) === 0
      // 우묵한 자리 (x 17~21 · z 42~46)
      for (let z = 42; z <= 46; z++) for (let x = 17; x <= 21; x++) expect(open(x, z)).toBe(true)
      // 그 둘레는 전부 막혀 있다
      for (let x = 16; x <= 22; x++) {
        expect(open(x, 41)).toBe(false)
        expect(open(x, 47)).toBe(false)
      }
      for (let z = 41; z <= 47; z++) {
        expect(open(16, z)).toBe(false)
        expect(open(22, z)).toBe(false)
      }
      // 북쪽 통로 (19, 39)에서 남쪽으로 뛰면 (19, 42)에 닿는다
      expect(open(19, 39)).toBe(true)
      expect(s.tiles[40 * s.w + 19]! & BEHAVIOR_MASK).toBe(Behavior.JUMP_TWICE_SOUTH)
      expect(s.tiles[41 * s.w + 19]! & BEHAVIOR_MASK).toBe(Behavior.JUMP_TWICE_NORTH)
      const at = (tx: number, tz: number) => s.tiles[tz * s.w + tx]! & BEHAVIOR_MASK
      expect(distortionHop(at, 19.5, 39.5, 0, 1)).toEqual({ x: 19.5, z: 42.5 })
    })
  })
})
