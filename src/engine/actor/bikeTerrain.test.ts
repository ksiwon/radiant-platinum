// 자전거만 지나가는 지형 둘 (`actor/bikeTerrain`)
//
// 규칙을 틀리면 **길이 열리거나 막힌다** — 도약대는 못 넘으면 벽이고, 비탈은
// 걸어서 오르면 막아야 할 길이 열린다. 그래서 규칙을 재고, **실제 격자에서
// 스물넷·서른넷을 다 훑어** 그 규칙이 자료와 맞는지도 잰다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { withData } from '../../data/romData.testkit'
import { Behavior } from '../map/zone'
import {
  RAMP_FAR_TILES, RAMP_NEAR_TILES, SLOPE_DESCENT, SLOPE_SLIP,
  bikeRampHop, bikeSlopeStep, clearBikeSlip, drainBikeCues,
  isBikeRamp, isBikeSlope, isSlippingDownSlope,
} from './bikeTerrain'
import { SFX } from '../audio/sfx'

const DATA = resolve(__dirname, '../../../public/data')
const WALK = 4.5

/** 한 칸만 값이 다른 격자. 나머지는 걸을 수 있는 보통 바닥이다 */
function gridWith(cells: Record<string, number>, blocked: readonly string[] = []) {
  return {
    behavior: (x: number, z: number) => cells[`${String(x)},${String(z)}`] ?? Behavior.NORMAL,
    isBlocked: (x: number, z: number) => blocked.includes(`${String(x)},${String(z)}`),
  }
}

describe('자전거 도약대', () => {
  beforeEach(() => { drainBikeCues() })

  it('받는 쪽에서만 걸린다 — 반대쪽에서는 그냥 벽이다', () => {
    // 원작 `PlayerAvatar_WillHitBikeRamp`가 방향과 값을 짝지어 본다
    const east = gridWith({ '11,5': Behavior.BIKE_RAMP_EAST })
    // 동쪽 도약대에 동쪽으로 밀면 뛴다
    expect(bikeRampHop(east, 10.5, 5.5, 1, 0, true, true)).not.toBeNull()
    // 같은 칸에 서쪽으로 밀면 안 뛴다 (앞 칸이 도약대가 아니다)
    expect(bikeRampHop(east, 12.5, 5.5, -1, 0, true, true)).toBeNull()

    const west = gridWith({ '9,5': Behavior.BIKE_RAMP_WEST })
    expect(bikeRampHop(west, 10.5, 5.5, -1, 0, true, true)).not.toBeNull()
    expect(bikeRampHop(west, 8.5, 5.5, 1, 0, true, true)).toBeNull()
  })

  it('남북으로는 안 걸린다 — 도약대는 동서로만 받는다', () => {
    const g = gridWith({ '10,4': Behavior.BIKE_RAMP_EAST, '10,6': Behavior.BIKE_RAMP_EAST })
    expect(bikeRampHop(g, 10.5, 5.5, 0, -1, true, true)).toBeNull()
    expect(bikeRampHop(g, 10.5, 5.5, 0, 1, true, true)).toBeNull()
  })

  it('걸어서는 못 넘는다', () => {
    const g = gridWith({ '11,5': Behavior.BIKE_RAMP_EAST })
    expect(bikeRampHop(g, 10.5, 5.5, 1, 0, false, false)).toBeNull()
    // 걸어온 사람에게는 소리도 안 난다 — 벽에 부딪히는 소리는 보통 충돌이 낸다
    expect(drainBikeCues()).toEqual([])
  })

  it('전속력이면 멀리, 아니면 가까이 뛴다', () => {
    const g = gridWith({ '11,5': Behavior.BIKE_RAMP_EAST })
    // 도약대에 올라선 뒤 그 자리에서 뛰므로 출발 칸에서 `1 + 거리`다
    const far = bikeRampHop(g, 10.5, 5.5, 1, 0, true, true)
    expect(far?.x).toBe(11 + RAMP_FAR_TILES + 0.5)
    expect(far?.z).toBe(5.5)
    expect(far?.time).toBeCloseTo(12 / 60, 10)

    const near = bikeRampHop(g, 10.5, 5.5, 1, 0, true, false)
    expect(near?.x).toBe(11 + RAMP_NEAR_TILES + 0.5)
    expect(near?.time).toBeCloseTo(16 / 60, 10)
  })

  it('먼 도약에만 소리가 붙는다', () => {
    const g = gridWith({ '11,5': Behavior.BIKE_RAMP_EAST })
    bikeRampHop(g, 10.5, 5.5, 1, 0, true, true)
    expect(drainBikeCues()).toEqual([SFX.BIKE_RAMP_FAR])
    bikeRampHop(g, 10.5, 5.5, 1, 0, true, false)
    expect(drainBikeCues()).toEqual([])
  })

  it('착지가 막혔으면 안 뛴다', () => {
    // 도약대가 11이므로 먼 착지는 그 세 칸 너머인 14다
    const g = gridWith({ '11,5': Behavior.BIKE_RAMP_EAST }, ['14,5'])
    expect(bikeRampHop(g, 10.5, 5.5, 1, 0, true, true)).toBeNull()
    // 가까운 도약은 그 칸이 아니라 안 걸린다
    expect(bikeRampHop(g, 10.5, 5.5, 1, 0, true, false)).not.toBeNull()
  })
})

