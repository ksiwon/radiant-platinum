// 성능 오버레이 (PLAN §10.5) — 250ms 폴링, 게임 루프와 무관한 DOM
//
// ⚠️ **평균 FPS만 보면 안 된다.** 예순 프레임 중 쉰아홉이 16ms고 하나가 300ms면
// 평균은 60에 가까운데 사람은 그 하나만 느낀다. 그래서 분포(`p99`)와 **구간마다의
// 최장 프레임**을 같이 띄운다 (`engine/loop/frameStats`).
//
// ⚠️ **여기 뜨는 수를 헤드리스에서 읽으면 안 된다.** `pnpm shot`·`pnpm story`는
// WebGPU 장치를 못 만들어 SwiftShader로 내려앉는다 — 사용자 기계의 수가 아니다.
// 이 판은 **사람이 제 기계에서 읽어 주는** 자리다 (DEPLOY.md).
import { useEffect, useRef, useState } from 'react'
import { perfSnapshot } from '../../scene/sceneRefs'
import { frameStats, SPAN } from '../../engine/loop/frameStats'
import { typingInto } from '../../engine/input/keys'
import { HUD_LEFT_TOP } from './hudStack'
import * as css from './perfOverlay.css'

/**
 * 계기판을 접었다 펴는 키.
 *
 * ⚠️ **게임 키를 안 쓴다.** 이 판은 `?dev=1`에서만 뜨지만 그때도 게임은 돈다 —
 * 왼손 자리는 전부 임자가 있으므로 기능 키를 쓴다 (`app/devTools`의 백틱과
 * 같은 성격이다)
 */
const TOGGLE = ['F2']

/** 60Hz 한 프레임(ms). 이보다 길면 한 장을 놓친 것이다 */
const FRAME_60 = 1000 / 60

interface Shape {
  mid: number
  p99: number
  frames: number
  warp: { first: number, worst: number, last: number, count: number } | null
  battle: { first: number, worst: number, last: number, count: number } | null
}

function read(): Shape {
  return {
    mid: frameStats.percentile(0.5),
    p99: frameStats.percentile(0.99),
    frames: frameStats.count,
    warp: frameStats.spans.get(SPAN.warp) ?? null,
    battle: frameStats.spans.get(SPAN.battle) ?? null,
  }
}

export function PerfOverlay() {
  const [snap, setSnap] = useState({ ...perfSnapshot })
  const [dist, setDist] = useState<Shape>(() => read())
  const [open, setOpen] = useState(true)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const id = setInterval(() => {
      setSnap({ ...perfSnapshot })
      setDist(read())
    }, 250)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (typingInto(e.target) || !TOGGLE.includes(e.code)) return
      e.preventDefault()
      setOpen((v) => !v)
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  /*
    ⚠️ **아래에 붙는 것에게 제 키를 알려 준다.** 왼쪽 위에는 조작 쪽지도
    선다(`ui/hud/ControlHint`). 높이를 손으로 적어 두면 이 판을 접는 순간
    쪽지가 허공에 뜨므로, 잰 값을 뿌리 변수에 실어 보낸다
  */
  useEffect(() => {
    const node = box.current
    const root = document.documentElement
    if (!node) return
    const tell = (): void => {
      root.style.setProperty(HUD_LEFT_TOP, `${String(Math.round(node.getBoundingClientRect().bottom))}px`)
    }
    tell()
    const watch = new ResizeObserver(tell)
    watch.observe(node)
    return () => {
      watch.disconnect()
      root.style.removeProperty(HUD_LEFT_TOP)
    }
  }, [open])

  const ms = (v: number): string => `${v.toFixed(1)}ms`

  return (
    <div className={css.overlay} ref={box}>
      {/*
        머리줄이 곧 여닫는 단추다. 접으면 FPS만 남는다 — 흘깃 보는 값은 그
        하나고, 나머지는 들여다볼 때만 필요하다 (F2로도 여닫는다)
      */}
      <button
        type="button"
        className={css.head}
        aria-expanded={open}
        onClick={() => { setOpen((v) => !v) }}
      >
        <span className={snap.fps >= 55 ? css.good : css.bad}>
          {`FPS ${snap.fps}  loop ${snap.frameMs.toFixed(2)}ms`}
        </span>
        <span className={css.mark}>{open ? '−' : '+'}</span>
      </button>
      {open && `calls ${snap.drawCalls}  tris ${(snap.triangles / 1000).toFixed(1)}k`
        + `
backend ${snap.backend}`}
      {/*
        프레임 시간 분포. **중간값이 아니라 `p99`가 부드러움의 값이다** —
        백 프레임 중 제일 느린 하나가 얼마나 느린가다 (`frameStats.percentile`)
      */}
      {open && dist.frames > 0 && (
        <span className={dist.p99 <= FRAME_60 * 2 ? css.good : css.bad}>
          {`\nframe ${ms(dist.mid)} / p99 ${ms(dist.p99)}  (${dist.frames}장)`}
        </span>
      )}
      {/*
        구간마다의 최장 프레임. 맵 전환은 **제일 나쁜 번**이(어느 맵이 아픈가),
        배틀은 **처음 한 번**이 임자다(`@pkmn/sim`이 그때 온다)
      */}
      {open && dist.warp && (
        <span className={css.bad}>
          {`\n맵 전환 최장 ${ms(dist.warp.last)}  (제일 나쁜 번 ${ms(dist.warp.worst)}`
            + ` · ${dist.warp.count}번)`}
        </span>
      )}
      {open && dist.battle && (
        <span className={css.bad}>
          {`\n배틀 진입 최장 ${ms(dist.battle.first)}  (그 뒤 ${ms(dist.battle.last)}`
            + ` · ${dist.battle.count}번)`}
        </span>
      )}
      {/*
        ⚠️ **스크립트가 터진 것을 여기 말고는 볼 데가 없다.** 오버월드는 계속
        돌고 화면에는 대사창이 그냥 사라지는 것으로만 보이는데, 그 스크립트가
        세우려던 플래그·워프·사람 움직임은 전부 안 일어난다. 이 판은 개발
        빌드에만 뜬다 (`App.tsx`가 `import.meta.env.DEV`로 건다)
      */}
      {snap.scriptErrors > 0 && (
        <span className={css.bad}>
          {`\nscript ${snap.scriptErrors}건  ${(snap.lastScriptError ?? '').slice(0, 60)}`}
        </span>
      )}
    </div>
  )
}
