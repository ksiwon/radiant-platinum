// 능력치 계산과 성격 (4세대)
//
// 배틀 중 계산은 @pkmn/sim이 하지만 **배틀 밖에서도 같은 값이 필요하다** —
// 파티 메뉴의 HP 바, 조우 시 표시, 레벨업 연출. sim을 그것 때문에 715 kB 받아
// 올 수는 없으므로 여기서 직접 구한다.
//
// 두 구현이 한 칸이라도 다르면 배틀에 들어간 순간 HP가 튄다. `stats.test.ts`가
// 무작위 수천 건을 sim과 대조해 그것을 막는다.
import type { Stats } from '../../data/schema'

export type StatKey = keyof Stats

/** 성격이 건드리는 다섯 능력치. HP는 성격의 영향을 받지 않는다 */
export const NATURE_STATS = ['atk', 'def', 'spe', 'spa', 'spd'] as const satisfies readonly StatKey[]

/** 성격 25종 */
export const NATURE_COUNT = 25

interface NatureEffect {
  /** 1.1배가 되는 능력치. 무보정 성격이면 null */
  up: (typeof NATURE_STATS)[number] | null
  down: (typeof NATURE_STATS)[number] | null
}

/**
 * 성격 번호 → 보정.
 *
 * 25개 표를 손으로 적지 않는다. 성격은 `올라가는 능력치 × 내려가는 능력치`의
 * 5×5 격자이고 번호가 그 격자를 행 우선으로 훑는다 — `up = floor(n/5)`,
 * `down = n % 5`, 둘이 같으면 무보정(0·6·12·18·24, 즉 노력·유쾌 …).
 * 표를 적으면 한 줄 틀려도 안 보이지만 이 식은 틀릴 데가 없다.
 *
 * ⚠️ 능력치 순서가 **공/방/스피드/특공/특방**이다. 종족값 순서(HP/공/방/특공/특방/스피드)와
 * 다르다 — 성격 격자는 롬 내부 스탯 순서를 따르고 거기서 스피드가 4번째다
 */
export function natureEffect(nature: number): NatureEffect {
  const n = ((nature % NATURE_COUNT) + NATURE_COUNT) % NATURE_COUNT
  const up = Math.floor(n / 5)
  const down = n % 5
  if (up === down) return { up: null, down: null }
  return { up: NATURE_STATS[up]!, down: NATURE_STATS[down]! }
}

/** 무보정 성격인가 */
export function isNeutralNature(nature: number): boolean {
  return natureEffect(nature).up === null
}

/** 성격 배수. 1.1 / 1.0 / 0.9 */
export function natureMultiplier(nature: number, stat: StatKey): number {
  const e = natureEffect(nature)
  if (e.up === stat) return 1.1
  if (e.down === stat) return 0.9
  return 1
}

/**
 * HP 실능력치.
 *
 * `floor((2×종족값 + 개체값 + floor(노력치/4)) × 레벨 / 100) + 레벨 + 10`
 */
export function hpStat(base: number, iv: number, ev: number, level: number): number {
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10
}

/**
 * HP 외 실능력치.
 *
 * `floor((floor((2×종족값 + 개체값 + floor(노력치/4)) × 레벨 / 100) + 5) × 성격배수)`
 *
 * 성격 배수는 **마지막에 곱하고 버린다**. 곱셈을 앞으로 옮기면 소수점이 살아남아
 * 값이 1씩 어긋난다
 */
export function otherStat(
  base: number, iv: number, ev: number, level: number, multiplier: number,
): number {
  const raw = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5
  return Math.floor(raw * multiplier)
}

/**
 * 껍질몬. **HP가 언제나 1**이다 — 공식의 결과가 아니라 게임이 종족 번호로 박아 둔
 * 예외다(종족값 1로는 그 값이 안 나온다). 무작위 대조에서 이것 하나만 어긋났다
 */
const SHEDINJA = 292

interface StatInput {
  base: Stats
  ivs: Stats
  evs: Stats
  level: number
  nature: number
  /** 종족 번호. 껍질몬 예외 때문에 필요하다 */
  speciesId?: number
}

/** 여섯 실능력치를 한 번에 */
export function computeStats({ base, ivs, evs, level, nature, speciesId }: StatInput): Stats {
  const hp = speciesId === SHEDINJA ? 1 : hpStat(base.hp, ivs.hp, evs.hp, level)
  const out = { hp } as Stats
  for (const k of NATURE_STATS) {
    out[k] = otherStat(base[k], ivs[k], evs[k], level, natureMultiplier(nature, k))
  }
  return out
}
