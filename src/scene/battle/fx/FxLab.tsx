// 이펙트 시험대 `/fxlab` — **개발 서버에서만** 붙는다 (`app/App`의 `FxLabHost`).
//
// 어두운 바닥에 격자를 깔고 프리팹을 하나 이상 세운다. 배틀 카메라와 같은 렌즈
// (화각 30 · 5.8m 밖)로 보므로 크기를 배틀 화면과 견줄 수 있다.
//
//   /fxlab?fx=eb001_capture                 하나
//   /fxlab?fx=eb001_capture,eb001_ballout   여럿 (가로로 1.6m씩 띄운다)
//   &loop=1      끝나면 처음부터
//   &t=0.5       0.5초에 멈춘다 (찍기용)
//   &scale=0.6   이펙트 크기 (시퀀스의 `ParticleScale`)
//   &y=0.5       세우는 높이(m) · &zoom=2 카메라를 두 배 당긴다 · &seed=7
//   &dbg=c0      재질 한 칸만 불투명하게 (c0 c1 a0 combo comboa alpha prim uv)
//   &ry=180      Y로 돌려 세운다(도)
//   &only=glow   경로에 이 글자가 든 렌더러만 그린다 (하나씩 떼어 볼 때)
//
// 자동화 손잡이: `window.__fxlab = { play(name), seek(t), resume(), state() }`.
//
// ⚠️ **시간은 이 화면이 스스로 센다.** 배틀 시계를 미는 재생기가 없으므로, 프레임
// 델타(0.1초로 자른다)를 쌓아 각 이펙트에 `clock`으로 준다 — 이펙트 쪽이 그 값까지
// 1/60초 걸음으로 정확히 간다. R3F의 델타는 `performance.now`에서 오므로 트레일러
// 가상 시계 아래에서도 같은 프레임이 나온다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { NoToneMapping, PerspectiveCamera } from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { CAMERA, BATTLE_FOV } from '../../../engine/battle/shots'
import type { FxEffect } from '../../../engine/battle/fx/effect'
import { BdspEffect } from './BdspEffect'
import { setFxDebugView } from './fxMaterial'

interface LabState {
  names: string[]
  /** 멈춘 시각 (초). null이면 흐른다 */
  frozen: number | null
  /** 다시 세울 때마다 올린다 — 같은 이름이어도 새로 받는다 */
  epoch: number
}

interface LabApi {
  play(name: string): void
  seek(t: number): void
  resume(): void
  state(): { names: string[]; time: number; alive: number; done: boolean; steps: number }
}

declare global {
  interface Window { __fxlab?: LabApi }
}

function readQuery(): { names: string[]; loop: boolean; t: number | null; scale: number; y: number; zoom: number; seed: number; only: string | undefined; ry: number } {
  const q = new URLSearchParams(window.location.search)
  const num = (k: string, d: number): number => {
    const v = Number(q.get(k))
    return q.has(k) && Number.isFinite(v) ? v : d
  }
  return {
    names: (q.get('fx') ?? 'eb001_capture').split(',').map((s) => s.trim()).filter(Boolean),
    loop: q.get('loop') === '1',
    t: q.has('t') ? num('t', 0) : null,
    scale: num('scale', 1),
    y: num('y', 0.5),
    zoom: Math.max(0.1, num('zoom', 1)),
    seed: num('seed', 1),
    only: q.get('only') ?? undefined,
    ry: num('ry', 0),
  }
}

