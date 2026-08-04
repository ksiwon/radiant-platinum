// 세션 상태 — 저빈도 UI 상태만 (PLAN §3.2 ②)
import { create } from 'zustand'

export type GamePhase = 'title' | 'overworld'

interface SessionState {
  phase: GamePhase
  setPhase: (p: GamePhase) => void
  /** 게임 청크(three.js + 엔진)가 마운트됐는지. 한번 켜지면 절대 꺼지지 않는다 — 영속 Canvas 불변식(§3.3) */
  stageMounted: boolean
  mountStage: () => void
}

export const useSessionStore = create<SessionState>((set) => ({
  phase: 'title',
  setPhase: (phase) => set({ phase }),
  stageMounted: false,
  mountStage: () => set({ stageMounted: true }),
}))
