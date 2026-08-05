// 메뉴 층 — 스택 맨 위의 화면 하나만 그린다.
//
// X 키가 시작 메뉴를 연다. 대사창이 떠 있거나 배틀 중이면 안 열린다 —
// 원작도 스크립트가 도는 동안에는 메뉴를 막는다.
import { useEffect } from 'react'
import { fieldScripts } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { BagScreen } from './BagScreen'
import { PartyScreen } from './PartyScreen'
import { PokedexScreen } from './PokedexScreen'
import { StartMenu } from './StartMenu'
import { TrainerCard } from './TrainerCard'

const OPEN_KEYS = new Set(['KeyX', 'Escape'])

export function MenuLayer() {
  const top = useMenuStore((s) => s.top)
  const open = useMenuStore((s) => s.open)
  const stackDepth = useMenuStore((s) => s.stack.length)

  useEffect(() => {
    if (stackDepth > 0) return
    const onKey = (e: KeyboardEvent): void => {
      if (!OPEN_KEYS.has(e.code)) return
      // 스크립트가 도는 중이면 그쪽이 B를 먼저 쓴다
      if (fieldScripts.ctx !== null) return
      e.preventDefault()
      e.stopPropagation()
      open('start')
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true) }
  }, [open, stackDepth])

  switch (top) {
    case 'start': return <StartMenu />
    case 'bag': return <BagScreen />
    case 'party': return <PartyScreen />
    case 'pokedex': return <PokedexScreen />
    case 'trainerCard': return <TrainerCard />
    default: return null
  }
}
