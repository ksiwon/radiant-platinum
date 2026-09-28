// 깨어진 세계로 빨려 드는 연출이 도는가 (`DoDWWarp` · `dw_warp/dw_warp.c`) — 스크립트는 이것이 내려갈 때까지 선다
import { create } from 'zustand'

interface DwWarpStore {
  on: boolean
  start: () => void
  finish: () => void
}

export const useDwWarpStore = create<DwWarpStore>()((set) => ({
  on: false,
  start: () => { set({ on: true }) },
  finish: () => { set({ on: false }) },
}))
