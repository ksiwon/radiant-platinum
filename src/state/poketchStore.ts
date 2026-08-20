// 포켓치의 **휘발** 상태 (PARITY §7.3)
//
// 세이브에 남는 것(등록된 앱·색·걸음·캘린더·도트아트)은 `saveStore`가 든다.
// 여기 있는 것은 리포트에 안 남는 둘이다:
//
//   ① 화면에 어떻게 떠 있는가 — 감춤 · 작게 · 크게
//   ② 앱 하나가 쓰던 값 — 계산기의 숫자, 카운터, 스톱워치…
//
// ⚠️ **②가 앱 하나뿐인 것이 원작 그대로다.** `PoketchMemory`가 12KB 버퍼
// **하나**를 모든 앱이 돌려 쓰고, 되읽을 때 `appID == activeAppID`를 본다
// (`poketch_memory.c`). 그래서 계산기에 숫자를 남기고 만보기에 갔다 오면
// 계산기가 0으로 돌아온다. 앱마다 칸을 따로 두면 그 성질이 사라진다.
import { create } from 'zustand'

/** BDSP의 R 버튼이 도는 세 자리 */
type PoketchView = 'hidden' | 'small' | 'large'

interface PoketchStore {
  view: PoketchView
  /** 지금 휘발 칸을 쓰고 있는 앱. 다른 앱이 쓰면 앞의 값은 사라진다 */
  memoryApp: number | null
  memory: unknown
  setView: (view: PoketchView) => void
  /** R을 톡 눌렀다 — 작게와 크게를 오간다. 감춰져 있으면 작게 되살린다 */
  toggleSize: () => void
  /** R을 길게 눌렀다 — 감추고 되살린다 */
  toggleHidden: () => void
  /** 그 앱의 칸을 읽는다. 마지막에 쓴 앱이 아니면 null */
  read: <T>(app: number) => T | null
  write: (app: number, value: unknown) => void
}

export const usePoketchStore = create<PoketchStore>()((set, get) => ({
  view: 'small',
  memoryApp: null,
  memory: null,

  setView: (view) => { set({ view }) },

  toggleSize: () => {
    set((s) => ({ view: s.view === 'large' ? 'small' : 'large' }))
  },

  toggleHidden: () => {
    set((s) => ({ view: s.view === 'hidden' ? 'small' : 'hidden' }))
  },

  read: <T,>(app: number): T | null => {
    const s = get()
    return s.memoryApp === app ? (s.memory as T) : null
  },

  write: (app, value) => { set({ memoryApp: app, memory: value }) },
}))

/** 앱을 넘길 때 부른다 — 앞 앱이 쓰던 값은 여기서 끝난다 */
export function clearPoketchMemory(): void {
  usePoketchStore.setState({ memoryApp: null, memory: null })
}
