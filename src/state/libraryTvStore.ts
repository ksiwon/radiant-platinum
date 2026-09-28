// 도서관 텔레비전이 떠 있는가 (`StartLibraryTV`) — 스크립트는 이것이 내려갈 때까지 선다
import { create } from 'zustand'

interface LibraryTvStore {
  on: boolean
  open: () => void
  close: () => void
}

export const useLibraryTvStore = create<LibraryTvStore>()((set) => ({
  on: false,
  open: () => { set({ on: true }) },
  close: () => { set({ on: false }) },
}))
