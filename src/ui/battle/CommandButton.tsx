// 배틀 화면의 명령 한 칸 — **여덟 자리가 같은 것을 그린다** (REPAIR §9)
//
// 싸운다/가방/포켓몬/도망 · 사파리 넷 · 시합규칙 「교체」의 예·아니오 · 「누구에게?」 · 기술 넷 · 기술을
// 배우는 화면의 칸들. 판은 한 벌이고 얼굴이 둘이다 (moves §4.0):
//
//   명령 판(`cmd`)   왼쪽에 칸 색 쐐기. 싸운다 · 가방 · 포켓몬 · 도망간다 · 예/아니오 · 대상
//   타입 판(`type`)  타입 색 원판(타입 그림) · 타입색 몸통 · 흰 꼬리(PP). 기술 · 잊을 기술
//
// ⚠️ **모양이 갈리면 눈으로만 잡힌다.** 재질 두 벌이 로토무 방 벽을 흰색으로 세웠던 것과 같은 갈래다 — 칸 하나에
// 장식을 하나 더 달면 나머지 일곱은 안 따라온다.
//
// ⚠️ **하네스 계약 — `<button>`의 innerText는 이름으로 시작한다.** 그림 칸(타입 그림 · 포켓몬 아이콘)은 글자가 0이어야
// 하고, 글이 나오는 대체 경로(`TypeBadge`의 글자 조각)가 있어도 **DOM에서 이름 뒤에** 둔다 — 화면에서는 CSS `order`로
// 앞에 선다. PP 꼴(`n/n`)은 기술 칸만 갖는다.
import type { CSSProperties, ReactNode } from 'react'
import * as css from './command.css'

export type PlateSize = 'hero' | 'row' | 'list' | 'slim'

export function CommandButton({
  on, label, sub, tail, lead, tone = 'cmd', size = 'list', tint, disabled, pilot, moveId, onClick,
}: {
  /** 커서가 이 칸에 있는가. 테두리와 쐐기 밖 삼각이 여기서 갈린다 */
  on: boolean
  label: ReactNode
  /**
   * 이름 아래 작은 줄. **글이면 여기서 감싼다.** 타입·상성처럼 여러 조각이 한 줄에 서는 자리는 만들어서 넘긴다
   */
  sub?: ReactNode
  /** 오른쪽 꼬리. 타입 판의 PP · 「그만둔다」가 여기다 */
  tail?: ReactNode
  /** 그림 칸 — 명령 판은 포켓몬 아이콘, 타입 판은 타입 그림. 글자가 0이어야 한다 (`aria-hidden`) */
  lead?: ReactNode
  tone?: 'cmd' | 'type'
  size?: PlateSize
  /** 칸 색 (`--tint`, 명령 판) 또는 타입 색 (`--type`, 타입 판). 안 주면 css의 기본값이다 */
  tint?: string
  disabled?: boolean
  /** 잡는 법 강습의 손이 찾는 이름 (`data-pilot`) */
  pilot?: string
  /** 기술 칸이면 그 기술 번호 (`data-move-id`). 하네스가 이름 글자 대신 이것을 읽는다 */
  moveId?: number
  onClick: () => void
}) {
  const type = tone === 'type'
  const color = tint === undefined ? undefined : ({ [type ? '--type' : '--tint']: tint } as CSSProperties)
  const plate = [
    type ? css.buttonType : css.buttonCmd,
    css.hover,
    on ? css.buttonOn : '',
    disabled ? css.buttonOff : '',
  ].filter(Boolean).join(' ')
  const smallRow = size === 'row'
  return (
    <div className={`${css.slot} ${css.plateSize[size]}`}>
      {on && <span className={css.caret} aria-hidden />}
      <button
        className={plate}
        style={color}
        onClick={onClick}
        disabled={disabled}
        data-pilot={pilot}
        data-move-id={moveId}
      >
        <span className={type ? `${css.wedge} ${css.wedgeDisc}` : css.wedge} aria-hidden />
        {type && <span className={css.tailBg} aria-hidden />}
        <span className={[css.face, type ? css.faceType : '', size === 'hero' ? css.faceHero : ''].filter(Boolean).join(' ')}>
          <span className={css.labelCol}>
            <span className={[css.label, size === 'hero' ? css.labelHero : '', smallRow ? css.labelRow : ''].filter(Boolean).join(' ')}>
              {label}
            </span>
            {typeof sub === 'string' ? <span className={css.subLine}>{sub}</span> : sub}
          </span>
          {lead !== undefined && <span className={type ? css.lead : css.leadIcon} aria-hidden>{lead}</span>}
          {tail}
        </span>
      </button>
    </div>
  )
}

/**
 * 빈 기술 칸 — 자리를 지켜 칸 수가 바뀌어도 판이 오르내리지 않게 한다 (원작의 빈 칸 그림).
 * **`div`다** — PP 꼴이 없어서 하네스가 기술 칸으로 안 센다
 */
export function EmptyPlate({ size = 'list' }: { size?: PlateSize }) {
  return (
    <div className={`${css.slot} ${css.plateSize[size]}`} aria-hidden>
      <div className={css.plateEmpty} />
    </div>
  )
}
