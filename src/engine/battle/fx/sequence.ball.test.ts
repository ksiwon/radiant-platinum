// 볼 · 내보내기 · 기절 시퀀스의 접기 — 모델 궤적 · 클립 시각 · 대상 잇기 · 등판 · 카메라 (BATTLE_FX §4)
import { describe, expect, it } from 'vitest'
import {
  awayHidden, bodyAt, cameraAt, chainPlans, INTRO_FALL, modelAt, othersHidden, particleAt, planSequence,
  seqLength, THROW_FRAMES, worldPair, type SeqContext, type SeqData, type V3,
} from './sequence'

/** 쓴 쪽 (0,0,2.2)이 −Z를, 맞는 쪽 (0,0,−2.2)이 +Z를 본다. 로케이터는 0(발밑) 말고는 0.5m 높이 */
const ctx: SeqContext = {
  anchor: (role, node) => ({ pos: [0, node === 0 ? 0 : 0.5, role === 0 ? 2.2 : -2.2], yaw: role === 0 ? Math.PI : 0 }),
  home: (role) => ({ pos: [0, 0, role === 0 ? 2.2 : -2.2], yaw: role === 0 ? Math.PI : 0 }),
  mine: (role) => role === 0,
  rest: (role, node) => ({ pos: [0, node === 0 ? 0 : 0.5, role === 0 ? 2.2 : -2.2], yaw: role === 0 ? Math.PI : 0 }),
}

const c = (start: number, end: number, name: string, values: Record<string, string[]> = {}) => ({ start, end, name, values })

