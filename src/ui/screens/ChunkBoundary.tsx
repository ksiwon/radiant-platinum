// 지연 청크를 못 받았을 때 (PLAN §4.6)
//
// ⚠️ **배포가 곧 이 화면의 원인이다.** 올릴 때마다 해시 붙은 청크 이름이
// 바뀌고(DEPLOY.md §3 「다시 구우면 배포물이 바뀐다」) 옛 이름은 호스트에서
// 사라진다. 탭을 열어 둔 채 새 판이 올라가면, 그 탭이 **처음 여는** 화면
// (첫 배틀·오프닝·설정)의 `import()`가 404나 `index.html`을 받고 거부된다.
// 오프라인에서 한 번도 안 연 화면도 같다. `React.lazy`는 그 거부를 렌더 중에
// 던지고, 받는 경계가 없으면 **루트가 통째로 언마운트되어** `index.html`의
// 어두운 바탕만 남는다 — 원인도 돌아갈 길도 안 보인다.
//
// ⚠️ **스스로 다시 불러오지 않는다** (PLAN §4.6). 필드 한가운데서 새로 고치면
// 마지막 리포트 뒤에 걸어온 것이 말없이 사라진다. 그래서 창을 띄우고, 잃는 것을
// 적고, **사람이 누를 때만** 다시 불러온다. `vite:preloadError`에도 손을 안
// 댄다 — 막지 않으면 Vite가 그 오류를 그대로 다시 던지고, 그것이 여기로 온다.
//
// ⚠️ **청크 실패만 받는다.** 다른 렌더 오류는 위로 그대로 넘긴다 — 배틀 화면의
// 버그를 「새 버전이 올라왔습니다」로 덮으면 다시 불러와도 또 터지고, 사람은
// 엉뚱한 데를 의심한다. 맨 바깥 경계(`outermost`)만은 넘길 곳이 없으므로
// 무엇이든 받아서 창을 띄운다.
//
// ⚠️ **3D를 한 조각도 안 잡는다.** `RendererTrouble`과 같은 몸으로 그리고, 그
// 모듈은 이미 첫 화면 청크에 있다 — 청크를 못 받는 상황에서 이 창이 또 다른
// 청크를 받아야 뜬다면 안 뜬다.
import { Component, useEffect, useId, useState, type ErrorInfo, type ReactNode } from 'react'
import { useSessionStore } from '../../state/sessionStore'
import { dayTheme } from '../theme/day.css'
import * as css from './rendererTrouble.css'

/**
 * 지연 청크를 못 받아서 난 오류인가.
 *
 * 브라우저마다 말이 다르다. 낱말을 줄여 맞추지 않는다 — 셋 다 그 브라우저가
 * 실제로 내는 문장의 앞머리다:
 *
 *   Chromium  `Failed to fetch dynamically imported module: …`
 *   WebKit    `Importing a module script failed.`
 *   Gecko     `error loading dynamically imported module: …`
 *
 * 그 밖에 둘을 더 받는다. **MIME** — 호스트가 없어진 청크 자리에 SPA 대체로
 * `index.html`을 주면 `nosniff`(`public/_headers`) 아래에서 `text/html`이
 * 모듈로 안 읽힌다. **CSS 미리받기** — 배틀 화면처럼 CSS가 따로 떨어진 청크는
 * Vite가 그 CSS를 먼저 받고, 못 받으면 `Unable to preload CSS for …`로 던진다
 */
export function isChunkLoadError(error: unknown): boolean {
  const said = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return /Failed to fetch dynamically imported module/i.test(said)
    || /Importing a module script failed/i.test(said)
    || /error loading dynamically imported module/i.test(said)
    || /Unable to preload CSS for/i.test(said)
    || /\bMIME type\b/i.test(said)
}

/** 창에 적을 말 — 지어낸 원작 대사가 아니라 이 제품의 안내다 */
interface ChunkTroubleSaid {
  title: string
  body: string[]
}

/**
 * 무엇을 적는가.
 *
 * ⚠️ **잃는 것은 필드에서만 적는다.** 타이틀·설치 화면에는 리포트 뒤의 진행이
 * 없다 — 거기서 「진행이 사라집니다」를 적으면 없는 걱정을 만든다
 *
 * @param chunk  청크 실패인가. 아니면 맨 바깥 경계가 받은 다른 렌더 오류다
 * @param online `navigator.onLine`. 거짓일 때만 연결 탓으로 적는다 — 참이라고
 *               연결이 확실하다는 뜻은 아니지만, 거짓은 브라우저가 단정한 값이다
 * @param inField 필드(`phase === 'overworld'`)에 있는가
 */
