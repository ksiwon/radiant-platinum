// 볼 · 내보내기 · 거두기 · 기절 — BDSP 시퀀스를 판에 맞춰 편다 (BATTLE_FX §4 · PARITY §2.13).
//
// 어느 시퀀스를 어떤 옵션으로 트는지가 여기 한 자리에 있다. 무대(`scene/battle/BattleBallEffects`)는 여기서 받은
// 계획을 틀기만 하고, 박자(`captureTiming`)는 같은 계획에서 잰 프레임을 상수로 든다(시험이 둘을 맞대 본다).
//
//   내보내기  내 쪽 `ee400` · 상대 `ee406` (트레이너가 볼을 던지는 몸짓 앞부분은 잘라 낸다 — `throwStart`)
//   포획      `ee101`(던지기 · 빨아들이기 · 떨어짐) → `ee102~104`(흔들림 하나씩) → `ee105`(성공) / `ee106~109`(흔들림 0~3번 뒤 튀어나옴)
//   거두기    `ee610` — 서 있던 마리를 바꿔 낼 때
//   기절      트레이너의 포켓몬 `ee620`(볼로 돌아간다) · 야생 `ee621`(쓰러져 사라진다)
import { THROW_FRAMES, chainPlans, planSequence, seqLength, type PlanOptions, type SeqData, type SeqPlan } from './sequence'

/** 볼 모델 표 (`data/fx/index.json`의 `ballModel` — `import/bdsp/fx.ts`의 `BallModelTable`) */
export interface BallMeta {
  clips: readonly (string | null)[]
  seconds: readonly (number | null)[]
  locators: readonly string[]
  particles: readonly string[]
}

/** 볼 · 기절 시퀀스가 함께 쓰는 옵션 — 맞는 쪽이 정말 사라지고, 몸 빛의 「제 색」이 1이다 */
function common(ball: number, meta: BallMeta | null): PlanOptions {
  return {
    ball,
    hideTarget: true,
    shaderBase: 1,
    scaleParticles: true,
    cameraAtRest: true,
    ballParticles: meta?.particles ?? [],
    clipSeconds: meta?.seconds ?? [],
  }
}

/**
 * 볼이 트레이너 손을 떠나는 프레임의 `THROW_FRAMES` 앞 — 그 앞은 배틀에 서지 않는 트레이너의 몸짓이라 잘라 낸다.
 * 손에 든 볼이 없는 시퀀스면 0
 */
export function throwStart(seq: SeqData, opts: PlanOptions): number {
  const plan = planSequence(seq, { ...opts, startAt: 0 })
  let off = Infinity
  for (const m of plan.models) {
    let held = false
    for (const c of m.commands) {
      if (c.name !== 'DprModelAttachTrainer') continue
      const on = Number(c.values.isEnable?.[0] ?? '1') === 1
      if (held && !on) off = Math.min(off, c.start)
      held = on
    }
  }
  return Number.isFinite(off) ? Math.max(0, off - THROW_FRAMES) : 0
}

/** 내보내기에 쓰는 시퀀스 이름 — 내 쪽 `ee400` · 상대 쪽 `ee406`(트레이너가 하나를 던진다) */
export function sendOutSeqName(side: 'p1' | 'p2'): string {
  return side === 'p1' ? 'ee400' : 'ee406'
}

/**
 * 내보내기.
 *
 * - 대상은 내 쪽 첫째(3) / 상대 첫째(4)를 이 자리 몸(역할 1)으로, 맞은편 첫째를 역할 0으로 잇는다. 그 밖의 몸(더블 둘째)을
 *   겨눈 명령은 버린다
 * - 카메라: 트레이너 어깨 너머 컷(f0~25)은 버리고(사람이 안 선다) 볼이 손을 떠난 뒤의 컷 — 몸 옆에서 1.6m 위에 열리는 볼을
 *   올려다보고, 떨어지는 몸을 따라 내려오고, 착지한 몸 앞으로 다가가는 것 — 은 받는다. 볼이 열리는 자리가 몸 위 1.6m라
 *   고정 카메라에서는 화면 위로 벗어난다(실측). 더블은 시퀀스가 따로라(`ee401` · `ee404` …) 고정 카메라에 둔다
 * - 착지 갈래 `GroupOption 14` = 120 + `MoveType`(`import/bdsp/fx.ts`의 `moveTypes`) · 싱글/더블 `12` = 100/101
 */
export function sendOutPlan(seq: SeqData, o: {
  side: 'p1' | 'p2'; ball: number; moveType: number; doubles: boolean; meta: BallMeta | null
}): SeqPlan {
  const opts: PlanOptions = {
    ...common(o.ball, o.meta),
    attackerMine: o.side === 'p1',
    // 내 쪽 내보내기는 카메라가 상대 쪽에서 내 몸을 보므로 그 사이에 선 상대를 감춘다(`ee400` `PokemonVisible trg=4` f26~110) —
    // 감추지 않으면 상대 몸이 화면을 가린다(실측). 상대 쪽(`ee406`)은 감추는 명령이 없다. 카메라가 없는 더블은 안 감춘다
    targets: o.side === 'p1' ? (o.doubles ? { 3: 1 } : { 3: 1, 4: 0 }) : { 4: 1 },
    options: { 14: 120 + Math.max(0, Math.min(2, o.moveType)), 12: o.doubles ? 101 : 100 },
    camera: !o.doubles,
  }
  return planSequence(seq, { ...opts, startAt: throwStart(seq, opts) })
}