describe('시퀀스 모델 (볼)', () => {
  // `ee101`을 줄인 것 — 손에서 f21에 떠나 상대 앞에 놓이고, f28에 클립 6을 틀고 f48~53만 두 배속, f45에 몸이 사라진다
  const BALL: SeqData = { name: 'ee101', groups: [
    { name: 'モデルデバッグコマンド', no: 12, options: [], commands: [c(0, 0, 'ModelCreateBall', {}), c(10, 10, 'ModelDelete')] },
    { name: 'ball', no: 12, options: [], commands: [
      c(0, 0, 'ModelCreateBall', { trgChara: ['12'] }),
      c(0, 0, 'DprModelAttachTrainer', { isEnable: ['1'], trg: ['0'] }),
      c(21, 21, 'DprModelAttachTrainer', { isEnable: ['0'], trg: ['0'] }),
      c(21, 21, 'ModelMoveRelativePoke', { trg: ['1'], node: ['5'], pos: ['0', '100', '200'], rate: ['100'], enableElem: ['1', '1', '1'] }),
      c(22, 28, 'ModelMoveRelativePoke', { trg: ['1'], node: ['5'], pos: ['0', '50', '70'], rate: ['100'], enableElem: ['1', '1', '1'] }),
      c(28, 28, 'DprModelAnimationPlayIndex', { index: ['6'], startTime: ['0'] }),
      c(48, 48, 'ModelSetAnimationSpeed', { speed: ['2'] }),
      c(53, 53, 'ModelSetAnimationSpeed', { speed: ['1'] }),
      c(56, 56, 'ModelMovePosition', { pos: ['0', '5', '0'], relative: ['0'] }),
    ] },
    { name: 'flash', no: 21, options: [], commands: [
      c(35, 56, 'ParticleCreate', { file: ['ee100/ee101_02_poke_flash.ptcl'] }),
      c(35, 35, 'ParticleMoveRelativePoke', { trg: ['1'], node: ['15'], pos: ['0', '0', '0'], rate: ['100'], isScale: ['1'] }),
      c(38, 51, 'DprParticleMoveRelativeModel', { grpNo: ['12'], nodeIndex: ['3'] }),
    ] },
    { name: 'body', no: 20, options: [], commands: [
      c(36, 47, 'PokemonScale', { relative: ['1'], scale: ['0.3', '0.3', '0.3'], trg: ['1'] }),
      c(45, 45, 'PokemonVisible', { trg: ['1'], visible: ['0'] }),
      c(28, 36, 'PokemonShaderCol', { start_col: ['0.5', '0.5', '0.5'], end_col: ['5', '5', '5'], start_pow: ['1'], end_pow: ['1'], trg: ['1'] }),
    ] },
  ] }
  const throwFrom: V3 = [-4, 1.6, 6]
  const plan = planSequence(BALL, { hideTarget: true, shaderBase: 1, scaleParticles: true, clipSeconds: [null, null, null, null, null, null, 2.25] })
  const mctx: SeqContext = {
    ...ctx,
    trainer: () => throwFrom,
    world: (cm) => [-cm[0] / 100, cm[1] / 100, -2.2 + cm[2] / 100],
    modelNode: (no, node, f) => (node === 3 ? modelAt(plan, no, f, mctx)?.pos ?? null : null),
    scale: () => 0.5,
  }

  it('디버그 묶음은 버린다 — 볼이 f10에 안 지워진다', () => {
    expect(modelAt(plan, 12, 30, mctx)).not.toBeNull()
  })

  it('손에 든 동안은 안 보이고, 떠나기 THROW_FRAMES 앞부터 던지는 자리에서 놓일 자리로 날아간다', () => {
    expect(modelAt(plan, 12, 5, mctx)!.visible).toBe(false)
    const start = modelAt(plan, 12, 21 - THROW_FRAMES, mctx)!
    expect(start.visible).toBe(true)
    expect(start.pos).toEqual(throwFrom)
    const mid = modelAt(plan, 12, 21 - THROW_FRAMES / 2, mctx)!
    expect(mid.flight).toBeCloseTo(0.5, 6)
    // 포물선 — 곧은 길보다 높다
    expect(mid.pos[1]).toBeGreaterThan((throwFrom[1] + 1.5) / 2)
    const at = modelAt(plan, 12, 21, mctx)!
    expect(at.flight).toBeNull()
    expect(at.pos[2]).toBeCloseTo(-2.2 + 2, 6)
    expect(at.pos[1]).toBeCloseTo(0.5 + 1, 6)
  })

  it('놓인 볼은 몸 앞 0.7m · 0.5m 위로 옮겨 가고, 절대 자리는 맥락의 기준(맞는 쪽 발밑)으로 간다', () => {
    const hover = modelAt(plan, 12, 30, mctx)!
    expect(hover.pos[2]).toBeCloseTo(-2.2 + 0.7, 6)
    expect(hover.pos[1]).toBeCloseTo(1, 6)
    const drop = modelAt(plan, 12, 56, mctx)!.pos
    expect(drop[1]).toBeCloseTo(0.05, 6)
    expect(drop[2]).toBeCloseTo(-2.2, 6)
  })

  it('클립 시각은 배속을 적분한다', () => {
    expect(modelAt(plan, 12, 27, mctx)!.clip).toBeNull()
    expect(modelAt(plan, 12, 43, mctx)!.clip).toEqual({ index: 6, time: 0.5, loop: false })
    // f48~53은 두 배 — 20프레임(0.667초) + 5프레임 × 2(0.333초) + 1프레임
    expect(modelAt(plan, 12, 54, mctx)!.clip!.time).toBeCloseTo(1 + 1 / 30, 6)
  })

  it('입자가 몸 한가운데에서 볼로 빨려 든다 — 몸 크기로 줄어든다(isScale)', () => {
    const p = plan.particles[0]!
    expect(particleAt(p, 36, mctx).pos).toEqual([0, 0.5, -2.2])
    expect(particleAt(p, 51, mctx).pos[2]).toBeCloseTo(-1.5, 6)
    expect(particleAt(p, 40, mctx).scale).toEqual([0.5, 0.5, 0.5])
  })

  it('맞는 쪽이 빛나며(제 색 1을 뺀 발광) 줄어들어 f45에 사라진다', () => {
    expect(bodyAt(plan, 1, 28, mctx).glow!.color[0]).toBe(0)
    expect(bodyAt(plan, 1, 36, mctx).glow!.color[0]).toBeCloseTo(4, 6)
    expect(bodyAt(plan, 1, 44, mctx).scale[0]).toBeLessThan(1)
    expect(bodyAt(plan, 1, 45, mctx).visible).toBe(false)
  })

  it('길이는 마지막 명령과, 그 전에 튼 클립의 끝 중 늦은 쪽', () => {
    // 클립 6(2.25초)을 f28에 튼다 — f48~53 두 배속이라 0.167초 일찍 끝난다: 28 + (2.25 − 0.167) × 30
    expect(seqLength(plan)).toBeCloseTo(28 + (2.25 - 5 / 30) * 30, 6)
  })

  it('잇기 — 같은 묶음 번호의 모델은 한 볼이고 뒤 계획은 그 시작만큼 민다', () => {
    const shake: SeqData = { name: 'ee102', groups: [{ name: 'ball', no: 12, options: [], commands: [
      c(0, 0, 'DprModelAnimationPlayIndex', { index: ['8'], startTime: ['0.5'] }),
    ] }] }
    const chain = chainPlans('cap', [[plan, 0], [planSequence(shake), 100]])
    expect(chain.models.length).toBe(1)
    const pose = modelAt(chain, 12, 101, mctx)!
    expect(pose.clip).toEqual({ index: 8, time: 0.5 + 1 / 30, loop: false })
    expect(pose.pos[1]).toBeCloseTo(0.05, 6)
  })
})

