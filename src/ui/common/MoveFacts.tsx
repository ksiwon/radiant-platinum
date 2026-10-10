// 기술 정보 — 분류 · 위력 · 명중 · PP · 설명 (SYSTEM §2.2 `MoveFacts`).
//
// 배틀 잊기 · 되살리기 · 요약 · 교체 Q/E · 가방 · 상점 · 진화 · 팩토리가 같은 부품을 쓴다. 이름표는 **롬 글**이다
// (뱅크 3의 43 · 48 · 51 · 53) — 한 글자도 안 짓는다.
//
// ⚠️ **위력 ≤ 1이면 「---」, 명중 0이면 「---」다** (롬 3:50 · 요약 455:154). 원작 위력 조건이 `<= 1`이다
// (`PrintBattleMoveAttributes`) — 한동안 우리가 `> 0`으로 쓰고 「???」를 찍었다. 「필중」 같은 지은 말은
// 쓰지 않는다 (진화 설계의 「필중」은 기각). 설명의 `\n`은 공백으로 잇는다.
import { loadUiText } from '../../data/uiText'
import type { Move } from '../../data/schema'
import { PARTY, PARTY_BANK } from '../battle/romText'
import { romLine } from '../battle/romLine'
import { useRomLines } from '../battle/useRomLines'
import { useGameLocale } from '../../state/optionsStore'
import { Fragment, useEffect, useState } from 'react'
import { MoveClassBadge } from './TypeBadge'
import * as css from './parts.css'

/** 위력 글. 없으면 null(롬의 「---」를 찍는다) */
export function powerText(power: number): string | null {
  return power <= 1 ? null : String(power)
}

/** 명중 글. 0이면 null — 명중 판정을 안 하는 기술이다 */
export function accuracyText(accuracy: number): string | null {
  return accuracy <= 0 ? null : String(accuracy)
}

/** 설명의 줄바꿈을 공백으로 잇는다 — 창 폭이 줄을 정한다 */
export function describeMove(raw: string): string {
  return raw.replace(/[\r\f]/g, '\n').replace(/\s*\n\s*/g, ' ').trim()
}

/** 기술 설명 뱅크(646). 기술 번호가 곧 줄 번호다. 오기 전에는 빈 배열이다 */
function useMoveDescriptions(enabled: boolean): readonly string[] {
  const locale = useGameLocale()
  const [lines, setLines] = useState<readonly string[]>([])
  useEffect(() => {
    if (!enabled) return
    let alive = true
    void loadUiText('moveDescriptions', locale)
      .then((got) => { if (alive) setLines(got) })
      .catch(() => { /* 설명 없이 선다 — 이름표와 숫자는 그대로 나온다 */ })
    return () => { alive = false }
  }, [locale, enabled])
  return lines
}

export function MoveFacts(
  { move, layout, description = true }: {
    move: Pick<Move, 'id' | 'category' | 'power' | 'accuracy' | 'pp'>
    /** `row`: 한 줄에 이어 쓴다. `column`: 이름표 열과 값 열 */
    layout: 'row' | 'column'
    /** 설명을 붙일까. 기본은 붙인다 */
    description?: boolean
  },
) {
  const lines = useRomLines(PARTY_BANK)
  const descriptions = useMoveDescriptions(description)
  const none = romLine(lines, PARTY.moveStatNoValue) ?? '---'
  const label = (at: number): string => romLine(lines, at) ?? ''
  const power = powerText(move.power) ?? none
  const accuracy = accuracyText(move.accuracy) ?? none
  const text = description ? describeMove(descriptions[move.id] ?? '') : ''
  const pairs: [string, string][] = [
    [label(PARTY.movePowerLabel), power],
    [label(PARTY.moveAccuracyLabel), accuracy],
    [label(PARTY.movePPLabel), String(move.pp)],
  ]
  return (
    <div className={css.facts} data-move-facts>
      {layout === 'row'
        ? (
          <div className={css.factsRow}>
            <MoveClassBadge category={move.category} />
            {pairs.map(([name, value], i) => (
              <span key={i} className={css.factPair}>
                <span className={css.factLabel}>{name}</span>
                <span className={css.factValue}>{value}</span>
              </span>
            ))}
          </div>
        )
        : (
          <>
            <MoveClassBadge category={move.category} />
            <div className={css.factsColumn}>
              {pairs.map(([name, value], i) => (
                <Fragment key={i}>
                  <span className={css.factLabel}>{name}</span>
                  <span className={css.factValue}>{value}</span>
                </Fragment>
              ))}
            </div>
          </>
        )}
      {text !== '' && <div className={css.factText}>{text}</div>}
    </div>
  )
}
