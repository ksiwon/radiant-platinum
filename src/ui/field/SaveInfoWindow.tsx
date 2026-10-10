// 스크립트가 연 리포트 요약창과 「저장 중」 표시 (PARITY §4.12)
//
// 원작이 `OpenSaveInfo`로 화면 왼쪽 위에 요약창을 띄우고, 그 아래 대사창으로
// "리포트를 작성할까요?"를 묻는다 (`SaveInfoWindow_Draw`). **키를 안 받는다** —
// 묻고 답하는 것은 대사창 쪽이라, 이 창은 보여 주기만 한다.
//
// 요약은 리포트 화면의 장(`SaveInfo`)과 같다. 판 자리는 이 무대(4:3)가 정한다
//
// ⚠️ **메뉴 스택에 안 올린다.** 올리면 필드 입력이 멈추고 대사창의 「예/아니오」가
// 키를 못 받는다
import { useSessionStore } from '../../state/sessionStore'
import { WaitDial } from '../common/WaitDial'
import { SaveInfo } from '../menu/SaveInfo'
import * as css from './saveInfoWindow.css'

export function SaveInfoWindow() {
  const open = useSessionStore((s) => s.saveInfo)
  const icon = useSessionStore((s) => s.savingIcon)
  if (!open && !icon) return null
  return (
    <div className={css.stage}>
      {/* 리포트 화면과 **같은 장**이다 (창은 한 벌). 자리는 장이 쥐고(왼쪽 위), 무대는 4:3 그대로다 */}
      {open && <SaveInfo />}
      {/* 「저장 중」 — 원작은 오른쪽 아래에서 도는 작은 아이콘이다 (`ShowSavingIcon`). 글 대신 대기 다이얼이다 */}
      {icon && <div className={css.icon}><WaitDial running /></div>}
    </div>
  )
}