describe('진흙 비탈', () => {
  const slope = (cells: Record<string, number>) => ({
    behaviorAt: (x: number, z: number) => cells[`${String(x)},${String(z)}`] ?? Behavior.NORMAL,
  })
  const TOP = { '5,10': Behavior.BIKE_SLOPE_TOP, '5,11': Behavior.BIKE_SLOPE_BOTTOM }

  beforeEach(() => { clearBikeSlip(); drainBikeCues() })

  it('비탈이 아니면 손대지 않는다', () => {
    const v = slope(TOP)
    expect(bikeSlopeStep(v, { x: 5.5, z: 3.5 }, { vx: 0, vz: -1 }, WALK, false)).toBeNull()
    expect(drainBikeCues()).toEqual([])
  })

  it('걸어서는 못 오른다 — 미끄러져 내려온다', () => {
    const v = slope(TOP)
    const out = bikeSlopeStep(v, { x: 5.5, z: 11.5 }, { vx: 0, vz: -1 }, WALK, false)
    expect(out).toEqual({ vx: 0, vz: WALK * SLOPE_SLIP })
    expect(isSlippingDownSlope()).toBe(true)
  })

  it('전속력 자전거만 오른다', () => {
    const v = slope(TOP)
    // 오르는 동안은 보통 걸음 그대로다 — 속도를 갈아 끼우지 않는다
    expect(bikeSlopeStep(v, { x: 5.5, z: 11.5 }, { vx: 0, vz: -1 }, WALK, true)).toBeNull()
    expect(isSlippingDownSlope()).toBe(false)
  })

  it('내려가는 쪽은 걷든 타든 네 배로 흘러내린다', () => {
    const v = slope(TOP)
    expect(bikeSlopeStep(v, { x: 5.5, z: 10.5 }, { vx: 0, vz: 1 }, WALK, false))
      .toEqual({ vx: 0, vz: WALK * SLOPE_DESCENT })
    expect(isSlippingDownSlope()).toBe(false)
  })

  it('미끄러지는 동안은 위를 눌러도 안 먹는다', () => {
    const v = slope(TOP)
    bikeSlopeStep(v, { x: 5.5, z: 11.5 }, { vx: 0, vz: -1 }, WALK, false)
    // 다시 위를 눌러도, 심지어 전속력이라고 해도 미끄러짐이 이긴다
    expect(bikeSlopeStep(v, { x: 5.5, z: 11.5 }, { vx: 0, vz: -1 }, WALK, true))
      .toEqual({ vx: 0, vz: WALK * SLOPE_SLIP })
  })

  it('비탈에서 내려서면 미끄러짐이 풀린다', () => {
    const v = slope(TOP)
    bikeSlopeStep(v, { x: 5.5, z: 11.5 }, { vx: 0, vz: -1 }, WALK, false)
    expect(isSlippingDownSlope()).toBe(true)
    expect(bikeSlopeStep(v, { x: 5.5, z: 12.5 }, { vx: 0, vz: -1 }, WALK, false)).toBeNull()
    expect(isSlippingDownSlope()).toBe(false)
  })

  it('동서로 가는 걸음은 비탈이 안 건드린다', () => {
    const v = slope(TOP)
    // 원작 `TileMove_BikeSlope`가 남북만 다루고 나머지는 `FALSE`를 준다
    expect(bikeSlopeStep(v, { x: 5.5, z: 10.5 }, { vx: 1, vz: 0 }, WALK, false)).toBeNull()
    expect(drainBikeCues()).toEqual([])
  })

  it('소리는 칸마다 한 번이다', () => {
    const v = slope(TOP)
    bikeSlopeStep(v, { x: 5.5, z: 10.5 }, { vx: 0, vz: 1 }, WALK, false)
    expect(drainBikeCues()).toEqual([SFX.BIKE_SLOPE])
    // 같은 칸에서 또 밟아도 안 난다
    bikeSlopeStep(v, { x: 5.6, z: 10.7 }, { vx: 0, vz: 1 }, WALK, false)
    expect(drainBikeCues()).toEqual([])
    // 아랫칸으로 내려서면 한 번 더 난다 — 두 칸짜리 비탈이라 둘이다
    bikeSlopeStep(v, { x: 5.5, z: 11.5 }, { vx: 0, vz: 1 }, WALK, false)
    expect(drainBikeCues()).toEqual([SFX.BIKE_SLOPE])
  })
})

