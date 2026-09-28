// 꽃집 장식 교환을 필드에 잇는다 (`ScrCmd_ShowAccessoryShop` · `engine/world/accessoryShop`)
//
// 차례는 엔진 쪽이 들고, 여기는 글과 메뉴를 필드 대사창(`sayOurs` · `askOurs`)으로 띄운다. 원작도 필드 위에
// 대사창 · 오른쪽 목록 · 왼쪽 설명 창을 얹는 가게라(`AccessoryShop_ShowMsgBox` 등) 우리 목록 메뉴와 그 설명
// 칸(`alt`)이 같은 자리다. **글은 전부 롬 것이다** — 꽃집 뱅크(572)의 줄에 칸만 채운다.
import { loadDialogueBank } from '../data/gameData'
import { fillMenuText } from '../data/uiText'
import { askOurs, fieldScripts, sayOurs } from '../engine/script/field'
import { MENU_CANCEL, MENU_YES } from '../engine/script/world'
import { runAccessoryShop, type AccessoryShopHost } from '../engine/world/accessoryShop'
import { gameLocale } from '../state/optionsStore'

/** `TEXT_BANK_FLOWER_SHOP` */
const FLOWER_SHOP_BANK = 572

let running = false

/** 가게가 떠 있는가 — 스크립트가 이것이 거짓이 될 때까지 선다 */
export function accessoryShopRunning(): boolean {
  return running
}

function host(bank: readonly string[]): AccessoryShopHost {
  const services = () => fieldScripts.services
  const line = (text: number, slots: readonly string[]): string => fillMenuText(bank[text] ?? '', slots)
  return {
    line,
    say: (text, slots = []) => sayOurs(line(text, slots)),
    yesNo: async (text, slots) =>
      await askOurs(line(text, slots), { kind: 'yesno', cursor: MENU_YES }) === MENU_YES,
    list: async (text, entries, cursor) => {
      const picked = await askOurs(line(text, []), {
        kind: 'list',
        entries: entries.map((e, i) => ({ text: e.text, value: i, alt: e.alt })),
        cursor,
        canCancel: true,
      })
      return picked === MENU_CANCEL || picked < 0 ? null : picked
    },
    accessoryName: (accessory) => services().labels?.accessory(accessory) ?? '',
    berryName: (berry, count) =>
      (count === 1 ? services().labels?.item(berry) : services().labels?.itemPlural(berry)) ?? '',
    quantity: (item) => services().bag?.quantity(item) ?? 0,
    removeItem: (item, count) => services().bag?.remove(item, count) ?? false,
    canFit: (accessory) => services().fashionCase?.canFit(accessory, 1) ?? false,
    addAccessory: (accessory) => { services().fashionCase?.add(accessory, 1) },
  }
}

/** 가게를 연다. 뱅크를 받는 사이에도 스크립트는 선다 */
export function openAccessoryShop(): void {
  if (running) return
  running = true
  void loadDialogueBank(gameLocale(), FLOWER_SHOP_BANK)
    .then((bank) => runAccessoryShop(host(bank)))
    .catch(() => { /* 글을 못 받으면 가게 없이 지나간다 */ })
    .finally(() => { running = false })
}