describe('내보내기 · 대상 잇기 · 다른 몸 감추기', () => {
  const SEND: SeqData = { name: 'ee400', groups: [
    { name: '身', no: 0, options: [[14, 120]], commands: [
      c(26, 26, 'PokemonMovePosition', { pos: ['0', '160', '0'], relative: ['1'], trg: ['3'], enableElem: ['0', '1', '0'] }),
      c(26, 26, 'PokemonVisible', { trg: ['4'], visible: ['0'] }),
    ] },
    { name: '着地', no: 10, options: [[14, 120]], commands: [c(41, 41, 'PokemonIntroMotion', { height: ['160'], trg: ['3'] })] },
    { name: '浮く', no: 10, options: [[14, 121]], commands: [c(41, 41, 'PokemonIntroMotion', { height: ['0'], trg: ['3'] })] },
    { name: 'cam', no: 0, options: [], commands: [
      c(0, 0, 'CameraTwist', { twist: ['4'] }),
      c(0, 25, 'DprCameraMoveRelativeTrainer', { node: ['1'] }),
      c(26, 26, 'CameraMoveRelativePoke', { poke: ['3'], node: ['0'], pos: ['400', '160', '-580'], trg: ['0', '160', '0'], rate: ['100'], fov: ['20'] }),
    ] },
  ] }

  it('3 → 이 몸(1)으로 잇고, 모르는 대상(4)을 겨눈 명령은 버린다 · 착지 갈래 옵션으로 고른다', () => {
    const plan = planSequence(SEND, { targets: { 3: 1 }, options: { 14: 120 }, hideTarget: true })
    expect(plan.body[1].commands.map((x) => x.name)).toEqual(['PokemonMovePosition', 'PokemonIntroMotion'])
    expect(plan.body[0].commands).toEqual([])
    // 트레이너 컷 안의 굴림은 그 컷 몫이라 버리고, 그 뒤 몸 기준 컷은 받는다
    expect(plan.camera.map((x) => x.name)).toEqual(['CameraMoveRelativePoke'])
    expect(planSequence(SEND, { targets: { 3: 1 }, options: { 14: 121 } }).body[1].commands.at(-1)!.values.height).toEqual(['0'])
  })

  it('cameraFlipZ — 세계축 몸 기준 카메라가 몸 뒤(내 쪽 끝)에 선다 · isRot 카메라는 그대로', () => {
    const base = { pos: [2.7, 1.5, 5] as V3, target: [0, 0.05, 0] as V3, fov: 30, roll: 0 }
    const cctx = { ...ctx, scale: () => 1 }
    const mon = ctx.anchor(1, 0)!.pos
    const plain = planSequence(SEND, { targets: { 3: 1 }, options: { 14: 120 }, camera: true })
    const flipped = planSequence(SEND, { targets: { 3: 1 }, options: { 14: 120 }, cameraFlipZ: true })
    // 상대 몸(역할 1 = z −2.2)을 쓰는 이 시험의 맞춤 맥락에서, 뒤집기 전은 몸의 앞(−Z 쪽)이고 뒤집으면 몸의 뒤(+Z 쪽)다
    expect(cameraAt(plain, 26, cctx, base)!.pos[2] - mon[2]).toBeCloseTo(-5.8, 6)
    expect(cameraAt(flipped, 26, cctx, base)!.pos[2] - mon[2]).toBeCloseTo(5.8, 6)
    // 가로 · 높이는 그대로
    expect(cameraAt(flipped, 26, cctx, base)!.pos[0]).toBeCloseTo(cameraAt(plain, 26, cctx, base)!.pos[0], 6)
    expect(cameraAt(flipped, 26, cctx, base)!.pos[1]).toBeCloseTo(cameraAt(plain, 26, cctx, base)!.pos[1], 6)
  })

  it('나타나기 전에는 몸이 없고, 나타나면 빛 속에 자라나며 1.6m에서 내려와 착지 동작으로 잇는다', () => {
    const plan = planSequence(SEND, { targets: { 3: 1 }, options: { 14: 120 }, shaderBase: 1 })
    const before = bodyAt(plan, 1, 30, ctx)
    expect(before.visible).toBe(false)
    expect(before.offset).toEqual([0, 0, 0])
    const appear = bodyAt(plan, 1, 41, ctx)
    expect(appear.visible).toBe(true)
    expect(appear.scale[0]).toBeLessThan(0.01)
    expect(appear.offset[1]).toBeCloseTo(1.6, 6)
    expect(appear.glow!.power).toBeCloseTo(10, 6)
    expect(appear.motion).toEqual({ name: 'landB', at: 41 })
    const land = bodyAt(plan, 1, 41 + INTRO_FALL, ctx)
    expect(land.offset).toEqual([0, 0, 0])
    expect(land.motion).toEqual({ name: 'landC', at: 41 + INTRO_FALL })
    expect(land.glow).toBeNull()
  })

  it('앞을 잘라 낸다 — 그 앞에서 정한 상태는 0프레임에 선다', () => {
    const plan = planSequence(SEND, { targets: { 3: 1 }, options: { 14: 120 }, startAt: 14 })
    expect(plan.body[1].commands.find((x) => x.name === 'PokemonIntroMotion')!.start).toBe(27)
  })

  it('다른 몸 감추기는 VisibleAll 전까지', () => {
    const seq: SeqData = { name: 'ee620', groups: [{ name: 'o', no: 0, options: [], commands: [
      c(0, 0, 'PokemonVisibleOther', { visible: ['0'] }), c(60, 60, 'PokemonVisibleAll', { visible: ['1'] }),
    ] }] }
    const plan = planSequence(seq)
    expect(othersHidden(plan, 10)).toBe(true)
    expect(othersHidden(plan, 61)).toBe(false)
  })

  it('쓰러짐 동작(17)과 동작 멈춤', () => {
    const seq: SeqData = { name: 'ee620', groups: [{ name: 'b', no: 0, options: [], commands: [
      c(0, 0, 'PokemonMotion', { motion: ['17'], trg: ['1'] }), c(39, 39, 'PokemonSetMotionSpeed', { speed: ['0'], trg: ['1'] }),
    ] }] }
    const plan = planSequence(seq)
    expect(bodyAt(plan, 1, 10, ctx).motion).toEqual({ name: 'down', at: 0 })
    expect(bodyAt(plan, 1, 40, ctx).motionSpeed).toBe(0)
  })
})

