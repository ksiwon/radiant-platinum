// 배지 줄 (SYSTEM §2.2 `BadgeRail` · DECISIONS 사용자 지적 ①).
//
// 받은 배지와 못 받은 배지가 **같은 정사각 칸 · 같은 기준선**에 선다. 못 받은 칸은 다른 실루엣이 아니라
// **같은 배지 그림**에 `brightness(0)`과 `.14`를 건 것이다 — 칸마다 그림이 다르면 줄 높이가 제각각이 된다
// (타이틀 아랫줄이 그랬다). 칸은 정사각 하나이고 그림은 가운데에 둔다.
//
// 그림은 `data/trainerCase/badges.png`의 **빛나는 줄**(맨 윗줄)이다 — 40×63 칸 여덟. 칸 전체(높이 63)를
// 정사각 안에 넣는다: `size`가 63 이상이면 정수배(도트 그대로)이고, 작으면 부드럽게 줄인다. 줄이는 것은
// 이 줄과 박스 필름 썸네일(`wallThumb`)뿐이다 — 배지 그림이 작은 칸보다 큰 원본이라서 어쩔 수 없다.
//
// ⚠️ **그림이 안 왔으면 칸만 선다**(지어낸 그림 없음). 받은 칸과 못 받은 칸이 똑같이 비어 보일 뿐 줄 높이는 같다.
import type { CSSProperties } from 'react'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import * as css from './parts.css'

/** `badges.png` — 배지 여덟 칸 × 때 네 줄. 칸 하나가 40×63이다 (`trainerCase/index.json`의 `badge`) */
export const BADGE_ART = { path: 'data/trainerCase/badges.png', cellW: 40, cellH: 63, cols: 8, rows: 4 } as const

/** 배지 여덟 칸 중 받은 것을 가리키는 값 — 비트마스크(`1 << i`)나 불리언 배열 */
export type BadgeSet = number | readonly boolean[]

export function hasBadge(badges: BadgeSet, i: number): boolean {
  return typeof badges === 'number' ? (badges & (1 << i)) !== 0 : badges[i] === true
}

/** 칸(정사각 `size`) 안에 배지 한 칸(높이 63)을 넣는 배율 */
export function badgeScale(size: number): number {
  return size >= BADGE_ART.cellH ? Math.floor(size / BADGE_ART.cellH) : size / BADGE_ART.cellH
}

export function BadgeRail({ badges, size = 28 }: { badges: BadgeSet, size?: number }) {
  const url = useAssetImage(BADGE_ART.path)
  const k = badgeScale(size)
  const art = (i: number): CSSProperties => ({
    width: BADGE_ART.cellW * k,
    height: BADGE_ART.cellH * k,
    ...(url === null ? {} : { backgroundImage: `url(${url})` }),
    backgroundSize: `${String(BADGE_ART.cols * BADGE_ART.cellW * k)}px ${String(BADGE_ART.rows * BADGE_ART.cellH * k)}px`,
    // 맨 윗줄(빛나는 줄)이라 y는 0이다
    backgroundPosition: `-${String(i * BADGE_ART.cellW * k)}px 0`,
    backgroundRepeat: 'no-repeat',
    imageRendering: k >= 1 ? 'pixelated' : 'auto',
  })
  return (
    <span className={css.badgeRail} role="list" aria-label="배지">
      {Array.from({ length: BADGE_ART.cols }, (_, i) => {
        const got = hasBadge(badges, i)
        return (
          <span
            key={i}
            role="listitem"
            className={css.badgeCell}
            style={{ width: size, height: size }}
            data-badge={got ? 'on' : 'off'}
          >
            <span className={got ? undefined : css.badgeOff} style={art(i)} />
          </span>
        )
      })}
    </span>
  )
}
