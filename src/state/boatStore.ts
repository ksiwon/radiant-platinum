// 배로 건너가기가 도는가 (`ScrCmd_PlayBoatCutscene` · `scene/boatCutscene`) — 스크립트는 이것이 내려갈 때까지 선다
import { create } from 'zustand'

interface BoatStore {
  on: boolean
  start: () => void
  finish: () => void
}

export const useBoatStore = create<BoatStore>()((set) => ({
  on: false,
  start: () => { set({ on: true }) },
  finish: () => { set({ on: false }) },
}))
