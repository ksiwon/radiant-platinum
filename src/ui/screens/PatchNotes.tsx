// 패치노트 — 타이틀 차림표가 여는 창 하나.
//
// ⚠️ **여는 순간 「봤다」고 적는다.** 닫을 때 적으면, 열어 두고 탭을 닫은 사람에게
// 다음에도 점이 그대로 뜬다. 여기서 할 일은 「새것이 있음」을 알리는 것뿐이라
// 눈에 한 번 들어온 것으로 충분하다. 탭의 점은 **열기 전에** 안 본 판이었는지를 본다.
//
// ⚠️ **키로도 닫혀야 한다.** 타이틀 위에 서는 창은 마우스로만 닫히면 안 된다는
// 자리를 「이런 게임은 어떠세요?」에서 이미 한 번 지났다 — X·Esc로 닫는다. Z·Enter도 닫지만(예전 동작)
// 목록이 짧은 판에서 Enter가 갑자기 닫는 것이 놀라우므로 안내에는 안 적는다.
//
// 창: 판마다 탭 하나(`PageTabs`) · 왼쪽 판의 얼굴(이름 · 날짜 · 한 줄 · 갈래별 건수) · 오른쪽 줄 목록.
// ←→가 판을 고르고 ↑↓가 목록을 스크롤한다.
import { Fragment, useEffect, useRef, useState } from 'react'
import { KeyHints } from '../common/KeyHints'
import { PageTabs } from '../common/PageTabs'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import { vars } from '../theme/contract.css'
import { KIND_NAME, NOTES } from './patchLog'
import { markPatchSeen, unreadPatch } from './patchSeen'
import * as win from './appWindow.css'
import * as css from './patchNotes.css'

interface Props { onClose: () => void }

/** 갈래별 건수 — `추가 N · 변경 N · 수정 N`. 0건은 적지 않는다 */
export function kindCounts(items: readonly { kind: keyof typeof KIND_NAME }[]): string {
  return (['add', 'change', 'fix'] as const)
    .map((kind) => ({ kind, n: items.filter((it) => it.kind === kind).length }))
    .filter((c) => c.n > 0)
    .map((c) => `${KIND_NAME[c.kind]} ${String(c.n)}`)
    .join(' · ')
}

/** 한 번에 스크롤하는 줄 수 × 줄 높이 */
const SCROLL_STEP = 56

export function PatchNotes({ onClose }: Props) {
  // 열기 전에 안 본 판이 있었나 — `markPatchSeen`이 곧 지우므로 한 번만 읽는다
  const [fresh] = useState(unreadPatch)
  const [at, setAt] = useState(0)
  const list = useRef<HTMLOListElement>(null)
  useEffect(() => { markPatchSeen() }, [])
  // 판이 바뀌면 목록은 맨 위부터다
  useEffect(() => { list.current?.scrollTo({ top: 0 }) }, [at])

  useMenuKeys({
    cancel: onClose,
    confirm: onClose,
    left: () => { setAt((n) => clampCursor(n, -1, NOTES.length)) },
    right: () => { setAt((n) => clampCursor(n, 1, NOTES.length)) },
    up: () => { list.current?.scrollBy({ top: -SCROLL_STEP }) },
    down: () => { list.current?.scrollBy({ top: SCROLL_STEP }) },
  })

  const note = NOTES[at] ?? NOTES[0]
  if (note === undefined) return null

  return (
    // 창 바깥을 누르면 닫힌다. 창 안에서 시작한 클릭은 여기까지 안 온다
    <div className={win.over} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className={win.window_}
        style={{ ['--w' as string]: `${String(css.WIDTH)}px`, ['--h' as string]: `${String(css.HEIGHT)}px` }}
      >
        <div className={win.head}>
          <h2 className={win.title}>패치노트</h2>
          <span className={win.note}>무엇이 언제 바뀌었는지 적어 둡니다.</span>
        </div>
        <div className={css.tabs}>
          <PageTabs
            label="판"
            pages={NOTES.map((n, i) => ({ key: n.v, label: n.v, ...(i === 0 && fresh ? { mark: vars.pick.edge } : {}) }))}
            at={at}
            onPick={setAt}
          />
        </div>
        <div className={css.split}>
          <div className={css.hero}>
            <h3 className={css.version}>{note.v}</h3>
            <span className={css.date}>{note.date}</span>
            {note.lead !== undefined && <p className={css.lead}>{note.lead}</p>}
            <div className={css.counts}>{kindCounts(note.items)}</div>
          </div>
          <div className={css.listBox}>
            <ol ref={list} className={css.list}>
              {note.items.map((it, i) => (
                <Fragment key={i}>
                  {/* 갈래가 바뀌는 자리에만 머리글이 선다 (`patchLog`의 `group`) */}
                  {it.group !== undefined && it.group !== note.items[i - 1]?.group && (
                    <li className={css.group}>{it.group}</li>
                  )}
                  <li className={css.item}>
                    <span className={css.kind}>{KIND_NAME[it.kind]}</span>
                    <span>{it.text}</span>
                  </li>
                </Fragment>
              ))}
            </ol>
            <span className={css.fadeEnd} aria-hidden />
          </div>
        </div>
        <div className={win.foot}>
          <span className={win.hint}><KeyHints text="←→ 판 고르기 · X · Esc 닫기" /></span>
          <button type="button" className={win.plain} onClick={onClose}>돌아가기</button>
        </div>
      </div>
    </div>
  )
}
