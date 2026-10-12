// 움직임 값(`motion.ts`)과 야외 굽기의 오일러(`field.ts`)
//
// ⚠️ 노드 쪽 `tools/extract/bdspArena.py`의 `motion_extras`와 **같은 JSON**이어야 한다 — 아래 기대값은 같은 입력을 파이썬에 먹여
// 맞대어 못 박았다(키 순서까지)
import { describe, expect, it } from 'vitest'
import { Euler, Quaternion } from 'three'
import { motionExtras, swingWeights } from './motion'
import { eulerOf, movingOf } from './field'
import type { Environment } from './environment'
import type { Mat4 } from './arena'
import type { UnityValue } from './typetree'

const col = (r: number, g: number, b: number, a: number): UnityValue => ({ r, g, b, a })
const look = (floats: Record<string, number>, colors: Record<string, UnityValue>) => ({
  floats: new Map<string, UnityValue>(Object.entries(floats)),
  colors: new Map<string, UnityValue>(Object.entries(colors)),
})

describe('motionExtras', () => {
  it('값이 없거나 꺼져 있으면 null이다', () => {
    expect(motionExtras(undefined, false)).toBeNull()
    expect(motionExtras(look({ _SwingEnable: 0 }, { _TexVelocity: col(0, 0, 0, 0) }), false)).toBeNull()
  })

  it('_TexVelocity — xy를 밑그림 속도로, 층 그림 재질은 zw부터 읽는다 (채널 대응은 추측)', () => {
    const belt = look({}, { _TexVelocity: col(0, 0.354, 0, 0) })
    expect(motionExtras(belt, false)).toEqual({ texVel: [0, 0.354] })
    const sandfall = look({}, { _TexVelocity: col(0, 0, 0, 0.1) })
    expect(motionExtras(sandfall, false)).toEqual({ texVel: [0, 0.1] })
    const both = look({}, { _TexVelocity: col(0.2, 0.3, 0.005, 0.01) })
    expect(motionExtras(both, false)).toEqual({ texVel: [0.2, 0.3] })
    expect(motionExtras(both, true)).toEqual({ texVel: [0.005, 0.01] })
    // _TexVelocity2는 안 쓴다
    expect(motionExtras(look({}, { _TexVelocity2: col(1, 1, 1, 1) }), false)).toBeNull()
  })

  it('LineUVScroll — _ScrollSpeed가 세로 줄 흐름이다', () => {
    expect(motionExtras(look({ _ScrollSpeed: 0.05 }, {}), false)).toEqual({ scroll: [0, 0.05] })
  })

  it('PhotoFrame — 자동으로 넘기고 칸이 둘 이상일 때만 싣는다 (번들에는 그런 재질이 0벌이다)', () => {
    const tv = { _PatternH: 8, _PatternV: 8, _StartFrameIndex: 45, _SwitchingTime: 1 }
    expect(motionExtras(look({ ...tv, _AutoSwitch: 0 }, {}), false)).toBeNull()
    expect(motionExtras(look({ ...tv, _AutoSwitch: 1 }, {}), false)).toEqual({ frames: { h: 8, v: 8, start: 45, every: 1 } })
    expect(motionExtras(look({ _PatternH: 1, _PatternV: 1, _SwitchingTime: 15, _AutoSwitch: 1 }, {}), false)).toBeNull()
  })

  it('swing — 이름대로의 값 · 키 순서가 고정이다', () => {
    const tree = look(
      { _SwingEnable: 1, _SwingPower: 1, _SwingSpeed: 0.5, _SwingDistribution: 5, _SwingUV: 1 },
      { _SwingScale: col(0.01, 0, 0.01, 0), _WindDirection: col(1, 0, 0, 0) },
    )
    const out = motionExtras(tree, false)!
    expect(JSON.stringify(out)).toBe('{"swing":{"power":1,"speed":0.5,"dist":5,"uv":1,"scale":[0.01,0,0.01],"dir":[1,0,0]}}')
  })

  it('여럿이 겹치면 texVel · scroll · frames · swing 차례다', () => {
    const m = look(
      { _ScrollSpeed: 0.1, _SwingEnable: 1, _SwingPower: 2, _SwingSpeed: 1, _SwingDistribution: 1 },
      { _TexVelocity: col(0.1, 0, 0, 0), _SwingScale: col(0.02, 0, 0, 0), _WindDirection: col(1, 0, 0, 0) },
    )
    expect(Object.keys(motionExtras(m, false)!)).toEqual(['texVel', 'scroll', 'swing'])
  })
})

