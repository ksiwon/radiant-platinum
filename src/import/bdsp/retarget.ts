// 치비 동작을 등신 몸으로 옮긴다 (PLAN §4.3 · §16.9)
//
// 개발 추출기 `tools/extract/bdspRetarget.py`를 브라우저로 옮긴 것이다. **굽는
// 쪽이 둘이라 한쪽만 있으면 못 쓴다** — 파이썬만 고치면 개발 서버에서는 주인공이
// 낚싯대를 던지고 설치본에서는 안 던진다.
//
// BDSP 인물은 두 벌이다. 등신(`battle/tr####`·`pc####`)에 붙은 클립은 전부 배틀
// 동작이고, 필드 동작(낚시·폭포·록클라임·공중날기·물주기)은 치비
// (`field/fc####`)에만 있다. 우리는 등신을 쓰기로 했으므로(§4.3) 옮겨 온다.
//
// ⚠️ **로컬 회전을 그냥 복사하면 안 된다.** 두 리그는 뼈 이름이 겹치는 것이
// 절반뿐이고, 같은 이름이라도 쉬는 자세의 방향이 서로 다르다 — 복사하는 순간
// 팔이 엉뚱한 데를 본다. 대신 **쉬는 자세에서 얼마나 돌았는가**만 옮긴다:
//
//     D = 지금소스전역 · 소스쉼전역⁻¹
//     지금타깃전역 = D · 타깃쉼전역
//     타깃로컬 = 부모의 지금타깃전역⁻¹ · 지금타깃전역
//
// **자리 옮김은 안 옮긴다.** 뼈 길이가 다르므로 그대로 옮기면 팔다리가 늘어난다.
//
// ⚠️ **경로로 색인한다. 이름이 아니다.** 파이썬 쪽은 뼈 이름을 열쇠로 쓰는데
// 치비 번들에는 같은 이름이 여러 벌 있다 — `fc0001_00`은 Transform 276개에
// 이름이 159종이고, 자전거·낚싯대·탈것이 제 안에 사람 뼈대를 한 벌씩 더 들고
// 있다. 그중 `RItem1` 한 쌍은 쉬는 자세까지 다르다(차이 1.0000). 클립 56개의
// 바인딩 16,305건이 **전부 `Origin` 갈래 하나**에 떨어지고 그 갈래 안에서는
// 이름이 126종에 126개로 안 겹치므로, 리그를 그 갈래로 좁히면 짝짓기가 확정된다.
export type Quat = readonly [number, number, number, number]

/** `a·b`는 b를 먼저 돌리고 a를 돌린 것이다 */
export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a
  const [bx, by, bz, bw] = b
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ]
}

/** 단위 사원수의 역. 켤레와 같다 */
export function quatConj(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]]
}

export function quatNorm(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3])
  return n > 1e-12 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [0, 0, 0, 1]
}

export interface RigBone {
  /** 부모의 경로. 뿌리는 `null` */
  parent: string | null
  /** 쉬는 자세의 로컬 회전 */
  rest: Quat
}

/** 경로 → 부모·쉬는 자세. FK를 돌리는 데 필요한 최소한만 든다 */
export class Rig {
  readonly bones: ReadonlyMap<string, RigBone>
  private readonly globals = new Map<string, Quat>()
  private readonly sorted: readonly string[]

  constructor(bones: ReadonlyMap<string, RigBone>) {
    this.bones = bones
    const done: string[] = []
    const seen = new Set<string>()
    const visit = (path: string): void => {
      if (seen.has(path) || !bones.has(path)) return
      seen.add(path)
      const parent = bones.get(path)!.parent
      if (parent !== null) visit(parent)
      done.push(path)
    }
    for (const path of bones.keys()) visit(path)
    // 부모가 늘 자식보다 먼저 오는 차례. FK가 한 번에 돈다
    this.sorted = done
    for (const path of done) {
      const bone = bones.get(path)!
      const parent = bone.parent !== null ? this.globals.get(bone.parent) : undefined
      this.globals.set(path, quatNorm(parent ? quatMul(parent, bone.rest) : bone.rest))
    }
  }

