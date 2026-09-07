// 그래픽이 멈췄을 때 (PLATINUM_3D_COMPLETION_PLAN §6.2 · PT-02)
//
// ⚠️ **이 화면은 3D 없이 뜬다.** 여기가 뜨는 상황이 곧 「3D를 못 쓴다」이므로,
// 이 모듈이 three를 한 조각이라도 잡으면 오류 화면 자체가 못 뜬다.
//
// ⚠️ **여기서 게임을 저장하지 않는다.** 장치를 잃은 순간의 상태는 배틀 중간일
// 수도 스크립트 한가운데일 수도 있고, 그것을 리포트로 굽는 것은 **원작에 없는
// 저장 시점**을 만드는 일이다 — 수동 저장의 뜻이 달라진다. 이미 저장해 둔
// 리포트는 그대로 있으므로, 돌아갈 곳은 그것이다.
//
// ⚠️ **원인을 단정하지 않는다** (기획서 §6.2). 우리가 아는 것은 「어느 신호가
// 왔는가」뿐이고 왜인지는 모른다. 그래서 **가능한 원인 · 지금 관찰된 것 ·
// 다음 행동**을 갈라 적는다 — 단정한 한 줄은 사람을 엉뚱한 데로 보낸다
import { useRendererStore } from '../../state/rendererStore'
import * as css from './rendererTrouble.css'

/** 못 쓰게 된 까닭마다 다른 말. 지어낸 원작 대사가 아니라 이 제품의 안내다 */
const SAID = {
  init: {
    title: '3D를 시작할 수 없습니다',
    maybe: [
      '이 브라우저나 기계가 WebGPU·WebGL2를 못 엽니다',
      '다른 프로그램이 GPU를 크게 쓰고 있습니다',
      '그래픽 드라이버가 오래됐습니다',
    ],
  },
  lost: {
    title: '그래픽 장치와의 연결이 끊겼습니다',
    maybe: [
      '드라이버가 갱신되거나 다시 시작됐습니다',
      '절전으로 전환되었다가 돌아왔습니다',
      '다른 프로그램이 GPU를 초기화했습니다',
    ],
  },
  scene: {
    title: '화면을 그리다 멈췄습니다',
    maybe: [
      '이 장면의 자료 한 조각이 깨졌거나 아직 안 만들어졌습니다',
      '설치된 에셋과 앱의 판이 어긋났습니다',
    ],
  },
  timeout: {
    title: '3D를 다시 세우지 못했습니다',
    maybe: [
      '새 그래픽 장치는 열렸지만 첫 화면이 나오지 않았습니다',
      '장치가 계속 불안정한 상태일 수 있습니다',
    ],
  },
} as const

export function RendererTrouble() {
  const phase = useRendererStore((s) => s.phase)
  const fault = useRendererStore((s) => s.fault)
  const reason = useRendererStore((s) => s.reason)
  const api = useRendererStore((s) => s.api)
  const backend = useRendererStore((s) => s.backend)
  const retry = useRendererStore((s) => s.retry)
  const giveUp = useRendererStore((s) => s.giveUp)

  // 정상일 때는 아무것도 안 그린다. 복구 중에도 화면은 남는다 — 사라지면
  // 사람이 「고쳐졌나?」 하고 누르기 시작한다
  if (phase === 'live' || phase === 'ready' || phase === 'initializing') return null

  const said = SAID[fault ?? 'lost']
  const recovering = phase === 'recovering'
  // 관찰된 것만 적는다. 모르는 칸은 아예 안 그린다 — 빈 값을 「없음」으로 읽히게
  // 두면 그것도 하나의 단정이 된다
  const seen = [
    api !== null ? ['신호를 준 쪽', api] : null,
    backend !== null ? ['그리던 길', backend] : null,
    reason !== null && reason !== '' ? ['브라우저가 준 말', reason] : null,
  ].filter((r) => r !== null)

  return (
    <div className={css.over} role="alertdialog" aria-modal="true" aria-labelledby="rp-gpu-title">
      <div className={css.panel}>
        <h2 id="rp-gpu-title" className={css.title}>
          {recovering ? '3D를 다시 세우는 중입니다' : said.title}
        </h2>
        {recovering
          ? (
              <p className={css.body}>
                잠시만 기다려 주세요. 조작은 화면이 준비될 때까지 멈춰 둡니다.
                오래 걸리면 마지막 리포트로 돌아갈 수 있습니다.
              </p>
            )
          : (
              <>
                <p className={css.body}>
                  진행은 마지막으로 저장한 리포트까지 그대로 있습니다.
                  지금 상태를 대신 저장하지는 않습니다.
                </p>
                <div>
                  <p className={css.head}>가능한 원인 (확정된 것이 아닙니다)</p>
                  <ul className={css.list}>
                    {said.maybe.map((one) => <li key={one}>{one}</li>)}
                  </ul>
                </div>
              </>
            )}
        {seen.length > 0 && (
          <div>
            <p className={css.head}>지금 관찰된 것</p>
            {/*
              ⚠️ **브라우저가 준 말을 번역하거나 다듬지 않는다.** 그대로 옮겨
              적어야 제보가 쓸모 있고, 우리가 지어낸 말로 바꾸면 검색해도
              아무것도 안 나온다
            */}
            <pre className={css.detail}>
              {seen.map(([label, value]) => `${label}: ${value}`).join('\n')}
            </pre>
          </div>
        )}
        <div className={css.row}>
          {/*
            ⚠️ **자동 재시도가 아니다.** 자동은 한 판에 한 번뿐이고
            (`MAX_AUTO_RECOVERY`), 그 뒤로는 사람이 누를 때만 다시 세운다 —
            장치가 계속 죽는 기계에서 우리끼리 무한히 도는 것을 막는 자리다
          */}
          {!recovering && (
            <button type="button" className={css.button} onClick={() => { retry() }}>
              3D 다시 세우기
            </button>
          )}
          {/*
            ⚠️ **복구 중에도 나갈 길이 있어야 한다** (기획서 §3.5). 끝나지 않는
            복구에서 단추가 하나도 없으면 사람이 할 수 있는 일이 없다 —
            기다림을 그만두는 것도 하나의 선택이다
          */}
          {recovering && (
            <button type="button" className={css.button} onClick={() => { giveUp() }}>
              기다리지 않기
            </button>
          )}
          {/*
            마지막으로 **저장해 둔** 리포트로 돌아간다. 지금 상태를 굽지
            않으므로 잃는 것은 저장 뒤에 걸어온 만큼이고, 그것이 원작의
            수동 저장이 뜻하는 바 그대로다
          */}
          <button
            type="button"
            className={css.primary}
            onClick={() => { globalThis.location.reload() }}
          >
            마지막 리포트로 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}
