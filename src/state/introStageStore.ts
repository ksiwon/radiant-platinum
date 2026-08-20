import { create } from 'zustand'

type IntroVisualScene = 'off' | 'rowan' | 'ball' | 'buneary' | 'gender' | 'player' | 'rival'

interface IntroStageStore {
  scene: IntroVisualScene
  gender: 'boy' | 'girl'
  start: () => void
  show: (scene: Exclude<IntroVisualScene, 'off'>) => void
  setGender: (gender: 'boy' | 'girl') => void
  clear: () => void
}

export const useIntroStageStore = create<IntroStageStore>()((set) => ({
  scene: 'off',
  gender: 'girl',
  start: () => {
    set({ scene: 'rowan', gender: 'girl' })
  },
  show: (scene) => {
    set({ scene })
  },
  setGender: (gender) => {
    set({ gender })
  },
  clear: () => {
    set({ scene: 'off' })
  },
}))
