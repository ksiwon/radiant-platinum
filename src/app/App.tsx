// 라우터 — Canvas는 라우트 트리 *위* (PLAN §3.3). 라우트는 DOM 오버레이만 렌더한다.
//
// 코드 스플리팅 (PLAN §10.4): three.js와 엔진은 이 모듈의 정적 그래프에 들어오면 안 된다.
// 타이틀 화면은 three.js 없이 뜨고, 게임 청크는 /play 진입 시점에 지연 로드된다.
// 한번 마운트되면 라우트가 바뀌어도 언마운트하지 않으므로 영속 Canvas 불변식은 유지된다.
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router'
import { TitleScreen } from '../ui/screens/TitleScreen'
import { PerfOverlay } from '../ui/hud/PerfOverlay'
import { ZoneBanner } from '../ui/hud/ZoneBanner'
import { BattleScreen } from '../ui/battle/BattleScreen'
import { dayTheme } from '../ui/theme/day.css'
import { installAudioUnlock } from '../engine/audio/unlock'
import { useSessionStore } from '../state/sessionStore'

const Stage = lazy(() => import('../scene/Stage').then((m) => ({ default: m.Stage })))
const PlayRoute = lazy(() => import('./PlayRoute').then((m) => ({ default: m.PlayRoute })))

let bootstrapped = false

export function App() {
  const stageMounted = useSessionStore((s) => s.stageMounted)

  useEffect(() => {
    if (bootstrapped) return
    bootstrapped = true
    // 오디오 언락은 three를 끌고 오지 않으므로 초기 청크에 남긴다.
    // 타이틀의 "게임 시작" 클릭이 첫 제스처가 되도록 일찍 설치해야 한다 (§11.1).
    installAudioUnlock()
    // 개발용 손잡이. 이 가지는 프로덕션 빌드에서 `false`로 접혀 사라지므로
    // devConsole은 청크로도 나오지 않는다
    if (import.meta.env.DEV) void import('./devConsole').then((m) => { m.installDevConsole() })
  }, [])

  return (
    <div className={dayTheme} style={{ height: '100%' }}>
      {stageMounted && (
        <Suspense fallback={null}>
          <Stage />
        </Suspense>
      )}
      <PerfOverlay />
      <ZoneBanner />
      <BattleScreen />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TitleScreen />} />
          <Route
            path="/play"
            element={
              <Suspense fallback={null}>
                <PlayRoute />
              </Suspense>
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  )
}
