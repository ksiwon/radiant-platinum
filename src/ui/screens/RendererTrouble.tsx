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
import { useState } from 'react'
import { RECOVERY_TIMEOUT_MS, useRendererStore } from '../../state/rendererStore'
import * as css from './rendererTrouble.css'

type Fault = 'init' | 'lost' | 'scene' | 'timeout'

/**
 * 못 쓰게 된 까닭마다 다른 말. 지어낸 원작 대사가 아니라 이 제품의 안내다.
 *
 * ⚠️ **`next`는 사람이 실제로 할 수 있는 일만 적는다.** init 실패에서 「다시
 * 세우기」만 주면 같은 브라우저·같은 설정으로 같은 자리에서 또 실패하고, 사람은
 * 다시 세우기와 타이틀 사이를 맴돈다 — 바꿀 것이 무엇인지가 다음 걸음이다
 */
const SAID: Record<Fault, { title: string, maybe: readonly string[], next: readonly string[] }> = {
  init: {
    title: '3D를 시작할 수 없습니다',
    maybe: [
      '이 브라우저나 기계가 WebGPU·WebGL2를 못 엽니다',
      '다른 프로그램이 GPU를 크게 쓰고 있습니다',
      '그래픽 드라이버가 오래됐습니다',
    ],
    next: [
      '브라우저 설정의 「시스템」에서 그래픽 가속(하드웨어 가속)을 켜 주세요 — '
      + 'Chrome은 주소창에 chrome://settings/system, Edge는 edge://settings/system',
      '그래픽 드라이버를 최신으로 갱신해 주세요',
      '최신 Chrome이나 Edge로 열어 주세요',
      '브라우저 창을 모두 닫고 완전히 다시 켜 주세요',
    ],
  },
  lost: {
    title: '그래픽 장치와의 연결이 끊겼습니다',
    maybe: [
      '드라이버가 갱신되거나 다시 시작됐습니다',
      '절전으로 전환되었다가 돌아왔습니다',
      '다른 프로그램이 GPU를 초기화했습니다',
    ],
    next: [
      'GPU를 크게 쓰는 다른 프로그램(게임·영상 편집 등)을 닫아 주세요',
      '「3D 다시 세우기」를 눌러 주세요',
      '계속되면 브라우저 창을 모두 닫고 다시 켜 주세요',
    ],
  },
  scene: {
    title: '화면을 그리다 멈췄습니다',
    maybe: [
      '이 장면의 자료 한 조각이 깨졌거나 아직 안 만들어졌습니다',
      '설치된 에셋과 앱의 판이 어긋났습니다',
    ],
    // ⚠️ **설치 화면으로 가는 길은 타이틀에 늘 서 있지 않다.** 뒤에서 훑은
    // 검사가 어긋난 에셋을 찾았을 때만 「어긋난 에셋 다시 만들기」가 선다
    // (`TitleScreen`) — 그 단추 이름을 글자 그대로 가리킨다
    next: [
      '「마지막 리포트로 돌아가기」 뒤 타이틀에 「어긋난 에셋 다시 만들기」가 보이면, '
      + '그것으로 그 그룹을 다시 만들어 주세요',
      '앱을 막 갱신했다면 창을 닫고 다시 열어 주세요 — 설치된 에셋과 판이 어긋났을 수 있습니다',
    ],
  },
  timeout: {
    title: '3D를 다시 세우지 못했습니다',
    maybe: [
      '새 그래픽 장치는 열렸지만 첫 화면이 나오지 않았습니다',
      '장치가 계속 불안정한 상태일 수 있습니다',
    ],
    next: [
      'GPU를 크게 쓰는 다른 프로그램(게임·영상 편집 등)을 닫아 주세요',
      '「3D 다시 세우기」를 눌러 주세요',
      '계속되면 브라우저 창을 모두 닫고 다시 켜 주세요',
    ],
  },
}

/** 원문 칸의 이름. **누가 준 말인지**를 적는다 — 우리 말과 남의 말을 가른다 */
const RAW_LABEL: Record<Fault, string> = {
  lost: '브라우저 메시지',
  init: '오류 메시지',
  scene: '오류 메시지',
  timeout: '오류 메시지',
}

interface TroubleInput {
  fault: Fault | null
  reason: string | null
  summary: string | null
  api: string | null
  backend: string | null
}

/**
 * 창에 적을 것 — 상태만 보고 정한다 (시험이 읽는다).
 *
 * ⚠️ **관찰된 것만 적는다.** 모르는 칸은 아예 안 그린다 — 빈 값을 「없음」으로
 * 읽히게 두면 그것도 하나의 단정이 된다
 */
export function troubleView(s: TroubleInput) {
  const fault = s.fault ?? 'lost'
  const said = SAID[fault]
  const raw = s.reason !== null && s.reason !== '' ? s.reason : null
  // 우리 한 줄이 있으면 원문은 접는다 — 사람이 먼저 읽을 것은 우리 말이다
  const folded = s.summary !== null ? raw : null
  const seen: (readonly [string, string])[] = []
  if (s.api !== null) seen.push(['그래픽 API', s.api])
  if (s.backend !== null) seen.push(['렌더러', s.backend])
  // ⚠️ **시간 초과는 우리 판단이다.** 브라우저가 준 말이 없으므로 원문 칸이 아니라
  // 제 이름으로 적는다 (`rendererStore`의 `markRecoveryTimedOut`)
  if (fault === 'timeout') {
    seen.push(['시간 초과', `${String(Math.round(RECOVERY_TIMEOUT_MS / 1000))}초 안에 첫 화면이 나오지 않았습니다`])
  }
  if (raw !== null && folded === null) seen.push([RAW_LABEL[fault], raw])
  // ⚠️ **init에서는 돌아갈 리포트가 없다.** 다시 켜면 타이틀이 뜨고, 이어하기를
  // 누르면 같은 브라우저 설정으로 같은 실패가 난다 — 그 단추는 「타이틀로」다
  const leave = fault === 'init' ? '타이틀로' : '마지막 리포트로 돌아가기'
  const copy = [
    said.title,
    ...(s.summary !== null ? [s.summary] : []),
    ...seen.map(([label, value]) => `${label}: ${value}`),
    ...(folded !== null ? [`오류 원문: ${folded}`] : []),
  ].join('\n')
  return { ...said, summary: s.summary, seen, folded, leave, copy }
}

