// 오래 한 판 경고 — 「리포트를 쓰고 새로고침하세요」 (`scene/autosave`)
//
// ⚠️ **오래 하면 GPU 메모리가 쌓인다** (REPAIR §149). 아직 못 고쳤으므로 탭이 죽기 전에 사람에게 알린다.
// 원인을 단정하지 않는다 — 보이는 것(느려짐 · 그래픽이 끊겼다 돌아옴 · 오래 함)과 할 일만 적는다.
//
// ⚠️ **「리포트 쓰기」는 리포트를 쓸 수 있는 순간에만 눌린다** (`whyNotSaveNow`). 배틀 · 스크립트 중에 리포트 화면을
// 열면 원작에 없는 저장 시점이 생긴다
import { useEffect, useState } from 'react'
import { usePlayNotice, whyNotSaveNow } from '../../scene/autosave'
import { useMenuStore } from '../../state/menuStore'
import * as css from './playNotice.css'

const SAID = {
  recovered: '그래픽 장치가 한 번 끊겼다가 다시 연결됐습니다.',
  slow: '화면이 계속 느려지고 있습니다.',
  long: '오래 플레이하셨습니다.',
} as const

export default function PlayNotice() {
  const kind = usePlayNotice((s) => s.kind)
  const savedAt = usePlayNotice((s) => s.savedAt)
  const dismiss = usePlayNotice((s) => s.dismiss)
  const [canSave, setCanSave] = useState(false)

  useEffect(() => {
    if (kind === null) return
    const tick = (): void => { setCanSave(whyNotSaveNow() === null) }
    tick()
    const id = setInterval(tick, 500)
    return () => { clearInterval(id) }
  }, [kind])

  if (kind === null) return null
  const ago = savedAt === null ? null : Math.max(0, Math.round((Date.now() - savedAt) / 60_000))
  return (
    <div className={css.box} role="status" aria-label="오래 한 판 안내">
      <span className={css.title}>{SAID[kind]}</span>
      <span>
        리포트를 쓰고 페이지를 새로고침하면 다시 가벼워집니다.
        {ago !== null && ` (자동 저장: ${ago === 0 ? '방금' : `${String(ago)}분 전`})`}
      </span>
      <span className={css.actions}>
        <button
          type="button"
          className={css.button}
          disabled={!canSave}
          onClick={() => { if (whyNotSaveNow() === null) { dismiss(); useMenuStore.getState().open('save') } }}
        >
          리포트 쓰기
        </button>
        <button type="button" className={css.button} onClick={dismiss}>닫기</button>
      </span>
    </div>
  )
}
