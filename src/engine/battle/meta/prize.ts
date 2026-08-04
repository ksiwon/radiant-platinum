// 트레이너전 상금 (PLAN §7.6)
//
// 공식은 `마지막 포켓몬 레벨 × 4 × 분류 배수`다. **파티에서 가장 센 애가 아니라
// 마지막 칸**을 본다 — 원작이 그렇고, 그래서 약한 애를 뒤에 둔 트레이너는 상금이
// 적다.
//
// 배수는 롬의 배틀 오버레이에서 뽑았다 (DATA.md §2.9). 난천 12400엔·강석 4920엔이
// 원작과 같다는 것으로 공식과 표를 함께 확인했다.
import type { Trainer } from '../../../data/schema'

export interface PrizeInput {
  /** 그 트레이너 분류의 상금 배수 */
  mul: number
  /** 파티 마지막 칸의 레벨 */
  lastLevel: number
  /** 더블 배틀이면 두 배 */
  doubles?: boolean
  /** 부적금화를 들고 있으면 두 배 */
  amuletCoin?: boolean
}

export function prizeMoney(input: PrizeInput): number {
  if (input.mul <= 0 || input.lastLevel <= 0) return 0
  let money = input.lastLevel * 4 * input.mul
  if (input.amuletCoin) money *= 2
  if (input.doubles) money *= 2
  return money
}

/** 트레이너 데이터 한 명 → 상금. 배수표를 같이 받는다 */
export function prizeFor(
  trainer: Trainer,
  prizeMul: readonly number[],
  amuletCoin = false,
): number {
  const last = trainer.party[trainer.party.length - 1]
  if (!last) return 0
  return prizeMoney({
    mul: prizeMul[trainer.class] ?? 0,
    lastLevel: last.level,
    doubles: trainer.double,
    amuletCoin,
  })
}

/** 세이브가 들고 있을 수 있는 돈의 상한. 원작과 같다 */
export const MAX_MONEY = 999999
