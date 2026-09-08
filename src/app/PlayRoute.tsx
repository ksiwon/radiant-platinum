// /play — 오버월드. 게임 청크 마운트·입력 활성화와 오버월드 DOM 오버레이.
//
// 대사창을 여기서 그린다. App에서 그리면 엔진 모듈(→ three)이 초기 청크의
// 정적 그래프에 들어와서 타이틀 화면이 three를 끌고 오게 된다 (PLAN §10.4)
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { setGameActive } from '../engine/input/keyboard'
import { BINDINGS } from '../engine/input/keys'
import { exitLook, requestLook, setMouseActive } from '../engine/input/mouse'
import { useOptionsStore } from '../state/optionsStore'
import { useSaveStore } from '../state/saveStore'
import { useRendererStore } from '../state/rendererStore'
import { useSessionStore } from '../state/sessionStore'
import { ControlHint } from '../ui/hud/ControlHint'
import { CurrencyWindow } from '../ui/field/CurrencyWindow'
import { SaveInfoWindow } from '../ui/field/SaveInfoWindow'
import { MessageBox } from '../ui/field/MessageBox'
import { FishingBox } from '../ui/field/FishingBox'
import { PokemonPreview } from '../ui/field/PokemonPreview'
import { HatchScreen } from '../ui/menu/HatchScreen'
import { FadeOverlay } from '../ui/field/FadeOverlay'
import { HmCutInOverlay } from '../ui/field/HmCutInOverlay'
import { CutInOverlay } from '../ui/field/CutInOverlay'
import { MenuLayer } from '../ui/menu/MenuLayer'
import { PoketchWidget } from '../ui/poketch/PoketchWidget'
import { RestoreScreen } from '../ui/screens/RestoreScreen'

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
      if (!BINDINGS.view.includes(e.code) || e.repeat) return
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

  // 렌더러를 다시 세운 뒤에 조작을 되돌린다.
  //
  // ⚠️ **위 효과가 이걸 못 한다.** 저것은 이 화면이 뜰 때 한 번만 돌고,
  // 장치 손실은 화면을 안 갈아 끼운다(Canvas만 다시 선다) — 그래서 복구가
  // 끝나도 `rendererStore`가 껐던 조작이 꺼진 채로 남아, 화면은 돌아왔는데
  // 주인공만 안 움직이는 자리가 된다.
  //
  // ⚠️ **`ready`가 아니라 `live`다** (기획서 §6.2). `ready`는 `renderer.init()`이
  // 끝난 것뿐이라 그 시점의 씬은 아직 다시 서는 중이다 — 거기서 조작을 돌려주면
  // 사람은 **아직 안 그려진 세계**를 걷는다. 한 프레임이 실제로 나간 뒤가 `live`고,
  // 그것을 적는 자리는 `scene/EngineDriver`의 프레임 콜백이다
  const rendererPhase = useRendererStore((s) => s.phase)
  useEffect(() => {
    if (rendererPhase !== 'live') return
    setGameActive(true)
    setMouseActive(true)
  }, [rendererPhase])

  return (
    <>
      <MessageBox />
      <CurrencyWindow />
      <SaveInfoWindow />
      <FishingBox />
      <PokemonPreview />
      <HatchScreen />
      <FadeOverlay />
      <HmCutInOverlay />
      <CutInOverlay />
      <PoketchWidget />
      <ControlHint />
      <MenuLayer />
      {/*
        ⚠️ **제일 뒤에 그린다.** 저장한 자리를 세우는 동안은 그 위의 대사창·
        메뉴가 아직 「저장한 곳이 아닌 세계」의 것이라 다 덮어야 한다
        (`state/restoreStore`)
      */}
      <RestoreScreen />
    </>
  )
}
