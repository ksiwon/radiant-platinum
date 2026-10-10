// 메뉴 창 **안** 아래의 롬 글 띠 (SYSTEM §2.2 `MessageDock`).
//
// 파티 · 가방(설명 띠의 대사 줄) · 설정 · 되살리기 · 박스 · 상점(점원의 말) · 메일박스가 같은 띠를 쓴다.
// 롬 대사는 **한꺼번에** 올린다 — 한 자씩 찍지 않는다(원작에 있어도 다시 꺼내지 않는다, 결정).
//
// ⚠️ **DOM에서 맨 끝에 둔다.** `MenuScreen`의 `message` 속성이 이 띠를 foot **뒤에** 그리고 보이는 자리는
// CSS `order`로 정한다 — 파티 하네스(`drive.mjs:3559`)가 그 순서를 읽는다. 여기서는 띠 자체만 그린다.
import type { ReactNode } from 'react'
import * as css from './parts.css'

export function MessageDock(
  { lines, icon, trailing, when = true }: {
    /** 롬 줄. 문자열 하나거나 여러 줄이고, 여러 줄이면 줄바꿈으로 잇는다 */
    lines: string | readonly string[]
    icon?: ReactNode
    /** 오른쪽 끝에 붙는 것 — 대기 다이얼 따위 */
    trailing?: ReactNode
    /** 거짓이면 자리를 안 잡는다 (박스처럼 말이 없을 때 줄을 비워 두지 않는 화면) */
    when?: boolean
  },
) {
  if (!when) return null
  const text = typeof lines === 'string' ? lines : lines.join('\n')
  return (
    <div className={css.dock} data-message-dock>
      {icon !== undefined && <span className={css.dockIcon}>{icon}</span>}
      <span className={css.dockText}>{text}</span>
      {trailing !== undefined && <span className={css.dockTrailing}>{trailing}</span>}
    </div>
  )
}
