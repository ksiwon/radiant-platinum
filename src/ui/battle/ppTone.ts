// 기술 PP의 글자 단 (SYSTEM §2.2 `ppTone`) — 원작 `GetPPTextColor`의 네 단과 작은 최대치 규칙.
//
// 원작 (`battle_subscreen.c:2890`):
//
//   현재 0                     → 빨강 (7,8)
//   현재 = 최대                → 보통 (1,2)
//   최대 ≤ 2                   → 현재 1이면 쪽빛 (5,6), 아니면 보통
//   최대 3~7                   → 1이면 5,6 · 2면 3,4
//   최대 ≥ 8                   → 현재 ≤ 최대/4(정수 나눗셈)면 5,6 · ≤ 최대/2면 3,4
//   그 밖                      → 보통
//
// 「1이면」이 **최대가 작을 때** 따로 있는 것이 이 규칙의 핵심이다 — 비율로 견주면 PP 5인 기술이 3에서 이미 쪽빛이 된다.
// 배틀 기술 판 · 잊기 판이 쓴다. **요약에는 안 쓴다** (요약은 원작도 이 규칙을 안 쓴다).
import { vars } from '../theme/contract.css'

/** 네 단. `normal` · `half`(원작 3,4) · `quarter`(5,6) · `out`(7,8) */
export type PpTone = 'normal' | 'half' | 'quarter' | 'out'

export function ppTone(now: number, max: number): PpTone {
  if (now <= 0) return 'out'
  if (now === max) return 'normal'
  if (max <= 2) return now === 1 ? 'quarter' : 'normal'
  if (max <= 7) {
    if (now === 1) return 'quarter'
    if (now === 2) return 'half'
    return 'normal'
  }
  if (now <= Math.floor(max / 4)) return 'quarter'
  if (now <= Math.floor(max / 2)) return 'half'
  return 'normal'
}

/**
 * 단 → 글자색. `pl_batt_obj` 72번 팔레트에서 잰 값이다 (§1.2, `vars.pp.*`). 보통 단도 원작 색(`#394239`)이 있다
 */
export const PP_TONE_COLOR: Readonly<Record<PpTone, string>> = {
  normal: vars.pp.normal,
  half: vars.pp.half,
  quarter: vars.pp.quarter,
  out: vars.pp.out,
}
