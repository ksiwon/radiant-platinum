// 꽃향기마을 꽃집의 장식 교환 (`ScrCmd_ShowAccessoryShop` · `overlay007/accessory_shop.c`)
//
// 나무열매를 내고 장식을 받는다. 표 스물둘과 말의 차례가 원작 그대로다 — 인사 → (다 받았으면 고맙다고 끝)
// → 「어느 액세서리?」와 목록 → 고르면 「N개랑 바꿀까?」 예/아니오 → 모자람 · 넘침 · 고맙습니다 → 받았다 →
// 다 바꿨으면 「전부 교환했다」와 고맙다 → 끝. 목록 끝의 「그만둔다」와 B는 「또 오세요」다.
//
// ⚠️ **장식 케이스만 있다** (PARITY §7.16). 콘테스트는 범위 밖이라 받은 장식을 쓸 자리는 없지만, 케이스와
// 상호교류광장이 이미 서 있어 이 가게도 원작대로 선다.

/** 가게 한 줄 (`AccessoryShopItem`) — 장식 · 나무열매(도구 번호) · 몇 개 */
interface ShopRow {
  accessory: number
  berry: number
  count: number
}

/** `generated/items.txt` — 나무열매 스물둘의 도구 번호 */
const BERRY = {
  cheri: 149, chesto: 150, pecha: 151, rawst: 152, aspear: 153, leppa: 154, oran: 155, persim: 156,
  razz: 164, bluk: 165, nanab: 166, wepear: 167, pinap: 168, cornn: 175, magost: 176, rabuta: 177,
  nomel: 178, spelon: 179, pamtre: 180, watmel: 181, durin: 182, belue: 183,
} as const

/**
 * `sAccessoryShop_ItemLists` — 장식 번호는 `generated/accessories.txt`의 차례다(빨강꽃 50 … 사진판 71).
 * 61번(컬러풀파라솔)부터가 하나뿐인 장식이다
 */
export const ACCESSORY_SHOP: readonly ShopRow[] = [
  { accessory: 50, berry: BERRY.cheri, count: 1 },
  { accessory: 51, berry: BERRY.chesto, count: 1 },
  { accessory: 52, berry: BERRY.pecha, count: 1 },
  { accessory: 53, berry: BERRY.oran, count: 1 },
  { accessory: 54, berry: BERRY.rawst, count: 1 },
  { accessory: 55, berry: BERRY.aspear, count: 1 },
  { accessory: 56, berry: BERRY.leppa, count: 1 },
  { accessory: 57, berry: BERRY.persim, count: 1 },
  { accessory: 58, berry: BERRY.razz, count: 10 },
  { accessory: 59, berry: BERRY.bluk, count: 10 },
  { accessory: 60, berry: BERRY.nanab, count: 10 },
  { accessory: 61, berry: BERRY.wepear, count: 10 },
  { accessory: 62, berry: BERRY.pinap, count: 10 },
  { accessory: 63, berry: BERRY.cornn, count: 50 },
  { accessory: 64, berry: BERRY.pamtre, count: 100 },
  { accessory: 65, berry: BERRY.magost, count: 50 },
  { accessory: 66, berry: BERRY.watmel, count: 100 },
  { accessory: 67, berry: BERRY.rabuta, count: 50 },
  { accessory: 68, berry: BERRY.nomel, count: 50 },
  { accessory: 69, berry: BERRY.durin, count: 100 },
  { accessory: 70, berry: BERRY.spelon, count: 100 },
  { accessory: 71, berry: BERRY.belue, count: 100 },
]

/** `TEXT_BANK_FLOWER_SHOP` (572)의 줄 */
export const FLOWER_SHOP_TEXT = {
  greet: 4,
  thanks: 5,
  purchase: 6,
  confirm: 7,
  success: 8,
  notEnough: 9,
  cantCarry: 10,
  comeAgain: 11,
  got: 12,
  tradedAll: 13,
  berryName: 16,
  needed: 17,
  inBag: 18,
  exit: 19,
} as const

/** 목록의 한 줄 — 커서를 올리면 왼쪽 창에 나무열매 · 필요한 수 · 가진 수가 뜬다 (`AccessoryShop_UpdateDescBox`) */
interface ListEntry {
  text: string
  /** 왼쪽 창의 세 줄. 「그만둔다」에는 없다 */
  alt: string | null
}

