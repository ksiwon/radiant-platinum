// 접기(`foldTrack`) — 「이음이 도는 명령은 그 명령이 시작한 프레임의 접힌 값에서 목표로 간다」는 한 규칙을
// 자리 · 모델 자리 · 몸 자리 · 카메라가 같이 쓴다. 한 호출 안에서 같은 앞부분을 되풀이해 접지 않는지(`memo`)와,
// 예전의 곧이곧대로 도는 재귀와 값이 같은지를 잰다
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ease, foldTrack, type FoldStep, type SeqData } from './sequence'

interface Cmd { start: number; end: number; name: string; values: Record<string, string[]> }
const cmd = (start: number, end: number, name = 'Move', v = 0): Cmd => ({ start, end, name, values: { v: [String(v)] } })

/** 예전 접기 그대로 — 진행 중인 명령마다 앞부분을 처음부터 다시 접는다 (비교용 기준) */
function naive<T>(cmds: readonly Cmd[], limit: number, g: number, init: T, step: FoldStep<T>, calls?: { n: number }): T {
  let value = init
  for (let i = 0; i < limit; i++) {
    const c = cmds[i]!
    if (g < c.start) continue
    if (calls) calls.n++
    const next = step(c, value, g, () => naive(cmds, i, c.start, init, step, calls))
    if (next !== undefined) value = next
  }
  return value
}

/** 수 하나를 접는 시험용 단계 — 이름이 `Skip`이면 손대지 않고, `Reset`이면 `null`(값)로 돌린다 */
const progressOf = (c: Cmd, g: number): number => (c.end <= c.start ? 1 : ease(Number(c.values.v?.[1] ?? 3), (g - c.start) / (c.end - c.start)))
const numStep: FoldStep<number | null> = (c, value, g, before) => {
  if (c.name === 'Skip') return undefined
  if (c.name === 'Reset') return null
  const target = Number(c.values.v?.[0] ?? (c.start * 7) % 23) + (value ?? 0) * 0.5
  return c.end > c.start && g < c.end ? (before() ?? 0) + (target - (before() ?? 0)) * progressOf(c, g) : target
}

/** 작은 난수 — 시험이 같은 값으로 돈다 */
function rng(seed: number): () => number {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

describe('foldTrack', () => {
  it('아직 시작 안 한 명령은 건너뛰고 `undefined`는 값을 안 건드린다', () => {
    const cmds = [cmd(0, 0, 'Move', 5), cmd(10, 10, 'Skip', 99), cmd(20, 20, 'Move', 7)]
    expect(foldTrack(cmds, 3, 5, 0 as number | null, numStep)).toBe(5)
    expect(foldTrack(cmds, 3, 15, 0 as number | null, numStep)).toBe(5)
    expect(foldTrack(cmds, 3, 25, 0 as number | null, numStep)).toBe(7 + 2.5)
  })

  it('`null`도 값이다 — 되돌림 명령이 값을 비운다', () => {
    const cmds = [cmd(0, 0, 'Move', 5), cmd(10, 10, 'Reset')]
    expect(foldTrack(cmds, 2, 12, 0 as number | null, numStep)).toBeNull()
    expect(foldTrack(cmds, 2, 8, 0 as number | null, numStep)).toBe(5)
  })

  it('이음이 도는 동안은 그 명령이 시작한 프레임의 값에서 목표로 간다', () => {
    const cmds = [cmd(0, 0, 'Move', 10), cmd(10, 20, 'Move', 30)]
    // 시작 프레임의 값 10, 목표 30 + 10 × 0.5 = 35, 중간(ease 3 = smoothstep 0.5)은 22.5
    expect(foldTrack(cmds, 2, 15, 0 as number | null, numStep)).toBeCloseTo(22.5, 9)
    expect(foldTrack(cmds, 2, 20, 0 as number | null, numStep)).toBeCloseTo(35, 9)
  })

  it('예전 재귀와 값이 같다 — 겹친 이음이 많은 합성 칸', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed)
      const n = 3 + Math.floor(r() * 12)
      const cmds: Cmd[] = []
      for (let i = 0; i < n; i++) {
        const start = Math.floor(r() * 60)
        const name = r() < 0.12 ? 'Skip' : r() < 0.1 ? 'Reset' : 'Move'
        cmds.push(cmd(start, r() < 0.3 ? start : start + 1 + Math.floor(r() * 30), name, Math.floor(r() * 100) - 50))
      }
      cmds.sort((a, b) => a.start - b.start)
      for (let g = 0; g <= 100; g += 3) {
        expect(foldTrack(cmds, cmds.length, g, 0 as number | null, numStep)).toEqual(naive(cmds, cmds.length, g, 0 as number | null, numStep))
      }
    }
  })

  it('앞부분을 되풀이해 접지 않는다 — 전부 겹친 열두 이음의 단계 수', () => {
    const cmds = Array.from({ length: 12 }, (_, i) => cmd(i, 100, 'Move', i + 1))
    const a = { n: 0 }
    const want = naive(cmds, cmds.length, 50, 0 as number | null, numStep, a)
    let steps = 0
    const counted: FoldStep<number | null> = (c, v, g, b) => { steps++; return numStep(c, v, g, b) }
    expect(foldTrack(cmds, cmds.length, 50, 0 as number | null, counted)).toBeCloseTo(want as number, 9)
    // 곧이곧대로면 2^12 근처, 한 번씩만 재면 n(n+1)/2 이하
    expect(a.n).toBeGreaterThan(1000)
    expect(steps).toBeLessThanOrEqual(12 * 13 / 2)
  })

  it('이음이 없으면 출발값을 아예 안 재 본다', () => {
    const cmds = Array.from({ length: 20 }, (_, i) => cmd(i, i, 'Move', i))
    let before = 0
    foldTrack(cmds, 20, 50, 0 as number | null, (c, v, g, b) => { before++; return numStep(c, v, g, b) })
    expect(before).toBe(20)
  })
})

const DIR = new URL('../../../../public/data/fx/seq/', import.meta.url)
const real = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith('.json')) : []

describe.skipIf(real.length === 0)('실제 BDSP 시퀀스의 칸에서도 예전 재귀와 같다', () => {
  it('모든 시퀀스 · 모든 묶음의 명령 목록을 여러 프레임에서 접어 본다', () => {
    let tracks = 0, ramps = 0
    for (const file of real) {
      const seq = JSON.parse(readFileSync(new URL(file, DIR), 'utf8')) as SeqData
      for (const group of seq.groups) {
        const cmds = group.commands as Cmd[]
        if (cmds.length === 0) continue
        tracks++
        ramps += cmds.filter((c) => c.end > c.start).length
        const last = Math.max(...cmds.map((c) => c.end))
        for (let g = 0; g <= last + 2; g += 4) {
          const a = foldTrack(cmds, cmds.length, g, 0 as number | null, numStep)
          const b = naive(cmds, cmds.length, g, 0 as number | null, numStep)
          if (a !== b) expect(a).toEqual(b)
        }
      }
    }
    expect(tracks).toBeGreaterThan(1000)
    expect(ramps).toBeGreaterThan(1000)
  })
})
