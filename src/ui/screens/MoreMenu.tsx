// 「더보기」 — 타이틀 차림표의 마지막 칸이 여는 창.
//
// 왜 한 겹을 더 두는가: 타이틀에 여덟 칸이 서 있었는데, **하러 온 일은 앞의 넷**
// (시작·이어하기·세이브 파일 둘)이고 나머지 넷은 그 자리에 있을 뿐 급한 것이
// 아니다. 여덟을 한 줄로 세우면 「무엇부터 하나」에 화면이 답을 안 해 준다.
//
// ⚠️ **커서가 도는 것과 보이는 것이 같아야 한다.** 이 화면이 이미 한 번 겪은
// 자리다 (`TitleScreen`의 「밖에 세우면 여섯이 보이는데 커서는 다섯만 돈다」).
// 그래서 여기도 ↑↓로 돌고 Z·Enter로 고르고 X·Esc로 닫는다.
//
// ⚠️ **점을 위로 올린다.** 패치노트의 「안 본 판」 점이 이 창 안에만 있으면,
// 창을 열지 않는 사람에게는 새 소식이 영영 안 보인다 — 타이틀의 「더보기」가
// 그 점을 대신 지고 있어야 한다 (`TitleScreen`의 `newPatch`).
import { useRef, useState } from 'react'
import { clampCursor, useMenuKeys } from '../menu/useMenuKeys'
import * as css from './moreMenu.css'

interface Props {
  onOptions: () => void
  onPatchNotes: () => void
  onBugReport: () => void
  onOtherGames: () => void
  /** 안 본 판이 있나 — 「패치노트」 칸에 점을 띄운다 */
  newPatch: boolean
  onClose: () => void
}

export function MoreMenu({
  onOptions, onPatchNotes, onBugReport, onOtherGames, newPatch, onClose,
}: Props) {
  const [cursor, setCursor] = useState(0)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  const entries = [
    { key: 'options', label: '설정', go: onOptions },
    { key: 'patch', label: '패치노트', go: onPatchNotes, dot: newPatch },
    { key: 'bug', label: '버그 제보', go: onBugReport },
    { key: 'more', label: '이런 게임은 어떠세요?', go: onOtherGames },
  ]

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, entries.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, entries.length)) },
    left: () => { setCursor((c) => clampCursor(c, -1, entries.length)) },
    right: () => { setCursor((c) => clampCursor(c, 1, entries.length)) },
    confirm: () => { items.current[cursor]?.click() },
    cancel: onClose,
  })

  return (
    // 창 바깥을 누르면 닫힌다. 창 안에서 시작한 클릭은 여기까지 안 온다
    <div className={css.over} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={css.panel}>
        <h2 className={css.title}>더보기</h2>

        <div className={css.list}>
          {entries.map((entry, i) => (
            <button
              key={entry.key}
              ref={(node) => { items.current[i] = node }}
              className={[css.item, i === cursor ? css.itemOn : ''].filter(Boolean).join(' ')}
              onClick={entry.go}
              onPointerEnter={() => { setCursor(i) }}
            >
              {i === cursor && <span className={css.caret} aria-hidden>▶</span>}
              {entry.label}
              {entry.dot === true && <span className={css.dot} aria-label="새 소식" />}
            </button>
          ))}
        </div>

        <div className={css.foot}>
          <span className={css.hint}>↑↓ 고르기 · Z·Enter 열기 · X 닫기</span>
          <button className={css.close} onClick={onClose}>돌아가기</button>
        </div>
      </div>
    </div>
  )
}