describe('시퀀스 카메라 — 자리만 · 길 따라 보기 · 구운 애니메이션 대신', () => {
  const base = { pos: [2.7, 1.5, 5] as V3, target: [0, 0.05, 0] as V3, fov: 30, roll: 0 }
  const cctx = { ...ctx, scale: () => 1, world: (cm: V3): V3 => [-cm[0] / 100, cm[1] / 100, -2.2 + cm[2] / 100] }

  it('DprCameraMovePosition은 자리만, DprCameraLookAtPath는 p0에서 p1로 보는 곳을 옮긴다', () => {
    const seq: SeqData = { name: 'ee101', groups: [{ name: 'c', no: 0, options: [], commands: [
      c(56, 56, 'CameraMovePosition', { pos: ['30', '30', '180'], trg: ['0', '0', '0'], relative: ['0'], fov: ['20'] }),
      c(56, 66, 'DprCameraLookAtPath', { p0: ['0', '28', '0'], p1: ['0', '6', '0'] }),
      c(57, 67, 'DprCameraMovePosition', { pos: ['-30', '10', '180'], relative: ['0'] }),
    ] }] }
    const plan = planSequence(seq)
    const at56 = cameraAt(plan, 56, cctx, base)!
    expect(at56.target[1]).toBeCloseTo(0.28, 6)
    expect(at56.fov).toBe(20)
    const at67 = cameraAt(plan, 67, cctx, base)!
    expect(at67.target[1]).toBeCloseTo(0.06, 6)
    expect(at67.pos[0]).toBeCloseTo(0.3, 6)
    expect(at67.pos[1]).toBeCloseTo(0.1, 6)
    expect(at67.pos[2]).toBeCloseTo(-2.2 + 1.8, 6)
  })

  it('CameraAnimationPoke 자리에는 뒤따르는 몸 기준 카메라의 0.6배 거리 컷이 선다', () => {
    const seq: SeqData = { name: 'ee106', groups: [
      { name: 'cam', no: 11, options: [], commands: [c(0, 0, 'CameraAnimationPoke', { anmFile: ['x'] })] },
      { name: 'cam', no: 11, options: [], commands: [
        c(4, 64, 'CameraMoveRelativePoke', { poke: ['1'], node: ['15'], pos: ['300', '50', '300'], trg: ['0', '0', '0'], isRot: ['1'], rate: ['100'], fov: ['35'], move: ['0'] }),
      ] },
    ] }
    const plan = planSequence(seq)
    const at0 = cameraAt(plan, 0, cctx, base)!
    const at64 = cameraAt(plan, 64, cctx, base)!
    const d = (cam: { pos: V3, target: V3 }): number => Math.hypot(cam.pos[0] - cam.target[0], cam.pos[2] - cam.target[2])
    expect(d(at0) / d(at64)).toBeCloseTo(0.6, 6)
  })
})

