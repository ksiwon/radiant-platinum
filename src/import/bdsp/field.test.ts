import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decompose, exportField, flipped } from './field'
import { fieldBundles } from './convert'
import { openEnvironment } from './environment'
import { encodePng } from '../platinum/png'
import { bdspDir, withLocal } from '../../data/romData.testkit'

/** 행 우선 4×4 — 이동 · y축 회전 · 배율 */
function trs(tx: number, ty: number, tz: number, yaw: number, s: [number, number, number]): Float64Array {
  const c = Math.cos(yaw), n = Math.sin(yaw)
  return Float64Array.from([
    c * s[0], 0, n * s[2], tx,
    0, s[1], 0, ty,
    -n * s[0], 0, c * s[2], tz,
    0, 0, 0, 1,
  ])
}

describe('야외 지역 — 세울 자리 (`field.ts`)', () => {
  it('x를 뒤집은 행렬은 원작 좌표로 옮긴 점과 같은 점을 준다 (F·W·F)', () => {
    const w = trs(-110, 1, 880, 0.7, [1.2, 0.9, 1.1])
    const f = flipped(w)
    // Unity 제 좌표의 점 p → 월드 W·p → x 뒤집기. 우리는 F·p를 F·W·F로 옮긴다
    const p = [0.3, 0.5, -0.2]
    const wx = w[0]! * p[0]! + w[1]! * p[1]! + w[2]! * p[2]! + w[3]!
    const fx = f[0]! * -p[0]! + f[1]! * p[1]! + f[2]! * p[2]! + f[3]!
    expect(fx).toBeCloseTo(-wx, 9)
    expect(f[3]).toBeCloseTo(110, 9)
  })

  it('이동 · 회전 · 배율로 도로 푼다', () => {
    const m = trs(5, 2, -3, 1.1, [2, 3, 0.5])
    const d = decompose(m)
    expect(d.t).toEqual([5, 2, -3])
    d.s.forEach((v, i) => { expect(v).toBeCloseTo([2, 3, 0.5][i]!, 9) })
    // y축 회전 사원수
    expect(Math.abs(d.r[1]!)).toBeCloseTo(Math.sin(0.55), 9)
    expect(Math.abs(d.r[3]!)).toBeCloseTo(Math.cos(0.55), 9)
  })

  it('지역 번들 목록은 `area###`과 대습지만 — 배틀 배경은 뺀다', () => {
    expect(fieldBundles([
      'Environments/fields/area001', 'Environments/fields/battle001', 'Environments/fields/safari',
      'Environments/fields/area014', 'Environments/prefab_map/c01r0101',
    ])).toEqual(['area001', 'area014', 'safari'])
  })
})

const AREA = bdspDir('environments')
const area001 = AREA ? join(AREA, 'fields', 'area001') : null
withLocal('BDSP 야외', area001)('야외 지역 — 원본 자료', () => {
  it('area001을 인스턴싱으로 굽고, 떡잎마을이 원작 좌표 안에 든다', async () => {
    const env = openEnvironment([new Uint8Array(readFileSync(area001!))])
    const { stat } = await exportField(env, encodePng, { name: 'area001', maxSize: 64 })
    expect(stat.problems).toEqual([])
    // 같은 메시의 사본(낮은 나무 2,312 · 나무 954 · 풀 무더기 1,350)은 한 벌로 — 세운 삼각형이 고유 삼각형의 다섯 배쯤이다
    expect(stat.placedTriangles).toBeGreaterThan(stat.triangles * 4)
    expect(stat.instanced).toBeGreaterThan(20)
    // 떡잎마을 집 (원작 x 104~115 · z 876~886)
    const [x0, z0, x1, z1] = stat.box
    expect(x0).toBeLessThanOrEqual(104)
    expect(x1).toBeGreaterThanOrEqual(115)
    expect(z0).toBeLessThanOrEqual(876)
    expect(z1).toBeGreaterThanOrEqual(886)
  }, 300_000)
})
