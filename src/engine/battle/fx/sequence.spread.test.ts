// 싱글 · 더블 갈래(`GroupOption 0`)와 범위 기술의 맞는 쪽 입자 (BATTLE_FX §4 · PARITY §2.13)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, withData } from '../../../data/romData.testkit'
import { battleOptions, planSequence, touchesTarget, type SeqData } from './sequence'
import { parseLine } from '../sim/protocol'
import { applyEvent, emptyView } from '../view'

const c = (start: number, end: number, name: string, values: Record<string, string[]> = {}) => ({ start, end, name, values })

describe('싱글 · 더블 갈래', () => {
  const SEQ: SeqData = { name: 'ew057', groups: [
    { name: 'wave', no: 15, options: [], commands: [c(0, 40, 'ParticleCreate', { file: ['ew057/ew057_wave.ptcl'] })] },
    { name: 'single', no: 15, options: [[0, 1]], commands: [c(0, 0, 'ParticleMoveRelativePoke', { trg: ['1'], node: ['0'] })] },
    { name: 'nonsingle', no: 15, options: [[0, 4]], commands: [c(0, 0, 'ParticleMoveSpecialPos', { pos: ['2'] })] },
    { name: 'double', no: 0, options: [[0, 2]], commands: [c(4, 4, 'DprCameraGroundCheckFlg', { isEnable: ['0'] })] },
  ] }

  it('갈래를 안 주면 갈래 묶음이 통째로 빠지고, 싱글은 1만 · 더블은 2와 4가 선다', () => {
    const names = (o: ReturnType<typeof battleOptions>): string[] =>
      planSequence(SEQ, { options: o }).particles[0]!.commands.map((x) => x.name)
    expect(names(undefined)).toEqual([])
    expect(names(battleOptions(false))).toEqual(['ParticleMoveRelativePoke'])
    // 더블: 「싱글 이외」(4)의 `ParticleMoveSpecialPos`는 아직 안 옮긴 명령이라 접히지 않는다 — 싱글 묶음(1)은 빠진다
    expect(names(battleOptions(true))).toEqual([])
    expect(planSequence(SEQ, { options: battleOptions(true) }).ignored.has('ParticleMoveSpecialPos')).toBe(true)
  })

  it('맞는 쪽(trg=1)에 붙는 입자만 touchesTarget이다', () => {
    const plan = planSequence({ name: 'x', groups: [
      { name: 'a', no: 1, options: [], commands: [c(0, 9, 'ParticleCreate', { file: ['a/a.ptcl'] }), c(0, 0, 'ParticleMoveRelativePoke', { trg: ['1'], node: ['5'] })] },
      { name: 'b', no: 2, options: [], commands: [c(0, 9, 'ParticleCreate', { file: ['a/b.ptcl'] }), c(0, 0, 'ParticleMoveRelativePoke', { trg: ['0'], node: ['5'] })] },
    ] })
    expect(plan.particles.map((p) => touchesTarget(p))).toEqual([true, false])
  })
})

describe('범위 기술 줄', () => {
  it('`[spread]`는 맞은 자리 전체를, `target`은 대표 대상을 준다 (쇼다운 실측: 파도타기가 상대 둘과 편을 맞힌다)', () => {
    const e = parseLine('|move|p1a: 모부기|Surf|p2b: 팬텀|[spread] p1b,p2a,p2b')
    expect(e).toMatchObject({ kind: 'move', actor: { slot: 'p1a' }, target: { slot: 'p2b' }, spread: ['p1b', 'p2a', 'p2b'] })
  })

  it('범위 기술이 아니면 spread가 비고, 모르는 자리는 버린다', () => {
    expect(parseLine('|move|p1a: 모부기|Tackle|p2a: 팬텀')).toMatchObject({ spread: [] })
    expect(parseLine('|move|p1a: 모부기|Surf|p2a: 팬텀|[spread] p2a,zzz')).toMatchObject({ spread: ['p2a'] })
  })

  it('뷰의 lastMove에 spread가 실린다', () => {
    const e = parseLine('|move|p1a: 모부기|Earthquake||[spread] p1b,p2a,p2b')!
    expect(applyEvent(emptyView(), e).lastMove).toMatchObject({ by: 'p1a', to: null, spread: ['p1b', 'p2a', 'p2b'] })
  })
})

const maybe = withData('fx/seq/ew057.json', 'fx/seq/ew089.json', 'fx/seq/ew157.json')

maybe('실제 시퀀스 — 파도타기 · 지진 · 암석봉인', () => {
  const seq = (n: string): SeqData => JSON.parse(readFileSync(resolve(DATA, 'fx/seq', `${n}.json`), 'utf8')) as SeqData
  const count = (n: string, doubles: boolean): number => {
    const p = planSequence(seq(n), { attackerMine: true, options: battleOptions(doubles) })
    return p.particles.reduce((a, q) => a + q.commands.length, 0) + p.camera.length
  }

  it('싱글 갈래가 맞는 쪽 입자 자리를 준다 (갈래가 없던 때는 그 명령이 통째로 빠졌다)', () => {
    const none = planSequence(seq('ew057'), { attackerMine: true })
    const single = planSequence(seq('ew057'), { attackerMine: true, options: battleOptions(false) })
    const cmds = (p: typeof none): number => p.particles.reduce((a, q) => a + q.commands.length, 0)
    expect(cmds(single)).toBeGreaterThan(cmds(none))
  })

  it('더블 갈래는 싱글과 다른 벌이다', () => {
    for (const n of ['ew057', 'ew089', 'ew157']) expect(count(n, true)).not.toBe(count(n, false))
  })
})
