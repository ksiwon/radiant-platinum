// 게임코너의 코인 (`coins.c`)
//
// 규칙이 짧지만 **더할 때와 「더할 수 있나」를 물을 때의 답이 다르다.** 그
// 어긋남이 원작에 그대로 있어서, 상한 언저리에서 스크립트가 "받을 수 있다"고
// 하고는 실제로는 상한까지만 들어온다.

/** `coins.h`의 `MAX_COINS` */
export const MAX_COINS = 50_000

/**
 * 더한다 (`Coins_Add`).
 *
 * ⚠️ **이미 가득이면 한 닢도 안 들어간다.** 넘치면 상한으로 자른다 —
 * `Coins_CanAdd`는 「합이 상한 이하인가」를 보므로 둘의 답이 다를 수 있다
 *
 * @returns 새 값과, 원작이 돌려주는 성공 여부
 */
export function addCoins(coins: number, amount: number): { coins: number, ok: boolean } {
  if (coins >= MAX_COINS) return { coins, ok: false }
  return { coins: Math.min(coins + amount, MAX_COINS), ok: true }
}

/** 넣을 자리가 있는가 (`Coins_CanAdd`) */
export function canAddCoins(coins: number, amount: number): boolean {
  return coins + amount <= MAX_COINS
}

/** 뺀다 (`Coins_Subtract`). 모자라면 **한 닢도 안 나간다** */
export function subtractCoins(coins: number, amount: number): { coins: number, ok: boolean } {
  if (coins < amount) return { coins, ok: false }
  return { coins: coins - amount, ok: true }
}

/** 리포트에서 읽은 값을 안전한 범위로 (`Coins_SetValue`의 단언 자리) */
export const clampCoins = (value: number): number =>
  Math.min(Math.max(Math.floor(value), 0), MAX_COINS)