describe('쌍 내보내기 — 역할 · 볼 · 맞은편 감추기 · 두 발판', () => {
  // `ee404`를 줄인 것 — 3 · 5가 내 쪽 첫째 · 둘째, 4 · 6이 상대. 볼 묶음 5(첫째) · 15(둘째)
  const PAIR: SeqData = { name: 'ee404', groups: [
    { name: 'vis', no: 0, options: [], commands: [
      c(51, 51, 'PokemonVisible', { trg: ['4'], visible: ['0'] }), c(51, 51, 'PokemonVisible', { trg: ['6'], visible: ['0'] }),
      c(116, 116, 'PokemonVisible', { trg: ['4'], visible: ['1'] }),
    ] },
    { name: 'a', no: 10, options: [[14, 120]], commands: [c(65, 65, 'PokemonIntroMotion', { trg: ['3'], height: ['160'] })] },
    { name: 'b', no: 11, options: [[14, 129]], commands: [c(68, 68, 'PokemonIntroMotion', { trg: ['5'], height: ['0'] })] },
    { name: 'b-other', no: 11, options: [[14, 128]], commands: [c(68, 68, 'PokemonIntroMotion', { trg: ['5'], height: ['160'] })] },
    { name: 'ball1', no: 5, options: [[14, 120]], commands: [
      c(0, 0, 'DprModelAttachTrainer', { trg: ['0'], isEnable: ['1'] }), c(51, 51, 'DprModelAttachTrainer', { trg: ['0'], isEnable: ['0'] }),
      c(52, 59, 'ModelMoveRelativePoke', { trg: ['3'], node: ['15'], pos: ['0', '0', '0'], rate: ['100'], enableElem: ['1', '1', '1'] }),
    ] },
    { name: 'ball2', no: 15, options: [[14, 129]], commands: [
      c(0, 0, 'DprModelAttachTrainer', { trg: ['0'], isEnable: ['1'] }), c(51, 51, 'DprModelAttachTrainer', { trg: ['0'], isEnable: ['0'] }),
      c(52, 59, 'ModelMoveRelativePoke', { trg: ['5'], node: ['15'], pos: ['0', '0', '0'], rate: ['100'], enableElem: ['1', '1', '1'] }),
    ] },
    { name: 'fx', no: 51, options: [], commands: [c(67, 87, 'DprParticleCreateSeal', { index: ['1'], grpNo: ['15'], trg: ['5'] })] },
    { name: 'fx', no: 50, options: [], commands: [c(64, 84, 'DprParticleCreateSeal', { index: ['0'], grpNo: ['5'], trg: ['3'] })] },
  ] }
  const opts = { targets: { 3: 0, 5: 1 } as const, away: [4, 6], ball: 4, ballSecond: 1, options: { 14: [120, 129] } }

  it('대상 3 · 5가 역할 0 · 1(첫째 · 둘째)이다 — 첫째는 f65 · 둘째는 f68에 나타난다', () => {
    const plan = planSequence(PAIR, opts)
    expect(plan.body[0].commands.map((x) => x.start)).toEqual([65])
    expect(plan.body[1].commands.map((x) => x.start)).toEqual([68])
    // 둘째의 갈래는 둘째 몸 종류(129)로 고른다 — 128 갈래(height 160)가 아니다
    expect(plan.body[1].commands[0]!.values.height).toEqual(['0'])
  })

  it('볼 모델 둘 — 묶음 5는 첫째 볼 · 묶음 15는 둘째 볼(ModelTrack.ball) · 빛도 갈린다', () => {
    const plan = planSequence(PAIR, opts)
    expect(plan.models.map((m) => [m.no, m.ball])).toEqual([[5, undefined], [15, 1]])
    expect(plan.particles.map((p) => p.prefab)).toEqual(['eb001_ballout', 'eb004_ballout'])
  })

  it('두 볼이 각자 제 몸 로케이터로 놓인다 (ModelMoveRelativePoke trg 3 → 역할 0 · 5 → 역할 1)', () => {
    const plan = planSequence(PAIR, opts)
    const spot = (r: number): V3 => [r === 0 ? 0.5 : -0.5, 0, 4]
    const pctx: SeqContext = {
      ...ctx, trainer: () => [0, 0, 20],
      rest: (role) => ({ pos: spot(role), yaw: Math.PI }),
    }
    expect(modelAt(plan, 5, 60, pctx)!.pos[0]).toBeCloseTo(0.5, 6)
    expect(modelAt(plan, 15, 60, pctx)!.pos[0]).toBeCloseTo(-0.5, 6)
  })

  it('맞은편(4 · 6)은 역할 없이 away로만 받고 f51~116 감춘다', () => {
    const plan = planSequence(PAIR, opts)
    expect(plan.away.length).toBe(3)
    expect(awayHidden(plan, 50)).toBe(false)
    expect(awayHidden(plan, 60)).toBe(true)
    expect(awayHidden(plan, 120)).toBe(false)
    expect(plan.body[0].commands.some((x) => x.name === 'PokemonVisible')).toBe(false)
  })

  it('worldPair — 옆은 두 발판 사이로, 깊이는 BDSP 그대로', () => {
    const A: [number, number] = [-0.4, 2.0], B: [number, number] = [0.5, 2.4]
    const w = worldPair(A, B, -250, 250)
    expect(w([-250, 160, 250])).toEqual([-0.4, 1.6, 2.0])
    expect(w([250, 0, 250])[0]).toBeCloseTo(0.5, 6)
    expect(w([250, 0, 250])[2]).toBeCloseTo(2.4, 6)
    const mid = w([0, 180, -190])
    expect(mid[0]).toBeCloseTo(0.05, 6)
    expect(mid[1]).toBeCloseTo(1.8, 6)
    expect(mid[2]).toBeCloseTo(2.2 + (-190 - 250) / 100, 6)
  })
})
