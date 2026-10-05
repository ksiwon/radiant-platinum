// 시퀀스 카메라가 놓인 뒤 돌아오는 길 — 이음 · 끊음 · 완주를 잰다
import { describe, expect, it } from 'vitest'
import type { SeqCamera } from '../../engine/battle/fx/sequence'
import { lerp3 } from '../../engine/battle/fx/vec3'
import {
  BIG_SWING_FULL_FIT, BIG_SWING_MAX, NO_RETURN, SEQ_CAMERA_CUT, SEQ_CAMERA_RETURN, bigSwing, orbitBlend, rectOverlap, screenRect,
  CLAMP_CUT, smoothClamp, stepCamera, swing, swingAround, type ClampFix,
} from './battleCamera'
import { BATTLE_FOV, CAMERA, SHOT_REACH } from '../../engine/battle/shots'
import { cameraFit, ARENA } from '../../engine/battle/arena'

const cam = (pos: [number, number, number], target: [number, number, number] = [0, 0, 0], fov = 40, roll = 0): SeqCamera =>
  ({ pos, target, fov, roll })
const id = (c: SeqCamera): SeqCamera => c

describe('swing', () => {
  it('같은 방향은 0도, 반대는 180도, 직각은 90도', () => {
    expect(swing(cam([0, 1, 5]), cam([0, 9, 2]))).toBeCloseTo(0, 6)
    expect(swing(cam([0, 1, 5]), cam([0, 1, -5]))).toBeCloseTo(180, 6)
    expect(swing(cam([0, 1, 5]), cam([5, 1, 0]))).toBeCloseTo(90, 6)
  })
  it('lerp3(공용 벡터)는 양 끝을 돌려준다', () => {
    expect(lerp3([0, 2, 4], [10, 12, 14], 0)).toEqual([0, 2, 4])
    expect(lerp3([0, 2, 4], [10, 12, 14], 1)).toEqual([10, 12, 14])
    expect(lerp3([0, 2, 4], [10, 12, 14], 0.5)).toEqual([5, 7, 9])
  })
})

describe('orbitBlend', () => {
  const a = cam([0, 2, 5], [0, 1, 0], 30, 0.4)
  const b = cam([5, 2, 0], [0, 1, 0], 50, 0)
  it('양 끝은 두 샷 그대로다', () => {
    const s = orbitBlend(a, b, 0), t = orbitBlend(a, b, 1)
    for (let i = 0; i < 3; i++) { expect(s.pos[i]).toBeCloseTo(a.pos[i]!, 6); expect(t.pos[i]).toBeCloseTo(b.pos[i]!, 6) }
    expect(s.fov).toBe(30); expect(t.fov).toBe(50)
    expect(s.roll).toBeCloseTo(0.4, 9); expect(t.roll).toBe(0)
  })
  it('중간은 보는 곳 둘레를 돈다 — 거리가 같으면 곧게 이은 것보다 멀다', () => {
    const m = orbitBlend(a, b, 0.5)
    expect(Math.hypot(m.pos[0], m.pos[2])).toBeCloseTo(5, 6) // 호 위
    const chord = Math.hypot(2.5, 2.5)
    expect(chord).toBeLessThan(5)
  })
  it('방위는 가까운 쪽으로 돈다 (±π 경계를 넘지 않는다)', () => {
    const c = cam([-1, 0, 5]), d = cam([1, 0, 5])
    const m = orbitBlend(c, d, 0.5)
    expect(m.pos[2]).toBeGreaterThan(4.9)
  })
})

