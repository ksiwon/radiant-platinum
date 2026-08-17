// 얼음 미끄럼 (`actor/ice`) — 선단시티 체육관의 기믹 하나가 이것이다.
//
// 여기서 재는 것은 「미끄러지는가」가 아니라 **어디서 멈추는가**다. 퍼즐이
// 성립하려면 눈덩이·벽 앞에서 정확히 서야 하고, 얼음이 아닌 칸에 올라서면
// 그 칸에서 서야 한다. 그 셋이 어긋나면 관장에게 못 가거나 그냥 걸어간다.
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  clearIceSlide, heightChange, iceRunEnd, iceSlide, iceSpeedAfter, iceStep,
  ICE_HEIGHT_EPSILON, ICE_MAX_SPEED, ICE_SPEED_RATIO, isSliding, TILE_BEHAVIOR_ICE,
  lockDirection, type IceView,
} from './ice'
import { Behavior, BEHAVIOR_MASK } from '../map/zone'

/**
 * 글자 한 줄로 격자를 그린다 — `.`은 얼음, `#`은 막힌 칸, `_`는 보통 바닥.
 * z는 0 한 줄만 쓴다 (동서로 미끄러지는 판정이라 한 줄이면 족하다)
 */
function row(map: string, heights: readonly number[] = []): IceView {
  const cell = (tx: number, tz: number) => (tz === 0 ? map[tx] ?? '#' : '#')
  return {
    behaviorAt: (tx, tz) => {
      const c = cell(tx, tz)
      return c === '.' ? TILE_BEHAVIOR_ICE : Behavior.NORMAL
    },
    blockedAt: (tx, tz) => cell(tx, tz) === '#',
    heightAt: (tx) => heights[tx] ?? 0,
  }
}

beforeEach(() => { clearIceSlide() })

describe('멈추는 자리', () => {
  it('막힌 칸 **앞**에서 선다 — 눈덩이가 퍼즐이 되는 이유다', () => {
    //          0123456
    const v = row('_.....#')
    expect(iceRunEnd(v, 1, 0, 1, 0)).toEqual({ tileX: 5, tileZ: 0 })
  })

  it('얼음이 아닌 **첫 칸에 올라서서** 선다', () => {
    const v = row('_...__#')
    expect(iceRunEnd(v, 1, 0, 1, 0)).toEqual({ tileX: 4, tileZ: 0 })
  })

  it('바로 앞이 막혀 있으면 제자리다', () => {
    const v = row('_.#')
    expect(iceRunEnd(v, 1, 0, 1, 0)).toEqual({ tileX: 1, tileZ: 0 })
  })

  it('반대 방향으로도 같은 규칙이다', () => {
    const v = row('#..._')
    expect(iceRunEnd(v, 3, 0, -1, 0)).toEqual({ tileX: 1, tileZ: 0 })
  })
})

describe('속도', () => {
  it('내리막에서 오르고 3에서 멈춘다 (`AVATAR_MOVE_SPEED_3`)', () => {
    expect(iceSpeedAfter(0, 'decrease')).toBe(1)
    expect(iceSpeedAfter(2, 'decrease')).toBe(3)
    expect(iceSpeedAfter(ICE_MAX_SPEED, 'decrease')).toBe(ICE_MAX_SPEED)
  })

  it('평지에서는 그대로다', () => {
    for (const s of [0, 1, 2, 3]) expect(iceSpeedAfter(s, 'none')).toBe(s)
  })

  it('오르막에서 내려가고 0 아래로는 **못 간다** — 그때 되밀린다', () => {
    expect(iceSpeedAfter(2, 'increase')).toBe(1)
    expect(iceSpeedAfter(1, 'increase')).toBe(0)
    expect(iceSpeedAfter(0, 'increase')).toBeNull()
  })

  it('첫 단이 달리기와 같은 빠르기다 — 원작에서 둘 다 `WALK_FAST`다', () => {
    expect(ICE_SPEED_RATIO[0]).toBe(1)
    // 4:3:2 프레임 → 1 : 4/3 : 2
    expect(ICE_SPEED_RATIO[1]).toBeCloseTo(4 / 3, 10)
    expect(ICE_SPEED_RATIO[2]).toBe(2)
    expect(ICE_SPEED_RATIO[3]).toBe(ICE_SPEED_RATIO[2])
  })

  it('높이 차를 앞 칸에서 읽는다', () => {
    const v = row('....', [0, 0, 1, 0])
    expect(heightChange(v, 1, 0, 1, 0)).toBe('increase')
    expect(heightChange(v, 2, 0, 1, 0)).toBe('decrease')
    expect(heightChange(v, 0, 0, 1, 0)).toBe('none')
  })

  it('⚠️ 비탈의 보간 잡음은 층이 아니다 — 선단 체육관 실측 폭 0.0012타일', () => {
    // 같은 2.5단인데 칸마다 소수점 아래가 다르다 (`.audit/iceHeights.mjs`)
    const noisy = row('....', [2.4989, 2.4994, 2.4995, 2.4999])
    for (let i = 0; i < 3; i += 1) expect(heightChange(noisy, i, 0, 1, 0)).toBe('none')
    // 진짜 단(0.5타일)은 그대로 잡힌다
    const real = row('....', [2, 2.5, 3, 3])
    expect(heightChange(real, 0, 0, 1, 0)).toBe('increase')
    expect(ICE_HEIGHT_EPSILON).toBeLessThan(0.5 / 4)
    expect(ICE_HEIGHT_EPSILON).toBeGreaterThan(0.0012 * 10)
  })
})