export function chunkTroubleSaid(chunk: boolean, online: boolean, inField: boolean): ChunkTroubleSaid {
  const keep = inField
    ? ['진행은 마지막으로 저장한 리포트까지 그대로 있습니다. 마지막 리포트 뒤의 진행은 사라집니다.']
    : []
  if (!chunk) {
    return {
      title: '화면을 그리다 멈췄습니다',
      body: ['다시 불러오면 처음 화면부터 다시 엽니다.', ...keep],
    }
  }
  if (!online) {
    return {
      title: '인터넷 연결을 확인해 주세요',
      body: [
        '이 화면은 아직 이 기기에 받아 두지 않아 연결 없이는 열 수 없습니다.',
        '연결된 뒤 다시 불러와 주세요.',
        ...keep,
      ],
    }
  }
  return {
    title: '새 버전이 올라와 이 화면을 받지 못했습니다',
    body: ['다시 불러오면 새 버전으로 열립니다.', ...keep],
  }
}

/** 지금 브라우저가 연결돼 있다고 말하는가. 모르면 참으로 둔다 */
function onlineNow(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

interface TroubleProps {
  error: unknown
  where: string
}

/**
 * 창 하나. 연결이 끊기거나 돌아오면 말을 바꾼다 — 창을 띄운 뒤에 와이파이를
 * 다시 잡는 사람이 「연결을 확인해 주세요」를 계속 보면 무엇을 더 하라는지 모른다
 */
export function ChunkTrouble({ error, where }: TroubleProps) {
  const [online, setOnline] = useState(onlineNow)
  // 필드인지는 **터진 그 순간**의 것이다. 창이 뜬 뒤로는 게임이 안 움직인다
  const [inField] = useState(() => useSessionStore.getState().phase === 'overworld')
  const titleId = useId()

  useEffect(() => {
    const sync = (): void => { setOnline(onlineNow()) }
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  const said = chunkTroubleSaid(isChunkLoadError(error), online, inField)
  const message = error instanceof Error ? error.message : String(error)

  return (
    // ⚠️ **테마 클래스를 여기서도 붙인다.** 맨 바깥 경계는 `App`의 테마 `<div>`
    // 바깥(`main.tsx`)에 있다 — 안 붙이면 창의 색·글꼴 변수가 하나도 안 풀린다
    // (`BootGate`가 같은 까닭으로 붙인다)
    <div className={dayTheme}>
      <div className={css.over} role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div className={css.panel}>
          <h2 id={titleId} className={css.title}>{said.title}</h2>
          {said.body.map((line) => <p key={line} className={css.body}>{line}</p>)}
          <div>
            <p className={css.head}>지금 관찰된 것</p>
            {/* 브라우저가 준 말은 다듬지 않는다 — `RendererTrouble`과 같은 까닭이다 */}
            <pre className={css.detail}>{`받지 못한 자리: ${where}\n브라우저가 준 말: ${message}`}</pre>
          </div>
          <div className={css.row}>
            {/*
              ⚠️ **누를 때만 다시 불러온다.** 자동으로 하면 필드의 진행이 말없이
              사라진다 (PLAN §4.6). 다시 불러오면 화면 이동이 네트워크를 먼저
              타므로(`public/sw.js`) 새 판의 `index.html`과 청크 이름을 받는다
            */}
            <button
              type="button"
              className={css.primary}
              onClick={() => { globalThis.location.reload() }}
            >
              다시 불러오기
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface Props {
  children: ReactNode
  /** 어느 화면을 받다 멈췄는지 — 창의 「지금 관찰된 것」에 붙는다 */
  where: string
  /**
   * 맨 바깥 경계인가 (`main.tsx`). 넘길 곳이 없으므로 청크 실패가 아닌
   * 오류도 받아서 창을 띄운다 — 안 받으면 루트가 내려가 빈 화면이 된다
   */
  outermost?: boolean
}

interface State {
  error: unknown
  failed: boolean
}

export class ChunkBoundary extends Component<Props, State> {
  override state: State = { error: null, failed: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // 위로 넘기는 오류는 받는 쪽이 적는다. 두 번 적으면 한 사건이 둘로 읽힌다
    if (!this.props.outermost && !isChunkLoadError(error)) return
    console.error(`[chunk] ${this.props.where}을(를) 받지 못했다`, error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    // ⚠️ **청크 실패가 아니면 위로 그대로 던진다.** 렌더 중에 던지면 React가
    // 바로 위 경계로 넘긴다 — 3D 무대면 `SceneBoundary`, 아니면 맨 바깥 경계다
    if (!this.props.outermost && !isChunkLoadError(this.state.error)) throw this.state.error
    // ⚠️ **다시 그리려 들지 않는다.** `React.lazy`는 거부된 약속을 들고 있어서
    // 같은 나무를 다시 세우면 같은 오류를 그대로 다시 던진다. 돌아갈 길은 새로
    // 불러오기 하나다
    return <ChunkTrouble error={this.state.error} where={this.props.where} />
  }
}