describe('stepCamera', () => {
  const base = cam([0, 3, 8], [0, 1, 0], 40)
  const shotNear = cam([0, 3, 4], [0, 1, 0], 30) // 기본과 같은 쪽 → 이음
  const shotBehind = cam([0, 3, -4], [0, 1, 0], 30) // 반대쪽 → 끊음

  it('시퀀스가 서 있으면 보정한 자리를 쓰고 마지막 자리로 적는다', () => {
    const r = stepCamera(NO_RETURN, shotNear, base, 10, (c) => ({ ...c, fov: 33 }))
    expect(r.shot.fov).toBe(33)
    expect(r.state.last).toBe(r.shot)
    expect(r.state.leftAt).toBeNull()
  })
  it('시퀀스도 마지막 자리도 없으면 기본 카메라다', () => {
    const r = stepCamera(NO_RETURN, null, base, 10, id)
    expect(r.shot).toBe(base)
    expect(r.state).toEqual(NO_RETURN)
  })
  it('놓은 첫 프레임은 놓은 시각을 적고 마지막 자리 그대로다 (k = 0)', () => {
    const r = stepCamera({ last: shotNear, leftAt: null }, null, base, 10, id)
    expect(r.state.leftAt).toBe(10)
    expect(r.shot.pos[2]).toBeCloseTo(4, 6)
    expect(r.shot.fov).toBeCloseTo(30, 6)
  })
  it('도는 중에는 기본 쪽으로 간다 (smoothstep: 반 지점 = 반)', () => {
    const r = stepCamera({ last: shotNear, leftAt: 10 }, null, base, 10 + SEQ_CAMERA_RETURN / 2, id)
    expect(r.shot.fov).toBeCloseTo(35, 6)
    expect(r.state.last).toBe(shotNear)
    expect(r.state.leftAt).toBe(10)
  })
  it('SEQ_CAMERA_RETURN초가 지나면 기본 카메라로 서고 기록을 비운다', () => {
    const r = stepCamera({ last: shotNear, leftAt: 10 }, null, base, 10 + SEQ_CAMERA_RETURN + 0.01, id)
    expect(r.shot).toBe(base)
    expect(r.state).toEqual(NO_RETURN)
  })
  it('크게 돌아야 하면(>SEQ_CAMERA_CUT) 첫 프레임에 곧바로 기본으로 끊는다', () => {
    expect(swing(shotBehind, base)).toBeGreaterThan(SEQ_CAMERA_CUT)
    const r = stepCamera({ last: shotBehind, leftAt: null }, null, base, 10, id)
    expect(r.shot).toBe(base)
    expect(r.state).toEqual(NO_RETURN)
  })
  it('끊는 결정은 첫 프레임에만 — 이미 돌기 시작했으면 끝까지 돈다', () => {
    const r = stepCamera({ last: shotBehind, leftAt: 10 }, null, base, 10.1, id)
    expect(r.shot).not.toBe(base)
    expect(r.state.last).toBe(shotBehind)
  })
  it('각이 경계 안이면 끊지 않는다', () => {
    const edge = cam([Math.sin((SEQ_CAMERA_CUT - 1) * Math.PI / 180) * 8, 3, Math.cos((SEQ_CAMERA_CUT - 1) * Math.PI / 180) * 8], [0, 1, 0])
    const r = stepCamera({ last: edge, leftAt: null }, null, base, 10, id)
    expect(r.state.last).toBe(edge)
  })
  it('돌아오는 길도 보정을 거친다', () => {
    let calls = 0
    stepCamera({ last: shotNear, leftAt: 10 }, null, base, 10.1, (c) => { calls++; return c })
    expect(calls).toBe(1)
  })
  it('시퀀스가 다시 서면 돌아오던 길을 버린다', () => {
    const r = stepCamera({ last: shotNear, leftAt: 10 }, shotBehind, base, 10.1, id)
    expect(r.state.leftAt).toBeNull()
    expect(r.state.last).toBe(r.shot)
  })
})

