import { describe, expect, it } from 'vitest'
import {
  backAt, bodyAt, cameraAt, ease, gaugesAt, particleAt, planFrames, planSequence, shakeAt,
  type SeqContext, type SeqData,
} from './sequence'

/** 쓴 쪽 (0,0,2.2)이 −Z를, 맞는 쪽 (0,0,−2.2)이 +Z를 본다. 로케이터는 키 비율로 */
const ctx: SeqContext = {
  anchor: (role, node) => {
    const z = role === 0 ? 2.2 : -2.2
    const yaw = role === 0 ? Math.PI : 0
    return { pos: [0, node === 0 ? 0 : 0.5, z], yaw }
  },
  home: (role) => ({ pos: [0, 0, role === 0 ? 2.2 : -2.2], yaw: role === 0 ? Math.PI : 0 }),
  mine: (role) => role === 0,
  rest: (role, node) => ({ pos: [0, node === 0 ? 0 : 0.5, role === 0 ? 2.2 : -2.2], yaw: role === 0 ? Math.PI : 0 }),
}

const c = (start: number, end: number, name: string, values: Record<string, string[]> = {}) => ({ start, end, name, values })

/** 몸통박치기(`ew033`)를 줄인 것 */
const TACKLE: SeqData = {
  name: 'ew033',
  groups: [
    { name: '攻撃', no: 10, options: [], commands: [
      c(24, 29, 'PokemonMoveRelativePoke', { moveTrg: ['0'], posTrg: ['0'], node: ['0'], ofs: ['0', '0', '50'], isRot: ['0'], isFlip: ['1'], rate: ['100'], move: ['1'] }),
      c(28, 28, 'PokemonAttackMotion', { motion: ['32'], trg: ['0'] }),
      c(42, 48, 'PokemonMoveReset', { trg: ['0'], move: ['0'] }),
    ] },
    { name: '防御', no: 10, options: [], commands: [
      c(34, 34, 'PokemonMotion', { motion: ['16'], trg: ['1'] }),
    ] },
    { name: 'gauge', no: 10, options: [], commands: [c(44, 44, 'GaugeDamage', { trg: ['1'] })] },
    { name: 'hit', no: 7, options: [], commands: [
      c(33, 46, 'ParticleCreate', { file: ['ew033/ew033_df_hit.ptcl'] }),
      c(33, 33, 'ParticleScale', { scale: ['0.8', '0.8', '0.8'] }),
      c(33, 33, 'ParticleMoveRelativePoke', { node: ['5'], pos: ['0', '0', '0'], trg: ['1'], isRot: ['1'], rate: ['100'] }),
    ] },
    { name: 'only-mine', no: 1, options: [[1, 1]], commands: [c(1, 2, 'ParticleCreate', { file: ['a/mine.ptcl'] })] },
    { name: 'only-foe', no: 1, options: [[1, 2]], commands: [c(1, 2, 'ParticleCreate', { file: ['a/foe.ptcl'] })] },
    { name: 'trainer', no: 1, options: [[0, 2]], commands: [c(1, 2, 'ParticleCreate', { file: ['a/trainer.ptcl'] })] },
  ],
}