/** 실제 격자에서 그 값들이 몇이고 어떻게 놓여 있는가 */
withData('matrices/0.bin', 'matrices/interiors.bin')('자료와 맞대기', () => {
  interface Mat { name: string; tileWidth: number; tileHeight: number; byteOffset?: number }

  /** 격자 전부 — 오버월드 하나와 실내 269개 */
  function grids(): { mat: Mat; at: (x: number, z: number) => number }[] {
    const read = (p: string): Uint16Array => {
      const buf = readFileSync(resolve(DATA, p))
      return new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2)
    }
    const out: { mat: Mat; at: (x: number, z: number) => number }[] = []
    const over = JSON.parse(readFileSync(resolve(DATA, 'matrices/0.json'), 'utf8')) as Mat
    const overBin = read('matrices/0.bin')
    const make = (mat: Mat, bin: Uint16Array, base: number) => ({
      mat,
      at: (x: number, z: number) =>
        (x < 0 || z < 0 || x >= mat.tileWidth || z >= mat.tileHeight)
          ? 0x8000
          : bin[base + z * mat.tileWidth + x]!,
    })
    out.push(make(over, overBin, 0))
    const inner = JSON.parse(readFileSync(resolve(DATA, 'matrices/interiors.json'), 'utf8')) as
      { matrices: Record<string, Mat> }
    const innerBin = read('matrices/interiors.bin')
    for (const mat of Object.values(inner.matrices)) {
      out.push(make(mat, innerBin, (mat.byteOffset ?? 0) / 2))
    }
    return out
  }

  /** 값별로 칸을 모은다 */
  function census() {
    const ramps: { at: (x: number, z: number) => number; x: number; z: number; dx: number }[] = []
    const slopes: { at: (x: number, z: number) => number; x: number; z: number; v: number }[] = []
    for (const { mat, at } of grids()) {
      for (let z = 0; z < mat.tileHeight; z++) {
        for (let x = 0; x < mat.tileWidth; x++) {
          const v = at(x, z) & 0x7fff
          if (isBikeRamp(v)) ramps.push({ at, x, z, dx: v === Behavior.BIKE_RAMP_EAST ? 1 : -1 })
          if (isBikeSlope(v)) slopes.push({ at, x, z, v })
        }
      }
    }
    return { ramps, slopes }
  }

  const open = (at: (x: number, z: number) => number, x: number, z: number): boolean =>
    (at(x, z) & 0x8000) === 0

  it('도약대 스물넷이 전부 통행 불가다 — 자전거 말고는 벽이라는 뜻이다', () => {
    const { ramps } = census()
    expect(ramps).toHaveLength(24)
    for (const r of ramps) expect(open(r.at, r.x, r.z), `${String(r.x)},${String(r.z)}`).toBe(false)
  })

  it('두 도약 거리가 스물넷 다 걸을 수 있는 칸에 떨어진다', () => {
    // ⚠️ **이것이 거리를 못박는 근거다.** 원작 `InitJump`에서 3칸·1칸이 나오는데,
    // 그 둘이 자료에서도 다 설 수 있는 자리다. 짐작한 값이면 여기서 어긋난다
    const { ramps } = census()
    for (const r of ramps) {
      const where = `${String(r.x)},${String(r.z)}`
      expect(open(r.at, r.x + r.dx * RAMP_NEAR_TILES, r.z), `가까운 ${where}`).toBe(true)
      expect(open(r.at, r.x + r.dx * RAMP_FAR_TILES, r.z), `먼 ${where}`).toBe(true)
    }
  })

  it('비탈 서른넷은 다 걸을 수 있다 — 막는 것은 격자가 아니라 규칙이다', () => {
    const { slopes } = census()
    expect(slopes).toHaveLength(34)
    for (const s of slopes) expect(open(s.at, s.x, s.z)).toBe(true)
  })

  it('비탈은 늘 위 한 칸 · 아래 한 칸씩 짝이다', () => {
    // 짝이라는 것이 「비탈 위인가」만 물어도 되는 근거다 — 어느 쪽 칸인지는 안 묻는다
    const { slopes } = census()
    const tops = slopes.filter((s) => s.v === Behavior.BIKE_SLOPE_TOP)
    expect(tops).toHaveLength(17)
    expect(slopes.length - tops.length).toBe(17)
    for (const t of tops) {
      // 바로 남쪽이 아래 칸이다 (z가 커지는 쪽이 남쪽)
      expect((t.at(t.x, t.z + 1) & 0x7fff), `${String(t.x)},${String(t.z)}`)
        .toBe(Behavior.BIKE_SLOPE_BOTTOM)
    }
  })
})
