// 필드 대사창과 같은 두 줄 창 (SYSTEM §2.2 `MessageWindow`).
//
// 리포트 · 진화 · 부화 · 교환 · 슬롯 대사 · 이름 짓기 물음이 쓴다 — 3D 무대나 덮개 **위**의 롬 글이다.
// 틀과 글은 필드 대사창과 **같은 처방**(`field/messageBox.css`의 `DIALOG_*`)이고 Galmuri11 19 / 30이다.
// 진화의 `CinematicDialog`가 이 부품으로 합쳐진다.
//
// 위치는 쓰는 쪽이 정한다(`className` · `style`) — 필드처럼 아래 가운데에 `fixed`로 앉히든 화면 안에
// 앉히든 이 부품은 모른다. 글은 한꺼번에 올린다(한 자씩 아님).
import type { CSSProperties, ReactNode } from 'react'
import { WaitDial } from './WaitDial'
import * as css from './parts.css'

export function MessageWindow(
  { lines, dial, yesNo, className, style }: {
    /** 한 줄이 한 줄이다. 두 줄까지 세운다 */
    lines: string | readonly string[]
    /** 오른쪽 아래의 대기 다이얼 — 참이면 돈다, 안 주면 안 그린다 (`running`) */
    dial?: boolean
    /** 창 위에 뜨는 예/아니오 따위. 보통 `YesNo` */
    yesNo?: ReactNode
    className?: string
    style?: CSSProperties
  },
) {
  const rows = typeof lines === 'string' ? lines.split('\n') : lines
  return (
    <div className={className === undefined ? css.windowBox : `${css.windowBox} ${className}`} style={style}>
      {yesNo}
      {rows.map((row, i) => <div key={i} className={css.windowLine}>{row}</div>)}
      {dial !== undefined && (
        <span className={css.windowSide}><WaitDial running={dial} /></span>
      )}
    </div>
  )
}