describe('BDSP 시퀀스', () => {
  it('체력판 — 0프레임에 다 감추고, 맞기 전에 맞는 쪽만 다시 켜고, 다 켜면 역할마다 켠 것은 지운다', () => {
    const seq: SeqData = { name: 'ew033', groups: [{ name: 'gauge', no: 1, options: [], commands: [
      c(0, 0, 'GaugeDispAll', { visible: ['0'] }),
      c(20, 20, 'GaugeDisp', { trg: ['1'], visible: ['1'] }),
      c(60, 60, 'GaugeDispAll', { visible: ['1'] }),
    ] }] }
    const plan = planSequence(seq)
    expect(gaugesAt(plan, -1)).toEqual({ all: true, role: [null, null] })
    expect(gaugesAt(plan, 5)).toEqual({ all: false, role: [null, null] })
    expect(gaugesAt(plan, 30)).toEqual({ all: false, role: [null, true] })
    expect(gaugesAt(plan, 61)).toEqual({ all: true, role: [null, null] })
  })

  it('3D로만 내는 소리도 소리 칸이다 — 같은 이름의 평면 소리가 있으면 그 사본이라 안 센다', () => {
    const seq: SeqData = { name: 'ew098', groups: [{ name: 'se', no: 1, options: [], commands: [
      c(8, 8, 'Sound3DPostEvent', { event: ['Play_ew098_01'] }),
      c(19, 19, 'Sound3DPostEvent', { event: ['Play_ew098_02'] }),
      c(23, 23, 'SoundPostEvent', { event: ['Play_x_01'] }),
      c(33, 33, 'SoundPostEvent', { event: ['Play_x_02'] }),
      c(40, 40, 'Sound3DPostEvent', { event: ['Play_x_02'] }),
    ] }] }
    expect(planSequence(seq).sounds).toEqual([8, 19, 23, 33])
  })

  it('입자 칸 · 맞는 프레임 · 길이를 편다', () => {
    const plan = planSequence(TACKLE, { attackerMine: true })
    expect(plan.particles.map((p) => p.prefab)).toEqual(['ew033_df_hit', 'mine'])
    expect(plan.hit).toBe(44)
    expect(planFrames(plan)).toBe(48)
    expect(planSequence(TACKLE, { attackerMine: false }).particles.map((p) => p.prefab)).toEqual(['ew033_df_hit', 'foe'])
  })

  it('입자는 맞는 쪽 로케이터에 붙고 크기는 ParticleScale', () => {
    const plan = planSequence(TACKLE)
    const p = plan.particles[0]!
    const pose = particleAt(p, 40, ctx)
    expect(pose.pos[2]).toBeCloseTo(-2.2, 6)
    expect(pose.pos[1]).toBeCloseTo(0.5, 6)
    expect(pose.scale).toEqual([0.8, 0.8, 0.8])
  })

  it('쓴 쪽이 50cm 나갔다가 돌아온다 (cm → m) — 내 쪽이면 isFlip으로 상대 쪽(−Z)을 향한다', () => {
    const plan = planSequence(TACKLE)
    expect(bodyAt(plan, 0, 20, ctx).offset).toEqual([0, 0, 0])
    expect(bodyAt(plan, 0, 29, ctx).offset[2]).toBeCloseTo(-0.5, 6)
    expect(bodyAt(plan, 0, 36, ctx).offset[2]).toBeCloseTo(-0.5, 6)
    expect(bodyAt(plan, 0, 48, ctx).offset[2]).toBeCloseTo(0, 6)
    // 사이는 곡선(move 1)대로 — 끝값 사이에 있다
    const mid = bodyAt(plan, 0, 26.5, ctx).offset[2]
    expect(mid).toBeLessThan(0)
    expect(mid).toBeGreaterThan(-0.5)
    // 상대 쪽 몸이 쓰면 그대로 +Z (내 쪽으로)
    const foe = { ...ctx, mine: () => false }
    expect(bodyAt(plan, 0, 36, foe).offset[2]).toBeCloseTo(0.5, 6)
  })

  it('동작: 공격 30~42 · 피격 16', () => {
    const plan = planSequence(TACKLE)
    expect(bodyAt(plan, 0, 30, ctx).motion).toEqual({ name: 'attack', at: 28 })
    expect(bodyAt(plan, 1, 30, ctx).motion).toBeNull()
    expect(bodyAt(plan, 1, 35, ctx).motion).toEqual({ name: 'damage', at: 34 })
  })

  it('볼 이펙트는 볼 번호로 갈아 끼운다', () => {
    const seq: SeqData = { name: 'ee106', groups: [{ name: 'b', no: 30, options: [], commands: [
      c(8, 64, 'ParticleCreate', { file: ['eb_set/eb004_ballout.ptcl'], isBallEffect: ['1'] }),
    ] }] }
    expect(planSequence(seq, { ball: 7 }).particles[0]!.prefab).toBe('eb007_ballout')
  })

  it('ParticleStop이 뿜기를 끊는다', () => {
    const seq: SeqData = { name: 's', groups: [{ name: 'g', no: 1, options: [], commands: [
      c(10, 60, 'ParticleCreate', { file: ['x/y.ptcl'] }), c(30, 30, 'ParticleStop'),
    ] }] }
    expect(planSequence(seq).particles[0]!.stop).toBe(30)
  })

  it('화면 흔들림 · 배경 물들임', () => {
    const seq: SeqData = { name: 's', groups: [{ name: 'g', no: 1, options: [], commands: [
      c(4, 19, 'CameraShake', { srate: ['10'], erate: ['0'] }),
      c(15, 15, 'EffSpBackColFlg', { alpha: ['0'], col: ['0', '0', '0'], visible: ['1'] }),
      c(18, 22, 'EffSpBackColSet', { alpha: ['0.5'], col: ['0.5', '0', '0'] }),
      c(47, 47, 'EffSpBackColFlg', { alpha: ['0'], col: ['0', '0', '0'], visible: ['0'] }),
    ] }] }
    const plan = planSequence(seq)
    expect(shakeAt(plan, 4)).toBeGreaterThan(shakeAt(plan, 15))
    expect(shakeAt(plan, 30)).toBe(0)
    expect(backAt(plan, 16)).toBeNull()
    expect(backAt(plan, 22)).toEqual({ color: [0.5, 0, 0], alpha: 0.5 })
    expect(backAt(plan, 50)).toBeNull()
  })

  it('쉬움 곡선 0은 직선', () => {
    expect(ease(0, 0.25)).toBe(0.25)
    expect(ease(1, 0.5)).toBeCloseTo(0.25)
  })
})

