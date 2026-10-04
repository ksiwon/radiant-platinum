// 시퀀스 역할 → 무대 자리 잇기 · 한 몸에 걸린 두 역할 합치기 (자기 자신을 겨누는 기술 · 더블)
import { afterEach, describe, expect, it } from 'vitest'
import { bodyAt, planSequence, type SeqContext } from '../../../engine/battle/fx/sequence'
import { slotBody, slotRig, SLOT_TALL } from '../stageRefs'
import { mergePose, roleContext } from './seqContext'

const SPOTS: Record<string, [number, number]> = {
  p1a: [-1, 4], p1b: [-2.2, 4.6], p2a: [3, -5], p2b: [4.4, -5.4],
}
const spotAt = (slot: string): [number, number] => SPOTS[slot]!
const noOffset = (): undefined => undefined

afterEach(() => {
  for (const k of Object.keys(slotRig)) delete slotRig[k]
  for (const k of Object.keys(slotBody)) delete slotBody[k]
})

describe('roleContext — 역할 → 자리', () => {
  it('역할 0은 쓴 쪽, 1은 맞는 쪽 자리다 (발판 · 로케이터 높이는 키 비율)', () => {
    const rc = roleContext(['p1a', 'p2a'], spotAt, noOffset)
    expect(rc.home(0)!.pos).toEqual([-1, 0, 4])
    expect(rc.home(1)!.pos).toEqual([3, 0, -5])
    // 몸을 못 그렸으면 키(기본 1.4m) × 노드 높이 비율 — 노드 2(입)는 0.7
    expect(rc.anchor(1, 2)!.pos).toEqual([3, SLOT_TALL * 0.7, -5])
    expect(rc.anchor(0, 0)!.pos).toEqual([-1, 0, 4])
  })

  it('몸이 서면 그 몸이 보는 쪽이 yaw다', () => {
    slotRig.p2a = { root: null, body: null, yaw: 1.25, shown: true }
    const rc = roleContext(['p1a', 'p2a'], spotAt, noOffset)
    expect(rc.home(1)!.yaw).toBe(1.25)
    expect(rc.anchor(1, 5)!.yaw).toBe(1.25)
    expect(rc.anchor(0, 5)!.yaw).toBe(0)
  })

  it('자리가 없는 역할은 `null`이다 — 쓴 쪽이 없는 시퀀스(내보내기 · 기절)', () => {
    const rc = roleContext([null, 'p2a'], spotAt, noOffset)
    expect(rc.anchor(0, 0)).toBeNull()
    expect(rc.home(0)).toBeNull()
    expect(rc.rest(0, 0)).toBeNull()
    expect(rc.home(1)).not.toBeNull()
  })

  it('mine — 자리가 있으면 p1인가, 없으면 반대 역할의 반대 쪽', () => {
    expect(roleContext(['p1a', 'p2a'], spotAt, noOffset).mine(0)).toBe(true)
    expect(roleContext(['p1a', 'p2a'], spotAt, noOffset).mine(1)).toBe(false)
    // 더블의 둘째 자리도 같은 쪽
    expect(roleContext(['p1b', 'p2b'], spotAt, noOffset).mine(0)).toBe(true)
    expect(roleContext(['p1b', 'p2b'], spotAt, noOffset).mine(1)).toBe(false)
    // 쓴 쪽이 없으면: 맞는 쪽이 상대(p2)면 쓴 쪽은 내 쪽, 맞는 쪽이 내 쪽이면 쓴 쪽은 상대
    expect(roleContext([null, 'p2a'], spotAt, noOffset).mine(0)).toBe(true)
    expect(roleContext([null, 'p1a'], spotAt, noOffset).mine(0)).toBe(false)
    // 둘 다 없으면 역할 0만 내 쪽
    expect(roleContext([null, null], spotAt, noOffset).mine(0)).toBe(true)
    expect(roleContext([null, null], spotAt, noOffset).mine(1)).toBe(false)
  })

  it('자기 자신을 겨누는 기술 — 두 역할이 같은 자리 · 같은 쪽이다', () => {
    const rc = roleContext(['p1a', 'p1a'], spotAt, noOffset)
    expect(rc.anchor(0, 5)).toEqual(rc.anchor(1, 5))
    expect(rc.home(0)).toEqual(rc.home(1))
    expect(rc.mine(0)).toBe(true)
    expect(rc.mine(1)).toBe(true)
  })

  it('더블 — 맞는 쪽은 `roles[1]`이 정한 한 자리뿐이다 (여럿을 맞히는 기술도 시퀀스는 한 번, 맞는 쪽은 그 한 자리)', () => {
    const first = roleContext(['p1a', 'p2a'], spotAt, noOffset)
    const second = roleContext(['p1a', 'p2b'], spotAt, noOffset)
    expect(first.home(1)!.pos).toEqual([3, 0, -5])
    expect(second.home(1)!.pos).toEqual([4.4, 0, -5.4])
    // 쓴 쪽은 그대로
    expect(second.home(0)).toEqual(first.home(0))
  })

  it('rest — 시퀀스가 그 몸을 옮겨 둔 만큼 되돌린 자리 (제 몸 기준 명령이 프레임마다 더해 가지 않게)', () => {
    const moved = (slot: string): readonly number[] | undefined => (slot === 'p1a' ? [0.5, 0.25, -1] : undefined)
    const rc = roleContext(['p1a', 'p2a'], spotAt, moved)
    expect(rc.rest(0, 0)!.pos).toEqual([-1 - 0.5, 0 - 0.25, 4 + 1])
    expect(rc.rest(1, 0)!.pos).toEqual([3, 0, -5])
    // 지금 자리(anchor)는 건드리지 않는다
    expect(rc.anchor(0, 0)!.pos).toEqual([-1, 0, 4])
  })
})