describe('swingWeights', () => {
  it('정점 색 R × A — 나무는 R이 오르고 풀은 A가 오른다', () => {
    const color = new Float32Array([0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0.25])
    const w = swingWeights(color, 4, 3)!
    expect(Array.from(w)).toEqual([0, 1, Math.fround(0.25)])
  })
  it('정점 색 채널이 없거나 모자라면 null이다', () => {
    expect(swingWeights(undefined, undefined, 3)).toBeNull()
    expect(swingWeights(new Float32Array(6), 2, 3)).toBeNull()
  })
})

describe('eulerOf — 유니티 ZXY 오일러', () => {
  it('three YXZ 오일러로 만든 사원수를 되돌린다 (x는 ±90도 안쪽)', () => {
    const cases: [number, number, number][] = [[30, 40, 50], [-60, 120, -10], [0, 90, 0], [80, -170, 35]]
    for (const [x, y, z] of cases) {
      const q = new Quaternion().setFromEuler(new Euler(x * Math.PI / 180, y * Math.PI / 180, z * Math.PI / 180, 'YXZ'))
      const e = eulerOf([q.x, q.y, q.z, q.w])
      const back = new Quaternion().setFromEuler(new Euler(e[0]! * Math.PI / 180, e[1]! * Math.PI / 180, e[2]! * Math.PI / 180, 'YXZ'))
      expect(Math.abs(back.dot(q))).toBeCloseTo(1, 9)
      expect(Math.abs(e[0]!)).toBeLessThanOrEqual(90 + 1e-9)
    }
  })
})

// ── movingOf — 가짜 환경으로 (진짜 번들은 굽기 판에서 잰다) ──────────────────────────────────────────────

type Props = Record<string, UnityValue>
const ref = (id: number): Props => ({ m_FileID: 0, m_PathID: id })
const quat = (x: number, y: number, z: number, w: number): Props => ({ x, y, z, w })
const xyz = (x: number, y: number, z: number): Props => ({ x, y, z })

/** 부모(1) → 자식 물체(2 · 자식 없음). 물체의 컴포넌트는 `parts` */
function fakeEnv(parts: Record<number, { type: string, value: Props }>, localRotation: Props = quat(0, 0, 0, 1)): Environment {
  const objects = new Map<number, { type: string, value: Props }>([
    [1, { type: 'Transform', value: { m_LocalPosition: xyz(10, 0, 5), m_LocalRotation: quat(0, 0, 0, 1), m_LocalScale: xyz(1, 1, 1), m_Father: ref(0), m_Children: [ref(2)] } }],
    [2, { type: 'Transform', value: { m_LocalPosition: xyz(1, 2, 3), m_LocalRotation: localRotation, m_LocalScale: xyz(1, 1, 1), m_Father: ref(1), m_Children: [], m_GameObject: ref(9) } }],
    ...Object.entries(parts).map(([k, v]): [number, { type: string, value: Props }] => [Number(k), v]),
  ])
  return {
    read: (pid: number) => objects.get(pid)?.value ?? null,
    entryOf: (pid: number) => (objects.has(pid) ? { type: objects.get(pid)!.type } : undefined),
  } as unknown as Environment
}

const goOf = (components: number[]): Props => ({ m_Name: 'Thing', m_Component: components.map((c) => ({ component: ref(c) })) })
const DOTWEEN: Props = { animationType: 4, duration: 6, loops: -1, loopType: 0, easeType: 1, isRelative: 1, autoPlay: 1, delay: 0, isFrom: 0, endValueV3: xyz(360, 0, 0) }

