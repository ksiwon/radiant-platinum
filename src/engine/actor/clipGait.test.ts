// 원작 동작으로 걷기 (`engine/actor/clipGait`)
//
// 여기서 잡으려는 것은 셋이다:
//  ① **한 바퀴 거리를 디딘 구간에서 재는가.** 이 값이 어긋나면 그만큼 그대로
//     발이 미끄러진다 — 화면에서 재는 쪽은 `.audit/probe/gait/view.mjs`고,
//     여기서는 답을 아는 발을 만들어 놓고 잰다.
//  ② **옮긴 동작이 같은 자세인가.** 뼈 길이가 달라도 **쉬는 자세에서 돌아간
//     양**은 같아야 한다.
//  ③ **속도에 따라 서기·걷기·뛰기가 섞이는가.**
import { describe, it, expect } from 'vitest'
import {
  AnimationClip, Group, Object3D, Quaternion, QuaternionKeyframeTrack, Vector3,
  VectorKeyframeTrack,
} from 'three'
import {
  GAIT_REST, captureRest, measureCycle, pickGaitClips, retargetClip, restorePose,
  snapshotPose, stepGait,
} from './clipGait'

/** 한 바퀴 1초, 표본 마흔여덟 */
const DURATION = 1
const N = 48
/** 디딘 동안 발이 뒤로 가는 거리 = 한 걸음 */
const STEP = 0.8
/** 드는 동안 발이 뜨는 높이 */
const LIFT = 0.2

/**
 * 답을 아는 발. 반 바퀴는 땅에 붙어 뒤로 가고, 반 바퀴는 떠서 앞으로 돌아온다.
 *
 * 그러므로 **한 바퀴에 몸은 두 걸음, 곧 `2 × STEP`만큼 나아간다.**
 */
function footTrack(name: string, offset: number): VectorKeyframeTrack {
  const times = new Float32Array(N + 1)
  const values = new Float32Array((N + 1) * 3)
  for (let i = 0; i <= N; i++) {
    const u = (i / N + offset) % 1
    times[i] = (i / N) * DURATION
    const stance = u < 0.5
    values[i * 3] = 0
    values[i * 3 + 1] = stance ? 0 : LIFT
    // 디딜 때 +STEP/2에서 −STEP/2로, 들 때 되돌아온다
    values[i * 3 + 2] = stance ? STEP / 2 - STEP * (u / 0.5) : -STEP / 2 + STEP * ((u - 0.5) / 0.5)
  }
  return new VectorKeyframeTrack(`${name}.position`, times, values)
}

function walker(): { root: Object3D, frame: Object3D, clip: AnimationClip } {
  const frame = new Group()
  const root = new Group()
  root.name = 'Origin'
  frame.add(root)
  for (const name of ['LToe', 'RToe']) {
    const foot = new Object3D()
    foot.name = name
    root.add(foot)
  }
  frame.updateMatrixWorld(true)
  const clip = new AnimationClip('walk_b', DURATION, [footTrack('LToe', 0), footTrack('RToe', 0.5)])
  return { root, frame, clip }
}

describe('한 바퀴 거리', () => {
  it('디딘 발이 뒤로 간 거리가 곧 한 바퀴 거리다', () => {
    const { root, frame, clip } = walker()
    const cycle = measureCycle(root, frame, clip)!
    expect(cycle).not.toBeNull()
    // 두 걸음. 표본이 띄엄띄엄이라 1%쯤 모자라게 잡힌다
    expect(cycle.distance).toBeGreaterThan(2 * STEP * 0.95)
    expect(cycle.distance).toBeLessThan(2 * STEP * 1.05)
  })

  it('왼발이 제일 앞에 나온 위상을 집는다', () => {
    const { root, frame, clip } = walker()
    // 왼발은 위상 0에서 디디기 시작한다 — 그때가 제일 앞이다
    expect(measureCycle(root, frame, clip)!.leftForward).toBeLessThan(0.05)
  })

  it('재고 나면 뼈가 떴던 자리로 돌아온다 — 다음에 세우는 사람이 안 물려받는다', () => {
    const { root, frame, clip } = walker()
    const before = root.getObjectByName('LToe')!.position.clone()
    measureCycle(root, frame, clip)
    expect(root.getObjectByName('LToe')!.position.distanceTo(before)).toBeLessThan(1e-6)
  })

  it('발이 없으면 못 잰다고 한다 — 엉뚱한 값을 지어내지 않는다', () => {
    const { frame, clip } = walker()
    const bare = new Group()
    frame.add(bare)
    expect(measureCycle(bare, frame, clip)).toBeNull()
  })
})

