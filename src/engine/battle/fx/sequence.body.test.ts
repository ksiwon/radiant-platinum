// 몸에 거는 값 — 크기(`PokemonScale` 상대 · 절대) · 덧 회전(`PokemonRotate`)
import { describe, expect, it } from 'vitest'
import { bodyAt, planSequence, type SeqContext, type SeqData } from './sequence'

const ctx: SeqContext = {
  anchor: () => ({ pos: [0, 0, 0], yaw: 0 }),
  home: (role) => ({ pos: [0, 0, role === 0 ? 2.2 : -2.2], yaw: role === 0 ? Math.PI : 0 }),
  mine: (role) => role === 0,
  rest: () => ({ pos: [0, 0, 0], yaw: 0 }),
}
const c = (start: number, end: number, name: string, values: Record<string, string[]> = {}) => ({ start, end, name, values })
const plan = (...cmds: ReturnType<typeof c>[]) =>
  planSequence({ name: 'test', groups: [{ name: 'body', no: 20, options: [], commands: cmds }] } satisfies SeqData)

describe('bodyAt — PokemonScale', () => {
  it('절대 값은 그 값으로 간다 (이음 중간은 선형 — move 0)', () => {
    const p = plan(c(10, 20, 'PokemonScale', { scale: ['3', '2', '1'], relative: ['0'], trg: ['0'] }))
    expect(bodyAt(p, 0, 5, ctx).scale).toEqual([1, 1, 1])
    const mid = bodyAt(p, 0, 15, ctx).scale
    expect(mid[0]).toBeCloseTo(2, 9); expect(mid[1]).toBeCloseTo(1.5, 9); expect(mid[2]).toBeCloseTo(1, 9)
    expect(bodyAt(p, 0, 20, ctx).scale).toEqual([3, 2, 1])
  })

  it('상대 값은 지금 크기에 곱한다 — 연이은 상대 명령은 곱셈으로 쌓인다', () => {
    const p = plan(
      c(0, 0, 'PokemonScale', { scale: ['2', '2', '2'], relative: ['1'], trg: ['0'] }),
      c(10, 20, 'PokemonScale', { scale: ['3', '3', '3'], relative: ['1'], trg: ['0'] }),
    )
    expect(bodyAt(p, 0, 5, ctx).scale).toEqual([2, 2, 2])
    // 두 번째 이음 중간: 2 → 2 × 3 = 6의 반
    const mid = bodyAt(p, 0, 15, ctx).scale
    expect(mid[0]).toBeCloseTo(4, 9)
    expect(bodyAt(p, 0, 25, ctx).scale).toEqual([6, 6, 6])
  })

  it('절대 명령은 앞의 상대 쌓임 위에 덮는다', () => {
    const p = plan(
      c(0, 0, 'PokemonScale', { scale: ['5', '5', '5'], relative: ['1'], trg: ['0'] }),
      c(10, 10, 'PokemonScale', { scale: ['0.5', '0.5', '0.5'], relative: ['0'], trg: ['0'] }),
    )
    expect(bodyAt(p, 0, 12, ctx).scale).toEqual([0.5, 0.5, 0.5])
  })

  it('역할마다 따로다 — trg 1의 크기는 쓴 쪽에 안 걸린다', () => {
    const p = plan(c(0, 0, 'PokemonScale', { scale: ['4', '4', '4'], relative: ['0'], trg: ['1'] }))
    expect(bodyAt(p, 0, 5, ctx).scale).toEqual([1, 1, 1])
    expect(bodyAt(p, 1, 5, ctx).scale).toEqual([4, 4, 4])
  })
})

describe('bodyAt — PokemonRotate', () => {
  const deg = (d: number): number => (d * Math.PI) / 180

  it('Y 도는 부호가 뒤집힌다 (X 거울) — 절대 90°는 −90°', () => {
    const p = plan(c(0, 0, 'PokemonRotate', { scale: ['0', '90', '0'], relative: ['0'], trg: ['0'] }))
    expect(bodyAt(p, 0, 3, ctx).turn).toBeCloseTo(-deg(90), 9)
  })

  it('이음 중간은 반만 돈다', () => {
    const p = plan(c(10, 20, 'PokemonRotate', { scale: ['0', '90', '0'], relative: ['0'], trg: ['0'] }))
    expect(bodyAt(p, 0, 15, ctx).turn).toBeCloseTo(-deg(45), 9)
    expect(bodyAt(p, 0, 20, ctx).turn).toBeCloseTo(-deg(90), 9)
  })

  it('상대는 지금 각에 더한다', () => {
    const p = plan(
      c(0, 0, 'PokemonRotate', { scale: ['0', '90', '0'], relative: ['0'], trg: ['0'] }),
      c(10, 10, 'PokemonRotate', { scale: ['0', '45', '0'], relative: ['1'], trg: ['0'] }),
    )
    expect(bodyAt(p, 0, 5, ctx).turn).toBeCloseTo(-deg(90), 9)
    expect(bodyAt(p, 0, 12, ctx).turn).toBeCloseTo(-deg(135), 9)
  })

  it('X · Z 성분은 읽지 않는다 — Y만 몸을 돌린다', () => {
    const p = plan(c(0, 0, 'PokemonRotate', { scale: ['90', '0', '90'], relative: ['0'], trg: ['0'] }))
    expect(bodyAt(p, 0, 3, ctx).turn).toBeCloseTo(0, 12)
  })
})