describe('방향 잠그기', () => {
  it('대각으로 들어가도 **우세한 축** 하나만 잡는다', () => {
    expect(lockDirection(3, 1)).toEqual({ dx: 1, dz: 0 })
    expect(lockDirection(-1, -4)).toEqual({ dx: 0, dz: -1 })
  })

  it('서 있으면 안 잡는다 — 얼음 위에 가만히 서 있는 것은 원작에서도 된다', () => {
    expect(lockDirection(0, 0)).toBeNull()
  })
})

describe('한 프레임', () => {
  const RUN = 8

  it('얼음이 아니면 아예 안 잡는다', () => {
    const v = row('___')
    expect(iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)).toBeNull()
    expect(isSliding()).toBe(false)
  })

  it('얼음 위에서 걸음을 내디디면 잡고, **입력과 무관하게** 그 방향으로 민다', () => {
    const v = row('_....#')
    const step = iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)
    expect(step).not.toBeNull()
    expect(step!.vx).toBeGreaterThan(0)
    expect(isSliding()).toBe(true)
    // 이제 반대로 밀어도 방향이 안 바뀐다 — 이것이 퍼즐의 전부다
    const back = iceStep(v, { x: 2.5, z: 0.5 }, { vx: -4, vz: 0 }, RUN)
    expect(back!.vx).toBeGreaterThan(0)
  })

  it('멈출 칸 한가운데를 지나면 놓는다', () => {
    const v = row('_....#')
    iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)
    expect(iceSlide.toX).toBe(4.5) // 5는 막혔으니 4에서 선다
    const done = iceStep(v, { x: 4.5, z: 0.5 }, { vx: 0, vz: 0 }, RUN)
    expect(done).toEqual({ vx: 0, vz: 0 })
    expect(isSliding()).toBe(false)
  })

  it('목표를 지나치지 않는다 — 남은 거리보다 빨리 안 간다', () => {
    const v = row('_....#')
    iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)
    // 한 프레임(1/60초)에 갈 수 있는 것보다 목표가 가까운 자리
    const near = iceStep(v, { x: 4.49, z: 0.5 }, { vx: 0, vz: 0 }, RUN)
    expect(near!.vx).toBeLessThanOrEqual(RUN)
    expect(near!.vx / 60).toBeLessThanOrEqual(0.011)
  })

  it('칸을 넘을 때마다 속도를 다시 잰다 — 내리막이면 빨라진다', () => {
    const v = row('_.....#', [0, 0, 0, -1, -2, -3, -3])
    iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)
    expect(iceSlide.speed).toBe(0)
    iceStep(v, { x: 2.5, z: 0.5 }, { vx: 0, vz: 0 }, RUN)
    expect(iceSlide.speed).toBe(1)
    iceStep(v, { x: 3.5, z: 0.5 }, { vx: 0, vz: 0 }, RUN)
    expect(iceSlide.speed).toBe(2)
  })

  it('힘이 다한 오르막에서는 **되밀린다** (`SetIgnoreTileBehavior`)', () => {
    const v = row('_.....#', [0, 0, 1, 2, 3, 4, 4])
    iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)
    // 속도 0에서 오르막을 만나면 그 자리에서 방향이 뒤집힌다
    const push = iceStep(v, { x: 2.5, z: 0.5 }, { vx: 0, vz: 0 }, RUN)
    expect(iceSlide.dx).toBe(-1)
    expect(push!.vx).toBeLessThan(0)
  })
})

describe('실제 자료', () => {
  const DATA = resolve(__dirname, '../../../public/data')
  const need = process.env.PT_REQUIRE_DATA === '1'
  let sheets: { id: number; meta: { tileWidth: number; tileHeight: number }; tiles: Uint16Array }[]
  try {
    const idx = JSON.parse(readFileSync(resolve(DATA, 'matrices/interiors.json'), 'utf8')) as {
      matrices: Record<string, { id: number; tileWidth: number; tileHeight: number }>
    }
    const buf = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
    const all = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
    let at = 0
    sheets = Object.values(idx.matrices).map((meta) => {
      const n = meta.tileWidth * meta.tileHeight
      const tiles = all.subarray(at, at + n)
      at += n
      return { id: meta.id, meta, tiles }
    })
  } catch {
    sheets = []
  }

  const when = sheets.length > 0 ? it : need ? it : it.skip

  when('얼음이 깔린 실내가 **일곱 맵 835칸**이다 (선단 체육관 + 선단신전 여섯 층)', () => {
    const count = new Map<number, number>()
    for (const s of sheets) {
      let n = 0
      for (const t of s.tiles) if ((t & BEHAVIOR_MASK) === TILE_BEHAVIOR_ICE) n += 1
      if (n > 0) count.set(s.id, n)
    }
    // 행렬 114 = 선단시티 체육관 · 68~73 = 선단신전 1F~B5F
    expect(Object.fromEntries([...count].sort((a, b) => a[0] - b[0]))).toEqual({
      68: 7, 69: 14, 70: 2, 71: 106, 72: 1, 73: 208, 114: 497,
    })
    expect([...count.values()].reduce((a, b) => a + b, 0)).toBe(835)
  })
})