  restGlobal(path: string): Quat {
    return this.globals.get(path) ?? [0, 0, 0, 1]
  }

  order(): readonly string[] {
    return this.sorted
  }
}

/** 로컬 회전들로 전역 회전을 구한다. 없는 뼈는 쉬는 자세를 쓴다 */
export function forward(rig: Rig, local: ReadonlyMap<string, Quat>): Map<string, Quat> {
  const out = new Map<string, Quat>()
  for (const path of rig.order()) {
    const bone = rig.bones.get(path)!
    const q = local.get(path) ?? bone.rest
    const parent = bone.parent !== null ? out.get(bone.parent) : undefined
    out.set(path, quatNorm(parent ? quatMul(parent, q) : q))
  }
  return out
}

const IDENTITY: Quat = [0, 0, 0, 1]

/**
 * 소스의 프레임별 로컬 회전을 타깃의 로컬 회전으로 옮긴다.
 *
 * 옮기는 것은 `pairs`에 적힌 짝뿐이다. 나머지는 타깃의 쉬는 자세로 남는다 —
 * **지어내지 않는다.**
 *
 * @param pairs 타깃 경로 → 소스 경로
 * @param frames 프레임마다 소스 경로 → 로컬 회전
 */
export function retarget(
  source: Rig, target: Rig,
  pairs: ReadonlyMap<string, string>,
  frames: readonly ReadonlyMap<string, Quat>[],
): { moved: Map<string, Quat>[], shared: string[] } {
  const shared = target.order().filter((path) => pairs.has(path))
  const moved: Map<string, Quat>[] = []
  for (const local of frames) {
    const src = forward(source, local)
    const want = new Map<string, Quat>()
    const got = new Map<string, Quat>()
    for (const path of target.order()) {
      const bone = target.bones.get(path)!
      const parentGlobal = bone.parent !== null ? got.get(bone.parent) ?? null : null
      const from = pairs.get(path)
      let here: Quat
      if (from !== undefined) {
        const delta = quatMul(src.get(from) ?? IDENTITY, quatConj(source.restGlobal(from)))
        here = quatNorm(quatMul(delta, target.restGlobal(path)))
      } else {
        // 짝이 없는 뼈는 부모를 따라가되 제 쉬는 자세를 지킨다
        here = quatNorm(parentGlobal ? quatMul(parentGlobal, bone.rest) : bone.rest)
      }
      got.set(path, here)
      want.set(path, quatNorm(parentGlobal ? quatMul(quatConj(parentGlobal), here) : here))
    }
    moved.push(want)
  }
  return { moved, shared }
}

/**
 * ⚠️ **이 파일에서 가장 중요한 자다.**
 *
 * 소스 → 타깃 → 소스로 되돌렸을 때 원래 회전이 나와야 한다. 켤레를 한 번 잘못
 * 걸거나 곱하는 차례를 바꾸면 여기서 바로 벌어진다 — 화면을 못 보는 상태에서
 * 이 수식이 맞는지 확인할 수 있는 거의 유일한 방법이다. 파이썬 쪽 실측이
 * 4.4e-16이다.
 */
export function roundTripError(
  source: Rig, target: Rig,
  pairs: ReadonlyMap<string, string>,
  frames: readonly ReadonlyMap<string, Quat>[],
): number {
  const back = new Map<string, string>()
  for (const [to, from] of pairs) back.set(from, to)
  const there = retarget(source, target, pairs, frames)
  const home = retarget(target, source, back, there.moved)
  let worst = 0
  for (let i = 0; i < frames.length; i++) {
    for (const from of back.keys()) {
      const before = quatNorm(frames[i]!.get(from) ?? source.bones.get(from)?.rest ?? IDENTITY)
      const after = quatNorm(home.moved[i]!.get(from) ?? IDENTITY)
      let plus = 0
      let minus = 0
      for (let c = 0; c < 4; c++) {
        minus = Math.max(minus, Math.abs(before[c]! - after[c]!))
        plus = Math.max(plus, Math.abs(before[c]! + after[c]!))
      }
      // 사원수는 부호가 반대여도 같은 회전이다
      worst = Math.max(worst, Math.min(plus, minus))
    }
  }
  return worst
}
