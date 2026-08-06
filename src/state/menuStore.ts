// 메뉴 화면 스택 (PLAN §3.2)
//
// 화면이 쌓인다: 시작 메뉴 → 가방 → 포켓몬(누구에게 쓸까). B는 한 겹만 벗긴다.
// 스택으로 두는 이유는 되돌아갈 자리가 화면마다 다르기 때문이다 — 가방을
// 시작 메뉴에서 열었으면 시작 메뉴로, 배틀에서 열었으면 배틀로 돌아가야 한다.
//
// 프레임 값은 여기 안 넣는다. 커서 자리처럼 화면이 혼자 쓰는 것은 컴포넌트가
// 갖고, 이 스토어는 **어느 화면이 떠 있는가**만 안다.
import { create } from 'zustand'
import { setUiCapture } from '../engine/input/keyboard'

export type MenuScreen =
  | 'start' | 'bag' | 'party' | 'pokedex' | 'trainerCard' | 'save' | 'options' | 'shop'
  // 시험용 확인 지점 화면(백틱). 스택에 올려 두는 이유는 그림이 아니라 **키** 때문이다 —
  // 스택이 비어 있지 않아야 필드 입력이 멈추고 X가 시작 메뉴를 열지 않는다.
  // 그림은 `App`이 DEV에서만 동적으로 받아 그린다
  | 'devWarp'

interface MenuStore {
  stack: MenuScreen[]
  /** 맨 위 화면. 없으면 null */
  top: MenuScreen | null
  /**
   * 상점이 팔 물건. 스크립트가 상점을 열 때 같이 준다.
   *
   * 화면 상태가 아니라 **그 화면을 여는 인자**라 여기 둔다 — 컴포넌트에 두면
   * 스크립트가 값을 건넬 길이 없다
   */
  shopStock: number[]
  open: (screen: MenuScreen) => void
  push: (screen: MenuScreen) => void
  /** 상점을 연다. 재고를 같이 받는다 */
  openShop: (items: readonly number[]) => void
  back: () => void
  closeAll: () => void
}

/** 키를 화면이 가져가는 것은 스택이 빌 때까지다 */
function capture(stack: MenuScreen[]): void {
  setUiCapture(stack.length > 0)
}

export const useMenuStore = create<MenuStore>()((set) => ({
  stack: [],
  top: null,
  shopStock: [],

  openShop: (items) => set(() => {
    const stack: MenuScreen[] = ['shop']
    capture(stack)
    return { stack, top: 'shop' as const, shopStock: [...items] }
  }),

  open: (screen) => set(() => {
    const stack = [screen]
    capture(stack)
    return { stack, top: screen }
  }),

  push: (screen) => set((s) => {
    const stack = [...s.stack, screen]
    capture(stack)
    return { stack, top: screen }
  }),

  back: () => set((s) => {
    const stack = s.stack.slice(0, -1)
    capture(stack)
    return { stack, top: stack[stack.length - 1] ?? null }
  }),

  closeAll: () => set(() => {
    capture([])
    return { stack: [], top: null }
  }),
}))
