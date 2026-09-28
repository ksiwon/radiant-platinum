// 스크립트가 낱말을 묻는다 (`ChooseCustomMessageWord` · `ChooseTwoCustomMessageWords` → `sub_0203D80C`)
//
// 한 낱말(`EASY_CHAT_TYPE_ONE_WORD`)이거나 두 낱말(`…_TWO_WORDS`)이다. 스크립트는 답이 올 때까지 서고, 답은
// 「결정했는가」와 낱말들이다 — 그만두면 결정 안 함이고 낱말은 처음 것 그대로다.
import { create } from 'zustand'

interface Ask {
  /** 물음마다 새 번호 — 화면이 물음마다 새로 선다 */
  id: number
  /** 칸 수 — 1 또는 2 */
  count: 1 | 2
  /** 처음 낱말 (`EasyChatArgs_SetOneWord` · `…SetTwoWords`). 빈 칸은 `0xFFFF` */
  words: readonly number[]
}

interface Answer {
  ok: boolean
  words: readonly number[]
}

interface EasyChatAskStore {
  ask: Ask | null
  answer: Answer | null
  open: (ask: Omit<Ask, 'id'>) => void
  finish: (answer: Answer) => void
  /** 스크립트가 답을 가져간다 */
  take: () => Answer | null
}

let asked = 0

export const useEasyChatAskStore = create<EasyChatAskStore>()((set, get) => ({
  ask: null,
  answer: null,
  open: (ask) => { set({ ask: { ...ask, id: ++asked }, answer: null }) },
  finish: (answer) => { set({ ask: null, answer }) },
  take: () => {
    const a = get().answer
    if (a !== null) set({ answer: null })
    return a
  },
}))
