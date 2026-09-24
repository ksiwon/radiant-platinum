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
 * 칸마다의 높이 — 숫자면 **평평한 칸**, `[서쪽 끝, 동쪽 끝]`이면 그 사이를 곧게 오르내리는
 * **비탈 칸**이다. 선단 체육관이 그렇다: 단은 평평하고 단 사이 한 칸이 비탈이다(가운데 2.5 ·
 * 끝 2와 3). 칸 안의 점을 읽는다 — 원작이 4분의 1칸 앞을 보기 때문이다(`heightChange`)
 */
type Tile = number | readonly [number, number]
function profile(tiles: readonly Tile[]): (x: number) => number {
  return (x) => {
    const i = Math.floor(x)
    const t = tiles[i] ?? 0
    if (typeof t === 'number') return t
    return t[0] + (t[1] - t[0]) * (x - i)
  }
}

/**
 * 글자 한 줄로 격자를 그린다 — `.`은 얼음, `#`은 막힌 칸, `_`는 보통 바닥.
 * z는 0 한 줄만 쓴다 (동서로 미끄러지는 판정이라 한 줄이면 족하다)
 */
function row(map: string, heights: readonly Tile[] = []): IceView {
  const cell = (tx: number, tz: number) => (tz === 0 ? map[tx] ?? '#' : '#')
  return {
    behaviorAt: (tx, tz) => {
      const c = cell(tx, tz)
      return c === '.' ? TILE_BEHAVIOR_ICE : Behavior.NORMAL
    },
    blockedAt: (tx, tz) => cell(tx, tz) === '#',
    heightAt: profile(heights),
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

  it('높이 차를 **선 칸 안** 4분의 1칸 앞에서 읽는다 — 비탈은 비탈 칸에서 한 번만 잡힌다', () => {
    const v = row('....', [0, [0, 1], [1, 0], 0])
    expect(heightChange(v, 1, 0, 1, 0)).toBe('increase')
    expect(heightChange(v, 2, 0, 1, 0)).toBe('decrease')
    // 평평한 칸은 앞 칸이 비탈이어도 그대로다 — 이웃 칸 한가운데와 견주면 여기서 한 번 더 셌다
    expect(heightChange(v, 0, 0, 1, 0)).toBe('none')
    expect(heightChange(v, 3, 0, -1, 0)).toBe('none')
  })

  it('⚠️ 평평한 단에서 턱 칸으로는 속도 0 그대로 올라선다 — 무청 앞 (11,6) → (11,5)', () => {
    // 3단 얼음 둘 → 3에서 4로 오르는 턱(얼음 아님). 원작은 턱 칸에 올라서서 선다.
    // 전에는 턱 칸 한가운데(3.5)를 보고 오르막으로 읽어 되밀었다 (REPAIR §80)
    const v = row('_.._', [3, 3, 3, [3, 4]])
    const pos = { x: 2.5, z: 0.5 }
    let input = { vx: 4, vz: 0 }
    for (let f = 0; f < 600; f++) {
      const step = iceStep(v, pos, input, 8)
      input = { vx: 0, vz: 0 }
      if (step === null || !isSliding()) break
      pos.x += step.vx / 60
    }
    expect(Math.floor(pos.x)).toBe(3)
  })

  it('⚠️ 비탈의 보간 잡음은 층이 아니다 — 선단 체육관 실측 폭 0.0012타일', () => {
    // 같은 2.5단인데 칸마다 소수점 아래가 다르다 (`.audit/probe/iceHeights.mjs`)
    const noisy = row('....', [2.4989, 2.4994, 2.4995, 2.4999])
    for (let i = 0; i < 3; i += 1) expect(heightChange(noisy, i, 0, 1, 0)).toBe('none')
    // 진짜 단(0.5타일)은 그대로 잡힌다
    const real = row('....', [2, [2, 3], 3, 3])
    expect(heightChange(real, 1, 0, 1, 0)).toBe('increase')
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

  it('⚠️ 얼음이 아닌 칸에서 끝나면 그 프레임은 **속도 0**이다 — 흘러서 새 미끄럼이 잡히지 않는다', () => {
    // 동쪽으로 미끄러져 3(얼음 아님)에 선다. 그 뒤 4는 다시 얼음이다
    const v = row('_.._..#')
    iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)
    expect(iceSlide.toX).toBe(3.5)
    const done = iceStep(v, { x: 3.5, z: 0.5 }, { vx: 8, vz: 0 }, RUN)
    // 전에는 `null`을 내서 평소 이동이 초당 8칸을 이어받아 4로 흘러 새 미끄럼을 잡았다 (REPAIR §81)
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
    const v = row('_.....#', [0, 0, [0, -1], [-1, -2], [-2, -3], -3, -3])
    iceStep(v, { x: 1.5, z: 0.5 }, { vx: 4, vz: 0 }, RUN)
    expect(iceSlide.speed).toBe(0)
    iceStep(v, { x: 2.5, z: 0.5 }, { vx: 0, vz: 0 }, RUN)
    expect(iceSlide.speed).toBe(1)
    iceStep(v, { x: 3.5, z: 0.5 }, { vx: 0, vz: 0 }, RUN)
    expect(iceSlide.speed).toBe(2)
  })

  it('힘이 다한 오르막에서는 **되밀린다** (`SetIgnoreTileBehavior`)', () => {
    const v = row('_.....#', [0, 0, [0, 1], [1, 2], [2, 3], [3, 4], 4])
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

/**
 * 눈덩이 (`ov5_021E06A8`) — 선단 체육관 안내원이 「얼음 위를 달려 기세 좋게 부수는
 * 거야」라고 하는 그것. `o`는 눈덩이다. 깨지기 전에는 막힌 칸이다
 */
describe('눈덩이', () => {
  const RUN = 8

  function yard(map: string, heights: readonly Tile[]) {
    const broken = new Set<number>()
    const ball = (tx: number, tz: number) => tz === 0 && map[tx] === 'o' && !broken.has(tx)
    const view: IceView = {
      behaviorAt: (tx, tz) => (tz === 0 && (map[tx] === '.' || map[tx] === 'o')
        ? TILE_BEHAVIOR_ICE : Behavior.NORMAL),
      blockedAt: (tx, tz) => tz !== 0 || map[tx] === undefined || map[tx] === '#' || ball(tx, tz),
      heightAt: profile(heights),
      breakAt: (tx, tz) => {
        if (!ball(tx, tz)) return false
        broken.add(tx)
        return true
      },
    }
    return { view, broken }
  }

  /** 동쪽으로 한 번 밀고 멈출 때까지 프레임을 돌린다. 멈춘 칸을 낸다 */
  function slideEast(view: IceView, fromX: number): number {
    const pos = { x: fromX + 0.5, z: 0.5 }
    let input = { vx: 4, vz: 0 }
    for (let f = 0; f < 600; f++) {
      const v = iceStep(view, pos, input, RUN)
      input = { vx: 0, vz: 0 }
      if (v === null || !isSliding()) break
      pos.x += v.vx / 60
    }
    return Math.floor(pos.x)
  }

  it('평평한 얼음(속도 0)에서는 안 깨지고 그 앞에 선다', () => {
    //                         0123456789
    const { view, broken } = yard('_...o...#', [])
    expect(slideEast(view, 1)).toBe(3)
    expect(broken.size).toBe(0)
  })

  it('비탈을 내려와 속도가 붙으면 깨고 **계속 미끄러진다**', () => {
    //                         0123456789
    const { view, broken } = yard('_...o...#', [2, 2, [2, 1], 1, 1, 1, 1, 1, 1])
    expect(slideEast(view, 1)).toBe(7)
    expect([...broken]).toEqual([4])
  })

  it('비탈 꼭대기에서 첫 걸음이 내리막이면 첫 걸음부터 속도 1이다', () => {
    // 선 칸(1)이 곧 내리막 비탈이다. 첫 걸음의 높이를 안 보면 속도 0으로 남아
    // 바로 앞 눈덩이 (3)을 못 깬다
    const { view, broken } = yard('_..o..#', [2, [2, 1], 1, 1, 1, 1])
    expect(slideEast(view, 1)).toBe(5)
    expect([...broken]).toEqual([3])
  })

  it('속도 0에서 첫 걸음이 오르막이면 되밀린다', () => {
    const { view } = yard('_...#', [0, 0, [0, 1], 1, 1])
    // 2(오르막 비탈)에서 동쪽으로 밀면 서쪽으로 한 칸 되밀린다
    expect(slideEast(view, 2)).toBe(1)
  })
})

describe('한쪽으로만 막힌 칸과 되밀림', () => {
  const RUN = 8
  const lineView = (map: string, heights: readonly Tile[], edge: (x: number, dx: number) => boolean): IceView => ({
    behaviorAt: (tx, tz) => (tz === 0 && map[tx] === '.' ? TILE_BEHAVIOR_ICE : Behavior.NORMAL),
    blockedAt: (tx, tz) => tz !== 0 || map[tx] === undefined || map[tx] === '#',
    heightAt: profile(heights),
    edgeBlockedAt: (tx, tz, dx) => tz === 0 && edge(tx, dx),
  })
  const slide = (view: IceView, fromX: number, vx: number): number => {
    const pos = { x: fromX + 0.5, z: 0.5 }
    let input = { vx, vz: 0 }
    for (let f = 0; f < 600; f++) {
      const v = iceStep(view, pos, input, RUN)
      input = { vx: 0, vz: 0 }
      if (v === null || !isSliding()) break
      pos.x += v.vx / 60
    }
    return Math.floor(pos.x)
  }

  it('가장자리가 막힌 칸 앞에서 선다 — 그 칸이 비어 있어도', () => {
    // 3 → 4 걸음을 가장자리가 막는다 (4가 동서로 못 드는 칸이라 치자)
    const v = lineView('_......#', [], (x, dx) => x === 3 && dx === 1)
    expect(slide(v, 1, 4)).toBe(3)
  })

  it('되밀릴 뒤가 막혔으면 되밀리지 않고 선다', () => {
    // 2에서 동쪽이 오르막(속도 0) — 뒤(1)로 가는 걸음을 가장자리가 막는다
    const v = lineView('_...#', [0, 0, [0, 1], 1, 1], (x, dx) => x === 2 && dx === -1)
    expect(slide(v, 2, 4)).toBe(2)
  })
})
