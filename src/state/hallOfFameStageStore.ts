import { create } from 'zustand'

export type HallOfFameStageMode = 'off' | 'ceremony' | 'archive'
export type HallOfFameStagePhase = 'hidden' | 'solo' | 'player' | 'party' | 'confetti'

export interface HallOfFameVisualMon {
  species: number
  form: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
}

interface HallOfFameStageStore {
  mode: HallOfFameStageMode
  phase: HallOfFameStagePhase
  mons: HallOfFameVisualMon[]
  selected: number
  gender: 'boy' | 'girl'
  startCeremony: (mons: readonly HallOfFameVisualMon[], gender: 'boy' | 'girl') => void
  setMons: (mons: readonly HallOfFameVisualMon[]) => void
  setCeremony: (phase: HallOfFameStagePhase, selected?: number) => void
  showArchive: (mons: readonly HallOfFameVisualMon[], selected: number) => void
  clear: () => void
}

const OFF = {
  mode: 'off' as const,
  phase: 'hidden' as const,
  mons: [] as HallOfFameVisualMon[],
  selected: 0,
  gender: 'girl' as const,
}

/** 명예의 전당 DOM 글과 영속 3D Canvas 사이의 장면 상태 다리. */
export const useHallOfFameStageStore = create<HallOfFameStageStore>()((set) => ({
  ...OFF,
  startCeremony: (mons, gender) => {
    set({ mode: 'ceremony', phase: 'hidden', mons: [...mons], selected: 0, gender })
  },
  setMons: (mons) => {
    set({ mons: [...mons] })
  },
  setCeremony: (phase, selected = 0) => {
    set((state) => (state.mode === 'ceremony' ? { phase, selected } : state))
  },
  showArchive: (mons, selected) => {
    set((state) => ({
      mode: 'archive',
      phase: 'party',
      mons: [...mons],
      selected: Math.max(0, Math.min(selected, Math.max(0, mons.length - 1))),
      gender: state.gender,
    }))
  },
  clear: () => {
    set(OFF)
  },
}))
