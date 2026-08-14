// 스크립트가 연 리포트 요약창과 「저장 중」 표시 (PARITY §4.12)
//
// 원작이 `OpenSaveInfo`로 화면 왼쪽 위에 요약창을 띄우고, 그 아래 대사창으로
// "리포트를 작성할까요?"를 묻는다 (`SaveInfoWindow_Draw`). **키를 안 받는다** —
// 묻고 답하는 것은 대사창 쪽이라, 이 창은 보여 주기만 한다.
//
// ⚠️ **메뉴 스택에 안 올린다.** 올리면 필드 입력이 멈추고 대사창의 「예/아니오」가
// 키를 못 받는다
import { useSessionStore } from '../../state/sessionStore'
import { SaveInfo } from '../menu/SaveInfo'
import * as css from './saveInfoWindow.css'

export function SaveInfoWindow() {
  const open = useSessionStore((s) => s.saveInfo)
  const icon = useSessionStore((s) => s.savingIcon)
  if (!open && !icon) return null
  return (
    <div className={css.stage}>
      {open && <div className={css.panel}><SaveInfo /></div>}
      {icon && <div className={css.icon}>저장 중…</div>}
    </div>
  )
}
