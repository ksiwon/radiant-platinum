// 부팅 화면 (IMPORT.md §7 · §13-3)
//
// `boot()`이 정한 갈래를 그린다. 세 가지가 지켜져야 한다:
//
//   · 설치 전에는 **콘텐츠를 한 번도 안 부른다.** 그래서 `<App />`을 아예 안 그린다 —
//     그리면 타이틀 음악·UI 글·맵 미리받기가 곧바로 나간다
//   · 설치가 끝나면 **다시 켜지 않고** 그 자리에서 넘어간다
//   · 다시 켜도 같은 자리로 돌아온다 (`install.json`이 정본이라 그렇다)
//
// ⚠️ **`boot()`이 던져도 화면이 서야 한다.** 예전에는 거부를 아무도 안 받아서
// 상태가 `null`인 채로 「준비하는 중…」이 영원히 떠 있었다 — 오류도 단추도 없이.
// 그 갈래는 `data-boot="error"`로 적고 다시 시도할 길을 둔다 (IMPORT.md §4)
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { App } from './App'
import { boot, type BootState } from './boot'
import { dayTheme } from '../ui/theme/day.css'

const ImportWizard = lazy(() => import('../import/ui/ImportWizard')
  .then((m) => ({ default: m.ImportWizard })))

export function BootGate() {
  const [state, setState] = useState<BootState | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    void boot()
      .then((got) => { if (alive) setState(got) })
      .catch((e: unknown) => {
        if (!alive) return
        // ⚠️ **unsupported로 위장하지 않는다.** 그 갈래는 「이 브라우저로는 못 한다」고
        // 말하는데, 여기 온 것은 무엇이 터졌는지 모르는 경우다
        document.documentElement.dataset.boot = 'error'
        setFailed(e instanceof Error ? `${e.name}: ${e.message}` : String(e))
      })
    return () => { alive = false }
  }, [tick])

  // ⚠️ **부팅이 새로 끝났을 때만 새 값이다.** 설치 화면은 이 값이 바뀌는 것을 보고
  // 「다시 확인했다」를 안다 — 렌더마다 새 객체를 주면 확인이 끝나기도 전에 끝났다고 한다
  const why = useMemo(() => (state?.kind === 'install'
    ? { reason: state.reason, detail: state.detail, raw: state.raw }
    : undefined), [state])

  if (failed !== null) {
    return (
      <BootError
        cause={failed}
        onRetry={() => { setFailed(null); setState(null); setTick((t) => t + 1) }}
      />
    )
  }
  if (!state) return <Splash>{'준비하는 중…'}</Splash>
  if (state.kind === 'play') return <App />

  // ⚠️ **테마 클래스를 여기서도 붙인다.** `dayTheme`이 `--panel-text`·`--font-ui`·
  // `--panel-border`를 **정의하는 유일한 자리**인데, 그동안 `App`의 `<div>`에만
  // 붙어 있었다. 설치 화면은 `App` 대신 그려지므로 그 변수들이 하나도 안 풀렸고,
  // **배포된 첫 화면의 글자색과 글꼴이 통째로 기본값**이었다 — 어두운 배경 위
  // 어두운 글자라 안 읽혔다. 개발에서는 마법사를 `App` 안에서 열어 보므로
  // 멀쩡해 보였다: 개발만 보던 것과 사용자가 보던 것이 달랐던 자리다
  return (
    <div className={dayTheme} style={{ height: '100%' }}>
      <Suspense fallback={<Splash>{'설치 화면을 여는 중…'}</Splash>}>
        <ImportWizard
          from="boot"
          // 여기서는 돌아갈 타이틀이 없다. 단추는 「설치 상태 다시 확인」이고, 누르면
          // 부팅을 다시 묻는다 — 기록이 ready가 됐으면 그 자리에서 게임으로 넘어간다
          onClose={() => { setTick((t) => t + 1) }}
          onReady={() => { setTick((t) => t + 1) }}
          // 왜 설치 화면이 떴는가. 화면이 그 말을 해야 사용자가 할 일을 안다
          why={why}
        />
      </Suspense>
    </div>
  )
}

/**
 * 앱 셸만으로 된 화면.
 *
 * ⚠️ **글꼴도 그림도 안 부른다.** 여기가 뜨는 상황은 설치본이 없는 때이고,
 * 그때 무언가를 부르면 그것이 곧 404다
 */
function Splash({ children }: { children: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center',
      background: '#0f1420', color: '#dfe6f5', fontSize: 14, letterSpacing: '0.04em',
    }}>
      {children}
    </div>
  )
}

/**
 * 부팅이 던졌을 때. `Splash`와 같은 규칙이다 — 글꼴·그림·테마 없이 인라인 스타일만.
 *
 * 원인은 한 줄이고 **고를 수 있게** 둔다 (`index.html`의 `body`가 `user-select: none`이다).
 * 다시 시도는 부팅을 한 번 더 묻는 것이다 — 저장소가 잠깐 막혔던 것이면 그것으로 풀린다
 */
function BootError({ cause, onRetry }: { cause: string; onRetry: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', padding: 16,
      background: '#0f1420', color: '#dfe6f5', fontSize: 14, lineHeight: 1.7,
    }}>
      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontWeight: 700 }}>{'게임을 준비하지 못했습니다'}</div>
        <div>{'브라우저 저장소를 읽는 중에 멈췄습니다. 다시 시도해도 같으면 탭을 닫았다가 다시 열어 주세요.'}</div>
        <div style={{ color: '#9aa6bf', fontSize: 12, userSelect: 'text', wordBreak: 'break-all' }}>
          {cause}
        </div>
        <div>
          <button
            onClick={onRetry}
            style={{
              padding: '6px 14px', fontSize: 14, color: '#0f1420', background: '#dfe6f5',
              border: '2px solid #9aa6bf', borderRadius: 4, cursor: 'pointer',
            }}
          >
            {'다시 시도'}
          </button>
        </div>
      </div>
    </div>
  )
}
