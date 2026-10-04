// 무대 충돌 — 천장은 **아랫면**(법선이 아래)만 센다. 감김 방향과 법선 부호가 그 근거다
import { describe, expect, it } from 'vitest'
import { buildArenaCollider } from './arenaCollider'

/** y = 5 평면의 큰 삼각형 하나. `down`이면 법선이 −y(위로 쏜 광선이 밑에서 맞는 면) */
const sheet = (down: boolean): number[] => {
  const a = [-20, 5, -20], b = [40, 5, -20], c = [-20, 5, 40]
  return down ? [...a, ...b, ...c] : [...a, ...c, ...b]
}

describe('arenaCollider — 천장의 면 방향', () => {
  it('법선이 아래인 판(아랫면)은 천장이다 — 5m에서 여유 0.5m를 뺀다', () => {
    const room = buildArenaCollider(sheet(true), 12)
    expect(room.ceilingAt(0, 0)).toBeCloseTo(4.5, 6)
  })

  it('법선이 위인 판(윗면)은 천장이 아니다 — 기둥 · 난간 위에서 쏜 광선이 윗면에 맞아도 막히지 않는다', () => {
    const room = buildArenaCollider(sheet(false), 12)
    expect(room.ceilingAt(0, 0)).toBe(Infinity)
  })

  it('감김은 법선 y = e1.z·e2.x − e1.x·e2.z의 부호다 — 같은 삼각형을 뒤집으면 결과도 뒤집힌다', () => {
    const up = buildArenaCollider(sheet(false), 12), down = buildArenaCollider(sheet(true), 12)
    expect(Number.isFinite(down.ceilingAt(1, 1))).toBe(true)
    expect(Number.isFinite(up.ceilingAt(1, 1))).toBe(false)
  })

  it('선분 맞추기(hit)는 양면이다 — 감김이 뒤집힌 판도 카메라를 막는다', () => {
    for (const down of [true, false]) {
      const room = buildArenaCollider(sheet(down), 12)
      expect(room.hit([0, 0, 0], [0, 10, 0])).toBeCloseTo(0.5, 6)
      expect(room.hit([0, 10, 0], [0, 0, 0])).toBeCloseTo(0.5, 6)
      expect(room.hit([0, 0, 0], [0, 4, 0])).toBeNull()
    }
  })

  it('2.5m보다 낮은 아랫면은 천장으로 안 친다 (난간 · 문틀)', () => {
    const low = sheet(true).map((v, i) => (i % 3 === 1 ? 2 : v))
    expect(buildArenaCollider(low, 12).ceilingAt(0, 0)).toBe(Infinity)
  })
})
