import { create } from 'zustand'

export type CinematicScene = 'off' | 'evolution' | 'hatch'
export type EvolutionPhase = 'changing' | 'done' | 'canceled'
export type HatchPhase = 'shaking' | 'born'

interface MonVisual {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
}

interface CinematicStore {
  scene: CinematicScene
  phase: EvolutionPhase | HatchPhase | 'off'
  before: MonVisual | null
  after: MonVisual | null
  startEvolution: (before: MonVisual, after: MonVisual) => void
  finishEvolution: () => void
  cancelEvolution: () => void
  startHatch: (mon: MonVisual) => void
  finishHatch: () => void
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
  clear: () => {
    set(OFF)
  },
}))
