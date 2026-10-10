// 배지 줄 (SYSTEM §2.2 `BadgeRail` · DECISIONS 사용자 지적 ①).
//
// 받은 배지와 못 받은 배지가 **같은 정사각 칸 · 같은 기준선**에 선다. 못 받은 칸은 다른 실루엣이 아니라
// **같은 배지 그림**에 `brightness(0)`과 `.14`를 건 것이다 — 칸마다 그림이 다르면 줄 높이가 제각각이 된다
// (타이틀 아랫줄이 그랬다). 칸은 정사각 하나이고 그림은 가운데에 둔다.
//
// 그림은 `data/trainerCase/badges.png`의 **빛나는 줄**(맨 윗줄)이다 — 40×63 칸 여덟. 칸 전체(63)가 아니라
// **도트가 다 드는 40×40 창**(`BADGE_WINDOW_TOP`)을 정사각에 넣는다: 위 줄(0~3)과 아래 줄(4~7)이 같은 기준선에 선다.
// `size`가 40 이상이면 40의 정수배(도트 그대로)이고, 작으면 부드럽게 줄인다.
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

/**
 * 배지 한 칸(40×63) 안에서 도트가 서는 높이 — 정사각 40×40 창의 위 끝.
 *
 * 시트 한 칸은 위 줄 배지(0~3)와 아래 줄 배지(4~7)를 한 상자에 담느라 63이다. 도트는 위 줄이 y 0~39, 아래 줄이 y 25~62에
 * 선다(`badges.png` 알파로 잰 값 — 네 줄 모두 같다). 칸 전체를 그대로 놓으면 아래 줄 배지가 칸 안에서 한 단 낮게 선다 —
 * 창을 이 높이에서 40만큼만 잘라 모든 배지가 **같은 정사각 칸의 같은 기준선**에 서게 한다 (DECISIONS 사용자 지적 ①)
 */
export const BADGE_WINDOW_TOP: readonly number[] = [0, 0, 0, 0, 23, 23, 23, 23]
/** 창의 크기 — 위 · 아래 줄 도트가 다 든다 */
export const BADGE_WINDOW = 40

/**
 * 배지 한 칸을 창(40×40)으로 잘라 `k`배로 그리는 스타일. 카드(`TrainerCard`)와 이 줄이 같이 쓴다.
 * `row`는 시트의 때 줄(0~3)이다
 */
export function badgeArtStyle(url: string | null, bit: number, k: number, row = 0): CSSProperties {
  const { cellW, cellH, cols, rows } = BADGE_ART
  return {
    width: BADGE_WINDOW * k,
    height: BADGE_WINDOW * k,
    ...(url === null ? {} : { backgroundImage: `url(${url})` }),
    backgroundSize: `${String(cols * cellW * k)}px ${String(rows * cellH * k)}px`,
    backgroundPosition: `-${String(bit * cellW * k)}px -${String((row * cellH + (BADGE_WINDOW_TOP[bit] ?? 0)) * k)}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: k >= 1 ? 'pixelated' : 'auto',
  }
}

/** 칸(정사각 `size`) 안에 창(40)을 넣는 배율. 창 이상이면 정수배(도트 그대로), 작으면 부드럽게 줄인다 */
export function badgeScale(size: number): number {
  return size >= BADGE_WINDOW ? Math.floor(size / BADGE_WINDOW) : size / BADGE_WINDOW
}

/** `size`는 칸 한 변(px)이다. 정수배로 쓰려면 40의 배수(타이틀 40, 카드 80)를 준다 */
export function BadgeRail({ badges, size = BADGE_WINDOW }: { badges: BadgeSet, size?: number }) {
  const url = useAssetImage(BADGE_ART.path)
  const k = badgeScale(size)
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
            <span className={got ? undefined : css.badgeOff} style={badgeArtStyle(url, i, k)} />
          </span>
        )
      })}
    </span>
  )
}
