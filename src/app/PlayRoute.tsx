// /play — 오버월드. 게임 청크 마운트·입력 활성화와 오버월드 DOM 오버레이.
//
// 대사창을 여기서 그린다. App에서 그리면 엔진 모듈(→ three)이 초기 청크의
// 정적 그래프에 들어와서 타이틀 화면이 three를 끌고 오게 된다 (PLAN §10.4)
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { setGameActive } from '../engine/input/keyboard'
import { useSessionStore } from '../state/sessionStore'
import { MessageBox } from '../ui/field/MessageBox'
import { MenuLayer } from '../ui/menu/MenuLayer'

export function PlayRoute() {
  const navigate = useNavigate()
  const setPhase = useSessionStore((s) => s.setPhase)
  const mountStage = useSessionStore((s) => s.mountStage)

  useEffect(() => {
    mountStage() // 멱등 — 이미 켜져 있으면 그대로 둔다
    setGameActive(true)
    setPhase('overworld')
    // Escape는 이제 시작 메뉴가 먼저 가져간다 (캡처 단계). 메뉴가 안 떠 있고
    // 스크립트도 안 돌 때만 여기까지 내려온다 — 그때는 타이틀로 나간다
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !e.defaultPrevented) navigate('/')
    }
    window.addEventListener('keydown', onEsc)
    return () => {
      setGameActive(false)
      setPhase('title')
      window.removeEventListener('keydown', onEsc)
    }
  }, [navigate, setPhase, mountStage])

  return (
    <>
      <MessageBox />
      <MenuLayer />
    </>
  )
}
