// HP 막대 한 벌 (SYSTEM §2.2 `HpBar`) — 홈(`BAR_TRACK`) 안의 광택 채움(`BAR_FILL`), 색은 `hpColor()`.
//
// 파티 · 교체 · 요약 · 박스 · 시작 엿보기가 쓴다. 크기 변형으로 5px 미니(박스 파티)를 둔다.
//
// ⚠️ **배틀 HUD의 `barFill`은 이것을 쓰지 않는다.** `hpDrain` 계약이 그 클래스를 직접 읽고
// 폭 · 색 · 숫자를 한 훅(`useDrain`)이 같은 프레임에 민다 — 여기는 값이 서 있는 화면(메뉴)용이다.
import type { CSSProperties } from 'react'
import { hpColor } from '../../engine/battle/healthbar'
import { HP_VARS } from '../theme/window.css'
import * as css from './parts.css'

export function HpBar(
  { hp, max, height = 10, numbers = false }: {
    hp: number
    max: number
    /** 홈 높이(px). 박스 파티의 미니 막대는 5다 */
    height?: number
    /** 오른쪽에 「현재 / 최대」를 붙인다 */
    numbers?: boolean
  },
) {
  const ratio = max > 0 ? Math.max(0, Math.min(hp, max)) / max : 0
  const tone = HP_VARS[hpColor(hp, max)]
  return (
    <span className={css.hpBar} data-hp-bar>
      <span className={css.hpTrack} style={{ height }}>
        <span
          className={css.hpFill}
          style={{ display: 'block', width: `${String(ratio * 100)}%`, ...(tone as CSSProperties) }}
        />
      </span>
      {numbers && <span className={css.hpNumbers}>{Math.max(0, hp)} / {max}</span>}
    </span>
  )
}
