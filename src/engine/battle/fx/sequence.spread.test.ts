// 싱글 · 더블 갈래(`GroupOption 0`)와 범위 기술의 맞는 쪽 입자 (BATTLE_FX §4 · PARITY §2.13)
import { readFileSync, readdirSync } from 'node:fs'
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
    // 더블: 「싱글 이외」(4)의 `ParticleMoveSpecialPos`(특수 자리 2 — 필드 가운데)가 서고, 싱글 묶음(1)은 빠진다
    expect(names(battleOptions(true))).toEqual(['ParticleMoveSpecialPos'])
    expect(planSequence(SEQ, { options: battleOptions(true) }).ignored.has('ParticleMoveSpecialPos')).toBe(false)
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
    // 수가 같아도 명령이 다르다 — 싱글은 몸 기준(`ParticleMoveRelativePoke`), 더블은 특수 자리(`ParticleMoveSpecialPos`)
    const names = (n: string, doubles: boolean): string => {
      const p = planSequence(seq(n), { attackerMine: true, options: battleOptions(doubles) })
      return [...p.particles.flatMap((q) => q.commands.map((x) => x.name)), ...p.camera.map((x) => x.name)].sort().join()
    }
    for (const n of ['ew057', 'ew089', 'ew157']) expect(names(n, true)).not.toBe(names(n, false))
    expect(count('ew057', true)).toBeGreaterThan(0)
  })
})

const maybeAll = withData('fx/seq/ew071.json')

maybeAll('쓴 쪽 감추기(`PokemonVisible trg=0`) — 흡수 `ew071`은 몸을 안 감추고, 감추는 시퀀스는 안 돌려놓으면 끝까지 감춘 채인 여섯뿐이다', () => {
  it('목록', () => {
  const dir = resolve(DATA, 'fx/seq')
  const names = readdirSync(dir).filter((f) => /^ew\d+\.json$/.test(f)).map((f) => f.slice(0, -5))
  const endsHidden: string[] = []
  let hiders = 0
  for (const n of names) {
    const s = JSON.parse(readFileSync(resolve(dir, `${n}.json`), 'utf8')) as SeqData
    const ev = s.groups.flatMap((g) => g.commands).filter((c) => c.name === 'PokemonVisible' && c.values.trg?.[0] === '0')
      .sort((a, b) => a.start - b.start)
    if (ev.length === 0) continue
    if (ev.some((c) => c.values.visible?.[0] === '0')) hiders++
    if (ev.at(-1)!.values.visible?.[0] === '0') endsHidden.push(n)
  }
  // 파도타기 `ew057` · 흙탕물 `ew330` 등 여섯은 몸을 감추고 되돌리는 명령이 없다 — 우리는 `vanish`(공중날기 · 구멍파기)가 아니면 늘 보이게 둔다 (`BdspSequence`)
  expect(endsHidden).toEqual(['ew057', 'ew330', 'ew375', 'ew399', 'ew413', 'ew467'])
  expect(hiders).toBe(138)
  const absorb = planSequence(JSON.parse(readFileSync(resolve(dir, 'ew071.json'), 'utf8')) as SeqData, { attackerMine: true, options: battleOptions(false) })
  expect(absorb.body[0].commands.some((c) => c.name === 'PokemonVisible')).toBe(false)
  expect(absorb.camera.some((c) => c.name !== 'CameraReset' && c.name !== 'CameraResetFieldAll')).toBe(false)
  })
})

withData('fx/seq/ew416.json')('무대 갈래(`GroupOption 28`) — 기가임팩트 `ew416`', () => {
  const giga = JSON.parse(readFileSync(resolve(DATA, 'fx/seq/ew416.json'), 'utf8')) as SeqData
  const plan = (indoor: boolean) => planSequence(giga, { attackerMine: false, options: battleOptions(false, indoor) })
  const relCam = (indoor: boolean) => plan(indoor).camera.filter((c) => c.name === 'CameraMoveRelativePoke')

  it('야외 · 실내 어느 쪽이든 카메라 묶음이 선다 — 갈래를 안 주던 때는 101프레임 앞의 카메라가 하나도 없었다', () => {
    expect(relCam(false).some((c) => c.start < 101)).toBe(true)
    expect(relCam(true).some((c) => c.start < 101)).toBe(true)
  })

  it('실내는 덜 물러난다 — 79프레임 카메라가 1200 → 850', () => {
    const z = (indoor: boolean) => relCam(indoor).filter((c) => c.start === 79).map((c) => Number(c.values.pos?.[2]))
    expect(z(false)).toContain(1200)
    expect(z(true)).toContain(850)
  })

  it('돌진한 몸을 상대 기준으로 다시 세우고(79~104) 115프레임에 제자리로 돌린다', () => {
    const cmds = plan(false).body[0].commands
    expect(cmds.some((c) => c.name === 'PokemonMoveRelativePoke' && c.start === 79)).toBe(true)
    expect(cmds.some((c) => c.name === 'PokemonMoveReset' && c.start === 115)).toBe(true)
  })
})

describe('특수 자리 명령', () => {
  const ctx = (special: (pos: number) => { pos: [number, number, number]; yaw: number } | null) => ({
    anchor: () => null, home: () => ({ pos: [0, 0, 3] as [number, number, number], yaw: 0 }), rest: () => null, mine: () => true, special,
  })
  const SEQ: SeqData = { name: 'ew113', groups: [
    { name: 'wall', no: 1, options: [[0, 2]], commands: [c(0, 40, 'ParticleCreate', { file: ['ew113/ew113_at_start.ptcl'] }), c(5, 5, 'ParticleMoveSpecialPos', { pos: ['0'], ofs: ['0', '50', '60'], isRot: ['1'], isFlip: ['1'], move: ['0'] })] },
    { name: 'cam', no: 0, options: [[0, 2]], commands: [c(0, 0, 'CameraMoveSpecialPos', { pos: ['300', '222', '600'], trg: ['20', '50', '0'], posTrg: ['0'], fov: ['19'], isFlip: ['1'], isRot: ['1'], move: ['0'] })] },
  ] }

  it('입자는 특수 자리 0(자기 진영 가운데) + 오프셋(cm)에 서고, 특수 자리 번호는 역할로 안 바뀐다', () => {
    const plan = planSequence(SEQ, { options: battleOptions(true), targets: { 0: 0, 1: 1 } })
    expect(plan.particles[0]!.commands.map((x) => x.name)).toEqual(['ParticleMoveSpecialPos'])
    expect(plan.camera.map((x) => x.name)).toEqual(['CameraMoveSpecialPos'])
    expect(plan.camera[0]!.values.posTrg).toEqual(['0'])
  })

  it('몸이 아니라 특수 자리에서 읽는다 — 자리가 없으면 서지 않는다', async () => {
    const { particleAt, cameraAt } = await import('./sequence')
    const plan = planSequence(SEQ, { options: battleOptions(true) })
    const at = particleAt(plan.particles[0]!, 10, ctx(() => ({ pos: [0, 0, 3], yaw: 0 })))
    // 오프셋 (0, 50, 60)cm — 위 0.5m · 앞 0.6m
    expect(at.pos[1]).toBeCloseTo(0.5, 2)
    expect(Math.abs(at.pos[2] - 3)).toBeCloseTo(0.6, 1)
    const cam = cameraAt(plan, 1, { ...ctx(() => ({ pos: [0, 0, 3], yaw: 0 })), scale: () => 1 }, { pos: [0, 0, 0], target: [0, 0, 1], fov: 30, roll: 0 })
    expect(cam?.fov).toBe(19)
  })
})
