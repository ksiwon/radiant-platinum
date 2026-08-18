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
