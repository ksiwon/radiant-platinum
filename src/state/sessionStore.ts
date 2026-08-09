// 세션 상태 — 저빈도 UI 상태만 (PLAN §3.2 ②)
import { create } from 'zustand'

export type GamePhase = 'title' | 'overworld'

interface SessionState {
  phase: GamePhase
  setPhase: (p: GamePhase) => void
  /** 게임 청크(three.js + 엔진)가 마운트됐는지. 한번 켜지면 절대 꺼지지 않는다 — 영속 Canvas 불변식(§3.3) */
  stageMounted: boolean
  mountStage: () => void
  /**
   * 현재 서 있는 곳의 지역명("떡잎마을"). 맵 헤더의 label로 찾는다 (DATA.md §2.7).
   * 집 내부는 그 마을과 같은 이름이라 문을 여닫아도 배너가 다시 뜨지 않는다 — 원작과 같다.
   * 존 경계를 넘을 때만 바뀌므로 저빈도 UI 상태가 맞다.
   */
  zoneName: string | null
  setZoneName: (name: string | null) => void
  /**
   * 지금 서 있는 맵 헤더 번호. 없으면 -1.
   *
   * ⚠️ **`engine/map/world`를 못 보는 쪽을 위한 자리다.** 거기에도 같은 값이
   * 있지만 그 모듈은 three를 끌고 오므로, 초기 청크에 있는 스토어(배틀 등)가
   * import 하면 타이틀에 three가 딸려 온다 (`app/initialChunk.test.ts`가 막는다).
   * 존 이름과 같은 순간에 같이 바뀐다
   */
  mapId: number
  setMapId: (id: number) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  phase: 'title',
  setPhase: (phase) => set({ phase }),
  stageMounted: false,
  mountStage: () => set({ stageMounted: true }),
  zoneName: null,
  setZoneName: (zoneName) => set((s) => (s.zoneName === zoneName ? s : { zoneName })),
  mapId: -1,
  setMapId: (mapId) => set((s) => (s.mapId === mapId ? s : { mapId })),
}))
