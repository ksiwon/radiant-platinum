// BDSP 연출 시퀀스 한 번 — 입자 칸마다 이펙트를 세우고, 시퀀스 모델(볼)을 그리고, 몸 · 화면 · 배경에 거는 것을
// `stageRefs.seqStage`에 적는다 (BATTLE_FX §4).
//
// 시계는 연출 시계다: 시작 시각(`startedAt`, 초)에서 지금까지를 30fps 프레임으로 센다.
// 입자 칸은 **처음부터 다 세워 둔다**(그래서 프리팹을 미리 받는다) — 제 시작 프레임 전에는
// 이펙트 시계가 0에 서 있어 아무것도 안 뿜는다(`BdspEffect`의 `clock`).
//
// ⚠️ **볼의 클립도 연출 시계로 맞춘다.** 믹서를 흘리지 않고 프레임마다 시퀀스가 접은 시각(`modelAt`의 `clip.time`)을
// 그대로 꽂는다 — 가상 시계(`tools/reels`)로 찍어도 · 되감아도 같은 자세다.
//
// ⚠️ **몸에 거는 것은 이 시퀀스가 도는 동안만 무대가 읽는다.** 끝나면 제가 건 것만 놓는다(`releaseSeq`) —
// 안 비우면 다음 턴까지 몸이 상대 앞에 서 있다. 여럿이 같이 돌 수 있다(더블 첫 등판 · 기술 중 기절).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AnimationMixer, LoopOnce, LoopRepeat, Vector3, type AnimationAction, type Group, type Object3D } from 'three'
import { battleClock } from '../../../engine/battle/presentationClock'
import {
  awayHidden, backAt, bodyAt, cameraAt, modelAt, othersHidden, particleAt, planFrames, shakeAt, SEQ_FPS,
  touchesTarget, type Role, type SeqCamera, type SeqContext, type SeqPlan, type V3,
} from '../../../engine/battle/fx/sequence'
import { claimSeq, releaseSeq, seqStage, tallOf } from '../stageRefs'
import { trainerThrowOrigin } from '../battleBallMotion'
import { BdspEffect } from './BdspEffect'
import { cloneBall, loadBallModel, type BallModel } from './ballModel'
import { mergePose, roleContext } from './seqContext'

/** 마지막 명령 뒤로 입자가 사그라지기를 기다리는 위끝 (초) */
const TAIL = 1.5

const ignoredSeen = new Set<string>()

/** 개발 진단 손잡이 `window.__fxSeq`가 읽을 때 부르는 것 (개발 서버에서만 채워진다) */
let probe: (() => unknown) | null = null
function installProbe(w: object): void {
  if (Object.getOwnPropertyDescriptor(w, '__fxSeq')?.get) return
  Object.defineProperty(w, '__fxSeq', { configurable: true, get: () => probe?.() })
}

/** 무대에 선 시퀀스 모델 — 로케이터를 이름으로 찾는다 */
interface LiveModel {
  root: Object3D
  nodes: Map<string, Object3D>
}

const tmpA = new Vector3()
const tmpB = new Vector3()

