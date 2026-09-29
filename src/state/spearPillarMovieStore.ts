// 창기둥 영상이 도는가 (`ScrCmd_2FB` · `overlay100`) — 스크립트는 이것이 내려갈 때까지 선다
import { create } from 'zustand'

interface SpearPillarMovieStore {
  on: boolean
  start: () => void
  finish: () => void
}

export const useSpearPillarMovieStore = create<SpearPillarMovieStore>()((set) => ({
  on: false,
  start: () => { set({ on: true }) },
  finish: () => { set({ on: false }) },
}))