/** 팔 하나짜리 몸. 쉬는 자세가 서로 다른 두 벌을 만든다 */
function arm(tilt: number, length: number): Object3D {
  const root = new Object3D()
  root.name = 'Origin'
  const waist = new Object3D()
  waist.name = 'Waist'
  waist.position.set(0, length, 0)
  waist.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), tilt)
  root.add(waist)
  const hand = new Object3D()
  hand.name = 'LHand'
  hand.position.set(0, length, 0)
  hand.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), tilt * 0.5)
  waist.add(hand)
  root.updateMatrixWorld(true)
  return root
}

describe('동작 옮기기', () => {
  /**
   * 처음과 **마지막** 칸에서 뜬 회전. 옮긴 뒤에도 쉬는 자세에서 돌아간 양이
   * 같아야 한다.
   *
   * ⚠️ 옮긴 클립은 30프레임으로 **다시 떠 놓은 것**이라 칸 수가 원본과 다르다 —
   * 가운데 칸을 집으면 그만큼 덜 돌아간 자세가 잡힌다
   */
  function turned(clip: AnimationClip, bone: string, rest: Quaternion): Quaternion[] {
    const track = clip.tracks.find((t) => t.name === `${bone}.quaternion`)!
    return [0, track.times.length - 1].map((i) => {
      const v = track.values
      return new Quaternion(v[i * 4]!, v[i * 4 + 1]!, v[i * 4 + 2]!, v[i * 4 + 3]!)
        .premultiply(rest.clone().invert())
    })
  }

  it('쉬는 자세가 다른 몸으로 옮겨도 돌아간 양이 같다', () => {
    const from = arm(0.3, 1)
    const to = arm(-0.2, 0.6)
    const times = new Float32Array([0, 0.5])
    const swing = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.4)
    const rest = from.getObjectByName('Waist')!.quaternion
    const moved = rest.clone().multiply(swing)
    const clip = new AnimationClip('walk_b', 0.5, [
      new QuaternionKeyframeTrack('Waist.quaternion', times, new Float32Array([
        rest.x, rest.y, rest.z, rest.w, moved.x, moved.y, moved.z, moved.w,
      ])),
    ])
    const out = retargetClip(clip, captureRest(from), captureRest(to))
    const [still, swung] = turned(out, 'Waist', to.getObjectByName('Waist')!.quaternion)
    expect(still!.angleTo(new Quaternion())).toBeLessThan(0.02)
    // 옮긴 쪽도 같은 만큼 돌아야 한다 (0.4rad)
    expect(swung!.angleTo(new Quaternion())).toBeCloseTo(0.4, 2)
  })

  it('짝이 없는 뼈는 트랙을 안 만든다 — 없는 자세를 지어내지 않는다', () => {
    const from = arm(0.3, 1)
    const to = arm(0, 1)
    to.getObjectByName('LHand')!.name = 'RHand'
    const times = new Float32Array([0, 0.5])
    const q = from.getObjectByName('LHand')!.quaternion
    const clip = new AnimationClip('walk_b', 0.5, [
      new QuaternionKeyframeTrack('LHand.quaternion', times, new Float32Array([
        q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w,
      ])),
    ])
    const out = retargetClip(clip, captureRest(from), captureRest(to))
    expect(out.tracks.some((t) => t.name.startsWith('LHand'))).toBe(false)
  })

  it('골반 오르내림은 골반 높이의 비로 줄여 옮긴다 — 작은 몸이 안 뜬다', () => {
    const from = arm(0, 1)
    const to = arm(0, 0.5)
    const times = new Float32Array([0, 0.5])
    // 쉬는 높이 1에서 0.1 튀어오른다
    const clip = new AnimationClip('walk_b', 0.5, [
      new VectorKeyframeTrack('Waist.position', times, new Float32Array([0, 1, 0, 0, 1.1, 0])),
    ])
    const out = retargetClip(clip, captureRest(from), captureRest(to))
    const track = out.tracks.find((t) => t.name === 'Waist.position')!
    expect(track.values[1]).toBeCloseTo(0.5, 5)
    // 옮긴 클립은 30프레임으로 다시 떠 놓은 것이라 마지막 칸이 끝 자세다.
    // 키가 절반이면 튐도 절반이다
    const last = track.values.length - 2
    expect(track.values[last]! - track.values[1]!).toBeCloseTo(0.05, 5)
  })
})