export function RendererTrouble() {
  const phase = useRendererStore((s) => s.phase)
  const fault = useRendererStore((s) => s.fault)
  const reason = useRendererStore((s) => s.reason)
  const summary = useRendererStore((s) => s.summary)
  const api = useRendererStore((s) => s.api)
  const backend = useRendererStore((s) => s.backend)
  const retry = useRendererStore((s) => s.retry)
  const giveUp = useRendererStore((s) => s.giveUp)
  // 복사한 글을 기억한다 — 다음 실패의 창에 「복사했습니다」가 남지 않게 글로 맞댄다
  const [copied, setCopied] = useState<string | null>(null)

  // 정상일 때는 아무것도 안 그린다. 복구 중에도 화면은 남는다 — 사라지면
  // 사람이 「고쳐졌나?」 하고 누르기 시작한다
  if (phase === 'live' || phase === 'ready' || phase === 'initializing') return null

  const view = troubleView({ fault, reason, summary, api, backend })
  const recovering = phase === 'recovering'
  const isInit = fault === 'init'

  /**
   * 관찰된 것을 클립보드로.
   *
   * ⚠️ **실패는 조용히 넘긴다.** 권한이 없거나 안전하지 않은 출처면 거부된다 —
   * 그때도 글은 끌어서 고를 수 있다 (`rendererTrouble.css`의 `detail`)
   */
  const copyOut = () => {
    const clip = globalThis.navigator.clipboard as Clipboard | undefined
    if (clip === undefined) return
    const text = view.copy
    clip.writeText(text).then(() => { setCopied(text) }, () => undefined)
  }

  return (
    <div className={css.over} role="alertdialog" aria-modal="true" aria-labelledby="rp-gpu-title">
      <div className={css.panel}>
        <h2 id="rp-gpu-title" className={css.title}>
          {recovering ? '3D를 다시 세우는 중입니다' : view.title}
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
                {view.summary !== null && <p className={css.body}>{view.summary}</p>}
                <p className={css.body}>
                  진행은 마지막으로 저장한 리포트까지 그대로 있습니다.
                  지금 상태를 대신 저장하지는 않습니다.
                </p>
                <div>
                  <p className={css.head}>가능한 원인 (확정된 것이 아닙니다)</p>
                  <ul className={css.list}>
                    {view.maybe.map((one) => <li key={one}>{one}</li>)}
                  </ul>
                </div>
                <div>
                  <p className={css.head}>다음에 해 볼 것</p>
                  <ol className={css.list}>
                    {view.next.map((one) => <li key={one}>{one}</li>)}
                  </ol>
                </div>
              </>
            )}
        {(view.seen.length > 0 || view.folded !== null) && (
          <div>
            <div className={css.headRow}>
              <p className={css.head}>지금 관찰된 것</p>
              <button type="button" className={css.copy} onClick={copyOut}>
                {copied === view.copy ? '복사했습니다' : '복사'}
              </button>
            </div>
            {/*
              ⚠️ **브라우저·예외가 준 원문을 번역하거나 다듬지 않는다.** 그대로
              옮겨 적어야 제보가 쓸모 있고, 우리가 지어낸 말로 바꾸면 검색해도
              아무것도 안 나온다. 거꾸로 **우리 말은 원문 칸에 안 넣는다** —
              시간 초과는 제 이름으로, 어디서 터졌는지는 위 한 줄로 적는다
            */}
            {view.seen.length > 0 && (
              <pre className={css.detail}>
                {view.seen.map(([label, value]) => `${label}: ${value}`).join('\n')}
              </pre>
            )}
            {view.folded !== null && (
              <details className={css.fold}>
                <summary className={css.foldHead}>오류 원문</summary>
                <pre className={css.detail}>{view.folded}</pre>
              </details>
            )}
          </div>
        )}
        {!recovering && isInit && (
          <p className={css.body}>설정을 바꾸고 다시 켜 주세요.</p>
        )}
        <div className={css.row}>
          {/*
            ⚠️ **자동 재시도가 아니다.** 자동은 한 판에 한 번뿐이고
            (`MAX_AUTO_RECOVERY`), 그 뒤로는 사람이 누를 때만 다시 세운다 —
            장치가 계속 죽는 기계에서 우리끼리 무한히 도는 것을 막는 자리다.
            ⚠️ init에서는 **보조 단추다.** 설정을 안 바꾸고 다시 세우면 같은
            까닭으로 또 실패한다 — 앞에 서는 것은 「타이틀로」다
          */}
          {!recovering && (
            <button
              type="button"
              className={isInit ? css.minor : css.button}
              onClick={() => { retry() }}
            >
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
            수동 저장이 뜻하는 바 그대로다. 다시 켜면 타이틀이 뜨고, 그
            리포트는 「이어하기」에 있다
          */}
          <button
            type="button"
            className={css.primary}
            onClick={() => { globalThis.location.reload() }}
          >
            {view.leave}
          </button>
        </div>
      </div>
    </div>
  )
}