describe('movingOf', () => {
  it('DOTween 로컬 회전(풍차) — 시작 오일러 · 더할 오일러 · 초를 싣고 부모 월드를 닻으로 둔다', () => {
    const half = Math.sin(Math.PI / 8)
    const env = fakeEnv({ 20: { type: 'MonoBehaviour', value: DOTWEEN } }, quat(0, half, 0, Math.cos(Math.PI / 8)))
    // 컴포넌트 목록 — Transform(2)이 먼저, 이어서 DOTween(20)
    const move = movingOf(env, goOf([2, 20]), 2, new Map<number, Mat4>())
    expect(move).not.toBeNull()
    expect(move!.spin!.add).toEqual([360, 0, 0])
    expect(move!.spin!.secs).toBe(6)
    expect(move!.spin!.euler[1]).toBeCloseTo(45, 6)
    // 부모 월드(이동 10, 0, 5)가 닻이다
    expect(move!.parent![3]).toBe(10)
    expect(move!.parent![11]).toBe(5)
    // 몸은 부모 공간의 로컬이고 x를 뒤집었다 — 이동 (1, 2, 3) → (−1, 2, 3), y 22.5도 사원수 → y 부호 반대
    expect(move!.body.t).toEqual([-1, 2, 3])
    expect(move!.body.r[1]).toBeCloseTo(-Math.sin(Math.PI / 8), 9)
  })

  it('월드 회전(Rotate · 지구본)은 닻이 없고 몸의 로컬이 곧 월드다', () => {
    const env = fakeEnv({ 20: { type: 'MonoBehaviour', value: { ...DOTWEEN, animationType: 3, endValueV3: xyz(0, -360, 0), duration: 15 } } })
    const move = movingOf(env, goOf([2, 20]), 2, new Map<number, Mat4>())!
    expect(move.parent).toBeNull()
    expect(move.body.t[0]).toBe(-11)
    expect(move.spin!.add).toEqual([0, -360, 0])
  })

  it('자동이 아니거나 되풀이가 아니거나 상대가 아니면 안 싣는다', () => {
    for (const bad of [{ autoPlay: 0 }, { loops: 3 }, { loopType: 1 }, { isRelative: 0 }, { easeType: 6 }, { animationType: 5 }] as Props[]) {
      const env = fakeEnv({ 20: { type: 'MonoBehaviour', value: { ...DOTWEEN, ...bad } } })
      expect(movingOf(env, goOf([2, 20]), 2, new Map<number, Mat4>())).toBeNull()
    }
  })

  it('자식이 있는 물체는 정적으로 둔다', () => {
    const env = fakeEnv({ 20: { type: 'MonoBehaviour', value: DOTWEEN } })
    expect(movingOf(env, goOf([2, 20]), 1, new Map<number, Mat4>())).toBeNull()
  })

  it('Animator + 컨트롤러 클립(석탄 더미) — 클립 PathID를 싣고, 클립이 다른 번들에 있으면(FileID ≠ 0) 안 싣는다', () => {
    const own = fakeEnv({ 30: { type: 'Animator', value: { m_Controller: ref(31) } }, 31: { type: 'AnimatorController', value: { m_AnimationClips: [ref(77)] } } })
    expect(movingOf(own, goOf([2, 30]), 2, new Map<number, Mat4>())!.clip).toBe(77)
    const outer = fakeEnv({ 30: { type: 'Animator', value: { m_Controller: ref(31) } }, 31: { type: 'AnimatorController', value: { m_AnimationClips: [{ m_FileID: 3, m_PathID: 77 }] } } })
    expect(movingOf(outer, goOf([2, 30]), 2, new Map<number, Mat4>())).toBeNull()
    // 컨트롤러에 클립이 없는 배 · 도개교는 스크립트가 부른다 — 안 싣는다
    const bare = fakeEnv({ 30: { type: 'Animator', value: { m_Controller: ref(31) } }, 31: { type: 'AnimatorController', value: { m_AnimationClips: [] } } })
    expect(movingOf(bare, goOf([2, 30]), 2, new Map<number, Mat4>())).toBeNull()
  })
})