export function BdspSequence({
  plan, roles, spotAt, startedAt, vanish = false, onDone, ball, world, camera = true, hideOthers = false,
  bodies = [true, true], others = [], away: awaySlots = [], reactors = [], ballScale = 1, minScale = 0.6,
}: {
  plan: SeqPlan
  /** 0 쓴 쪽 · 1 맞는 쪽 자리. 쓴 쪽이 없는 시퀀스(내보내기 · 기절)는 0이 `null`이어도 된다 */
  roles: readonly [string | null, string | null]
  spotAt: (slot: string) => [number, number]
  /** 연출 시계에서 시작한 시각 (초) */
  startedAt: number
  /**
   * 쓴 쪽 감추기(`PokemonVisible trg=0`)를 따르는가. ⚠️ BDSP는 카메라가 몸을 지나갈 때도 그 몸을
   * 감춘다(실측: 챔피언전 토대부기가 제 기술 내내 사라졌다). 기술은 **정말 사라지는 것**(공중날기 · 구멍파기 —
   * DS 대본의 `vanish`)일 때만 따른다. 볼 · 기절 시퀀스는 몸이 정말 볼에 들어가므로 따른다
   */
  vanish?: boolean
  onDone?: () => void
  /** 시퀀스 모델(`ModelCreateBall` …)로 세울 볼 번호. 없으면 볼을 안 그린다 */
  ball?: number
  /** BDSP 절대 자리 → 무대 좌표 (`SeqContext.world`) */
  world?: (cm: V3) => V3
  /** 시퀀스 카메라를 쓰는가 (기본 참) */
  camera?: boolean
  /** `PokemonVisibleOther`를 따르는가 — 시퀀스 카메라가 선 동안만 다른 몸(`others`)을 감춘다 */
  hideOthers?: boolean
  /** 역할마다 몸 값을 무대에 거는가 — 볼 시퀀스는 맞는 쪽만 건다(다른 몸의 제 동작을 안 끊는다) */
  bodies?: readonly [boolean, boolean]
  /** 감출 수 있는 다른 자리들 */
  others?: readonly string[]
  /**
   * 범위 기술에서 `roles[1]` 말고 같이 맞은 자리들. 시퀀스는 한 번만 돌고 맞는 쪽 명령(`trg=1`)은 한 몸만 겨누므로, 이 자리들에는
   * 맞는 쪽의 **몸 반응**(피격 동작 · 떨림 · 밀림 · 감추기)과 **맞는 쪽에 붙는 입자**(맞은 표시 · 기술 입자)를 한 벌씩 더 건다.
   * 쓴 쪽에만 붙는 입자 · 카메라 · 체력은 그대로다 (체력은 박자가 맞은 자리마다 따로 깎는다)
   */
  reactors?: readonly string[]
  /** 계획의 `away`(역할 없는 대상의 감추기)가 감추는 자리들 — 시퀀스 카메라가 선 동안만 (더블 내보내기의 맞은편 둘) */
  away?: readonly string[]
  /** 볼 모델 배율 — BDSP 실제 크기가 1 */
  ballScale?: number
  /**
   * 몸 크기 배율(`isScale`)의 아래끝. 기술은 0.6(작은 몸 앞으로 카메라가 다가간다). 볼 · 기절 시퀀스는 1이다 — 그 카메라는
   * 볼과 빛을 담는 자리라 작은 몸(비버니 0.5m)에 맞춰 당기면 볼이 화면 위로 빠지고 빛 고리가 화면을 덮는다(실측)
   */
  minScale?: number
}) {
  const owner = useMemo(() => Symbol(plan.name), [plan])
  const live = useRef(new Map<number, LiveModel>())
  const ctx = useRef<SeqContext>(null as unknown as SeqContext)
  ctx.current ??= {
    ...roleContext(roles, spotAt, (slot) => (seqStage.bodyOwner[slot] === owner ? seqStage.body[slot]?.offset : undefined)),
    world,
    scale: (role: Role) => bodyScale(roles[role] ?? null, minScale),
    trainer: (id: number) => [...trainerThrowOrigin(id % 2 === 0 ? 'p1a' : 'p2a')] as V3,
    modelNode: (no: number, node: number | string, f: number) => {
      const pose = modelAt(plan, no, f, ctx.current)
      if (!pose) return null
      const m = live.current.get(no)
      const name = typeof node === 'string' ? node : ballNodeName(m, node)
      const hit = m && name ? m.nodes.get(name) ?? null : null
      if (!m || !hit) return pose.pos
      // 뿌리 자리는 그 프레임의 접은 값 · 뿌리에서 노드까지는 지금 클립 자세 그대로 — 클립이 노드를 옮긴다(떨어짐 · 흔들림)
      hit.getWorldPosition(tmpA)
      m.root.getWorldPosition(tmpB)
      return [pose.pos[0] + tmpA.x - tmpB.x, pose.pos[1] + tmpA.y - tmpB.y, pose.pos[2] + tmpA.z - tmpB.z]
    },
  }
  // 같이 맞은 자리마다 따로 읽는 맥락 — 역할 1이 그 자리다
  const reactorKey = reactors.join(',')
  const extra = useMemo(() => reactors.map((slot) => {
    const rs: readonly [string | null, string | null] = [roles[0], slot]
    const c: SeqContext = {
      ...ctx.current,
      ...roleContext(rs, spotAt, (s) => (seqStage.bodyOwner[s] === owner ? seqStage.body[s]?.offset : undefined)),
      scale: (role: Role) => bodyScale(rs[role] ?? null, minScale),
    }
    return { slot, ctx: c }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 한 시퀀스 안에서 자리가 안 바뀐다
  }), [reactorKey, owner])
  // 카메라는 무대(`BattleStage`의 `useBattleCamera`)가 제 기본 카메라를 넘겨 부른다 — 그 프레임 시각으로 다시 접는다
  const cameraFn = useMemo(() => (base: SeqCamera): SeqCamera | null => {
    const f = (battleClock.now() - startedAt) * SEQ_FPS
    return cameraAt(plan, f, { ...ctx.current, scale: (role: Role) => bodyScale(roles[role] ?? null, minScale) }, base)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 한 시퀀스 안에서 안 바뀐다
  }, [plan, startedAt])
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
  const ended = useRef(false)
  const released = useRef(false)
  /** 칸마다 살아 있는 입자 수 (진단) */
  const alive = useRef<Record<string, number>>({})
  /** 볼 번호 → 모델. 모델마다 볼이 다를 수 있다(더블 내보내기 — `ModelTrack.ball`) */
  const [models, setModels] = useState<ReadonlyMap<number, BallModel>>(new Map())

  useEffect(() => {
    // 진단 알림 — 개발 서버에서만. 설치본(제품)의 콘솔에는 안 낸다
    if (!import.meta.env.DEV) return
    for (const n of plan.ignored) {
      if (ignoredSeen.has(n)) continue
      ignoredSeen.add(n)
      console.info(`[fx] 시퀀스 명령 ${n}은 아직 안 옮겼다 (처음 본 시퀀스 ${plan.name})`)
    }
  }, [plan])

  useEffect(() => {
    if (ball === undefined || !plan.models.some((m) => m.kind === 'ball')) return undefined
    let ok = true
    const wanted = [...new Set(plan.models.filter((m) => m.kind === 'ball').map((m) => m.ball ?? ball))]
    void Promise.all(wanted.map(async (b) => [b, await loadBallModel(b)] as const)).then((got) => {
      if (!ok) return
      const next = new Map<number, BallModel>()
      for (const [b, m] of got) if (m) next.set(b, m)
      setModels(next)
    })
    return () => { ok = false }
  }, [ball, plan])

  useEffect(() => {
    claimSeq(owner)
    return () => { releaseSeq(owner) }
  }, [owner])

  const usesCamera = camera && plan.camera.length > 0
  const ownsScreen = usesCamera || plan.shakes.length > 0 || plan.back.length > 0

  useFrame(() => {
    const f = (battleClock.now() - startedAt) * SEQ_FPS
    if (import.meta.env.DEV) {
      // 진단 손잡이 — 개발 서버에서만. `__fxSeq`는 **읽을 때** 지금 프레임의 입자 칸 자세를 접는다(프레임마다 모든 입자를
      // 접지 않는다). 가장 늦게 그린 시퀀스의 것이다
      const w = window as unknown as { __fxSeq?: unknown; __fxSeqs?: Record<string, unknown> }
      installProbe(w)
      probe = () => ({
        name: plan.name, f, alive: { ...alive.current }, poses: plan.particles.map((p) => ({ prefab: p.prefab, ...particleAt(p, f, ctx.current) })),
      })
      // 시퀀스마다 시작 시각 — 찍는 도구가 시계를 그 프레임에 맞춘다
      ;(w.__fxSeqs ??= {})[plan.name] = { startedAt, frames: planFrames(plan), slot: roles[1], cams: plan.camera.length, usesCamera, owner: seqStage.owner === owner }
    }
    if (f < 0) return
    const last = planFrames(plan)
    if (f <= last) {
      // ⚠️ **제 몸에 거는 기술(쓴 쪽 = 맞는 쪽)은 두 역할의 값을 합친다.** 역할마다 따로 적으면 맞는 쪽 값이 쓴 쪽 값을 덮어
      // 쓴 쪽 동작 · 나감이 통째로 지워졌다
      const written = new Map<string, ReturnType<typeof bodyAt>>()
      for (const role of [0, 1] as const) {
        const slot = roles[role]
        if (!slot || !bodies[role]) continue
        const pose = bodyAt(plan, role, f, ctx.current)
        if (!vanish) pose.visible = true
        const was = written.get(slot)
        written.set(slot, was ? mergePose(was, pose) : pose)
      }
      // 같이 맞은 자리 — 맞는 쪽(역할 1)의 몸 반응을 그 몸 기준으로 다시 접는다
      for (const r of extra) {
        if (!bodies[1]) continue
        const pose = bodyAt(plan, 1, f, r.ctx)
        if (!vanish) pose.visible = true
        const was = written.get(r.slot)
        written.set(r.slot, was ? mergePose(was, pose) : pose)
      }
      for (const [slot, pose] of written) {
        seqStage.body[slot] = { ...pose, frame: f }
        seqStage.bodyOwner[slot] = owner
      }
      const camNow = usesCamera ? cameraFn({ pos: [0, 0, 0], target: [0, 0, 1], fov: 30, roll: 0 }) !== null : false
      const hide = hideOthers && camNow && othersHidden(plan, f)
      for (const slot of others) {
        if (slot === roles[1]) continue
        if (hide) seqStage.hide[slot] = owner
        else if (seqStage.hide[slot] === owner) delete seqStage.hide[slot]
      }
      // 역할 없는 대상의 감추기 — 시퀀스 카메라가 서 있는 동안만 (카메라가 지나는 맞은편 몸)
      const away = camNow && awayHidden(plan, f)
      for (const slot of awaySlots) {
        if (away) seqStage.hide[slot] = owner
        else if (seqStage.hide[slot] === owner) delete seqStage.hide[slot]
      }
      if (ownsScreen) {
        seqStage.owner = owner
        seqStage.shake = shakeAt(plan, f)
        seqStage.camera = usesCamera ? cameraFn : null
        seqStage.back = backAt(plan, f)
      }
    } else if (!released.current) {
      // 명령이 다 끝났다 — 몸 · 화면은 놓고 입자 · 볼만 남긴다
      released.current = true
      releaseSeq(owner)
    }
    // 지운 칸
    const remove = plan.particles.filter((p) => p.remove !== null && f >= p.remove && !gone.has(p.key))
    if (remove.length > 0) setGone((g) => new Set([...g, ...remove.map((p) => p.key)]))
    if (!ended.current && f > last + TAIL * SEQ_FPS) {
      ended.current = true
      onDone?.()
    }
  })

  return (
    <group>
      {plan.models.filter((m) => m.kind === 'ball').map((m) => {
        const model = ball === undefined ? undefined : models.get(m.ball ?? ball)
        if (!model) return null
        return (
          <SeqBallModel
            key={m.no}
            no={m.no}
            plan={plan}
            model={model}
            ctx={ctx}
            startedAt={startedAt}
            scale={ballScale}
            register={(lm) => {
              if (lm) live.current.set(m.no, lm)
              else live.current.delete(m.no)
            }}
          />
        )
      })}
      {extra.flatMap((r) => plan.particles.filter((p) => !gone.has(p.key) && touchesTarget(p)).map((p) => (
        <BdspEffect
          key={`${r.slot}/${p.key}`}
          name={p.prefab}
          seed={hash(`${r.slot}/${p.key}`)}
          clock={() => battleClock.now() - startedAt - p.start / SEQ_FPS}
          stopAt={(p.stop - p.start) / SEQ_FPS}
          pose={() => particleAt(p, (battleClock.now() - startedAt) * SEQ_FPS, r.ctx)}
        />
      )))}
      {plan.particles.filter((p) => !gone.has(p.key)).map((p) => (
        <BdspEffect
          key={p.key}
          name={p.prefab}
          seed={hash(p.key)}
          clock={() => battleClock.now() - startedAt - p.start / SEQ_FPS}
          stopAt={(p.stop - p.start) / SEQ_FPS}
          onStep={(e) => { alive.current[p.key] = e.alive }}
          pose={() => {
            const f = (battleClock.now() - startedAt) * SEQ_FPS
            return particleAt(p, f, ctx.current)
          }}
        />
      ))}
    </group>
  )
}

