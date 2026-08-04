// 성능 오버레이 (PLAN §10.5) — 250ms 폴링, 게임 루프와 무관한 DOM
import { useEffect, useState } from 'react'
import { perfSnapshot } from '../../scene/sceneRefs'
import * as css from './perfOverlay.css'

export function PerfOverlay() {
  const [snap, setSnap] = useState({ ...perfSnapshot })

  useEffect(() => {
    const id = setInterval(() => setSnap({ ...perfSnapshot }), 250)
    return () => clearInterval(id)
  }, [])

  return (
    <div className={css.overlay}>
      <span className={snap.fps >= 55 ? css.good : css.bad}>
        {`FPS ${snap.fps}  loop ${snap.frameMs.toFixed(2)}ms`}
      </span>
      {`\ncalls ${snap.drawCalls}  tris ${(snap.triangles / 1000).toFixed(1)}k\nbackend ${snap.backend}`}
    </div>
  )
}
