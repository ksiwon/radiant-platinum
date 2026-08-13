// 배틀에 서는 트레이너의 몸과 색 (DATA.md §2.16)
//
// ⚠️ **갈래 → 몸 표를 여기 다시 적지 않는다.** 한동안 손으로 적은 백 줄이
// 여기 있었고, 그 안에 실제로 틀린 짝이 섞여 있었다 — 더블팀이 쌍둥이로,
// 눈 지방 에이스 트레이너가 평지 에이스 트레이너로 섰다(이름표 `eliteM`을
// 두 번들이 나눠 써서 먼저 구운 것이 나중 것을 덮었다). 정본은 BDSP가 적어 둔
// `TrainerTable`이고 `engine/actor/npcModels`가 그것을 읽는다
export interface TrainerPalette {
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