describe('mergePose — 한 몸에 두 역할이 걸릴 때', () => {
  const ctx: SeqContext = { ...roleContext(['p1a', 'p1a'], spotAt, noOffset), world: undefined }
  const c = (start: number, end: number, name: string, values: Record<string, string[]> = {}) => ({ start, end, name, values })
  // 자기 강화 꼴 — 쓴 쪽(trg 0)은 공격 동작 + 앞으로, 맞는 쪽(trg 1)은 피격 동작 + 크기 · 빛
  const plan = planSequence({ name: 'self', groups: [{ name: 'g', no: 20, options: [], commands: [
    c(10, 10, 'PokemonAttackMotion', { motion: ['32'], trg: ['0'] }),
    c(0, 0, 'PokemonScale', { scale: ['2', '2', '2'], relative: ['0'], trg: ['0'] }),
    c(20, 20, 'PokemonMotion', { motion: ['16'], trg: ['1'] }),
    c(0, 0, 'PokemonScale', { scale: ['1.5', '1.5', '1.5'], relative: ['0'], trg: ['1'] }),
    c(0, 0, 'PokemonShaderCol', { start_col: ['1', '0', '0'], end_col: ['1', '0', '0'], start_pow: ['2'], end_pow: ['2'], trg: ['1'] }),
    c(0, 0, 'PokemonVisible', { visible: ['1'], trg: ['0'] }),
  ] }] })

  it('크기는 곱하고 동작은 늦게 시킨 쪽 · 빛은 있는 쪽', () => {
    const merged = mergePose(bodyAt(plan, 0, 30, ctx), bodyAt(plan, 1, 30, ctx))
    expect(merged.scale).toEqual([3, 3, 3])
    expect(merged.motion).toEqual({ name: 'damage', at: 20 })
    expect(merged.glow?.power).toBe(2)
    // 늦게 시킨 쪽이 이긴다 — 공격(10)보다 피격(20)
    expect(bodyAt(plan, 0, 30, ctx).motion).toEqual({ name: 'attack', at: 10 })
  })

  it('합치는 순서와 상관없이 같은 동작이 이긴다 (늦은 시작이 이긴다)', () => {
    const a = bodyAt(plan, 0, 30, ctx), b = bodyAt(plan, 1, 30, ctx)
    expect(mergePose(a, b).motion).toEqual(mergePose(b, a).motion)
  })

  it('옮김 · 떨림 · 돌기는 더한다, 감추기는 어느 한쪽이라도, 배속은 느린 쪽', () => {
    const base = bodyAt(plan, 0, 0, ctx)
    const a = { ...base, offset: [1, 0, 2] as [number, number, number], shake: [0.1, 0, 0] as [number, number, number], turn: 0.5, visible: true, motionSpeed: 1, intro: false }
    const b = { ...base, offset: [0.5, 1, -1] as [number, number, number], shake: [0, 0.2, 0] as [number, number, number], turn: -0.25, visible: false, motionSpeed: 0, intro: true }
    const m = mergePose(a, b)
    expect(m.offset).toEqual([1.5, 1, 1])
    expect(m.shake).toEqual([0.1, 0.2, 0])
    expect(m.turn).toBeCloseTo(0.25, 12)
    expect(m.visible).toBe(false)
    expect(m.motionSpeed).toBe(0)
    expect(m.intro).toBe(true)
  })

  it('한쪽에 동작이 없으면 있는 쪽 동작이다', () => {
    const base = bodyAt(plan, 0, 0, ctx)
    const m = { name: 'attack' as const, at: 3 }
    expect(mergePose({ ...base, motion: null }, { ...base, motion: m }).motion).toBe(m)
    expect(mergePose({ ...base, motion: m }, { ...base, motion: null }).motion).toBe(m)
    expect(mergePose({ ...base, motion: null }, { ...base, motion: null }).motion).toBeNull()
  })
})