/** 가게가 부르는 것 — 글은 부르는 쪽이 칸을 채워 준다 */
export interface AccessoryShopHost {
  /** 글을 띄우고 A·B를 기다린다 */
  say: (text: number, slots?: readonly string[]) => Promise<void>
  /** 글 뒤에 예/아니오 — 커서는 예에서 선다. B는 아니오다 */
  yesNo: (text: number, slots: readonly string[]) => Promise<boolean>
  /** 글 뒤에 목록 — 고른 줄 번호, B면 null */
  list: (text: number, entries: readonly ListEntry[], cursor: number) => Promise<number | null>
  line: (text: number, slots: readonly string[]) => string
  accessoryName: (accessory: number) => string
  /** 개수가 하나면 이름, 여럿이면 복수형 (`StringTemplate_SetItemName` · `…NamePlural`) */
  berryName: (berry: number, count: number) => string
  quantity: (item: number) => number
  removeItem: (item: number, count: number) => boolean
  canFit: (accessory: number) => boolean
  addAccessory: (accessory: number) => void
}

/** 다 받았는가 — 하나라도 더 들어가면 아니다 (`AccessoryShop_HasAllAccessories`) */
function ownsEveryAccessory(canFit: (accessory: number) => boolean): boolean {
  return ACCESSORY_SHOP.every((row) => !canFit(row.accessory))
}

/** 수 칸 — 세 자리를 공백으로 채운다 (`PADDING_MODE_SPACES`) */
const padded = (n: number): string => String(n).padStart(3, ' ')

function entries(host: AccessoryShopHost): ListEntry[] {
  const rows = ACCESSORY_SHOP.map((row) => ({
    text: host.line(FLOWER_SHOP_TEXT.berryName, [host.accessoryName(row.accessory)]),
    alt: [
      host.line(FLOWER_SHOP_TEXT.berryName, [host.berryName(row.berry, 1)]),
      host.line(FLOWER_SHOP_TEXT.needed, ['', padded(row.count)]),
      host.line(FLOWER_SHOP_TEXT.inBag, ['', '', padded(host.quantity(row.berry))]),
    ].join('\n'),
  }))
  return [...rows, { text: host.line(FLOWER_SHOP_TEXT.exit, []), alt: null }]
}

/** 가게 한 번 (`AccessoryShop_Main`) */
export async function runAccessoryShop(host: AccessoryShopHost): Promise<void> {
  await host.say(FLOWER_SHOP_TEXT.greet)
  if (ownsEveryAccessory(host.canFit)) {
    await host.say(FLOWER_SHOP_TEXT.thanks)
    return
  }
  let cursor = 0
  for (;;) {
    const picked = await host.list(FLOWER_SHOP_TEXT.purchase, entries(host), cursor)
    // 「그만둔다」는 B와 같다 (`cursorPos == maxListItems - 1` → `MENU_CANCEL`)
    if (picked === null || picked >= ACCESSORY_SHOP.length) {
      await host.say(FLOWER_SHOP_TEXT.comeAgain)
      return
    }
    cursor = picked
    const row = ACCESSORY_SHOP[picked]!
    const slots = [host.berryName(row.berry, row.count), String(row.count), host.accessoryName(row.accessory)]
    if (!await host.yesNo(FLOWER_SHOP_TEXT.confirm, slots)) continue
    if (host.quantity(row.berry) < row.count) {
      await host.say(FLOWER_SHOP_TEXT.notEnough)
      continue
    }
    if (!host.canFit(row.accessory)) {
      await host.say(FLOWER_SHOP_TEXT.cantCarry)
      continue
    }
    await host.say(FLOWER_SHOP_TEXT.success)
    // `AccessoryShop_DoPurchase` — 장식을 먼저 넣고 나무열매를 뺀다
    host.addAccessory(row.accessory)
    host.removeItem(row.berry, row.count)
    await host.say(FLOWER_SHOP_TEXT.got, slots)
    if (ownsEveryAccessory(host.canFit)) {
      await host.say(FLOWER_SHOP_TEXT.tradedAll)
      await host.say(FLOWER_SHOP_TEXT.thanks)
      return
    }
  }
}
