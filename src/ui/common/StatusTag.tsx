// 상태 이상 딱지 한 벌 (SYSTEM §2.2 `StatusTag`).
//
// `STATUS_LABEL`이 세 군데(`PartyScreen` · `PartyCards` · `BattleScreen`)에 따로 있었고, 「두 화면에서
// 같은 상태가 같은 낱말이어야 한다」는 주석이 그 옆에 있었다. 주석은 그것을 지키지 못한다 — 여기
// 하나로 모은다. 색은 `theme/window`의 `STATUS_TAG` · `STATUS_VARS`가 준다.
//
// ⚠️ **포켓러스는 상태가 없을 때만 붙는다.** 원작이 `PokemonSummaryScreen_StatusIconAnimIdx`에서
// 상태 이상을 먼저 고르고, 없을 때만 포켓러스 딱지를 쓴다.
import { STATUS_VARS } from '../theme/window.css'
import * as css from './parts.css'

/**
 * 딱지의 낱말. 이름은 `TEXT_BANK_MENU_ENTRIES` 0~4와 같은 롬 낱말이다 (잠듦 · 독 · 화상 · 얼음 · 마비).
 * `tox`는 원작 딱지에 없어 독과 같은 그림이지만 낱말은 「맹독」이라 우리가 가른다
 */
export const STATUS_LABEL: Readonly<Record<string, string>> = {
  slp: '잠듦', psn: '독', tox: '맹독', brn: '화상', frz: '얼음', par: '마비',
  // 기절 — 원작 요약 화면이 HP 0이면 붙이는 딱지다 (`fnt`). 배틀 뷰는 `ko`로도 부른다
  fnt: '기절', ko: '기절',
  pkrs: '포켓루스',
}

/** 어느 딱지를 그릴까 — 기절 > 상태 이상 > 포켓러스 > 없음 */
export function statusKey(status: string | null | undefined, fainted: boolean, pkrs: boolean): string | null {
  if (fainted) return 'fnt'
  if (status !== null && status !== undefined && status !== 'ok' && status !== '') return status
  return pkrs ? 'pkrs' : null
}

export function StatusTag(
  { status, fainted = false, pkrs = false }: {
    /** 배틀 뷰의 `ok`, 저장 데이터의 상태 이름, 또는 없음 */
    status?: string | null
    fainted?: boolean
    pkrs?: boolean
  },
) {
  const key = statusKey(status, fainted, pkrs)
  if (key === null) return null
  return (
    <span className={css.statusTag} style={STATUS_VARS[key]}>
      {STATUS_LABEL[key] ?? key}
    </span>
  )
}