describe('클립 고르기', () => {
  const clip = (name: string) => new AnimationClip(name, 1, [])

  it('등신이든 치비든 제 이름으로 집는다', () => {
    const full = pickGaitClips([clip('walk_b'), clip('run_b'), clip('wait_b')])!
    expect(full.walk.name).toBe('walk_b')
    expect(full.run?.name).toBe('run_b')
    const chibi = pickGaitClips([clip('walk_f'), clip('wait_f')])!
    expect(chibi.walk.name).toBe('walk_f')
    expect(chibi.run).toBeNull()
  })

  it('걷기가 없으면 아무것도 안 준다 — 그 몸은 절차형으로 걷는다', () => {
    expect(pickGaitClips([clip('wait_b'), clip('advent_b')])).toBeNull()
  })

  it('크기 트랙은 버리고 골반 자리만 남긴다 — 치비 머리가 도로 안 커진다', () => {
    const times = new Float32Array([0, 1])
    const three = new Float32Array([0, 0, 0, 0, 0, 0])
    const four = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1])
    const raw = new AnimationClip('walk_f', 1, [
      new QuaternionKeyframeTrack('LArm.quaternion', times, four),
      new VectorKeyframeTrack('Head.scale', times, new Float32Array([1, 1, 1, 1, 1, 1])),
      new VectorKeyframeTrack('Waist.position', times, three),
      new VectorKeyframeTrack('LHand.position', times, three),
    ])
    const got = pickGaitClips([raw])!.walk
    expect(got.tracks.map((t) => t.name).sort()).toEqual(['LArm.quaternion', 'Waist.position'])
  })
})

describe('섞기와 위상', () => {
  const set = { walk: { distance: 1.6, leftForward: 0 }, run: { distance: 3.2, leftForward: 0 } }

  /** `seconds` 동안 같은 속도로 민다. 60프레임에 가깝게 **딱 그 시간만** 민다 */
  function run(speed: number, seconds: number, from = GAIT_REST) {
    const steps = Math.max(1, Math.round(seconds * 60))
    const dt = seconds / steps
    let s = from
    for (let i = 0; i < steps; i++) s = stepGait(s, set, dt, speed, 4.5, 8)
    return s
  }

  it('서 있으면 걷는 비중이 0으로 간다', () => {
    expect(run(0, 1).moving).toBeLessThan(0.01)
  })

  it('걷는 속도면 걷기만, 뛰는 속도면 뛰기까지 간다', () => {
    const walking = run(4.5, 1)
    expect(walking.moving).toBeGreaterThan(0.99)
    expect(walking.run).toBeLessThan(0.01)
    expect(run(8, 1).run).toBeGreaterThan(0.99)
  })

  it('한 프레임에 안 튄다 — 0.1초쯤에 걸쳐 섞인다', () => {
    const one = stepGait(GAIT_REST, set, 1 / 60, 4.5, 4.5, 8)
    expect(one.moving).toBeLessThan(0.3)
    expect(run(4.5, 0.1).moving).toBeGreaterThan(0.6)
  })

  it('위상은 **걸은 거리**를 한 바퀴 거리로 나눈 만큼 간다', () => {
    // 걷기로 1.6m를 가면 딱 한 바퀴다
    const s = run(4.5, 1.6 / 4.5, { phase: 0, moving: 1, run: 0 })
    expect(s.phase).toBeLessThan(0.02)
    // 절반이면 반 바퀴
    const half = run(4.5, 0.8 / 4.5, { phase: 0, moving: 1, run: 0 })
    expect(half.phase).toBeCloseTo(0.5, 1)
  })

  it('안 움직이면 위상도 안 간다 — 제자리에서 발을 떨지 않는다', () => {
    expect(run(0, 1, { phase: 0.25, moving: 0, run: 0 }).phase).toBeCloseTo(0.25, 6)
  })
})

describe('자세 되돌리기', () => {
  it('회전과 자리를 함께 되돌린다 — 골반이 걷던 높이에 안 굳는다', () => {
    const root = arm(0.2, 1)
    const snap = snapshotPose(root)
    const waist = root.getObjectByName('Waist')!
    waist.position.y = 5
    waist.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 1)
    restorePose(snap)
    expect(waist.position.y).toBeCloseTo(1, 6)
    expect(waist.quaternion.angleTo(arm(0.2, 1).getObjectByName('Waist')!.quaternion))
      .toBeLessThan(1e-6)
  })
})
