// 운하시티 체육관의 떠 있는 판 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **판을 타야만 위층에 갈 수 있는가**다. 여섯째 뱃지의
// 방이고 바닥이 없어서, 표가 어긋나면 관장이 선 4층 섬에 영영 못 간다.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CANALAVE_COLLISION, CANALAVE_FLOOR_HEIGHT, CANALAVE_GYM_MAP, CANALAVE_PLATFORMS,
  CANALAVE_PLATFORMS_COUNT, canalaveBlocked, canalaveFloorAt, canalaveInB,
  canalaveInitialStates, canalaveToggle,
} from '../engine/world/canalaveGym'
import { worldState } from '../state/worldState'
import {
  canalaveBlockedAt, canalaveBusy, canalavePlatformDraw, canalavePlatformFloor,
  canalavePlatformTile, canalaveProps, canalaveStepped, canalaveTick, initCanalaveGym,
  resetCanalaveGym,
} from './canalaveGym'

/** 다 움직일 때까지 굴린다 */
function settle(): number {
  let frames = 0
  while (canalaveBusy()) {
    canalaveTick(1 / 60)
    frames++
    if (frames > 2000) throw new Error('판이 안 멈춘다')
  }
  return frames
}

/** 그 칸에 서서 한 걸음 밟은 것으로 친다 */
function standOn(index: number): boolean {
  const tile = canalavePlatformTile(index)!
  worldState.player.position.set(tile[0]! + 0.5, tile[1]!, tile[2]! + 0.5)
  return canalaveStepped()
}

describe('표가 롬과 맞는가', () => {
  it('판이 스물넷이다', () => {
    expect(CANALAVE_PLATFORMS).toHaveLength(CANALAVE_PLATFORMS_COUNT)
  })

  it('층 표가 넷이고 32×32다', () => {
    expect(CANALAVE_COLLISION).toHaveLength(4)
    for (const map of CANALAVE_COLLISION) expect(map).toHaveLength(32 * 32)
  })

  it('⚠️ 위층일수록 걸을 자리가 줄어든다', () => {
    const open = CANALAVE_COLLISION.map((m) => m.filter((v) => v === 0).length)
    expect(open).toEqual([386, 346, 251, 99])
  })

  it('판의 두 자리가 서로 다르다', () => {
    // 같으면 밟아도 아무 데도 안 간다 — 표를 잘못 옮긴 자리다
    for (const [i, p] of CANALAVE_PLATFORMS.entries()) {
      expect(p.a.join(','), `${String(i)}번 판`).not.toBe(p.b.join(','))
    }
  })

  it('⚠️ 빨간 판 둘만 세 층을 한 번에 오간다', () => {
    const red = CANALAVE_PLATFORMS.filter((p) => p.axis === 'red')
    expect(red).toHaveLength(2)
    for (const p of red) {
      expect(p.floorA).toBe(0)
      expect(p.floorB).toBe(3)
      expect(p.b[1] - p.a[1]).toBe(CANALAVE_FLOOR_HEIGHT * 3)
    }
  })

  it('옆으로 가는 판은 층이 안 바뀐다', () => {
    for (const p of CANALAVE_PLATFORMS) {
      if (p.axis === 'x' || p.axis === 'z') {
        expect(p.floorA).toBe(p.floorB)
        expect(p.a[1]).toBe(p.b[1])
      }
    }
  })

  it('판이 서는 자리가 그 층에서 걸을 수 있는 칸이다', () => {
    // 막힌 칸에 판을 세우면 타고 내려도 못 움직인다
    for (const [i, p] of CANALAVE_PLATFORMS.entries()) {
      for (const [pos, floor] of [[p.a, p.floorA], [p.b, p.floorB]] as const) {
        const at = CANALAVE_COLLISION[floor]![pos[2] * 32 + pos[0]]
        expect(at, `${String(i)}번 판의 (${String(pos[0])},${String(pos[2])}) ${String(floor)}층`).toBe(0)
      }
    }
  })

  it('딛는 높이로 층을 고른다', () => {
    expect(canalaveFloorAt(0)).toBe(0)
    expect(canalaveFloorAt(9)).toBe(0)
    expect(canalaveFloorAt(10)).toBe(1)
    expect(canalaveFloorAt(30)).toBe(3)
    expect(canalaveFloorAt(99)).toBe(3)
  })

  it('격자 밖은 막힌다', () => {
    expect(canalaveBlocked(0, -1, 0)).toBe(true)
    expect(canalaveBlocked(0, 32, 0)).toBe(true)
  })
})

describe('처음 자리', () => {
  beforeEach(() => { resetCanalaveGym() })

  it('`startInPositionB`대로 선다', () => {
    expect(initCanalaveGym(CANALAVE_GYM_MAP)).toBe(true)
    const states = canalaveInitialStates()
    for (const [i, p] of CANALAVE_PLATFORMS.entries()) {
      expect(canalaveInB(states, i)).toBe(p.startB)
      expect(canalavePlatformTile(i)).toEqual(p.startB ? [...p.b] : [...p.a])
      expect(canalavePlatformFloor(i)).toBe(p.startB ? p.floorB : p.floorA)
    }
  })

  it('자리 표가 비트 스물넷이다', () => {
    const states = canalaveInitialStates()
    expect(canalaveToggle(states, 0)).not.toBe(states)
    expect(canalaveInB(canalaveToggle(states, 5), 5)).toBe(!canalaveInB(states, 5))
  })
})

