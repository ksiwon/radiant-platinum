// 도감의 본 수 · 잡은 수 — 트레이너 카드와 도감 머리가 같은 셈을 쓴다
//
// ⚠️ **어느 목록으로 세느냐가 원작의 규칙이다.** 전국도감을 받기 전에는 신오 목록 안의 것만 센다
// (`Pokedex_CountSeen` → `_Local` · `pokedex.c`). 비트필드를 전국 범위로 통째로 세면 신오 목록에 없는 종(뮤 같은 것)이
// 섞여서, 같은 판의 카드와 도감 머리가 서로 다른 수를 말한다 — 실제로 카드는 잡은 비트 6을, 도감은 본 수 66을 띄웠다.
//
// 원작 카드가 싣는 것은 **본 수**다 (`TrainerCase_Init`이 `Pokedex_CountSeen`을 넘긴다 · `trainer_case.c`).
import type { DexLists } from '../../engine/pokemon/dexSort'
import { dexHas } from '../../engine/pokemon/dex'

interface DexCounts {
  /** 본 수 — 그 목록 안에서 본 비트가 선 종 */
  seen: number
  /** 잡은 수 — 그중 잡은 비트도 선 종. 도감 머리가 이렇게 센다(본 칸만 줄에 오른다) */
  caught: number
}

/**
 * 도감 두 수.
 *
 * `national`은 **전국도감을 받았는가**다 — 도감 화면의 「전국 / 신오」 고르기가 아니다. 카드는 고르기를 모른다
 */
export function dexCounts(
  lists: DexLists, national: boolean, dex: { seen: Uint8Array, caught: Uint8Array },
): DexCounts {
  let seen = 0, caught = 0
  for (const species of lists[national ? 'national' : 'sinnoh'] ?? []) {
    if (!dexHas(dex.seen, species)) continue
    seen++
    if (dexHas(dex.caught, species)) caught++
  }
  return { seen, caught }
}

/** 전국도감 끝 번호 (`NATIONAL_DEX_COUNT`) */
const NATIONAL_DEX_COUNT = 493

/**
 * 전국도감을 「다 채웠다」로 볼 때 빼는 열하나 (`sExcludedMonsNational` · `pokedex.c`).
 *
 * 뮤 · 루기아 · 칠색조 · 세레비 · 지라치 · 테오키스 · 피오네 · 마나피 · 다크라이 · 쉐이미 · 아르세우스 — 이벤트로만 오는 것들이다
 */
const NATIONAL_EXCLUDED: ReadonlySet<number> = new Set([151, 249, 250, 251, 385, 386, 489, 490, 491, 492, 493])

/**
 * 전국도감을 잡은 것으로 다 채웠는가 (`Pokedex_NationalDexCompleted`).
 *
 * 원작은 뺀 열하나를 **세지 않고** 잡은 수가 482(`NATIONAL_DEX_GOAL`) 이상인지만 본다 — 뺀 것을 잡았어도 칸이 늘지 않는다.
 * 트레이너 카드 등급 조건 하나다 (`TrainerCase_CalculateTrainerCardLevel`)
 */
export function nationalDexCompleted(caught: Uint8Array): boolean {
  let n = 0
  for (let species = 1; species <= NATIONAL_DEX_COUNT; species++) {
    if (!NATIONAL_EXCLUDED.has(species) && dexHas(caught, species)) n++
  }
  return n >= NATIONAL_DEX_COUNT - NATIONAL_EXCLUDED.size
}
