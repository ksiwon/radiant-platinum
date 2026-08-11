// 진화를 기다리는 자리들 (PARITY §3.1)
//
// 원작은 배틀이 끝날 때 `leveledUpMonsMask`를 하나씩 꺼내 보고, 진화하는
// 마리가 나오면 그 자리에서 진화 장면으로 넘어간다
// (`Battle_FindEvolvingPartyMember`). 그 비트마스크가 이 큐다.
//
// **어느 자리가 레벨이 올랐는가**만 담는다. 진짜 판단(`evolutionTarget`)은
// 종족표가 있어야 하고 그 표는 화면이 받아 오므로, 여기서 미리 계산하지 않는다.
import { create } from 'zustand'

interface EvolutionStore {
  /** 아직 확인 안 한 파티 자리. 원작의 `leveledUpMonsMask`와 같은 뜻이다 */
  pending: number[]
  /** 레벨이 오른 자리를 큐에 넣는다. 같은 자리는 한 번만 */
  queue: (slots: readonly number[]) => void
  /** 맨 앞 자리를 꺼낸다. 없으면 null */
  take: () => number | null
  clear: () => void
}

export const useEvolutionStore = create<EvolutionStore>()((set, get) => ({
  pending: [],

  queue: (slots) => {
    set((s) => {
      const next = [...s.pending]
      for (const slot of slots) if (!next.includes(slot)) next.push(slot)
      return { pending: next }
    })
  },

  take: () => {
    const [head, ...rest] = get().pending
    if (head === undefined) return null
    set({ pending: rest })
    return head
  },

  clear: () => { set({ pending: [] }) },
}))
