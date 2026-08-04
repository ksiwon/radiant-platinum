// /play — 오버월드. DOM 오버레이는 없고 게임 청크 마운트와 입력 활성화만 담당한다
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { setGameActive } from '../engine/input/keyboard'
import { useSessionStore } from '../state/sessionStore'

export function PlayRoute() {
  const navigate = useNavigate()
  const setPhase = useSessionStore((s) => s.setPhase)
  const mountStage = useSessionStore((s) => s.mountStage)

  useEffect(() => {
    mountStage() // 멱등 — 이미 켜져 있으면 그대로 둔다
    setGameActive(true)
    setPhase('overworld')
    const onEsc = (e: KeyboardEvent) => {
      if (e.code === 'Escape') navigate('/')
    }
    window.addEventListener('keydown', onEsc)
    return () => {
      setGameActive(false)
      setPhase('title')
      window.removeEventListener('keydown', onEsc)
    }
  }, [navigate, setPhase, mountStage])

  return null
}
