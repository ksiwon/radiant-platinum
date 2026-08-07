// 스크립트가 바깥 세계에 부탁하는 것들 (DATA.md §2.10)
//
// 엔진(`engine/script`)은 React도 zustand도 모른다. 배틀 화면을 열고, 세이브의
// 파티를 세고, 트레이너 자료를 받는 일은 전부 여기서 이어 붙인다.
//
// 배틀 결과를 붙잡는 방식이 조금 특이하다. 배틀 스토어는 화면을 닫을 때
// `outcome`을 지우는데, 스크립트는 **닫힌 뒤에** 결과를 묻는다. 그래서 결과가
// 정해지는 순간 여기서 따로 받아 둔다.
import { loadDialogueBank, loadItemNames, loadItems, loadMarts, loadTrainers } from '../data/gameData'
import { canFit, quantity } from '../engine/bag/bag'
import { commonStock, specialtyStock } from '../engine/bag/mart'
import { fieldScripts } from '../engine/script/field'
import { blackOut, healParty, loadHealTables, watchBlackOut } from './pokecenter'
import { useBattleStore } from '../state/battleStore'
import { useMenuStore } from '../state/menuStore'
import { useSaveStore } from '../state/saveStore'
import type { ItemTable } from '../data/gameData'
import type { FieldServices } from '../engine/script/world'
import type { MartTable, Trainer } from '../data/schema'

/** `TEXT_BANK_NPC_TRAINER_MESSAGES` — 트레이너 928명의 싸움 전후 대사 */
const TRAINER_MESSAGE_BANK = 617


/** 지금 배틀의 결과. 스크립트가 물어볼 때까지 들고 있는다 */
let battleResult: 'win' | 'loss' | null = null
/** 배틀을 스크립트가 열었는가. 야생 조우까지 여기 걸리면 안 된다 */
let waiting = false

let trainers: { get(id: number): Trainer } | null = null
let trainerMessages: string[] = []
let items: ItemTable | null = null
let itemNames: string[] = []
let marts: MartTable | null = null

/** 자료가 아직 안 왔으면 도구 주머니로 본다 — 번호 0이 그 자리다 */
const pocketOf = (item: number): number => items?.all[item]?.pocket ?? 0

/**
 * 배틀 스토어를 지켜본다.
 *
 * `outcome`이 정해지는 순간을 잡는다 — 화면이 닫히면 지워지기 때문이다
 */
function watchBattle(): () => void {
  return useBattleStore.subscribe((state, prev) => {
    if (!waiting) return
    if (state.outcome !== null && prev.outcome === null) {
      battleResult = state.outcome === 'win' ? 'win' : 'loss'
    }
    // 화면이 닫혀야 스크립트를 놓아준다. 결과만 나오고 화면이 떠 있으면
    // 대사창이 배틀 위에 겹친다
    if (state.phase === 'off' && prev.phase !== 'off') waiting = false
  })
}

/** 스크립트가 쓰는 바깥 세계를 붙인다. 정리 함수를 돌려준다 */
export function installFieldServices(locale: 'en' | 'ko' | 'ja' = 'ko'): () => void {
  void loadTrainers().then((table) => { trainers = table }).catch(() => { /* 이름만 빈다 */ })
  void loadDialogueBank(locale, TRAINER_MESSAGE_BANK)
    .then((bank) => { trainerMessages = bank })
    .catch(() => { /* 대사만 빈다 */ })
  void loadItems().then((table) => { items = table }).catch(() => { /* 주머니가 0으로 뭉친다 */ })
  void loadItemNames(locale).then((names) => { itemNames = names }).catch(() => { /* 이름만 빈다 */ })
  void loadMarts().then((table) => { marts = table }).catch(() => { /* 상점이 빈 채로 뜬다 */ })
  // 회복량은 종족값 표가 있어야 나온다. 전멸은 첫 배틀부터 날 수 있으므로 미리 받는다
  loadHealTables()

  // 세계가 먼저 만들어져 있을 수 있다. 그 자리에도 넣어 준다
  if (fieldScripts.world !== null) fieldScripts.world.services = services
  fieldScripts.services = services
  const stop = watchBattle()
  const stopBlackOut = watchBlackOut()
  return () => {
    stop()
    stopBlackOut()
    fieldScripts.services = {}
  }
}

const services: FieldServices = {
  startTrainerBattle(trainerID: number): void {
    battleResult = null
    waiting = true
    void useBattleStore.getState().startTrainer(trainerID).catch(() => {
      // 배틀을 못 열면 스크립트가 영영 기다린다. 진 것으로 놓아준다
      battleResult = 'loss'
      waiting = false
    })
  },

  battleResult(): 'win' | 'loss' | null {
    return waiting ? null : battleResult
  },

  trainer(id: number): { double: boolean, msg: Record<string, number> } | null {
    const found = trainers?.get(id)
    return found === undefined ? null : { double: found.double, msg: found.msg }
  },

  trainerMessage(index: number): string {
    return trainerMessages[index] ?? ''
  },

  aliveMons(): number {
    return useSaveStore.getState().party.filter((mon) => mon.hp > 0).length
  },

  /**
   * 비전머신 자격 (`FieldMoves_Check*`).
   *
   * 어느 뱃지에 어느 기술인지는 엔진의 표가 안다 (`engine/script/fieldMoves`).
   * 여기서는 세이브를 읽어 주기만 한다
   */
  fieldMoves: {
    badges: () => useSaveStore.getState().badges,
    knows: (move: number) =>
      useSaveStore.getState().party.some((mon) => mon.moves.some((s) => s.move === move)),
  },

  healParty: () => { healParty() },
  setHealSpot: (index) => { useSaveStore.getState().setHealSpot(index) },
  blackOut: () => { blackOut() },

  bag: {
    pocketOf,
    add: (item, count) => useSaveStore.getState().addItem(pocketOf(item), item, count),
    remove: (item, count) => useSaveStore.getState().removeItem(pocketOf(item), item, count),
    canFit: (item, count) => canFit(useSaveStore.getState().bag, pocketOf(item), item, count),
    quantity: (item) => quantity(useSaveStore.getState().bag, pocketOf(item), item),
    pocketHasItems: (pocket) => (useSaveStore.getState().bag[pocket]?.length ?? 0) > 0,
    name: (item) => itemNames[item] ?? '',
  },

  openStartMenu: () => { useMenuStore.getState().open('start') },
  menuOpen: () => useMenuStore.getState().stack.length > 0,

  openShop: (stock) => { useMenuStore.getState().openShop(stock) },

  martStock: {
    // 재고표를 아직 못 받았으면 빈 상점이 뜬다. 물건을 지어내지 않는다
    common: () => (marts ? commonStock(marts, useSaveStore.getState().badges) : []),
    specialties: (martID) => (marts ? specialtyStock(marts, martID) : []),
  },

  money: {
    get: () => useSaveStore.getState().money,
    add: (amount) => { useSaveStore.getState().addMoney(amount) },
    spend: (amount) => useSaveStore.getState().spendMoney(amount),
  },
}
