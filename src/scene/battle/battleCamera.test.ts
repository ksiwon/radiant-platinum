// 시퀀스 카메라가 놓인 뒤 돌아오는 길 — 이음 · 끊음 · 완주를 잰다
import { describe, expect, it } from 'vitest'
import type { SeqCamera } from '../../engine/battle/fx/sequence'
import { lerp3 } from '../../engine/battle/fx/vec3'
import { NO_RETURN, SEQ_CAMERA_CUT, SEQ_CAMERA_RETURN, orbitBlend, stepCamera, swing } from './battleCamera'

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
