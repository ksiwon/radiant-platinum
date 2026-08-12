// 부화 (PARITY §3.2) — `src/egg_hatch.c`.
//
// 걸음 계수기가 "이 자리의 알이 깼다"를 여기 적어 두고, 화면이 그것을 보고
// 장면을 연다. 진화(`evolutionStore`)와 같은 자리다 — 세계 쪽은 **자리 번호만**
// 넘기고 개체를 직접 안 고친다.
import { create } from 'zustand'

interface HatchStore {
  /** 깰 알의 파티 자리. 없으면 -1 */
  slot: number
  open: (slot: number) => void
  close: () => void
}

export const useHatchStore = create<HatchStore>((set) => ({
  slot: -1,
  // ⚠️ 이미 하나가 열려 있으면 안 덮는다. 원작도 한 번에 하나만 깬다
  open: (slot) => { set((s) => (s.slot >= 0 ? s : { slot })) },
  close: () => { set({ slot: -1 }) },
}))
