// /play — 오버월드. 게임 청크 마운트·입력 활성화와 오버월드 DOM 오버레이.
//
// 대사창을 여기서 그린다. App에서 그리면 엔진 모듈(→ three)이 초기 청크의
// 정적 그래프에 들어와서 타이틀 화면이 three를 끌고 오게 된다 (PLAN §10.4)
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { setGameActive } from '../engine/input/keyboard'
import { exitLook, requestLook, setMouseActive } from '../engine/input/mouse'
import { useOptionsStore } from '../state/optionsStore'
import { useSaveStore } from '../state/saveStore'
import { useSessionStore } from '../state/sessionStore'
import { MessageBox } from '../ui/field/MessageBox'
import { FishingBox } from '../ui/field/FishingBox'
import { PokemonPreview } from '../ui/field/PokemonPreview'
import { HatchScreen } from '../ui/menu/HatchScreen'
import { FadeOverlay } from '../ui/field/FadeOverlay'
import { MenuLayer } from '../ui/menu/MenuLayer'
import { PoketchWidget } from '../ui/poketch/PoketchWidget'

export function PlayRoute() {
  const navigate = useNavigate()
  const setPhase = useSessionStore((s) => s.setPhase)
  const mountStage = useSessionStore((s) => s.mountStage)

  // 타이틀을 안 거치고 /play로 바로 들어올 수 있다. 그때도 리포트는 봐야 한다
  useEffect(() => {
    if (!useSaveStore.getState().hydrated) void useSaveStore.getState().loadReport()
  }, [])

  // V로 시점을 바꾼다. 휠과 설정 화면에도 같은 항목이 있고 값은 한 곳에만 있다.
  //
  // 1인칭으로 들어가면 곧바로 시선을 잡는다 — 키를 누른 것이 사용자 동작이라
  // 브라우저가 이 자리에서는 허락한다. 클릭을 한 번 더 시키지 않는다
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'KeyV' || e.repeat) return
      const options = useOptionsStore.getState()
      const next = options.view === 0 ? 1 : 0
      options.set('view', next)
      if (next === 1) requestLook()
      else exitLook()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  useEffect(() => {
    mountStage() // 멱등 — 이미 켜져 있으면 그대로 둔다
    setGameActive(true)
    setMouseActive(true)
    setPhase('overworld')
    // Escape는 이제 시작 메뉴가 먼저 가져간다 (캡처 단계). 메뉴가 안 떠 있고
    // 스크립트도 안 돌 때만 여기까지 내려온다 — 그때는 타이틀로 나간다
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !e.defaultPrevented) navigate('/')
    }
    window.addEventListener('keydown', onEsc)
    return () => {
      setGameActive(false)
      setMouseActive(false)
      setPhase('title')
      window.removeEventListener('keydown', onEsc)
    }
  }, [navigate, setPhase, mountStage])

  return (
    <>
      <MessageBox />
      <FishingBox />
      <PokemonPreview />
      <HatchScreen />
      <FadeOverlay />
      <PoketchWidget />
      <MenuLayer />
    </>
  )
}
