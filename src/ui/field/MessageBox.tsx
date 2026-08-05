// 대사창 (DATA.md §2.11) — 원작 배치 그대로 아래쪽 두 줄.
//
// 상태는 전부 엔진(`fieldScripts.world`)에 있다. 여기는 그것을 그리기만 한다.
// zustand를 안 쓰는 이유: 글자가 프레임 단위로 늘어나는데 그걸 스토어에 밀어
// 넣으면 매 프레임 리렌더가 트리 전체로 번진다. 대신 rAF로 들여다보고 **글이
// 실제로 바뀐 프레임에만** setState 한다 — 보통 속도면 초당 12번쯤이다.
import { useEffect, useState } from 'react'
import { fieldScripts } from '../../engine/script/field'
import type { Line } from '../../engine/script/printer'
import type { MenuEntry } from '../../engine/script/world'
import * as css from './messageBox.css'

interface MenuView {
  kind: 'yesno' | 'list'
  entries: readonly MenuEntry[]
  cursor: number
  columns: number
}

interface View {
  /** 대사창이 떠 있을 때만 있다. 목록 메뉴는 창 없이 뜨기도 한다 */
  text: { lines: Line[], waiting: boolean } | null
  menu: MenuView | null
}

/** 지금 화면을 이 문자열로 요약해 바뀐 프레임만 고른다 */
function digest(view: View | null): string {
  if (view === null) return ''
  const lines = view.text?.lines
    .map((l) => `${l.indent}:${l.runs.map((r) => `${r.color}/${r.size}/${r.text}`).join('')}`)
    .join('|') ?? ''
  const menu = view.menu === null
    ? ''
    : `${view.menu.kind}/${String(view.menu.cursor)}/${view.menu.entries.map((e) => e.text).join(',')}`
  return `${lines}#${String(view.text?.waiting)}#${menu}`
}

function snapshot(): View | null {
  const world = fieldScripts.world
  if (!world) return null
  const printing = world.boxOpen && world.printer !== null
  const menu = world.menu
  if (!printing && menu === null) return null
  return {
    text: printing && world.printer
      ? { lines: world.printer.lines, waiting: world.printer.waiting !== null }
      : null,
    menu: menu === null
      ? null
      : { kind: menu.kind, entries: menu.entries, cursor: world.menuCursor, columns: menu.columns },
  }
}

export function MessageBox() {
  const [view, setView] = useState<View | null>(null)

  useEffect(() => {
    let raf = 0
    let last = ''
    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      const next = snapshot()
      const key = digest(next)
      if (key === last) return
      last = key
      // 줄 배열은 인쇄기가 제자리에서 고치는 것이라 그대로 넘기면 React가
      // 같은 참조로 보고 넘어간다. 얕게 복사해서 새 값으로 만든다
      setView(next === null || next.text === null ? next : {
        ...next,
        text: { ...next.text, lines: next.text.lines.map((l) => ({ ...l, runs: [...l.runs] })) },
      })
    }
    raf = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  if (view === null) return null
  const alt = view.menu?.entries[view.menu.cursor]?.alt ?? null
  return (
    <div className={css.frame}>
      {view.text !== null && (
        <div className={css.box}>
          {view.text.lines.map((line, i) => (
            <div key={i} className={css.line} style={{ paddingLeft: line.indent }}>
              {line.runs.map((run, j) => (
                <span
                  key={j}
                  className={css.run}
                  style={{ color: COLORS[run.color] ?? undefined, fontSize: run.size === 100 ? undefined : `${run.size}%` }}
                >
                  {run.text}
                </span>
              ))}
            </div>
          ))}
          {view.text.waiting && <span className={css.arrow} aria-hidden>▼</span>}
        </div>
      )}
      {view.menu !== null && view.menu.entries.length > 0 && (
        <div
          className={view.menu.kind === 'yesno' ? css.menu : css.listMenu}
          role="radiogroup"
          aria-label={view.menu.kind === 'yesno' ? '예 아니오' : '선택'}
          style={view.menu.columns > 1
            ? { gridTemplateColumns: `repeat(${view.menu.columns}, max-content)` }
            : undefined}
        >
          {view.menu.entries.map((entry, i) => (
            <div
              key={`${entry.value}/${i}`}
              role="radio"
              aria-checked={view.menu?.cursor === i}
              className={view.menu?.cursor === i ? css.menuItemOn : css.menuItem}
            >
              {entry.text}
            </div>
          ))}
        </div>
      )}
      {/* 커서를 올린 항목의 설명. 목록 메뉴에만 있고, 없는 항목이 더 많다 */}
      {alt !== null && <div className={css.altText}>{alt}</div>}
    </div>
  )
}

/**
 * `{COLOR n}`의 색.
 *
 * 원작은 글꼴 팔레트 번호라 여기서 그대로 쓸 수 없다. 실제로 쓰이는 것은
 * 1(빨강 계열)과 2(파랑 계열) 둘뿐이고, 도구 이름·사람 이름을 강조할 때 나온다
 */
const COLORS: Record<number, string> = {
  1: '#d94f4f',
  2: '#3f6fd9',
}