/** 내보내기 시퀀스가 BDSP 무대에서 기준으로 삼는 몸 자리(cm) — 내 쪽 첫째 0/0/250 · 상대 첫째 0/0/−250 (`ee400` · `ee406`의 볼 자리) */
export function sendOutHome(side: 'p1' | 'p2'): [number, number, number] {
  return side === 'p1' ? [0, 0, 250] : [0, 0, -250]
}

/** 포획 한 벌 — 계획과 박자 */
export interface CapturePlan {
  plan: SeqPlan
  /** 흔들림이 다 끝나고 결과 시퀀스가 서는 프레임 */
  resultAt: number
  /** 결과 글이 뜨는 프레임 (결과 시퀀스의 `MessageDispStd`) */
  messageAt: number
  /** 연출이 다 서는 프레임 */
  length: number
}

/** 흔들림 수 (보이는 것) — 잡히면 셋, 놓치면 `shakes`(0~3) */
export function wobblesOf(shakes: number, caught: boolean): number {
  return caught ? 3 : Math.max(0, Math.min(3, shakes))
}

/** 포획에 쓰는 시퀀스 이름들 (차례대로) */
export function captureSeqNames(shakes: number, caught: boolean): string[] {
  const w = wobblesOf(shakes, caught)
  const names = ['ee101']
  for (let i = 0; i < w; i++) names.push(`ee10${String(2 + i)}`)
  names.push(caught ? 'ee105' : `ee10${String(6 + w)}`)
  return names
}

/**
 * 포획 — 던지기부터 결과까지 **한 계획**으로 잇는다(`chainPlans`). 볼 · 카메라가 시퀀스 사이에서 끊기지 않는다.
 * 대상은 0 쓴 쪽(던진 사람 쪽) · 1 맞는 쪽(잡히는 몸)이고 그 밖의 대상(내 쪽 둘째 등)을 겨눈 명령은 버린다
 */
export function capturePlan(seqs: Readonly<Record<string, SeqData>>, o: {
  ball: number; shakes: number; caught: boolean; meta: BallMeta | null
}): CapturePlan | null {
  const names = captureSeqNames(o.shakes, o.caught)
  const parts: [SeqPlan, number][] = []
  let at = 0
  let resultAt = 0
  let messageAt = 0
  for (const [i, name] of names.entries()) {
    const seq = seqs[name]
    if (!seq) return null
    const opts: PlanOptions = { ...common(o.ball, o.meta), attackerMine: true, targets: { 0: 0, 1: 1 } }
    const plan = planSequence(seq, i === 0 ? { ...opts, startAt: throwStart(seq, opts) } : opts)
    if (i === names.length - 1) {
      resultAt = at
      messageAt = at + (plan.message ?? 0)
    }
    parts.push([plan, at])
    at += seqLength(plan)
  }
  const plan = chainPlans(`capture:${names.join('+')}`, parts)
  return { plan, resultAt, messageAt, length: at }
}

/** 기절 시퀀스 이름 — 트레이너의 포켓몬(내 것 포함)은 볼로 돌아가고(`ee620`) 야생은 쓰러져 사라진다(`ee621`) */
export function faintSeqName(wild: boolean): string {
  return wild ? 'ee621' : 'ee620'
}

/**
 * 기절 · 거두기. 카메라 갈래 `GroupOption 15`는 그 몸이 내 쪽이면 131 · 상대면 130이다 — 둘 다 그 몸의 오른쪽 앞에서
 * 보는데(`isRot`) 내 쪽 몸은 −Z를 보므로 `pos.x` 부호가 반대여야 기본 카메라와 같은 쪽(+X)에 선다(짐작 — 화면으로 맞췄다)
 *
 * @param camera 거두기(`ee610`)는 교체 한가운데라 카메라를 안 받는다(내보내기와 같은 까닭)
 */
export function returnPlan(seq: SeqData, o: { mine: boolean; camera: boolean }): SeqPlan {
  return planSequence(seq, {
    ...common(4, null),
    attackerMine: o.mine,
    targets: { 0: 0, 1: 1 },
    options: { 15: o.mine ? 131 : 130 },
    camera: o.camera,
  })
}

/** 몸이 사라지는 프레임 — 맞는 쪽 `PokemonVisible visible=0`. 없으면 계획의 끝 */
export function vanishFrame(plan: SeqPlan): number {
  const c = plan.body[1].commands.find((x) => x.name === 'PokemonVisible' && Number(x.values.visible?.[0] ?? '1') !== 1)
  return c ? c.start : plan.frames
}

/** 몸이 나타나는 프레임 — `PokemonIntroMotion`. 없으면 0 */
export function introFrame(plan: SeqPlan): number {
  return plan.body[1].commands.find((x) => x.name === 'PokemonIntroMotion')?.start ?? 0
}
