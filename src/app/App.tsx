// 라우터 — Canvas는 라우트 트리 *위* (PLAN §3.3). 라우트는 DOM 오버레이만 렌더한다.
//
// 코드 스플리팅 (PLAN §10.4): three.js와 엔진은 이 모듈의 정적 그래프에 들어오면 안 된다.
// 타이틀 화면은 three.js 없이 뜨고, 게임 청크는 /play 진입 시점에 지연 로드된다.
// 한번 마운트되면 라우트가 바뀌어도 언마운트하지 않으므로 영속 Canvas 불변식은 유지된다.
import { type ComponentType, lazy, Suspense, useEffect, useState } from 'react'
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
// 인트로는 three를 안 쓴다. 그래도 타이틀 청크에 안 넣는 이유는 대사 인쇄기와
// 뱅크 로더를 끌고 오기 때문이다 — "이어하기"로 들어오면 한 번도 안 쓴다
const IntroRoute = lazy(() =>
  import('../ui/intro/IntroScreen').then((m) => ({ default: m.IntroScreen })))

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
            path="/intro"
            element={
              <Suspense fallback={null}>
                <IntroRoute />
              </Suspense>
            }
          />
          <Route
            path="/play"
            element={
              <Suspense fallback={null}>
                <PlayRoute />
              </Suspense>
            }
          />
        </Routes>
        {/*
          ` — 확인 지점. 라우터 **안**에 두는 이유는 타이틀에서 고르면
          `/play`로 넘어가야 하기 때문이다. 프로덕션에서는 이 가지가 접힌다
        */}
        {import.meta.env.DEV && <DevWarpHost />}
      </BrowserRouter>
    </div>
  )
}

/**
 * 확인 지점 화면을 백틱(`)으로 여닫는다 — **시험용이고 배포 빌드에 없다.**
 *
 * 화면은 `import.meta.env.DEV` 안에서만 부르는 동적 import로 받는다. 그래서
 * 프로덕션에서는 `ui/dev/*`가 청크로도 나오지 않는다 — `lazy()`를 모듈 꼭대기에
 * 두면 그 가지가 늘 살아 있어서 이렇게 못 한다 (devConsole과 같은 수법).
 *
 * 이 껍데기가 아무것도 정적으로 안 끌어오는 것이 중요하다. 여기서 메뉴 스토어를
 * import 하면 그것이 타이틀 청크에 남는다 — 스택에 올리는 일은 화면이 직접 한다
 */
type DevWarp = ComponentType<{ onClose: () => void }>

function DevWarpHost() {
  const [Screen, setScreen] = useState<DevWarp | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      // 백틱(`). 게임이 쓰는 키와 하나도 안 겹치고 브라우저가 가져가는 키도 아니다.
      // `code`라 자판 배열을 안 탄다 — 두벌식에서도 같은 물리 키다
      if (e.code !== 'Backquote' || e.repeat) return
      e.preventDefault() // 어딘가에 글자로 들어가지 않게
      setOpen((was) => !was)
      void import('../ui/dev/DevWarpScreen')
        .then((m) => { setScreen(() => m.DevWarpScreen) })
        .catch((err: unknown) => { console.error('확인 지점 화면을 못 받았다', err) })
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [])

  if (!open || !Screen) return null
  return <Screen onClose={() => { setOpen(false) }} />
}
