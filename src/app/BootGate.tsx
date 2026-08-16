// 부팅 화면 (IMPORT.md §7 · §13-3)
//
// `boot()`이 정한 갈래를 그린다. 세 가지가 지켜져야 한다:
//
//   · 설치 전에는 **콘텐츠를 한 번도 안 부른다.** 그래서 `<App />`을 아예 안 그린다 —
//     그리면 타이틀 음악·UI 글·맵 미리받기가 곧바로 나간다
//   · 설치가 끝나면 **다시 켜지 않고** 그 자리에서 넘어간다
//   · 다시 켜도 같은 자리로 돌아온다 (`install.json`이 정본이라 그렇다)
import { lazy, Suspense, useEffect, useState } from 'react'
import { App } from './App'
import { boot, type BootState } from './boot'
import { dayTheme } from '../ui/theme/day.css'

const ImportWizard = lazy(() => import('../import/ui/ImportWizard')
  .then((m) => ({ default: m.ImportWizard })))

export function BootGate() {
  const [state, setState] = useState<BootState | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    void boot().then((got) => { if (alive) setState(got) })
    return () => { alive = false }
  }, [tick])

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
          onClose={() => { setTick((t) => t + 1) }}
          onReady={() => { setTick((t) => t + 1) }}
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
