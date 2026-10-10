// 타입 · 분류 그림 (SYSTEM §2.2 `TypeBadge` · `MoveClassBadge`, 4.8).
//
// **롬 한국어 타입 그림** 32×16을 정수 2배로 그린다(결정). 타입 표시가 세 벌(`typeChip`)이던 것을 이것
// 하나로 모은다. 그림은 `aria-hidden`이고 `title`만 달며 **innerText가 0이다** — 하네스가 기술 칸의 첫 줄을
// 이름으로 읽는다.
//
// ⚠️ **그림이 없으면 글자 조각(`--tint`)으로 떨어지고 콘솔에 한 줄 남긴다.** 이 대체 경로가 굽는 쪽 하나를
// 빠뜨린 설치본의 빈자리를 **가리므로**(SYSTEM §6.1 ④) 경고를 남기고 e2e가 그 경고를 0건으로 센다.
import type { CSSProperties } from 'react'
import { loadMoveClass, loadTypeIcons, MOVE_CLASS_CELL } from '../../data/gameData'
import { typeColor } from '../../engine/battle/typeColor'
import { useGameLocale } from '../../state/optionsStore'
import { PARTY, PARTY_BANK } from '../battle/romText'
import { romLine } from '../battle/romLine'
import { useRomLines } from '../battle/useRomLines'
import { PIXEL, type PixelScale } from '../theme/scale'
import { pixelSprite } from './pixelSprite'
import { useSheet } from './useSheet'
import * as css from './parts.css'

const warned = { type: false, class: false }

/** 못 받았다는 경고를 한 번만 낸다 */
function warnOnce(which: 'type' | 'class'): void {
  if (warned[which]) return
  warned[which] = true
  console.warn(which === 'type'
    ? '타입 그림(data/typeIcons.png)을 못 받았다 — 글자 조각으로 대체한다'
    : '분류 그림(data/moveClass.png)을 못 받았다 — 글만 쓴다')
}

export function TypeBadge(
  { type, name, scale = PIXEL.x2 }: {
    /** 엔진 타입 번호. 시트의 칸 차례가 이 번호다 */
    type: number | null
    /** 타입 이름(롬 한국어). `title`과 대체 글자에 쓴다 */
    name?: string
    scale?: PixelScale
  },
) {
  const locale = useGameLocale()
  const sheet = useSheet(() => loadTypeIcons(locale), locale)
  if (type === null) return null
  // 오는 중이거나 그림이 갖춰졌으면 그림 칸이다 — 오는 중에는 상자만 서서 칸이 뛰지 않는다
  if (sheet !== null) {
    const art = sheet === undefined ? { width: 32 * scale, height: 16 * scale } : pixelSprite(sheet, type, scale)
    return <span className={css.typeBadge} aria-hidden title={name} style={art} />
  }
  warnOnce('type')
  return (
    <span
      className={css.typeChip}
      aria-hidden
      title={name}
      style={{ '--tint': typeColor(type) } as CSSProperties}
    >
      {name ?? ''}
    </span>
  )
}

/** 기술 분류 → 롬 글의 줄 (물리 54 · 변화 55 · 특수 56) */
export const CLASS_LINE = {
  physical: PARTY.moveCategoryPhysical,
  status: PARTY.moveCategoryStatus,
  special: PARTY.moveCategorySpecial,
} as const

export type MoveCategory = keyof typeof CLASS_LINE

/** 분류 그림 시트의 칸 번호 (물리 · 특수 · 변화 — `gameData`가 쥔다) */
const CLASS_CELL = MOVE_CLASS_CELL

/** 분류 그림 + 롬 글. 그림이 없으면 글만 쓴다 */
export function MoveClassBadge(
  { category, scale = PIXEL.x2 }: { category: MoveCategory, scale?: PixelScale },
) {
  const sheet = useSheet(loadMoveClass)
  const lines = useRomLines(PARTY_BANK)
  const text = romLine(lines, CLASS_LINE[category]) ?? ''
  if (sheet === null) warnOnce('class')
  return (
    <span className={css.classBadge} data-move-class={category}>
      {sheet !== null && sheet !== undefined && (
        <span className={css.typeBadge} aria-hidden style={pixelSprite(sheet, CLASS_CELL[category], scale)} />
      )}
      {text !== '' && <span className={css.classText}>{text}</span>}
    </span>
  )
}
