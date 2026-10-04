// BDSP 연출 시퀀스 한 번 — 입자 칸마다 이펙트를 세우고, 몸 · 화면 · 배경에 거는 것을
// `stageRefs.seqStage`에 적는다 (BATTLE_FX §4).
//
// 시계는 연출 시계다: 시작 시각(`startedAt`, 초)에서 지금까지를 30fps 프레임으로 센다.
// 입자 칸은 **처음부터 다 세워 둔다**(그래서 프리팹을 미리 받는다) — 제 시작 프레임 전에는
// 이펙트 시계가 0에 서 있어 아무것도 안 뿜는다(`BdspEffect`의 `clock`).
//
// ⚠️ **몸에 거는 것은 `seqStage.running`이 켜진 동안만 무대가 읽는다.** 끝나면 비운다 —
// 안 비우면 다음 턴까지 몸이 상대 앞에 서 있다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { battleClock } from '../../../engine/battle/presentationClock'
import {
  backAt, bodyAt, cameraAt, particleAt, planFrames, shakeAt, SEQ_FPS,
  type Role, type SeqCamera, type SeqContext, type SeqPlan,
} from '../../../engine/battle/fx/sequence'
import { clearSeqStage, seqStage, tallOf } from '../stageRefs'
import { BdspEffect } from './BdspEffect'
import { slotAnchor } from './seqAnchors'

/** 마지막 명령 뒤로 입자가 사그라지기를 기다리는 위끝 (초) */
const TAIL = 1.5

const ignoredSeen = new Set<string>()

export function BdspSequence({
  plan, roles, spotAt, startedAt, vanish = false, onDone,
}: {
  plan: SeqPlan
  /** 0 쓴 쪽 · 1 맞는 쪽 자리 */
  roles: readonly [string, string]
  spotAt: (slot: string) => [number, number]
  /** 연출 시계에서 시작한 시각 (초) */
  startedAt: number
  /**
   * 쓴 쪽 감추기(`PokemonVisible trg=0`)를 따르는가. ⚠️ BDSP는 카메라가 몸을 지나갈 때도 그 몸을
   * 감춘다(실측: 챔피언전 토대부기가 제 기술 내내 사라졌다). 우리 카메라는 안 움직이므로 **정말
   * 사라지는 기술**(공중날기 · 구멍파기 — DS 대본의 `vanish`)일 때만 따른다
   */
  vanish?: boolean
  onDone?: () => void
}) {
  const ctx = useRef<SeqContext>({
    anchor: (role: Role, node: number) => slotAnchor(roles[role]!, node, spotAt(roles[role]!)),
    home: (role: Role) => {
      const [x, z] = spotAt(roles[role]!)
      return { pos: [x, 0, z], yaw: slotAnchor(roles[role]!, 0, [x, z]).yaw }
    },
    mine: (role: Role) => roles[role]!.startsWith('p1'),
    rest: (role: Role, node: number) => {
      const slot = roles[role]!
      const a = slotAnchor(slot, node, spotAt(slot))
      const off = seqStage.body[slot]?.offset
      if (off) { a.pos[0] -= off[0]; a.pos[1] -= off[1]; a.pos[2] -= off[2] }
      return a
    },
  })
  // 카메라는 무대(`BattleStage`의 `useBattleCamera`)가 제 기본 카메라를 넘겨 부른다 — 그 프레임 시각으로 다시 접는다
  const cameraFn = useMemo(() => (base: SeqCamera): SeqCamera | null => {
    const f = (battleClock.now() - startedAt) * SEQ_FPS
    return cameraAt(plan, f, { ...ctx.current, scale: (role: Role) => bodyScale(roles[role]!) }, base)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 한 시퀀스 안에서 안 바뀐다
  }, [plan, startedAt])
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
  const ended = useRef(false)
  /** 칸마다 살아 있는 입자 수 (진단) */
  const alive = useRef<Record<string, number>>({})

  useEffect(() => {
    for (const n of plan.ignored) {
      if (ignoredSeen.has(n)) continue
      ignoredSeen.add(n)
      console.info(`[fx] 시퀀스 명령 ${n}은 아직 안 옮겼다 (처음 본 시퀀스 ${plan.name})`)
    }
  }, [plan])

  useEffect(() => {
    seqStage.running = true
    return () => { clearSeqStage() }
  }, [])

  useFrame(() => {
    const f = (battleClock.now() - startedAt) * SEQ_FPS
    if (import.meta.env.DEV) {
      // 진단 손잡이 — 개발 서버에서만. 지금 프레임의 입자 칸 자세
      (window as unknown as { __fxSeq?: unknown }).__fxSeq = {
        name: plan.name, f, alive: { ...alive.current }, poses: plan.particles.map((p) => ({ prefab: p.prefab, ...particleAt(p, f, ctx.current) })),
      }
    }
    if (f < 0) return
    const last = planFrames(plan)
    if (f <= last) {
      seqStage.running = true
      seqStage.frame = f
      for (const role of [0, 1] as const) {
        const pose = bodyAt(plan, role, f, ctx.current)
        if (!vanish) pose.visible = true
        seqStage.body[roles[role]!] = pose
      }
      seqStage.shake = shakeAt(plan, f)
      seqStage.camera = cameraFn
      seqStage.back = backAt(plan, f)
    } else if (seqStage.running) {
      // 명령이 다 끝났다 — 몸 · 화면은 놓고 입자만 사그라지게 둔다
      clearSeqStage()
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

/**
 * `isScale` 카메라 오프셋의 배율 — 그 자리에 선 몸의 키를 1m 기준으로. BDSP가 무엇으로 늘리는지는
 * 못 찾았다(우리 짐작) — 큰 몸 앞에서 카메라가 몸 속에 서지 않게 하는 것이 목적이다
 */
function bodyScale(slot: string): number {
  return Math.min(3, Math.max(0.6, tallOf(slot)))
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
