// 소지금·코인 창 (`FieldMenu_CreateMoneyWindow` · `FieldMenu_DrawCoinWindow`)
//
// 스크립트가 열고 스크립트가 닫는 작은 창이다. 상점·육성가·게임코너 앞에서
// 「지금 얼마 있는지」를 띄워 두는 자리 — 필드 스크립트에서 가장 자주 나오는
// 명령 셋이 이것이다 (`ShowMoney` 17 · `HideMoney` 46 · `UpdateMoneyDisplay` 15).
//
// ⚠️ **값을 실시간으로 읽지 않는다.** 원작은 창을 만들 때와 `Update…`를 부를
// 때만 숫자를 다시 찍는다. 스크립트가 돈을 깎고 나서 `UpdateMoneyDisplay`를
// 부르기 전까지는 **옛 숫자가 그대로 떠 있는 것**이 원작의 모습이라, 우리도
// 그 순간의 값을 붙잡아 둔다.
import { create } from 'zustand'

/** 떠 있는 창 하나 — 타일 좌표와 붙잡은 값 */
export interface CurrencyWindow {
  /** 8픽셀 타일 단위. 256×192 화면 기준이다 */
  left: number
  top: number
  value: number
}

interface CurrencyStore {
  money: CurrencyWindow | null
  coins: CurrencyWindow | null
  showMoney: (left: number, top: number, value: number) => void
  hideMoney: () => void
  updateMoney: (value: number) => void
  showCoins: (left: number, top: number, value: number) => void
  hideCoins: () => void
  updateCoins: (value: number) => void
}

export const useCurrencyStore = create<CurrencyStore>()((set) => ({
  money: null,
  coins: null,
  showMoney: (left, top, value) => { set({ money: { left, top, value } }) },
  hideMoney: () => { set({ money: null }) },
  // 안 떠 있으면 아무 일도 안 한다 — 원작도 창 포인터가 비어 있으면 안 찍는다
  updateMoney: (value) => {
    set((s) => (s.money === null ? {} : { money: { ...s.money, value } }))
  },
  showCoins: (left, top, value) => { set({ coins: { left, top, value } }) },
  hideCoins: () => { set({ coins: null }) },
  updateCoins: (value) => {
    set((s) => (s.coins === null ? {} : { coins: { ...s.coins, value } }))
  },
}))
