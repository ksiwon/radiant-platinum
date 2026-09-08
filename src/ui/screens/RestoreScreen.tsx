// 저장한 자리를 세우는 동안, 그리고 못 세웠을 때 (야간 실행서 N1)
//
// ⚠️ **이 화면이 없으면 두 가지가 똑같이 보인다.** 격자를 기다리는 것과
// 못 받은 것 — 둘 다 화면이 안 움직인다. 앞은 기다리면 끝나고 뒤는 사람이
// 골라야 끝난다.
//
// ⚠️ **여기서 게임을 저장하지 않는다.** 실패한 자리는 「저장한 곳이 아닌
// 데」이므로 그것을 리포트로 구우면 진행을 덮는다. 저장해 둔 리포트는 그대로
// 있고, 「다시 해 보기」는 그것을 다시 읽는 일이다.
//
// ⚠️ **원인을 단정하지 않는다.** 우리가 아는 것은 던져진 오류의 글 한 줄뿐이다
// (`RendererTrouble`과 같은 잣대).
import { useNavigate } from 'react-router'
import { restoreRetry, useRestoreStore } from '../../state/restoreStore'
import * as css from './restoreScreen.css'

export function RestoreScreen() {
  const navigate = useNavigate()
  const phase = useRestoreStore((s) => s.phase)
  const reason = useRestoreStore((s) => s.reason)

  if (phase === 'idle' || phase === 'ready') return null

  if (phase === 'loading') {
    // 창을 안 띄운다 — 아직 아무 일도 안 일어났고, 고를 것도 없다.
    // 덮개만으로 「저장한 곳이 아닌 세계」를 가리는 것이 이 상태의 전부다
    return (
      <div className={css.over} role="status" aria-live="polite">
        <p className={css.waiting}>세계를 세우는 중입니다…</p>
      </div>
    )
  }

  return (
    <div className={css.over} role="alertdialog" aria-modal="true" aria-labelledby="rp-restore-title">
      <div className={css.panel}>
        <h2 id="rp-restore-title" className={css.title}>이 자리를 열지 못했습니다</h2>
        <p className={css.body}>
          저장해 둔 리포트는 그대로 있습니다. 지금 상태를 대신 저장하지 않으며,
          기록한 곳이 아닌 자리에서 시작하지도 않습니다.
        </p>
        {reason !== null && reason !== '' && (
          // 던져진 말을 그대로 옮긴다. 다듬으면 제보가 쓸모없어진다
          <pre className={css.detail}>{reason}</pre>
        )}
        <div className={css.row}>
          <button
            type="button"
            className={css.primary}
            onClick={() => { restoreRetry.run?.() }}
          >
            다시 해 보기
          </button>
          {/*
            ⚠️ **나갈 길이 있어야 한다.** 같은 자료가 계속 안 오면 「다시 해
            보기」만으로는 사람이 할 수 있는 일이 없다
          */}
          <button
            type="button"
            className={css.button}
            onClick={() => { void navigate('/') }}
          >
            타이틀로
          </button>
        </div>
      </div>
    </div>
  )
}