/** 로케이터 번호 → 노드 이름 (0은 뿌리) */
function ballNodeName(m: LiveModel | undefined, index: number): string | null {
  if (!m) return null
  const name = (m.root.userData.locators as readonly string[] | undefined)?.[index]
  return name === undefined || name === '' ? null : name
}

/** 시퀀스 볼 한 개 — 뼈째 복제하고 클립을 시퀀스 시각으로 꽂는다 */
function SeqBallModel({ no, plan, model, ctx, startedAt, scale, register }: {
  no: number
  plan: SeqPlan
  model: BallModel
  ctx: { current: SeqContext }
  startedAt: number
  scale: number
  register: (m: LiveModel | null) => void
}) {
  const group = useRef<Group>(null)
  const rig = useMemo(() => {
    const root = cloneBall(model)
    root.userData.locators = model.meta.locators
    const nodes = new Map<string, Object3D>()
    root.traverse((o) => { if (o.name && !nodes.has(o.name)) nodes.set(o.name, o) })
    return { root, nodes, mixer: new AnimationMixer(root), action: null as AnimationAction | null, clip: -1 }
  }, [model])

  useEffect(() => {
    register({ root: rig.root, nodes: rig.nodes })
    return () => {
      register(null)
      rig.mixer.stopAllAction()
      rig.mixer.uncacheRoot(rig.root)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 한 벌에 한 번
  }, [rig])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const f = (battleClock.now() - startedAt) * SEQ_FPS
    const pose = f < 0 ? null : modelAt(plan, no, f, ctx.current)
    g.visible = pose !== null && pose.visible
    if (!pose) return
    g.position.set(pose.pos[0], pose.pos[1], pose.pos[2])
    g.quaternion.set(pose.quat[0], pose.quat[1], pose.quat[2], pose.quat[3])
    g.scale.setScalar(scale)
    const clip = pose.clip
    if (!clip) {
      if (rig.action) { rig.mixer.stopAllAction(); rig.action = null; rig.clip = -1 }
      return
    }
    if (clip.index !== rig.clip) {
      const name = model.meta.clips[clip.index]
      const found = name ? model.clips.find((c) => c.name === name) ?? null : null
      rig.mixer.stopAllAction()
      rig.action = found ? rig.mixer.clipAction(found) : null
      rig.clip = clip.index
      if (rig.action) {
        rig.action.setLoop(clip.loop ? LoopRepeat : LoopOnce, Infinity)
        rig.action.clampWhenFinished = true
        rig.action.play()
      }
    }
    const a = rig.action
    if (!a) return
    const dur = a.getClip().duration
    a.enabled = true
    a.paused = false
    a.time = clip.loop && dur > 0 ? clip.time % dur : Math.max(0, Math.min(clip.time, dur))
    rig.mixer.update(0)
  })

  return (
    <group ref={group} visible={false}>
      <primitive object={rig.root} />
    </group>
  )
}

/**
 * `isScale` 카메라 오프셋의 배율 — 그 자리에 선 몸의 키를 1m 기준으로. BDSP가 무엇으로 늘리는지는
 * 못 찾았다(우리 짐작) — 큰 몸 앞에서 카메라가 몸 속에 서지 않게 하는 것이 목적이다.
 *
 * 한계 — 위 3m · 아래 `minScale`(기본 0.6)도 우리 값이다(PARITY §2.13의 「0.5~3」). 출처 없이 정했고, 실측 기록도 없다
 */
function bodyScale(slot: string | null, min: number): number {
  return slot ? Math.min(3, Math.max(min, tallOf(slot))) : 1
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

