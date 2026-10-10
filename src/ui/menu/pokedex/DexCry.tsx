// ③ 울음소리 쪽 (pokedex.md §4.2) — 원작의 재생 · 반복 · 높낮이 · 코러스/팬.
//
// 무대 자리에 동심원 고리 셋을 놓고 가운데에 그 종을 세운다(3D). 그 아래 **파형 띠**는 `AnalyserNode`의 실제 파형이다 —
// 울지 않을 때는 가운데 실선 하나고, 지어낸 파형을 그리지 않는다.
//
// 키: Z가 재생(어디서나 운다). Shift가 볼 판에 들어가고 나온다 — 들어가 있는 동안 ←→가 볼을 가로로(코러스 음량 또는 좌우),
// ↑↓가 세로로(보통 / 두 옥타브 아래), Q/E가 스위치(코러스 / 팬)다. 판을 마우스로 끌어도 된다.
// 리버브 · 필터 다이얼은 이번에 넣지 않았다 (결정은 높낮이 · 코러스/팬까지).
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { music, NO_TUNE, type CryTune, type CryVoice } from '../../../engine/audio/music'
import { useMonViewportStore } from '../../../state/monViewportStore'
import { MonViewport } from '../../common/MonViewport'
import * as own from '../pokedexScreen.css'
import {
  LOOP_COOLDOWN_MS, markerOf, nudgeTune, playAction, pointTune, type CryMode,
} from './cryTune'
import { DEX_LINE } from './dexText'
import type { DexData } from './dexData'

const CRY_SIZE = 200

interface CryBench {
  playing: boolean
  loop: boolean
  tune: CryTune
  mode: CryMode
  /** 볼 판에 들어가 있는가 (Shift) */
  tuning: boolean
  analyser: AnalyserNode | null
  /** Z */
  press: () => void
  stop: () => void
  toggleLoop: () => void
  setMode: (m: CryMode) => void
  setTuning: (on: boolean) => void
  nudge: (dx: number, dy: number) => void
  point: (x: number, y: number) => void
}

/**
 * 울음소리 한 판. `active`가 거짓(다른 쪽)이거나 종이 바뀌면 끊고 값을 처음으로 되돌린다. 반복은 쪽을 나갈 때까지 남는다.
 * 화면이 이 훅을 늘 부른다 — 키 처리가 한 곳이라서다
 */
export function useCryBench(species: number, active: boolean): CryBench {
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(false)
  const [tune, setTune] = useState<CryTune>(NO_TUNE)
  const [mode, setMode] = useState<CryMode>('chorus')
  const [tuning, setTuning] = useState(false)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const voice = useRef<CryVoice | null>(null)
  const tuneRef = useRef(tune)
  const loopRef = useRef(loop)
  const speciesRef = useRef(species)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 지금 울림이 몇 번째 시도인가 — 늦게 오는 답이 다른 울림을 건드리지 않게 */
  const ticket = useRef(0)
  tuneRef.current = tune
  loopRef.current = loop
  speciesRef.current = species

  const halt = useCallback(() => {
    ticket.current++
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
    voice.current?.stop()
    voice.current = null
    setPlaying(false)
    setAnalyser(null)
  }, [])

  const start = useCallback(() => {
    const mine = ++ticket.current
    voice.current?.stop()
    voice.current = null
    if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
    void music.playCryVoice(speciesRef.current, tuneRef.current).then((v) => {
      if (v === null) { if (ticket.current === mine) setPlaying(false); return }
      if (ticket.current !== mine) { v.stop(); return }
      voice.current = v
      setAnalyser(v.analyser)
      setPlaying(true)
      useMonViewportStore.getState().cry()
      void v.ended.then(() => {
        if (ticket.current !== mine) return
        voice.current = null
        setPlaying(false)
        // 분석기도 놓는다 — 안 놓으면 `Wave`의 rAF가 울음이 끝난 뒤에도 계속 돈다
        setAnalyser(null)
        // 반복 — 끝나고 잠깐 쉬었다가 다시 운다 (`LoopCry`)
        if (loopRef.current) timer.current = setTimeout(() => { if (ticket.current === mine) start() }, LOOP_COOLDOWN_MS)
      })
    })
  }, [])

  // 쪽을 나가거나 종이 바뀌면 끊고 처음 값으로 돌아간다
  useEffect(() => {
    halt()
    setTune(NO_TUNE)
    setMode('chorus')
    setTuning(false)
    if (!active) setLoop(false)
    return halt
  }, [species, active, halt])

  const apply = useCallback((next: CryTune) => {
    setTune(next)
    voice.current?.set(next)
  }, [])

  return {
    playing, loop, tune, mode, tuning, analyser,
    press: () => {
      if (playAction(loopRef.current, voice.current !== null) === 'stop') halt()
      else start()
    },
    stop: halt,
    toggleLoop: () => { setLoop((l) => !l) },
    setMode,
    setTuning: (on) => {
      setTuning(on)
      // 판을 나오면 값이 처음으로 돌아간다 (`InitCrySoundValues`)
      if (!on) apply(NO_TUNE)
    },
    nudge: (dx, dy) => { apply(nudgeTune(tuneRef.current, mode, dx, dy)) },
    point: (x, y) => { apply(pointTune(tuneRef.current, mode, x, y)) },
  }
}

