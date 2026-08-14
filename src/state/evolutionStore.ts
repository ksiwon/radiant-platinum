// 진화를 기다리는 자리들 (PARITY §3.1)
//
// 원작은 배틀이 끝날 때 `leveledUpMonsMask`를 하나씩 꺼내 보고, 진화하는
// 마리가 나오면 그 자리에서 진화 장면으로 넘어간다
// (`Battle_FindEvolvingPartyMember`). 그 비트마스크가 이 큐다.
//
// **어느 자리가 무엇 때문에 걸렸는가**만 담는다. 진짜 판단(`evolutionTarget`)은
// 종족표가 있어야 하고 그 표는 화면이 받아 오므로, 여기서 미리 계산하지 않는다.
//
// ⚠️ **무엇이 걸었는지를 같이 담아야 한다.** 자리 번호만 담으면 화면이 다시
// 판단할 때 「레벨이 올랐다」로만 볼 수밖에 없고, 그러면 **도구로 거는 진화가
// 통째로 죽는다** — 돌은 사라지는데 아무 일도 안 일어난다. 원작도 진화 호출에
// `context`를 같이 넘긴다 (`Pokemon_GetEvolutionTargetSpecies`).
import { create } from 'zustand'

/** 큐에 든 한 자리. `item`이 있으면 그 도구가 건 것이다 */
export interface EvolutionPending {
  slot: number
  /** 도구로 걸었으면 그 번호. 레벨업이면 없다 */
  item?: number
}

interface EvolutionStore {
  /** 아직 확인 안 한 파티 자리. 원작의 `leveledUpMonsMask`와 같은 뜻이다 */
  pending: EvolutionPending[]
  /** 걸린 자리를 큐에 넣는다. 같은 자리는 한 번만 */
  queue: (slots: readonly number[], item?: number) => void
  /** 맨 앞 자리를 꺼낸다. 없으면 null */
  take: () => EvolutionPending | null
  clear: () => void
}

export const useEvolutionStore = create<EvolutionStore>()((set, get) => ({
  pending: [],

  queue: (slots, item) => {
    set((s) => {
      const next = [...s.pending]
      for (const slot of slots) {
        if (!next.some((p) => p.slot === slot)) next.push(item === undefined ? { slot } : { slot, item })
      }
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
