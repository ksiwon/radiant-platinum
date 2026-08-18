// 깨어진 세계의 카메라 각 (PARITY §6.10).
//
// ⚠️ **여기서 지키는 것은 단위와 부호다.** 자료의 각은 도가 아니라 눈금이고
// (한 눈금 = 360/256도), `(s16)`으로 읽어서 **240은 −22.5도**다. 도로 읽거나
// 부호를 빼먹으면 카메라가 스물여섯 자리에서 반대로 돈다.
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  CAMERA_UNIT, cameraDegrees, cameraDelta, cameraTurnAngles, cameraTurnDone,
} from './distortionCamera'
import type { DistortionData, DistortionRom } from '../../data/schema'
import { withDistortionTables } from '../../data/distortionFile'

let data: DistortionData

beforeAll(() => {
  data = withDistortionTables(
    JSON.parse(readFileSync('public/data/distortion.json', 'utf8')) as DistortionRom,
  )
})

describe('각의 단위', () => {
  it('한 눈금이 1.40625도다', () => {
    expect(CAMERA_UNIT).toBeCloseTo(1.40625)
    expect(cameraDegrees(1)).toBeCloseTo(1.40625)
    expect(cameraDegrees(0)).toBe(0)
  })

  it('⚠️ 128을 넘으면 음수다 — 240은 −22.5도다', () => {
    expect(cameraDegrees(240)).toBeCloseTo(-22.5)
    expect(cameraDegrees(220)).toBeCloseTo(-50.625)
    // 127까지는 양수다
    expect(cameraDegrees(127)).toBeCloseTo(178.59375)
    expect(cameraDegrees(128)).toBeCloseTo(-180)
  })

  it('자료에 있는 여덟 각을 도로 읽는다', () => {
    expect(cameraDegrees(20)).toBeCloseTo(28.125)
    expect(cameraDegrees(45)).toBeCloseTo(63.28125)
    expect(cameraDegrees(55)).toBeCloseTo(77.34375)
    expect(cameraDegrees(60)).toBeCloseTo(84.375)
  })
})

describe('가까운 쪽으로 돈다', () => {
  it('반대쪽으로 돌지 않는다', () => {
    // 0 → 240은 +337.5도가 아니라 −22.5도다
    expect(cameraDelta(0, 240) / 0x10000 * 360).toBeCloseTo(-22.5)
    expect(cameraDelta(240, 0) / 0x10000 * 360).toBeCloseTo(22.5)
  })

  it('⚠️ 원작의 반 바퀴 갈래는 자료 안에서 한 번도 안 탄다', () => {
    const angles = new Set<number>()
    for (const m of data.maps) {
      for (const c of m.cameras ?? []) { angles.add(c.angleX); angles.add(c.angleY); angles.add(c.angleZ) }
    }
    // 어느 짝을 골라도 도는 양이 반 바퀴(180도)를 안 넘는다
    for (const a of angles) {
      for (const b of angles) {
        expect(Math.abs(cameraDelta(a, b) / 0x10000 * 360)).toBeLessThanOrEqual(180)
      }
    }
    expect(angles.size).toBeGreaterThan(1)
  })
})

describe('도는 동안', () => {
  const turn = { from: [0, 0, 0] as const, to: [20, 240, 0] as const, steps: 16 }

  it('처음은 떠나는 각이고 끝은 닿을 각이다', () => {
    expect(cameraTurnAngles(turn, 0)).toEqual([0, 0, 0])
    const end = cameraTurnAngles(turn, 16)
    expect(end[0]).toBeCloseTo(28.125)
    expect(end[1]).toBeCloseTo(-22.5)
    expect(cameraTurnDone(turn, 16)).toBe(true)
    expect(cameraTurnDone(turn, 15)).toBe(false)
  })

  it('중간은 선형이다', () => {
    const half = cameraTurnAngles(turn, 8)
    expect(half[0]).toBeCloseTo(28.125 / 2)
    expect(half[1]).toBeCloseTo(-22.5 / 2)
  })

  it('다 돈 뒤로는 안 넘어간다', () => {
    expect(cameraTurnAngles(turn, 999)).toEqual(cameraTurnAngles(turn, 16))
  })
})

describe('자료', () => {
  it('카메라 구역 스물여섯 곳이 여섯 층에 있다', () => {
    const per = data.maps
      .map((m) => [m.map, (m.cameras ?? []).length] as const)
      .filter(([, n]) => n > 0)
    expect(per.reduce((a, [, n]) => a + n, 0)).toBe(26)
    expect(per).toHaveLength(6)
  })

  it('⚠️ 굴리는 각은 스물여섯 곳이 다 0이다 — 그래서 안 굴린다', () => {
    for (const m of data.maps) {
      for (const c of m.cameras ?? []) expect(c.angleZ).toBe(0)
    }
  })

  it('전환 프레임이 다 들어 있다', () => {
    for (const m of data.maps) {
      for (const c of m.cameras ?? []) expect(c.steps).toBeGreaterThan(0)
    }
  })
})