describe('밟으면 판이 움직인다', () => {
  beforeEach(() => { resetCanalaveGym(); initCanalaveGym(CANALAVE_GYM_MAP) })

  it('⚠️ 「어느 칸에 있는가」는 밟는 순간 뛰고 그림만 미끄러진다', () => {
    // 하나로 합치면 다 도착하기 전에는 그 판을 못 찾는다
    const index = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'y')
    const path = CANALAVE_PLATFORMS[index]!
    expect(standOn(index)).toBe(true)
    expect(canalavePlatformTile(index)).toEqual([...path.b])
    expect(canalavePlatformDraw(index)![1]).toBe(path.a[1])
    settle()
    expect(canalavePlatformDraw(index)![1]).toBe(path.b[1])
  })

  it('층 하나를 오르는 데 스무 프레임이다', () => {
    // 프레임당 반 칸, 층 사이가 열 칸이다
    const index = CANALAVE_PLATFORMS.findIndex(
      (p) => p.axis === 'y' && p.floorB - p.floorA === 1)
    standOn(index)
    // 마지막 한 프레임은 뒤처리다
    expect(settle()).toBe(21)
  })

  it('사람이 판에 붙어 올라간다', () => {
    const index = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'y' && !p.startB)
    const path = CANALAVE_PLATFORMS[index]!
    standOn(index)
    settle()
    expect(worldState.player.position.y).toBe(path.b[1])
  })

  it('⚠️ 내려가는 판은 출발할 때 · 올라가는 판은 닿은 뒤에 층이 바뀐다', () => {
    // 그래야 내려가는 동안 그 판이 화면에서 안 사라진다
    const up = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'y' && !p.startB)
    standOn(up)
    expect(canalavePlatformFloor(up)).toBe(CANALAVE_PLATFORMS[up]!.floorA)
    settle()
    expect(canalavePlatformFloor(up)).toBe(CANALAVE_PLATFORMS[up]!.floorB)

    const down = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'y' && p.startB)
    standOn(down)
    expect(canalavePlatformFloor(down)).toBe(CANALAVE_PLATFORMS[down]!.floorA)
  })

  it('옆으로 가는 판은 층이 그대로다', () => {
    const index = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'x')
    const before = canalavePlatformFloor(index)
    standOn(index)
    settle()
    expect(canalavePlatformFloor(index)).toBe(before)
    expect(canalavePlatformTile(index)![1]).toBe(CANALAVE_PLATFORMS[index]!.a[1])
  })

  it('다시 밟으면 되돌아온다', () => {
    const index = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'z')
    const path = CANALAVE_PLATFORMS[index]!
    const start = [...canalavePlatformTile(index)!]
    standOn(index)
    settle()
    expect(canalavePlatformTile(index)).not.toEqual(start)
    standOn(index)
    settle()
    expect(canalavePlatformTile(index)).toEqual(start)
    expect(path.a).toBeDefined()
  })

  it('판이 없는 칸을 밟으면 아무 일도 없다', () => {
    worldState.player.position.set(0.5, 0, 0.5)
    expect(canalaveStepped()).toBe(false)
  })

  it('⚠️ 세 축이 다 맞아야 한다', () => {
    // x·z만 보면 위층의 판을 밟은 것으로 읽힌다
    const index = CANALAVE_PLATFORMS.findIndex((p) => p.axis === 'y')
    const tile = canalavePlatformTile(index)!
    worldState.player.position.set(tile[0]! + 0.5, tile[1]! + 10, tile[2]! + 0.5)
    expect(canalaveStepped()).toBe(false)
  })
})

describe('층이 딛는 높이로 갈린다', () => {
  beforeEach(() => { resetCanalaveGym(); initCanalaveGym(CANALAVE_GYM_MAP) })

  it('같은 칸이 층마다 다르게 막힌다', () => {
    // 층 표가 넷 다 같으면 판을 타는 뜻이 없다
    let differs = 0
    for (let z = 0; z < 32; z++) {
      for (let x = 0; x < 32; x++) {
        const seen = new Set(CANALAVE_COLLISION.map((m) => m[z * 32 + x]))
        if (seen.size > 1) differs++
      }
    }
    expect(differs).toBeGreaterThan(100)
  })

  it('⚠️ 「모른다」가 없다 — 격자를 아예 안 본다', () => {
    expect(canalaveBlockedAt(0, 0, 0)).not.toBeNull()
    expect(typeof canalaveBlockedAt(5, 5, 0)).toBe('boolean')
  })

  it('이 체육관이 아니면 안 본다', () => {
    resetCanalaveGym()
    expect(canalaveBlockedAt(0, 0, 0)).toBeNull()
  })

  it('아래층에서는 위층 바닥을 안 그린다', () => {
    worldState.player.position.set(1, 0, 1)
    const floors = canalaveProps().filter((p) => p.key.endsWith('층바닥'))
    expect(floors).toHaveLength(0)
    worldState.player.position.set(1, 30, 1)
    expect(canalaveProps().filter((p) => p.key.endsWith('층바닥'))).toHaveLength(3)
  })
})
