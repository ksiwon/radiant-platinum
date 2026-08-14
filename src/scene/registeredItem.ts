// 등록한 도구를 Y로 바로 쓴다 (PARITY §4.4)
//
// 원작의 Y 버튼이다 (`FieldSystem_UseRegisteredItem`). 가방을 안 열고 도구표의
// `fieldUseFunc`를 그대로 부른다 — **가방에서 고르는 길과 같은 자리로 간다**
// (`ui/menu/itemAction`). 두 길이 갈라지면 자전거가 가방에서만 굴러간다.
//
// ⚠️ **가방에 없으면 안 쓴다.** 등록만 해 두고 버릴 수 있으므로 쓰기 직전에
// 다시 센다 — 원작도 `Bag_HasItem`으로 막는다
import { loadItemNames, loadItems, loadMoves, loadSpecies, type ItemTable } from '../data/gameData'
import { quantity } from '../engine/bag/bag'
import { fieldAction } from '../engine/bag/fieldUse'
import { tradeEvolutionItems } from '../engine/pokemon/evolution'
import { useMenuStore } from '../state/menuStore'
import { gameLocale } from '../state/optionsStore'
import { useSaveStore } from '../state/saveStore'
import { fieldContextNow, performItemAction } from '../ui/menu/itemAction'

let items: ItemTable | null = null
let names: readonly string[] = []
/** 도구를 써서 거는 진화의 목록 (§12.2). 도구 이름표로 든다 */
let evoItems: ReadonlySet<string> | undefined

let loading = false

/**
 * 표를 미리 받아 둔다.
 *
 * ⚠️ **키를 누른 뒤에 받으면 늦다.** 첫 Y가 아무 일도 안 하고 지나가면
 * 등록이 안 된 것처럼 보인다 — 필드가 서면서 한 번 부른다
 */
export function primeRegisteredItem(): void {
  if (items !== null || loading) return
  loading = true
  void Promise.all([loadItems(), loadSpecies(), loadMoves(), loadItemNames(gameLocale())])
    .then(([bank, species, , list]) => {
      items = bank
      names = list
      evoItems = new Set(
        [...tradeEvolutionItems(species.all)].map((id) => bank.get(id).constant),
      )
    })
    .catch(() => { /* 못 받으면 Y가 아무 일도 안 한다 */ })
    .finally(() => { loading = false })
}

/**
 * 등록한 도구를 쓴다. 무언가 일어났으면 참.
 *
 * ⚠️ **이름을 `use…`로 안 짓는다** — 리액트 훅 규칙이 그 이름을 훅으로 보고
 * 「컴포넌트 밖에서 부르지 마라」로 막는다. 이건 훅이 아니라 그냥 함수다.
 *
 * @param say 한 줄 알림. 필드에는 바닥줄이 없어 부르는 쪽이 정한다
 */
export function runRegisteredItem(say: (line: string) => void = () => { /* 조용히 */ }): boolean {
  const bank = items
  if (!bank) { primeRegisteredItem(); return false }
  const save = useSaveStore.getState()
  const id = save.registeredItem
  if (id === 0) return false
  const item = bank.get(id)
  // ⚠️ 등록해 놓고 버렸을 수 있다. 쓰기 직전에 다시 센다
  if (quantity(save.bag, item.pocket ?? 0, id) === 0) return false

  const menu = useMenuStore.getState()
  return performItemAction(fieldAction(item, fieldContextNow(evoItems)), {
    item: id,
    name: names[id] ?? '',
    pocket: item.pocket ?? 0,
    say,
    consume: save.removeItem,
    // 필드에서 부른 것이라 물러날 자리도, 닫을 화면도 없다
    back: () => { /* 없다 */ },
    push: (screen) => { menu.open(screen) },
    closeAll: () => { /* 없다 */ },
    openParty: (use) => { menu.openPartyWithItem({ item: id, use }) },
  })
}
