// 메뉴 화면 스택 (PLAN §3.2)
//
// 화면이 쌓인다: 시작 메뉴 → 가방 → 포켓몬(누구에게 쓸까). B는 한 겹만 벗긴다.
// 스택으로 두는 이유는 되돌아갈 자리가 화면마다 다르기 때문이다 — 가방을
// 시작 메뉴에서 열었으면 시작 메뉴로, 배틀에서 열었으면 배틀로 돌아가야 한다.
//
// 프레임 값은 여기 안 넣는다. 커서 자리처럼 화면이 혼자 쓰는 것은 컴포넌트가
// 갖고, 이 스토어는 **어느 화면이 떠 있는가**만 안다.
import { create } from 'zustand'
// ⚠️ `keyboard`가 아니라 `keys`다. 그쪽은 worldState → three를 끌고 오는데
// 타이틀 화면이 이 스토어를 잡으므로 초기 청크에 three가 실린다 (§10.4)
import { setUiCapture } from '../engine/input/keys'
import type { ShopCurrency } from '../engine/script/world'

export type MenuScreen =
  | 'start' | 'bag' | 'party' | 'pokedex' | 'trainerCard' | 'save' | 'options' | 'shop'
  | 'fly' | 'box'
  // 모험노트. 가방의 열쇠도구에서 연다 (`ItemUseFunc_Journal`)
  | 'journal'
  // 기술 되살리기·기술가르침. 스크립트가 열고 `reminder`가 무엇을 가르칠지 든다
  | 'reminder'
  // 도감 완성 상장 (`ShowDiplomaSinnoh` · `ShowDiplomaNationalDex`)
  | 'diploma'
  // 나무열매 태그. 가방에서 연다
  | 'berryTag'
  // 요약 화면. `summarySlot`이 어느 파티 자리인지를 든다
  | 'summary'
  // 파트너를 고르는 화면. 스크립트가 열고, **고르기 전에는 못 닫는다**
  | 'chooseStarter'
  // 진화. **스스로 뜬다** — 배틀이 닫힐 때 큐에 자리가 있으면 열린다
  | 'evolution'
  // NPC 교환 장면. 스크립트가 `StartNPCTrade`로 열고 `trade`가 어느 교환인지를 든다
  | 'trade'
  // 이름 짓기. 스크립트가 열고 `naming`이 무엇의 이름인지를 든다
  | 'naming'
  // 명예의 전당 장면. `ClearGame`이 열고 **끝나면 타이틀로 나간다** —
  // 그래서 물러날 자리가 없다
  | 'hallOfFame'
  // PC의 「명예의 전당」. `OpenPCHallOfFameScreen`이 연다
  | 'pcHallOfFame'
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
  /**
   * 그 상점이 무엇으로 값을 받는가 (`enum MartType`).
   *
   * 배틀프런티어 교환 코너만 BP다 (PARITY §12.3) — 나머지는 돈이다
   */
  shopCurrency: ShopCurrency
  /**
   * 보관 시스템을 어느 갈래로 열었는가 (`OpenPokemonStorage`의 인자).
   *
   * 0 맡긴다 · 1 꺼낸다 · 2 옮긴다. 상점 재고와 같은 이유로 여기 있다 —
   * 화면을 여는 인자라 컴포넌트가 못 받는다
   */
  boxMode: number
  /**
   * 이름 짓기 화면이 무엇의 이름을 받는가 (`NAMING_SCREEN_TYPE_*`).
   *
   * `slot`은 파티 자리다. 상점 재고와 같은 이유로 여기 있다 — 화면을 여는
   * 인자라 컴포넌트가 못 받는다
   */
  naming: { kind: 'pokemon' | 'tablet'; slot: number; initial: string; max: number } | null
  /**
   * 가방에서 고른 도구를 **누구에게** 쓰는 중인가 (PARITY §4.1).
   *
   * 파티 화면이 이 값을 보고 "쓴다" 모드로 뜬다. 상점 재고와 같은 이유로
   * 여기 있다 — 화면을 여는 인자라 컴포넌트가 못 받는다
   */
  usingItem: { item: number; use: 'heal' | 'tmhm' | 'evoStone' } | null
  /**
   * 요약 화면이 보여 줄 파티 자리.
   *
   * 상점 재고와 같은 이유로 여기 있다 — 화면을 여는 인자라 컴포넌트가 못 받는다.
   * 화면 안에서 ←→로 옮겨 다니므로 **여는 자리**일 뿐 정본이 아니다
   */
  summarySlot: number
  /**
   * 가방을 **건네줄 상대**를 안고 열었는가 (`PartyMenu_SelectItemGive`).
   *
   * 파티 화면의 갈래 메뉴에서 「건네준다」를 고르면 가방이 이 값을 들고 뜨고,
   * 도구 하나를 고르는 순간 그 자리에 붙는다. null이면 평소의 가방이다
   */
  giveTo: number | null
  /**
   * 스크립트가 고르라고 연 가방인가 (`ScrCmd_OpenBag`). 그 주머니 번호고
   * null이면 평소의 가방이다.
   *
   * ⚠️ **주머니를 못 바꾼다.** 원작이 목록을 하나로 잘라 넘기므로 좌우로
   * 넘길 다른 주머니가 아예 없다
   */
  pickPocket: number | null
  /**
   * 기술 되살리기가 무엇을 누구에게 가르치려는가 (`MoveReminderData`).
   *
   * `tutor`가 참이면 기술가르침이라 목록이 한 줄뿐이다. 상점 재고와 같은
   * 이유로 여기 있다 — 화면을 여는 인자라 컴포넌트가 못 받는다
   */
  reminder: { slot: number; moves: number[]; tutor: boolean } | null
  /** 마지막 되살리기가 실제로 가르쳤는가 (`keepOldMove`). 스크립트가 이 값으로 갈린다 */
  reminderLearned: boolean
  /** 상장이 전국도감판인가 (`ShowDiplomaNationalDex`) */
  diplomaNational: boolean
  /** 태그를 볼 나무열매의 **도구 번호** */
  berryItem: number
  /**
   * 지금 도는 NPC 교환 (`FieldTask_StartNPCTrade`).
   *
   * `slot`은 내가 건네는 파티 자리다 — 화면이 그 자리를 받는 마리로 갈아 끼운다
   */
  trade: { tradeId: number, slot: number } | null
  /**
   * 스크립트가 「한 마리 골라」로 파티 화면을 열었는가
   * (`FieldSystem_OpenPartyMenu_SelectPokemon`).
   *
   * 갈래 메뉴 없이 Z가 곧 고르기다. 답은 `partyChoice`가 든다 — 화면이 닫힌
   * 뒤에 스크립트가 묻기 때문이다
   */
  choosingMon: boolean
  open: (screen: MenuScreen) => void
  push: (screen: MenuScreen) => void
  /** 상점을 연다. 재고와 **무엇으로 값을 받는지**를 같이 받는다 */
  openShop: (items: readonly number[], currency?: ShopCurrency) => void
  /** 보관 시스템을 연다 */
  openBox: (mode: number) => void
  /** 이름 짓기 화면을 연다 */
  openNaming: (what: NonNullable<MenuStore['naming']>) => void
  /** 도구를 들고 파티 화면을 연다. 스택 위에 쌓는다 — B로 가방으로 돌아간다 */
  openPartyWithItem: (what: NonNullable<MenuStore['usingItem']>) => void
  /** 요약 화면을 쌓는다. B로 파티 화면으로 돌아간다 */
  openSummary: (slot: number) => void
  /** 도구를 건네주려고 가방을 쌓는다 */
  openBagToGive: (slot: number) => void
  /**
   * 스크립트가 「가방에서 하나 골라라」로 연다 (`FieldSystem_CreateBagContext`).
   *
   * ⚠️ **주머니 하나만 보인다.** 원작이 주머니 목록을 하나로 잘라서 넘긴다 —
   * 비료를 고를 때는 도구 주머니, 심을 것을 고를 때는 열매 주머니뿐이다
   */
  openBagToPick: (pocket: number) => void
  /** 기술 되살리기를 연다 */
  openReminder: (what: NonNullable<MenuStore['reminder']>) => void
  /** NPC 교환 장면을 연다 */
  openTrade: (what: NonNullable<MenuStore['trade']>) => void
  /** 되살리기가 끝났다. 스크립트가 `reminderLearned`를 읽는다 */
  finishReminder: (learned: boolean) => void
  /** 상장을 연다 */
  openDiploma: (national: boolean) => void
  /** 명예의 전당 장면을 연다 (`ClearGame`) */
  openHallOfFame: () => void
  /** 스크립트가 한 마리를 고르라고 파티 화면을 연다 */
  openPartyToChoose: () => void
  /** 나무열매 태그를 쌓는다. B로 가방으로 돌아간다 */
  openBerryTag: (item: number) => void
  /** 도구 쓰기를 끝낸다 */
  clearUsingItem: () => void
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
  shopCurrency: 'money',
  boxMode: 0,
  naming: null,
  usingItem: null,
  summarySlot: 0,
  giveTo: null,
  pickPocket: null,
  reminder: null,
  reminderLearned: false,
  diplomaNational: false,
  berryItem: 0,
  choosingMon: false,
  trade: null,

  openPartyToChoose: () => set(() => {
    const stack: MenuScreen[] = ['party']
    capture(stack)
    return { stack, top: 'party' as const, choosingMon: true, usingItem: null }
  }),

  openReminder: (what) => set(() => {
    const stack: MenuScreen[] = ['reminder']
    capture(stack)
    return { stack, top: 'reminder' as const, reminder: what, reminderLearned: false }
  }),

  openTrade: (what) => set(() => {
    const stack: MenuScreen[] = ['trade']
    capture(stack)
    return { stack, top: 'trade' as const, trade: what }
  }),

  finishReminder: (learned) => { set({ reminderLearned: learned, reminder: null }) },

  openHallOfFame: () => set(() => {
    const stack: MenuScreen[] = ['hallOfFame']
    capture(stack)
    return { stack, top: 'hallOfFame' as const }
  }),

  openDiploma: (national) => set(() => {
    const stack: MenuScreen[] = ['diploma']
    capture(stack)
    return { stack, top: 'diploma' as const, diplomaNational: national }
  }),

  openBerryTag: (item) => set((s) => {
    const stack: MenuScreen[] = [...s.stack, 'berryTag']
    capture(stack)
    return { stack, top: 'berryTag' as const, berryItem: item }
  }),

  openBagToGive: (slot) => set((s) => {
    const stack: MenuScreen[] = [...s.stack, 'bag']
    capture(stack)
    return { stack, top: 'bag' as const, giveTo: slot }
  }),

  openBagToPick: (pocket) => set(() => {
    const stack: MenuScreen[] = ['bag']
    capture(stack)
    // 고른 답은 `itemChoice`가 든다 — 화면이 닫힌 뒤 스크립트가 읽는다
    return { stack, top: 'bag' as const, pickPocket: pocket, giveTo: null }
  }),

  openSummary: (slot) => set((s) => {
    const stack: MenuScreen[] = [...s.stack, 'summary']
    capture(stack)
    return { stack, top: 'summary' as const, summarySlot: slot }
  }),

  openPartyWithItem: (what) => set((s) => {
    const stack: MenuScreen[] = [...s.stack, 'party']
    capture(stack)
    return { stack, top: 'party' as const, usingItem: what }
  }),

  clearUsingItem: () => { set({ usingItem: null }) },

  openShop: (items, currency) => set(() => {
    const stack: MenuScreen[] = ['shop']
    capture(stack)
    return {
      stack, top: 'shop' as const, shopStock: [...items], shopCurrency: currency ?? 'money',
    }
  }),

  openBox: (mode) => set(() => {
    const stack: MenuScreen[] = ['box']
    capture(stack)
    return { stack, top: 'box' as const, boxMode: mode }
  }),

  openNaming: (what) => set(() => {
    const stack: MenuScreen[] = ['naming']
    capture(stack)
    return { stack, top: 'naming' as const, naming: what }
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
    // 파티 화면에서 물러나면 들고 있던 도구도 내려놓는다
    return {
      stack, top: stack[stack.length - 1] ?? null,
      usingItem: null, giveTo: null, choosingMon: false,
    }
  }),

  closeAll: () => set(() => {
    capture([])
    return { stack: [], top: null, usingItem: null, giveTo: null, choosingMon: false }
  }),
}))
