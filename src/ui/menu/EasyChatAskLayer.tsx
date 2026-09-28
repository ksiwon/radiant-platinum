// 스크립트가 낱말을 물을 때만 선다 (`ChooseCustomMessageWord` · `ChooseTwoCustomMessageWords`)
import { useEasyChatAskStore } from '../../state/easyChatAskStore'
import { EasyChatAskScreen } from './EasyChatAskScreen'

export function EasyChatAskLayer() {
  const ask = useEasyChatAskStore((s) => s.ask)
  // 물을 때마다 새로 세운다 — 앞 물음의 칸이 남지 않게
  return ask === null ? null : <EasyChatAskScreen key={ask.id} />
}
