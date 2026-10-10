// 포켓몬 이름줄 부품 셋 — 성별 기호 · 이름줄 · 어두운 판 위 이름표 (SYSTEM §2.2).
//
// 볼 · 이름 · 성별 · 별 · Lv의 순서가 화면마다 조금씩 달랐다. 한 곳으로 모은다.
// 성별 기호는 **Galmuri11로** 찍는다 — Pretendard 서브셋에 ♂♀가 없어서 시스템 글꼴로 떨어지면 줄 높이가
// 흔들린다 (SYSTEM §6.1 ⑩). 어두운 판 위에서는 성별 색 없이 `ink.onDark`다 (`state.male`의 대비가 3.87:1).
import type { ReactNode } from 'react'
import * as css from './parts.css'

export type Gender = 'male' | 'female' | 'none' | 'genderless'

const MARK: Partial<Record<string, string>> = { male: '♂', female: '♀' }

/** 성별 기호. 무성이면 아무것도 안 그린다 */
export function GenderMark({ gender, onDark = false }: { gender: string | null | undefined, onDark?: boolean }) {
  const mark = gender === null || gender === undefined ? undefined : MARK[gender]
  if (mark === undefined) return null
  const tone = onDark ? css.genderOnDark : gender === 'male' ? css.genderMale : css.genderFemale
  return <span className={`${css.genderMark} ${tone}`} aria-label={gender === 'male' ? '수컷' : '암컷'}>{mark}</span>
}

/** 볼 · 이름 · 성별 · 별 · Lv. `ball`은 볼 아이콘(`ReactNode`)이고 없으면 자리를 안 잡는다 */
export function MonIdentity(
  { ball, name, gender, shiny = false, level, onDark = false }: {
    ball?: ReactNode
    name: string
    gender?: string | null
    shiny?: boolean
    level?: number | null
    onDark?: boolean
  },
) {
  return (
    <span className={onDark ? `${css.identity} ${css.identityDark}` : css.identity}>
      {ball !== undefined && <span className={css.identityBall}>{ball}</span>}
      <span className={css.identityName}>{name}</span>
      <GenderMark gender={gender} onDark={onDark} />
      {shiny && <span className={css.shinyStar} aria-label="이로치">★</span>}
      {level !== undefined && level !== null && (
        <span className={onDark ? `${css.identityLevel} ${css.identityLevelDark}` : css.identityLevel}>Lv{level}</span>
      )}
    </span>
  )
}

/**
 * 어두운 판 위의 이름표 — 진화 · 부화 · 교환(받는 마리). 옛 이름 → 새 이름 한 줄과 아래 `extra`(껍질몬 줄 등).
 * 나타날 때 `TIME.page` 동안 6px 올라오며 페이드한다
 */
export function NamePlate(
  { from, to, gender, level, extra }: {
    from?: string
    to: string
    gender?: string | null
    level?: number | null
    extra?: ReactNode
  },
) {
  return (
    <span className={css.namePlate}>
      <span className={css.namePlateLine}>
        {from !== undefined && (
          <>
            <span className={css.namePlateFrom}>{from}</span>
            <span className={css.namePlateArrow} aria-hidden>→</span>
          </>
        )}
        <span>{to}</span>
        <GenderMark gender={gender} onDark />
        {level !== undefined && level !== null && <span className={css.namePlateFrom}>Lv{level}</span>}
      </span>
      {extra !== undefined && <span className={css.namePlateExtra}>{extra}</span>}
    </span>
  )
}