describe('시퀀스 카메라', () => {
  const base = { pos: [2.7, 1.5, 5] as [number, number, number], target: [0, 0.05, 0] as [number, number, number], fov: 30, roll: 0 }
  const cctx = { ...ctx, scale: () => 1 }
  const seq: SeqData = { name: 'cam', groups: [{ name: 'c', no: 0, options: [], commands: [
    c(0, 0, 'CameraReset', { move: ['0'] }),
    // 맞는 쪽(−Z에 서서 +Z를 본다) 앞 3.5m · 위 0.4m에서 그 몸을 본다
    c(16, 16, 'CameraMoveRelativePoke', { poke: ['1'], node: ['5'], isRot: ['1'], isFlip: ['1'], isScale: ['0'], rate: ['100'], fov: ['20'], move: ['0'], pos: ['0', '40', '350'], trg: ['0', '25', '0'] }),
    c(20, 30, 'CameraTwist', { twist: ['10'], relative: ['0'], move: ['0'] }),
    c(40, 50, 'CameraReset', { move: ['0'] }),
  ] }] }
  const plan = planSequence(seq)

  it('명령이 서기 전과 Reset 뒤는 기본 카메라(null)', () => {
    expect(cameraAt(plan, 5, cctx, base)).toBeNull()
    expect(cameraAt(plan, 60, cctx, base)).toBeNull()
  })

  it('몸 기준 오프셋 — 맞는 쪽 앞(+Z로) 3.5m에서 그 몸을 본다 · 화각 20', () => {
    const cam = cameraAt(plan, 17, cctx, base)!
    expect(cam.pos[2]).toBeCloseTo(-2.2 + 3.5, 6)
    expect(cam.pos[1]).toBeCloseTo(0.5 + 0.4, 6)
    expect(cam.target).toEqual([0, 0.75, -2.2])
    expect(cam.fov).toBe(20)
  })

  it('굴림은 시간에 걸쳐 · Reset은 기본으로 옮겨 간다', () => {
    expect(cameraAt(plan, 25, cctx, base)!.roll).toBeCloseTo(5 * Math.PI / 180, 6)
    const mid = cameraAt(plan, 45, cctx, base)!
    expect(mid.fov).toBeGreaterThan(20)
    expect(mid.fov).toBeLessThan(30)
  })
})
