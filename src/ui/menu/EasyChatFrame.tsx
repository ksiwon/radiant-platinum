// 낱말 고르기 틀 (text-screens §4.5 · §4.6) — 종이 | 무리 | 낱말. 창 틀(`MenuScreen`)은 쓰는 화면이 두른다. 메일에서 연 낱말 고르기(`EasyChatScreen`)와
// 스크립트가 묻는 낱말(`EasyChatAskScreen`)이 같은 틀을 쓴다. 로직은 각 화면에 있고 여기는 그리기만 한다.
//
// - 종이 칸은 쓰는 쪽이 `sheet`로 넣는다 (메일은 `MailSheet`, 묻기는 작은 종이). 폭은 `sheetWidth`다.
// - 무리 목록은 12줄이라 고정 목록(10줄 이하)이 아니다 — 고른 줄이 즉시 옮겨 간다. **낱말 쪽에 서 있어도** 지금
//   무리는 옅은 띠(`kept`)로 남는다.
// - 낱말 목록은 스크롤 목록이다. 고른 줄은 `scrollIntoView`로 보이게 하고 위치는 `ScrollKnob`과 머리의 「n개 중 m번째」가 보인다.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ScrollKnob } from '../common/ScrollKnob'
import { gameLocale } from '../../state/optionsStore'
import * as css from './easyChatFrame.css'

export interface FrameGroups {
  labels: readonly string[]
  /** 무리마다의 낱말 수. 없으면 안 그린다 */
  counts?: readonly number[]
  at: number
  /** `on`: 포커스가 여기 있다(금 띠). `kept`: 낱말 쪽에 있어 옅은 띠만 남는다. `none`: 띠 없음 */
  focus: 'on' | 'kept' | 'none'
}

export interface FrameWords {
  texts: readonly string[]
  at: number
  /** 포커스가 여기 있다 — 고른 줄에 금 띠 */
  focus: boolean
}

/**
 * 「n개 중 m번째」 — 롬에 없는 말이라 세 언어를 여기서 적는다. 칸 머리의 「무리」 · 「단어」 이름표는 롬에도 없고
 * 뜻이 칸 자체로 읽히므로 두지 않는다
 */
export function positionText(total: number, at: number, locale: string): string {
  const n = String(total)
  const m = String(at)
  return locale === 'en' ? `${m} of ${n}` : locale === 'ja' ? `${n}件中 ${m}番目` : `${n}개 중 ${m}번째`
}

export function EasyChatFrame(
  { sheet, sheetWidth, below, groups, words, dim = false, popover }: {
    sheet: ReactNode
    sheetWidth: number
    /** 종이 아래 (단추 줄) */
    below?: ReactNode
    groups: FrameGroups
    words: FrameWords
    /** 오른쪽 두 열을 흐리게 하고 띠를 걷는다 (낱말을 고르는 중이 아닐 때) */
    dim?: boolean
    /** 뜨는 창 (예/아니오) — 이 틀 안에 앉는다 */
    popover?: ReactNode
  },
) {
  const scroller = useRef<HTMLDivElement>(null)
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const [view, setView] = useState({ top: 0, visible: 0 })

  // 고른 낱말 줄이 보이게 — 목록이 줄마다 즉시 옮겨 가는 스크롤 목록이라 가까운 쪽으로만 민다
  useEffect(() => {
    if (words.focus) rows.current[words.at]?.scrollIntoView({ block: 'nearest' })
  }, [words.focus, words.at])

  const measure = (): void => {
    const el = scroller.current
    if (!el) return
    setView({ top: Math.round(el.scrollTop / css.ROW_H), visible: Math.floor(el.clientHeight / css.ROW_H) })
  }
  useEffect(measure, [words.texts.length, words.at])

  const total = words.texts.length
  return (
    <div className={css.body} style={{ ['--sheet-w' as string]: `${String(sheetWidth)}px` }}>
      <div className={css.sheetCol}>
        {sheet}
        {below}
      </div>

      <div className={css.col}>
        <div className={css.colHead} aria-hidden />
        <ul className={css.list}>
          {groups.labels.map((label, i) => {
            const here = i === groups.at
            const cls = dim ? css.rowOff
              : here && groups.focus === 'on' ? css.rowPicked
                : here && groups.focus === 'kept' ? css.rowKept : css.row
            return (
              <li key={i} className={cls}>
                {here && groups.focus === 'on' && !dim && <span className={css.caret} aria-hidden />}
                <span className={css.label}>{label}</span>
                {groups.counts?.[i] !== undefined && <span className={css.count}>{groups.counts[i]}</span>}
              </li>
            )
          })}
        </ul>
      </div>

      <div className={`${css.col} ${css.wordsCol}`}>
        <div className={css.colHead}>
          <span />
          {total > 0 && words.focus && <span>{positionText(total, words.at + 1, gameLocale())}</span>}
        </div>
        <div className={css.list}>
          <div ref={scroller} className={css.scroller} onScroll={measure}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {words.texts.map((text, i) => (
                <li
                  key={i}
                  ref={(node) => { rows.current[i] = node }}
                  className={dim ? css.rowOff : words.focus && i === words.at ? css.rowPicked : css.row}
                >
                  {words.focus && !dim && i === words.at && <span className={css.caret} aria-hidden />}
                  <span className={css.label}>{text}</span>
                </li>
              ))}
            </ul>
          </div>
          <ScrollKnob at={view.top} visible={view.visible} total={total} />
          {total > view.visible && <span className={css.fadeEnd} aria-hidden />}
        </div>
      </div>
      {popover}
    </div>
  )
}