/** 파형 띠 — 울릴 때만 `AnalyserNode`의 실제 파형이 흐른다 */
function Wave({ analyser }: { analyser: AnalyserNode | null }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const g = canvas.getContext('2d')
    if (!g) return
    // 색은 CSS가 정한다 (토큰) — 캔버스에는 그 계산값을 쓴다
    const color = getComputedStyle(canvas).color
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = canvas.clientWidth, h = canvas.clientHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    const data = analyser ? new Float32Array(analyser.fftSize) : null
    let raf = 0
    const draw = (): void => {
      g.clearRect(0, 0, w, h)
      g.strokeStyle = color
      g.lineWidth = 2
      g.lineJoin = 'round'
      g.beginPath()
      if (analyser && data) {
        analyser.getFloatTimeDomainData(data)
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * w
          const y = h / 2 - data[i]! * (h / 2 - 4) * 1.6
          if (i === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        raf = requestAnimationFrame(draw)
      } else {
        g.moveTo(0, h / 2)
        g.lineTo(w, h / 2)
      }
      g.stroke()
    }
    draw()
    return () => { cancelAnimationFrame(raf) }
  }, [analyser])
  return <canvas ref={ref} className={own.wave} aria-hidden />
}

/** 고리의 지름. 안쪽 고리도 구멍 대각선(200 × √2 ≈ 283)보다 커서 3D를 안 가린다 */
const RINGS = [300, 372, 444] as const
const RING_ALPHA = [0.62, 0.4, 0.22] as const

export function DexCry({ data, species, bench }: { data: DexData, species: number, bench: CryBench }) {
  const pad = useRef<HTMLDivElement>(null)
  const spot = markerOf(bench.tune, bench.mode)

  const at = (e: ReactPointerEvent<HTMLDivElement>): void => {
    const r = pad.current?.getBoundingClientRect()
    if (!r || r.width === 0 || r.height === 0) return
    bench.point((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
  }

  return (
    <>
      <div className={own.cryStage}>
        {RINGS.map((d, i) => (
          <span key={d} className={own.ring} style={{ width: d, height: d, opacity: RING_ALPHA[i] }} />
        ))}
        <MonViewport species={species === 0 ? null : species} size={CRY_SIZE} />
      </div>
      <Wave analyser={bench.analyser} />
      <div className={own.bench}>
        <div
          ref={pad}
          className={own.pad}
          data-tuning={bench.tuning ? 'yes' : 'no'}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); bench.setTuning(true); at(e) }}
          onPointerMove={(e) => { if (e.buttons !== 0) at(e) }}
          onPointerUp={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); bench.setTuning(false) }}
        >
          <span className={own.padBall} style={{ '--x': spot.x, '--y': spot.y } as CSSProperties} aria-hidden />
        </div>
        <div className={own.benchSide}>
          <span
            className={own.mode[bench.mode === 'chorus' ? 'on' : 'off']}
            onClick={() => { bench.setMode('chorus') }}
          >
            {data.ui[DEX_LINE.chorus] ?? ''}
          </span>
          <span
            className={own.mode[bench.mode === 'pan' ? 'on' : 'off']}
            onClick={() => { bench.setMode('pan') }}
          >
            {data.ui[DEX_LINE.pan] ?? ''}
          </span>
          <span
            className={own.loopMark}
            data-on={bench.loop ? 'yes' : 'no'}
            onClick={bench.toggleLoop}
            aria-hidden
          >
            ⟳
          </span>
        </div>
      </div>
    </>
  )
}
