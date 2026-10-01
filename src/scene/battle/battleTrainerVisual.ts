// 배틀에 서는 트레이너의 몸과 색 (DATA.md §2.16)
//
// ⚠️ **갈래 → 몸 표를 여기 다시 적지 않는다.** 한동안 손으로 적은 백 줄이
// 여기 있었고, 그 안에 실제로 틀린 짝이 섞여 있었다 — 더블팀이 쌍둥이로,
// 눈 지방 에이스 트레이너가 평지 에이스 트레이너로 섰다(이름표 `eliteM`을
// 두 번들이 나눠 써서 먼저 구운 것이 나중 것을 덮었다). 정본은 BDSP가 적어 둔
// `TrainerTable`이고 `engine/actor/npcModels`가 그것을 읽는다
import type { BattleFinish } from '../../engine/battle/sim/controller'

interface TrainerPalette {
  cloth: string
  accent: string
  hair: string
}

const CLOTH = ['#3d63a7', '#a44462', '#35725a', '#7b4d9d', '#97602d', '#39434f'] as const
const ACCENT = ['#f3ce56', '#72d3db', '#f07b61', '#b9d96d', '#d9a3dc', '#f0eee6'] as const
const HAIR = ['#2d211f', '#6b4932', '#d7b55d', '#30384c', '#8a4130'] as const

/** Stable colors keep classes visually distinct when an exact GLB is unavailable. */
export function trainerFallbackPalette(trainerClass: number | null): TrainerPalette {
  const seed = Math.max(0, trainerClass ?? 0)
  return {
    cloth: CLOTH[seed % CLOTH.length]!,
    accent: ACCENT[(seed * 3 + 1) % ACCENT.length]!,
    hair: HAIR[(seed * 5 + 2) % HAIR.length]!,
  }
}

/**
 * 등신 몸에 실린 배틀 클립.
 *
 * 굽는 쪽이 이 넷만 싣는다 (`engine/actor/npcModels`의 `TRAINER_CLIPS`).
 * 길이는 PLAN.md의 클립 표에서 잰 값이다
 */
export const TRAINER_CLIP = {
  /** 배틀에 들어서는 동작. 4.13초 */
  advent: 'advent_b',
  /** 명령을 기다리며 쉬는 동작. **되풀이한다** — 나머지 셋은 한 번만 돈다 */
  wait: 'wait_b',
  /** 공을 던지며 지시하는 동작. 2.33초 */
  order: 'order_b',
  /** 진 동작. 5.50초 */
  lose: 'lose01_b',
} as const

/**
 * 이 편 트레이너가 **지금** 진 동작을 하는가.
 *
 * `outcome`은 **내 쪽에서 본 결말**이다 — 내가 지면(`loss`) 내 트레이너가,
 * 내가 이기면(`win`) 상대 트레이너가 진 동작을 한다. 잡기·도망(`caught`·
 * `fled`·`foeFled`)은 진 것이 아니라 아무도 안 한다.
 *
 * ⚠️ **결말만 보면 안 된다 — `shownEnded`가 같이 서야 한다.** `outcome`은 sim이 마지막
 * 턴을 계산한 그 순간 서고, 재생기는 그 뒤에 「○○의 몸통박치기!」·게이지·쓰러짐을
 * 차례로 튼다. 결말만 보고 움직이면 상대 포켓몬이 아직 서 있는데 트레이너가 먼저
 * 무너져서 결과가 미리 드러났다. 그래서 **화면 뷰(`view.ended`)** 를 같이 본다 — 그 값은
 * 재생기가 `win`·`tie` 사건을 접는 박자에서만 서고(`engine/battle/view`), 그 박자는 마지막
 * 쓰러짐과 경험치 줄 **뒤**다 (`battleStore.advance`가 보상을 쓰러짐 바로 뒤에 끼운다)
 */
export function trainerLost(outcome: BattleFinish, mine: boolean, shownEnded: boolean): boolean {
  if (!shownEnded) return false
  return mine ? outcome === 'loss' : outcome === 'win'
}
