import { create } from 'zustand'

export type CinematicScene = 'off' | 'evolution' | 'hatch' | 'trade'
export type EvolutionPhase = 'changing' | 'done' | 'canceled'
export type HatchPhase = 'shaking' | 'born'
/**
 * 교환 장면의 세 마디 (`overlay095`).
 *
 * 원작은 일곱 마디인데 그중 다섯이 **통신관을 지나가는 그림**이다 — 볼이
 * 관으로 빨려 들어가 반대편으로 나오는 DS 특유의 연출이라, 3D 무대에 그대로
 * 옮길 자리가 없다. 그 다섯을 `transit` 하나로 묶고 앞뒤 두 마디(보내는 마리가
 * 서 있는 동안 · 받는 마리가 서 있는 동안)는 원작 그대로 남긴다
 */
export type TradePhase = 'sending' | 'transit' | 'arriving'

interface MonVisual {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
}

interface CinematicStore {
  scene: CinematicScene
  phase: EvolutionPhase | HatchPhase | TradePhase | 'off'
  before: MonVisual | null
  after: MonVisual | null
  startEvolution: (before: MonVisual, after: MonVisual) => void
  finishEvolution: () => void
  cancelEvolution: () => void
  startHatch: (mon: MonVisual) => void
  finishHatch: () => void
  /** 교환. `before`가 내가 보내는 마리, `after`가 받는 마리다 */
  startTrade: (sending: MonVisual, receiving: MonVisual) => void
  setTradePhase: (phase: TradePhase) => void
  clear: () => void
}

const OFF = {
  scene: 'off' as const,
  phase: 'off' as const,
  before: null,
  after: null,
}

/** DOM 이벤트 화면과 영속 WebGL Canvas 사이의 작은 상태 다리. */
export const useCinematicStore = create<CinematicStore>()((set) => ({
  ...OFF,
  startEvolution: (before, after) => {
    set({ scene: 'evolution', phase: 'changing', before, after })
  },
  finishEvolution: () => {
    set((s) => (s.scene === 'evolution' ? { phase: 'done' } : s))
  },
  cancelEvolution: () => {
    set((s) => (s.scene === 'evolution' ? { phase: 'canceled' } : s))
  },
  startHatch: (mon) => {
    set({ scene: 'hatch', phase: 'shaking', before: null, after: mon })
  },
  finishHatch: () => {
    set((s) => (s.scene === 'hatch' ? { phase: 'born' } : s))
  },
  startTrade: (sending, receiving) => {
    set({ scene: 'trade', phase: 'sending', before: sending, after: receiving })
  },
  setTradePhase: (phase) => {
    set((s) => (s.scene === 'trade' ? { phase } : s))
  },
  clear: () => {
    set(OFF)
  },
}))
