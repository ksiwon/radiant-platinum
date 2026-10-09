// 판을 갈아타는 도중의 자세 (`RotateMapObject`, `ov9_02249960.c:2849`)
//
// ⚠️ 여기서 지키는 것은 **몸 · 카메라 기울기가 같은 k를 읽고, 위쪽(up)이 세계 Z축 둘레로 spriteAngle도를
// 고르게 돈다**는 것이다 — 원작이 그림을 그 축으로 돌린다.
import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import {
  PLATFORM_CEILING, PLATFORM_EAST_WALL, PLATFORM_FLOOR, PLATFORM_NONE, PLATFORM_WEST_WALL,
  platformBasis, type PoseTurn,
} from '../world/distortion'
import { surfaceQuaternion, turnQuaternion } from './distortionSurface'

const UP = new Vector3(0, 1, 0)

/** 자료의 판 갈아타기 — 갈래 쌍과 spriteAngle (`distortion.json`의 점프 스물에서 나온 여덟 쌍) */
const PAIRS: readonly [number, number, number][] = [
  [PLATFORM_FLOOR, PLATFORM_WEST_WALL, 90],
  [PLATFORM_WEST_WALL, PLATFORM_FLOOR, -90],
  [PLATFORM_FLOOR, PLATFORM_EAST_WALL, -90],
  [PLATFORM_EAST_WALL, PLATFORM_FLOOR, 90],
  [PLATFORM_WEST_WALL, PLATFORM_CEILING, 90],
  [PLATFORM_CEILING, PLATFORM_WEST_WALL, -90],
  [PLATFORM_EAST_WALL, PLATFORM_CEILING, -90],
  [PLATFORM_CEILING, PLATFORM_EAST_WALL, 90],
]

function turnOf(from: number, to: number, angle: number, k: number, body = true): PoseTurn {
  return { fromKind: from, toKind: to, fromHeading: 0.4, toHeading: 1.9, angle, k, body }
}

const q = new Quaternion()
const frameOf = (kind: number) => ({ kind, lock: 0, lockAxis: 'y' as const })

function upOf(kind: number): Vector3 {
  const b = platformBasis(kind).up
  return new Vector3(b[0], b[1], b[2])
}

function degrees(a: Vector3, b: Vector3): number {
  return (a.angleTo(b) * 180) / Math.PI
}

describe('갈아타는 자세의 끝점', () => {
  it.each(PAIRS)('k=0은 떠나는 판 · k=1은 닿는 판의 자세다 (%i → %i)', (from, to, angle) => {
    const start = turnQuaternion(turnOf(from, to, angle, 0), true, new Quaternion())
    const end = turnQuaternion(turnOf(from, to, angle, 1), true, new Quaternion())
    expect(start.angleTo(surfaceQuaternion(frameOf(from), 0.4, q))).toBeLessThan(1e-5)
    expect(end.angleTo(surfaceQuaternion(frameOf(to), 1.9, q))).toBeLessThan(1e-5)
    // 카메라는 로컬 yaw 0으로 읽는다
    const camEnd = turnQuaternion(turnOf(from, to, angle, 1), false, new Quaternion())
    expect(camEnd.angleTo(surfaceQuaternion(frameOf(to), 0, q))).toBeLessThan(1e-5)
  })

  it('판 밖(PLATFORM_NONE)은 바닥 자세로 읽는다', () => {
    const t = turnOf(PLATFORM_NONE, PLATFORM_WEST_WALL, 90, 0)
    expect(turnQuaternion(t, true, new Quaternion())
      .angleTo(surfaceQuaternion(frameOf(PLATFORM_FLOOR), 0.4, q))).toBeLessThan(1e-5)
  })
})

describe('프레임마다의 진행 (steps 16)', () => {
  it.each(PAIRS)('위쪽이 세계 Z축 둘레로 −spriteAngle × k도 돈다 (DS 회전 방향이 반대) (%i → %i)', (from, to, angle) => {
    const up = new Vector3()
    const want = new Vector3()
    for (let n = 0; n <= 16; n++) {
      const t = turnOf(from, to, angle, n / 16)
      for (const withHeading of [true, false]) {
        turnQuaternion(t, withHeading, q)
        up.copy(UP).applyQuaternion(q)
        want.copy(upOf(from)).applyAxisAngle(new Vector3(0, 0, 1), (-angle * Math.PI / 180) * (n / 16))
        expect(up.distanceTo(want), `${n}프레임`).toBeLessThan(1e-5)
        // 처음 위쪽에서 벌어진 각이 프레임에 비례한다 — 90도를 16프레임에 고르게
        expect(degrees(up, upOf(from)), `${n}프레임`).toBeCloseTo(Math.abs(angle) * (n / 16), 3)
      }
    }
  })

  it('끝의 위쪽은 닿는 판의 위쪽이다 — spriteAngle이 기저 표와 맞는다', () => {
    for (const [from, to, angle] of PAIRS) {
      const rotated = upOf(from).applyAxisAngle(new Vector3(0, 0, 1), (-angle * Math.PI) / 180)
      expect(rotated.distanceTo(upOf(to)), `${from}→${to}`).toBeLessThan(1e-9)
    }
  })

  it('k는 0..1로 잘린다', () => {
    const over = turnQuaternion(turnOf(PLATFORM_FLOOR, PLATFORM_WEST_WALL, 90, 7), true, new Quaternion())
    const one = turnQuaternion(turnOf(PLATFORM_FLOOR, PLATFORM_WEST_WALL, 90, 1), true, new Quaternion())
    expect(over.angleTo(one)).toBeLessThan(1e-9)
  })

  it('angle이 0이면 두 자세를 그냥 잇는다 (slerp)', () => {
    const t = turnOf(PLATFORM_FLOOR, PLATFORM_CEILING, 0, 0.5)
    const a = surfaceQuaternion(frameOf(PLATFORM_FLOOR), 0.4, new Quaternion())
    const b = surfaceQuaternion(frameOf(PLATFORM_CEILING), 1.9, new Quaternion())
    expect(turnQuaternion(t, true, new Quaternion()).angleTo(a.slerp(b, 0.5))).toBeLessThan(1e-6)
  })
})
