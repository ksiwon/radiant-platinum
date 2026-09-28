import { create } from 'zustand'
import type { HofBeat } from '../scene/hallOfFameChoreo'

type HallOfFameStageMode = 'off' | 'ceremony' | 'archive'
type HallOfFameStagePhase = 'hidden' | 'solo' | 'player' | 'party' | 'confetti'

interface HallOfFameVisualMon {
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
  /**
   * 등록 장면의 걸음과 그 걸음에 들어선 때 (`performance.now()`). 3D 쪽이 이것으로 원작 좌표를 프레임마다 다시 짠다 —
   * DOM의 창과 같은 식(`hallOfFameChoreo`)을 읽으므로 둘이 안 어긋난다
   */
  beat: HofBeat
  since: number
  startCeremony: (mons: readonly HallOfFameVisualMon[], gender: 'boy' | 'girl') => void
  setMons: (mons: readonly HallOfFameVisualMon[]) => void
  setCue: (beat: HofBeat, selected: number) => void
  showArchive: (mons: readonly HallOfFameVisualMon[], selected: number) => void
  clear: () => void
}

const OFF = {
  mode: 'off' as const,
  phase: 'hidden' as const,
  mons: [] as HallOfFameVisualMon[],
  selected: 0,
  gender: 'girl' as const,
  beat: 'fadeIn' as HofBeat,
  since: 0,
}

/** 걸음 → 3D 장면의 큰 갈래 */
function phaseOf(beat: HofBeat): HallOfFameStagePhase {
  switch (beat) {
    case 'monIn': case 'monSettle': case 'monText1': case 'monText2': case 'monText3': case 'monHold': case 'monOut':
      return 'solo'
    case 'playerIn': case 'playerHold': case 'expand': case 'playerText':
      return 'player'
    case 'partyIn': case 'partyHold': case 'wipe':
      return 'party'
    case 'confetti':
      return 'confetti'
    default:
      return 'hidden'
  }
}

/** 명예의 전당 DOM 글과 영속 3D Canvas 사이의 장면 상태 다리. */
export const useHallOfFameStageStore = create<HallOfFameStageStore>()((set) => ({
  ...OFF,
  startCeremony: (mons, gender) => {
    set({ mode: 'ceremony', phase: 'hidden', mons: [...mons], selected: 0, gender, beat: 'fadeIn', since: performance.now() })
  },
  setMons: (mons) => {
    set({ mons: [...mons] })
  },
  setCue: (beat, selected) => {
    set((state) => (state.mode === 'ceremony'
      ? { beat, since: performance.now(), phase: phaseOf(beat), selected }
      : state))
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
