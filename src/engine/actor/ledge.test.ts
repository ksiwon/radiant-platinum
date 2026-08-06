// 턱은 한쪽으로만 넘어간다 (actor/ledge)
//
// 방향을 틀리면 지름길이 아니라 벽을 통과하는 구멍이 된다. 그래서 자료에서
// 턱을 다시 세어 보고, 실제 격자에서 양쪽으로 다 밀어 본다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from '../map/grid'
import { Behavior, IMPASSABLE } from '../map/zone'
import { ledgeHop, ledgeJump } from './ledge'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'matrices/0.bin'))
const maybe = present ? describe : describe.skip

function detach(p: string): ArrayBuffer {
  const buf = readFileSync(resolve(DATA, p))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

maybe('턱', () => {
  let grid: MapGrid

  beforeAll(() => {
    grid = new MapGrid(
      JSON.parse(readFileSync(resolve(DATA, 'matrices/0.json'), 'utf8')) as MatrixMeta,
      new Uint16Array(detach('matrices/0.bin')),
    )
  })

  it('턱 값 셋만 방향을 준다', () => {
    expect(ledgeJump(Behavior.LEDGE_SOUTH)).toEqual([0, 1])
    expect(ledgeJump(Behavior.LEDGE_WEST)).toEqual([-1, 0])
    expect(ledgeJump(Behavior.LEDGE_EAST)).toEqual([1, 0])
    for (const other of [Behavior.NORMAL, Behavior.TALL_GRASS, Behavior.WATER_OPEN, 0x69]) {
      expect(ledgeJump(other)).toBeNull()
    }
  })

  it('턱 칸수와 모양이 실측과 같다', () => {
    // 이 셋이 턱이라고 고른 근거가 이 수다. 자료가 바뀌면 근거부터 다시 봐야 한다
    const want = [
      [Behavior.LEDGE_SOUTH, 305, 'h'],
      [Behavior.LEDGE_WEST, 21, 'v'],
      [Behavior.LEDGE_EAST, 15, 'v'],
    ] as const
    for (const [value, count, shape] of want) {
      let n = 0, across = 0, along = 0, open = 0
      for (let z = 1; z < grid.tileHeight - 1; z++) {
        for (let x = 1; x < grid.tileWidth - 1; x++) {
          if (grid.tileAt(x, z) !== (value | IMPASSABLE)) continue
          n++
          if (grid.tileAt(x + 1, z) === (value | IMPASSABLE)) across++
          if (grid.tileAt(x, z + 1) === (value | IMPASSABLE)) along++
          // 양옆이 다 걸을 수 있는데 자기만 막혀 있다 — 턱을 가르는 잣대다
          const [dx, dz] = ledgeJump(value)!
          if (!grid.isBlocked(x - dx, z - dz) && !grid.isBlocked(x + dx, z + dz)) open++
        }
      }
      expect(n, `0x${value.toString(16)} 칸수`).toBe(count)
      // 남쪽 턱은 가로줄, 동서 턱은 세로줄이다
      if (shape === 'h') expect(along).toBe(0)
      else expect(across).toBe(0)
      // 거의 전부가 "양쪽 다 통행 가능"이어야 턱이다
      expect(open / n).toBeGreaterThan(0.9)
    }
  })

  /** 남쪽 턱 하나를 골라 그 위칸을 준다 */
  function southLedge(): { x: number; z: number } {
    for (let z = 1; z < grid.tileHeight - 1; z++) {
      for (let x = 1; x < grid.tileWidth - 1; x++) {
        if (grid.tileAt(x, z) !== (Behavior.LEDGE_SOUTH | IMPASSABLE)) continue
        if (grid.isBlocked(x, z - 1) || grid.isBlocked(x, z + 1)) continue
        return { x, z }
      }
    }
    throw new Error('남쪽 턱을 못 찾았다')
  }

  it('위에서 아래로는 넘어가고 아래에서 위로는 못 넘는다', () => {
    const at = southLedge()
    // 턱 바로 위 칸에서 남쪽으로 민다 → 턱 너머 칸 한가운데에 내린다
    const down = ledgeHop(grid, at.x + 0.5, at.z - 0.5, 0, 1)
    expect(down).toEqual({ x: at.x + 0.5, z: at.z + 1.5 })
    // 반대쪽에서 북쪽으로 밀면 그냥 벽이다
    expect(ledgeHop(grid, at.x + 0.5, at.z + 1.5, 0, -1)).toBeNull()
    // 옆으로 밀어도 안 넘는다
    expect(ledgeHop(grid, at.x + 0.5, at.z - 0.5, 1, 0)).toBeNull()
    // 안 밀면 안 넘는다
    expect(ledgeHop(grid, at.x + 0.5, at.z - 0.5, 0, 0)).toBeNull()
  })

  it('착지할 칸이 막혔으면 안 넘는다', () => {
    const fake = {
      behavior: (tx: number, tz: number) => (tx === 5 && tz === 6 ? Behavior.LEDGE_SOUTH : 0),
      isBlocked: (_tx: number, tz: number) => tz === 7,
    }
    expect(ledgeHop(fake, 5.5, 5.5, 0, 1)).toBeNull()
    // 착지 칸이 트이면 넘는다
    const ok = { ...fake, isBlocked: () => false }
    expect(ledgeHop(ok, 5.5, 5.5, 0, 1)).toEqual({ x: 5.5, z: 7.5 })
  })

  it('대각선으로 밀면 더 세게 민 쪽으로만 본다', () => {
    const fake = {
      behavior: (tx: number, tz: number) => (tx === 5 && tz === 6 ? Behavior.LEDGE_SOUTH : 0),
      isBlocked: () => false,
    }
    // 남쪽이 더 세다 → 넘는다
    expect(ledgeHop(fake, 5.5, 5.5, 0.4, 1)).not.toBeNull()
    // 동쪽이 더 세다 → 동쪽 칸을 보는데 거긴 턱이 아니다
    expect(ledgeHop(fake, 5.5, 5.5, 1, 0.4)).toBeNull()
  })
})