describe('큰 몸 앞의 옆 돌림 (champion 토대부기 대 화강돌)', () => {
  // 실측 — `pnpm shot champion --keys=z,z,z,z,z --boxes`. 대기 자세 상자(무대 좌표)와 기본 샷의 거리 배율이다
  const TORTERRA = { min: [-0.53, -0.04, 0.84], max: [1.16, 2.25, 3.68] } as const
  const SPIRITOMB = { min: [-0.89, 0, -2.31], max: [0.32, 1.43, -1.3] } as const
  const FIGHT_Y = 0.05
  /** `BattleStage.useBattleCamera`가 놓는 기본 샷 */
  const base = (fit: number, swingDeg: number): SeqCamera => {
    const [lx, , lz] = CAMERA.look
    const pos: [number, number, number] = [
      lx + (CAMERA.position[0] - lx) * fit, FIGHT_Y + (CAMERA.position[1] - FIGHT_Y) * fit, lz + (CAMERA.position[2] - lz) * fit,
    ]
    return { pos: swingAround(pos, [lx, FIGHT_Y, lz], swingDeg), target: [lx, FIGHT_Y, lz], fov: BATTLE_FOV, roll: 0 }
  }
  const overlapAt = (shot: SeqCamera): number =>
    rectOverlap(screenRect(TORTERRA, shot, 1.5)!, screenRect(SPIRITOMB, shot, 1.5)!)
  const FIT = 2.25 / 1.2

  it('돌리기 전은 상자가 절반 넘게 겹친다 — 실측 65.7%', () => {
    expect(overlapAt(base(FIT, 0))).toBeGreaterThan(0.6)
    expect(overlapAt(base(FIT, 0))).toBeLessThan(0.72)
  })
  it('돌린 뒤는 겹침이 10% 아래다', () => {
    const fit = cameraFit(ARENA.find((a) => a.file === 'g042.glb')!, 2.25)
    expect(fit).toBeCloseTo(FIT, 2)
    expect(overlapAt(base(fit, bigSwing(fit)))).toBeLessThan(0.1)
  })
  it('기본 샷이 담는 몸(배율 1)은 안 돌고, 상한을 안 넘는다', () => {
    expect(bigSwing(1)).toBe(0)
    expect(bigSwing(0.88)).toBe(0)
    expect(bigSwing(BIG_SWING_FULL_FIT)).toBe(BIG_SWING_MAX)
    expect(bigSwing(3.5)).toBe(BIG_SWING_MAX)
    expect(bigSwing(1.4)).toBeCloseTo(BIG_SWING_MAX * 0.5, 6)
  })
  it('돌림은 보는 곳과의 수평 거리 · 높이를 안 바꾼다', () => {
    const a = base(1.5, 0), b = base(1.5, 17)
    const d = (c: SeqCamera) => Math.hypot(c.pos[0] - c.target[0], c.pos[2] - c.target[2])
    expect(d(b)).toBeCloseTo(d(a), 9)
    expect(b.pos[1]).toBe(a.pos[1])
    expect(d(a)).toBeCloseTo(SHOT_REACH * 1.5, 9)
    // 방위가 28.4° → 45.4°
    const az = (c: SeqCamera) => (Math.atan2(c.pos[0] - c.target[0], c.pos[2] - c.target[2]) * 180) / Math.PI
    expect(az(b) - az(a)).toBeCloseTo(17, 6)
  })
  it('돌린 카메라도 풀밭 무대 벽(반지름 − 1) 안이다', () => {
    const grass = ARENA[0]!
    const fit = cameraFit(grass, 2.25)
    const c = base(fit, bigSwing(fit))
    expect(Math.hypot(c.pos[0], c.pos[2])).toBeLessThanOrEqual(grass.radius - 1 + 1e-9)
  })
})

describe('보정을 부드럽게 (smoothClamp)', () => {
  const cam = (x: number, z: number): SeqCamera => ({ pos: [x, 1, z], target: [0, 0.5, 0], fov: 30, roll: 0 })

  it('보정이 건너뛰어도 화면의 카메라는 한 프레임에 다 안 간다', () => {
    const fix: ClampFix = { pos: null, raw: null }
    smoothClamp(fix, cam(1, 3), cam(1, 3), 1 / 60)
    // 원래 카메라는 그대로인데 보정이 1m 뒤로 민다
    const out = smoothClamp(fix, cam(1, 3), cam(1, 4), 1 / 60)
    expect(out.pos[2]).toBeGreaterThan(3)
    expect(out.pos[2]).toBeLessThan(3.3)
    let last = out
    for (let i = 0; i < 60; i++) last = smoothClamp(fix, cam(1, 3), cam(1, 4), 1 / 60)
    expect(last.pos[2]).toBeCloseTo(4, 3)
  })

  it('원래 카메라가 끊으면(컷) 보정도 곧바로 선다', () => {
    const fix: ClampFix = { pos: null, raw: null }
    smoothClamp(fix, cam(1, 3), cam(1, 3), 1 / 60)
    const out = smoothClamp(fix, cam(-4, 8), cam(-4, 9), 1 / 60)
    expect(out.pos[2]).toBe(9)
    expect(CLAMP_CUT).toBeLessThan(5)
  })

  it('보정을 안 거친 프레임은 그대로 내고 기록을 비운다', () => {
    const fix: ClampFix = { pos: [0, 0, 1], raw: [1, 1, 3] }
    expect(smoothClamp(fix, null, cam(2.7, 5), 1 / 60).pos).toEqual([2.7, 1, 5])
    expect(fix.pos).toBeNull()
  })
})