export function FxLab() {
  const query = useMemo(readQuery, [])
  setFxDebugView(new URLSearchParams(window.location.search).get('dbg') ?? '')
  const [lab, setLab] = useState<LabState>({ names: query.names, frozen: query.t, epoch: 0 })
  const hud = useRef<HTMLDivElement>(null)
  const time = useRef(0)
  const effects = useRef(new Map<number, FxEffect>())

  // 자동화 손잡이
  useEffect(() => {
    const api: LabApi = {
      play: (name) => {
        time.current = 0
        effects.current.clear()
        setLab((s) => ({ names: [name], frozen: null, epoch: s.epoch + 1 }))
      },
      seek: (t) => {
        time.current = Math.max(0, t)
        setLab((s) => ({ ...s, frozen: Math.max(0, t) }))
      },
      resume: () => { setLab((s) => ({ ...s, frozen: null })) },
      state: () => {
        const list = [...effects.current.values()]
        return {
          names: lab.names,
          time: time.current,
          alive: list.reduce((n, e) => n + e.alive, 0),
          done: list.length > 0 && list.every((e) => e.done),
          steps: list[0]?.steps ?? 0,
        }
      },
    }
    window.__fxlab = api
    return () => { if (window.__fxlab === api) delete window.__fxlab }
  }, [lab.names])

  const spread = 1.6
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0b0d12' }}>
      <Canvas
        dpr={[1, 2]}
        frameloop="always"
        gl={async (props) => {
          const r = new WebGPURenderer({ ...(props as ConstructorParameters<typeof WebGPURenderer>[0]), alpha: false, antialias: true })
          r.toneMapping = NoToneMapping
          await r.init()
          return r
        }}
      >
        <color attach="background" args={['#0b0d12']} />
        <LabCamera zoom={query.zoom} y={query.y} />
        <gridHelper args={[10, 20, '#3a4250', '#1d222b']} />
        <LabClock
          time={time}
          frozen={lab.frozen}
          loop={query.loop}
          effects={effects}
          hud={hud}
          names={lab.names}
        />
        {lab.names.map((name, i) => (
          <BdspEffect
            key={`${lab.epoch}:${i}:${name}`}
            name={name}
            seed={query.seed}
            only={query.only}
            position={[(i - (lab.names.length - 1) / 2) * spread, query.y, 0]}
            scale={query.scale}
            rotation={[0, (query.ry * Math.PI) / 180, 0]}
            clock={() => time.current}
            onStep={(e) => { effects.current.set(i, e) }}
          />
        ))}
      </Canvas>
      <div
        ref={hud}
        style={{
          position: 'fixed', left: 12, bottom: 10, color: '#b8c2d6', font: '12px/1.4 monospace',
          pointerEvents: 'none', whiteSpace: 'pre',
        }}
      />
    </div>
  )
}

/** 배틀 카메라와 같은 렌즈 — 이펙트를 겨누는 자리만 세우는 높이로 옮긴다 */
function LabCamera({ zoom, y }: { zoom: number; y: number }) {
  const set = useThree((s) => s.set)
  const size = useThree((s) => s.size)
  const camera = useMemo(() => new PerspectiveCamera(BATTLE_FOV, 1, 0.05, 200), [])
  useEffect(() => {
    const look = [0, y, 0] as const
    const d = [CAMERA.position[0] - CAMERA.look[0], CAMERA.position[1] - CAMERA.look[1], CAMERA.position[2] - CAMERA.look[2]]
    camera.position.set(look[0] + d[0]! / zoom, look[1] + d[1]! / zoom, look[2] + d[2]! / zoom)
    camera.lookAt(look[0], look[1], look[2])
    camera.updateMatrixWorld()
    set({ camera })
  }, [camera, set, y, zoom])
  useEffect(() => {
    camera.aspect = size.width / Math.max(1, size.height)
    camera.updateProjectionMatrix()
  }, [camera, size])
  return null
}

/** 시험대 시계 — 쌓은 프레임 델타 또는 멈춘 시각 */
function LabClock({
  time, frozen, loop, effects, hud, names,
}: {
  time: { current: number }
  frozen: number | null
  loop: boolean
  effects: { current: Map<number, FxEffect> }
  hud: { current: HTMLDivElement | null }
  names: readonly string[]
}) {
  const doneAt = useRef<number | null>(null)
  useFrame((_, delta) => {
    if (frozen !== null) time.current = frozen
    else time.current += Math.min(delta, 0.1)
    const list = [...effects.current.values()]
    const done = list.length > 0 && list.every((e) => e.done)
    if (loop && frozen === null && done) {
      // 다 끝나면 반 박자 쉬고 처음부터 (이펙트는 시계가 뒤로 가면 다시 튼다)
      doneAt.current ??= time.current
      if (time.current - doneAt.current > 0.5) { time.current = 0; doneAt.current = null }
    } else if (!done) doneAt.current = null
    if (hud.current) {
      const alive = list.reduce((n, e) => n + e.alive, 0)
      hud.current.textContent = `${names.join(', ')}\nt ${time.current.toFixed(3)}s${frozen !== null ? ' (멈춤)' : ''}  입자 ${alive}${done ? '  끝' : ''}`
    }
  })
  return null
}
