// 깨어진 세계의 표면 기저 (PARITY §6.10).
//
// ⚠️ **이 파일이 한동안 틀린 것을 못박고 있었다.** 「어느 판에서나 앞이 +z」라고
// 적혀 있었는데, 원작은 벽에서 앞(남)이 **아래(−y)**고 천장에서는 **−z**다.
// 그 잘못된 기대 때문에 벽에서 좌우가 오르내림에 매여 있었고, 실측하면 서쪽
// 벽에서 오른쪽을 눌러 벽을 타고 내려갔다 (`.audit/distortionWalk.mjs`).
//
// 그래서 여기서 재는 것은 **원작 걸음 표 넷과 같은가** 하나다
// (`player_move.c`의 `sDistortionStepDirection*`).
import { describe, expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import {
  PLATFORM_CEILING, PLATFORM_EAST_WALL, PLATFORM_FLOOR, PLATFORM_WEST_WALL,
  STEP, platformBasis, type DistortionFrame,
} from '../world/distortion'
import { DIR } from '../script/movement'
import { surfaceHeading, surfaceQuaternion, surfaceVector } from './distortionSurface'

const frameOf = (kind: number): DistortionFrame => ({
  kind, lock: 0, lockAxis: kind === PLATFORM_FLOOR || kind === PLATFORM_CEILING ? 'y' : 'x',
})
const FLOOR = frameOf(PLATFORM_FLOOR)
const CEILING = frameOf(PLATFORM_CEILING)
const WEST = frameOf(PLATFORM_WEST_WALL)
const EAST = frameOf(PLATFORM_EAST_WALL)

/** 누른 방향을 화면 기준 입력으로. 오른쪽이 +x, 아래가 +z다 (`inputSystem`) */
const PUSH: Record<number, readonly [number, number]> = {
  [DIR.north]: [0, -1],
  [DIR.south]: [0, 1],
  [DIR.west]: [-1, 0],
  [DIR.east]: [1, 0],
}

describe('걸음이 원작 표 그대로다', () => {
  it.each([
    ['바닥', PLATFORM_FLOOR], ['서쪽 벽', PLATFORM_WEST_WALL],
    ['동쪽 벽', PLATFORM_EAST_WALL], ['천장', PLATFORM_CEILING],
  ] as const)('%s', (_이름, kind) => {
    const frame = frameOf(kind)
    for (const dir of [DIR.north, DIR.south, DIR.west, DIR.east]) {
      const [ix, iz] = PUSH[dir]!
      const got = surfaceVector(frame, ix, 0, iz, new Vector3()).toArray()
      const want = STEP[kind]![dir]!
      got.forEach((v, i) => {
        expect(v, `${String(dir)}번 방향의 ${'xyz'[i]!}축`).toBeCloseTo(want[i]!)
      })
    }
  })

  it('⚠️ 벽에서는 북남이 오르내림이다 — 좌우가 아니다', () => {
    for (const wall of [WEST, EAST]) {
      // 북을 누르면 벽을 타고 올라간다
      expect(surfaceVector(wall, 0, 0, -1, new Vector3()).y).toBeCloseTo(1)
      // 좌우로는 y가 한 치도 안 움직인다
      expect(surfaceVector(wall, 1, 0, 0, new Vector3()).y).toBeCloseTo(0)
    }
  })

  it('⚠️ 두 벽은 y가 같고 z가 뒤집힌다', () => {
    expect(surfaceVector(WEST, 0, 0, -1, new Vector3()).y)
      .toBeCloseTo(surfaceVector(EAST, 0, 0, -1, new Vector3()).y)
    expect(surfaceVector(WEST, 1, 0, 0, new Vector3()).z)
      .toBeCloseTo(-surfaceVector(EAST, 1, 0, 0, new Vector3()).z)
  })

  it('천장은 바닥과 z가 뒤집히고 x는 같다', () => {
    expect(surfaceVector(CEILING, 0, 0, 1, new Vector3()).z).toBeCloseTo(-1)
    expect(surfaceVector(CEILING, 1, 0, 0, new Vector3()).x).toBeCloseTo(1)
  })
})

describe('기저가 판을 세운다', () => {
  it.each([
    [FLOOR, [0, 1, 0]],
    [CEILING, [0, -1, 0]],
    [WEST, [1, 0, 0]],
    [EAST, [-1, 0, 0]],
  ] as const)('로컬 위가 판의 법선이다', (frame, normal) => {
    const got = surfaceVector(frame, 0, 1, 0, new Vector3()).toArray()
    got.forEach((v, i) => { expect(v).toBeCloseTo(normal[i]!) })
  })

  it('넷 다 오른손 정규직교다 — 몸이 뒤집히지 않는다', () => {
    for (const kind of [PLATFORM_FLOOR, PLATFORM_WEST_WALL, PLATFORM_EAST_WALL, PLATFORM_CEILING]) {
      const b = platformBasis(kind)
      const v = (a: readonly [number, number, number]) => new Vector3(...a)
      const right = v(b.right), up = v(b.up), forward = v(b.forward)
      expect(right.length(), `판 ${String(kind)}`).toBeCloseTo(1)
      expect(up.length()).toBeCloseTo(1)
      expect(forward.length()).toBeCloseTo(1)
      expect(right.dot(up)).toBeCloseTo(0)
      expect(right.dot(forward)).toBeCloseTo(0)
      // 오른손: 오른쪽 × 위 = 앞
      const cross = new Vector3().crossVectors(right, up)
      expect(cross.distanceTo(forward), `판 ${String(kind)}의 손잡이`).toBeCloseTo(0)
    }
  })

  it('회전이 로컬 앞을 판의 앞으로 보낸다', () => {
    for (const frame of [FLOOR, CEILING, WEST, EAST]) {
      const q = surfaceQuaternion(frame, 0, new Quaternion())
      const got = new Vector3(0, 0, 1).applyQuaternion(q)
      const want = surfaceVector(frame, 0, 0, 1, new Vector3())
      expect(got.distanceTo(want), `판 ${String(frame.kind)}`).toBeCloseTo(0)
    }
  })
})

describe('세계 속도를 판 위의 방향으로 되돌린다', () => {
  it('벽을 타고 올라가면 북쪽을 본다', () => {
    for (const wall of [WEST, EAST]) {
      // 북쪽은 로컬 z가 음이므로 yaw가 π다
      expect(Math.abs(surfaceHeading(wall, 0, 2, 0, 0))).toBeCloseTo(Math.PI)
    }
  })

  it('멈추면 보던 쪽을 그대로 둔다', () => {
    expect(surfaceHeading(WEST, 0, 0, 0, 1.23)).toBe(1.23)
    expect(surfaceHeading(null, 0, 0, 0, 1.23)).toBe(1.23)
  })

  it('되돌린 것이 보낸 것과 맞물린다', () => {
    for (const frame of [FLOOR, CEILING, WEST, EAST]) {
      const w = surfaceVector(frame, 1, 0, 0, new Vector3())
      expect(surfaceHeading(frame, w.x, w.y, w.z, 0), `판 ${String(frame.kind)}`)
        .toBeCloseTo(Math.PI / 2)
    }
  })
})
