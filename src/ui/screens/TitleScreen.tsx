import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import * as css from './titleScreen.css'

/** 게임 청크를 미리 받아둔다 — 클릭 시점의 대기를 없앤다 (PLAN §10.4) */
function prefetchGameChunk() {
  void import('../../scene/Stage')
  void import('../../app/PlayRoute')
}

export function TitleScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    // 초기 렌더를 방해하지 않도록 유휴 시점에. Safari에는 requestIdleCallback이 없다
    const idle = window.requestIdleCallback
    if (idle) {
      const id = idle(prefetchGameChunk)
      return () => window.cancelIdleCallback?.(id)
    }
    const t = window.setTimeout(prefetchGameChunk, 300)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className={css.wrap}>
      <h1 className={css.title}>pt-3d</h1>
      <button
        className={css.button}
        onClick={() => navigate('/play')}
        onPointerEnter={prefetchGameChunk}
      >
        게임 시작
      </button>
      <p className={css.hint}>WASD/방향키 이동 · Shift 달리기 · 라우트 왕복 시 씬 유지 검증용</p>
    </div>
  )
}
