// 패치노트 — 타이틀 차림표가 여는 창 하나.
//
// ⚠️ **여는 순간 「봤다」고 적는다.** 닫을 때 적으면, 열어 두고 탭을 닫은 사람에게
// 다음에도 점이 그대로 뜬다. 여기서 할 일은 「새것이 있음」을 알리는 것뿐이라
// 눈에 한 번 들어온 것으로 충분하다.
//
// ⚠️ **키로도 닫혀야 한다.** 타이틀 위에 서는 창은 마우스로만 닫히면 안 된다는
// 자리를 「이런 게임은 어떠세요?」에서 이미 한 번 지났다 — X·Esc로 닫는다.
import { useEffect } from 'react'
import { useMenuKeys } from '../menu/useMenuKeys'
import { KIND_NAME, NOTES, markPatchSeen } from './patchLog'
import * as css from './patchNotes.css'

interface Props { onClose: () => void }

export function PatchNotes({ onClose }: Props) {
  useEffect(() => { markPatchSeen() }, [])

  useMenuKeys({ cancel: onClose, confirm: onClose })

  return (
    // 창 바깥을 누르면 닫힌다. 창 안에서 시작한 클릭은 여기까지 안 온다
    <div className={css.over} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className={css.panel}>
        <h2 className={css.title}>패치노트</h2>
        <p className={css.intro}>무엇이 언제 바뀌었는지 적어 둡니다.</p>

        <ol className={css.list}>
          {NOTES.map((note) => (
            <li key={note.v}>
              <div className={css.head}>
                <span className={css.version}>{note.v}</span>
                <span className={css.date}>{note.date}</span>
              </div>
              {note.lead !== undefined && <p className={css.lead}>{note.lead}</p>}
              <ul className={css.items}>
                {note.items.map((it, i) => (
                  <li key={i} className={css.item}>
                    <span className={css.tag}>{KIND_NAME[it.kind]}</span>
                    <span>{it.text}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <div className={css.foot}>
          <span className={css.hint}>X·Esc 닫기</span>
          <button className={css.close} onClick={onClose}>돌아가기</button>
        </div>
      </div>
    </div>
  )
}
