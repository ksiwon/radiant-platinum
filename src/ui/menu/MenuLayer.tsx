// 메뉴 층 — 스택 맨 위의 화면 하나만 그린다.
//
// X 키가 시작 메뉴를 연다. 대사창이 떠 있거나 배틀 중이면 안 열린다 —
// 원작도 스크립트가 도는 동안에는 메뉴를 막는다.
import { useEffect } from 'react'
import { fieldScripts } from '../../engine/script/field'
import { useBattleStore } from '../../state/battleStore'
import { useMenuStore } from '../../state/menuStore'
import { ChooseStarter } from '../field/ChooseStarter'
import { BagScreen } from './BagScreen'
import { BoxScreen } from './BoxScreen'
import { EvolutionScreen } from './EvolutionScreen'
import { TradeScreen } from './TradeScreen'
import { NameScreen } from './NameScreen'
import { OptionsScreen } from './OptionsScreen'
import { PartyScreen } from './PartyScreen'
import { PokedexScreen } from './PokedexScreen'
import { FlyScreen } from './FlyScreen'
import { JournalScreen } from './JournalScreen'
import { MoveReminderScreen } from './MoveReminderScreen'
import { DiplomaScreen } from './DiplomaScreen'
import { HallOfFameScreen } from './HallOfFameScreen'
import { PCHallOfFameScreen } from './PCHallOfFameScreen'
import { BerryTagScreen } from './BerryTagScreen'
import { SaveScreen } from './SaveScreen'
import { ShopScreen } from './ShopScreen'
import { StartMenu } from './StartMenu'
import { SummaryScreen } from './SummaryScreen'
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
      // ⚠️ **배틀 중에도 안 열린다.** 위 주석은 처음부터 그렇게 적혀 있었는데
      // 실제로 막는 코드가 없었다 — 배틀에서 X를 누르면 필드 시작 메뉴가
      // 배틀 위로 올라왔다. 배틀의 X는 한 단 물러나는 키다
      if (useBattleStore.getState().phase !== 'off') return
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
    case 'summary': return <SummaryScreen />
    case 'pokedex': return <PokedexScreen />
    case 'fly': return <FlyScreen />
    case 'trainerCard': return <TrainerCard />
    case 'save': return <SaveScreen />
    case 'options': return <OptionsScreen />
    case 'shop': return <ShopScreen />
    case 'box': return <BoxScreen />
    case 'journal': return <JournalScreen />
    case 'reminder': return <MoveReminderScreen />
    case 'diploma': return <DiplomaScreen />
    case 'berryTag': return <BerryTagScreen />
    case 'chooseStarter': return <ChooseStarter />
    case 'evolution': return <EvolutionScreen />
    case 'trade': return <TradeScreen />
    case 'naming': return <NameScreen />
    case 'hallOfFame': return <HallOfFameScreen />
    case 'pcHallOfFame': return <PCHallOfFameScreen />
    // 'devWarp'은 여기서 안 그린다 — 시험용이라 배포 빌드에 들어오면 안 되고,
    // 스택에는 키를 가져가려고 올라가 있을 뿐이다 (`App`이 그린다)
    default: return null
  }
}
