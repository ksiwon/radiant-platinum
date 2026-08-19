// 리타깃의 대수 — 롬 없이 도는 자리다.
//
// ⚠️ **이 시험이 잡는 것은 「수식이 맞는가」다.** 화면을 못 보는 상태에서
// 켤레를 잘못 걸었는지, 곱하는 차례가 뒤집혔는지를 가르는 자가 왕복 오차다
// (`roundTripError`). 실제 번들로 재는 것은 `convert.test.ts`가 한다.
import { describe, it, expect } from 'vitest'
import { Rig, forward, quatMul, quatNorm, retarget, roundTripError, type Quat, type RigBone } from './retarget'

/** 축과 각(라디안)으로 사원수 하나 */
function axisAngle(axis: readonly [number, number, number], rad: number): Quat {
  const half = rad / 2
  const s = Math.sin(half)
  const n = Math.hypot(...axis) || 1
  return [axis[0] / n * s, axis[1] / n * s, axis[2] / n * s, Math.cos(half)]
}

const rig = (rows: [path: string, parent: string | null, rest: Quat][]): Rig =>
  new Rig(new Map<string, RigBone>(rows.map(([p, parent, rest]) => [p, { parent, rest }])))

/**
 * 팔 셋짜리 리그 두 벌. **쉬는 자세를 일부러 다르게 둔다** — 같으면 로컬 회전을
 * 그냥 복사해도 통과해 버려서 시험이 아무것도 안 잡는다
 */
const source = rig([
  ['Origin', null, [0, 0, 0, 1]],
  ['Origin/Arm', 'Origin', axisAngle([0, 0, 1], 0.7)],
  ['Origin/Arm/Fore', 'Origin/Arm', axisAngle([1, 0, 0], -0.4)],
  ['Origin/Tail', 'Origin', axisAngle([0, 1, 0], 1.1)],
])
const target = rig([
  ['Origin', null, axisAngle([0, 1, 0], 0.25)],
  ['Origin/Arm', 'Origin', axisAngle([0, 0, 1], -1.2)],
  ['Origin/Arm/Fore', 'Origin/Arm', axisAngle([0, 1, 0], 0.9)],
])
/** 타깃 경로 → 소스 경로. `Tail`은 타깃에 없어서 안 들어간다 */
const pairs = new Map([
  ['Origin', 'Origin'],
  ['Origin/Arm', 'Origin/Arm'],
  ['Origin/Arm/Fore', 'Origin/Arm/Fore'],
])

/** 소스가 팔을 굽힌 프레임 셋 */
const frames = [0.0, 0.35, -0.8].map((a) => new Map<string, Quat>([
  ['Origin/Arm', quatMul(axisAngle([1, 0, 0], a), source.bones.get('Origin/Arm')!.rest)],
  ['Origin/Arm/Fore', quatMul(axisAngle([0, 0, 1], a * 2), source.bones.get('Origin/Arm/Fore')!.rest)],
]))

/**
 * 사원수 둘 사이의 각. 부호가 반대여도 같은 회전이다.
 *
 * ⚠️ **`acos(dot)`으로 재면 안 된다.** 각이 0에 가까울수록 `acos`가 배정밀도
 * 한계를 √으로 벌려서, 완전히 같은 회전에서도 3e-8이 나온다 — 그 자리가 바로
 * 이 시험이 재려는 자리다. `atan2`는 0 근처에서도 정확하다
 */
function between(a: Quat, b: Quat): number {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  const x = aw * bx - ax * bw - ay * bz + az * by
  const y = aw * by + ax * bz - ay * bw - az * bx
  const z = aw * bz - ax * by + ay * bx - az * bw
  const w = aw * bw + ax * bx + ay * by + az * bz
  return 2 * Math.atan2(Math.hypot(x, y, z), Math.abs(w))
}

describe('리타깃', () => {
  it('왕복하면 제자리로 돌아온다', () => {
    // ⚠️ 실측: 실제 번들에서 4.4e-16(파이썬)·5.6e-16(브라우저)이 나온다.
    // 여기 문턱은 그보다 넉넉하되 「식이 틀리면 반드시 넘는」 자리다 —
    // 켤레를 하나 빼면 0.1 단위로 벌어진다
    expect(roundTripError(source, target, pairs, frames)).toBeLessThan(1e-12)
  })

  it('쉬는 자세에서 벗어난 만큼만 건너온다', () => {
    // 쉼 그대로인 프레임은 타깃도 쉼 그대로여야 한다. 로컬을 복사하는 구현이면
    // 여기서 팔이 두 리그의 쉼 차이만큼(1.9라디안) 튄다
    const rest = [new Map<string, Quat>()]
    const { moved } = retarget(source, target, pairs, rest)
    for (const [path, bone] of target.bones) {
      expect(between(moved[0]!.get(path)!, bone.rest), path).toBeLessThan(1e-9)
    }
  })

  it('소스가 돈 각이 타깃에도 같은 각으로 온다', () => {
    const { moved } = retarget(source, target, pairs, frames)
    for (let i = 0; i < frames.length; i++) {
      const srcNow = forward(source, frames[i]!)
      const dstNow = forward(target, moved[i]!)
      for (const [to, from] of pairs) {
        // 전역에서 쉼을 뺀 각이 두 리그에서 같아야 한다 — 그것이 옮기는 값이다
        const a = between(srcNow.get(from)!, source.restGlobal(from))
        const b = between(dstNow.get(to)!, target.restGlobal(to))
        expect(b, `${to} 프레임 ${String(i)}`).toBeCloseTo(a, 9)
      }
    }
  })

  it('짝이 없는 뼈는 지어내지 않는다', () => {
    // 타깃에만 있는 뼈를 하나 붙이고, 그 뼈가 제 쉬는 로컬을 지키는지 본다
    const withExtra = rig([
      ['Origin', null, axisAngle([0, 1, 0], 0.25)],
      ['Origin/Arm', 'Origin', axisAngle([0, 0, 1], -1.2)],
      ['Origin/Arm/Fore', 'Origin/Arm', axisAngle([0, 1, 0], 0.9)],
      ['Origin/Arm/Fore/Bag', 'Origin/Arm/Fore', axisAngle([1, 0, 0], 0.5)],
    ])
    const { moved, shared } = retarget(source, withExtra, pairs, frames)
    expect(shared).not.toContain('Origin/Arm/Fore/Bag')
    for (const frame of moved) {
      expect(between(frame.get('Origin/Arm/Fore/Bag')!, axisAngle([1, 0, 0], 0.5)))
        .toBeLessThan(1e-9)
    }
  })

  it('전역 회전은 부모부터 곱해 내려간다', () => {
    const global = forward(source, new Map())
    const want = quatNorm(quatMul(
      source.bones.get('Origin/Arm')!.rest, source.bones.get('Origin/Arm/Fore')!.rest,
    ))
    expect(between(global.get('Origin/Arm/Fore')!, want)).toBeLessThan(1e-9)
    // 부모가 자식보다 먼저 오는 차례여야 한 번에 돈다
    const order = source.order()
    expect(order.indexOf('Origin/Arm')).toBeLessThan(order.indexOf('Origin/Arm/Fore'))
  })
})
